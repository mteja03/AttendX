import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import PageLoader from '../components/PageLoader';
import ErrorModal from '../components/ErrorModal';
import { DOCUMENT_CHECKLIST, documentTypesToSections, sectionsToDocumentTypes } from '../utils/documentTypes';
import { withRetry } from '../utils/firestoreWithRetry';
import { ERROR_MESSAGES, getErrorMessage, logError } from '../utils/errorHandler';
import { trackPageView } from '../utils/analytics';

const FORMAT_OPTIONS = [
  { ext: '.pdf', label: 'PDF' },
  { ext: '.jpg', label: 'JPG' },
  { ext: '.jpeg', label: 'JPEG' },
  { ext: '.png', label: 'PNG' },
  { ext: '.doc', label: 'DOC' },
  { ext: '.docx', label: 'DOCX' },
  { ext: '.xls', label: 'XLS' },
  { ext: '.xlsx', label: 'XLSX' },
];

const SIZE_OPTIONS = [
  { value: 1, label: '1 MB' },
  { value: 2, label: '2 MB' },
  { value: 5, label: '5 MB' },
  { value: 10, label: '10 MB' },
  { value: 15, label: '15 MB' },
  { value: 20, label: '20 MB' },
  { value: 25, label: '25 MB' },
];

const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal'];
const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];
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
const DEFAULT_LEAVE_TYPE_OBJECTS = [
  { name: 'Casual Leave', shortCode: 'CL', isPaid: true },
  { name: 'Sick Leave', shortCode: 'SL', isPaid: true },
  { name: 'Earned Leave', shortCode: 'EL', isPaid: true },
  { name: 'Maternity Leave', shortCode: 'ML', isPaid: true },
  { name: 'Paternity Leave', shortCode: 'PL', isPaid: true },
  { name: 'Bereavement Leave', shortCode: 'BL', isPaid: true },
  { name: 'Compensatory Leave', shortCode: 'CO', isPaid: true },
  { name: 'Marriage Leave', shortCode: 'MAR', isPaid: true },
  { name: 'Study Leave', shortCode: 'STL', isPaid: false },
  { name: 'Unpaid Leave', shortCode: 'UL', isPaid: false },
];

function abbrevLeaveTypeName(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

function normalizeLeaveTypeObjects(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_LEAVE_TYPE_OBJECTS.map((t) => ({ ...t }));
  }
  return raw.map((t) => {
    if (typeof t === 'string') {
      const name = t.trim();
      return { name, shortCode: abbrevLeaveTypeName(name), isPaid: true };
    }
    const name = (t.name || '').trim() || 'Leave';
    const shortCode = (t.shortCode || abbrevLeaveTypeName(name)).toUpperCase().slice(0, 8);
    return { name, shortCode, isPaid: t.isPaid !== false };
  });
}

function buildLeaveAllowancesFromData(data, normalizedTypes) {
  const lp = data?.leavePolicy || {};
  const out = {};
  normalizedTypes.filter((lt) => lt.isPaid).forEach((lt) => {
    let n =
      lp[lt.shortCode] ??
      lp[lt.name] ??
      (lt.shortCode === 'CL' ? lp.cl : lt.shortCode === 'SL' ? lp.sl : lt.shortCode === 'EL' ? lp.el : undefined);
    if (n === undefined || Number.isNaN(Number(n))) n = lt.shortCode === 'EL' ? 15 : 12;
    out[lt.shortCode] = Number(n);
  });
  return out;
}

const DEFAULT_LOCATIONS = [];
const SECTIONS = [
  { key: 'departments', label: 'Department', plural: 'Departments', field: 'department', defaults: DEFAULT_DEPARTMENTS },
  { key: 'branches', label: 'Branch', plural: 'Branches', field: 'branch', defaults: DEFAULT_BRANCHES },
  {
    key: 'locations',
    label: 'Location',
    plural: 'Locations',
    field: 'location',
    defaults: DEFAULT_LOCATIONS,
    icon: '📍',
    placeholder: 'e.g. Mumbai Office, Delhi Branch, Work From Home',
    description: 'Office locations and work sites',
  },
  {
    key: 'benefits',
    label: 'Benefit',
    plural: 'Benefits',
    defaults: [],
    icon: '🏥',
    placeholder: 'e.g. Medical Insurance, Food Allowance, Gratuity...',
    description: 'Company benefit types for employee profiles',
  },
  { key: 'employmentTypes', label: 'Employment Type', plural: 'Employment Types', field: 'employmentType', defaults: DEFAULT_EMPLOYMENT_TYPES },
  { key: 'categories', label: 'Category', plural: 'Categories', field: 'category', defaults: DEFAULT_CATEGORIES },
  { key: 'qualifications', label: 'Qualification', plural: 'Qualifications', field: 'qualification', defaults: DEFAULT_QUALIFICATIONS },
];

const TABS = [
  { id: 'lists', label: 'Manage Lists', icon: '📋' },
  { id: 'leave', label: 'Leave', icon: '🏖️' },
  { id: 'documents', label: 'Document Types', icon: '📄' },
  { id: 'onboarding', label: 'Onboarding', icon: '🎯' },
  { id: 'offboarding', label: 'Offboarding', icon: '👋' },
];

const DEFAULT_ONBOARDING_TEMPLATE = {
  tasks: [
    { id: 'task_001', title: 'Send offer letter', description: '', category: 'Pre-joining', assignedTo: 'hr', daysFromJoining: -7, isRequired: true, order: 1 },
    { id: 'task_002', title: 'Send welcome email', description: 'Send welcome email with company handbook and first day details', category: 'Pre-joining', assignedTo: 'hr', daysFromJoining: -3, isRequired: true, order: 2 },
    { id: 'task_003', title: 'Collect documents list sent', description: '', category: 'Pre-joining', assignedTo: 'hr', daysFromJoining: -3, isRequired: true, order: 3 },
    { id: 'task_004', title: 'IT setup request raised (laptop/email/access)', description: '', category: 'Pre-joining', assignedTo: 'it', daysFromJoining: -2, isRequired: true, order: 4 },
    { id: 'task_005', title: 'Workspace/desk arranged', description: '', category: 'Pre-joining', assignedTo: 'admin', daysFromJoining: -1, isRequired: true, order: 5 },

    { id: 'task_006', title: 'ID card issued', description: '', category: 'Day 1', assignedTo: 'admin', daysFromJoining: 0, isRequired: true, order: 6 },
    { id: 'task_007', title: 'Office tour completed', description: '', category: 'Day 1', assignedTo: 'hr', daysFromJoining: 0, isRequired: false, order: 7 },
    { id: 'task_008', title: 'Introduction to team', description: '', category: 'Day 1', assignedTo: 'manager', daysFromJoining: 0, isRequired: true, order: 8 },
    { id: 'task_009', title: 'HR documentation completed (forms, policies signed)', description: '', category: 'Day 1', assignedTo: 'hr', daysFromJoining: 0, isRequired: true, order: 9 },
    { id: 'task_010', title: 'System access provided (email, tools)', description: '', category: 'Day 1', assignedTo: 'it', daysFromJoining: 0, isRequired: true, order: 10 },

    { id: 'task_011', title: 'Employee added to payroll', description: '', category: 'Week 1', assignedTo: 'admin', daysFromJoining: 3, isRequired: true, order: 11 },
    { id: 'task_012', title: 'PF/ESIC registration done', description: '', category: 'Week 1', assignedTo: 'admin', daysFromJoining: 3, isRequired: false, order: 12 },
    { id: 'task_013', title: 'Bank account details collected', description: '', category: 'Week 1', assignedTo: 'hr', daysFromJoining: 3, isRequired: true, order: 13 },
    { id: 'task_014', title: 'Emergency contact collected', description: '', category: 'Week 1', assignedTo: 'hr', daysFromJoining: 5, isRequired: true, order: 14 },
    { id: 'task_015', title: 'Reporting manager introduced', description: '', category: 'Week 1', assignedTo: 'manager', daysFromJoining: 1, isRequired: true, order: 15 },

    { id: 'task_016', title: '30-day check-in meeting done', description: '', category: 'Month 1', assignedTo: 'manager', daysFromJoining: 30, isRequired: true, order: 16 },
    { id: 'task_017', title: 'Access card issued', description: '', category: 'Month 1', assignedTo: 'admin', daysFromJoining: 7, isRequired: false, order: 17 },
    { id: 'task_018', title: 'Company policies acknowledged', description: '', category: 'Month 1', assignedTo: 'employee', daysFromJoining: 7, isRequired: true, order: 18 },
    { id: 'task_019', title: 'Probation goals set', description: '', category: 'Month 1', assignedTo: 'manager', daysFromJoining: 14, isRequired: true, order: 19 },
    { id: 'task_020', title: 'All documents collected and verified', description: '', category: 'Month 1', assignedTo: 'hr', daysFromJoining: 30, isRequired: true, order: 20 },
  ],
};

