import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  where,
  Timestamp,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import {
  DOCUMENT_CHECKLIST,
  DOCUMENT_CATEGORIES,
  getDocById,
  acceptsFile,
} from '../utils/documentTypes';
import { uploadEmployeeDocument, deleteFileFromDrive } from '../utils/googleDrive';
import { toDisplayDate, toJSDate, toDateString } from '../utils';

const DEPT_COLOR = {
  Engineering: '#1B6B6B',
  HR: '#1D9E75',
  Sales: '#D97706',
  Finance: '#0D9488',
  Operations: '#534AB7',
};
const DEFAULT_DEPT_COLOR = '#64748b';

const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal', 'Other'];
const DEFAULT_DESIGNATIONS = ['Director', 'General Manager', 'Manager', 'Assistant Manager', 'Team Lead', 'Senior Executive', 'Executive', 'Junior Executive', 'Intern', 'Other'];
const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu & Kashmir',
  'Ladakh',
  'Puducherry',
  'Chandigarh',
  'Andaman & Nicobar Islands',
  'Dadra & Nagar Haveli',
  'Lakshadweep',
];

const LEAVE_TYPE_STYLE = {
  CL: 'bg-[#C5E8E8] text-[#0F4444]',
  SL: 'bg-red-100 text-red-800',
  EL: 'bg-green-100 text-green-800',
  ML: 'bg-pink-100 text-pink-800',
  PL: 'bg-indigo-100 text-indigo-800',
  BL: 'bg-gray-200 text-gray-800',
  CO: 'bg-amber-100 text-amber-800',
  MAR: 'bg-rose-100 text-rose-800',
  STL: 'bg-slate-100 text-slate-700',
  UL: 'bg-slate-100 text-slate-600',
};

