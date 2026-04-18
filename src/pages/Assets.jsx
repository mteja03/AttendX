import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { SkeletonTable } from '../components/SkeletonRow';
import EmptyState from '../components/EmptyState';
import EmployeeAvatar from '../components/EmployeeAvatar';
import { useAuth } from '../contexts/AuthContext';
import { toDisplayDate } from '../utils';
import ErrorModal from '../components/ErrorModal';
import { withRetry } from '../utils/firestoreWithRetry';
import { ERROR_MESSAGES, getErrorMessage, logError } from '../utils/errorHandler';
import { trackAssetAdded, trackAssetAssigned, trackPageView } from '../utils/analytics';

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
      return 'bg-[#C5E8E8] text-[#1B6B6B]';
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
  const navigate = useNavigate();
  const { currentUser, role: userRole, signOut } = useAuth();
  const { success, error: showError } = useToast();
  const [company, setCompany] = useState(null);
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [assetFilters, setAssetFilters] = useState({
    assetType: '',
    status: '',
    mode: '',
    assignedTo: '',
    department: '',
    branch: '',
  });
  const [showAssetFilters, setShowAssetFilters] = useState(false);
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
    type: '',
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
  const [errorModal, setErrorModal] = useState(null);

  // Clear error modal on re-login
  useEffect(() => {
    if (!currentUser) return undefined;
    const timer = setTimeout(() => {
      setErrorModal(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentUser]);

  const handleSmartError = async (error, context, fallback = 'Failed to save. Please try again.') => {
    await logError(error, { companyId, ...context });
    const errType = getErrorMessage(error);
    if (error?._needsReauth || errType === 'auth_expired') return setErrorModal('auth_expired');
    if (errType === 'permission_denied') return setErrorModal('permission_denied');
    if (errType === 'network_error') return setErrorModal('network_error');
    showError(ERROR_MESSAGES[errType]?.message || fallback);
  };

  useEffect(() => {
    trackPageView('Assets');
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);

      try {
        const companySnap = await getDoc(doc(db, 'companies', companyId));
        if (companySnap.exists()) setCompany({ id: companySnap.id, ...companySnap.data() });
      } catch (err) {
        console.error('Company load error:', err?.code, err?.message);
      }

      try {
        let assetSnap;
        try {
          assetSnap = await getDocs(query(collection(db, 'companies', companyId, 'assets'), orderBy('createdAt', 'desc')));
        } catch {
          assetSnap = await getDocs(collection(db, 'companies', companyId, 'assets'));
        }
        setAssets(
          assetSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            mode: d.data().mode || 'trackable',
          })),
        );
      } catch (error) {
        console.error('Assets fetch error:', error?.code, error?.message);
        if (error?.code === 'permission-denied') {
          showError('Permission denied. Contact admin.');
        } else if (error?.code === 'failed-precondition') {
          showError('Database index building. Try again in 2 minutes.');
        } else {
          showError(`Failed to load assets: ${error?.message || 'Unknown error'}`);
        }
        setAssets([]);
      }

      try {
        const empSnap = await getDocs(collection(db, 'companies', companyId, 'employees'));
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Employees load error:', err?.code, err?.message);
        setEmployees([]);
      }

      setLoading(false);
    };
    load();
  }, [companyId, showError, userRole]);

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

  const selectedAddAssetMode = assetTypes.find((t) => t.name === form.type)?.mode || null;
  const sortedAssetTypes = useMemo(() => {
    const list = Array.isArray(assetTypes) ? assetTypes.slice() : [];
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
    const trackable = list.filter((t) => (t.mode || 'trackable') === 'trackable').sort(byName);
    const consumable = list.filter((t) => (t.mode || 'trackable') === 'consumable').sort(byName);
    return { trackable, consumable };
  }, [assetTypes]);

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

  const filteredAssets = useMemo(() => {
    const term = search.trim().toLowerCase();

    return assets.filter((asset) => {
      const mode = asset.mode || 'trackable';
      const isTrackable = mode === 'trackable';
      const activeAssignments = !isTrackable ? (asset.assignments || []).filter((as) => !as.returned) : [];

      // Search
      if (term) {
        const assignedName = isTrackable ? asset.assignedToName || '' : '';
        const assignmentNames = !isTrackable ? activeAssignments.map((as) => as.employeeName || '').join(' ') : '';
        const matchesTerm =
          (asset.assetId || '').toLowerCase().includes(term) ||
          (asset.name || '').toLowerCase().includes(term) ||
          (asset.serialNumber || '').toLowerCase().includes(term) ||
          assignedName.toLowerCase().includes(term) ||
          assignmentNames.toLowerCase().includes(term);
        if (!matchesTerm) return false;
      }

      // Spec filters
      if (assetFilters.assetType && asset.type !== assetFilters.assetType) return false;

      if (assetFilters.status) {
        const effectiveStatus = asset.status || 'Available';
        if (effectiveStatus !== assetFilters.status) return false;
      }

      if (assetFilters.mode) {
        if (String(asset.mode || 'trackable').toLowerCase() !== String(assetFilters.mode).toLowerCase()) return false;
      }

      if (assetFilters.assignedTo === 'unassigned') {
        const hasActiveAssignment = isTrackable ? !!asset.assignedToId : activeAssignments.length > 0;
        if (hasActiveAssignment) return false;
      }

      if (assetFilters.assignedTo && assetFilters.assignedTo !== 'unassigned') {
        const matchesAssigned =
          isTrackable
            ? asset.assignedToName === assetFilters.assignedTo
            : activeAssignments.some((as) => (as.employeeName || '') === assetFilters.assignedTo);
        if (!matchesAssigned) return false;
      }

      if (assetFilters.department) {
        if (isTrackable) {
          const emp = employees.find((e) => e.id === asset.assignedToId);
          if (!emp || emp.department !== assetFilters.department) return false;
        } else {
          const deptMatches = activeAssignments.some((as) => {
            const emp = employees.find((e) => e.id === as.employeeId);
            return emp && emp.department === assetFilters.department;
          });
          if (!deptMatches) return false;
        }
      }

      if (assetFilters.branch) {
        if (isTrackable) {
          const emp = employees.find((e) => e.id === asset.assignedToId);
          if (!emp || emp.branch !== assetFilters.branch) return false;
        } else {
          const branchMatches = activeAssignments.some((as) => {
            const emp = employees.find((e) => e.id === as.employeeId);
            return emp && emp.branch === assetFilters.branch;
          });
          if (!branchMatches) return false;
        }
      }

      return true;
    });
  }, [assets, assetFilters, employees, search]);

  const trackableAssets = useMemo(
    () => filteredAssets.filter((a) => (a.mode || 'trackable') === 'trackable'),
    [filteredAssets],
  );
  const consumableAssets = useMemo(
    () => filteredAssets.filter((a) => (a.mode || 'trackable') === 'consumable'),
    [filteredAssets],
  );

  const resetAddForm = () => {
    setForm({
      assetId: '',
      name: '',
      type: '',
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
            ...(value && assetTypes.find((t) => t.name === value)?.mode === 'trackable'
              ? { assetId: prev.assetId || `${buildAssetIdPrefix(value)}001` }
              : { assetId: prev.assetId || '' }),
            name: value ? prev.name || value : prev.name,
          }
        : null),
    }));
    if (formErrors[name]) setFormErrors((p) => ({ ...p, [name]: null }));
  };

  const handleValidateAdd = () => {
    const err = {};
    if (!form.type) err.type = 'Asset type is required';
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

      const ref = await withRetry(
        () => addDoc(collection(db, 'companies', companyId, 'assets'), payload),
        { companyId, action: 'addAsset' },
      );
      setAssets((prev) => [{ id: ref.id, ...payload }, ...prev]);
      setShowAddModal(false);
      trackAssetAdded(form.type || payload.type || '');
      success('Asset added');
    } catch (error) {
      await handleSmartError(error, { action: 'addAsset' }, 'Failed to add asset');
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

      await withRetry(() => updateDoc(assetRef, {
        status: 'Assigned',
        assignedToId: emp.id,
        assignedToName: emp.fullName || '',
        assignedToEmpId: emp.empId || '',
        issueDate: issueTs,
        condition: assignForm.condition || asset.condition || 'Good',
        history: [...existingHistory, historyEntry],
      }), { companyId, action: 'assignAsset' });

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

      trackAssetAssigned();
      success(`${asset.name || asset.assetId} assigned to ${emp.fullName || ''}`);
      setShowAssignModal(false);
    } catch (error) {
      await handleSmartError(error, { action: 'assignAsset', assetId: assignForm.assetId }, 'Failed to assign asset');
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

      await withRetry(() => updateDoc(assetRef, {
        status: newStatus,
        assignedToId: null,
        assignedToName: null,
        assignedToEmpId: null,
        returnDate: returnTs,
        condition: returnForm.condition || asset.condition || 'Good',
        history: [...existingHistory, historyEntry],
      }), { companyId, action: 'returnAsset' });

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
    } catch (error) {
      await handleSmartError(error, { action: 'returnAsset', assetId: selectedAsset.id }, 'Failed to return asset');
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
    } catch {
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
    } catch {
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
    } catch {
      showError('Failed to edit stock');
    }
  };

  const downloadAssets = (format) => {
    if (!company) return;
    const rows = filteredAssets.map((a) => ({
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
    <div className="p-4 sm:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Assets</h1>
          <p className="text-sm text-gray-500 mt-1">Manage company assets and assignments</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="relative">
            {Object.values(assetFilters).some((v) => v) && (
              <p className="text-xs text-amber-600 mb-2">
                ⚠️ Download will include only filtered results ({filteredAssets.length} records)
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowDownload((o) => !o)}
              className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 active:bg-slate-100 bg-white"
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
                  className="block w-full text-left min-h-[44px] px-4 py-2 text-sm hover:bg-slate-50 active:bg-slate-100"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    downloadAssets('excel');
                    setShowDownload(false);
                  }}
                  className="block w-full text-left min-h-[44px] px-4 py-2 text-sm hover:bg-slate-50 active:bg-slate-100 rounded-b-lg"
                >
                  Download Excel
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-[#1B6B6B] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#155858] active:bg-[#0f4444]"
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
          <p className="text-xl font-semibold text-[#1B6B6B]">{stats.trackable}</p>
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
            className="flex-1 min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
          />
          <div className="flex flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowAssetFilters((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-sm ${
                showAssetFilters || Object.values(assetFilters).some((v) => v)
                  ? 'border-[#1B6B6B] text-[#1B6B6B] bg-[#E8F5F5]'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              ⚙️ Filters
              {Object.values(assetFilters).some((v) => v) && (
                <span className="bg-[#1B6B6B] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                  {Object.values(assetFilters).filter((v) => v).length}
                </span>
              )}
            </button>
          </div>
        </div>

        {showAssetFilters && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Filter Assets</h3>
              <button
                onClick={() =>
                  setAssetFilters({
                    assetType: '',
                    status: '',
                    mode: '',
                    assignedTo: '',
                    department: '',
                    branch: '',
                  })
                }
                className="text-xs text-[#1B6B6B] hover:underline"
              >
                Clear all
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {/* Asset Type */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Asset Type</label>
                <select
                  value={assetFilters.assetType}
                  onChange={(e) => setAssetFilters((prev) => ({ ...prev, assetType: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Types</option>
                  {[...new Set(assets.map((a) => a.type).filter(Boolean))]
                    .sort()
                    .map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Status</label>
                <select
                  value={assetFilters.status}
                  onChange={(e) => setAssetFilters((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Statuses</option>
                  <option value="Available">Available</option>
                  <option value="Assigned">Assigned</option>
                  <option value="Damaged">Damaged</option>
                  <option value="Lost">Lost</option>
                </select>
              </div>

              {/* Mode */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Mode</label>
                <select
                  value={assetFilters.mode}
                  onChange={(e) => setAssetFilters((prev) => ({ ...prev, mode: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  <option value="Trackable">Trackable</option>
                  <option value="Consumable">Consumable</option>
                </select>
              </div>

              {/* Assigned To Employee */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Assigned To</label>
                <select
                  value={assetFilters.assignedTo}
                  onChange={(e) => setAssetFilters((prev) => ({ ...prev, assignedTo: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">Anyone</option>
                  <option value="unassigned">Unassigned</option>
                  {[...new Set(assets.filter((a) => a.assignedToName).map((a) => a.assignedToName))].sort().map(
                    (name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ),
                  )}
                </select>
              </div>

              {/* Department of assigned employee */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Department</label>
                <select
                  value={assetFilters.department}
                  onChange={(e) => setAssetFilters((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Departments</option>
                  {(company?.departments || []).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Branch</label>
                <select
                  value={assetFilters.branch}
                  onChange={(e) => setAssetFilters((prev) => ({ ...prev, branch: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Branches</option>
                  {(company?.branches || []).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {Object.values(assetFilters).some((v) => v) && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-[#1B6B6B]">
                  {Object.values(assetFilters).filter((v) => v).length} filter
                  {Object.values(assetFilters).filter((v) => v).length !== 1 ? 's' : ''} active
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto scrollbar-none -mx-1 px-1 mb-4 lg:mx-0 lg:px-0">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit min-w-max">
          {['all', 'trackable', 'consumable'].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setAssetView(v)}
              className={`px-4 py-2 min-h-[44px] rounded-md text-sm font-medium capitalize transition-all flex-shrink-0 active:opacity-90 ${
                assetView === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700 active:bg-gray-200/50'
              }`}
            >
              {v === 'all' ? 'All Assets' : v === 'trackable' ? '🔵 Trackable' : '🟢 Consumable'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={8} />
      ) : (
        <>
        <div className="hidden lg:block overflow-x-auto border border-slate-200 rounded-xl bg-white">
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
                        <EmployeeAvatar
                          employee={{
                            fullName: a.assignedToName,
                            photoURL: employees.find((e) => e.id === a.assignedToId)?.photoURL,
                          }}
                          size="xs"
                        />
                        <div>
                          <p className="text-sm text-gray-700">{a.assignedToName}</p>
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
                        className="text-xs text-[#1B6B6B] hover:underline"
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
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      illustration={
                        <div className="w-16 h-16 rounded-2xl bg-[#E6F1FB] flex items-center justify-center">
                          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                            <rect x="6" y="10" width="14" height="18" rx="3" fill="#B5D4F4" />
                            <rect x="16" y="6" width="14" height="18" rx="3" fill="#85B7EB" />
                            <circle cx="27" cy="27" r="6" fill="#378ADD" />
                            <path d="M25 27h4M27 25v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </div>
                      }
                      title={
                        search || Object.values(assetFilters).some((v) => v)
                          ? 'No assets match your filters'
                          : 'No assets tracked yet'
                      }
                      description={
                        search || Object.values(assetFilters).some((v) => v)
                          ? 'Try adjusting the asset type or status filter.'
                          : 'Add laptops, phones, and other company assets to track assignments.'
                      }
                      action={
                        search || Object.values(assetFilters).some((v) => v)
                          ? () => {
                              setSearch('');
                              setAssetFilters({
                                assetType: '',
                                status: '',
                                mode: '',
                                assignedTo: '',
                                department: '',
                                branch: '',
                              });
                            }
                          : () => setShowAddModal(true)
                      }
                      actionLabel={
                        search || Object.values(assetFilters).some((v) => v)
                          ? 'Clear filters'
                          : 'Add first asset'
                      }
                      actionColor={
                        search || Object.values(assetFilters).some((v) => v) ? '#5F5E5A' : '#185FA5'
                      }
                      hint={
                        !(search || Object.values(assetFilters).some((v) => v))
                          ? 'trackable and consumable types'
                          : undefined
                      }
                    />
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
                              className="text-xs text-[#1B6B6B] hover:underline"
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

        <div className="lg:hidden space-y-3">
          {(assetView === 'all' || assetView === 'trackable') &&
            trackableAssets.map((asset) => (
              <div key={asset.id} className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 shadow-sm">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{asset.assetId}</span>
                    <p className="font-medium text-gray-900 mt-1">{asset.name || '—'}</p>
                    <p className="text-xs text-gray-400">
                      {asset.type || '—'}
                      {(asset.brand || asset.model) && ` · ${[asset.brand, asset.model].filter(Boolean).join(' ')}`}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${getStatusBadgeClass(asset.status || 'Available')}`}
                  >
                    {asset.status || 'Available'}
                  </span>
                </div>

                {asset.assignedToName && (
                  <p className="text-xs text-gray-500 mb-2">
                    Assigned to: {asset.assignedToName}
                    {asset.assignedToEmpId ? ` (${asset.assignedToEmpId})` : ''}
                  </p>
                )}

                <div className="flex gap-2 flex-wrap">
                  {(asset.status === 'Available' || !asset.status) && (
                    <button
                      type="button"
                      onClick={() => openAssignModal(asset)}
                      className="flex-1 min-w-[120px] min-h-[44px] py-2 bg-[#1B6B6B] text-white rounded-xl text-xs font-medium hover:bg-[#155858] active:bg-[#0f4444]"
                    >
                      Assign
                    </button>
                  )}
                  {asset.status === 'Assigned' && (
                    <button
                      type="button"
                      onClick={() => openReturnModal(asset)}
                      className="flex-1 min-w-[120px] min-h-[44px] py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                    >
                      Return
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openHistoryModal(asset)}
                    className="min-h-[44px] px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500 hover:bg-gray-50 active:bg-gray-100"
                  >
                    History
                  </button>
                </div>
              </div>
            ))}

          {(assetView === 'all' || assetView === 'trackable') &&
            trackableAssets.length === 0 &&
            (assetView === 'trackable' || consumableAssets.length === 0) && (
              <EmptyState
                illustration={
                  <div className="w-16 h-16 rounded-2xl bg-[#E6F1FB] flex items-center justify-center">
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                      <rect x="6" y="10" width="14" height="18" rx="3" fill="#B5D4F4" />
                      <rect x="16" y="6" width="14" height="18" rx="3" fill="#85B7EB" />
                      <circle cx="27" cy="27" r="6" fill="#378ADD" />
                      <path d="M25 27h4M27 25v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                }
                title={
                  search || Object.values(assetFilters).some((v) => v)
                    ? 'No assets match your filters'
                    : 'No assets tracked yet'
                }
                description={
                  search || Object.values(assetFilters).some((v) => v)
                    ? 'Try adjusting the asset type or status filter.'
                    : 'Add laptops, phones, and other company assets to track assignments.'
                }
                action={
                  search || Object.values(assetFilters).some((v) => v)
                    ? () => {
                        setSearch('');
                        setAssetFilters({
                          assetType: '',
                          status: '',
                          mode: '',
                          assignedTo: '',
                          department: '',
                          branch: '',
                        });
                      }
                    : () => setShowAddModal(true)
                }
                actionLabel={
                  search || Object.values(assetFilters).some((v) => v) ? 'Clear filters' : 'Add first asset'
                }
                actionColor={
                  search || Object.values(assetFilters).some((v) => v) ? '#5F5E5A' : '#185FA5'
                }
                hint={
                  !(search || Object.values(assetFilters).some((v) => v))
                    ? 'trackable and consumable types'
                    : undefined
                }
              />
            )}

          {(assetView === 'all' || assetView === 'consumable') &&
            consumableAssets.map((a) => {
              const total = Number(a.totalStock) || 0;
              const available = Number(a.availableStock) || 0;
              const issuedCount = Number(a.issuedCount) || 0;
              const pct = total ? Math.min((available / total) * 100, 100) : 0;
              return (
                <div key={a.id} className="bg-white border border-green-100 rounded-2xl p-4 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center text-xs">{getAssetIcon(a.type)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{a.name || '—'}</p>
                      <p className="text-xs text-gray-400">{a.type || '—'} · {a.assetId || ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {available}/{total}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    {issuedCount} issued · {available} available
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {available > 0 && (
                      <button
                        type="button"
                        className="flex-1 min-h-[44px] py-2 bg-[#1B6B6B] text-white rounded-xl text-xs font-medium"
                        onClick={() => openIssueModal(a)}
                      >
                        Issue
                      </button>
                    )}
                    <button
                      type="button"
                      className="flex-1 min-h-[44px] py-2 border border-gray-200 rounded-xl text-xs text-gray-600"
                      onClick={() => openViewIssuedModal(a)}
                    >
                      View Issued
                    </button>
                    <button
                      type="button"
                      className="min-h-[44px] px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-500"
                      onClick={() => openEditStockModal(a)}
                    >
                      Edit Stock
                    </button>
                  </div>
                </div>
              );
            })}

          {assetView === 'consumable' && consumableAssets.length === 0 && (
            <p className="text-center text-slate-500 py-8 text-sm">No consumable assets found.</p>
          )}
        </div>
        </>
      )}

      {/* Add Asset Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-3">
              Add Asset
              {selectedAddAssetMode === 'trackable' ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#C5E8E8] text-[#1B6B6B] border border-[#C5E8E8]">
                  Trackable — individual item
                </span>
              ) : selectedAddAssetMode === 'consumable' ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                  Consumable — quantity based
                </span>
              ) : null}
            </h2>

            {assetTypes.length === 0 ? (
              <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-sm text-gray-500 mb-2">
                  No asset types configured yet.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/company/${companyId}/settings`)}
                  className="text-sm text-[#1B6B6B] hover:underline"
                >
                  Go to Settings → Manage Lists to add asset types
                </button>
              </div>
            ) : (
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
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-[#4ECDC4]"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    />
                    {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Asset Type</label>
                    <select
                      name="type"
                      value={form.type}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    >
                      <option value="">Select asset type</option>
                      <optgroup label="Trackable (unique items)">
                        {sortedAssetTypes.trackable.map((t) => (
                          <option key={t.name} value={t.name}>
                            {t.name} 🔵
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Consumable (quantity)">
                        {sortedAssetTypes.consumable.map((t) => (
                          <option key={t.name} value={t.name}>
                            {t.name} 🟢
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    {formErrors.type && <p className="text-red-500 text-xs mt-1">{formErrors.type}</p>}

                    {selectedAddAssetMode === 'trackable' ? (
                      <div className="flex items-center gap-2 p-3 bg-[#E8F5F5] rounded-lg border border-[#E8F5F5] mt-2">
                        <span className="text-[#1B6B6B] text-base">
                          🔵
                        </span>
                        <div>
                          <p className="text-sm font-medium text-[#1B6B6B]">
                            Trackable Asset
                          </p>
                          <p className="text-xs text-[#1B6B6B]">
                            Each item gets a unique ID and can only be assigned to one person at a time. Full serial number and history tracking.
                          </p>
                        </div>
                      </div>
                    ) : selectedAddAssetMode === 'consumable' ? (
                      <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-100 mt-2">
                        <span className="text-green-600 text-base">
                          🟢
                        </span>
                        <div>
                          <p className="text-sm font-medium text-green-700">
                            Consumable Asset
                          </p>
                          <p className="text-xs text-green-500">
                            Track total stock and issue quantities to multiple employees simultaneously. e.g. Uniforms, ID Cards, SIM Cards.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100 mt-2">
                        <p className="text-xs text-gray-400">
                          Select an asset type to see tracking mode. Configure types in Settings → Manage Lists → Asset Types.
                        </p>
                      </div>
                    )}
                  </div>
                  {selectedAddAssetMode === 'trackable' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Brand</label>
                        <input
                          name="brand"
                          value={form.brand}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
                        <input
                          name="model"
                          value={form.model}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Serial Number</label>
                        <input
                          name="serialNumber"
                          value={form.serialNumber}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Purchase Price (₹)</label>
                        <input
                          type="number"
                          name="purchasePrice"
                          value={form.purchasePrice}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Warranty Expiry</label>
                        <input
                          type="date"
                          name="warrantyExpiry"
                          value={form.warrantyExpiry}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Unit</label>
                        <select
                          name="unit"
                          value={form.unit}
                          onChange={handleFormChange}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                      className="rounded border-slate-300 text-[#1B6B6B] focus:ring-[#4ECDC4]"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                  className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save Asset'}
                </button>
              </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Assign Asset Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
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
                  className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
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
                  className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
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
                  className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2"
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
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
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
                      <EmployeeAvatar
                        employee={{
                          fullName: assignment.employeeName,
                          photoURL: employees.find((e) => e.id === assignment.employeeId)?.photoURL,
                        }}
                        size="xs"
                      />
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
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
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
                <button type="submit" className="rounded-lg bg-[#1B6B6B] text-white text-sm font-medium px-4 py-2">
                  {saving ? 'Saving…' : 'Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Consumable: Edit Stock Modal */}
      {showEditStockModal && editStockAsset && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
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
                <button type="submit" className="rounded-lg bg-[#1B6B6B] text-white text-sm font-medium px-4 py-2">
                  {saving ? 'Saving…' : 'Save Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedAsset && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-xl sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
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
                    badgeClass = 'bg-[#C5E8E8] text-[#1B6B6B]';
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
      {errorModal && (
        <ErrorModal
          errorType={errorModal}
          onRetry={() => setErrorModal(null)}
          onDismiss={() => setErrorModal(null)}
          onSignOut={async () => {
            setErrorModal(null);
            await signOut();
          }}
        />
      )}
    </div>
  );
}