const DEFAULT_OFFBOARDING_TEMPLATE = {
  tasks: [
    { id: 'off_001', title: 'Resignation letter received', description: '', category: 'Resignation', assignedTo: 'hr', daysBefore: 30, isRequired: true, order: 1 },
    { id: 'off_002', title: 'Exit date confirmed with manager', description: '', category: 'Resignation', assignedTo: 'manager', daysBefore: 28, isRequired: true, order: 2 },
    { id: 'off_003', title: 'Handover plan created', description: '', category: 'Resignation', assignedTo: 'manager', daysBefore: 25, isRequired: true, order: 3 },
    { id: 'off_004', title: 'Notice Period terms confirmed', description: '', category: 'Resignation', assignedTo: 'hr', daysBefore: 28, isRequired: true, order: 4 },

    { id: 'off_005', title: 'Handover document prepared', description: '', category: 'Knowledge Transfer', assignedTo: 'employee', daysBefore: 14, isRequired: true, order: 5 },
    { id: 'off_006', title: 'Pending tasks documented', description: '', category: 'Knowledge Transfer', assignedTo: 'employee', daysBefore: 7, isRequired: true, order: 6 },
    { id: 'off_007', title: 'Knowledge transfer to team done', description: '', category: 'Knowledge Transfer', assignedTo: 'manager', daysBefore: 5, isRequired: true, order: 7 },
    { id: 'off_008', title: 'Passwords and credentials handed over', description: '', category: 'Knowledge Transfer', assignedTo: 'it', daysBefore: 1, isRequired: true, order: 8 },

    { id: 'off_009', title: 'Laptop returned', description: '', category: 'Asset Return', assignedTo: 'admin', daysBefore: 0, isRequired: true, order: 9 },
    { id: 'off_010', title: 'ID card returned', description: '', category: 'Asset Return', assignedTo: 'hr', daysBefore: 0, isRequired: true, order: 10 },
    { id: 'off_011', title: 'Access card returned', description: '', category: 'Asset Return', assignedTo: 'admin', daysBefore: 0, isRequired: true, order: 11 },
    { id: 'off_012', title: 'SIM card returned', description: '', category: 'Asset Return', assignedTo: 'admin', daysBefore: 0, isRequired: true, order: 12 },
    { id: 'off_013', title: 'Any other company assets returned', description: '', category: 'Asset Return', assignedTo: 'admin', daysBefore: 0, isRequired: true, order: 13 },

    { id: 'off_014', title: 'Email access revoked', description: '', category: 'IT & Access', assignedTo: 'it', daysBefore: 0, isRequired: true, order: 14 },
    { id: 'off_015', title: 'System access removed', description: '', category: 'IT & Access', assignedTo: 'it', daysBefore: 0, isRequired: true, order: 15 },
    { id: 'off_016', title: 'Added to alumni/ex-employee list', description: '', category: 'IT & Access', assignedTo: 'hr', daysBefore: 0, isRequired: false, order: 16 },

    { id: 'off_017', title: 'Final salary calculated', description: '', category: 'Finance & Legal', assignedTo: 'hr', daysBefore: -5, isRequired: true, order: 17 },
    { id: 'off_018', title: 'Full and final settlement processed', description: '', category: 'Finance & Legal', assignedTo: 'hr', daysBefore: -7, isRequired: true, order: 18 },
    { id: 'off_019', title: 'PF withdrawal form collected', description: '', category: 'Finance & Legal', assignedTo: 'hr', daysBefore: 0, isRequired: false, order: 19 },
    { id: 'off_020', title: 'Gratuity calculated (if applicable)', description: '', category: 'Finance & Legal', assignedTo: 'hr', daysBefore: -7, isRequired: false, order: 20 },
    { id: 'off_021', title: 'Form 16 issued', description: '', category: 'Finance & Legal', assignedTo: 'hr', daysBefore: -30, isRequired: true, order: 21 },

    { id: 'off_022', title: 'Experience letter issued', description: '', category: 'Documents', assignedTo: 'hr', daysBefore: 0, isRequired: true, order: 22 },
    { id: 'off_023', title: 'Relieving letter issued', description: '', category: 'Documents', assignedTo: 'hr', daysBefore: 0, isRequired: true, order: 23 },
    { id: 'off_024', title: 'NOC issued (if required)', description: '', category: 'Documents', assignedTo: 'hr', daysBefore: 0, isRequired: false, order: 24 },

    { id: 'off_025', title: 'Exit interview conducted', description: '', category: 'Exit Interview', assignedTo: 'hr', daysBefore: 2, isRequired: false, order: 25 },
    { id: 'off_026', title: 'Exit feedback form filled', description: '', category: 'Exit Interview', assignedTo: 'employee', daysBefore: 2, isRequired: false, order: 26 },
  ],
};