const DEFAULT_PROFILE_LEAVE_TYPE_OBJECTS = [
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

function abbrevProfileLeaveName(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

function normalizeProfileLeaveTypeList(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_PROFILE_LEAVE_TYPE_OBJECTS.map((t) => ({ ...t }));
  }
  return raw.map((t) => {
    if (typeof t === 'string') {
      const name = t.trim();
      return { name, shortCode: abbrevProfileLeaveName(name), isPaid: true };
    }
    const name = (t.name || '').trim() || 'Leave';
    const shortCode = (t.shortCode || abbrevProfileLeaveName(name)).toUpperCase().slice(0, 8);
    return { name, shortCode, isPaid: t.isPaid !== false };
  });
}

function getMaxLeaveForProfileType(lt, leavePolicy) {
  const lp = leavePolicy || {};
  let n = lp[lt.shortCode] ?? lp[lt.name];
  if (n === undefined) {
    if (lt.shortCode === 'CL') n = lp.cl;
    else if (lt.shortCode === 'SL') n = lp.sl;
    else if (lt.shortCode === 'EL') n = lp.el;
  }
  if (n === undefined || Number.isNaN(Number(n))) n = 12;
  return Number(n);
}
const STATUS_STYLE = { Pending: 'bg-amber-100 text-amber-800', Approved: 'bg-green-100 text-green-800', Rejected: 'bg-red-100 text-red-800' };

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
    { id: 'off_004', title: 'Notice period terms confirmed', description: '', category: 'Resignation', assignedTo: 'hr', daysBefore: 28, isRequired: true, order: 4 },

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

function getAge(v) {
  const d = toJSDate(v);
  if (!d || Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function getTenure(joiningDate) {
  const joined = toJSDate(joiningDate);
  if (!joined) return '';

  const now = new Date();
  const years = Math.floor((now - joined) / (365.25 * 24 * 60 * 60 * 1000));
  const months = Math.floor((now - joined) / (30.44 * 24 * 60 * 60 * 1000));
  const days = Math.floor((now - joined) / (24 * 60 * 60 * 1000));

  if (years >= 1) {
    const remainingMonths = Math.floor(months - years * 12);
    if (remainingMonths > 0) {
      return `${years}y ${remainingMonths}m`;
    }
    return `${years} year${years > 1 ? 's' : ''}`;
  }
  if (months >= 1) {
    return `${months} month${months > 1 ? 's' : ''}`;
  }
  return `${days} day${days > 1 ? 's' : ''}`;
}

export default function EmployeeProfile() {
  const { companyId, empId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, googleAccessToken, signOut, role: authRole } = useAuth();
  const userRole = authRole;
  const canEditEmployees = userRole === 'admin' || userRole === 'hrmanager';
  const canUploadDocuments = userRole === 'admin' || userRole === 'hrmanager';
  const { success, error: showError } = useToast();
  const [employee, setEmployee] = useState(null);
  const { company } = useCompany();
  const [allEmployees, setAllEmployees] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [leaveError, setLeaveError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('personal');
  const [showSalary, setShowSalary] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [categoryOpen, setCategoryOpen] = useState({});
  const [uploadingDocId, setUploadingDocId] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [replacingDocId, setReplacingDocId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [additionalDocName, setAdditionalDocName] = useState('');
  const [additionalDocCategory, setAdditionalDocCategory] = useState(DOCUMENT_CATEGORIES[0]);
  const [additionalDocFile, setAdditionalDocFile] = useState(null);
  const additionalFileInputRef = useRef(null);
  const leaveFetchedRef = useRef(false);
  const assetsFetchedRef = useRef(false);
  const [managerSearch, setManagerSearch] = useState('');
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);
  const [assetList, setAssetList] = useState([]);
  const [showAssignAssetModal, setShowAssignAssetModal] = useState(false);
  const [showProfileAssignModal, setShowProfileAssignModal] = useState(null); // trackable assign or consumable issue
  const [profileAssignMode, setProfileAssignMode] = useState('trackable'); // 'trackable' | 'consumable'
  const [showProfileAssetDropdown, setShowProfileAssetDropdown] = useState(false);
  const [profileAssetSearch, setProfileAssetSearch] = useState('');
  const [showAssetHistory, setShowAssetHistory] = useState(false);
  const [assignAssetForm, setAssignAssetForm] = useState({
    assetId: '',
    issueDate: '',
    condition: 'Good',
    notes: '',
  });
  const [issueConsumableAsset, setIssueConsumableAsset] = useState(null);
  const [issueConsumableForm, setIssueConsumableForm] = useState({
    quantity: 1,
    issueDate: '',
    condition: 'Good',
    notes: '',
  });
  const [returnAsset, setReturnAsset] = useState(null);
  const [returnAssetForm, setReturnAssetForm] = useState({
    date: '',
    condition: 'Good',
    notes: '',
  });
  const [pendingReturnAssets, setPendingReturnAssets] = useState([]);
  const [showAssetReturnWarning, setShowAssetReturnWarning] = useState(false);
  const [returnConsumableModal, setReturnConsumableModal] = useState(null); // { asset, assignment }
  const [returnQty, setReturnQty] = useState(1);
  const [returnCondition, setReturnCondition] = useState('Good');
  const [returnNotes, setReturnNotes] = useState('');
  const [completingTask, setCompletingTask] = useState(null);
  const [taskNotes, setTaskNotes] = useState('');
  const [offboardingExitDate, setOffboardingExitDate] = useState('');
  const [offboardingExitReason, setOffboardingExitReason] = useState('');
  const [completingOffTask, setCompletingOffTask] = useState(null);
  const [offTaskNotes, setOffTaskNotes] = useState('');
  const [deactivateChoiceOpen, setDeactivateChoiceOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = () => {
      if (showManagerDropdown) {
        setShowManagerDropdown(false);
        setManagerSearch('');
      }
    };
    if (showManagerDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showManagerDropdown]);

  const deptColor = employee ? (DEPT_COLOR[employee.department] || DEFAULT_DEPT_COLOR) : DEFAULT_DEPT_COLOR;
  const departments = company?.departments?.length ? company.departments : DEFAULT_DEPARTMENTS;
  const designations = company?.designations?.length ? company.designations : DEFAULT_DESIGNATIONS;
  const employmentTypes = company?.employmentTypes?.length ? company.employmentTypes : DEFAULT_EMPLOYMENT_TYPES;
  const branches = company?.branches?.length ? company.branches : DEFAULT_BRANCHES;
  const qualifications = company?.qualifications?.length ? company.qualifications : DEFAULT_QUALIFICATIONS;
  const categories = company?.categories?.length ? company.categories : DEFAULT_CATEGORIES;

  const empRef = companyId && empId ? doc(db, 'companies', companyId, 'employees', empId) : null;

  useEffect(() => {
    if (!companyId || !empId) return;
    leaveFetchedRef.current = false;
    assetsFetchedRef.current = false;
    setLeaveList([]);
    setAssetList([]);
    const load = async () => {
      setLoading(true);
      try {
        const empSnap = await getDoc(doc(db, 'companies', companyId, 'employees', empId));
        if (empSnap.exists()) setEmployee({ id: empSnap.id, ...empSnap.data() });
        else setEmployee(null);
      } catch (err) {
        console.error('EmployeeProfile load error:', err);
        showError('Failed to load profile');
      }
      setLoading(false);
    };
    load();
  }, [companyId, empId, showError]);

  useEffect(() => {
    if (!companyId || !empId) return;
    if (tab !== 'leave' && tab !== 'timeline') return;
    if (leaveFetchedRef.current) return;
    leaveFetchedRef.current = true;
    let cancelled = false;
    const loadLeave = async () => {
      setLeaveError(null);
      try {
        const leaveQuery = query(
          collection(db, 'companies', companyId, 'leave'),
          where('employeeId', '==', empId),
        );
        const leaveSnap = await getDocs(leaveQuery);
        if (cancelled) return;
        const list = leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const ta = a.appliedAt?.toMillis?.() ?? (a.appliedAt ? new Date(a.appliedAt).getTime() : 0);
          const tb = b.appliedAt?.toMillis?.() ?? (b.appliedAt ? new Date(b.appliedAt).getTime() : 0);
          return tb - ta;
        });
        setLeaveList(list);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Leave fetch error:', error);
        if (!cancelled) {
          setLeaveError(error?.message || 'Failed to load leave');
          setLeaveList([]);
        }
      }
    };
    loadLeave();
    return () => {
      cancelled = true;
    };
  }, [companyId, empId, tab]);

  useEffect(() => {
    const close = () => {
      setShowProfileAssetDropdown(false);
      setProfileAssetSearch('');
    };
    if (showProfileAssetDropdown) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showProfileAssetDropdown]);

  // Load assets when Assets / Timeline tab or asset modals need them (once per employee)
  useEffect(() => {
    if (!companyId) return;
    const needAssets =
      tab === 'assets' ||
      tab === 'timeline' ||
      showAssignAssetModal ||
      showProfileAssignModal != null ||
      returnConsumableModal != null ||
      showAssetHistory;
    if (!needAssets) return;
    if (assetsFetchedRef.current) return;
    assetsFetchedRef.current = true;
    const loadAssets = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'assets'));
        setAssetList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not load assets for employee profile', e);
        setAssetList([]);
      }
    };
    loadAssets();
  }, [companyId, tab, showAssignAssetModal, showProfileAssignModal, returnConsumableModal, showAssetHistory]);

  useEffect(() => {
    if (!showEditModal || !companyId) return;
    let cancelled = false;
    const fetchEmployeesForManager = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'employees'));
        if (!cancelled) setAllEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not load employees list:', e);
        if (!cancelled) setAllEmployees([]);
      }
    };
    fetchEmployeesForManager();
    return () => {
      cancelled = true;
    };
  }, [showEditModal, companyId]);

  useEffect(() => {
    if (searchParams.get('tab') === 'documents') setTab('documents');
  }, [searchParams]);

  const leavePolicy = company?.leavePolicy || { cl: 12, sl: 12, el: 15 };
  const profileLeaveTypes = useMemo(() => normalizeProfileLeaveTypeList(company?.leaveTypes), [company?.leaveTypes]);
  const profilePaidLeaveTypes = useMemo(() => profileLeaveTypes.filter((lt) => lt.isPaid), [profileLeaveTypes]);

  const leaveUsedByTypeProfile = useMemo(() => {
    const acc = {};
    profileLeaveTypes.forEach((lt) => {
      acc[lt.name] = 0;
    });
    leaveList
      .filter((l) => l.status === 'Approved')
      .forEach((l) => {
        const raw = (l.leaveType || '').trim();
        const lt = profileLeaveTypes.find(
          (x) =>
            x.name === raw ||
            x.shortCode === raw ||
            (x.shortCode === 'CL' && raw === 'CL') ||
            (x.shortCode === 'SL' && raw === 'SL') ||
            (x.shortCode === 'EL' && raw === 'EL'),
        );
        if (lt) acc[lt.name] = (acc[lt.name] || 0) + (l.days || 0);
      });
    return acc;
  }, [leaveList, profileLeaveTypes]);

  const leaveTypePillClassResolved = useMemo(
    () => (raw) => {
      const r = (raw || '').trim();
      const lt = profileLeaveTypes.find((x) => x.name === r || x.shortCode === r);
      const code = lt?.shortCode || r;
      return LEAVE_TYPE_STYLE[code] || 'bg-slate-100 text-slate-700';
    },
    [profileLeaveTypes],
  );

  const timelineEvents = useMemo(() => {
    if (!employee) return [];
    const events = [];

    if (employee.joiningDate) {
      events.push({
        type: 'joined',
        date: toJSDate(employee.joiningDate),
        title: 'Joined the company',
        description: `${employee.department || '—'} · ${employee.designation || '—'}`,
        icon: '🎉',
        color: 'green',
      });
    }

    leaveList.forEach((leave) => {
      const d = toJSDate(leave.appliedAt) || toJSDate(leave.startDate);
      events.push({
        type: 'leave',
        date: d,
        title: `${leave.leaveType || 'Leave'} — ${leave.status || '—'}`,
        description: `${leave.days || 0} day(s) · ${leave.startDate ? toDisplayDate(leave.startDate) : '—'} to ${leave.endDate ? toDisplayDate(leave.endDate) : '—'}${leave.reason ? ` · ${leave.reason}` : ''}`,
        icon: leave.status === 'Approved' ? '✅' : leave.status === 'Rejected' ? '❌' : '⏳',
        color: leave.status === 'Approved' ? 'green' : leave.status === 'Rejected' ? 'red' : 'amber',
      });
    });

    assetList.forEach((asset) => {
      const hist = Array.isArray(asset.history) ? asset.history : [];
      hist
        .filter((h) => h.employeeId === empId)
        .forEach((h) => {
          events.push({
            type: 'asset',
            date: toJSDate(h.date) || new Date(),
            title:
              h.action === 'assigned'
                ? `${asset.name} assigned`
                : h.action === 'returned'
                  ? `${asset.name} returned`
                  : `${asset.name} — ${h.action || 'update'}`,
            description: `${asset.assetId || ''}${h.condition ? ` · Condition: ${h.condition}` : ''}${h.notes ? ` · ${h.notes}` : ''}`,
            icon: h.action === 'assigned' ? '📦' : '↩️',
            color: 'blue',
          });
        });
      if ((asset.mode || 'trackable') === 'consumable') {
        (asset.assignments || [])
          .filter((as) => as.employeeId === empId)
          .forEach((as) => {
            events.push({
              type: 'asset',
              date: toJSDate(as.issueDate) || new Date(),
              title: `${asset.name} issued (consumable)`,
              description: `Qty ${as.quantity || 1} · ${asset.assetId || ''}`,
              icon: '📦',
              color: 'blue',
            });
          });
      }
    });

    (employee.documents || []).forEach((docItem) => {
      events.push({
        type: 'document',
        date: toJSDate(docItem.uploadedAt) || new Date(),
        title: `${docItem.name || 'Document'} uploaded`,
        description: `${docItem.category || '—'} · by ${docItem.uploadedBy || 'HR'}`,
        icon: '📄',
        color: 'purple',
      });
    });

    const ob = employee.onboarding;
    if (ob && (ob.status === 'in_progress' || ob.status === 'completed')) {
      events.push({
        type: 'onboarding',
        date: toJSDate(ob.startedAt),
        title: 'Onboarding started',
        description: `${ob.completionPct || 0}% complete`,
        icon: '🎯',
        color: 'blue',
      });
      if (ob.status === 'completed') {
        events.push({
          type: 'onboarding',
          date: toJSDate(ob.completedAt),
          title: 'Onboarding completed',
          description: 'All tasks finished',
          icon: '🏆',
          color: 'green',
        });
      }
    }

    const offb = employee.offboarding;
    if (offb && (offb.status === 'in_progress' || offb.status === 'completed')) {
      events.push({
        type: 'offboarding',
        date: toJSDate(offb.startedAt),
        title: 'Offboarding initiated',
        description: `Exit reason: ${offb.exitReason || '—'} · Exit date: ${offb.exitDate ? toDisplayDate(offb.exitDate) : '—'}`,
        icon: '👋',
        color: 'amber',
      });
    }

    return events.sort((a, b) => {
      const da = a.date instanceof Date && !Number.isNaN(a.date.getTime()) ? a.date : new Date(0);
      const db2 = b.date instanceof Date && !Number.isNaN(b.date.getTime()) ? b.date : new Date(0);
      return db2 - da;
    });
  }, [employee, leaveList, assetList, empId]);

  const employeeAssets = useMemo(
    () =>
      assetList.filter(
        (a) => a.assignedToId === empId && (a.status || 'Assigned') === 'Assigned',
      ),
    [assetList, empId],
  );

  const employeeConsumableCards = useMemo(() => {
    return assetList
      .filter((a) => (a.mode || 'trackable') === 'consumable')
      .flatMap((asset) => {
        const assignments = Array.isArray(asset.assignments) ? asset.assignments : [];
        return assignments
          .filter((as) => as.employeeId === empId && !as.returned)
          .map((as) => ({
            kind: 'consumable',
            id: `${asset.id}_${as.employeeId}_${as.issueDate?.seconds || 0}`,
            assetDocId: asset.id,
            type: asset.type,
            name: asset.name,
            assetId: asset.assetId,
            issueDate: as.issueDate,
            quantity: as.quantity,
            condition: as.condition,
            unit: asset.unit,
            serialNumber: null,
            brand: null,
            model: null,
            assignment: as,
          }));
      });
  }, [assetList, empId]);

  const employeeAssetHistory = useMemo(
    () =>
      assetList
        .filter((a) => Array.isArray(a.history) && a.history.some((h) => h.employeeId === empId))
        .map((asset) => ({
          ...asset,
          relevantHistory: asset.history.filter((h) => h.employeeId === empId),
        })),
    [assetList, empId],
  );

  const activeChecklist = useMemo(() => {
    if (company?.documentTypes && company.documentTypes.length > 0) {
      return company.documentTypes;
    }
    return DOCUMENT_CHECKLIST;
  }, [company]);

  const findDocCategory = (docId, checklist) => {
    for (const cat of checklist || []) {
      const found = (cat.documents || []).find((d) => d.id === docId);
      if (found) return cat.category;
    }
    return null;
  };

  const isChecklistDoc = (uploadedDoc) =>
    activeChecklist.some((cat) => (cat.documents || []).some((d) => d.id === uploadedDoc?.id));

  const totalMandatory = useMemo(
    () =>
      activeChecklist
        .flatMap((cat) => cat.documents)
        .filter((d) => d.mandatory).length,
    [activeChecklist],
  );

  const checklistIds = useMemo(() => {
    const set = new Set();
    activeChecklist.forEach((cat) => {
      (cat.documents || []).forEach((d) => {
        if (d?.id) set.add(d.id);
      });
    });
    return set;
  }, [activeChecklist]);

  const docByType = useMemo(() => {
    const map = {};
    const list = employee?.documents || [];
    list.forEach((d) => {
      if (d?.id && checklistIds.has(d.id)) map[d.id] = d;
    });
    return map;
  }, [employee?.documents, checklistIds]);

  const additionalDocs = useMemo(() => {
    const docs = employee?.documents || [];
    // Only show docs that are truly not part of the current checklist
    return docs.filter((d) => !isChecklistDoc(d));
  }, [employee?.documents, activeChecklist]);
  const mandatoryUploaded = useMemo(() => {
    let n = 0;
    activeChecklist.forEach((cat) => {
      cat.documents.filter((d) => d.mandatory).forEach((d) => {
        if (docByType[d.id]) n++;
      });
    });
    return n;
  }, [docByType, activeChecklist]);

  const documentCompletion = useMemo(() => {
    if (!employee) return 0;
    const mandatoryDocs = activeChecklist
      .flatMap((cat) => cat.documents)
      .filter((d) => d.mandatory);
    const uploadedMandatory = mandatoryDocs.filter((md) =>
      (employee.documents || []).some((ud) => ud.id === md.id),
    );
    return mandatoryDocs.length > 0
      ? Math.round((uploadedMandatory.length / mandatoryDocs.length) * 100)
      : 100;
  }, [employee, activeChecklist]);
  const progressColor = documentCompletion <= 40 ? 'bg-red-500' : documentCompletion < 80 ? 'bg-amber-500' : 'bg-green-500';

  const refreshEmployee = async () => {
    if (!empRef) return;
    const snap = await getDoc(empRef);
    if (!snap.exists()) return;
    const data = snap.data();
    setEmployee({ id: snap.id, ...data });
  };

  const openEdit = () => {
    if (!employee) return;
    setForm({
      fullName: employee.fullName || '',
      email: employee.email || '',
      phone: employee.phone || '',
      dateOfBirth: toDateString(employee.dateOfBirth),
      gender: employee.gender || '',
      fatherName: employee.fatherName || '',
      streetAddress: employee.streetAddress || '',
      city: employee.city || '',
      state: employee.state || '',
      pincode: employee.pincode || '',
      country: employee.country || 'India',
      qualification: employee.qualification || '',
      empId: employee.empId || '',
      department: employee.department || '',
      branch: employee.branch || '',
      designation: employee.designation || '',
      employmentType: employee.employmentType || 'Full-time',
      category: employee.category || '',
      joiningDate: toDateString(employee.joiningDate),
      reportingManagerId: employee.reportingManagerId || '',
      reportingManagerName: employee.reportingManagerName || '',
      reportingManagerEmpId: employee.reportingManagerEmpId || '',
      ctcPerAnnum: employee.ctcPerAnnum ?? employee.ctc ?? '',
      basicSalary: employee.basicSalary ?? '',
      hra: employee.hra ?? '',
      pfNumber: employee.pfNumber || '',
      esicNumber: employee.esicNumber || '',
      panNumber: employee.panNumber || '',
      aadhaarNumber: employee.aadhaarNumber || '',
      drivingLicenceNumber: employee.drivingLicenceNumber || '',
      emergencyContactName: employee.emergencyContact?.name || '',
      emergencyRelationship: employee.emergencyContact?.relationship || '',
      emergencyPhone: employee.emergencyContact?.phone || '',
      emergencyEmail: employee.emergencyContact?.email || '',
      emergencyAddress: employee.emergencyContact?.address || '',
    });
    setShowEditModal(true);
  };

  const checkEmpIdExists = async (empIdToCheck, currentDocId) => {
    const v = (empIdToCheck || '').trim();
    if (!v) return false;
    const q = query(
      collection(db, 'companies', companyId, 'employees'),
      where('empId', '==', v),
    );
    const snap = await getDocs(q);
    const others = snap.docs.filter((d) => d.id !== currentDocId);
    return others.length > 0;
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!employee || !form) return;
    setSaving(true);
    try {
      if (form.empId?.trim()) {
        const exists = await checkEmpIdExists(form.empId, empId);
        if (exists) {
          showError(`Emp ID ${form.empId} is already taken. Please use a different ID.`);
          setSaving(false);
          return;
        }
      }
      const payload = {
        fullName: form.fullName?.trim(),
        email: form.email?.trim(),
        phone: form.phone?.trim(),
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        fatherName: form.fatherName?.trim() || null,
        streetAddress: form.streetAddress?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state || null,
        pincode: form.pincode?.trim() || null,
        country: form.country?.trim() || 'India',
        empId: form.empId || null,
        department: form.department || null,
        branch: form.branch || null,
        designation: form.designation || null,
        employmentType: form.employmentType || 'Full-time',
        category: form.category || null,
        qualification: form.qualification || null,
        joiningDate: form.joiningDate || null,
        reportingManagerId: form.reportingManagerId || null,
        reportingManagerName: form.reportingManagerName || null,
        reportingManagerEmpId: form.reportingManagerEmpId || null,
        ctcPerAnnum: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        ctc: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        basicSalary: form.basicSalary ? Number(form.basicSalary) : null,
        hra: form.hra ? Number(form.hra) : null,
        pfNumber: form.pfNumber || null,
        esicNumber: form.esicNumber || null,
        panNumber: form.panNumber?.replace(/\s/g, '') || null,
        aadhaarNumber: form.aadhaarNumber?.replace(/\s/g, '') || null,
        drivingLicenceNumber: form.drivingLicenceNumber?.trim() || null,
        emergencyContact: {
          name: form.emergencyContactName?.trim() || '',
          relationship: form.emergencyRelationship || '',
          phone: form.emergencyPhone?.trim() || '',
          email: form.emergencyEmail?.trim() || '',
          address: form.emergencyAddress?.trim() || '',
        },
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
      setEmployee((prev) => (prev ? { ...prev, ...payload } : null));
      setShowEditModal(false);
      setShowManagerDropdown(false);
      setManagerSearch('');
      success('Employee updated');
    } catch (err) {
      showError('Failed to update');
    }
    setSaving(false);
  };

  const proceedDeactivateDirectly = async () => {
    if (!employee || !companyId || !empId) return;
    setSaving(true);
    try {
      // Trackables: assigned to this employee and still marked as Assigned
      const assignedSnap = await getDocs(
        query(
          collection(db, 'companies', companyId, 'assets'),
          where('assignedToId', '==', empId),
          where('status', '==', 'Assigned'),
        ),
      );
      const pendingTrackables = assignedSnap.docs.map((d) => ({
        kind: 'trackable',
        docId: d.id,
        ...d.data(),
      }));

      // Consumables: any unreturned assignment for this employee
      const consumableSnap = await getDocs(
        query(collection(db, 'companies', companyId, 'assets'), where('mode', '==', 'consumable')),
      );
      const pendingConsumables = consumableSnap.docs.flatMap((d) => {
        const asset = { id: d.id, ...d.data() };
        const assignments = Array.isArray(asset.assignments) ? asset.assignments : [];
        return assignments
          .filter((as) => as.employeeId === empId && !as.returned)
          .map((as) => ({
            kind: 'consumable',
            docId: asset.id,
            type: asset.type,
            name: asset.name,
            assetId: asset.assetId,
            assignment: as,
            issueDate: as.issueDate,
            quantity: as.quantity,
            condition: as.condition,
            employeeName: as.employeeName,
            empId: as.empId,
          }));
      });

      const pending = [...pendingTrackables, ...pendingConsumables];
      if (pending.length > 0) {
        setPendingReturnAssets(pending);
        setShowAssetReturnWarning(true);
      } else {
        setDeactivateConfirm(true);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to check assets before deactivation', err);
      showError('Could not check assigned assets');
    }
    setSaving(false);
  };

  const handleDeactivate = async () => {
    if (!employee || !companyId || !empId) return;
    if (!employee.offboarding || employee.offboarding.status === 'not_started') {
      setDeactivateChoiceOpen(true);
      return;
    }
    await proceedDeactivateDirectly();
  };

  const getCompanyName = () => company?.name || 'Company';

  const driveAccessError = (err) => {
    const msg = err?.message || 'Upload failed';
    showError(msg);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate('/login');
    }
  };

  const validateFile = (file, docType) => {
    const accepts = Array.isArray(docType?.accepts)
      ? docType.accepts
      : ['.pdf', '.jpg', '.jpeg', '.png'];
    const maxSizeMB = docType?.maxSizeMB || 10;
    const maxBytes = maxSizeMB * 1024 * 1024;
    const ext = '.' + String(file?.name || '').split('.').pop().toLowerCase();

    if (!accepts.includes(ext)) {
      const formatted = accepts.map((e) => e.replace('.', '').toUpperCase()).join(', ');
      throw new Error(`Invalid format. Only accepts: ${formatted}`);
    }

    if (file.size > maxBytes) {
      throw new Error(
        `File too large. Max size is ${maxSizeMB}MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB`,
      );
    }
  };

  const findChecklistDoc = (docId) => {
    for (const cat of activeChecklist) {
      const d = cat.documents?.find((x) => x.id === docId);
      if (d) return { ...d, category: cat.category };
    }
    return null;
  };

  const handleUploadChecklistDoc = async (file, docId, docName, categoryName) => {
    if (!employee) return;
    if (!googleAccessToken) {
      showError('Please sign out and sign back in to enable Google Drive uploads');
      return;
    }
    const docType =
      activeChecklist
        .flatMap((c) => c.documents || [])
        .find((d) => d.id === docId) || findChecklistDoc(docId) || getDocById(docId);
    const effectiveDocType =
      docType || {
        id: docId,
        name: docName || docId,
        mandatory: false,
        accepts: ['.pdf', '.jpg', '.jpeg', '.png'],
        maxSizeMB: 10,
      };
    try {
      validateFile(file, effectiveDocType);
    } catch (error) {
      showError(error.message);
      return;
    }
    setUploadingDocId(docId);
    try {
      const categoryFromChecklist = findDocCategory(docId, activeChecklist);
      const finalCategoryName = categoryFromChecklist || 'Additional Documents';
      const result = await uploadEmployeeDocument(
        googleAccessToken,
        file,
        getCompanyName(),
        employee.empId,
        employee.fullName,
        finalCategoryName,
      );
      const entry = {
        id: effectiveDocType.id,
        name: effectiveDocType.name,
        category: finalCategoryName,
        fileName: file.name,
        fileId: result.fileId,
        webViewLink: result.webViewLink,
        uploadedAt: new Date(),
        uploadedBy: currentUser?.email || null,
        fileSize: result.fileSize,
      };
      if (empRef) {
        await updateDoc(empRef, {
          documents: arrayUnion(entry),
          updatedAt: serverTimestamp(),
        });
        await refreshEmployee();
      }
      success(`${docName} uploaded successfully`);
    } catch (err) {
      driveAccessError(err);
    }
    setUploadingDocId(null);
  };

  const handleReplaceDoc = async (file, docId) => {
    const docEntry = docByType[docId];
    if (!docEntry?.fileId) return;
    if (!googleAccessToken) {
      showError('Please sign out and sign back in to enable Google Drive uploads');
      return;
    }
    const docType =
      activeChecklist
        .flatMap((c) => c.documents || [])
        .find((d) => d.id === docId) || findChecklistDoc(docId) || getDocById(docId);
    const effectiveDocType =
      docType || {
        id: docId,
        name: docEntry.name || docId,
        mandatory: false,
        accepts: ['.pdf', '.jpg', '.jpeg', '.png'],
        maxSizeMB: 10,
      };
    try {
      validateFile(file, effectiveDocType);
    } catch (error) {
      showError(error.message);
      return;
    }
    setUploadingDocId(docId);
    setReplacingDocId(docEntry.fileId);
    try {
      try {
        await deleteFileFromDrive(googleAccessToken, docEntry.fileId);
      } catch (_) {
        // ignore Drive delete failure
      }
      const result = await uploadEmployeeDocument(
        googleAccessToken,
        file,
        getCompanyName(),
        employee.empId,
        employee.fullName,
        docEntry.category,
      );
      const newEntry = {
        ...docEntry,
        id: effectiveDocType.id,
        name: effectiveDocType.name,
        fileName: file.name,
        fileId: result.fileId,
        webViewLink: result.webViewLink,
        uploadedAt: new Date(),
        uploadedBy: currentUser?.email || null,
        fileSize: result.fileSize,
      };
      if (empRef) {
        await updateDoc(empRef, {
          documents: arrayRemove(docEntry),
        });
        await updateDoc(empRef, {
          documents: arrayUnion(newEntry),
          updatedAt: serverTimestamp(),
        });
        await refreshEmployee();
      }
      success(`${docEntry.name} replaced successfully`);
    } catch (err) {
      driveAccessError(err);
    }
    setUploadingDocId(null);
    setReplacingDocId(null);
  };

  const handleDeleteChecklistDoc = async (docEntry) => {
    if (!docEntry?.fileId) return;
    if (!googleAccessToken) {
      showError('Please sign out and sign back in to manage documents');
      return;
    }
    let driveFailed = false;
    setDeletingDocId(docEntry.fileId);
    try {
      try {
        await deleteFileFromDrive(googleAccessToken, docEntry.fileId);
      } catch (_) {
        driveFailed = true;
      }
      if (empRef) {
        await updateDoc(empRef, {
          documents: arrayRemove(docEntry),
          updatedAt: serverTimestamp(),
        });
        await refreshEmployee();
      }
      if (driveFailed) {
        showError('File removed from records (may have already been deleted from Drive)');
      } else {
        success('Document deleted');
      }
    } catch (err) {
      driveAccessError(err);
    }
    setDeletingDocId(null);
    setDeleteConfirm(null);
  };

  const handleViewDoc = (docEntry) => {
    if (docEntry?.webViewLink) window.open(docEntry.webViewLink, '_blank');
  };

  const handleUploadAdditionalDoc = async () => {
    if (!additionalDocName.trim() || !additionalDocFile) {
      showError('Name and file required');
      return;
    }
    if (!googleAccessToken) {
      showError('Please sign out and sign back in to enable Google Drive uploads');
      return;
    }
    try {
      validateFile(additionalDocFile, {
        name: additionalDocName.trim(),
        accepts: ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx'],
        maxSizeMB: 25,
      });
    } catch (error) {
      showError(error.message);
      return;
    }
    setUploadingDocId('additional');
    try {
      const result = await uploadEmployeeDocument(
        googleAccessToken,
        additionalDocFile,
        getCompanyName(),
        employee.empId,
        employee.fullName,
        additionalDocCategory,
      );
      const entry = {
        id: `additional_${Date.now()}`,
        name: additionalDocName.trim(),
        category: additionalDocCategory,
        fileName: result.fileName,
        fileId: result.fileId,
        webViewLink: result.webViewLink,
        uploadedAt: new Date(),
        uploadedBy: currentUser?.email || null,
        fileSize: result.fileSize,
      };
      const nextDocs = [...(employee.documents || []), entry];
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), { documents: nextDocs, updatedAt: serverTimestamp() });
      setEmployee((prev) => (prev ? { ...prev, documents: nextDocs } : null));
      success('Document uploaded');
      setAdditionalDocName('');
      setAdditionalDocCategory(DOCUMENT_CATEGORIES[0]);
      setAdditionalDocFile(null);
      if (additionalFileInputRef.current) additionalFileInputRef.current.value = '';
    } catch (err) {
      driveAccessError(err);
    }
    setUploadingDocId(null);
  };

  const handleDeleteAdditionalDoc = async (index) => {
    const docEntry = additionalDocs[index];
    if (!docEntry?.fileId) return;
    if (!googleAccessToken) {
      showError('Please sign out and sign back in to manage documents');
      return;
    }
    setDeletingDocId(docEntry.fileId);
    try {
      try {
        await deleteFileFromDrive(googleAccessToken, docEntry.fileId);
      } catch (_) {
        // ignore Drive delete error
      }
      if (empRef) {
        await updateDoc(empRef, {
          documents: arrayRemove(docEntry),
          updatedAt: serverTimestamp(),
        });
        await refreshEmployee();
      }
      success('Document deleted');
    } catch (err) {
      driveAccessError(err);
    }
    setDeletingDocId(null);
    setDeleteConfirm(null);
  };

  const formatDocDate = (v) => toDisplayDate(v);
  const formatFileSizeDetailed = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getFileExt = (fileName) =>
    fileName?.split('.').pop()?.toUpperCase()?.slice(0, 4) || 'FILE';

  const getFileIconColor = (fileName) => {
    const ext = fileName?.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'bg-red-500';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'bg-[#4ECDC4]';
    if (['xls', 'xlsx'].includes(ext)) return 'bg-green-600';
    if (['doc', 'docx'].includes(ext)) return 'bg-[#155858]';
    return 'bg-gray-500';
  };

  const getAssetIcon = (type) => {
    const icons = {
      Laptop: '💻',
      Desktop: '🖥️',
      'Mobile Phone': '📱',
      'SIM Card': '📶',
      Tablet: '📟',
      'ID Card': '🪪',
      'Access Card': '💳',
      Uniform: '👔',
      Headset: '🎧',
      Charger: '🔌',
      Vehicle: '🚗',
      Tools: '🔧',
      Furniture: '🪑',
    };
    return icons[type] || '📦';
  };

  const getCategoryIcon = (category) => {
    if (category === 'Pre-joining') return '📋';
    if (category === 'Day 1') return '🎉';
    if (category === 'Week 1') return '📅';
    if (category === 'Month 1') return '🏆';
    return '✅';
  };

  const isOverdue = (dueDate) => {
    const due = toJSDate(dueDate);
    if (!due) return false;
    return due < new Date();
  };

  const getAssignedLabel = (assignedTo) => {
    const map = {
      hr: 'HR Team',
      manager: 'Manager',
      it: 'IT Team',
      admin: 'Admin',
      employee: 'Employee',
    };
    return map[assignedTo] || assignedTo || '—';
  };

  const getOffCategoryIcon = (category) => {
    if (category === 'Resignation') return '📝';
    if (category === 'Knowledge Transfer') return '🧠';
    if (category === 'Asset Return') return '📦';
    if (category === 'IT & Access') return '💻';
    if (category === 'Finance & Legal') return '💰';
    if (category === 'Documents') return '📄';
    if (category === 'Exit Interview') return '🤝';
    return '✅';
  };

  const calculateOffboardingDueDate = (exitDate, daysBefore) => {
    try {
      const exit = toJSDate(exitDate) || new Date();
      const due = new Date(exit);
      // positive daysBefore = before exit (subtract)
      // negative daysBefore = after exit (subtracting negative adds)
      due.setDate(due.getDate() - Number(daysBefore || 0));
      return Timestamp.fromDate(due);
    } catch (e) {
      return Timestamp.fromDate(new Date());
    }
  };

  const offboarding = employee?.offboarding || null;
  const offTasks = Array.isArray(offboarding?.tasks) ? offboarding.tasks : [];
  const offCompleted = offTasks.filter((t) => t.completed).length;
  const offTotal = offTasks.length;
  const offPct = offTotal ? Math.round((offCompleted / offTotal) * 100) : (offboarding?.completionPct || 0);

  const offByCategory = useMemo(() => {
    const categories = ['Resignation', 'Knowledge Transfer', 'Asset Return', 'IT & Access', 'Finance & Legal', 'Documents', 'Exit Interview'];
    const tasks = offTasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    return categories.map((cat) => ({
      category: cat,
      tasks: tasks.filter((t) => (t.category || 'Resignation') === cat),
    }));
  }, [offTasks]);

  const assignedAssetsForWarning = useMemo(() => {
    const trackables = assetList.filter((a) => (a.mode || 'trackable') === 'trackable' && a.assignedToId === empId && a.status === 'Assigned');
    const consumables = assetList
      .filter((a) => (a.mode || 'trackable') === 'consumable')
      .flatMap((asset) =>
        (asset.assignments || [])
          .filter((as) => as.employeeId === empId && !as.returned)
          .map((as) => ({ ...asset, _qty: as.quantity })),
      );
    return { trackables, consumables };
  }, [assetList, empId]);

  const handleStartOffboarding = async () => {
    if (!companyId || !empId || !employee || !currentUser) return;
    if (!offboardingExitDate) {
      showError('Please select last working day');
      return;
    }
    if (!offboardingExitReason) {
      showError('Please select exit reason');
      return;
    }
    setSaving(true);
    try {
      let templateTasks = DEFAULT_OFFBOARDING_TEMPLATE.tasks;
      try {
        const templateDoc = await getDoc(doc(db, 'companies', companyId, 'settings', 'offboardingTemplate'));
        if (templateDoc.exists() && Array.isArray(templateDoc.data()?.tasks) && templateDoc.data().tasks.length > 0) {
          templateTasks = templateDoc.data().tasks;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('No offboarding template found, using default:', e?.message || e);
      }

      const exitDateTs = Timestamp.fromDate(new Date(offboardingExitDate));
      const now = Timestamp.now();

      const sanitized = templateTasks
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((t, idx) => ({
          id: t.id || `off_${Date.now()}_${idx}`,
          title: t.title || '',
          description: t.description || '',
          category: t.category || 'Resignation',
          assignedTo: t.assignedTo || 'hr',
          daysBefore: Number(t.daysBefore) || 0,
          isRequired: Boolean(t.isRequired),
          order: Number(t.order) || idx,
          completed: false,
          completedAt: null,
          completedBy: null,
          notes: '',
          dueDate: calculateOffboardingDueDate(exitDateTs, t.daysBefore),
        }))
        .map((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)));

      const payload = {
        offboarding: {
          status: 'in_progress',
          exitDate: exitDateTs,
          exitReason: offboardingExitReason,
          startedAt: now,
          completedAt: null,
          completionPct: 0,
          tasks: sanitized,
        },
        status: 'Offboarding',
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
      setEmployee((prev) => (prev ? { ...prev, ...payload } : prev));
      success(`Offboarding started for ${employee.fullName}. Exit date: ${toDisplayDate(exitDateTs)}`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Offboarding start error:', error?.message, error);
      showError(`Failed to start offboarding: ${error?.message || 'Unknown error'}`);
    }
    setSaving(false);
  };

  const markOffboardingTaskComplete = async (taskId, notes) => {
    if (!companyId || !empId || !employee || !currentUser || !offboarding) return;
    const now = Timestamp.now();
    const nextTasks = offTasks.map((t) =>
      t.id === taskId
        ? { ...t, completed: true, completedAt: now, completedBy: currentUser.email || '', notes: notes || '' }
        : t,
    );
    const done = nextTasks.filter((t) => t.completed).length;
    const total = nextTasks.length || 1;
    const pct = Math.round((done / total) * 100);
    const requiredDone = nextTasks.filter((t) => t.isRequired).every((t) => t.completed);
    const status = requiredDone && done === nextTasks.length ? 'completed' : 'in_progress';

    const payload = {
      offboarding: {
        ...(offboarding || {}),
        status,
        completionPct: pct,
        tasks: nextTasks,
        completedAt: status === 'completed' ? now : offboarding.completedAt || null,
      },
      status: status === 'completed' ? 'Inactive' : (employee.status || 'Offboarding'),
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
    setEmployee((prev) => (prev ? { ...prev, offboarding: payload.offboarding, status: payload.status } : prev));
    if (status === 'completed') {
      success(`✅ Offboarding completed for ${employee.fullName}! Employee has been deactivated.`);
    } else {
      success('Task marked complete');
    }
  };

  const unmarkOffboardingTask = async (taskId) => {
    if (!companyId || !empId || !employee || !currentUser || !offboarding) return;
    const nextTasks = offTasks.map((t) =>
      t.id === taskId ? { ...t, completed: false, completedAt: null, completedBy: null, notes: '' } : t,
    );
    const done = nextTasks.filter((t) => t.completed).length;
    const total = nextTasks.length || 1;
    const pct = Math.round((done / total) * 100);
    const payload = {
      offboarding: {
        ...(offboarding || {}),
        status: done === 0 ? 'not_started' : 'in_progress',
        completionPct: pct,
        completedAt: null,
        tasks: nextTasks,
      },
      status: 'Offboarding',
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
    setEmployee((prev) => (prev ? { ...prev, offboarding: payload.offboarding, status: payload.status } : prev));
    success('Task updated');
  };

  const calculateDueDate = (joiningDate, daysFromJoining) => {
    try {
      let joining;
      if (joiningDate?.toDate) {
        joining = joiningDate.toDate();
      } else if (joiningDate instanceof Date) {
        joining = joiningDate;
      } else if (typeof joiningDate === 'string') {
        joining = new Date(joiningDate);
      } else if (joiningDate?.seconds) {
        joining = new Date(joiningDate.seconds * 1000);
      } else {
        joining = new Date();
      }

      const due = new Date(joining);
      due.setDate(due.getDate() + (Number(daysFromJoining) || 0));
      return Timestamp.fromDate(due);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Date calc error:', e);
      return Timestamp.fromDate(new Date());
    }
  };

  const onboarding = employee?.onboarding || null;
  const onboardingTasks = Array.isArray(onboarding?.tasks) ? onboarding.tasks : [];
  const onboardingCompleted = onboardingTasks.filter((t) => t.completed).length;
  const onboardingTotal = onboardingTasks.length;
  const onboardingPct =
    onboardingTotal > 0 ? Math.round((onboardingCompleted / onboardingTotal) * 100) : 0;

  const onboardingByCategory = useMemo(() => {
    const categories = ['Pre-joining', 'Day 1', 'Week 1', 'Month 1'];
    const tasks = onboardingTasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    return categories.map((cat) => ({
      category: cat,
      tasks: tasks.filter((t) => (t.category || 'Day 1') === cat),
    }));
  }, [onboardingTasks]);

  const handleStartOnboarding = async () => {
    if (!companyId || !empId || !employee || !currentUser) return;
    try {
      // eslint-disable-next-line no-console
      console.log('Starting onboarding for:', empId, 'in company:', companyId);
      setSaving(true);
      let templateTasks = DEFAULT_ONBOARDING_TEMPLATE.tasks;
      try {
        const templateDoc = await getDoc(doc(db, 'companies', companyId, 'settings', 'onboardingTemplate'));
        if (templateDoc.exists() && Array.isArray(templateDoc.data()?.tasks) && templateDoc.data().tasks.length > 0) {
          templateTasks = templateDoc.data().tasks;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('No template found, using default:', e?.message || e);
      }
      // eslint-disable-next-line no-console
      console.log('Template tasks count:', templateTasks.length);

      const now = Timestamp.now();
      const sanitizedTasks = templateTasks
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((t) => ({
          id: t.id || `task_${Date.now()}`,
          title: t.title || '',
          description: t.description || '',
          category: t.category || 'Day 1',
          assignedTo: t.assignedTo || 'hr',
          daysFromJoining: t.daysFromJoining || 0,
          isRequired: t.isRequired || false,
          order: t.order || 0,
          completed: false,
          completedAt: null,
          completedBy: null,
          notes: '',
          dueDate: calculateDueDate(employee.joiningDate, t.daysFromJoining),
        }))
        .map((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)));

      const payload = {
        onboarding: {
          status: 'in_progress',
          startedAt: now,
          completedAt: null,
          completionPct: 0,
          tasks: sanitizedTasks,
        },
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
      setEmployee((prev) => (prev ? { ...prev, ...payload } : prev));
      success('Onboarding started');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Onboarding start error:', error?.message, error);
      showError(`Failed to start: ${error?.message || 'Unknown error'}`);
    }
    setSaving(false);
  };

  const markTaskComplete = async (taskId, notes) => {
    if (!companyId || !empId || !employee || !currentUser || !onboarding) return;
    const now = Timestamp.now();
    const nextTasks = onboardingTasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            completed: true,
            completedAt: now,
            completedBy: currentUser.email || '',
            notes: notes || '',
          }
        : t,
    );
    const done = nextTasks.filter((t) => t.completed).length;
    const total = nextTasks.length || 1;
    const pct = Math.round((done / total) * 100);
    const requiredDone = nextTasks.filter((t) => t.isRequired).every((t) => t.completed);
    const status = requiredDone && done === nextTasks.length ? 'completed' : 'in_progress';

    const payload = {
      onboarding: {
        ...(onboarding || {}),
        status,
        completionPct: pct,
        tasks: nextTasks,
        completedAt: status === 'completed' ? now : onboarding.completedAt || null,
      },
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
    setEmployee((prev) => (prev ? { ...prev, onboarding: payload.onboarding } : prev));
    if (status === 'completed') success('🎉 Onboarding completed!');
    else success('Task marked complete');
  };

  const unmarkTask = async (taskId) => {
    if (!companyId || !empId || !employee || !currentUser || !onboarding) return;
    const nextTasks = onboardingTasks.map((t) =>
      t.id === taskId
        ? { ...t, completed: false, completedAt: null, completedBy: null, notes: '' }
        : t,
    );
    const done = nextTasks.filter((t) => t.completed).length;
    const total = nextTasks.length || 1;
    const pct = Math.round((done / total) * 100);

    const payload = {
      onboarding: {
        ...(onboarding || {}),
        status: done === 0 ? 'not_started' : 'in_progress',
        completionPct: pct,
        completedAt: null,
        tasks: nextTasks,
      },
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
    setEmployee((prev) => (prev ? { ...prev, onboarding: payload.onboarding } : prev));
    success('Task updated');
  };

  const handleAssignAssetChange = (e) => {
    const { name, value } = e.target;
    setAssignAssetForm((prev) => ({ ...prev, [name]: value }));
  };

  const openAssignAssetModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    setAssignAssetForm({
      assetId: '',
      issueDate: today,
      condition: 'Good',
      notes: '',
    });
    setShowAssignAssetModal(true);
  };

  const openProfileAssignModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    setAssignAssetForm({
      assetId: '',
      issueDate: today,
      condition: 'Good',
      notes: '',
    });
    setIssueConsumableAsset(null);
    setIssueConsumableForm({
      quantity: 1,
      issueDate: today,
      condition: 'Good',
      notes: '',
    });
    setProfileAssignMode('trackable');
    setShowProfileAssetDropdown(false);
    setProfileAssetSearch('');
    setShowProfileAssignModal(true);
  };

  const handleSaveAssignFromProfile = async (e) => {
    e.preventDefault();
    if (!companyId || !empId || !employee || !assignAssetForm.assetId || !currentUser) return;
    setSaving(true);
    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', assignAssetForm.assetId);
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) {
        showError('Asset not found');
        setSaving(false);
        return;
      }
      const asset = { id: assetSnap.id, ...assetSnap.data() };
      const issueTs = assignAssetForm.issueDate
        ? Timestamp.fromDate(new Date(assignAssetForm.issueDate))
        : Timestamp.now();
      const historyEntry = {
        action: 'assigned',
        employeeId: empId,
        employeeName: employee.fullName || '',
        date: issueTs,
        condition: assignAssetForm.condition || 'Good',
        notes: assignAssetForm.notes?.trim() || '',
        performedBy: currentUser.email || '',
      };
      const existingHistory = Array.isArray(asset.history) ? asset.history : [];

      await updateDoc(assetRef, {
        status: 'Assigned',
        assignedToId: empId,
        assignedToName: employee.fullName || '',
        assignedToEmpId: employee.empId || '',
        issueDate: issueTs,
        condition: assignAssetForm.condition || asset.condition || 'Good',
        history: [...existingHistory, historyEntry],
      });

      setAssetList((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                ...asset,
                status: 'Assigned',
                assignedToId: empId,
                assignedToName: employee.fullName || '',
                assignedToEmpId: employee.empId || '',
                issueDate: issueTs,
                condition: assignAssetForm.condition || asset.condition || 'Good',
                history: [...existingHistory, historyEntry],
              }
            : a,
        ),
      );
      success('Asset assigned');
      setShowAssignAssetModal(false);
      setShowProfileAssignModal(null);
      setShowProfileAssetDropdown(false);
      setProfileAssetSearch('');
      setIssueConsumableAsset(null);
      setProfileAssignMode('trackable');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to assign asset from profile', err);
      showError('Failed to assign asset');
    }
    setSaving(false);
  };

  const handleIssueConsumableFromProfile = async (e) => {
    e.preventDefault();
    if (!companyId || !empId || !employee || !issueConsumableAsset || !currentUser) return;

    const qty = Number(issueConsumableForm.quantity);
    if (!qty || qty <= 0) return;

    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', issueConsumableAsset.id);
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) {
        showError('Asset not found');
        return;
      }

      const asset = { id: assetSnap.id, ...assetSnap.data() };
      const available = Number(asset.availableStock) || 0;
      if (qty > available) {
        showError(`Only ${available} available`);
        return;
      }

      const issueTs = issueConsumableForm.issueDate
        ? Timestamp.fromDate(new Date(issueConsumableForm.issueDate))
        : Timestamp.now();

      const assignment = {
        employeeId: empId,
        employeeName: employee.fullName || '',
        empId: employee.empId || '',
        quantity: qty,
        issueDate: issueTs,
        condition: issueConsumableForm.condition || 'Good',
        returnDate: null,
        returned: false,
        notes: issueConsumableForm.notes?.trim() || '',
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
            employeeId: empId,
            employeeName: employee.fullName || '',
            quantity: qty,
            date: issueTs,
            condition: issueConsumableForm.condition || 'Good',
            notes: issueConsumableForm.notes?.trim() || '',
            performedBy: currentUser.email || '',
          },
        ],
      });

      success(`${qty} ${asset.name} issued to ${employee.fullName}`);

      // Refresh local asset list
      const assetsSnap = await getDocs(collection(db, 'companies', companyId, 'assets'));
      setAssetList(assetsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      setShowProfileAssignModal(null);
      setIssueConsumableAsset(null);
      setProfileAssignMode('trackable');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to issue consumable from profile', err);
      showError('Failed to issue consumable');
    }
  };

  const handleReturnAssetFromProfile = (asset) => {
    const today = new Date().toISOString().slice(0, 10);
    setReturnAsset(asset);
    setReturnAssetForm({
      date: today,
      condition: 'Good',
      notes: '',
    });
  };

  const handleReturnAssetChange = (e) => {
    const { name, value } = e.target;
    setReturnAssetForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveReturnFromProfile = async (e) => {
    e.preventDefault();
    if (!companyId || !returnAsset || !currentUser) return;
    setSaving(true);
    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', returnAsset.id);
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) {
        showError('Asset not found');
        setSaving(false);
        return;
      }
      const asset = { id: assetSnap.id, ...assetSnap.data() };
      const returnTs = returnAssetForm.date
        ? Timestamp.fromDate(new Date(returnAssetForm.date))
        : Timestamp.now();
      const isDamaged = returnAssetForm.condition === 'Damaged';
      const newStatus = isDamaged ? 'Damaged' : 'Available';
      const historyEntry = {
        action: 'returned',
        employeeId: empId,
        employeeName: employee.fullName || '',
        date: returnTs,
        condition: returnAssetForm.condition || 'Good',
        notes: returnAssetForm.notes?.trim() || '',
        performedBy: currentUser.email || '',
      };
      const existingHistory = Array.isArray(asset.history) ? asset.history : [];

      await updateDoc(assetRef, {
        status: newStatus,
        assignedToId: null,
        assignedToName: null,
        assignedToEmpId: null,
        returnDate: returnTs,
        condition: returnAssetForm.condition || asset.condition || 'Good',
        history: [...existingHistory, historyEntry],
      });

      setAssetList((prev) =>
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
                condition: returnAssetForm.condition || asset.condition || 'Good',
                history: [...existingHistory, historyEntry],
              }
            : a,
        ),
      );
      success('Asset returned');
      setReturnAsset(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to return asset from profile', err);
      showError('Failed to return asset');
    }
    setSaving(false);
  };

  const handleReturnConsumableFromProfile = async () => {
    try {
      if (!returnConsumableModal || !companyId || !empId || !employee || !currentUser) return;

      const { asset, assignment } = returnConsumableModal;
      if (!asset || !assignment) return;

      const assetRef = doc(db, 'companies', companyId, 'assets', asset.id);

      const qty = Math.min(Number(returnQty) || 0, Number(assignment.quantity) || 0);
      if (!qty || qty <= 0) {
        showError('Invalid return quantity');
        return;
      }

      const assignmentIssueSeconds = assignment.issueDate?.seconds ?? 0;

      // Refresh asset to avoid stale stock counts
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) {
        showError('Asset not found');
        return;
      }

      const assetData = { id: assetSnap.id, ...assetSnap.data() };
      const existingAssignments = Array.isArray(assetData.assignments) ? assetData.assignments : [];
      const existingHistory = Array.isArray(assetData.history) ? assetData.history : [];

      const updatedAssignments = existingAssignments.map((a) => {
        const aIssueSeconds = a.issueDate?.seconds ?? 0;
        const matchesThisEmployeeAssignment =
          a.employeeId === empId && !a.returned && aIssueSeconds === assignmentIssueSeconds;

        if (!matchesThisEmployeeAssignment) return a;

        const remaining = Number(a.quantity) - qty;
        if (remaining <= 0) {
          return {
            ...a,
            returned: true,
            returnDate: Timestamp.fromDate(new Date()),
            quantity: 0,
          };
        }

        return {
          ...a,
          quantity: remaining,
        };
      });

      const newHistory = [
        ...existingHistory,
        {
          action: 'returned',
          employeeId: empId,
          employeeName: employee.fullName,
          quantity: qty,
          date: Timestamp.fromDate(new Date()),
          condition: returnCondition,
          notes: returnNotes?.trim() || '',
          performedBy: currentUser.email,
        },
      ];

      await updateDoc(assetRef, {
        assignments: updatedAssignments,
        issuedCount: Math.max(0, Number(assetData.issuedCount || 0) - qty),
        availableStock: Number(assetData.availableStock || 0) + qty,
        history: newHistory,
      });

      success(`${qty} ${assetData.name} returned successfully`);

      // Refresh local asset list
      const assetsSnap = await getDocs(collection(db, 'companies', companyId, 'assets'));
      setAssetList(assetsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      setReturnConsumableModal(null);
      setReturnQty(1);
      setReturnCondition('Good');
      setReturnNotes('');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to return consumable from profile', error);
      showError(`Return failed: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleReturnAllAndDeactivate = async () => {
    if (!companyId || !empId || !employee || !currentUser || pendingReturnAssets.length === 0) {
      setShowAssetReturnWarning(false);
      return;
    }
    setSaving(true);
    try {
      const now = new Date();
      const tsNow = Timestamp.fromDate(now);
      // return all assets
      // eslint-disable-next-line no-restricted-syntax
      for (const asset of pendingReturnAssets) {
        if (asset.kind === 'trackable') {
          const assetRef = doc(db, 'companies', companyId, 'assets', asset.docId);
          const assetSnap = await getDoc(assetRef);
          if (!assetSnap.exists()) continue;
          const currentAsset = { id: assetSnap.id, ...assetSnap.data() };
          const existingHistory = Array.isArray(currentAsset.history) ? currentAsset.history : [];
          const historyEntry = {
            action: 'returned',
            employeeId: empId,
            employeeName: employee.fullName || '',
            date: tsNow,
            condition: currentAsset.condition || 'Good',
            notes: 'Auto-returned on employee deactivation',
            performedBy: currentUser.email || '',
          };
          await updateDoc(assetRef, {
            status: 'Available',
            assignedToId: null,
            assignedToName: null,
            assignedToEmpId: null,
            returnDate: tsNow,
            history: [...existingHistory, historyEntry],
          });
        } else if (asset.kind === 'consumable') {
          const assetRef = doc(db, 'companies', companyId, 'assets', asset.docId);
          const assetSnap = await getDoc(assetRef);
          if (!assetSnap.exists()) continue;

          const currentAsset = { id: assetSnap.id, ...assetSnap.data() };
          const assignments = Array.isArray(currentAsset.assignments) ? currentAsset.assignments : [];
          const existingHistory = Array.isArray(currentAsset.history) ? currentAsset.history : [];

          const issueSeconds = asset.issueDate?.seconds || 0;
          const assignmentIdx = assignments.findIndex(
            (as) =>
              as.employeeId === empId &&
              !as.returned &&
              (as.issueDate?.seconds || 0) === issueSeconds,
          );

          if (assignmentIdx === -1) continue;
          const existingAssignment = assignments[assignmentIdx];
          const qtyToReturn = Number(existingAssignment.quantity) || 0;

          const nextAssignments = assignments.map((as, idx) => {
            if (idx !== assignmentIdx) return as;
            return {
              ...as,
              quantity: 0,
              returned: true,
              returnDate: tsNow,
            };
          });

          await updateDoc(assetRef, {
            assignments: nextAssignments,
            availableStock: (Number(currentAsset.availableStock) || 0) + qtyToReturn,
            issuedCount: (Number(currentAsset.issuedCount) || 0) - qtyToReturn,
            history: [
              ...existingHistory,
              {
                action: 'returned',
                employeeId: empId,
                employeeName: asset.employeeName || employee.fullName || '',
                quantity: qtyToReturn,
                date: tsNow,
                condition: asset.condition || 'Good',
                notes: 'Auto-returned on employee deactivation',
                performedBy: currentUser.email || '',
              },
            ],
          });
        }
      }

      // Deactivate employee
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), {
        status: 'Inactive',
        updatedAt: serverTimestamp(),
      });
      setEmployee((prev) => (prev ? { ...prev, status: 'Inactive' } : null));
      setShowAssetReturnWarning(false);
      setPendingReturnAssets([]);
      success(`${pendingReturnAssets.length} asset(s) returned and employee deactivated`);
    } catch (err) {
      showError(`Error returning assets: ${err?.message || 'Unknown error'}`);
    }
    setSaving(false);
  };

  const handlePrintProfile = () => {
    const companyName = getCompanyName() || '';
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Employee Profile - ${employee.fullName || ''}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 40px; color: #1f2937; }
        .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
        .avatar { width: 64px; height: 64px; border-radius: 50%; background: #3B82F6; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: bold; }
        .name { font-size: 24px; font-weight: bold; }
        .subtitle { color: #6B7280; font-size: 14px; margin-top: 4px; }
        .company { font-size: 13px; color: #374151; margin-top: 2px; }
        .section { margin-bottom: 24px; }
        .section-title { font-size: 13px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .field-label { font-size: 11px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; }
        .field-value { font-size: 13px; color: #1f2937; margin-top: 2px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
        .badge-active { background: #D1FAE5; color: #065F46; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9CA3AF; display: flex; justify-content: space-between; }
        @media print { body { padding: 20px; } .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="avatar">
          ${(employee.fullName || 'E').charAt(0)}
        </div>
        <div>
          <div class="name">
            ${employee.fullName || ''}
          </div>
          <div class="subtitle">
            ${employee.designation || ''} · ${employee.department || ''}
          </div>
          <div class="company">
            ${companyName} · ${employee.empId || ''}
          </div>
        </div>
        <div style="margin-left: auto;">
          <span class="badge badge-active">
            ${employee.status || 'Active'}
          </span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Personal Information</div>
        <div class="grid">
          <div>
            <div class="field-label">Full Name</div>
            <div class="field-value">${employee.fullName || '—'}</div>
          </div>
          <div>
            <div class="field-label">Father's Name</div>
            <div class="field-value">${employee.fatherName || '—'}</div>
          </div>
          <div>
            <div class="field-label">Email</div>
            <div class="field-value">${employee.email || '—'}</div>
          </div>
          <div>
            <div class="field-label">Phone</div>
            <div class="field-value">${employee.phone || '—'}</div>
          </div>
          <div>
            <div class="field-label">Date of Birth</div>
            <div class="field-value">${toDisplayDate(employee.dateOfBirth) || '—'}</div>
          </div>
          <div>
            <div class="field-label">Gender</div>
            <div class="field-value">${employee.gender || '—'}</div>
          </div>
          <div>
            <div class="field-label">Address</div>
            <div class="field-value">
              ${
                [
                  employee.streetAddress,
                  employee.city,
                  employee.state,
                  employee.pincode,
                  employee.country,
                ]
                  .filter(Boolean)
                  .join(', ') || employee.address || '—'
              }
            </div>
          </div>
          <div>
            <div class="field-label">Qualification</div>
            <div class="field-value">${employee.qualification || '—'}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Employment Details</div>
        <div class="grid">
          <div>
            <div class="field-label">Emp ID</div>
            <div class="field-value">${employee.empId || '—'}</div>
          </div>
          <div>
            <div class="field-label">Department</div>
            <div class="field-value">${employee.department || '—'}</div>
          </div>
          <div>
            <div class="field-label">Designation</div>
            <div class="field-value">${employee.designation || '—'}</div>
          </div>
          <div>
            <div class="field-label">Branch</div>
            <div class="field-value">${employee.branch || '—'}</div>
          </div>
          <div>
            <div class="field-label">Employment Type</div>
            <div class="field-value">${employee.employmentType || '—'}</div>
          </div>
          <div>
            <div class="field-label">Category</div>
            <div class="field-value">${employee.category || '—'}</div>
          </div>
          <div>
            <div class="field-label">Joining Date</div>
            <div class="field-value">${toDisplayDate(employee.joiningDate) || '—'}</div>
          </div>
          <div>
            <div class="field-label">Reporting Manager</div>
            <div class="field-value">${employee.reportingManagerName || '—'}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Compensation</div>
        <div class="grid">
          <div>
            <div class="field-label">CTC per Annum</div>
            <div class="field-value">
              ${
                employee.ctcPerAnnum != null || employee.ctc != null
                  ? `₹${(employee.ctcPerAnnum ?? employee.ctc).toLocaleString('en-IN')}`
                  : '—'
              }
            </div>
          </div>
          <div>
            <div class="field-label">Basic Salary</div>
            <div class="field-value">
              ${
                employee.basicSalary != null
                  ? `₹${employee.basicSalary.toLocaleString('en-IN')}/month`
                  : '—'
              }
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Statutory</div>
        <div class="grid">
          <div>
            <div class="field-label">PAN Number</div>
            <div class="field-value">${employee.panNumber || '—'}</div>
          </div>
          <div>
            <div class="field-label">PF Number</div>
            <div class="field-value">${employee.pfNumber || '—'}</div>
          </div>
          <div>
            <div class="field-label">ESIC Number</div>
            <div class="field-value">${employee.esicNumber || '—'}</div>
          </div>
          <div>
            <div class="field-label">Aadhaar</div>
            <div class="field-value">
              ${
                employee.aadhaarNumber
                  ? `XXXX XXXX ${employee.aadhaarNumber.slice(-4)}`
                  : '—'
              }
            </div>
          </div>
          <div>
            <div class="field-label">Driving Licence</div>
            <div class="field-value">${employee.drivingLicenceNumber || '—'}</div>
          </div>
        </div>
      </div>

      ${
        employee.emergencyContact?.name
          ? `
      <div class="section">
        <div class="section-title">Emergency Contact</div>
        <div class="grid">
          <div>
            <div class="field-label">Name</div>
            <div class="field-value">${employee.emergencyContact.name}</div>
          </div>
          <div>
            <div class="field-label">Relationship</div>
            <div class="field-value">${employee.emergencyContact.relationship || '—'}</div>
          </div>
          <div>
            <div class="field-label">Phone</div>
            <div class="field-value">${employee.emergencyContact.phone}</div>
          </div>
          <div>
            <div class="field-label">Email</div>
            <div class="field-value">${employee.emergencyContact.email || '—'}</div>
          </div>
        </div>
      </div>`
          : ''
      }

      ${
        employeeAssets.length > 0
          ? `
      <div class="section">
        <div class="section-title">Assigned Assets (${employeeAssets.length})</div>
        <div class="grid">
          ${employeeAssets
            .map(
              (a) => `
          <div>
            <div class="field-label">${a.assetId || ''}</div>
            <div class="field-value">
              ${a.name || ''}
              ${
                a.serialNumber
                  ? ` (SN: ${a.serialNumber})`
                  : ''
              }
            </div>
          </div>`,
            )
            .join('')}
        </div>
      </div>`
          : ''
      }

      <div class="footer">
        <span>Generated by AttendX HR Platform</span>
        <span>${new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}</span>
      </div>
    </body>
    </html>
    `;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const allTabs = useMemo(
    () => [
      { id: 'personal', label: 'Personal Info' },
      { id: 'documents', label: 'Documents' },
      { id: 'leave', label: 'Leave History' },
      { id: 'assets', label: 'Assets' },
      { id: 'onboarding', label: 'Onboarding' },
      { id: 'offboarding', label: 'Offboarding' },
      { id: 'timeline', label: 'Timeline' },
    ],
    [],
  );

  const visibleTabs = useMemo(() => {
    if (userRole === 'itmanager') {
      return allTabs.filter((t) => ['personal', 'assets', 'timeline'].includes(t.id));
    }
    return allTabs;
  }, [userRole, allTabs]);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0]?.id || 'personal');
    }
  }, [visibleTabs, tab]);

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#4ECDC4] border-t-transparent" />
      </div>
    );
  }
  if (!employee) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Employee not found.</p>
        <Link to={`/company/${companyId}/employees`} className="text-[#1B6B6B] text-sm mt-2 inline-block">← Employees</Link>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Link to={`/company/${companyId}/employees`} className="text-sm text-slate-600 hover:text-[#1B6B6B] mb-4 inline-block">← Employees</Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex flex-wrap items-start gap-6">
          <div className="h-14 w-14 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0" style={{ backgroundColor: deptColor }}>
            {(employee.fullName || '?').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800">{employee.fullName || '—'}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{employee.designation || '—'}</span>
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{employee.department || '—'}</span>
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{employee.employmentType || 'Full-time'}</span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  employee.status === 'Active'
                    ? 'bg-green-100 text-green-800'
                    : employee.status === 'On Leave'
                    ? 'bg-amber-100 text-amber-800'
                    : employee.status === 'Offboarding'
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {employee.status || 'Active'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Joined {toDisplayDate(employee.joiningDate)}
              <span className="mx-2 text-gray-300">·</span>
              <span className="text-[#1B6B6B] font-medium">
                {getTenure(employee.joiningDate)}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            {canEditEmployees && (
              <button
                type="button"
                onClick={openEdit}
                className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={handlePrintProfile}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 10H1.5A1.5 1.5 0 0 1 0 8.5v-3A1.5 1.5 0 0 1 1.5 4H3M11 10h1.5A1.5 1.5 0 0 0 14 8.5v-3A1.5 1.5 0 0 0 12.5 4H11M3 4V1.5A1.5 1.5 0 0 1 4.5 0h5A1.5 1.5 0 0 1 11 1.5V4M3 10v2.5A1.5 1.5 0 0 0 4.5 14h5a1.5 1.5 0 0 0 1.5-1.5V10M3 10h8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              Print
            </button>
            {canEditEmployees && (employee.status || 'Active') === 'Active' && (
              <button
                type="button"
                onClick={handleDeactivate}
                className="rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium px-4 py-2"
              >
                Deactivate
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 mb-6">
        {visibleTabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium rounded-t-lg ${tab === t.id ? 'bg-white border border-slate-200 border-b-white -mb-px text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'personal' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p><span className="text-slate-500 text-sm">Full Name</span><br />{employee.fullName || '—'}</p>
              <p><span className="text-slate-500 text-sm">Father&apos;s Name</span><br />{employee.fatherName || '—'}</p>
              <p><span className="text-slate-500 text-sm">Email</span><br />{employee.email || '—'}</p>
              <p><span className="text-slate-500 text-sm">Phone</span><br />{employee.phone || '—'}</p>
              <p><span className="text-slate-500 text-sm">Date of Birth</span><br />{employee.dateOfBirth ? `${toDisplayDate(employee.dateOfBirth)}${getAge(employee.dateOfBirth) != null ? ` (${getAge(employee.dateOfBirth)} years old)` : ''}` : '—'}</p>
              <p><span className="text-slate-500 text-sm">Gender</span><br />{employee.gender || '—'}</p>
              <p><span className="text-slate-500 text-sm">Highest Qualification</span><br />{employee.qualification || '—'}</p>
              <div>
                <span className="text-slate-500 text-sm">Address</span>
                {employee.streetAddress || employee.city || employee.state || employee.pincode || employee.country ? (
                  <div className="mt-1">
                    {employee.streetAddress && <p className="text-sm text-gray-800">{employee.streetAddress}</p>}
                    {(employee.city || employee.state || employee.pincode) && (
                      <p className="text-sm text-gray-800">
                        {[employee.city, employee.state, employee.pincode].filter(Boolean).join(', ')}
                      </p>
                    )}
                    <p className="text-sm text-gray-800">
                      {employee.country || 'India'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-800 mt-1">
                    {employee.address || '—'}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-3">
              <p><span className="text-slate-500 text-sm">Emp ID</span><br />{employee.empId || '—'}</p>
              <p><span className="text-slate-500 text-sm">Department</span><br />{employee.department || '—'}</p>
              <p><span className="text-slate-500 text-sm">Branch</span><br />{employee.branch || '—'}</p>
              <p><span className="text-slate-500 text-sm">Designation</span><br />{employee.designation || '—'}</p>
              <p><span className="text-slate-500 text-sm">Employment Type</span><br />{employee.employmentType || '—'}</p>
              <p><span className="text-slate-500 text-sm">Category</span><br />{employee.category || '—'}</p>
              <div>
                <span className="text-slate-500 text-sm">Reporting Manager</span>
                <br />
                {employee.reportingManagerId ? (
                  <div
                    onClick={() => navigate(`/company/${companyId}/employees/${employee.reportingManagerId}`)}
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 group mt-1"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B] group-hover:bg-[#9DD8D8] transition-colors">
                      {employee.reportingManagerName?.charAt(0)}
                    </div>
                    <div>
                      <span className="text-sm text-[#1B6B6B] font-medium group-hover:underline">
                        {employee.reportingManagerName}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">
                        ({employee.reportingManagerEmpId})
                      </span>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#4ECDC4] group-hover:text-[#1B6B6B]">
                      <path d="M2 10L10 2M10 2H4M10 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
              <p><span className="text-slate-500 text-sm">Joining Date</span><br />{toDisplayDate(employee.joiningDate)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-medium text-slate-800 mb-3">Compensation</h3>
            {!showSalary ? (
              <div className="flex items-center gap-3">
                <span className="text-slate-400 select-none">₹ ••••••••</span>
                <button type="button" onClick={() => setShowSalary(true)} className="text-sm text-[#1B6B6B] hover:underline">Show</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <p>CTC per annum: ₹{(employee.ctcPerAnnum ?? employee.ctc ?? 0).toLocaleString('en-IN')}</p>
                <p>Basic Salary: ₹{(employee.basicSalary ?? 0).toLocaleString('en-IN')}/month</p>
                <p>HRA: ₹{(employee.hra ?? 0).toLocaleString('en-IN')}/month</p>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-medium text-slate-800 mb-3">Statutory</h3>
            <p className="text-sm">PAN: {employee.panNumber || '—'}</p>
            <p className="text-sm">Aadhaar: {employee.aadhaarNumber ? `XXXX XXXX ${employee.aadhaarNumber.slice(-4)}` : '—'}</p>
            <p className="text-sm">PF Number: {employee.pfNumber || '—'}</p>
            <p className="text-sm">ESIC Number: {employee.esicNumber || '—'}</p>
            <div className="mt-3">
              <p className="text-xs text-gray-400">
                Driving Licence No.
              </p>
              <p className="text-sm text-gray-800">
                {employee.drivingLicenceNumber || '—'}
              </p>
            </div>
          </div>
          <div className="bg-white border rounded-xl p-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Emergency Contact</h3>
            {employee.emergencyContact?.name ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Name</p>
                  <p className="text-sm text-gray-800 font-medium">
                    {employee.emergencyContact.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Relationship</p>
                  <p className="text-sm text-gray-800">
                    {employee.emergencyContact.relationship}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Phone</p>
                  <p className="text-sm text-gray-800">
                    {employee.emergencyContact.phone}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Email</p>
                  <p className="text-sm text-gray-800">
                    {employee.emergencyContact.email || '—'}
                  </p>
                </div>
                {employee.emergencyContact.address && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-400">Address</p>
                    <p className="text-sm text-gray-800">
                      {employee.emergencyContact.address}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No emergency contact added</p>
            )}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-6">
          {!canUploadDocuments && (
            <div className="flex items-center gap-2 p-3 bg-[#E8F5F5] border border-[#E8F5F5] rounded-lg mb-4">
              <span className="text-[#1B6B6B] text-sm">ℹ️ Only HR Manager and Admin can upload or delete documents.</span>
            </div>
          )}
          {!googleAccessToken && canUploadDocuments && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <span className="text-amber-600 text-sm">
                Google Drive session expired. Please sign out and sign back in to upload documents.
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 whitespace-nowrap"
              >
                Sign out &amp; back in
              </button>
            </div>
          )}

          {uploadingDocId && (
            <div className="rounded-xl border border-[#4ECDC4] bg-[#4ECDC4]/10 p-3 text-sm text-[#1B6B6B] font-medium flex items-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#4ECDC4] border-t-transparent" />
              Uploading to Google Drive...
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Document Completion</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full ${progressColor} transition-all`} style={{ width: `${documentCompletion}%` }} />
              </div>
              <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
                {mandatoryUploaded} of {totalMandatory} mandatory documents uploaded
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-1">
              {totalMandatory - mandatoryUploaded === 0
                ? 'All mandatory documents uploaded'
                : `${totalMandatory - mandatoryUploaded} mandatory document${totalMandatory - mandatoryUploaded !== 1 ? 's' : ''} missing`}
            </p>
          </div>

          {activeChecklist.map((cat) => {
            const open = categoryOpen[cat.category] !== false;
            const uploadedInCat = cat.documents.filter((d) => docByType[d.id]).length;
            return (
              <div key={cat.category} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCategoryOpen((p) => ({ ...p, [cat.category]: !open }))}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
                >
                  <span className="font-medium text-slate-800">{cat.category}</span>
                  <span className="text-slate-500 text-sm">{uploadedInCat} of {cat.documents.length} uploaded</span>
                  <span className="text-slate-400">{open ? '▼' : '▶'}</span>
                </button>
                {open && (
                  <ul className="divide-y divide-slate-100">
                    {cat.documents.map((doc) => {
                      const uploaded = docByType[doc.id];
                      const uploading = uploadingDocId === doc.id;
                      const isReplacing = uploaded?.fileId && replacingDocId === uploaded.fileId;
                      const isDeleting = uploaded?.fileId && deletingDocId === uploaded.fileId;
                      const rowBusy = uploading || isReplacing || isDeleting;
                      const acceptList = Array.isArray(doc.accepts) ? doc.accepts : ['.pdf', '.jpg', '.jpeg', '.png'];
                      const acceptAttr = acceptList.join(',');
                      const hint = `${acceptList.map((e) => e.replace('.', '').toUpperCase()).join(', ')} · Max ${doc.maxSizeMB || 5}MB`;
                      return (
                        <li key={doc.id} className="px-4">
                          {uploaded ? (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3 w-full">
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${getFileIconColor(uploaded.fileName || doc.name)}`}
                              >
                                {getFileExt(uploaded.fileName || doc.name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {uploaded.fileName || doc.name}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {formatFileSizeDetailed(uploaded.fileSize)} · Uploaded {formatDocDate(uploaded.uploadedAt)}
                                </p>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                {uploaded.webViewLink && (
                                  <button
                                    type="button"
                                    onClick={() => handleViewDoc(uploaded)}
                                    disabled={rowBusy}
                                    className="px-2.5 py-1 text-xs font-medium text-[#1B6B6B] bg-[#E8F5F5] rounded-lg hover:bg-[#C5E8E8] transition-colors disabled:opacity-50"
                                  >
                                    View
                                  </button>
                                )}
                                {canUploadDocuments && (
                                  <label className={`${rowBusy ? 'pointer-events-none opacity-50' : ''}`}>
                                    <span className="px-2.5 py-1 text-xs font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors inline-block cursor-pointer">
                                      Replace
                                    </span>
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept={acceptAttr}
                                      disabled={rowBusy}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleReplaceDoc(f, doc.id);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                )}
                                {canUploadDocuments && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirm({ type: 'checklist', doc: uploaded })}
                                    disabled={rowBusy}
                                    className="px-2.5 py-1 text-xs font-medium text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between py-3 border-b last:border-0">
                              <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 border-gray-300" />
                                <div>
                                  <p className="text-sm font-medium text-gray-800">
                                    {doc.name}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {doc.mandatory ? (
                                      <span className="text-red-500">Mandatory</span>
                                    ) : (
                                      'Optional'
                                    )}
                                    {' · '}
                                    {acceptList.map((e) => e.replace('.', '').toUpperCase()).join(', ')}
                                    {' · '}Max {doc.maxSizeMB || 5}MB
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {canUploadDocuments ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const input = document.getElementById(`doc-upload-${doc.id}`);
                                        if (input) input.click();
                                      }}
                                      disabled={uploadingDocId === doc.id}
                                      className="px-4 py-1.5 bg-[#1B6B6B] text-white text-sm rounded-lg hover:bg-[#155858] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                    >
                                      {uploadingDocId === doc.id ? 'Uploading...' : 'Upload'}
                                    </button>
                                    <input
                                      id={`doc-upload-${doc.id}`}
                                      type="file"
                                      className="hidden"
                                      accept={acceptAttr}
                                      disabled={!!uploadingDocId}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleUploadChecklistDoc(f, doc.id, doc.name, cat.category);
                                        e.target.value = '';
                                      }}
                                    />
                                  </>
                                ) : (
                                  <span className="text-xs text-gray-400 italic">View only</span>
                                )}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <h3 className="px-4 py-3 bg-slate-50 font-medium text-slate-800">Additional Documents</h3>
            <div className="p-4 space-y-3">
              {canUploadDocuments && (
                <div className="flex flex-wrap items-end gap-3">
                  <input
                    type="text"
                    value={additionalDocName}
                    onChange={(e) => setAdditionalDocName(e.target.value)}
                    placeholder="Document name"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48"
                  />
                  <select value={additionalDocCategory} onChange={(e) => setAdditionalDocCategory(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    ref={additionalFileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => setAdditionalDocFile(e.target.files?.[0] || null)}
                  />
                  <button type="button" onClick={() => additionalFileInputRef.current?.click()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                    {additionalDocFile ? additionalDocFile.name : 'Choose file'}
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadAdditionalDoc}
                    disabled={uploadingDocId === 'additional' || !additionalDocName.trim() || !additionalDocFile}
                    className="rounded-lg bg-[#1B6B6B] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                  >
                    {uploadingDocId === 'additional' ? 'Uploading…' : 'Upload Additional Document'}
                  </button>
                </div>
              )}
              {additionalDocs.length === 0 ? (
                <p className="text-slate-500 text-sm">No additional documents</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {additionalDocs.map((doc, i) => (
                    <li key={doc.fileId || i} className="flex items-center justify-between py-2">
                      <span className="text-sm">{doc.name} — {formatDocDate(doc.uploadedAt)}</span>
                      <div className="flex gap-2">
                        {doc.webViewLink && <a href={doc.webViewLink} target="_blank" rel="noopener noreferrer" className="text-[#1B6B6B] text-xs">View</a>}
                        {canUploadDocuments && (
                          <button type="button" onClick={() => setDeleteConfirm({ type: 'additional', index: i })} className="text-red-600 text-xs">
                            Delete
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  Delete {deleteConfirm.type === 'checklist' ? deleteConfirm.doc.name : 'document'}?
                </h3>
                <p className="text-sm text-slate-600 mb-4">File will be removed from Google Drive.</p>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setDeleteConfirm(null)} className="text-slate-500 text-sm">Cancel</button>
                    <button
                      type="button"
                      onClick={() => deleteConfirm.type === 'checklist' ? handleDeleteChecklistDoc(deleteConfirm.doc) : handleDeleteAdditionalDoc(deleteConfirm.index)}
                      className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                      disabled={!!deletingDocId}
                    >
                      {deletingDocId ? 'Deleting…' : 'Delete'}
                    </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'leave' && (
        <div className="space-y-6">
          {leaveError && (
            <p className="text-red-500 text-sm text-center py-4">Error loading leave: {leaveError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profilePaidLeaveTypes.map((lt) => (
              <div key={lt.shortCode} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-slate-500 text-sm truncate" title={lt.name}>
                  {lt.name}
                  <span className="block text-xs font-mono text-[#1B6B6B] mt-0.5">{lt.shortCode}</span>
                </p>
                <p className="font-semibold text-slate-800">
                  {leaveUsedByTypeProfile[lt.name] ?? 0} / {getMaxLeaveForProfileType(lt, leavePolicy)}
                </p>
              </div>
            ))}
          </div>
          {Array.isArray(leaveList) && leaveList.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Start</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">End</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Days</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Reason</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveList.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${leaveTypePillClassResolved(l.leaveType)}`}
                        >
                          {l.leaveType || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2">{l.startDate ? toDisplayDate(l.startDate) : '—'}</td>
                      <td className="px-4 py-2">{l.endDate ? toDisplayDate(l.endDate) : '—'}</td>
                      <td className="px-4 py-2">{l.days ?? '—'}</td>
                      <td className="px-4 py-2">{l.reason || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] || 'bg-slate-100'}`}>
                          {l.status || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-gray-400 text-sm">No leave records found</p>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="space-y-0">
          {timelineEvents.map((event, index) => (
            <div key={`${event.type}-${index}`} className="flex gap-4 pb-6 relative">
              {index < timelineEvents.length - 1 && (
                <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-gray-100" aria-hidden />
              )}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0 z-10 ${
                  event.color === 'green'
                    ? 'bg-green-100'
                    : event.color === 'red'
                      ? 'bg-red-100'
                      : event.color === 'amber'
                        ? 'bg-amber-100'
                        : event.color === 'purple'
                          ? 'bg-purple-100'
                          : 'bg-[#C5E8E8]'
                }`}
              >
                {event.icon}
              </div>
              <div className="flex-1 pt-1.5 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800">{event.title}</p>
                  <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                    {event.date instanceof Date && !Number.isNaN(event.date.getTime()) ? toDisplayDate(event.date) : '—'}
                  </span>
                </div>
                {event.description && <p className="text-xs text-gray-500 mt-0.5">{event.description}</p>}
              </div>
            </div>
          ))}
          {timelineEvents.length === 0 && (
            <p className="text-center py-8 text-gray-400 text-sm">No activity recorded yet</p>
          )}
        </div>
      )}

      {showEditModal && form && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit Employee</h2>
                    <form onSubmit={handleSaveEdit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs text-slate-600 mb-1">Full Name</label><input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" required /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" required /></div>
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Father&apos;s Name</label><input value={form.fatherName} onChange={(e) => setForm((p) => ({ ...p, fatherName: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Father's full name" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Phone</label><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">DOB</label><input type="date" value={form.dateOfBirth} onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Gender</label><select value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Street Address</label><input value={form.streetAddress} onChange={(e) => setForm((p) => ({ ...p, streetAddress: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="House/Flat no, Street name" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">City</label><input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="City" /></div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">State</label>
                          <select
                            value={form.state}
                            onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">Select state</option>
                            {INDIAN_STATES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div><label className="block text-xs text-slate-600 mb-1">Pincode</label><input value={form.pincode} onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" maxLength={6} placeholder="6-digit pincode" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Country</label><input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Country" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Emp ID</label><input value={form.empId} onChange={(e) => setForm((p) => ({ ...p, empId: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Department</label><select value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{!departments.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Branch</label><select value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{branches.map((b) => <option key={b} value={b}>{b}</option>)}{!branches.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Designation</label><select value={form.designation} onChange={(e) => setForm((p) => ({ ...p, designation: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{designations.map((d) => <option key={d} value={d}>{d}</option>)}{!designations.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Employment Type</label><select value={form.employmentType} onChange={(e) => setForm((p) => ({ ...p, employmentType: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}{!employmentTypes.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Category</label><select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}{!categories.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Highest Qualification</label><select value={form.qualification} onChange={(e) => setForm((p) => ({ ...p, qualification: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{qualifications.map((q) => <option key={q} value={q}>{q}</option>)}{!qualifications.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Joining Date</label><input type="date" value={form.joiningDate} onChange={(e) => setForm((p) => ({ ...p, joiningDate: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                        <div className="col-span-2">
                  <label className="block text-xs text-slate-600 mb-1">Reporting Manager</label>
                  <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setShowManagerDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setShowManagerDropdown(true);
                        }
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:border-[#4ECDC4]"
                    >
                      {form.reportingManagerId ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B]">
                            {form.reportingManagerName?.charAt(0)}
                          </div>
                          <span className="text-slate-800 truncate">{form.reportingManagerName}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">{form.reportingManagerEmpId}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Select reporting manager</span>
                      )}
                      <div className="flex items-center gap-1">
                        {form.reportingManagerId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setForm((prev) => ({
                                ...prev,
                                reportingManagerId: '',
                                reportingManagerName: '',
                                reportingManagerEmpId: '',
                              }));
                            }}
                            className="text-slate-400 hover:text-slate-600 text-xs"
                          >
                            ✕
                          </button>
                        )}
                        <span className="text-slate-400 text-xs">▾</span>
                      </div>
                    </div>

                    {showManagerDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search by name or ID..."
                            value={managerSearch}
                            onChange={(e) => setManagerSearch(e.target.value)}
                            className="w-full text-sm px-2 py-1.5 border rounded focus:outline-none focus:border-[#4ECDC4]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <div className="overflow-y-auto max-h-36">
                          <div
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                reportingManagerId: '',
                                reportingManagerName: '',
                                reportingManagerEmpId: '',
                              }));
                              setShowManagerDropdown(false);
                              setManagerSearch('');
                            }}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                          >
                            <span className="text-sm text-slate-400">— None</span>
                          </div>

                          {allEmployees
                            .filter((emp) => {
                              if (employee?.empId && emp.empId === employee.empId) return false;
                              if (!managerSearch) return true;
                              const term = managerSearch.toLowerCase();
                              return (
                                emp.fullName?.toLowerCase().includes(term) ||
                                emp.empId?.toLowerCase().includes(term) ||
                                emp.designation?.toLowerCase().includes(term)
                              );
                            })
                            .map((emp) => (
                              <div
                                key={emp.id}
                                onClick={() => {
                                  setForm((prev) => ({
                                    ...prev,
                                    reportingManagerId: emp.id,
                                    reportingManagerName: emp.fullName || '',
                                    reportingManagerEmpId: emp.empId || '',
                                  }));
                                  setShowManagerDropdown(false);
                                  setManagerSearch('');
                                }}
                                className={`flex items-center gap-3 px-3 py-2 hover:bg-[#E8F5F5] cursor-pointer ${
                                  form.reportingManagerId === emp.id ? 'bg-[#E8F5F5]' : ''
                                }`}
                              >
                                <div className="w-7 h-7 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B] flex-shrink-0">
                                  {emp.fullName?.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p>
                                  <p className="text-xs text-slate-400">{emp.empId} · {emp.designation || '—'}</p>
                                </div>
                                {form.reportingManagerId === emp.id && (
                                  <span className="text-[#1B6B6B] text-xs">✓</span>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div><label className="block text-xs text-slate-600 mb-1">CTC</label><input type="number" value={form.ctcPerAnnum} onChange={(e) => setForm((p) => ({ ...p, ctcPerAnnum: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Basic Salary</label><input type="number" value={form.basicSalary} onChange={(e) => setForm((p) => ({ ...p, basicSalary: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">HRA</label><input type="number" value={form.hra} onChange={(e) => setForm((p) => ({ ...p, hra: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">PAN</label><input value={form.panNumber} onChange={(e) => setForm((p) => ({ ...p, panNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Aadhaar</label><input value={form.aadhaarNumber} onChange={(e) => setForm((p) => ({ ...p, aadhaarNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="12-digit number" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Driving Licence No.</label><input value={form.drivingLicenceNumber} onChange={(e) => setForm((p) => ({ ...p, drivingLicenceNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="e.g. MH0120210012345" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">PF Number</label><input value={form.pfNumber} onChange={(e) => setForm((p) => ({ ...p, pfNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">ESIC Number</label><input value={form.esicNumber} onChange={(e) => setForm((p) => ({ ...p, esicNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                        <div className="col-span-2 mt-2">
                          <h4 className="text-xs font-semibold text-slate-700 mb-2">Emergency Contact</h4>
                        </div>
                        <div><label className="block text-xs text-slate-600 mb-1">Contact Name</label><input value={form.emergencyContactName} onChange={(e) => setForm((p) => ({ ...p, emergencyContactName: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Full name" /></div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Relationship</label>
                          <select
                            value={form.emergencyRelationship}
                            onChange={(e) => setForm((p) => ({ ...p, emergencyRelationship: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">—</option>
                            <option value="Father">Father</option>
                            <option value="Mother">Mother</option>
                            <option value="Spouse">Spouse</option>
                            <option value="Sibling">Sibling</option>
                            <option value="Friend">Friend</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div><label className="block text-xs text-slate-600 mb-1">Contact Phone</label><input value={form.emergencyPhone} onChange={(e) => setForm((p) => ({ ...p, emergencyPhone: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" maxLength={10} placeholder="10-digit mobile number" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Contact Email</label><input value={form.emergencyEmail} onChange={(e) => setForm((p) => ({ ...p, emergencyEmail: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Email address" /></div>
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Contact Address</label><input value={form.emergencyAddress} onChange={(e) => setForm((p) => ({ ...p, emergencyAddress: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Contact's address" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowEditModal(false)} className="text-slate-500 text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-[#1B6B6B] text-white text-sm font-medium px-4 py-2 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tab === 'assets' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-[#E8F5F5] rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-[#1B6B6B]">
                {employeeAssets.length + employeeConsumableCards.length}
              </p>
              <p className="text-xs text-[#1B6B6B]">Currently Assigned</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-gray-700">
                {employeeAssetHistory.length}
              </p>
              <p className="text-xs text-gray-500">Total Assets Received</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-green-700">
                {Math.max(employeeAssetHistory.length - (employeeAssets.length + employeeConsumableCards.length), 0)}
              </p>
              <p className="text-xs text-green-600">Returned</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Currently Assigned</h3>
              <button
                type="button"
                onClick={openProfileAssignModal}
                className="text-xs text-[#1B6B6B] hover:underline"
              >
                + Assign Asset
              </button>
            </div>

            {employeeAssets.length === 0 && employeeConsumableCards.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-2xl mb-2">📦</p>
                <p className="text-sm text-gray-500">No assets currently assigned</p>
                <button
                  type="button"
                    onClick={openProfileAssignModal}
                  className="mt-3 text-sm text-[#1B6B6B] hover:underline"
                >
                  Assign an asset
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {[...employeeAssets.map((a) => ({ ...a, kind: 'trackable' })), ...employeeConsumableCards].map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#E8F5F5] flex items-center justify-center text-xl flex-shrink-0">
                      {getAssetIcon(asset.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {asset.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {asset.assetId}
                        {asset.type && ` · ${asset.type}`}
                        {asset.serialNumber && ` · SN: ${asset.serialNumber}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Issued: {asset.issueDate ? toDisplayDate(asset.issueDate) : '—'}
                        {' · '}
                        Condition: {asset.condition || '—'}
                        {asset.brand && ` · ${asset.brand}`}
                        {asset.model && ` ${asset.model}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {asset.kind === 'trackable' ? (
                        <>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[#C5E8E8] text-[#1B6B6B] font-medium">
                            Trackable
                          </span>
                          <button
                            type="button"
                            onClick={() => handleReturnAssetFromProfile(asset)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Return
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            Consumable · Qty {asset.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const assetDoc = assetList.find((x) => x.id === asset.assetDocId);
                                if (!assetDoc) {
                                  showError('Asset not found');
                                  return;
                                }
                              setReturnConsumableModal({
                                asset: assetDoc || asset,
                                assignment: asset.assignment,
                              });
                              setReturnQty(1);
                              setReturnCondition('Good');
                              setReturnNotes('');
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Return
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAssetHistory((s) => !s)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3 w-full"
            >
              <span>Asset History</span>
              <span className="text-xs text-gray-400 font-normal">
                ({employeeAssetHistory.length} assets)
              </span>
              <span className="ml-auto text-gray-400">
                {showAssetHistory ? '▲' : '▼'}
              </span>
            </button>

            {showAssetHistory && (
              <div className="space-y-2">
                {employeeAssetHistory.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No asset history found
                  </p>
                )}
                {employeeAssetHistory.map((asset) =>
                  asset.relevantHistory
                    .slice()
                    .sort((a, b) => {
                      const da = a.date?.toDate?.() || new Date(a.date);
                      const db2 = b.date?.toDate?.() || new Date(b.date);
                      return db2 - da;
                    })
                    .map((h, i) => (
                      <div
                        key={`${asset.id}-${i}`}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                      >
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-base flex-shrink-0 border">
                          {getAssetIcon(asset.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {asset.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {asset.assetId}
                            {' · '}
                            {h.date ? toDisplayDate(h.date) : '—'}
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            h.action === 'assigned'
                              ? 'bg-green-100 text-green-700'
                              : h.action === 'issued'
                              ? 'bg-green-100 text-green-700'
                              : h.action === 'returned'
                              ? 'bg-[#C5E8E8] text-[#1B6B6B]'
                              : h.action === 'stock_adjusted'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {h.action.charAt(0).toUpperCase() + h.action.slice(1)}
                        </span>
                      </div>
                    )),
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'onboarding' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      onboarding?.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : onboarding?.status === 'in_progress'
                        ? 'bg-[#C5E8E8] text-[#1B6B6B]'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {onboarding?.status === 'completed'
                      ? 'Completed'
                      : onboarding?.status === 'in_progress'
                      ? 'In Progress'
                      : 'Not Started'}
                  </span>
                  <span className="text-xs text-gray-500">
                    Joining: {employee.joiningDate ? toDisplayDate(employee.joiningDate) : '—'}
                  </span>
                </div>

                <p className="text-sm text-gray-700 font-medium">
                  {onboardingCompleted} of {onboardingTotal} tasks completed
                </p>
                <p className="text-xs text-gray-400 mt-1">{onboardingPct}% Complete</p>
                <div className="mt-3 w-full max-w-md bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-[#4ECDC4] h-2 rounded-full"
                    style={{ width: `${Math.min(onboardingPct, 100)}%` }}
                  />
                </div>
              </div>

              {(!onboarding || onboarding.status === 'not_started') && (
                <button
                  type="button"
                  onClick={handleStartOnboarding}
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
                >
                  {saving ? 'Starting…' : 'Start Onboarding'}
                </button>
              )}
            </div>
          </div>

          {(!onboarding || onboarding.status === 'not_started' || onboardingTasks.length === 0) ? (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <p className="text-4xl mb-3">🎯</p>
              <p className="text-base font-medium text-gray-700 mb-1">Onboarding not started</p>
              <p className="text-sm text-gray-400 mb-4">
                Start the onboarding process to track tasks for {employee.fullName}
              </p>
              <button
                type="button"
                onClick={handleStartOnboarding}
                disabled={saving}
                className="px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
              >
                {saving ? 'Starting…' : 'Start Onboarding'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {onboardingByCategory.map((g) => {
                const totalInCategory = g.tasks.length;
                const completedInCategory = g.tasks.filter((t) => t.completed).length;
                return (
                  <div key={g.category}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        {getCategoryIcon(g.category)} {g.category}
                      </h3>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {completedInCategory}/{totalInCategory}
                      </span>
                    </div>

                    {g.tasks.map((task) => (
                      <div
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (task.completed) return;
                          setCompletingTask(task);
                          setTaskNotes('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !task.completed) {
                            setCompletingTask(task);
                            setTaskNotes('');
                          }
                        }}
                        className={`flex items-start gap-3 p-3 rounded-xl border mb-2 cursor-pointer transition-all ${
                          task.completed
                            ? 'bg-green-50 border-green-100'
                            : isOverdue(task.dueDate)
                            ? 'bg-red-50 border-red-100'
                            : 'bg-white border-gray-200 hover:border-[#C5E8E8] hover:bg-[#E8F5F5]'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                            task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                          }`}
                        >
                          {task.completed && (
                            <svg width="10" height="10" viewBox="0 0 10 10">
                              <path
                                d="M2 5l2.5 2.5L8 3"
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                fill="none"
                              />
                            </svg>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={`text-sm font-medium ${
                                task.completed ? 'line-through text-gray-400' : 'text-gray-800'
                              }`}
                            >
                              {task.title}
                            </p>
                            {task.isRequired && !task.completed && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                                Required
                              </span>
                            )}
                            {isOverdue(task.dueDate) && !task.completed && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                                Overdue
                              </span>
                            )}
                          </div>

                          {task.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>
                          )}

                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              Due: {task.dueDate ? toDisplayDate(task.dueDate) : '—'}
                            </span>
                            <span className="text-xs text-gray-400">· {getAssignedLabel(task.assignedTo)}</span>
                            {task.completed && (
                              <span className="text-xs text-green-600">
                                ✓ Done by {task.completedBy} on {toDisplayDate(task.completedAt)}
                              </span>
                            )}
                          </div>

                          {task.completed && task.notes && (
                            <p className="text-xs text-gray-500 mt-1 italic">"{task.notes}"</p>
                          )}
                        </div>

                        {task.completed && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              unmarkTask(task.id);
                            }}
                            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 flex-shrink-0"
                          >
                            Undo
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'offboarding' && (
        <div className="space-y-6">
          {(!offboarding || offboarding.status === 'not_started') ? (
            <div className="bg-white border rounded-2xl p-6 text-center">
              <p className="text-4xl mb-3">👋</p>
              <p className="text-base font-semibold text-gray-800 mb-1">Initiate Offboarding</p>
              <p className="text-sm text-gray-400 mb-6">
                Start the offboarding process for {employee.fullName}
              </p>

              <div className="max-w-md mx-auto text-left space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Last Working Day</label>
                  <input
                    type="date"
                    value={offboardingExitDate}
                    onChange={(e) => setOffboardingExitDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Exit Reason</label>
                  <select
                    value={offboardingExitReason}
                    onChange={(e) => setOffboardingExitReason(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select reason</option>
                    <option value="Resignation">Resignation</option>
                    <option value="Termination">Termination</option>
                    <option value="Retirement">Retirement</option>
                    <option value="Contract End">Contract End</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleStartOffboarding}
                  disabled={saving}
                  className="w-full px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
                >
                  {saving ? 'Starting…' : 'Start Offboarding'}
                </button>
              </div>

              {(assignedAssetsForWarning.trackables.length > 0 || assignedAssetsForWarning.consumables.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4 text-left">
                  <p className="text-sm font-medium text-amber-800 mb-2">⚠️ Assets to be returned</p>
                  {assignedAssetsForWarning.trackables.map((a) => (
                    <p key={a.id} className="text-xs text-amber-700">
                      • {a.name} ({a.assetId})
                    </p>
                  ))}
                  {assignedAssetsForWarning.consumables.map((a) => (
                    <p key={`${a.id}_${a.assetId}`} className="text-xs text-amber-700">
                      • {a.name} ({a.assetId}) · Qty: {a._qty}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between p-4 bg-white border rounded-xl mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      offboarding.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {offboarding.status === 'completed' ? '✓ Offboarding Complete' : 'Offboarding In Progress'}
                  </div>
                  <div className="text-sm text-gray-500">
                    Exit: {toDisplayDate(offboarding.exitDate)} · {offboarding.exitReason}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-800">{offPct}%</p>
                  <p className="text-xs text-gray-400">
                    {offCompleted} of {offTotal} tasks
                  </p>
                </div>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
                <div
                  className={`h-2 rounded-full transition-all ${
                    offPct === 100 ? 'bg-green-500' : offPct > 50 ? 'bg-[#4ECDC4]' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(offPct, 100)}%` }}
                />
              </div>

              {(() => {
                const exit = toJSDate(offboarding.exitDate);
                const daysUntilExit = exit
                  ? Math.ceil((exit - new Date()) / (1000 * 60 * 60 * 24))
                  : null;
                if (daysUntilExit == null) return null;
                if (daysUntilExit > 0) {
                  return (
                    <div className="text-center mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
                      <p className="text-2xl font-bold text-amber-700">{daysUntilExit}</p>
                      <p className="text-xs text-amber-600">days until exit</p>
                    </div>
                  );
                }
                if (daysUntilExit === 0) {
                  return (
                    <div className="text-center mb-4 p-3 bg-red-50 rounded-xl border border-red-100">
                      <p className="text-sm font-bold text-red-700">🚨 Today is the last working day!</p>
                    </div>
                  );
                }
                return (
                  <div className="text-center mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-sm text-gray-500">
                      Employee has exited {Math.abs(daysUntilExit)} days ago
                    </p>
                  </div>
                );
              })()}

              <div className="space-y-6">
                {offByCategory.map((g) => {
                  const totalInCategory = g.tasks.length;
                  const completedInCategory = g.tasks.filter((t) => t.completed).length;
                  return (
                    <div key={g.category}>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          {getOffCategoryIcon(g.category)} {g.category}
                        </h3>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {completedInCategory}/{totalInCategory}
                        </span>
                      </div>

                      {g.tasks.map((task) => (
                        <div
                          key={task.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (task.completed) return;
                            setCompletingOffTask(task);
                            setOffTaskNotes('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !task.completed) {
                              setCompletingOffTask(task);
                              setOffTaskNotes('');
                            }
                          }}
                          className={`flex items-start gap-3 p-3 rounded-xl border mb-2 cursor-pointer transition-all ${
                            task.completed
                              ? 'bg-green-50 border-green-100'
                              : isOverdue(task.dueDate)
                              ? 'bg-red-50 border-red-100'
                              : 'bg-white border-gray-200 hover:border-amber-200 hover:bg-amber-50'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                              task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                            }`}
                          >
                            {task.completed && (
                              <svg width="10" height="10" viewBox="0 0 10 10">
                                <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                              </svg>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-sm font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                {task.title}
                              </p>
                              {task.isRequired && !task.completed && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">Required</span>
                              )}
                              {isOverdue(task.dueDate) && !task.completed && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">Overdue</span>
                              )}
                            </div>
                            {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              <span className="text-xs text-gray-400">Due: {task.dueDate ? toDisplayDate(task.dueDate) : '—'}</span>
                              <span className="text-xs text-gray-400">· {getAssignedLabel(task.assignedTo)}</span>
                              {task.completed && (
                                <span className="text-xs text-green-600">
                                  ✓ Done by {task.completedBy} on {toDisplayDate(task.completedAt)}
                                </span>
                              )}
                            </div>
                            {task.completed && task.notes && (
                              <p className="text-xs text-gray-500 mt-1 italic">"{task.notes}"</p>
                            )}
                          </div>

                          {task.completed && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                unmarkOffboardingTask(task.id);
                              }}
                              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 flex-shrink-0"
                            >
                              Undo
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {deactivateConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Deactivate {employee?.fullName}?</h3>
            <p className="text-sm text-slate-600 mb-4">They will be marked as Inactive.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeactivateConfirm(false)} className="text-slate-500 text-sm">Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  setSaving(true);
                  try {
                    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), {
                      status: 'Inactive',
                      updatedAt: serverTimestamp(),
                    });
                    setEmployee((prev) => (prev ? { ...prev, status: 'Inactive' } : null));
                    setDeactivateConfirm(false);
                    success('Employee deactivated');
                  } catch (err) {
                    showError('Failed to deactivate');
                  }
                  setSaving(false);
                }}
                disabled={saving}
                className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignAssetModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Assign Asset</h2>
            <form onSubmit={handleSaveAssignFromProfile} className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Employee</p>
                <p className="text-sm font-medium text-slate-800">
                  {employee.fullName} ({employee.empId})
                </p>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Asset</label>
                <select
                  name="assetId"
                  value={assignAssetForm.assetId}
                  onChange={handleAssignAssetChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select asset</option>
                  {assetList
                    .filter((a) => (a.status || 'Available') === 'Available')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.assetId} · {a.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Issue Date</label>
                  <input
                    type="date"
                    name="issueDate"
                    value={assignAssetForm.issueDate}
                    onChange={handleAssignAssetChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Condition at Issue</label>
                  <select
                    name="condition"
                    value={assignAssetForm.condition}
                    onChange={handleAssignAssetChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={assignAssetForm.notes}
                  onChange={handleAssignAssetChange}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Any special instructions or comments"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssignAssetModal(false)}
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

      {showProfileAssignModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Assign / Issue Asset</h2>

            <div className="mb-5">
              <p className="text-sm text-slate-600">Employee</p>
              <p className="text-sm font-medium text-slate-800">
                {employee.fullName} ({employee.empId})
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Trackable assignment */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-700">Trackable (Assign)</h3>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Available Trackable Assets</label>
                  <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setShowProfileAssetDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setShowProfileAssetDropdown(true);
                      }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between min-h-[38px] hover:border-[#4ECDC4]"
                    >
                      {assignAssetForm.assetId ? (
                        (() => {
                          const sel = assetList.find((x) => x.id === assignAssetForm.assetId);
                          return sel ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{sel.assetId}</span>
                              <span className="truncate">{sel.name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">Select asset...</span>
                          );
                        })()
                      ) : (
                        <span className="text-gray-400">Select asset...</span>
                      )}
                      <span className="text-gray-400 text-xs shrink-0">▾</span>
                    </div>
                    {showProfileAssetDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[60] max-h-52 overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            autoFocus
                            placeholder="Search by name or ID..."
                            value={profileAssetSearch}
                            onChange={(e) => setProfileAssetSearch(e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="overflow-y-auto max-h-40">
                          {assetList
                            .filter((a) => (a.mode || 'trackable') === 'trackable')
                            .filter((a) => (a.status || 'Available') === 'Available' || !a.status)
                            .filter(
                              (a) =>
                                !profileAssetSearch ||
                                (a.name || '').toLowerCase().includes(profileAssetSearch.toLowerCase()) ||
                                (a.assetId || '').toLowerCase().includes(profileAssetSearch.toLowerCase()),
                            )
                            .map((asset) => (
                              <div
                                key={asset.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setAssignAssetForm((prev) => ({ ...prev, assetId: asset.id }));
                                  setProfileAssignMode('trackable');
                                  setShowProfileAssetDropdown(false);
                                  setProfileAssetSearch('');
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    setAssignAssetForm((prev) => ({ ...prev, assetId: asset.id }));
                                    setProfileAssignMode('trackable');
                                    setShowProfileAssetDropdown(false);
                                    setProfileAssetSearch('');
                                  }
                                }}
                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer border-b border-gray-100 last:border-0"
                              >
                                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 shrink-0">
                                  {asset.assetId}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{asset.name}</p>
                                  <p className="text-xs text-gray-400 truncate">
                                    {asset.type} · {asset.brand || '—'}
                                    {asset.condition ? ` · ${asset.condition}` : ''}
                                  </p>
                                </div>
                              </div>
                            ))}
                          {assetList.filter(
                            (a) =>
                              (a.mode || 'trackable') === 'trackable' &&
                              ((a.status || 'Available') === 'Available' || !a.status),
                          ).length === 0 && (
                            <p className="text-center py-4 text-sm text-gray-400">No available trackable assets</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Issue Date</label>
                  <input
                    type="date"
                    name="issueDate"
                    value={assignAssetForm.issueDate}
                    onChange={(e) => {
                      handleAssignAssetChange(e);
                      setProfileAssignMode('trackable');
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Condition at Issue</label>
                  <select
                    name="condition"
                    value={assignAssetForm.condition}
                    onChange={(e) => {
                      handleAssignAssetChange(e);
                      setProfileAssignMode('trackable');
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Notes</label>
                  <textarea
                    name="notes"
                    value={assignAssetForm.notes}
                    onChange={(e) => {
                      handleAssignAssetChange(e);
                      setProfileAssignMode('trackable');
                    }}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Any special instructions or comments"
                  />
                </div>
              </div>

              {/* Consumable issuance */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-700">Consumable (Issue)</h3>

                <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                  {assetList
                    .filter((a) => (a.mode || 'trackable') === 'consumable')
                    .filter((a) => Number(a.availableStock) > 0)
                    .length === 0 ? (
                      <p className="text-xs text-slate-500">No consumables available</p>
                    ) : (
                      assetList
                        .filter((a) => (a.mode || 'trackable') === 'consumable')
                        .filter((a) => Number(a.availableStock) > 0)
                        .map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{a.name}</p>
                              <p className="text-xs text-slate-500">
                                {a.type} · {a.availableStock} available
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIssueConsumableAsset(a);
                                setProfileAssignMode('consumable');
                                setIssueConsumableForm((p) => ({
                                  ...p,
                                  quantity: 1,
                                  issueDate: p.issueDate || new Date().toISOString().slice(0, 10),
                                  condition: 'Good',
                                  notes: '',
                                }));
                              }}
                              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                            >
                              Issue
                            </button>
                          </div>
                        ))
                    )}
                </div>

                {profileAssignMode === 'consumable' && issueConsumableAsset && (
                  <form onSubmit={handleIssueConsumableFromProfile} className="space-y-4">
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Issue Quantity</p>
                      <input
                        type="number"
                        min={1}
                        max={Number(issueConsumableAsset.availableStock) || 0}
                        value={issueConsumableForm.quantity}
                        onChange={(e) => setIssueConsumableForm((p) => ({ ...p, quantity: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Available: {Number(issueConsumableAsset.availableStock) || 0}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Issue Date</label>
                      <input
                        type="date"
                        value={issueConsumableForm.issueDate}
                        onChange={(e) => setIssueConsumableForm((p) => ({ ...p, issueDate: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Condition</label>
                      <select
                        value={issueConsumableForm.condition}
                        onChange={(e) => setIssueConsumableForm((p) => ({ ...p, condition: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="New">New</option>
                        <option value="Good">Good</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Notes</label>
                      <textarea
                        value={issueConsumableForm.notes}
                        onChange={(e) => setIssueConsumableForm((p) => ({ ...p, notes: e.target.value }))}
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Optional notes"
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileAssignModal(null);
                          setShowProfileAssetDropdown(false);
                          setProfileAssetSearch('');
                          setIssueConsumableAsset(null);
                          setProfileAssignMode('trackable');
                        }}
                        className="text-sm text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2"
                      >
                        Issue Consumable
                      </button>
                    </div>
                  </form>
                )}

                {profileAssignMode === 'trackable' && (
                  <form onSubmit={handleSaveAssignFromProfile} className="space-y-4">
                    <div className="hidden" aria-hidden="true" />
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileAssignModal(null);
                          setShowProfileAssetDropdown(false);
                          setProfileAssetSearch('');
                          setIssueConsumableAsset(null);
                          setProfileAssignMode('trackable');
                        }}
                        className="text-sm text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!assignAssetForm.assetId}
                        className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                      >
                        Assign Asset
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {returnAsset && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Return Asset</h2>
            <form onSubmit={handleSaveReturnFromProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Asset</p>
                  <p className="text-sm font-medium text-slate-800">
                    {returnAsset.assetId} · {returnAsset.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Employee</p>
                  <p className="text-sm text-slate-800">
                    {employee.fullName} ({employee.empId})
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Return Date</label>
                  <input
                    type="date"
                    name="date"
                    value={returnAssetForm.date}
                    onChange={handleReturnAssetChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Condition on Return</label>
                  <select
                    name="condition"
                    value={returnAssetForm.condition}
                    onChange={handleReturnAssetChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={returnAssetForm.notes}
                  onChange={handleReturnAssetChange}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Any damage or notes on return"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnAsset(null)}
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

      {returnConsumableModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-gray-900 mb-1">
              Return {returnConsumableModal.asset?.name}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Issued to {employee.fullName} · Qty: {returnConsumableModal.assignment?.quantity}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Quantity to Return</label>
                <input
                  type="number"
                  min="1"
                  max={returnConsumableModal.assignment?.quantity}
                  value={returnQty}
                  onChange={(e) => setReturnQty(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Max: {returnConsumableModal.assignment?.quantity}
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Condition on Return</label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option>Good</option>
                  <option>Fair</option>
                  <option>Poor</option>
                  <option>Damaged</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
                <textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Any damage or notes..."
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setReturnConsumableModal(null);
                  setReturnQty(1);
                  setReturnCondition('Good');
                  setReturnNotes('');
                }}
                className="flex-1 py-2 border rounded-xl text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnConsumableFromProfile}
                className="flex-1 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]"
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}

      {completingTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-medium mb-3">
              Complete: {completingTask.title}
            </h3>
            <textarea
              placeholder="Add notes (optional)..."
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompletingTask(null)}
                className="flex-1 py-2 border rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await markTaskComplete(completingTask.id, taskNotes);
                    setCompletingTask(null);
                    setTaskNotes('');
                  } catch (e) {
                    showError('Failed to update task');
                  }
                }}
                className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium"
              >
                Mark Complete ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {completingOffTask && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-medium mb-3">
              Complete: {completingOffTask.title}
            </h3>
            <textarea
              placeholder="Add notes (optional)..."
              value={offTaskNotes}
              onChange={(e) => setOffTaskNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompletingOffTask(null)}
                className="flex-1 py-2 border rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await markOffboardingTaskComplete(completingOffTask.id, offTaskNotes);
                    setCompletingOffTask(null);
                    setOffTaskNotes('');
                  } catch (e) {
                    showError('Failed to update task');
                  }
                }}
                className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium"
              >
                Mark Complete ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {deactivateChoiceOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-semibold text-gray-900 mb-1">Start offboarding instead?</h3>
            <p className="text-sm text-gray-500 mb-4">
              This employee does not have offboarding started. Would you like to start the offboarding process instead of directly deactivating?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeactivateChoiceOpen(false);
                  setTab('offboarding');
                }}
                className="flex-1 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600"
              >
                Start Offboarding
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDeactivateChoiceOpen(false);
                  await proceedDeactivateDirectly();
                }}
                className="flex-1 py-2 border rounded-xl text-sm text-gray-700 hover:bg-gray-50"
              >
                Deactivate Directly
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDeactivateChoiceOpen(false)}
              className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAssetReturnWarning && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-xl">
                ⚠️
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Pending Asset Returns</h3>
                <p className="text-sm text-gray-500">
                  {employee.fullName} has {pendingReturnAssets.length} unreturned asset(s)
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-3 mb-4 space-y-2">
              {pendingReturnAssets.map((asset) => (
                <div
                  key={asset.kind === 'consumable' ? `${asset.docId}_${asset.employeeName}_${asset.issueDate?.seconds || 0}` : asset.docId}
                  className="flex items-center gap-3 bg-white rounded-lg p-2.5 border border-amber-100"
                >
                  <span className="text-base">
                    {getAssetIcon(asset.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {asset.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {asset.assetId} ·{' '}
                      {asset.kind === 'consumable' ? `Qty: ${asset.quantity} · ` : ''}
                      Issued: {asset.issueDate ? toDisplayDate(asset.issueDate) : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded-lg p-3">
              &quot;Return All &amp; Deactivate&quot; will mark all assets as returned today and deactivate the
              employee.
            </p>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleReturnAllAndDeactivate}
                className="w-full py-2.5 bg-amber-500 text-white rounded-xl font-medium text-sm hover:bg-amber-600"
                disabled={saving}
              >
                Return All &amp; Deactivate
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAssetReturnWarning(false);
                  setDeactivateConfirm(true);
                }}
                className="w-full py-2.5 border-2 border-red-200 text-red-600 rounded-xl font-medium text-sm hover:bg-red-50"
                disabled={saving}
              >
                Deactivate Anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAssetReturnWarning(false);
                  setPendingReturnAssets([]);
                }}
                className="w-full py-2 text-gray-500 text-sm hover:text-gray-700"
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
