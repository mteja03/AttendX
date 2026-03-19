import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { toDisplayDate } from '../utils';

const DEFAULT_ASSET_TYPES = [
  { name: 'Laptop', mode: 'trackable' },
  { name: 'Desktop', mode: 'trackable' },
  { name: 'Mobile Phone', mode: 'trackable' },
  { name: 'SIM Card', mode: 'consumable' },
  { name: 'Tablet', mode: 'trackable' },
  { name: 'ID Card', mode: 'consumable' },
  { name: 'Access Card', mode: 'consumable' },
  { name: 'Uniform', mode: 'consumable' },
  { name: 'Headset', mode: 'consumable' },
  { name: 'Charger', mode: 'consumable' },
  { name: 'Vehicle', mode: 'trackable' },
  { name: 'Tools', mode: 'trackable' },
  { name: 'Furniture', mode: 'trackable' },
  { name: 'Other', mode: 'trackable' },
];

const STATUS_OPTIONS = ['All', 'Available', 'Assigned', 'Damaged', 'Lost', 'In Repair', 'Retired'];

const CONDITION_OPTIONS = ['New', 'Good', 'Fair', 'Poor', 'Damaged'];

const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'Available':
      return 'bg-blue-100 text-blue-700';
    case 'Assigned':
      return 'bg-green-100 text-green-700';
    case 'Damaged':
      return 'bg-red-100 text-red-700';
    case 'Lost':
      return 'bg-red-200 text-red-800';
    case 'In Repair':
      return 'bg-amber-100 text-amber-800';
    case 'Retired':
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

const getAssetIcon = (type) => {
  const icons = {
    Laptop: '💻',
    'Mobile Phone': '📱',
    'SIM Card': '📶',
    Tablet: '📟',
    'ID Card': '🪪',
    'Access Card': '🪪',
    Uniform: '👔',
    Headset: '🎧',
    Charger: '🔌',
    Vehicle: '🚗',
    Tools: '🛠️',
    Furniture: '🪑',
  };
  return icons[type] || '📦';
};

const buildAssetIdPrefix = (type) => {
  if (!type) return 'AST';
  const map = {
    Laptop: 'LAP',
    Desktop: 'DES',
    'Mobile Phone': 'MOB',
    'SIM Card': 'SIM',
    Tablet: 'TAB',
    'ID Card': 'IDC',
    'Access Card': 'ACC',
    Uniform: 'UNI',
    Headset: 'HED',
    Charger: 'CHR',
    Vehicle: 'VEH',
    Tools: 'TLS',
    Furniture: 'FUR',
  };
  return map[type] || 'AST';
};

