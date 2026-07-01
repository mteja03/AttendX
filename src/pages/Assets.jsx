import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  query,
  where,
} from 'firebase/firestore';
import { fetchAssets, updateAsset, addAsset, deleteAsset } from '../services/assetService';
import { assetSchema } from '../utils/validationSchemas';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';
import { SkeletonTable } from '../components/SkeletonRow';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import EmployeeAvatar from '../components/EmployeeAvatar';
import { useAuth } from '../contexts/AuthContext';
import { toDisplayDate } from '../utils';
import ErrorModal from '../components/ErrorModal';
import { ERROR_MESSAGES, getErrorMessage, logError } from '../utils/errorHandler';
import { trackAssetAdded, trackAssetAssigned, trackPageView } from '../utils/analytics';
import {
  DEFAULT_ASSET_TYPES,
  STATUS_OPTIONS,
  CONDITION_OPTIONS,
  getStatusBadgeClass,
  getAssetIcon,
  getConditionBadgeClass,
  getStatusBarColor,
  getAssetIdBadgeClass,
  getAssetTypeColors,
  buildAssetIdPrefix,
} from '../utils/assetHelpers';
import SortIcon from '../components/assets/SortIcon';
import AddAssetModal from '../components/assets/AddAssetModal';
import AssignAssetModal from '../components/assets/AssignAssetModal';
import ReturnAssetModal from '../components/assets/ReturnAssetModal';
import IssueConsumableModal from '../components/assets/IssueConsumableModal';
import ViewIssuedModal from '../components/assets/ViewIssuedModal';
import ReturnConsumableModal from '../components/assets/ReturnConsumableModal';
import EditStockModal from '../components/assets/EditStockModal';
import AssetHistoryModal from '../components/assets/AssetHistoryModal';
import MaintenanceModal from '../components/assets/MaintenanceModal';
import QRModal from '../components/assets/QRModal';
import AssetDetailPanel from '../components/assets/AssetDetailPanel';
import EditAssetModal from '../components/assets/EditAssetModal';
import StatusChangeModal from '../components/assets/StatusChangeModal';
import DeleteAssetModal from '../components/assets/DeleteAssetModal';

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
  const [assetAssignFilter, setAssetAssignFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addAssetMode, setAddAssetMode] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showViewIssuedModal, setShowViewIssuedModal] = useState(false);
  const [showReturnConsumableModal, setShowReturnConsumableModal] = useState(false);
  const [showEditStockModal, setShowEditStockModal] = useState(false);
  const [showEditAssetModal, setShowEditAssetModal] = useState(false);
  const [showDeleteAssetModal, setShowDeleteAssetModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [deletingAsset, setDeletingAsset] = useState(null);
  const [statusAsset, setStatusAsset] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [editAssetForm, setEditAssetForm] = useState({
    name: '',
    brand: '',
    model: '',
    serialNumber: '',
    condition: 'Good',
    purchaseDate: '',
    purchasePrice: '',
    warrantyExpiry: '',
    notes: '',
  });
  const [statusForm, setStatusForm] = useState({
    newStatus: '',
    reason: '',
    date: '',
  });
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
    assignmentType: 'employee',
    assignedLocation: '',
    assignedBranch: '',
    assignedArea: '',
  });
  const [assignForm, setAssignForm] = useState({
    assetId: '',
    employeeId: '',
    issueDate: '',
    expectedReturnDate: '',
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
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', dir: 'desc' });
  const [detailAsset, setDetailAsset] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkExportMenu, setShowBulkExportMenu] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceAsset, setMaintenanceAsset] = useState(null);
  const [maintenanceForm, setMaintenanceForm] = useState({
    type: 'Repair',
    description: '',
    date: '',
    cost: '',
    vendor: '',
    nextDueDate: '',
  });
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrAsset, setQRAsset] = useState(null);

  const getAssignmentDuration = (issueDate) => {
    if (!issueDate) return null;
    const d = issueDate?.toDate ? issueDate.toDate() : new Date(issueDate);
    if (isNaN(d.getTime())) return null;
    const months = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24 * 30.44));
    if (months < 1) {
      const days = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
      return `${days}d`;
    }
    const years = Math.floor(months / 12);
    const rem = months % 12;
    if (years > 0) return rem > 0 ? `${years}y ${rem}m` : `${years}y`;
    return `${months}m`;
  };

  const handleSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  };

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
        if (import.meta.env.DEV) console.error('Company load error:', err?.code, err?.message);
      }

      try {
        const assetDocs = await fetchAssets(companyId);
        setAssets(
          assetDocs.map((d) => ({
            ...d,
            mode: d.mode || 'trackable',
          })),
        );
      } catch (error) {
        if (import.meta.env.DEV) console.error('Assets fetch error:', error?.code, error?.message);
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
        if (import.meta.env.DEV) console.error('Employees load error:', err?.code, err?.message);
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

  const structuredLocations = useMemo(() => {
    const raw = company?.locations || [];
    if (raw.length > 0 && typeof raw[0] === 'object' && raw[0].branches) return raw;
    return raw.map((l, i) => ({
      id: `loc_${i}`,
      name: typeof l === 'string' ? l : (l.name || String(l)),
      branches: [],
    }));
  }, [company?.locations]);

  const selectedAddAssetMode = addAssetMode || assetTypes.find((t) => t.name === form.type)?.mode || null;

  const stats = useMemo(() => {
    const total = assets.length;
    const trackable = assets.filter((a) => (a.mode || 'trackable') === 'trackable').length;
    const consumable = assets.filter((a) => (a.mode || 'trackable') === 'consumable').length;
    const assignedTrackable = assets.filter((a) => (a.mode || 'trackable') === 'trackable' && a.status === 'Assigned').length;
    const issuedConsumable = assets
      .filter((a) => (a.mode || 'trackable') === 'consumable')
      .reduce((sum, a) => sum + (Number(a.issuedCount) || 0), 0);
    const totalValue = assets.reduce((sum, a) => {
      const price = Number(a.purchasePrice) || 0;
      const qty = (a.mode || 'trackable') === 'consumable' ? (Number(a.totalStock) || 1) : 1;
      return sum + price * qty;
    }, 0);
    const overdueReturns = assets.filter((a) => {
      if (a.status !== 'Assigned' || !a.expectedReturnDate) return false;
      const exp = a.expectedReturnDate?.toDate ? a.expectedReturnDate.toDate() : new Date(a.expectedReturnDate);
      return !isNaN(exp.getTime()) && exp < new Date();
    }).length;
    return { total, trackable, consumable, assignedIssued: assignedTrackable + issuedConsumable, totalValue, overdueReturns };
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

  const filteredByAssignment = useMemo(() => {
    if (assetAssignFilter === 'all') return filteredAssets;
    return filteredAssets.filter((a) => (a.assignmentType || 'employee') === assetAssignFilter);
  }, [filteredAssets, assetAssignFilter]);

  const trackableAssets = useMemo(() => {
    const list = filteredByAssignment.filter((a) => (a.mode || 'trackable') === 'trackable');
    const { key, dir } = sortConfig;
    return list.slice().sort((a, b) => {
      let av, bv;
      if (key === 'name') { av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase(); }
      else if (key === 'type') { av = (a.type || '').toLowerCase(); bv = (b.type || '').toLowerCase(); }
      else if (key === 'status') { av = (a.status || '').toLowerCase(); bv = (b.status || '').toLowerCase(); }
      else if (key === 'issueDate') { av = a.issueDate?.seconds || 0; bv = b.issueDate?.seconds || 0; }
      else if (key === 'assignedTo') { av = (a.assignedToName || '').toLowerCase(); bv = (b.assignedToName || '').toLowerCase(); }
      else { av = a.createdAt?.seconds || 0; bv = b.createdAt?.seconds || 0; }
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredByAssignment, sortConfig]);
  const consumableAssets = useMemo(
    () => filteredByAssignment.filter((a) => (a.mode || 'trackable') === 'consumable'),
    [filteredByAssignment],
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
      assignmentType: 'employee',
      assignedLocation: '',
      assignedBranch: '',
      assignedArea: '',
    });
    setFormErrors({});
    setAddAssetMode(null);
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
    const _assetMode = assetTypes.find((t) => t.name === form.type)?.mode || 'trackable';
    const _assetValidation = assetSchema.safeParse({
      name: form.name?.trim() || '',
      type: form.type || '',
      assetId: _assetMode === 'trackable' ? (form.assetId?.trim() || '') : 'generated',
    });
    if (!_assetValidation.success) {
      showError(_assetValidation.error.errors[0].message);
      return;
    }
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
          assignmentType: form.assignmentType || 'employee',
          assignedLocation: form.assignmentType === 'branch' ? form.assignedLocation || null : null,
          assignedBranch: form.assignmentType === 'branch' ? form.assignedBranch || null : null,
          assignedArea: form.assignmentType === 'branch' ? form.assignedArea?.trim() || null : null,
          ...(form.assignmentType === 'branch' && form.assignedBranch ? {
            status: 'In Use',
            assignedToName: form.assignedBranch,
          } : {}),
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
          createdBy: currentUser.email || '',
        };
      }

      const ref = await addAsset(companyId, payload);
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
      const expectedReturnTs = assignForm.expectedReturnDate
        ? Timestamp.fromDate(new Date(assignForm.expectedReturnDate))
        : null;

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

      await updateAsset(companyId, assignForm.assetId, {
        status: 'Assigned',
        assignedToId: emp.id,
        assignedToName: emp.fullName || '',
        assignedToEmpId: emp.empId || '',
        issueDate: issueTs,
        expectedReturnDate: expectedReturnTs,
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
                expectedReturnDate: expectedReturnTs,
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

      await updateAsset(companyId, selectedAsset.id, {
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

  const getWarrantyState = (warrantyExpiry) => {
    if (!warrantyExpiry) return null;
    const exp = warrantyExpiry?.toDate ? warrantyExpiry.toDate() : new Date(warrantyExpiry);
    if (isNaN(exp.getTime())) return null;
    const now = new Date();
    const daysLeft = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: 'Warranty expired', color: 'bg-red-100 text-red-700' };
    if (daysLeft <= 60) return { label: `Warranty: ${daysLeft}d left`, color: 'bg-amber-100 text-amber-700' };
    return null;
  };

  const openEditAssetModal = (asset) => {
    setEditingAsset(asset);
    setEditAssetForm({
      name: asset.name || '',
      brand: asset.brand || '',
      model: asset.model || '',
      serialNumber: asset.serialNumber || '',
      condition: asset.condition || 'Good',
      purchaseDate: asset.purchaseDate
        ? (asset.purchaseDate?.toDate ? asset.purchaseDate.toDate() : new Date(asset.purchaseDate))
            .toISOString().slice(0, 10)
        : '',
      purchasePrice: asset.purchasePrice ?? '',
      warrantyExpiry: asset.warrantyExpiry
        ? (asset.warrantyExpiry?.toDate ? asset.warrantyExpiry.toDate() : new Date(asset.warrantyExpiry))
            .toISOString().slice(0, 10)
        : '',
      notes: asset.notes || '',
    });
    setShowEditAssetModal(true);
  };

  const openDeleteAssetModal = (asset) => {
    setDeletingAsset(asset);
    setDeleteConfirmText('');
    setShowDeleteAssetModal(true);
  };

  const openStatusModal = (asset) => {
    setStatusAsset(asset);
    setStatusForm({
      newStatus: '',
      reason: '',
      date: new Date().toISOString().slice(0, 10),
    });
    setShowStatusModal(true);
  };

  const openReturnConsumableModal = (asset, assignment, assignmentIdx) => {
    const today = new Date().toISOString().slice(0, 10);
    setReturnConsumableAsset(asset);
    setReturnConsumableAssignment({ ...assignment, _idx: assignmentIdx });
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

      await updateAsset(companyId, issueAsset.id, {
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

      const assignmentIdx =
        returnConsumableAssignment._idx != null
          ? returnConsumableAssignment._idx
          : existingAssignments.findIndex(
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

      await updateAsset(companyId, returnConsumableAsset.id, {
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

      await updateAsset(companyId, editStockAsset.id, {
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

  const handleSaveEditAsset = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser || !editingAsset) return;
    setSaving(true);
    try {
      const payload = {
        name: editAssetForm.name.trim(),
        brand: editAssetForm.brand.trim() || '',
        model: editAssetForm.model.trim() || '',
        serialNumber: editAssetForm.serialNumber.trim() || '',
        condition: editAssetForm.condition || 'Good',
        purchaseDate: editAssetForm.purchaseDate
          ? Timestamp.fromDate(new Date(editAssetForm.purchaseDate))
          : null,
        purchasePrice: editAssetForm.purchasePrice ? Number(editAssetForm.purchasePrice) : null,
        warrantyExpiry: editAssetForm.warrantyExpiry
          ? Timestamp.fromDate(new Date(editAssetForm.warrantyExpiry))
          : null,
        notes: editAssetForm.notes.trim() || '',
      };
      await updateAsset(companyId, editingAsset.id, payload);
      setAssets((prev) =>
        prev.map((a) => (a.id === editingAsset.id ? { ...a, ...payload } : a)),
      );
      setShowEditAssetModal(false);
      success('Asset updated');
    } catch (error) {
      await handleSmartError(error, { action: 'editAsset' }, 'Failed to update asset');
    }
    setSaving(false);
  };

  const handleDeleteAsset = async () => {
    if (!companyId || !currentUser || !deletingAsset) return;
    if (deleteConfirmText !== deletingAsset.assetId) return;
    setSaving(true);
    try {
      await deleteAsset(companyId, deletingAsset.id);
      setAssets((prev) => prev.filter((a) => a.id !== deletingAsset.id));
      setShowDeleteAssetModal(false);
      setDeletingAsset(null);
      setDeleteConfirmText('');
      success(`${deletingAsset.name || deletingAsset.assetId} deleted`);
    } catch (error) {
      await handleSmartError(error, { action: 'deleteAsset' }, 'Failed to delete asset');
    }
    setSaving(false);
  };

  const handleSaveStatusChange = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser || !statusAsset || !statusForm.newStatus) return;
    setSaving(true);
    try {
      const historyEntry = {
        action: statusForm.newStatus.toLowerCase().replace(/\s+/g, '_'),
        employeeId: null,
        employeeName: null,
        date: Timestamp.now(),
        condition: statusAsset.condition || '',
        notes: statusForm.reason.trim() || '',
        performedBy: currentUser.email || '',
      };
      const updatePayload = {
        status: statusForm.newStatus,
        history: [...(Array.isArray(statusAsset.history) ? statusAsset.history : []), historyEntry],
      };
      if (statusForm.newStatus === 'Available') {
        updatePayload.assignedToId = null;
        updatePayload.assignedToName = null;
        updatePayload.assignedToEmpId = null;
      }
      await updateAsset(companyId, statusAsset.id, updatePayload);
      setAssets((prev) =>
        prev.map((a) => (a.id === statusAsset.id ? { ...a, ...updatePayload } : a)),
      );
      setShowStatusModal(false);
      success(`Status updated to ${statusForm.newStatus}`);
    } catch (error) {
      await handleSmartError(error, { action: 'changeAssetStatus' }, 'Failed to update status');
    }
    setSaving(false);
  };

  const toggleSelectAsset = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === trackableAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trackableAssets.map((a) => a.id)));
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    if (!companyId || !currentUser || selectedIds.size === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) =>
          updateAsset(companyId, id, {
            status: newStatus,
            history: [
              ...((assets.find((a) => a.id === id)?.history) || []),
              { action: newStatus.toLowerCase().replace(/\s+/g, '_'), date: Timestamp.now(), notes: 'Bulk status change', performedBy: currentUser.email || '' },
            ],
          }),
        ),
      );
      setAssets((prev) =>
        prev.map((a) => (selectedIds.has(a.id) ? { ...a, status: newStatus } : a)),
      );
      setSelectedIds(new Set());
      success(`${selectedIds.size} assets updated to ${newStatus}`);
    } catch (error) {
      await handleSmartError(error, { action: 'bulkStatusChange' }, 'Bulk update failed');
    }
    setSaving(false);
  };

  const handleBulkExport = async (format) => {
    const selected = assets.filter((a) => selectedIds.has(a.id));
    const [xlsxMod, { saveAs }] = await Promise.all([import('xlsx'), import('file-saver')]);
    const XLSX = xlsxMod.default ?? xlsxMod;
    const rows = selected.map((a) => ({
      'Asset ID': a.assetId || '',
      Name: a.name || '',
      Type: a.type || '',
      Brand: a.brand || '',
      Model: a.model || '',
      'Serial Number': a.serialNumber || '',
      Status: a.status || '',
      'Assigned To': a.assignedToName || '',
      Condition: a.condition || '',
      'Purchase Price': a.purchasePrice ?? '',
      'Warranty Expiry': a.warrantyExpiry ? toDisplayDate(a.warrantyExpiry) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    if (rows.length > 0) {
      ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length + 2, 14) }));
    }
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `Assets_Selected_${today}.csv`);
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Assets');
      XLSX.writeFile(wb, `Assets_Selected_${today}.xlsx`);
    }
    setShowBulkExportMenu(false);
  };

  const openMaintenanceModal = (asset) => {
    setMaintenanceAsset(asset);
    setMaintenanceForm({
      type: 'Repair',
      description: '',
      date: new Date().toISOString().slice(0, 10),
      cost: '',
      vendor: '',
      nextDueDate: '',
    });
    setShowMaintenanceModal(true);
  };

  const handleSaveMaintenance = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser || !maintenanceAsset) return;
    setSaving(true);
    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', maintenanceAsset.id);
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) { showError('Asset not found'); setSaving(false); return; }
      const assetData = assetSnap.data();
      const entry = {
        action: `maintenance_${maintenanceForm.type.toLowerCase()}`,
        type: maintenanceForm.type,
        description: maintenanceForm.description.trim(),
        date: maintenanceForm.date ? Timestamp.fromDate(new Date(maintenanceForm.date)) : Timestamp.now(),
        cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : null,
        vendor: maintenanceForm.vendor.trim() || null,
        nextDueDate: maintenanceForm.nextDueDate ? Timestamp.fromDate(new Date(maintenanceForm.nextDueDate)) : null,
        performedBy: currentUser.email || '',
        employeeId: null,
        employeeName: null,
        condition: assetData.condition || null,
        notes: maintenanceForm.description.trim(),
      };
      const newStatus = maintenanceForm.type === 'Repair' ? 'In Repair' : assetData.status || 'Available';
      await updateAsset(companyId, maintenanceAsset.id, {
        status: newStatus,
        history: [...(Array.isArray(assetData.history) ? assetData.history : []), entry],
      });
      setAssets((prev) =>
        prev.map((a) =>
          a.id === maintenanceAsset.id
            ? { ...a, status: newStatus, history: [...(a.history || []), entry] }
            : a,
        ),
      );
      setShowMaintenanceModal(false);
      success(`Maintenance logged for ${maintenanceAsset.name || maintenanceAsset.assetId}`);
    } catch (error) {
      await handleSmartError(error, { action: 'logMaintenance' }, 'Failed to log maintenance');
    }
    setSaving(false);
  };

  const openQRModal = (asset) => {
    setQRAsset(asset);
    setShowQRModal(true);
  };

  const downloadAssets = async (format) => {
    const [xlsxMod, { saveAs }] = await Promise.all([
      import('xlsx'),
      import('file-saver'),
    ]);
    const XLSX = xlsxMod.default ?? xlsxMod;
    if (!company) return;
    const trackableRows = filteredAssets
      .filter((a) => (a.mode || 'trackable') === 'trackable')
      .map((a) => ({
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

    const consumableRows = filteredAssets
      .filter((a) => (a.mode || 'trackable') === 'consumable')
      .map((a) => ({
        'Asset ID': a.assetId || '',
        Name: a.name || '',
        Type: a.type || '',
        Brand: '',
        Model: '',
        'Serial Number': '',
        Status: `Stock: ${a.availableStock ?? 0} / ${a.totalStock ?? 0}`,
        'Assigned To': `${a.issuedCount ?? 0} issued`,
        'Assigned Emp ID': '',
        'Issue Date': '',
        'Return Date': '',
        Condition: '',
        'Purchase Date': '',
        'Purchase Price': a.purchasePrice ?? '',
        'Warranty Expiry': '',
        'Is Returnable': a.isReturnable ? 'Yes' : 'No',
        Notes: a.notes || '',
      }));

    const rows = [...trackableRows, ...consumableRows];

    const ws = XLSX.utils.json_to_sheet(rows);
    if (rows.length > 0) {
      ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length + 2, 15) }));
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let R = range.s.r + 1; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[addr];
          if (cell && cell.t === 's' && cell.v !== '' && !Number.isNaN(Number(cell.v))) {
            cell.t = 'n'; cell.v = Number(cell.v);
          }
        }
      }
    }
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

  useEffect(() => {
    if (!showQRModal || !qrAsset) return;
    const timer = setTimeout(async () => {
      const canvas = document.getElementById('qr-canvas');
      if (!canvas) return;
      const url = `${window.location.origin}/company/${companyId}/assets?id=${qrAsset.id}`;
      try {
        if (typeof window.QRCode === 'undefined') {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        canvas.innerHTML = '';
        new window.QRCode(canvas, {
          text: url,
          width: 180,
          height: 180,
          colorDark: '#1B6B6B',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M,
        });
      } catch {
        if (import.meta.env.DEV) console.warn('QR generation failed');
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [showQRModal, qrAsset, companyId]);

  if (!companyId) return null;

  return (
    <div>
      <div className="mb-4">
        <PageHeader
          title="Assets"
          subtitle="Track and manage company equipment"
          actions={
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDownload((o) => !o)}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-slate-50 active:bg-slate-100 bg-white"
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
            </>
          }
        />
      </div>
      {(stats.totalValue > 0 || stats.overdueReturns > 0) && (
        <div className="flex gap-3 mb-4 flex-wrap">
          {stats.totalValue > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-[#EEEDFE] flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#534AB7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              </div>
              <div>
                <p className="text-xs text-gray-400">Inventory value</p>
                <p className="text-sm font-semibold text-gray-800">₹{stats.totalValue.toLocaleString('en-IN')}</p>
              </div>
            </div>
          )}
          {stats.overdueReturns > 0 && (
            <button
              type="button"
              onClick={() => setAssetFilters((p) => ({ ...p, status: 'Assigned' }))}
              className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-3 hover:bg-red-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E24B4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div className="text-left">
                <p className="text-xs text-red-600 font-medium">{stats.overdueReturns} overdue return{stats.overdueReturns !== 1 ? 's' : ''}</p>
                <p className="text-xs text-red-400">Expected return date passed</p>
              </div>
            </button>
          )}
        </div>
      )}
      {Object.values(assetFilters).some((v) => v) && (
        <p className="text-xs text-amber-600 mb-3">
          ⚠️ Download will include only filtered results ({filteredAssets.length} records)
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <button
          type="button"
          onClick={() => { setAssetView('all'); setAssetFilters({ assetType: '', status: '', mode: '', assignedTo: '', department: '', branch: '' }); }}
          className="bg-white border border-gray-100 rounded-2xl p-4 text-left hover:border-[#1B6B6B]/30 hover:bg-[#E1F5EE]/20 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-[#E1F5EE] flex items-center justify-center mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total assets</p>
          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#1B6B6B] rounded-full" style={{ width: stats.total > 0 ? `${Math.round((stats.assignedIssued / stats.total) * 100)}%` : '0%' }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{stats.assignedIssued} of {stats.total} in use</p>
        </button>
        <button
          type="button"
          onClick={() => { setAssetView('trackable'); setAssetFilters((p) => ({ ...p, mode: '' })); }}
          className="bg-white border border-gray-100 rounded-2xl p-4 text-left hover:border-[#378ADD]/30 hover:bg-[#E6F1FB]/20 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-[#E6F1FB] flex items-center justify-center mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{stats.trackable}</p>
          <p className="text-xs text-gray-500 mt-0.5">Trackable</p>
          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#378ADD] rounded-full" style={{ width: stats.trackable > 0 ? `${Math.round((assets.filter((a) => (a.mode || 'trackable') === 'trackable' && a.status === 'Assigned').length / stats.trackable) * 100)}%` : '0%' }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{assets.filter((a) => (a.mode || 'trackable') === 'trackable' && a.status === 'Assigned').length} assigned</p>
        </button>
        <button
          type="button"
          onClick={() => { setAssetView('consumable'); setAssetFilters((p) => ({ ...p, mode: '' })); }}
          className="bg-white border border-gray-100 rounded-2xl p-4 text-left hover:border-[#639922]/30 hover:bg-[#EAF3DE]/20 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-[#EAF3DE] flex items-center justify-center mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{stats.consumable}</p>
          <p className="text-xs text-gray-500 mt-0.5">Consumable</p>
          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#639922] rounded-full" style={{ width: stats.consumable > 0 ? '100%' : '0%' }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{assets.filter((a) => (a.mode || 'trackable') === 'consumable').reduce((s, a) => s + (Number(a.issuedCount) || 0), 0)} issued</p>
        </button>
        <button
          type="button"
          onClick={() => { setAssetView('all'); setAssetFilters((p) => ({ ...p, status: 'Assigned' })); }}
          className="bg-white border border-gray-100 rounded-2xl p-4 text-left hover:border-[#639922]/30 hover:bg-[#EAF3DE]/20 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-[#EAF3DE] flex items-center justify-center mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B6D11" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
          </div>
          <p className="text-2xl font-semibold text-gray-900">{stats.assignedIssued}</p>
          <p className="text-xs text-gray-500 mt-0.5">Assigned / issued</p>
          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#639922] rounded-full" style={{ width: stats.total > 0 ? `${Math.round((stats.assignedIssued / stats.total) * 100)}%` : '0%' }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{stats.total > 0 ? Math.round((stats.assignedIssued / stats.total) * 100) : 0}% utilisation</p>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="text"
            placeholder="Search by asset, ID, serial, or employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
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

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 mb-3 bg-[#E1F5EE] border border-[#9FE1CB] rounded-2xl flex-wrap">
          <span className="text-sm font-medium text-[#0F6E56]">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <button type="button" onClick={() => handleBulkStatusChange('In Repair')} disabled={saving}
              className="text-xs px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full hover:bg-amber-200 transition-colors disabled:opacity-50">
              Mark In Repair
            </button>
            <button type="button" onClick={() => handleBulkStatusChange('Available')} disabled={saving}
              className="text-xs px-3 py-1.5 bg-[#E1F5EE] text-[#0F6E56] border border-[#9FE1CB] rounded-full hover:bg-[#C0DD97] transition-colors disabled:opacity-50">
              Mark Available
            </button>
            <button type="button" onClick={() => handleBulkStatusChange('Retired')} disabled={saving}
              className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50">
              Retire
            </button>
            <div className="relative">
              <button type="button" onClick={() => setShowBulkExportMenu((v) => !v)}
                className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-full hover:bg-gray-50 transition-colors">
                Export ▾
              </button>
              {showBulkExportMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-[120px]">
                  <button type="button" onClick={() => handleBulkExport('csv')} className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50">Export CSV</button>
                  <button type="button" onClick={() => handleBulkExport('excel')} className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 rounded-b-xl">Export Excel</button>
                </div>
              )}
            </div>
          </div>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Clear</button>
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-100 mb-4 overflow-x-auto scrollbar-none">
        {[
          { id: 'all', label: 'All assets', count: filteredByAssignment.length },
          { id: 'trackable', label: 'Trackable', count: trackableAssets.length, dot: '#378ADD' },
          { id: 'consumable', label: 'Consumable', count: consumableAssets.length, dot: '#639922' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setAssetView(tab.id)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors -mb-px ${
              assetView === tab.id
                ? 'border-[#1B6B6B] text-[#1B6B6B]'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-200'
            }`}
          >
            {tab.dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tab.dot }} />}
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${assetView === tab.id ? 'bg-[#E1F5EE] text-[#0F6E56]' : 'bg-gray-100 text-gray-400'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

              <div className="flex gap-1.5 px-4 pb-3">
                {['all', 'employee', 'branch'].map((f) => (
                  <button key={f} type="button" onClick={() => setAssetAssignFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${assetAssignFilter === f ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {f === 'all' ? 'All' : f === 'employee' ? '👤 Employee' : '🏢 Branch'}
                  </button>
                ))}
              </div>

      {loading ? (
        <SkeletonTable rows={8} />
      ) : (
        <>
        <div className="hidden lg:block overflow-x-auto border border-gray-100 rounded-2xl bg-white">
          {(assetView === 'all' || assetView === 'trackable') && (
            <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={selectedIds.size === trackableAssets.length && trackableAssets.length > 0} onChange={toggleSelectAll} className="rounded border-gray-300" aria-label="Select all" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Asset ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none hover:text-gray-600" onClick={() => handleSort('name')}>
                  <span className="inline-flex items-center gap-1">Name &amp; type <SortIcon colKey="name" sortConfig={sortConfig} /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none hover:text-gray-600" onClick={() => handleSort('assignedTo')}>
                  <span className="inline-flex items-center gap-1">Assigned to <SortIcon colKey="assignedTo" sortConfig={sortConfig} /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none hover:text-gray-600" onClick={() => handleSort('issueDate')}>
                  <span className="inline-flex items-center gap-1">Issue date <SortIcon colKey="issueDate" sortConfig={sortConfig} /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Condition</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide cursor-pointer select-none hover:text-gray-600" onClick={() => handleSort('status')}>
                  <span className="inline-flex items-center gap-1">Status <SortIcon colKey="status" sortConfig={sortConfig} /></span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trackableAssets.map((a) => {
                const assetStatus = a.status || 'Available';
                const typeColors = getAssetTypeColors(a.type);
                return (
                  <tr key={a.id} className={`border-t border-gray-100 hover:bg-gray-50/80 transition-colors border-l-4 cursor-pointer ${selectedIds.has(a.id) ? 'bg-[#E1F5EE]/40' : ''}`} style={{ borderLeftColor: getStatusBarColor(assetStatus) }} onClick={() => setDetailAsset(a)}>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelectAsset(a.id)} className="rounded border-gray-300" aria-label={`Select ${a.name}`} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center font-mono text-xs px-2 py-1 rounded-lg font-medium ${getAssetIdBadgeClass(assetStatus)}`}>{a.assetId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: typeColors.bg }}>
                          {getAssetIcon(a.type)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{a.name || '—'}</p>
                          <p className="text-xs text-gray-400">
                            {a.type || '—'}
                            {(a.brand || a.model) && ' · '}
                            {[a.brand, a.model].filter(Boolean).join(' ')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {a.assignmentType === 'branch' ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E1F5EE] text-[#085041]">🏢 {a.assignedBranch || a.assignedToName}</span>
                          {a.assignedArea && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">📍 {a.assignedArea}</span>}
                        </div>
                      ) : a.assignedToId ? (
                        <div className="flex items-center gap-2">
                          <EmployeeAvatar
                            employee={{ fullName: a.assignedToName, photoURL: employees.find((e) => e.id === a.assignedToId)?.photoURL }}
                            size="xs"
                          />
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => a.assignedToId && navigate(`/company/${companyId}/employees/${a.assignedToId}`)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && a.assignedToId) navigate(`/company/${companyId}/employees/${a.assignedToId}`); }}
                            className="cursor-pointer group"
                          >
                            <p className="text-sm text-gray-700 group-hover:text-[#1B6B6B] group-hover:underline">{a.assignedToName}</p>
                            <p className="text-[10px] text-slate-400">{a.assignedToEmpId}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {a.issueDate ? (
                        <div>
                          <p>{toDisplayDate(a.issueDate)}</p>
                          {a.status === 'Assigned' && (() => { const d = getAssignmentDuration(a.issueDate); return d ? <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">{d} held</span> : null; })()}
                        </div>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {a.condition ? (
                        <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${getConditionBadgeClass(a.condition)}`}>{a.condition}</span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium w-fit ${getStatusBadgeClass(assetStatus)}`}>{assetStatus}</span>
                        {assetStatus === 'Assigned' && a.expectedReturnDate && (() => {
                          const exp = a.expectedReturnDate?.toDate ? a.expectedReturnDate.toDate() : new Date(a.expectedReturnDate);
                          if (isNaN(exp.getTime())) return null;
                          const overdue = exp < new Date();
                          const daysLeft = Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
                          if (overdue) return <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium w-fit">⚠ Overdue by {Math.abs(daysLeft)}d</span>;
                          if (daysLeft <= 7) return <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium w-fit">Due in {daysLeft}d</span>;
                          return <span className="text-[10px] text-gray-400 w-fit">Due {toDisplayDate(a.expectedReturnDate)}</span>;
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(() => { const ws = getWarrantyState(a.warrantyExpiry); return ws ? <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium mb-1.5 ${ws.color}`}>{ws.label}</span> : null; })()}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(assetStatus === 'Available' || !a.status) && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); openAssignModal(a); }}
                            className="inline-flex items-center text-xs font-medium px-2.5 py-1.5 bg-[#E1F5EE] text-[#0F6E56] border border-[#9FE1CB] rounded-full hover:bg-[#1B6B6B] hover:text-white hover:border-[#1B6B6B] transition-colors">
                            Assign
                          </button>
                        )}
                        {assetStatus === 'Assigned' && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); openReturnModal(a); }}
                            className="inline-flex items-center text-xs font-medium px-2.5 py-1.5 bg-[#FAEEDA] text-[#633806] border border-[#FAC775] rounded-full hover:bg-[#EF9F27] hover:text-white hover:border-[#EF9F27] transition-colors">
                            Return
                          </button>
                        )}
                        <button type="button" onClick={(e) => { e.stopPropagation(); openHistoryModal(a); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                          title="View history" aria-label="View history">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); openEditAssetModal(a); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                          title="Edit asset" aria-label="Edit asset">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); openStatusModal(a); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors"
                          title="Change status" aria-label="Change status">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); openDeleteAssetModal(a); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                          title="Delete asset" aria-label="Delete asset">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); openMaintenanceModal(a); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 transition-colors"
                          title="Log maintenance" aria-label="Log maintenance">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); openQRModal(a); }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                          title="QR code" aria-label="QR code">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
          {assetView === 'all' && consumableAssets.length > 0 && trackableAssets.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 mt-2 border-t border-gray-100 bg-gray-50/60">
              <span className="w-2 h-2 rounded-full bg-[#639922] flex-shrink-0" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Consumable assets</p>
              <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">{consumableAssets.length} types</span>
            </div>
          )}
          {(assetView === 'all' || assetView === 'consumable') && consumableAssets.length > 0 && (
            <>
            <div className="lg:hidden space-y-3">
              {consumableAssets.map((a) => {
                const total = Number(a.totalStock) || 0;
                const available = Number(a.availableStock) || 0;
                const issuedCount = Number(a.issuedCount) || 0;
                const pct = total ? Math.min((available / total) * 100, 100) : 0;
                return (
                  <div key={a.id} className="bg-white border border-gray-100 rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center text-lg flex-shrink-0">{getAssetIcon(a.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{a.name || '—'}</p>
                        <p className="text-xs text-gray-400">{a.type || '—'} · {a.assetId || ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{available} / {total}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{issuedCount} issued · {available} available</span>
                    </div>
                  </div>
                );
              })}
              {consumableAssets.length === 0 && (
                <div className="text-center py-6 text-sm text-gray-400">No consumable assets</div>
              )}
            </div>
            <div className="hidden lg:block overflow-x-auto">
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
            </>
          )}
          {assetView === 'consumable' && consumableAssets.length === 0 && (
            <div className="mt-6 p-6 text-center text-slate-500 text-sm">No consumable assets found.</div>
          )}
        </div>

        <div className="lg:hidden space-y-3">
          {(assetView === 'all' || assetView === 'trackable') &&
            trackableAssets.map((asset) => (
              <div key={asset.id} className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 overflow-hidden border-l-4" style={{ borderLeftColor: getStatusBarColor(asset.status || 'Available') }}>
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ background: getAssetTypeColors(asset.type).bg }}>
                      {getAssetIcon(asset.type)}
                    </div>
                    <div className="min-w-0">
                      <span className={`inline-flex font-mono text-xs px-2 py-0.5 rounded-lg font-medium ${getAssetIdBadgeClass(asset.status || 'Available')}`}>{asset.assetId}</span>
                      <p className="font-medium text-gray-900 mt-0.5">{asset.name || '—'}</p>
                      <p className="text-xs text-gray-400">
                        {asset.type || '—'}
                        {(asset.brand || asset.model) && ` · ${[asset.brand, asset.model].filter(Boolean).join(' ')}`}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${getStatusBadgeClass(asset.status || 'Available')}`}>
                    {asset.status || 'Available'}
                  </span>
                </div>

                {(asset.assignmentType === 'branch') ? (
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E1F5EE] text-[#085041]">🏢 {asset.assignedBranch || asset.assignedToName}</span>
                    {asset.assignedArea && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">📍 {asset.assignedArea}</span>}
                  </div>
                ) : asset.assignedToName && (
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

      <AddAssetModal
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        selectedAddAssetMode={addAssetMode}
        setAddAssetMode={setAddAssetMode}
        assetTypes={assetTypes}
        form={form}
        setForm={setForm}
        formErrors={formErrors}
        handleFormChange={handleFormChange}
        handleSaveAsset={handleSaveAsset}
        saving={saving}
        structuredLocations={structuredLocations}
        company={company}
      />

      <AssignAssetModal
        showAssignModal={showAssignModal}
        setShowAssignModal={setShowAssignModal}
        selectedAsset={selectedAsset}
        assets={assets}
        employees={employees}
        assignForm={assignForm}
        handleAssignChange={handleAssignChange}
        handleSaveAssignment={handleSaveAssignment}
        saving={saving}
      />

      <ReturnAssetModal
        showReturnModal={showReturnModal}
        setShowReturnModal={setShowReturnModal}
        selectedAsset={selectedAsset}
        returnForm={returnForm}
        handleReturnChange={handleReturnChange}
        handleSaveReturn={handleSaveReturn}
        saving={saving}
      />

      <IssueConsumableModal
        showIssueModal={showIssueModal}
        setShowIssueModal={setShowIssueModal}
        issueAsset={issueAsset}
        issueForm={issueForm}
        setIssueForm={setIssueForm}
        handleSaveIssueConsumable={handleSaveIssueConsumable}
        employees={employees}
        saving={saving}
      />

      <ViewIssuedModal
        showViewIssuedModal={showViewIssuedModal}
        setShowViewIssuedModal={setShowViewIssuedModal}
        issuedAsset={issuedAsset}
        employees={employees}
        openReturnConsumableModal={openReturnConsumableModal}
      />

      <ReturnConsumableModal
        showReturnConsumableModal={showReturnConsumableModal}
        setShowReturnConsumableModal={setShowReturnConsumableModal}
        returnConsumableAsset={returnConsumableAsset}
        returnConsumableAssignment={returnConsumableAssignment}
        returnConsumableForm={returnConsumableForm}
        setReturnConsumableForm={setReturnConsumableForm}
        handleSaveReturnConsumable={handleSaveReturnConsumable}
        saving={saving}
      />

      <EditStockModal
        showEditStockModal={showEditStockModal}
        setShowEditStockModal={setShowEditStockModal}
        editStockAsset={editStockAsset}
        editStockForm={editStockForm}
        setEditStockForm={setEditStockForm}
        handleSaveEditStock={handleSaveEditStock}
        saving={saving}
      />

      <AssetHistoryModal
        showHistoryModal={showHistoryModal}
        setShowHistoryModal={setShowHistoryModal}
        selectedAsset={selectedAsset}
      />

      <MaintenanceModal
        showMaintenanceModal={showMaintenanceModal}
        setShowMaintenanceModal={setShowMaintenanceModal}
        maintenanceAsset={maintenanceAsset}
        maintenanceForm={maintenanceForm}
        setMaintenanceForm={setMaintenanceForm}
        handleSaveMaintenance={handleSaveMaintenance}
        saving={saving}
      />

      <QRModal
        showQRModal={showQRModal}
        setShowQRModal={setShowQRModal}
        qrAsset={qrAsset}
      />

      <AssetDetailPanel
        detailAsset={detailAsset}
        setDetailAsset={setDetailAsset}
        getWarrantyState={getWarrantyState}
        getAssignmentDuration={getAssignmentDuration}
        openEditAssetModal={openEditAssetModal}
        openStatusModal={openStatusModal}
        openAssignModal={openAssignModal}
        openReturnModal={openReturnModal}
        employees={employees}
      />

      <EditAssetModal
        showEditAssetModal={showEditAssetModal}
        setShowEditAssetModal={setShowEditAssetModal}
        editingAsset={editingAsset}
        editAssetForm={editAssetForm}
        setEditAssetForm={setEditAssetForm}
        handleSaveEditAsset={handleSaveEditAsset}
        saving={saving}
      />

      <StatusChangeModal
        showStatusModal={showStatusModal}
        setShowStatusModal={setShowStatusModal}
        statusAsset={statusAsset}
        statusForm={statusForm}
        setStatusForm={setStatusForm}
        handleSaveStatusChange={handleSaveStatusChange}
        saving={saving}
      />

      <DeleteAssetModal
        showDeleteAssetModal={showDeleteAssetModal}
        setShowDeleteAssetModal={setShowDeleteAssetModal}
        deletingAsset={deletingAsset}
        deleteConfirmText={deleteConfirmText}
        setDeleteConfirmText={setDeleteConfirmText}
        handleDeleteAsset={handleDeleteAsset}
        saving={saving}
      />

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