export default function Settings() {
  const { companyId } = useParams();
  const { currentUser, signOut } = useAuth();
  const { success, error: showError } = useToast();
  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [assets, setAssets] = useState([]);
  const [companyLeaves, setCompanyLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveAllowances, setLeaveAllowances] = useState({ CL: 12, SL: 12, EL: 15 });
  const [newLeaveTypeName, setNewLeaveTypeName] = useState('');
  const [newLeaveTypeCode, setNewLeaveTypeCode] = useState('');
  const [newLeaveTypePaid, setNewLeaveTypePaid] = useState(true);
  const [addingSection, setAddingSection] = useState(null);
  const [addValue, setAddValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [tab, setTab] = useState('lists');
  const [newAssetType, setNewAssetType] = useState('');
  const [newAssetMode, setNewAssetMode] = useState('trackable');
  const [docSections, setDocSections] = useState([]);
  const [editingSectionName, setEditingSectionName] = useState({});
  const [docTypesLoading, setDocTypesLoading] = useState(false);
  const [newDocNames, setNewDocNames] = useState({});
  const [templateTasks, setTemplateTasks] = useState([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [offTemplateTasks, setOffTemplateTasks] = useState([]);
  const [offTemplateLoading, setOffTemplateLoading] = useState(false);
  const [savingOffTemplate, setSavingOffTemplate] = useState(false);
  const [showOffCategoryPicker, setShowOffCategoryPicker] = useState(false);
  const [policiesForOnboarding, setPoliciesForOnboarding] = useState([]);
  const [errorModal, setErrorModal] = useState(null);
  const activeTab = tab;

  useEffect(() => {
    trackPageView('Settings');
  }, []);

  const handleSmartError = async (error, context, fallback = 'Failed to save. Please try again.') => {
    await logError(error, { companyId, ...context });
    const errType = getErrorMessage(error);
    if (error?._needsReauth || errType === 'auth_expired') {
      setErrorModal('auth_expired');
      return;
    }
    if (errType === 'network_error') {
      setErrorModal('network_error');
      return;
    }
    showError(ERROR_MESSAGES[errType]?.message || fallback);
  };

  useEffect(() => {
    if (!companyId) return;
    const stored = localStorage.getItem(`settings_tab_${companyId}`);
    if (!stored) return;
    if (stored === 'company' || stored === 'danger') {
      setTab('lists');
      localStorage.setItem(`settings_tab_${companyId}`, 'lists');
      return;
    }
    if (TABS.some((t) => t.id === stored)) setTab(stored);
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      localStorage.setItem(`settings_tab_${companyId}`, tab);
    }
  }, [tab, companyId]);

  useEffect(() => {
    const handleClick = () => setShowOffCategoryPicker(false);
    if (showOffCategoryPicker) document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showOffCategoryPicker]);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [companySnap, empSnap, assetSnap, leaveSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId)),
          getDocs(collection(db, 'companies', companyId, 'employees')),
          getDocs(collection(db, 'companies', companyId, 'assets')),
          getDocs(collection(db, 'companies', companyId, 'leave')),
        ]);
        if (companySnap.exists()) {
          const data = companySnap.data();
          setCompany({ id: companySnap.id, ...data });
        }
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAssets(assetSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCompanyLeaves(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        showError('Failed to load settings');
      }
      setLoading(false);
    };
    load();
  }, [companyId, showError]);

  // Load document types when Documents tab is active
  useEffect(() => {
    if (!companyId || tab !== 'documents') return;
    const fetchDocTypes = async () => {
      setDocTypesLoading(true);
      try {
        const settingsSnap = await getDoc(doc(db, 'companies', companyId, 'settings', 'documentTypes'));
        if (settingsSnap.exists() && Array.isArray(settingsSnap.data()?.sections) && settingsSnap.data().sections.length > 0) {
          setDocSections(settingsSnap.data().sections);
        } else {
          const companyDoc = await getDoc(doc(db, 'companies', companyId));
          const data = companyDoc.data();
          const legacy =
            data?.documentTypes && Array.isArray(data.documentTypes) && data.documentTypes.length > 0
              ? data.documentTypes
              : DOCUMENT_CHECKLIST;
          setDocSections(documentTypesToSections(legacy));
        }
      } catch {
        showError('Failed to load document types');
        setDocSections(documentTypesToSections(DOCUMENT_CHECKLIST));
      }
      setDocTypesLoading(false);
    };
    fetchDocTypes();
  }, [tab, companyId, showError]);

  useEffect(() => {
    if (!companyId || activeTab !== 'onboarding') return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'policies'));
        setPoliciesForOnboarding(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        setPoliciesForOnboarding([]);
      }
    })();
  }, [companyId, activeTab]);

  useEffect(() => {
    if (activeTab !== 'onboarding') return;

    const loadTemplate = async () => {
      try {
        setTemplateLoading(true);

        if (!companyId || !db) {
          setTemplateTasks(DEFAULT_ONBOARDING_TEMPLATE.tasks);
          return;
        }

        const templateRef = doc(db, 'companies', companyId, 'settings', 'onboardingTemplate');
        const templateDoc = await getDoc(templateRef);

        if (templateDoc.exists() && templateDoc.data()?.tasks?.length > 0) {
          setTemplateTasks(templateDoc.data().tasks);
        } else {
          setTemplateTasks(DEFAULT_ONBOARDING_TEMPLATE.tasks);
        }
      } catch (error) {
        setTemplateTasks(DEFAULT_ONBOARDING_TEMPLATE.tasks);
        showError(`Failed to load template: ${error.message}`);
      } finally {
        setTemplateLoading(false);
      }
    };

    loadTemplate();
  }, [activeTab, companyId, showError]);

  useEffect(() => {
    if (activeTab !== 'offboarding') return;

    const loadTemplate = async () => {
      try {
        setOffTemplateLoading(true);
        if (!companyId || !db) {
          setOffTemplateTasks(DEFAULT_OFFBOARDING_TEMPLATE.tasks);
          return;
        }
        const templateRef = doc(db, 'companies', companyId, 'settings', 'offboardingTemplate');
        const templateDoc = await getDoc(templateRef);
        if (templateDoc.exists() && templateDoc.data()?.tasks?.length > 0) {
          setOffTemplateTasks(templateDoc.data().tasks);
        } else {
          setOffTemplateTasks(DEFAULT_OFFBOARDING_TEMPLATE.tasks);
        }
      } catch (error) {
        setOffTemplateTasks(DEFAULT_OFFBOARDING_TEMPLATE.tasks);
        showError(`Failed to load offboarding template: ${error.message}`);
      } finally {
        setOffTemplateLoading(false);
      }
    };

    loadTemplate();
  }, [activeTab, companyId, showError]);

  const getList = (key, defaults) => (company?.[key]?.length ? company[key] : defaults);
  const getCount = (field) => (value) => employees.filter((e) => (e[field] || '').trim() === value).length;

  const countLeaveUsesForLt = (lt) =>
    companyLeaves.filter((l) => {
      const t = (l.leaveType || '').trim();
      if (t === lt.name || t === lt.shortCode) return true;
      if (lt.shortCode === 'CL' && t === 'CL') return true;
      if (lt.shortCode === 'SL' && t === 'SL') return true;
      if (lt.shortCode === 'EL' && t === 'EL') return true;
      return false;
    }).length;

  useEffect(() => {
    if (activeTab !== 'leave' || !companyId) return;
    const loadLeaveTypes = async () => {
      try {
        const snap = await getDoc(doc(db, 'companies', companyId));
        const data = snap.exists() ? snap.data() : {};
        const normalized = normalizeLeaveTypeObjects(data?.leaveTypes);
        setLeaveTypes(normalized);
        setLeaveAllowances(buildLeaveAllowancesFromData(data, normalized));
      } catch {
        showError('Failed to load leave settings');
      }
    };
    loadLeaveTypes();
  }, [activeTab, companyId, showError]);

  const handleAddLeaveType = () => {
    if (!newLeaveTypeName.trim()) {
      showError('Enter leave type name');
      return;
    }
    if (!newLeaveTypeCode.trim()) {
      showError('Enter short code');
      return;
    }
    const shortCode = newLeaveTypeCode.trim().toUpperCase().substring(0, 3);
    const dupName = leaveTypes.some((x) => x.name.toLowerCase() === newLeaveTypeName.trim().toLowerCase());
    if (dupName) {
      showError('A leave type with this name already exists');
      return;
    }
    const isDuplicateCode = leaveTypes.some((lt) => lt.shortCode?.toUpperCase() === shortCode);
    if (isDuplicateCode) {
      showError(`Short code "${shortCode}" already exists. Use a different code.`);
      return;
    }
    const newType = {
      name: newLeaveTypeName.trim(),
      shortCode,
      isPaid: newLeaveTypePaid,
    };
    setLeaveTypes((prev) => [...prev, newType]);
    if (newType.isPaid) {
      setLeaveAllowances((prev) => ({ ...prev, [shortCode]: prev[shortCode] ?? 12 }));
    }
    setNewLeaveTypeName('');
    setNewLeaveTypeCode('');
    setNewLeaveTypePaid(true);
  };

  const handleDeleteLeaveType = (index) => {
    const lt = leaveTypes[index];
    if (!lt) return;
    if (countLeaveUsesForLt(lt) > 0) {
      showError('Cannot remove: used in leave records');
      return;
    }
    setLeaveTypes((prev) => prev.filter((_, i) => i !== index));
    setLeaveAllowances((prev) => {
      const next = { ...prev };
      delete next[lt.shortCode];
      return next;
    });
  };

  const handleSaveLeavePolicy = async () => {
    setSaving(true);
    try {
      await withRetry(() => updateDoc(doc(db, 'companies', companyId), {
        leaveTypes,
        leavePolicy: leaveAllowances,
      }), { companyId, action: 'saveLeavePolicy' });
      setCompany((prev) => (prev ? { ...prev, leaveTypes, leavePolicy: leaveAllowances } : null));
      success('Leave policy saved successfully!');
    } catch (error) {
      await handleSmartError(error, { action: 'saveLeavePolicy' }, 'Failed to save leave policy');
    }
    setSaving(false);
  };

  const duplicateShortCodes = useMemo(() => {
    const codes = leaveTypes.map((l) => l.shortCode?.toUpperCase());
    return codes.filter((code, index) => code && codes.indexOf(code) !== index);
  }, [leaveTypes]);

  const normalizedAssetTypes = useMemo(() => {
    const raw = company?.assetTypes;
    if (!Array.isArray(raw)) return DEFAULT_ASSET_TYPES;
    if (raw.length === 0) return [];
    if (typeof raw[0] === 'string') {
      return raw.map((name) => {
        const defaultMode = DEFAULT_ASSET_TYPES.find((t) => t.name === name)?.mode || 'trackable';
        return { name, mode: defaultMode };
      });
    }
    return raw
      .map((t) => ({
        name: t?.name || '',
        mode: t?.mode || 'trackable',
      }))
      .filter((t) => t.name);
  }, [company]);

  const countEmployeesUsingAssetType = (typeName) => {
    const type = (typeName || '').trim();
    const trackableSet = new Set(
      assets
        .filter((a) => (a.mode || 'trackable') === 'trackable' && a.type === type && a.status === 'Assigned')
        .map((a) => a.assignedToId)
        .filter(Boolean),
    );

    const consumableSet = new Set(
      assets
        .filter((a) => (a.mode || 'trackable') === 'consumable' && a.type === type)
        .flatMap((a) => (a.assignments || []).filter((as) => !as.returned).map((as) => as.employeeId))
        .filter(Boolean),
    );

    return trackableSet.size + consumableSet.size;
  };

  const saveAssetTypes = async (next) => {
    await withRetry(
      () => updateDoc(doc(db, 'companies', companyId), { assetTypes: next }),
      { companyId, action: 'saveAssetTypes' },
    );
    setCompany((prev) => (prev ? { ...prev, assetTypes: next } : prev));
  };

  const handleAdd = async (sectionKey, defaults) => {
    const name = addValue.trim();
    if (!name) return;
    const list = getList(sectionKey, defaults);
    if (list.includes(name)) {
      showError('Already exists');
      return;
    }
    setSaving(true);
    try {
      const next = [...list, name];
      await withRetry(
        () => updateDoc(doc(db, 'companies', companyId), { [sectionKey]: next }),
        { companyId, action: 'addListItem', section: sectionKey },
      );
      setCompany((prev) => (prev ? { ...prev, [sectionKey]: next } : null));
      setAddValue('');
      setAddingSection(null);
      const section = SECTIONS.find((s) => s.key === sectionKey);
      success(section ? `${section.label} added` : 'Added');
    } catch (error) {
      await handleSmartError(error, { action: 'addListItem', section: sectionKey, value: name }, 'Failed to add');
    }
    setSaving(false);
  };

  const handleRemove = async (sectionKey, name, defaults) => {
    const section = SECTIONS.find((s) => s.key === sectionKey);
    const count =
      sectionKey === 'benefits'
        ? employees.filter((e) => (e.customBenefits || []).some((b) => (b?.name || '').trim() === name)).length
        : getCount(section.field)(name);
    if (count > 0) return;
    try {
      const list = getList(sectionKey, defaults);
      const next = list.filter((x) => x !== name);
      await withRetry(
        () => updateDoc(doc(db, 'companies', companyId), { [sectionKey]: next }),
        { companyId, action: 'removeListItem', section: sectionKey },
      );
      setCompany((prev) => (prev ? { ...prev, [sectionKey]: next } : null));
      setDeleteConfirm(null);
      success(section ? `${section.label} removed` : 'Removed');
    } catch (error) {
      await handleSmartError(error, { action: 'removeListItem', section: sectionKey, value: name }, 'Failed to remove');
    }
  };

  const addDocType = (sectionId) => {
    const name = (newDocNames[sectionId] || '').trim();
    if (!name) return;
    const id = `${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    setDocSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              types: [
                ...(s.types || []),
                {
                  id,
                  name,
                  mandatory: false,
                  accepts: ['.pdf', '.jpg', '.jpeg', '.png'],
                  maxSizeMB: 5,
                },
              ],
            }
          : s,
      ),
    );
    setNewDocNames((prev) => ({ ...prev, [sectionId]: '' }));
  };

  const toggleFormat = (sectionId, docId, ext) => {
    setDocSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          types: (s.types || []).map((d) => {
            if (d.id !== docId) return d;
            const current = Array.isArray(d.accepts) ? d.accepts : ['.pdf', '.jpg', '.jpeg', '.png'];
            const has = current.includes(ext);
            if (has && current.length === 1) return d;
            return {
              ...d,
              accepts: has ? current.filter((e) => e !== ext) : [...current, ext],
            };
          }),
        };
      }),
    );
  };

  const updateMaxSize = (sectionId, docId, sizeMB) => {
    setDocSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          types: (s.types || []).map((d) => (d.id === docId ? { ...d, maxSizeMB: sizeMB } : d)),
        };
      }),
    );
  };

  const toggleMandatory = (sectionId, docId) => {
    setDocSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          types: (s.types || []).map((d) => (d.id === docId ? { ...d, mandatory: !d.mandatory } : d)),
        };
      }),
    );
  };

  const removeDocType = (sectionId, docId) => {
    setDocSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          types: (s.types || []).filter((d) => d.id !== docId),
        };
      }),
    );
  };

  const saveDocSections = async (sectionsArg) => {
    const sections = sectionsArg ?? docSections;
    if (!companyId || !sections?.length) return;
    setSaving(true);
    try {
      const legacy = sectionsToDocumentTypes(sections);
      await withRetry(
        () => setDoc(doc(db, 'companies', companyId, 'settings', 'documentTypes'), { sections }),
        { companyId, action: 'saveDocumentTypes' },
      );
      await withRetry(
        () => updateDoc(doc(db, 'companies', companyId), { documentTypes: legacy }),
        { companyId, action: 'saveDocumentTypesLegacy' },
      );
      setCompany((prev) => (prev ? { ...prev, documentTypes: legacy } : null));
      success('Document types saved successfully');
    } catch (err) {
      await handleSmartError(err, { action: 'saveDocumentTypes' }, `Failed to save: ${err?.message || 'Unknown error'}`);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-8">
        <PageLoader />
      </div>
    );
  }

  const renderListsTab = () => {
    const getItems = (key, defaults) => getList(key, defaults);

    const cards = SECTIONS.map((section) => {
      const items = getItems(section.key, section.defaults);
      const countFn =
        section.key === 'benefits'
          ? (value) =>
              employees.filter((e) => (e.customBenefits || []).some((b) => (b?.name || '').trim() === value)).length
          : getCount(section.field);
      const [newVal, setNewVal] = [
        addValue && addingSection === section.key ? addValue : '',
        (val) => {
          setAddingSection(section.key);
          setAddValue(val);
        },
      ];
      return { section, items, countFn, newVal, setNewVal };
    });

    const left = cards.filter((c) =>
      ['departments', 'branches', 'locations', 'employmentTypes', 'benefits'].includes(c.section.key),
    );
    const right = cards.filter((c) => ['categories', 'qualifications'].includes(c.section.key));

    const handleToggleAssetTypeMode = async (typeName) => {
      const current = normalizedAssetTypes.find((t) => t.name === typeName);
      if (!current) return;
      const nextMode = current.mode === 'trackable' ? 'consumable' : 'trackable';
      const next = normalizedAssetTypes.map((t) => (t.name === typeName ? { ...t, mode: nextMode } : t));
      try {
        await saveAssetTypes(next);
        success('Asset type updated');
      } catch {
        showError('Failed to update asset type');
      }
    };

    const handleDeleteAssetType = async (typeName) => {
      const usage = assets.filter((a) => (a.type || '').trim() === typeName).length;
      if (usage > 0) {
        showError('This asset type is used by existing assets');
        return;
      }
      const next = normalizedAssetTypes.filter((t) => t.name !== typeName);
      try {
        await saveAssetTypes(next);
        success('Asset type deleted');
      } catch {
        showError('Failed to delete asset type');
      }
    };

    const handleAddAssetType = async () => {
      const name = newAssetType.trim();
      if (!name) return;
      const exists = normalizedAssetTypes.some((t) => t.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        showError('Asset type already exists');
        return;
      }
      const next = [...normalizedAssetTypes, { name, mode: newAssetMode }];
      try {
        await saveAssetTypes(next);
        setNewAssetType('');
        setNewAssetMode('trackable');
        success('Asset type added');
      } catch {
        showError('Failed to add asset type');
      }
    };

    const renderAssetTypesCard = () => (
      <div className="bg-white border rounded-xl p-4">
        <div className="flex justify-between mb-3">
          <h3 className="font-medium text-sm">Asset Types</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {normalizedAssetTypes.length} types
          </span>
        </div>

        <div className="flex gap-3 mb-3 p-2 bg-gray-50 rounded-lg">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            🔵 <span>Trackable — unique items with individual IDs</span>
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-1 ml-3">
            🟢 <span>Consumable — stock quantity issued to multiple employees</span>
          </span>
        </div>

        <div className="max-h-48 overflow-y-auto space-y-1 mb-3 pr-1 settings-list">
          {normalizedAssetTypes.map((t) => {
            const usedByAssets = assets.filter((a) => (a.type || '').trim() === t.name).length;
            const empCount = countEmployeesUsingAssetType(t.name);
            return (
              <div key={t.name} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 mr-1">
                <span className="flex-1 text-sm truncate mr-2">
                  {t.name}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleAssetTypeMode(t.name)}
                    className={`text-xs px-3 py-1.5 rounded border font-medium ${
                      t.mode === 'trackable'
                        ? 'bg-[#E8F5F5] text-[#1B6B6B] border-[#C5E8E8]'
                        : 'bg-green-50 text-green-600 border-green-200'
                    }`}
                  >
                    {t.mode === 'trackable' ? 'Trackable' : 'Consumable'}
                  </button>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{empCount} emp</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteAssetType(t.name)}
                    className="w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded text-xs flex-shrink-0 disabled:opacity-50"
                    disabled={usedByAssets > 0}
                    title={usedByAssets > 0 ? 'Delete disabled: assets exist for this type' : 'Delete asset type'}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-3 pt-3 border-t">
          <input
            placeholder="Asset type name..."
            value={newAssetType}
            onChange={(e) => setNewAssetType(e.target.value)}
            className="flex-1 text-sm border rounded px-2 py-1.5"
          />
          <button
            type="button"
            onClick={() => setNewAssetMode(newAssetMode === 'trackable' ? 'consumable' : 'trackable')}
            className={`text-xs px-3 py-1.5 rounded border font-medium ${
              newAssetMode === 'trackable'
                ? 'bg-[#E8F5F5] text-[#1B6B6B] border-[#C5E8E8]'
                : 'bg-green-50 text-green-600 border-green-200'
            }`}
          >
            {newAssetMode === 'trackable' ? 'Trackable' : 'Consumable'}
          </button>
          <button
            type="button"
            onClick={handleAddAssetType}
            className="text-sm bg-[#1B6B6B] text-white px-3 py-1.5 rounded hover:bg-[#155858]"
          >
            Add
          </button>
        </div>
      </div>
    );

    const renderCard = ({ section, items, countFn }) => (
      <div key={section.key} className="bg-white border rounded-xl p-4">
        <div className="flex justify-between mb-3">
          <div>
            <h3 className="font-medium text-sm flex items-center gap-2">
              {section.icon && <span aria-hidden>{section.icon}</span>}
              {section.plural}
            </h3>
            {section.description && <p className="text-xs text-gray-400 mt-0.5">{section.description}</p>}
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {items.length} items
          </span>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1 mb-3 pr-1 settings-list">
          {items.map((item) => (
            <div
              key={item}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 mr-1"
            >
              <span className="flex-1 text-sm truncate mr-2">
                {item}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {countFn(item)} emp
                </span>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm({ section: section.key, name: item, defaults: section.defaults })}
                  className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded text-xs flex-shrink-0"
                  disabled={countFn(item) > 0}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-xs text-slate-400">No items yet</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={addingSection === section.key ? addValue : ''}
            onChange={(e) => {
              setAddingSection(section.key);
              setAddValue(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd(section.key, section.defaults);
            }}
            placeholder={section.placeholder || 'Add new...'}
            className="flex-1 text-sm border rounded px-2 py-1"
          />
          <button
            type="button"
            onClick={() => handleAdd(section.key, section.defaults)}
            className="text-sm bg-[#1B6B6B] text-white px-3 py-1 rounded hover:bg-[#155858] disabled:opacity-50"
            disabled={saving || (addingSection === section.key && !addValue.trim())}
          >
            Add
          </button>
        </div>
      </div>
    );

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          {left.map(renderCard)}
        </div>
        <div className="space-y-4">
          {right.map(renderCard)}
          {renderAssetTypesCard()}
        </div>
      </div>
    );
  };

  const renderLeaveTab = () => (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium text-gray-800">Leave Types</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              These types appear in Add Leave form and leave balance tracking
            </p>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {leaveTypes.length} types
          </span>
        </div>

        <div className="space-y-1 mb-3 max-h-60 overflow-y-auto">
          {leaveTypes.map((lt, index) => {
            const codeUpper = lt.shortCode?.toUpperCase();
            const isDup = codeUpper && duplicateShortCodes.includes(codeUpper);
            return (
              <div
                key={`${lt.shortCode}-${index}`}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg border ${
                  isDup ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-sm font-medium text-gray-800 truncate">{lt.name}</span>
                  {lt.shortCode && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                        isDup ? 'bg-amber-200 text-amber-800' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {lt.shortCode}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{lt.isPaid !== false ? 'Paid' : 'Unpaid'}</span>
                  {isDup && (
                    <span className="text-xs text-amber-600 font-medium">⚠ Duplicate code</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteLeaveType(index)}
                  className="text-gray-300 hover:text-red-400 text-sm p-0.5 rounded"
                >
                  ✕
                </button>
              </div>
            );
          })}

          {leaveTypes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No leave types added yet</p>
          )}
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-gray-500 mb-2">Add new leave type</p>
          <div className="flex gap-2 flex-wrap">
            <input
              placeholder="Leave type name"
              value={newLeaveTypeName}
              onChange={(e) => setNewLeaveTypeName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddLeaveType()}
              className="flex-1 min-w-32 text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#4ECDC4]"
            />
            <div className="flex flex-col">
              <input
                placeholder="e.g. CL"
                value={newLeaveTypeCode}
                onChange={(e) =>
                  setNewLeaveTypeCode(e.target.value.toUpperCase().substring(0, 3))
                }
                maxLength={3}
                className="w-20 border rounded-lg px-2 py-2 text-sm text-center font-mono font-bold uppercase focus:outline-none focus:border-[#1B6B6B]"
              />
              <p className="text-xs text-gray-400 mt-1">2–3 uppercase letters</p>
            </div>
            <select
              value={newLeaveTypePaid ? 'true' : 'false'}
              onChange={(e) => setNewLeaveTypePaid(e.target.value === 'true')}
              className="text-sm border rounded-lg px-3 py-1.5"
            >
              <option value="true">Paid</option>
              <option value="false">Unpaid</option>
            </select>
            <button
              type="button"
              onClick={handleAddLeaveType}
              className="px-4 py-1.5 bg-[#1B6B6B] text-white rounded-lg text-sm hover:bg-[#155858]"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-medium text-gray-800">Leave Allowance</h3>
            <p className="text-xs text-gray-400 mt-0.5">Annual days allowed per leave type</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4 sm:grid-cols-3">
          {leaveTypes.map((lt, index) => (
            <div key={`${lt.shortCode}-allow-${index}`}>
              <label className="text-xs text-gray-500 block mb-1">
                {lt.name}{' '}
                <span className="text-gray-300 font-mono">({lt.shortCode})</span>
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={leaveAllowances[lt.shortCode] ?? leaveAllowances[lt.name] ?? ''}
                onChange={(e) =>
                  setLeaveAllowances((prev) => ({
                    ...prev,
                    [lt.shortCode]: Number(e.target.value),
                  }))
                }
                className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                placeholder="Days per year"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSaveLeavePolicy}
          disabled={saving}
          className="px-4 py-2 bg-[#1B6B6B] text-white rounded-lg text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
        >
          Save Leave Policy
        </button>
      </div>
    </div>
  );

  const renderDocumentsTab = () => (
    <div className="space-y-4">
      {docTypesLoading && <PageLoader />}
      {!docTypesLoading &&
        docSections.map((section) => (
          <div key={section.id} className="bg-white border rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              {editingSectionName[section.id] ? (
                <input
                  autoFocus
                  value={section.name}
                  onChange={(e) => {
                    setDocSections((prev) =>
                      prev.map((s) => (s.id === section.id ? { ...s, name: e.target.value } : s)),
                    );
                  }}
                  onBlur={() => {
                    setEditingSectionName((prev) => ({ ...prev, [section.id]: false }));
                    saveDocSections();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setEditingSectionName((prev) => ({ ...prev, [section.id]: false }));
                      saveDocSections();
                    }
                  }}
                  className="text-base font-semibold border-b-2 border-[#1B6B6B] outline-none bg-transparent text-gray-800 min-w-0 flex-1"
                />
              ) : (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingSectionName((prev) => ({
                        ...prev,
                        [section.id]: true,
                      }))
                    }
                    className="text-base font-semibold text-gray-800 hover:text-[#1B6B6B] flex items-center gap-2 group text-left"
                  >
                    {section.name}
                    <span className="text-gray-300 group-hover:text-[#1B6B6B] text-xs opacity-0 group-hover:opacity-100">
                      ✏️
                    </span>
                  </button>
                  {(section.types || []).length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDocSections((prev) => {
                          const next = prev.filter((s) => s.id !== section.id);
                          saveDocSections(next);
                          return next;
                        });
                      }}
                      className="text-xs text-red-400 hover:text-red-600 ml-2 flex-shrink-0"
                    >
                      Remove section
                    </button>
                  )}
                </div>
              )}
              <span className="text-xs text-gray-400 flex-shrink-0">{(section.types || []).length} document types</span>
            </div>
            {(section.types || []).map((docItem) => (
              <div key={docItem.id} className="py-3 border-b last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-800">{docItem.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMandatory(section.id, docItem.id)}
                      className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                        docItem.mandatory
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      {docItem.mandatory ? 'Mandatory' : 'Optional'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeDocType(section.id, docItem.id)}
                      className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded text-sm"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="mb-2">
                  <span className="text-xs text-gray-400 block mb-1">Accepted formats</span>
                  <div className="flex flex-wrap gap-1">
                    {FORMAT_OPTIONS.map((fmt) => (
                      <button
                        key={fmt.ext}
                        type="button"
                        onClick={() => toggleFormat(section.id, docItem.id, fmt.ext)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          (Array.isArray(docItem.accepts) ? docItem.accepts : [])
                            .includes(fmt.ext)
                            ? 'bg-[#1B6B6B] text-white border-[#1B6B6B]'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Max file size</span>
                  <div className="flex gap-1 flex-wrap">
                    {SIZE_OPTIONS.map((size) => (
                      <button
                        key={size.value}
                        type="button"
                        onClick={() => updateMaxSize(section.id, docItem.id, size.value)}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          (docItem.maxSizeMB || 5) === size.value
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
                        }`}
                      >
                        {size.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <div className="flex gap-2 mt-3 pt-3 border-t">
              <input
                value={newDocNames[section.id] || ''}
                onChange={(e) =>
                  setNewDocNames((prev) => ({
                    ...prev,
                    [section.id]: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addDocType(section.id);
                }}
                placeholder="Add document type..."
                className="flex-1 text-sm border rounded px-2 py-1.5 focus:outline-none focus:border-[#4ECDC4]"
              />
              <button
                type="button"
                onClick={() => addDocType(section.id)}
                className="text-sm bg-[#1B6B6B] text-white px-3 py-1.5 rounded hover:bg-[#155858]"
              >
                Add
              </button>
            </div>
          </div>
        ))}
      {!docTypesLoading && docSections.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const newSection = {
              id: `section_${Date.now()}`,
              name: 'Additional Documents',
              order: docSections.length + 1,
              types: [],
              mandatory: false,
            };
            const next = [...docSections, newSection];
            setDocSections(next);
            setTimeout(() => {
              setEditingSectionName((prev) => ({ ...prev, [newSection.id]: true }));
              saveDocSections(next);
            }, 100);
          }}
          className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors mt-4"
        >
          + Add New Section
        </button>
      )}
      {!docTypesLoading && docSections.length > 0 && (
        <button
          type="button"
          onClick={() => saveDocSections()}
          disabled={saving}
          className="w-full bg-[#1B6B6B] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#155858] disabled:opacity-50 mt-2"
        >
          Save Document Types
        </button>
      )}
    </div>
  );

  const renderOnboardingTab = () => {
    const tasks = templateTasks || [];
    const categories = ['Pre-joining', 'Day 1', 'Week 1', 'Month 1'];
    const assignedToOptions = ['hr', 'manager', 'it', 'admin', 'employee'];

    const updateTask = (taskId, field, value) => {
      setTemplateTasks((prev) =>
        (prev || []).map((t) => (t.id === taskId ? { ...t, [field]: value } : t)),
      );
    };

    const taskSuggestsPolicyLink = (title, description) => {
      const s = `${title || ''} ${description || ''}`.toLowerCase();
      return /policy|handbook|acknowledge|read/.test(s);
    };

    const handleAddTask = (category = 'Day 1') => {
      const newTask = {
        id: `task_${Date.now()}`,
        title: '',
        description: '',
        category: category || 'Day 1',
        assignedTo: 'hr',
        daysFromJoining: 0,
        isRequired: false,
        order: (templateTasks?.length || 0) + 1,
        linkedPolicyId: '',
      };
      setTemplateTasks((prev) => [...(prev || []), newTask]);
    };

    const removeTask = (taskId) => {
      setTemplateTasks((prev) => (prev || []).filter((t) => t.id !== taskId));
    };

    const handleSaveTemplate = async () => {
      try {
        if (!companyId) {
          showError('Company ID not found');
          return;
        }

        if (!templateTasks || templateTasks.length === 0) {
          showError('No tasks to save. Add tasks first.');
          return;
        }

        setSavingTemplate(true);

        const cleanTasks = templateTasks.map((t, index) => ({
          id: t.id || `task_${Date.now()}_${index}`,
          title: t.title || 'Untitled task',
          description: t.description || '',
          category: t.category || 'Day 1',
          assignedTo: t.assignedTo || 'hr',
          daysFromJoining: Number(t.daysFromJoining) || 0,
          isRequired: Boolean(t.isRequired),
          order: Number(t.order) || index,
          linkedPolicyId: t.linkedPolicyId || '',
        }));

        const templateRef = doc(db, 'companies', companyId, 'settings', 'onboardingTemplate');
        await withRetry(() => setDoc(templateRef, {
          tasks: cleanTasks,
          updatedAt: new Date(),
          updatedBy: currentUser?.email || 'admin',
        }), { companyId, action: 'saveOnboardingTemplate' });

        success(`${cleanTasks.length} tasks saved successfully!`);
      } catch (error) {
        await handleSmartError(error, { action: 'saveOnboardingTemplate' }, `Save failed: ${error.message}`);
      } finally {
        setSavingTemplate(false);
      }
    };

    const grouped = categories.map((cat) => ({
      category: cat,
      tasks: tasks
        .filter((t) => (t.category || 'Day 1') === cat)
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    }));

    return (
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Onboarding Checklist</h2>
            <p className="text-sm text-slate-500 mt-1">Customize the checklist template used for new employees.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const newTask = {
                  id: `task_${Date.now()}`,
                  title: '',
                  description: '',
                  category: 'Day 1',
                  assignedTo: 'hr',
                  daysFromJoining: 0,
                  isRequired: false,
                  order: (templateTasks?.length || 0) + 1,
                  linkedPolicyId: '',
                };
                setTemplateTasks((prev) => [...(Array.isArray(prev) ? prev : []), newTask]);
                setTimeout(() => {
                  window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: 'smooth',
                  });
                }, 100);
              }}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              + Add task
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="rounded-lg bg-[#1B6B6B] text-white text-sm font-medium px-4 py-2 hover:bg-[#155858] disabled:opacity-50"
              disabled={savingTemplate || templateLoading}
            >
              {savingTemplate ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>

        {templateLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.category}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">{g.category}</h3>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {g.tasks.length} tasks
                  </span>
                </div>

                {g.tasks.length === 0 ? (
                  <p className="text-xs text-slate-400">No tasks in this category.</p>
                ) : (
                  <div className="space-y-3">
                    {g.tasks.map((t) => (
                      <div key={t.id} className="border border-slate-200 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                            <input
                              value={t.title || ''}
                              onChange={(e) => updateTask(t.id, 'title', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              placeholder="Task title"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeTask(t.id)}
                            className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>

                        <div className="mt-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                          <textarea
                            value={t.description || ''}
                            onChange={(e) => updateTask(t.id, 'description', e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            placeholder="Optional description"
                          />
                        </div>

                        {policiesForOnboarding.length > 0 && (
                          <div className="mt-1.5">
                            {taskSuggestsPolicyLink(t.title, t.description) && (
                              <p className="text-xs text-[#1B6B6B] mb-1.5 bg-[#E8F5F5] rounded-lg px-2 py-1.5">
                                Link to a policy in Library?
                              </p>
                            )}
                            <select
                              value={t.linkedPolicyId || ''}
                              onChange={(e) => updateTask(t.id, 'linkedPolicyId', e.target.value)}
                              className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 text-gray-600 bg-white"
                            >
                              <option value="">No linked policy</option>
                              {policiesForOnboarding.map((p) => (
                                <option key={p.id} value={p.id}>
                                  📋 {p.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                            <select
                              value={t.category || 'Day 1'}
                              onChange={(e) => updateTask(t.id, 'category', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            >
                              {categories.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Assigned to</label>
                            <select
                              value={t.assignedTo || 'hr'}
                              onChange={(e) => updateTask(t.id, 'assignedTo', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            >
                              {assignedToOptions.map((o) => (
                                <option key={o} value={o}>{o.toUpperCase()}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Days from joining</label>
                            <input
                              type="number"
                              value={t.daysFromJoining ?? 0}
                              onChange={(e) => updateTask(t.id, 'daysFromJoining', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="flex items-center gap-2 mt-6">
                            <input
                              id={`req_${t.id}`}
                              type="checkbox"
                              checked={!!t.isRequired}
                              onChange={(e) => updateTask(t.id, 'isRequired', e.target.checked)}
                              className="rounded border-slate-300 text-[#1B6B6B] focus:ring-[#4ECDC4]"
                            />
                            <label htmlFor={`req_${t.id}`} className="text-xs text-slate-700">
                              Required
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleAddTask(g.category)}
                  className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#70C4C4] hover:text-[#1B6B6B] transition-colors mt-2"
                >
                  + Add task to {g.category}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  const renderOffboardingTab = () => {
    const tasks = offTemplateTasks || [];
    const categories = ['Resignation', 'Knowledge Transfer', 'Asset Return', 'IT & Access', 'Finance & Legal', 'Documents', 'Exit Interview'];
    const assignedToOptions = ['hr', 'manager', 'it', 'admin', 'employee'];

    const updateTask = (taskId, field, value) => {
      setOffTemplateTasks((prev) =>
        (prev || []).map((t) => (t.id === taskId ? { ...t, [field]: value } : t)),
      );
    };

    const addTaskToCategory = (category) => {
      const newTask = {
        id: `off_${Date.now()}`,
        title: '',
        description: '',
        category: category || 'Resignation',
        assignedTo: 'hr',
        daysBefore: 0,
        isRequired: false,
        order: (offTemplateTasks?.length || 0) + 1,
      };
      setOffTemplateTasks((prev) => [...(Array.isArray(prev) ? prev : []), newTask]);
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    };

    const deleteTask = (taskId) => {
      setOffTemplateTasks((prev) => (prev || []).filter((t) => t.id !== taskId));
    };

    const handleSaveTemplate = async () => {
      try {
        if (!companyId) {
          showError('Company ID not found');
          return;
        }
        if (!offTemplateTasks || offTemplateTasks.length === 0) {
          showError('No tasks to save. Add tasks first.');
          return;
        }
        setSavingOffTemplate(true);

        const cleanTasks = offTemplateTasks.map((t, index) => ({
          id: t.id || `off_${Date.now()}_${index}`,
          title: t.title || 'Untitled task',
          description: t.description || '',
          category: t.category || 'Resignation',
          assignedTo: t.assignedTo || 'hr',
          daysBefore: Number(t.daysBefore) || 0,
          isRequired: Boolean(t.isRequired),
          order: Number(t.order) || index,
        }));

        const templateRef = doc(db, 'companies', companyId, 'settings', 'offboardingTemplate');
        await withRetry(() => setDoc(templateRef, {
          tasks: cleanTasks,
          updatedAt: new Date(),
          updatedBy: currentUser?.email || 'admin',
        }), { companyId, action: 'saveOffboardingTemplate' });
        success(`Offboarding template saved! ${cleanTasks.length} tasks saved.`);
      } catch (error) {
        await handleSmartError(error, { action: 'saveOffboardingTemplate' }, `Save failed: ${error.message}`);
      } finally {
        setSavingOffTemplate(false);
      }
    };

    return (
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Offboarding Checklist</h2>
            <p className="text-sm text-slate-500 mt-1">Customize the checklist template used when an employee exits.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setShowOffCategoryPicker((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                disabled={offTemplateLoading}
              >
                + Add task ▾
              </button>
              {showOffCategoryPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 min-w-48 overflow-hidden">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        addTaskToCategory(cat);
                        setShowOffCategoryPicker(false);
                      }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 border-b last:border-0"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="rounded-lg bg-[#1B6B6B] text-white text-sm font-medium px-4 py-2 hover:bg-[#155858] disabled:opacity-50"
              disabled={savingOffTemplate || offTemplateLoading}
            >
              {savingOffTemplate ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>

        {offTemplateLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-6">
            {categories.map((category) => {
              const categoryTasks = (tasks || [])
                .filter((t) => (t.category || 'Resignation') === category)
                .slice()
                .sort((a, b) => (a.order || 0) - (b.order || 0));
              return (
              <div key={category} className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">{category}</h3>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {categoryTasks.length} tasks
                  </span>
                </div>

                {categoryTasks.length === 0 ? (
                  <p className="text-xs text-slate-400">No tasks in this category.</p>
                ) : (
                  <div className="space-y-3">
                    {categoryTasks.map((t) => (
                      <div key={t.id} className="border border-slate-200 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                            <input
                              value={t.title || ''}
                              onChange={(e) => updateTask(t.id, 'title', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              placeholder="Task title"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteTask(t.id)}
                            className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>

                        <div className="mt-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                          <textarea
                            value={t.description || ''}
                            onChange={(e) => updateTask(t.id, 'description', e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            placeholder="Optional description"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                            <select
                              value={t.category || 'Resignation'}
                              onChange={(e) => updateTask(t.id, 'category', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            >
                              {categories.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Assigned to</label>
                            <select
                              value={t.assignedTo || 'hr'}
                              onChange={(e) => updateTask(t.id, 'assignedTo', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            >
                              {assignedToOptions.map((o) => (
                                <option key={o} value={o}>{o.toUpperCase()}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Days before exit date</label>
                            <input
                              type="number"
                              value={t.daysBefore ?? 0}
                              onChange={(e) => updateTask(t.id, 'daysBefore', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                            <p className="text-[11px] text-slate-400 mt-1">
                              Use negative numbers for tasks after exit (e.g. -7 = 7 days after)
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-6">
                            <input
                              id={`off_req_${t.id}`}
                              type="checkbox"
                              checked={!!t.isRequired}
                              onChange={(e) => updateTask(t.id, 'isRequired', e.target.checked)}
                              className="rounded border-slate-300 text-[#1B6B6B] focus:ring-[#4ECDC4]"
                            />
                            <label htmlFor={`off_req_${t.id}`} className="text-xs text-slate-700">
                              Required
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => addTaskToCategory(category)}
                  className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-amber-300 hover:text-amber-500 transition-colors mt-2 mb-4"
                >
                  + Add task to {category}
                </button>
              </div>
            );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage company configuration, lists and policies.</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-none pb-2 mb-6 -mx-4 px-4 lg:mx-0 lg:px-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 min-h-[44px] px-4 py-2 text-sm font-medium whitespace-nowrap rounded-full transition-colors active:opacity-90 ${
              tab === t.id ? 'bg-[#1B6B6B] text-white' : 'text-gray-600 hover:bg-gray-100 active:bg-gray-200'
            }`}
          >
            {t.icon ? (
              <>
                <span className="mr-1" aria-hidden>
                  {t.icon}
                </span>
                {t.label}
              </>
            ) : (
              t.label
            )}
          </button>
        ))}
      </div>

      {tab === 'lists' && renderListsTab()}
      {tab === 'leave' && renderLeaveTab()}
      {tab === 'documents' && renderDocumentsTab()}
      {tab === 'onboarding' && renderOnboardingTab()}
      {tab === 'offboarding' && renderOffboardingTab()}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Delete {deleteConfirm.name}?
            </h3>
            <p className="text-sm text-slate-600 mb-4">This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="text-slate-500 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRemove(deleteConfirm.section, deleteConfirm.name, deleteConfirm.defaults)}
                className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2"
              >
                Delete
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