export default function Assets() {
  const { companyId } = useParams();
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [company, setCompany] = useState(null);
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All Types');
  const [filterStatus, setFilterStatus] = useState('All');
  const [assetView, setAssetView] = useState('all'); // all | trackable | consumable
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showViewIssuedModal, setShowViewIssuedModal] = useState(false);
  const [showReturnConsumableModal, setShowReturnConsumableModal] = useState(false);
  const [showEditStockModal, setShowEditStockModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [issueAsset, setIssueAsset] = useState(null);
  const [issuedAsset, setIssuedAsset] = useState(null);
  const [returnConsumableAsset, setReturnConsumableAsset] = useState(null);
  const [returnConsumableAssignment, setReturnConsumableAssignment] = useState(null);
  const [editStockAsset, setEditStockAsset] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    assetId: '',
    name: '',
    type: 'Laptop',
    brand: '',
    model: '',
    serialNumber: '',
    purchaseDate: '',
    purchasePrice: '',
    warrantyExpiry: '',
    condition: 'New',
    totalStock: '',
    unit: 'pieces',
    isReturnable: true,
    notes: '',
  });
  const [assignForm, setAssignForm] = useState({
    assetId: '',
    employeeId: '',
    issueDate: '',
    condition: 'Good',
    notes: '',
  });
  const [returnForm, setReturnForm] = useState({
    date: '',
    condition: 'Good',
    notes: '',
  });
  const [issueForm, setIssueForm] = useState({
    employeeId: '',
    quantity: 1,
    issueDate: '',
    condition: 'Good',
    notes: '',
  });
  const [returnConsumableForm, setReturnConsumableForm] = useState({
    quantity: 1,
    date: '',
    condition: 'Good',
    notes: '',
  });
  const [editStockForm, setEditStockForm] = useState({
    adjustmentType: 'Add stock',
    quantity: '',
    reason: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [companySnap, assetSnap, empSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId)),
          getDocs(query(collection(db, 'companies', companyId, 'assets'), orderBy('createdAt', 'desc'))).catch(() =>
            getDocs(collection(db, 'companies', companyId, 'assets')),
          ),
          getDocs(collection(db, 'companies', companyId, 'employees')),
        ]);
        if (companySnap.exists()) setCompany({ id: companySnap.id, ...companySnap.data() });
        setAssets(
          assetSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            mode: d.data().mode || 'trackable',
          })),
        );
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to load assets', err);
        showError('Failed to load assets');
      }
      setLoading(false);
    };
    load();
  }, [companyId, showError]);

  const assetTypes = useMemo(() => {
    const raw = company?.assetTypes;
    if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_ASSET_TYPES;
    if (typeof raw[0] === 'string') {
      return raw.map((name) => ({
        name,
        mode: DEFAULT_ASSET_TYPES.find((t) => t.name === name)?.mode || 'trackable',
      }));
    }
    return raw
      .map((t) => ({
        name: t?.name,
        mode: t?.mode || 'trackable',
      }))
      .filter((t) => t.name);
  }, [company]);

  const selectedAddAssetMode = assetTypes.find((t) => t.name === form.type)?.mode || 'trackable';

  const stats = useMemo(() => {
    const total = assets.length;
    const trackable = assets.filter((a) => (a.mode || 'trackable') === 'trackable').length;
    const consumable = assets.filter((a) => (a.mode || 'trackable') === 'consumable').length;
    const assignedTrackable = assets.filter((a) => (a.mode || 'trackable') === 'trackable' && a.status === 'Assigned').length;
    const issuedConsumable = assets
      .filter((a) => (a.mode || 'trackable') === 'consumable')
      .reduce((sum, a) => sum + (Number(a.issuedCount) || 0), 0);
    return { total, trackable, consumable, assignedIssued: assignedTrackable + issuedConsumable };
  }, [assets]);

  const filtered = useMemo(() => {
    let list = assets;
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter((a) => {
        const mode = a.mode || 'trackable';
        const assignedName = mode === 'trackable' ? (a.assignedToName || '') : '';
        const assignmentNames =
          mode === 'consumable'
            ? (a.assignments || []).filter((as) => !as.returned).map((as) => as.employeeName || '').join(' ')
            : '';
        return (
          (a.assetId || '').toLowerCase().includes(term) ||
          (a.name || '').toLowerCase().includes(term) ||
          (a.serialNumber || '').toLowerCase().includes(term) ||
          assignedName.toLowerCase().includes(term) ||
          assignmentNames.toLowerCase().includes(term)
        );
      });
    }
    if (filterType !== 'All Types') {
      list = list.filter((a) => (a.type || '') === filterType);
    }
    if (filterStatus !== 'All') {
      list = list.filter((a) => {
        const mode = a.mode || 'trackable';
        if (mode === 'consumable') return false;
        return (a.status || 'Available') === filterStatus;
      });
    }
    return list;
  }, [assets, search, filterType, filterStatus]);

  const trackableAssets = useMemo(
    () => filtered.filter((a) => (a.mode || 'trackable') === 'trackable'),
    [filtered],
  );
  const consumableAssets = useMemo(
    () => filtered.filter((a) => (a.mode || 'trackable') === 'consumable'),
    [filtered],
  );

  const resetAddForm = () => {
    setForm({
      assetId: '',
      name: '',
      type: 'Laptop',
      brand: '',
      model: '',
      serialNumber: '',
      purchaseDate: '',
      purchasePrice: '',
      warrantyExpiry: '',
      condition: 'New',
      totalStock: '',
      unit: 'pieces',
      isReturnable: true,
      notes: '',
    });
    setFormErrors({});
  };

  const handleOpenAdd = () => {
    resetAddForm();
    setShowAddModal(true);
  };

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    const v = type === 'checkbox' ? checked : value;
    setForm((prev) => ({
      ...prev,
      [name]: v,
      ...(name === 'type'
        ? {
            ...(assetTypes.find((t) => t.name === value)?.mode === 'trackable'
              ? { assetId: prev.assetId || `${buildAssetIdPrefix(value)}001` }
              : { assetId: prev.assetId || '' }),
            name: prev.name || value,
          }
        : null),
    }));
    if (formErrors[name]) setFormErrors((p) => ({ ...p, [name]: null }));
  };

  const handleValidateAdd = () => {
    const err = {};
    const mode = assetTypes.find((t) => t.name === form.type)?.mode || 'trackable';
    if (mode === 'trackable') {
      if (!form.assetId?.trim()) err.assetId = 'Asset ID is required';
      if (!form.name?.trim()) err.name = 'Asset name is required';
    } else {
      const qty = Number(form.totalStock);
      if (!qty || qty <= 0) err.totalStock = 'Total quantity is required';
      // Name can be derived from type; no hard requirement.
    }
    setFormErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSaveAsset = async (e) => {
    e.preventDefault();
    if (!handleValidateAdd()) return;
    if (!companyId || !currentUser) return;
    setSaving(true);
    try {
      const selectedTypeMode = assetTypes.find((t) => t.name === form.type)?.mode || 'trackable';
      const assetIdGenerated =
        selectedTypeMode === 'trackable'
          ? form.assetId.trim()
          : buildAssetIdPrefix(form.type).toUpperCase();

      // Check uniqueness of assetId (trackable uses user-entered id, consumable uses generated)
      const q = query(
        collection(db, 'companies', companyId, 'assets'),
        where('assetId', '==', assetIdGenerated),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setFormErrors((prev) => ({
          ...prev,
          assetId: `Asset ID ${assetIdGenerated} already exists.`,
        }));
        setSaving(false);
        return;
      }

      const now = Timestamp.now();

      let payload;
      if (selectedTypeMode === 'trackable') {
        payload = {
          mode: 'trackable',
          assetId: assetIdGenerated,
          name: form.name.trim(),
          type: form.type || 'Laptop',
          brand: form.brand?.trim() || '',
          model: form.model?.trim() || '',
          serialNumber: form.serialNumber?.trim() || '',
          status: 'Available',
          assignedToId: null,
          assignedToName: null,
          assignedToEmpId: null,
          issueDate: null,
          returnDate: null,
          condition: form.condition || 'New',
          purchaseDate: form.purchaseDate ? Timestamp.fromDate(new Date(form.purchaseDate)) : null,
          purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
          warrantyExpiry: form.warrantyExpiry ? Timestamp.fromDate(new Date(form.warrantyExpiry)) : null,
          notes: form.notes?.trim() || '',
          isReturnable: !!form.isReturnable,
          history: [
            {
              action: 'created',
              employeeId: null,
              employeeName: null,
              date: now,
              condition: form.condition || 'New',
              notes: 'Asset added to inventory',
              performedBy: currentUser.email || '',
            },
          ],
          createdAt: serverTimestamp(),
          createdBy: currentUser.email || '',
        };
      } else {
        const totalStock = Number(form.totalStock);
        payload = {
          mode: 'consumable',
          assetId: assetIdGenerated,
          name: (form.name?.trim() || form.type || '').trim(),
          type: form.type || 'Uniform',
          totalStock,
          availableStock: totalStock,
          issuedCount: 0,
          unit: form.unit || 'pieces',
          // store purchasePrice as "per unit" for consumables
          purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
          notes: form.notes?.trim() || '',
          isReturnable: !!form.isReturnable,
          assignments: [],
          history: [],
          createdAt: serverTimestamp(),
          createdBy: currentUser.email || '',
        };
      }

      const ref = await addDoc(collection(db, 'companies', companyId, 'assets'), payload);
      setAssets((prev) => [{ id: ref.id, ...payload }, ...prev]);
      setShowAddModal(false);
      success('Asset added');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to add asset', err);
      showError('Failed to add asset');
    }
    setSaving(false);
  };

  const openAssignModal = (asset) => {
    const today = new Date().toISOString().slice(0, 10);
    setSelectedAsset(asset || null);
    setAssignForm({
      assetId: asset?.id || '',
      employeeId: '',
      issueDate: today,
      condition: 'Good',
      notes: '',
    });
    setShowAssignModal(true);
  };

  const handleAssignChange = (e) => {
    const { name, value } = e.target;
    setAssignForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveAssignment = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser || !assignForm.assetId || !assignForm.employeeId) return;
    setSaving(true);
    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', assignForm.assetId);
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) {
        showError('Asset not found');
        setSaving(false);
        return;
      }
      const asset = { id: assetSnap.id, ...assetSnap.data() };

      const emp = employees.find((e2) => e2.id === assignForm.employeeId);
      if (!emp) {
        showError('Employee not found');
        setSaving(false);
        return;
      }

      const issueTs = assignForm.issueDate ? Timestamp.fromDate(new Date(assignForm.issueDate)) : Timestamp.now();

      const historyEntry = {
        action: 'assigned',
        employeeId: emp.id,
        employeeName: emp.fullName || '',
        date: issueTs,
        condition: assignForm.condition || 'Good',
        notes: assignForm.notes?.trim() || '',
        performedBy: currentUser.email || '',
      };

      const existingHistory = Array.isArray(asset.history) ? asset.history : [];

      await updateDoc(assetRef, {
        status: 'Assigned',
        assignedToId: emp.id,
        assignedToName: emp.fullName || '',
        assignedToEmpId: emp.empId || '',
        issueDate: issueTs,
        condition: assignForm.condition || asset.condition || 'Good',
        history: [...existingHistory, historyEntry],
      });

      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                ...asset,
                status: 'Assigned',
                assignedToId: emp.id,
                assignedToName: emp.fullName || '',
                assignedToEmpId: emp.empId || '',
                issueDate: issueTs,
                condition: assignForm.condition || asset.condition || 'Good',
                history: [...existingHistory, historyEntry],
              }
            : a,
        ),
      );

      success(`${asset.name || asset.assetId} assigned to ${emp.fullName || ''}`);
      setShowAssignModal(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to assign asset', err);
      showError('Failed to assign asset');
    }
    setSaving(false);
  };

  const openReturnModal = (asset) => {
    const today = new Date().toISOString().slice(0, 10);
    setSelectedAsset(asset);
    setReturnForm({
      date: today,
      condition: 'Good',
      notes: '',
    });
    setShowReturnModal(true);
  };

  const handleReturnChange = (e) => {
    const { name, value } = e.target;
    setReturnForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveReturn = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser || !selectedAsset) return;
    setSaving(true);
    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', selectedAsset.id);
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) {
        showError('Asset not found');
        setSaving(false);
        return;
      }
      const asset = { id: assetSnap.id, ...assetSnap.data() };
      const returnTs = returnForm.date ? Timestamp.fromDate(new Date(returnForm.date)) : Timestamp.now();
      const isDamaged = returnForm.condition === 'Damaged';
      const newStatus = isDamaged ? 'Damaged' : 'Available';
      const historyEntry = {
        action: 'returned',
        employeeId: asset.assignedToId || null,
        employeeName: asset.assignedToName || '',
        date: returnTs,
        condition: returnForm.condition || 'Good',
        notes: returnForm.notes?.trim() || '',
        performedBy: currentUser.email || '',
      };
      const existingHistory = Array.isArray(asset.history) ? asset.history : [];

      await updateDoc(assetRef, {
        status: newStatus,
        assignedToId: null,
        assignedToName: null,
        assignedToEmpId: null,
        returnDate: returnTs,
        condition: returnForm.condition || asset.condition || 'Good',
        history: [...existingHistory, historyEntry],
      });

      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                ...asset,
                status: newStatus,
                assignedToId: null,
                assignedToName: null,
                assignedToEmpId: null,
                returnDate: returnTs,
                condition: returnForm.condition || asset.condition || 'Good',
                history: [...existingHistory, historyEntry],
              }
            : a,
        ),
      );

      success(`${asset.name || asset.assetId} returned`);
      setShowReturnModal(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to return asset', err);
      showError('Failed to return asset');
    }
    setSaving(false);
  };

  const openHistoryModal = (asset) => {
    setSelectedAsset(asset);
    setShowHistoryModal(true);
  };

  const openIssueModal = (asset) => {
    const today = new Date().toISOString().slice(0, 10);
    setIssueAsset(asset);
    setIssueForm({
      employeeId: '',
      quantity: 1,
      issueDate: today,
      condition: 'Good',
      notes: '',
    });
    setShowIssueModal(true);
  };

  const openViewIssuedModal = (asset) => {
    setIssuedAsset(asset);
    setShowViewIssuedModal(true);
  };

  const openEditStockModal = (asset) => {
    setEditStockAsset(asset);
    setEditStockForm({
      adjustmentType: 'Add stock',
      quantity: '',
      reason: '',
    });
    setShowEditStockModal(true);
  };

  const openReturnConsumableModal = (asset, assignment) => {
    const today = new Date().toISOString().slice(0, 10);
    setReturnConsumableAsset(asset);
    setReturnConsumableAssignment(assignment);
    setReturnConsumableForm({
      quantity: assignment?.quantity || 1,
      date: today,
      condition: 'Good',
      notes: '',
    });
    setShowReturnConsumableModal(true);
  };

  const handleSaveIssueConsumable = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser || !issueAsset) return;
    const empId = issueForm.employeeId;
    if (!empId) return;

    const qty = Number(issueForm.quantity);
    if (!qty || qty <= 0) return;

    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', issueAsset.id);
      const snap = await getDoc(assetRef);
      if (!snap.exists()) {
        showError('Asset not found');
        return;
      }

      const asset = { id: snap.id, ...snap.data() };
      const available = Number(asset.availableStock) || 0;
      if (qty > available) {
        showError(`Only ${available} available`);
        return;
      }

      const emp = employees.find((x) => x.id === empId);
      if (!emp) {
        showError('Employee not found');
        return;
      }

      const issueTs = issueForm.issueDate ? Timestamp.fromDate(new Date(issueForm.issueDate)) : Timestamp.now();

      const assignment = {
        employeeId: emp.id,
        employeeName: emp.fullName || '',
        empId: emp.empId || '',
        quantity: qty,
        issueDate: issueTs,
        condition: issueForm.condition || 'Good',
        returnDate: null,
        returned: false,
        notes: issueForm.notes?.trim() || '',
      };

      const existingAssignments = Array.isArray(asset.assignments) ? asset.assignments : [];
      const existingHistory = Array.isArray(asset.history) ? asset.history : [];

      await updateDoc(assetRef, {
        assignments: [...existingAssignments, assignment],
        availableStock: available - qty,
        issuedCount: (Number(asset.issuedCount) || 0) + qty,
        history: [
          ...existingHistory,
          {
            action: 'issued',
            employeeId: emp.id,
            employeeName: emp.fullName || '',
            quantity: qty,
            date: issueTs,
            condition: issueForm.condition || 'Good',
            notes: issueForm.notes?.trim() || '',
            performedBy: currentUser.email || '',
          },
        ],
      });

      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                assignments: [...existingAssignments, assignment],
                availableStock: available - qty,
                issuedCount: (Number(a.issuedCount) || 0) + qty,
              }
            : a,
        ),
      );

      success(`${issueAsset.name || issueAsset.assetId} issued to ${emp.fullName}`);
      setShowIssueModal(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to issue consumable', err);
      showError('Failed to issue consumable');
    }
  };

  const handleSaveReturnConsumable = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser || !returnConsumableAsset || !returnConsumableAssignment) return;

    const qty = Number(returnConsumableForm.quantity);
    if (!qty || qty <= 0) return;

    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', returnConsumableAsset.id);
      const snap = await getDoc(assetRef);
      if (!snap.exists()) {
        showError('Asset not found');
        return;
      }

      const asset = { id: snap.id, ...snap.data() };
      const available = Number(asset.availableStock) || 0;
      const issuedCount = Number(asset.issuedCount) || 0;
      const existingAssignments = Array.isArray(asset.assignments) ? asset.assignments : [];

      const assignmentIdx = existingAssignments.findIndex(
        (as) =>
          as.employeeId === returnConsumableAssignment.employeeId &&
          !as.returned &&
          (as.issueDate?.seconds || 0) === (returnConsumableAssignment.issueDate?.seconds || 0),
      );

      if (assignmentIdx === -1) {
        showError('Assignment not found');
        return;
      }

      const assignment = existingAssignments[assignmentIdx];
      const maxReturn = Number(assignment.quantity) || 0;
      if (qty > maxReturn) {
        showError(`Max return is ${maxReturn}`);
        return;
      }

      const returnTs = returnConsumableForm.date ? Timestamp.fromDate(new Date(returnConsumableForm.date)) : Timestamp.now();

      const nextAssignments = existingAssignments.map((as, idx) => {
        if (idx !== assignmentIdx) return as;
        const remaining = Number(as.quantity) - qty;
        return {
          ...as,
          quantity: remaining,
          returned: remaining <= 0,
          returnDate: remaining <= 0 ? returnTs : as.returnDate || null,
        };
      });

      await updateDoc(assetRef, {
        assignments: nextAssignments,
        availableStock: available + qty,
        issuedCount: issuedCount - qty,
        history: [
          ...(Array.isArray(asset.history) ? asset.history : []),
          {
            action: 'returned',
            employeeId: returnConsumableAssignment.employeeId,
            employeeName: returnConsumableAssignment.employeeName || '',
            quantity: qty,
            date: returnTs,
            condition: returnConsumableForm.condition || 'Good',
            notes: returnConsumableForm.notes?.trim() || '',
            performedBy: currentUser.email || '',
          },
        ],
      });

      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                assignments: nextAssignments,
                availableStock: available + qty,
                issuedCount: issuedCount - qty,
              }
            : a,
        ),
      );

      success(`${qty} ${returnConsumableAsset.name || returnConsumableAsset.assetId} returned by ${returnConsumableAssignment.employeeName}`);
      setShowReturnConsumableModal(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to return consumable', err);
      showError('Failed to return consumable');
    }
  };

  const handleSaveEditStock = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser || !editStockAsset) return;

    const qty = Number(editStockForm.quantity);
    if (!qty || qty <= 0) return;

    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', editStockAsset.id);
      const snap = await getDoc(assetRef);
      if (!snap.exists()) {
        showError('Asset not found');
        return;
      }

      const asset = { id: snap.id, ...snap.data() };
      const available = Number(asset.availableStock) || 0;
      const total = Number(asset.totalStock) || 0;
      const issuedCount = Number(asset.issuedCount) || 0;

      let nextTotal = total;
      let nextAvailable = available;

      if (editStockForm.adjustmentType === 'Add stock') {
        nextTotal = total + qty;
        nextAvailable = available + qty;
      } else if (editStockForm.adjustmentType === 'Remove stock') {
        if (qty > available) {
          showError(`Only ${available} available to remove`);
          return;
        }
        nextTotal = total - qty;
        nextAvailable = available - qty;
      } else {
        // Set total
        if (qty < issuedCount) {
          showError(`Total cannot be less than issued (${issuedCount})`);
          return;
        }
        nextTotal = qty;
        nextAvailable = qty - issuedCount;
      }

      await updateDoc(assetRef, {
        totalStock: nextTotal,
        availableStock: nextAvailable,
        issuedCount: nextTotal - nextAvailable,
        history: [
          ...(Array.isArray(asset.history) ? asset.history : []),
          {
            action: 'stock_adjusted',
            quantity: qty,
            date: Timestamp.now(),
            condition: null,
            notes: editStockForm.reason?.trim() || '',
            performedBy: currentUser.email || '',
          },
        ],
      });

      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                totalStock: nextTotal,
                availableStock: nextAvailable,
                issuedCount: nextTotal - nextAvailable,
              }
            : a,
        ),
      );

      success('Stock updated');
      setShowEditStockModal(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to edit stock', err);
      showError('Failed to edit stock');
    }
  };

  const downloadAssets = (format) => {
    if (!company) return;
    const rows = filtered.map((a) => ({
      'Asset ID': a.assetId || '',
      Name: a.name || '',
      Type: a.type || '',
      Brand: a.brand || '',
      Model: a.model || '',
      'Serial Number': a.serialNumber || '',
      Status: a.status || '',
      'Assigned To': a.assignedToName || '',
      'Assigned Emp ID': a.assignedToEmpId || '',
      'Issue Date': a.issueDate ? toDisplayDate(a.issueDate) : '',
      'Return Date': a.returnDate ? toDisplayDate(a.returnDate) : '',
      Condition: a.condition || '',
      'Purchase Date': a.purchaseDate ? toDisplayDate(a.purchaseDate) : '',
      'Purchase Price': a.purchasePrice ?? '',
      'Warranty Expiry': a.warrantyExpiry ? toDisplayDate(a.warrantyExpiry) : '',
      'Is Returnable': a.isReturnable ? 'Yes' : 'No',
      Notes: a.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
    const safeName = (company.name || 'Company').replace(/\s+/g, '');

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `${safeName}_Assets_${today}.csv`);
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Assets');
      XLSX.writeFile(wb, `${safeName}_Assets_${today}.xlsx`);
    }
  };

  if (!companyId) return null;

  return (
    <div className="p-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Assets</h1>
          <p className="text-slate-500 mt-1">Manage company assets and assignments</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDownload((o) => !o)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 bg-white"
            >
              Download ▾
            </button>
            {showDownload && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[10rem]">
                <button
                  type="button"
                  onClick={() => {
                    downloadAssets('csv');
                    setShowDownload(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadAssets('excel');
                    setShowDownload(false);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-50 rounded-b-lg"
                >
                  Download Excel
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-[#378ADD] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#2a7bc7]"
          >
            + Add Asset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border rounded-lg p-3 text-center">
          <p className="text-xl font-semibold text-slate-800">{stats.total}</p>
          <p className="text-xs text-slate-500">Total Assets</p>
        </div>
        <div className="bg-white border rounded-lg p-3 text-center">
          <p className="text-xl font-semibold text-blue-600">{stats.trackable}</p>
          <p className="text-xs text-slate-500">Trackable</p>
        </div>
        <div className="bg-white border rounded-lg p-3 text-center">
          <p className="text-xl font-semibold text-green-600">{stats.consumable}</p>
          <p className="text-xs text-slate-500">Consumable</p>
        </div>
        <div className="bg-white border rounded-lg p-3 text-center">
          <p className="text-xl font-semibold text-emerald-700">{stats.assignedIssued}</p>
          <p className="text-xs text-slate-500">Assigned / Issued</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="text"
            placeholder="Search by asset, ID, serial, or employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
          />
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            >
              <option>All Types</option>
              {assetTypes.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {(search || filterType !== 'All Types' || filterStatus !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilterType('All Types');
                  setFilterStatus('All');
                }}
                className="text-xs text-slate-500 hover:text-slate-700 px-2"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {['all', 'trackable', 'consumable'].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setAssetView(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-all ${
              assetView === v
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {v === 'all' ? 'All Assets' : v === 'trackable' ? '🔵 Trackable' : '🟢 Consumable'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#378ADD] border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          {(assetView === 'all' || assetView === 'trackable') && (
            <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Asset ID</th>
                <th className="px-4 py-3 text-left font-medium">Name &amp; Type</th>
                <th className="px-4 py-3 text-left font-medium">Assigned To</th>
                <th className="px-4 py-3 text-left font-medium">Issue Date</th>
                <th className="px-4 py-3 text-left font-medium">Condition</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trackableAssets.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{a.assetId}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{a.name || '—'}</p>
                      <p className="text-xs text-gray-400">
                        {a.type || '—'}
                        {(a.brand || a.model) && ' · '}
                        {[a.brand, a.model].filter(Boolean).join(' ')}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.assignedToId ? (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
                          {(a.assignedToName || '?').charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs text-slate-800">{a.assignedToName}</p>
                          <p className="text-[10px] text-slate-400">{a.assignedToEmpId}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">{a.issueDate ? toDisplayDate(a.issueDate) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-700">{a.condition || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                        a.status || 'Available',
                      )}`}
                    >
                      {a.status || 'Available'}
                    </span>
                  </td>
                  <td className="px-4 py-3 space-x-2">
                    {(a.status === 'Available' || !a.status) && (
                      <button
                        type="button"
                        onClick={() => openAssignModal(a)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Assign
                      </button>
                    )}
                    {a.status === 'Assigned' && (
                      <button
                        type="button"
                        onClick={() => openReturnModal(a)}
                        className="text-xs text-amber-600 hover:underline"
                      >
                        Return
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openHistoryModal(a)}
                      className="text-xs text-slate-600 hover:underline"
                    >
                      View History
                    </button>
                  </td>
                </tr>
              ))}
              {trackableAssets.length === 0 &&
                (assetView === 'trackable' ||
                  (assetView === 'all' && consumableAssets.length === 0)) && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500 text-sm" colSpan={7}>
                    No assets found.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          )}
          {(assetView === 'all' || assetView === 'consumable') && consumableAssets.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Stock Info</th>
                    <th className="px-4 py-3 text-left font-medium">Assigned Count</th>
                    <th className="px-4 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {consumableAssets.map((a) => {
                    const total = Number(a.totalStock) || 0;
                    const available = Number(a.availableStock) || 0;
                    const issuedCount = Number(a.issuedCount) || 0;
                    const pct = total ? Math.min((available / total) * 100, 100) : 0;
                    return (
                      <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-700">{a.type || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center text-xs">
                              {getAssetIcon(a.type)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{a.name || '—'}</p>
                              <p className="text-xs text-gray-400">{a.assetId || ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 whitespace-nowrap">
                                {available} / {total}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {issuedCount} issued · {available} available
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">{issuedCount}</td>
                        <td className="px-4 py-3 space-x-2">
                          {available > 0 && (
                            <button
                              type="button"
                              className="text-xs text-blue-600 hover:underline"
                              onClick={() => openIssueModal(a)}
                            >
                              Issue
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-xs text-slate-600 hover:underline"
                            onClick={() => openViewIssuedModal(a)}
                          >
                            View Issued
                          </button>
                          <button
                            type="button"
                            className="text-xs text-slate-600 hover:underline"
                            onClick={() => openEditStockModal(a)}
                          >
                            Edit Stock
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {assetView === 'consumable' && consumableAssets.length === 0 && (
            <div className="mt-6 p-6 text-center text-slate-500 text-sm">No consumable assets found.</div>
          )}
        </div>
      )}

      {/* Add Asset Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-3">
              Add Asset
              {selectedAddAssetMode === 'trackable' ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                  Trackable — individual item
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                  Consumable — quantity based
                </span>
              )}
            </h2>
            <form onSubmit={handleSaveAsset} className="space-y-6">
              <section>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Asset Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selectedAddAssetMode === 'trackable' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Asset ID</label>
                      <input
                        name="assetId"
                        value={form.assetId}
                        onChange={handleFormChange}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-[#378ADD]"
                      />
                      {formErrors.assetId && <p className="text-red-500 text-xs mt-1">{formErrors.assetId}</p>}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Asset Name</label>
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    />
                    {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Asset Type</label>
                    <select
                      name="type"
                      value={form.type}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                      disabled={selectedAddAssetMode === 'consumable'}
                    >
                      {assetTypes.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedAddAssetMode === 'trackable' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Brand</label>
                        <input
                          name="brand"
                          value={form.brand}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
                        <input
                          name="model"
                          value={form.model}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Serial Number</label>
                        <input
                          name="serialNumber"
                          value={form.serialNumber}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                        />
                      </div>
                    </>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Purchase Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {selectedAddAssetMode === 'trackable' ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Purchase Date</label>
                        <input
                          type="date"
                          name="purchaseDate"
                          value={form.purchaseDate}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Purchase Price (₹)</label>
                        <input
                          type="number"
                          name="purchasePrice"
                          value={form.purchasePrice}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Warranty Expiry</label>
                        <input
                          type="date"
                          name="warrantyExpiry"
                          value={form.warrantyExpiry}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Total quantity in stock</label>
                        <input
                          type="number"
                          name="totalStock"
                          value={form.totalStock}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                          min={0}
                        />
                        {formErrors.totalStock && (
                          <p className="text-red-500 text-xs mt-1">{formErrors.totalStock}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Purchase Price per unit (₹)</label>
                        <input
                          type="number"
                          name="purchasePrice"
                          value={form.purchasePrice}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Unit</label>
                        <select
                          name="unit"
                          value={form.unit}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                        >
                          <option value="pieces">pieces</option>
                          <option value="sets">sets</option>
                          <option value="units">units</option>
                          <option value="pairs">pairs</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Status &amp; Condition</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {selectedAddAssetMode === 'trackable' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Initial Status</label>
                        <input
                          value="Available"
                          readOnly
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Condition</label>
                        <select
                          name="condition"
                          value={form.condition}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                        >
                          {CONDITION_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-2 mt-5">
                    <input
                      id="isReturnable"
                      type="checkbox"
                      name="isReturnable"
                      checked={form.isReturnable}
                      onChange={handleFormChange}
                      className="rounded border-slate-300 text-[#378ADD] focus:ring-[#378ADD]"
                    />
                    <label htmlFor="isReturnable" className="text-xs text-slate-700">
                      Employee must return this asset
                    </label>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-slate-700 mb-2">Notes</h3>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleFormChange}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                  placeholder="Any additional information about this asset"
                />
              </section>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Asset Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Assign Asset</h2>
            <form onSubmit={handleSaveAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Asset</label>
                <select
                  name="assetId"
                  value={assignForm.assetId}
                  onChange={handleAssignChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  disabled={!!selectedAsset}
                >
                  {!selectedAsset && <option value="">Select asset</option>}
                  {assets
                    .filter((a) => !selectedAsset && (a.status === 'Available' || !a.status))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.assetId} · {a.name}
                      </option>
                    ))}
                  {selectedAsset && (
                    <option value={selectedAsset.id}>
                      {selectedAsset.assetId} · {selectedAsset.name}
                    </option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
                <select
                  name="employeeId"
                  value={assignForm.employeeId}
                  onChange={handleAssignChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select employee</option>
                  {employees
                    .filter((e) => (e.status || 'Active') === 'Active')
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.empId || ''} · {e.fullName || e.email}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Issue Date</label>
                  <input
                    type="date"
                    name="issueDate"
                    value={assignForm.issueDate}
                    onChange={handleAssignChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Condition at Issue</label>
                  <select
                    name="condition"
                    value={assignForm.condition}
                    onChange={handleAssignChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {CONDITION_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={assignForm.notes}
                  onChange={handleAssignChange}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Any special instructions or comments"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Assigning…' : 'Assign Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Asset Modal */}
      {showReturnModal && selectedAsset && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Return Asset</h2>
            <form onSubmit={handleSaveReturn} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Asset</p>
                  <p className="text-sm font-medium text-slate-800">
                    {selectedAsset.assetId} · {selectedAsset.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Employee</p>
                  <p className="text-sm text-slate-800">
                    {selectedAsset.assignedToName || '—'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Return Date</label>
                  <input
                    type="date"
                    name="date"
                    value={returnForm.date}
                    onChange={handleReturnChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Condition on Return</label>
                  <select
                    name="condition"
                    value={returnForm.condition}
                    onChange={handleReturnChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {CONDITION_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={returnForm.notes}
                  onChange={handleReturnChange}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Any damage or notes on return"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Consumable: Issue Modal */}
      {showIssueModal && issueAsset && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Issue Consumable</h2>
            <form onSubmit={handleSaveIssueConsumable} className="space-y-4">
              <div>
                <p className="text-sm text-slate-700">
                  <span className="font-medium">{issueAsset.name || issueAsset.assetId}</span> · {issueAsset.type}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Available: {Number(issueAsset.availableStock) || 0}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
                <select
                  value={issueForm.employeeId}
                  onChange={(e) => setIssueForm((p) => ({ ...p, employeeId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select employee</option>
                  {employees
                    .filter((e) => (e.status || 'Active') === 'Active')
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.fullName} ({e.empId})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={Number(issueAsset.availableStock) || 0}
                  value={issueForm.quantity}
                  onChange={(e) => setIssueForm((p) => ({ ...p, quantity: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Issue Date</label>
                <input
                  type="date"
                  value={issueForm.issueDate}
                  onChange={(e) => setIssueForm((p) => ({ ...p, issueDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Condition</label>
                <select
                  value={issueForm.condition}
                  onChange={(e) => setIssueForm((p) => ({ ...p, condition: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="New">New</option>
                  <option value="Good">Good</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  value={issueForm.notes}
                  onChange={(e) => setIssueForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Optional notes"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
                >
                  {saving ? 'Saving…' : 'Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Consumable: View Issued Modal */}
      {showViewIssuedModal && issuedAsset && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Issued Consumables</h2>
            <p className="text-xs text-slate-500 mb-4">
              {issuedAsset.name || issuedAsset.assetId} · {issuedAsset.type}
            </p>

            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {(issuedAsset.assignments || []).filter((a) => !a.returned).length === 0 ? (
                <p className="text-sm text-slate-500 p-4">No active issued items.</p>
              ) : (
                (issuedAsset.assignments || [])
                  .filter((a) => !a.returned)
                  .map((assignment, idx) => (
                    <div key={idx} className="flex items-center gap-3 py-3 px-4">
                      <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-medium text-green-700">
                        {(assignment.employeeName || '?').charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {assignment.employeeName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {assignment.empId} · Qty: {assignment.quantity} ·{' '}
                          {assignment.issueDate ? toDisplayDate(assignment.issueDate) : '—'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openReturnConsumableModal(issuedAsset, assignment)}
                        className="text-xs px-2.5 py-1 rounded-lg border text-gray-600 hover:bg-gray-50"
                      >
                        Return
                      </button>
                    </div>
                  ))
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowViewIssuedModal(false)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consumable: Return Modal */}
      {showReturnConsumableModal && returnConsumableAsset && returnConsumableAssignment && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Return Consumable</h2>
            <form onSubmit={handleSaveReturnConsumable} className="space-y-4">
              <div>
                <p className="text-sm text-slate-700">
                  <span className="font-medium">{returnConsumableAsset.name || returnConsumableAsset.assetId}</span> ·{' '}
                  {returnConsumableAsset.type}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Assigned to {returnConsumableAssignment.employeeName} · Available for return: {Number(returnConsumableAssignment.quantity) || 0}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Quantity to return</label>
                <input
                  type="number"
                  min={1}
                  max={Number(returnConsumableAssignment.quantity) || 0}
                  value={returnConsumableForm.quantity}
                  onChange={(e) => setReturnConsumableForm((p) => ({ ...p, quantity: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Return Date</label>
                <input
                  type="date"
                  value={returnConsumableForm.date}
                  onChange={(e) => setReturnConsumableForm((p) => ({ ...p, date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Condition on return</label>
                <select
                  value={returnConsumableForm.condition}
                  onChange={(e) => setReturnConsumableForm((p) => ({ ...p, condition: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="New">New</option>
                  <option value="Good">Good</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  value={returnConsumableForm.notes}
                  onChange={(e) => setReturnConsumableForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Any damage or notes on return"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReturnConsumableModal(false)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#378ADD] text-white text-sm font-medium px-4 py-2">
                  {saving ? 'Saving…' : 'Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Consumable: Edit Stock Modal */}
      {showEditStockModal && editStockAsset && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit Stock</h2>
            <form onSubmit={handleSaveEditStock} className="space-y-4">
              <div>
                <p className="text-sm text-slate-700">
                  <span className="font-medium">{editStockAsset.name || editStockAsset.assetId}</span> · {editStockAsset.type}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Current: {Number(editStockAsset.availableStock) || 0} / {Number(editStockAsset.totalStock) || 0} available
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Adjustment</label>
                <select
                  value={editStockForm.adjustmentType}
                  onChange={(e) => setEditStockForm((p) => ({ ...p, adjustmentType: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="Add stock">Add stock</option>
                  <option value="Remove stock">Remove stock</option>
                  <option value="Set total">Set total</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min={0}
                  value={editStockForm.quantity}
                  onChange={(e) => setEditStockForm((p) => ({ ...p, quantity: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="e.g. 10"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason</label>
                <input
                  value={editStockForm.reason}
                  onChange={(e) => setEditStockForm((p) => ({ ...p, reason: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="e.g. New purchase"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowEditStockModal(false)} className="text-sm text-slate-500 hover:text-slate-700">
                  Cancel
                </button>
                <button type="submit" className="rounded-lg bg-[#378ADD] text-white text-sm font-medium px-4 py-2">
                  {saving ? 'Saving…' : 'Save Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedAsset && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Asset History</h2>
            <p className="text-xs text-slate-500 mb-4">
              {selectedAsset.assetId} · {selectedAsset.name}
            </p>
            <div className="space-y-3">
              {(selectedAsset.history || [])
                .slice()
                .sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0))
                .map((h, idx) => {
                  const dateStr = h.date ? toDisplayDate(h.date) : '—';
                  let badgeClass = 'bg-slate-100 text-slate-700';
                  let label = h.action;
                  if (h.action === 'issued') {
                    badgeClass = 'bg-green-100 text-green-700';
                    label = 'Issued';
                  } else
                  if (h.action === 'assigned') {
                    badgeClass = 'bg-green-100 text-green-700';
                    label = 'Assigned';
                  } else if (h.action === 'returned') {
                    badgeClass = 'bg-blue-100 text-blue-700';
                    label = 'Returned';
                  } else if (h.action === 'damaged') {
                    badgeClass = 'bg-red-100 text-red-700';
                    label = 'Damaged';
                  } else if (h.action === 'repaired') {
                    badgeClass = 'bg-amber-100 text-amber-800';
                    label = 'Repaired';
                  } else if (h.action === 'stock_adjusted') {
                    badgeClass = 'bg-amber-100 text-amber-800';
                    label = 'Stock Adjusted';
                  } else if (h.action === 'created') {
                    badgeClass = 'bg-slate-100 text-slate-700';
                    label = 'Created';
                  }
                  return (
                    <div key={idx} className="border border-slate-200 rounded-lg p-3 text-sm flex gap-3">
                      <div className="pt-0.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                          {label}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-slate-800">
                            {h.employeeName ? h.employeeName : 'System'}
                          </p>
                          <p className="text-xs text-slate-400">{dateStr}</p>
                        </div>
                        <p className="text-xs text-slate-500">
                          Condition: {h.condition || '—'}
                          {typeof h.quantity === 'number' ? ` · Qty: ${h.quantity}` : ''}
                        </p>
                        {h.notes && <p className="text-xs text-slate-500 mt-1">Notes: {h.notes}</p>}
                        {h.performedBy && (
                          <p className="text-[11px] text-slate-400 mt-1">
                            Performed by: {h.performedBy}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              {(selectedAsset.history || []).length === 0 && (
                <p className="text-sm text-slate-500">No history yet.</p>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

