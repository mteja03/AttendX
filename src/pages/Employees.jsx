import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getCountFromServer,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { PLATFORM_CONFIG } from '../config/constants';
import { SkeletonCard, SkeletonTable } from '../components/SkeletonRow';
import EmployeeAvatar from '../components/EmployeeAvatar';
import EmptyState from '../components/EmptyState';
import ErrorModal from '../components/ErrorModal';
import PageHeader from '../components/PageHeader';
import Cropper from 'react-easy-crop';
import { formatLakhs, toDateString, toDisplayDate, toJSDate } from '../utils';
import { updateCompanyCounts } from '../utils/updateCompanyCounts';
import { withRetry } from '../utils/firestoreWithRetry';
import { ERROR_MESSAGES, getErrorMessage, logError } from '../utils/errorHandler';
import { trackEmployeeAdded, trackPageView } from '../utils/analytics';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal', 'Other'];
const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];
const EMPTY_EMPLOYEE_FILTERS = {
  department: '',
  branch: '',
  location: '',
  employmentType: '',
  category: '',
  designation: '',
  gender: '',
  bloodGroup: '',
  reportingManager: '',
  joinYearFrom: '',
  joinYearTo: '',
  maritalStatus: '',
  disability: '',
  pfApplicable: '',
  esicApplicable: '',
};

const FILTER_LABELS = {
  department: 'Department',
  branch: 'Branch',
  location: 'Location',
  employmentType: 'Employment Type',
  category: 'Category',
  designation: 'Designation',
  gender: 'Gender',
  bloodGroup: 'Blood Group',
  reportingManager: 'Reporting Manager',
  joinYearFrom: 'Joined from',
  joinYearTo: 'Joined to',
  maritalStatus: 'Marital Status',
  disability: 'Disability',
  pfApplicable: 'PF',
  esicApplicable: 'ESIC',
};

const FETCH_PAGE_SIZE = PLATFORM_CONFIG.EMPLOYEES_PAGE_SIZE;
const TABLE_PAGE_SIZE = 25;

async function getCroppedBlob(imageSrc, pixelCrop) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas to blob failed'));
      },
      'image/jpeg',
      0.9,
    );
  });
}

function noticePeriodDaysRemaining(emp) {
  if ((emp.status || '') !== 'Notice Period') return '';
  const end = toJSDate(emp.offboarding?.expectedLastDay);
  if (!end || Number.isNaN(end.getTime())) return '';
  const diff = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return String(Math.max(0, diff));
}

const STATUS_BORDER_COLOR = {
  'Notice Period': '#FBBF24',
  Offboarding: '#F87171',
  Inactive: '#D1D5DB',
};

function getRowTintClass(status) {
  switch (status) {
    case 'Notice Period':
      return 'bg-amber-50/30';
    case 'Offboarding':
      return 'bg-red-50/20';
    case 'Inactive':
      return 'opacity-60';
    default:
      return '';
  }
}

function getCardTopBorderClass(status) {
  switch (status) {
    case 'Notice Period':
      return 'border-t-[3px] border-t-amber-400';
    case 'Offboarding':
      return 'border-t-[3px] border-t-red-400';
    case 'Inactive':
      return 'border-t-[3px] border-t-gray-300';
    default:
      return 'border-t-[3px] border-t-transparent';
  }
}

const STATUS_BADGE_CONFIG = {
  Active: { dot: '#16A34A', bg: 'bg-green-50', text: 'text-green-700' },
  'Notice Period': { dot: '#EF9F27', bg: 'bg-amber-50', text: 'text-amber-700' },
  Offboarding: { dot: '#E24B4A', bg: 'bg-red-50', text: 'text-red-600' },
  Inactive: { dot: '#9CA3AF', bg: 'bg-gray-100', text: 'text-gray-500' },
  'On Leave': { dot: '#3B82F6', bg: 'bg-blue-50', text: 'text-blue-600' },
};

function StatusBadge({ status }) {
  const label = status || 'Active';
  const c = STATUS_BADGE_CONFIG[label] || STATUS_BADGE_CONFIG.Inactive;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${c.bg} ${c.text}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: c.dot }}
      />
      {label}
    </span>
  );
}

function countOverdueOffboardingTasks(emp) {
  const tasks = Array.isArray(emp.offboarding?.tasks) ? emp.offboarding.tasks : [];
  if (tasks.length === 0) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return tasks.filter((t) => {
    if (t.completed) return false;
    const due = toJSDate(t.dueDate);
    if (!due || Number.isNaN(due.getTime())) return false;
    due.setHours(0, 0, 0, 0);
    return due < today;
  }).length;
}

function EmployeeStatusSubline({ emp }) {
  const status = emp.status;
  if (status === 'Notice Period') {
    const last = toJSDate(emp.offboarding?.expectedLastDay);
    if (!last || Number.isNaN(last.getTime())) return null;
    return (
      <span className="text-xs text-amber-600 font-medium">
        · Last day{' '}
        {last.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      </span>
    );
  }
  if (status === 'Offboarding') {
    const overdue = countOverdueOffboardingTasks(emp);
    if (overdue === 0) return null;
    return (
      <span className="text-xs text-red-500 font-medium">
        · {overdue} task{overdue !== 1 ? 's' : ''} overdue
      </span>
    );
  }
  return null;
}

function customBenefitsExportText(emp) {
  const list = Array.isArray(emp.customBenefits) ? emp.customBenefits : [];
  return list
    .map((b) => [b?.name, b?.value, b?.notes].filter(Boolean).join(' · '))
    .filter(Boolean)
    .join('; ');
}

function getEmployeeJoinYear(emp) {
  const d = toJSDate(emp?.joiningDate);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

// Add Employee form is intentionally flexible:
// Only blocking validations:
// - Emp ID cannot be empty and must not contain spaces
// - Date of birth cannot be in the future
// - Emp ID must be unique

const ADD_STEPS = [
  {
    id: 0,
    label: 'Personal',
    sub: 'Name, contact, address',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M2 12c0-2.761 2.239-5 5-5s5 2.239 5 5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 1,
    label: 'Employment',
    sub: 'Role, department, salary',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="4" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5 4V3a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 2,
    label: 'Bank & ID',
    sub: 'Bank details, PAN, Aadhaar',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M1 6h12" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="4" cy="9" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 3,
    label: 'Emergency',
    sub: 'Emergency contact',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M7 2l1.5 3 3.5.5-2.5 2.5.5 3.5L7 10l-3 1.5.5-3.5L2 5.5l3.5-.5z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

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

const getDeptColor = (dept) => {
  const colors = {
    Engineering: '#3B82F6',
    HR: '#10B981',
    Sales: '#F59E0B',
    Finance: '#6366F1',
    Operations: '#EC4899',
    Marketing: '#14B8A6',
    Design: '#8B5CF6',
    Legal: '#64748B',
  };
  return colors[dept] || '#9CA3AF';
};

function sanitizeCustomBenefitsForSave(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b, i) => {
      const nameResolved =
        b?.name === '__custom__' ? (b.customName || '').trim() : (b?.name || '').trim();
      return {
        id: (b?.id && String(b.id).trim()) || `benefit_${Date.now()}_${i}`,
        name: nameResolved,
        value: (b.value || '').trim(),
        notes: (b.notes || '').trim(),
      };
    })
    .filter((b) => b.name || b.value || b.notes);
}

const initialForm = {
  fullName: '',
  email: '',
  phone: '',
  alternativeMobile: '',
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  maritalStatus: '',
  marriageDate: '',
  disability: '',
  fatherName: '',
  streetAddress: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  qualification: '',
  empId: '',
  department: '',
  branch: '',
  location: '',
  designation: '',
  designationRoleId: '',
  employmentType: 'Full-time',
  category: '',
  joiningDate: toDateString(new Date()),
  reportingManagerId: '',
  reportingManagerName: '',
  reportingManagerEmpId: '',
  prevCompany: '',
  prevDesignation: '',
  prevFromDate: '',
  prevToDate: '',
  prevManagerName: '',
  prevManagerPhone: '',
  prevManagerEmail: '',
  ctcPerAnnum: '',
  incentive: '',
  basicSalary: '',
  hra: '',
  pfApplicable: false,
  esicApplicable: false,
  pfNumber: '',
  esicNumber: '',
  customBenefits: [],
  bankName: '',
  accountHolderName: '',
  ifscCode: '',
  accountType: '',
  panNumber: '',
  aadhaarNumber: '',
  drivingLicenceNumber: '',
  emergencyContactName: '',
  emergencyRelationship: '',
  emergencyPhone: '',
};

export default function Employees() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { currentUser, role: userRole, signOut } = useAuth();
  const { company } = useCompany();
  const canEditEmployees = userRole === 'admin' || userRole === 'hrmanager';
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastDocRef = useRef(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [statsCounts, setStatsCounts] = useState({
    active: 0,
    onLeave: 0,
    inactive: 0,
    noticePeriod: 0,
    offboarding: 0,
  });
  const [searchAllMode, setSearchAllMode] = useState(false);
  const searchTimeoutRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(() => ({ ...EMPTY_EMPLOYEE_FILTERS }));
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState(0);
  const [newEmpPhoto, setNewEmpPhoto] = useState(null);
  const [newEmpPhotoSrc, setNewEmpPhotoSrc] = useState(null);
  const [newEmpRawSrc, setNewEmpRawSrc] = useState(null);
  const [newEmpCropOpen, setNewEmpCropOpen] = useState(false);
  const [newEmpCrop, setNewEmpCrop] = useState({ x: 0, y: 0 });
  const [newEmpZoom, setNewEmpZoom] = useState(1);
  const [newEmpCroppedPixels, setNewEmpCroppedPixels] = useState(null);
  const [form, setForm] = useState(initialForm);
  const reportingManagerOptions = useMemo(
    () =>
      employees.filter(
        (emp) => emp.status !== 'Inactive' && !(form.empId && emp.empId === form.empId),
      ),
    [employees, form.empId],
  );
  const [formErrors, setFormErrors] = useState({});
  const [formWarnings, setFormWarnings] = useState({});
  const [saving, setSaving] = useState(false);
  const [errorModal, setErrorModal] = useState(null);

  // Clear error modal on re-login
  useEffect(() => {
    if (!currentUser) return undefined;
    const timer = setTimeout(() => {
      setErrorModal(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentUser]);
  const [managerSearch, setManagerSearch] = useState('');
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);
  const [roles, setRoles] = useState([]);
  const [roleSearch, setRoleSearch] = useState('');
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const roleDropdownRef = useRef(null);
  const locationDropdownRef = useRef(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);

  const benefitTemplates = useMemo(
    () => (company?.benefits || []).map((b) => ({ id: b, name: b })),
    [company?.benefits],
  );

  useEffect(() => {
    trackPageView('Employees');
  }, []);

  useEffect(() => {
    if (!companyId) return;
    const fetchRoles = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'roles'));
        setRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        setRoles([]);
      }
    };
    fetchRoles();
  }, [companyId]);

  const roleSalaryBand = useMemo(() => {
    if (!form.designation) return null;
    const role = roles.find((r) => r.title === form.designation);
    if (!role?.salaryBand || role.salaryBand.min === '' || role.salaryBand.min == null) return null;
    return {
      min: Number(role.salaryBand.min),
      max: Number(role.salaryBand.max),
    };
  }, [form.designation, roles]);

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

  useEffect(() => {
    if (!showRoleDropdown) return undefined;
    const onDown = (e) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target)) {
        setShowRoleDropdown(false);
        setRoleSearch('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showRoleDropdown]);

  useEffect(() => {
    if (!showLocationDropdown) return undefined;
    const onDown = (e) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target)) {
        setShowLocationDropdown(false);
        setLocationSearch('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showLocationDropdown]);

  const [showDownload, setShowDownload] = useState(false);

  const collRef = useMemo(
    () => (companyId ? collection(db, 'companies', companyId, 'employees') : null),
    [companyId],
  );

  const fetchAllEmployeesFallback = useCallback(async () => {
    if (!collRef) return;
    try {
      const snap = await getDocs(collRef);
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setHasMore(false);
      lastDocRef.current = null;
    } catch {
      showError('Failed to load employees');
    }
  }, [collRef, showError]);

  const fetchTotalCount = useCallback(async () => {
    if (!collRef) return;
    try {
      const snapshot = await getCountFromServer(collRef);
      setTotalCount(snapshot.data().count);
    } catch {
      /* ignore count errors */
    }
  }, [collRef]);

  const fetchStatsCounts = useCallback(async () => {
    if (!collRef) return;
    try {
      const [activeSnap, onLeaveSnap, inactiveSnap, noticeSnap, offSnap] = await Promise.all([
        getCountFromServer(query(collRef, where('status', '==', 'Active'))),
        getCountFromServer(query(collRef, where('status', '==', 'On Leave'))),
        getCountFromServer(query(collRef, where('status', '==', 'Inactive'))),
        getCountFromServer(query(collRef, where('status', '==', 'Notice Period'))),
        getCountFromServer(query(collRef, where('status', '==', 'Offboarding'))),
      ]);
      setStatsCounts({
        active: activeSnap.data().count,
        onLeave: onLeaveSnap.data().count,
        inactive: inactiveSnap.data().count,
        noticePeriod: noticeSnap.data().count,
        offboarding: offSnap.data().count,
      });
    } catch {
      /* ignore stats count errors */
    }
  }, [collRef]);

  const fetchEmployees = useCallback(
    async (reset = true) => {
      if (!companyId || !collRef) return;
      try {
        if (reset) {
          setLoading(true);
          setEmployees([]);
          lastDocRef.current = null;
          setSearchAllMode(false);
        } else {
          setLoadingMore(true);
        }

        const constraints = [];
        if (tab === 'active') constraints.push(where('status', '==', 'Active'));
        else if (tab === 'noticeperiod') constraints.push(where('status', '==', 'Notice Period'));
        else if (tab === 'onleave') constraints.push(where('status', '==', 'On Leave'));
        else if (tab === 'offboarding') constraints.push(where('status', '==', 'Offboarding'));
        else if (tab === 'inactive') constraints.push(where('status', '==', 'Inactive'));
        if (filters.department) {
          constraints.push(where('department', '==', filters.department.trim()));
        }
        if (filters.branch) {
          constraints.push(where('branch', '==', filters.branch.trim()));
        }
        if (filters.location) {
          constraints.push(where('location', '==', filters.location.trim()));
        }
        constraints.push(orderBy('fullName', 'asc'));
        constraints.push(limit(FETCH_PAGE_SIZE));
        if (!reset && lastDocRef.current) {
          constraints.push(startAfter(lastDocRef.current));
        }

        const q = query(collRef, ...constraints);
        const snap = await getDocs(q);
        const newEmployees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const last = snap.docs[snap.docs.length - 1] || null;
        lastDocRef.current = last;

        if (reset) {
          setEmployees(newEmployees);
        } else {
          setEmployees((prev) => [...prev, ...newEmployees]);
        }
        setHasMore(snap.docs.length === FETCH_PAGE_SIZE);
      } catch (error) {
        if (error?.code === 'failed-precondition') {
          await fetchAllEmployeesFallback();
        } else {
          showError('Failed to load employees');
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [companyId, collRef, tab, filters.department, filters.branch, filters.location, fetchAllEmployeesFallback, showError],
  );

  const searchAllEmployees = useCallback(
    async (term) => {
      if (!term || term.length < 2 || !collRef) return;
      setLoading(true);
      try {
        const snap = await getDocs(query(collRef, orderBy('fullName', 'asc')));
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const t = term.toLowerCase();
        const filtered = all.filter(
          (e) =>
            e.fullName?.toLowerCase().includes(t) ||
            e.empId?.toLowerCase().includes(t) ||
            e.email?.toLowerCase().includes(t) ||
            (e.phone && String(e.phone).includes(term)),
        );
        setEmployees(filtered);
        setHasMore(false);
        lastDocRef.current = null;
        setTotalCount(filtered.length);
        setSearchAllMode(true);
      } catch {
        showError('Search failed');
      } finally {
        setLoading(false);
      }
    },
    [collRef, showError],
  );

  const handleSearchChange = (term) => {
    setSearch(term);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (!term.trim()) {
      setSearchAllMode(false);
      fetchEmployees(true);
      fetchTotalCount();
      fetchStatsCounts();
      return;
    }
    if (term.trim().length < 2) {
      if (searchAllMode) {
        setSearchAllMode(false);
        fetchEmployees(true);
        fetchTotalCount();
      }
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchAllEmployees(term.trim());
    }, 400);
  };

  useEffect(
    () => () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!companyId) return;
    fetchEmployees(true);
    fetchTotalCount();
    fetchStatsCounts();
  }, [companyId, tab, filters.department, filters.branch, filters.location, fetchEmployees, fetchTotalCount, fetchStatsCounts]);

  /** Suggested next Emp ID from currently loaded employees (server still validates uniqueness). */
  const nextEmpId = useMemo(() => {
    if (employees.length === 0) return 'EMP001';

    const empNumbers = employees
      .map((e) => {
        const match = e.empId?.match(/\d+$/);
        return match ? parseInt(match[0], 10) : NaN;
      })
      .filter((n) => !Number.isNaN(n) && n > 0);

    if (empNumbers.length === 0) return 'EMP001';

    const maxNum = Math.max(...empNumbers);
    const nextNum = maxNum + 1;

    const sample = employees.find((e) => e.empId && /\d/.test(String(e.empId)));
    const prefix = sample?.empId ? String(sample.empId).replace(/\d+$/, '') || 'EMP' : 'EMP';

    return `${prefix}${String(nextNum).padStart(3, '0')}`;
  }, [employees]);

  const departments = company?.departments?.length ? company.departments : DEFAULT_DEPARTMENTS;
  const designationFilterOptions = useMemo(() => {
    const fromEmp = [...new Set(employees.map((e) => (e.designation || '').trim()).filter(Boolean))].sort();
    if (fromEmp.length) return fromEmp;
    return [
      ...new Set(roles.filter((r) => r.isActive !== false).map((r) => (r.title || '').trim()).filter(Boolean)),
    ].sort();
  }, [employees, roles]);

  const reportingManagerFilterOptions = useMemo(() => {
    const names = employees
      .filter((e) => e.status !== 'Inactive' && (e.reportingManagerName || '').trim())
      .map((e) => e.reportingManagerName.trim());
    return [...new Set(names)].sort();
  }, [employees]);

  const joinYearSelectOptions = useMemo(
    () => Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i),
    [],
  );
  const employmentTypes = company?.employmentTypes?.length ? company.employmentTypes : DEFAULT_EMPLOYMENT_TYPES;
  const branches = company?.branches?.length ? company.branches : DEFAULT_BRANCHES;
  const qualifications = company?.qualifications?.length ? company.qualifications : DEFAULT_QUALIFICATIONS;
  const categories = company?.categories?.length ? company.categories : DEFAULT_CATEGORIES;
  const locationFilterOptions = useMemo(() => company?.locations || [], [company?.locations]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v !== '' && v != null).length,
    [filters],
  );

  const activeFilters = useMemo(
    () =>
      Object.entries(filters)
        .filter(([, v]) => v !== '' && v != null)
        .map(([key, value]) => ({
          key,
          label: FILTER_LABELS[key] || key,
          value: String(value),
        })),
    [filters],
  );

  const clearFilter = (key) => {
    setFilters((prev) => ({ ...prev, [key]: '' }));
  };

  const clearFilters = () => {
    setFilters({ ...EMPTY_EMPLOYEE_FILTERS });
  };

  const filtered = useMemo(() => {
    let list = employees;
    if (searchAllMode) {
      if (tab === 'active') list = list.filter((e) => (e.status || 'Active') === 'Active');
      if (tab === 'noticeperiod') list = list.filter((e) => (e.status || '') === 'Notice Period');
      if (tab === 'onleave') list = list.filter((e) => (e.status || '') === 'On Leave');
      if (tab === 'offboarding') list = list.filter((e) => (e.status || '') === 'Offboarding');
      if (tab === 'inactive') list = list.filter((e) => (e.status || '') === 'Inactive');
    }
    const term = search.trim().toLowerCase();
    if (term && (!searchAllMode || term.length < 2)) {
      list = list.filter(
        (e) =>
          e.fullName?.toLowerCase().includes(term) ||
          e.email?.toLowerCase().includes(term) ||
          (e.empId || '').toLowerCase().includes(term) ||
          (e.department || '').toLowerCase().includes(term) ||
          (e.phone && String(e.phone).includes(search.trim())),
      );
    }

    const f = filters;
    list = list.filter((emp) => {
      if (f.department && (emp.department || '').trim() !== f.department) return false;
      if (f.branch && (emp.branch || '').trim() !== f.branch) return false;
      if (f.location && (emp.location || '').trim() !== f.location) return false;
      if (f.employmentType && (emp.employmentType || '').trim() !== f.employmentType) return false;
      if (f.category && (emp.category || '').trim() !== f.category) return false;
      if (f.designation && (emp.designation || '').trim() !== f.designation) return false;
      if (f.gender && (emp.gender || '') !== f.gender) return false;
      if (f.bloodGroup && (emp.bloodGroup || '') !== f.bloodGroup) return false;
      if (f.maritalStatus && (emp.maritalStatus || '') !== f.maritalStatus) return false;

      if (f.disability === 'none') {
        const d = (emp.disability || '').trim();
        if (d && d !== 'None') return false;
      } else if (f.disability && (emp.disability || '').trim() !== f.disability) {
        return false;
      }

      if (f.reportingManager && (emp.reportingManagerName || '') !== f.reportingManager) return false;

      if (f.pfApplicable === 'yes' && !emp.pfApplicable) return false;
      if (f.pfApplicable === 'no' && emp.pfApplicable) return false;
      if (f.esicApplicable === 'yes' && !emp.esicApplicable) return false;
      if (f.esicApplicable === 'no' && emp.esicApplicable) return false;

      const joinYear = getEmployeeJoinYear(emp);
      if (f.joinYearFrom) {
        if (!joinYear || joinYear < Number(f.joinYearFrom)) return false;
      }
      if (f.joinYearTo) {
        if (!joinYear || joinYear > Number(f.joinYearTo)) return false;
      }

      return true;
    });

    return list;
  }, [employees, searchAllMode, tab, search, filters]);

  useEffect(() => {
    setCurrentPage(1);
  }, [tab, search, filters, searchAllMode]);

  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * TABLE_PAGE_SIZE;
    return filtered.slice(start, start + TABLE_PAGE_SIZE);
  }, [filtered, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / TABLE_PAGE_SIZE));

  const handleCloseAddModal = () => {
    setNewEmpPhoto(null);
    setNewEmpPhotoSrc(null);
    setNewEmpRawSrc(null);
    setNewEmpCropOpen(false);
    setNewEmpCrop({ x: 0, y: 0 });
    setNewEmpZoom(1);
    setNewEmpCroppedPixels(null);
    setShowAddModal(false);
    setAddStep(0);
    setForm(initialForm);
    setFormErrors({});
    setFormWarnings({});
    setSelectedRole(null);
    setRoleSearch('');
    setShowRoleDropdown(false);
    setManagerSearch('');
    setShowManagerDropdown(false);
    setLocationSearch('');
    setShowLocationDropdown(false);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: null }));
    if (formWarnings[name]) setFormWarnings((prev) => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const err = {};
    const empId = (form.empId || '').trim();
    if (!empId) err.empId = 'Emp ID is required';
    if (empId && /\s/.test(empId)) err.empId = 'Emp ID must not contain spaces';

    if (form.dateOfBirth) {
      const dob = new Date(form.dateOfBirth);
      if (Number.isNaN(dob.getTime())) err.dateOfBirth = 'Invalid date';
      else if (dob.getTime() > Date.now()) err.dateOfBirth = 'Date of birth cannot be in the future';
    }
    setFormErrors(err);
    return Object.keys(err).length === 0;
  };

  const checkEmpIdExists = async (empId) => {
    const v = (empId || '').trim();
    if (!v) return false;
    const q = query(collection(db, 'companies', companyId, 'employees'), where('empId', '==', v));
    const snap = await getDocs(q);
    return !snap.empty;
  };

  const handleEmpIdBlur = () => {
    const v = (form.empId || '').trim();
    const nextErr = {};
    const nextWarn = {};
    if (!v) nextErr.empId = 'Emp ID is required';
    else if (/\s/.test(v)) nextErr.empId = 'Emp ID must not contain spaces';
    else if (!/^EMP\d+$/i.test(v)) nextWarn.empId = 'Emp IDs typically look like EMP001';

    setFormErrors((p) => ({ ...p, empId: nextErr.empId || null }));
    setFormWarnings((p) => ({ ...p, empId: nextWarn.empId || null }));
  };

  const handleSmartError = async (error, context, fallback = 'Failed to save. Please try again.') => {
    await logError(error, { companyId, ...context });
    const errType = getErrorMessage(error);
    if (error?._needsReauth || errType === 'auth_expired') return setErrorModal('auth_expired');
    if (errType === 'permission_denied') return setErrorModal('permission_denied');
    if (errType === 'network_error') return setErrorModal('network_error');
    showError(ERROR_MESSAGES[errType]?.message || fallback);
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const exists = await checkEmpIdExists(form.empId);
      if (exists) {
        setFormErrors((prev) => ({
          ...prev,
          empId: `Emp ID ${form.empId} is already taken. Please use a different ID.`,
        }));
        setSaving(false);
        return;
      }
      const employeeData = {
        fullName: form.fullName?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        alternativeMobile: form.alternativeMobile?.trim() || null,
        dateOfBirth: form.dateOfBirth ? Timestamp.fromDate(new Date(form.dateOfBirth)) : null,
        gender: form.gender || null,
        bloodGroup: form.bloodGroup || null,
        maritalStatus: form.maritalStatus || null,
        marriageDate:
          form.maritalStatus === 'Married' && form.marriageDate
            ? Timestamp.fromDate(new Date(form.marriageDate))
            : null,
        disability: form.disability?.trim() || null,
        fatherName: form.fatherName?.trim() || null,
        streetAddress: form.streetAddress?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state || null,
        pincode: form.pincode?.trim() || null,
        country: form.country?.trim() || 'India',
        empId: (form.empId || '').trim(),
        department: form.department || null,
        branch: form.branch || null,
        location: form.location?.trim() || null,
        designation: form.designation || null,
        designationRoleId: form.designationRoleId || null,
        employmentType: form.employmentType || 'Full-time',
        category: form.category || null,
        qualification: form.qualification || null,
        joiningDate: form.joiningDate ? Timestamp.fromDate(new Date(form.joiningDate)) : null,
        reportingManagerId: form.reportingManagerId || null,
        reportingManagerName: form.reportingManagerName || null,
        reportingManagerEmpId: form.reportingManagerEmpId || null,
        prevCompany: form.prevCompany?.trim() || null,
        prevDesignation: form.prevDesignation?.trim() || null,
        prevFromDate: form.prevFromDate ? Timestamp.fromDate(new Date(form.prevFromDate)) : null,
        prevToDate: form.prevToDate ? Timestamp.fromDate(new Date(form.prevToDate)) : null,
        prevManagerName: form.prevManagerName?.trim() || null,
        prevManagerPhone: form.prevManagerPhone?.trim() || null,
        prevManagerEmail: form.prevManagerEmail?.trim() || null,
        ctcPerAnnum: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        incentive: form.incentive !== '' && form.incentive != null ? Number(form.incentive) : null,
        basicSalary: form.basicSalary ? Number(form.basicSalary) : null,
        hra: form.hra ? Number(form.hra) : null,
        pfApplicable: !!form.pfApplicable,
        esicApplicable: !!form.esicApplicable,
        pfNumber: form.pfApplicable ? form.pfNumber?.trim() || null : null,
        esicNumber: form.esicApplicable ? form.esicNumber?.trim() || null : null,
        customBenefits: sanitizeCustomBenefitsForSave(form.customBenefits),
        bankName: form.bankName?.trim() || null,
        accountHolderName: form.accountHolderName?.trim() || null,
        ifscCode: form.ifscCode?.trim() || null,
        accountType: form.accountType || null,
        panNumber: form.panNumber?.trim() || null,
        aadhaarNumber: form.aadhaarNumber?.trim() || null,
        drivingLicenceNumber: form.drivingLicenceNumber?.trim() || null,
        emergencyContact: {
          name: form.emergencyContactName?.trim() || '',
          relationship: form.emergencyRelationship || '',
          phone: form.emergencyPhone?.trim() || '',
        },
        status: 'Active',
        createdAt: serverTimestamp(),
      };
      const newEmpRef = await withRetry(
        () => addDoc(collection(db, 'companies', companyId, 'employees'), employeeData),
        { companyId, action: 'addEmployee' },
      );
      const newEmpId = newEmpRef.id;

      if (newEmpPhoto) {
        try {
          const { getStorage, ref: storageRef, uploadString, getDownloadURL } = await import('firebase/storage');
          const { app } = await import('../firebase/config');
          const { doc: firestoreDoc, updateDoc: firestoreUpdateDoc } = await import('firebase/firestore');

          const storage = getStorage(app);
          const photoRef = storageRef(storage, `companies/${companyId}/employees/${newEmpId}/profile.jpg`);
          const snapshot = await uploadString(photoRef, newEmpPhoto, 'data_url');
          const photoURL = await getDownloadURL(snapshot.ref);
          await firestoreUpdateDoc(firestoreDoc(db, 'companies', companyId, 'employees', newEmpId), { photoURL });
        } catch (photoErr) {
          if (import.meta.env.DEV) console.error('Photo upload failed:', photoErr);
          showError(
            'Employee added but photo upload failed. You can add photo from the profile.',
          );
        }
      }

      await updateCompanyCounts(companyId);
      handleCloseAddModal();
      trackEmployeeAdded();
      success('Employee added successfully!');
      await fetchEmployees(true);
      fetchTotalCount();
      fetchStatsCounts();
    } catch (error) {
      await handleSmartError(error, { action: 'addEmployee' }, 'Failed to add employee');
    }
    setSaving(false);
  };

  const companyName = (company?.name || 'Company').replace(/\s+/g, '');

  const downloadRows = (emps) =>
    emps.map((emp) => ({
      'Emp ID': emp.empId || '',
      'Full Name': emp.fullName || '',
      Email: emp.email || '',
      Phone: emp.phone || '',
      'Alternative Mobile': emp.alternativeMobile || '',
      'Blood Group': emp.bloodGroup || '',
      'Marital Status': emp.maritalStatus || '',
      'Marriage Date': toDisplayDate(emp.marriageDate),
      Disability: emp.disability || '',
      Department: emp.department || '',
      Designation: emp.designation || '',
      Branch: emp.branch || '',
      Location: emp.location || '',
      'Employment Type': emp.employmentType || '',
      Category: emp.category || '',
      'Joining Date': toDisplayDate(emp.joiningDate),
      'Annual Gross Salary': emp.ctcPerAnnum ?? emp.ctc ?? '',
      'Incentive (Monthly)': emp.incentive ?? '',
      'Basic Salary': emp.basicSalary ?? '',
      'PF Applicable': emp.pfApplicable ? 'Yes' : 'No',
      'PF Number': emp.pfNumber || '',
      'ESIC Applicable': emp.esicApplicable ? 'Yes' : 'No',
      'ESIC Number': emp.esicNumber || '',
      'Custom Benefits': customBenefitsExportText(emp),
      'Bank Name': emp.bankName || '',
      'Account Holder Name': emp.accountHolderName || '',
      'IFSC Code': emp.ifscCode || '',
      'Account Type': emp.accountType || '',
      'Previous Company': emp.prevCompany || '',
      'Previous Designation': emp.prevDesignation || '',
      'Notice Period Days': noticePeriodDaysRemaining(emp),
      'PAN Number': emp.panNumber || '',
      Status: emp.status || '',
    }));

  const downloadCSV = () => {
    const rows = downloadRows(filtered);
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
    saveAs(blob, `${companyName}_Employees_${today}.csv`);
    setShowDownload(false);
  };

  const downloadExcel = () => {
    const rows = downloadRows(filtered);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
    XLSX.writeFile(wb, `${companyName}_Employees_${today}.xlsx`);
    setShowDownload(false);
  };

  if (!companyId) return null;

  return (
    <div>
      <div className="mb-4">
        <PageHeader
          title="Employees"
          subtitle={`${totalCount} total · ${statsCounts.active || 0} active`}
          actions={
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDownload((o) => !o)}
                  className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-slate-50 active:bg-slate-100 bg-white"
                >
                  Download ▾
                </button>
                {showDownload && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[10rem]">
                    <button
                      type="button"
                      onClick={downloadCSV}
                      className="block w-full text-left min-h-[44px] px-4 py-2 text-sm hover:bg-slate-50 active:bg-slate-100"
                    >
                      Download CSV
                    </button>
                    <button
                      type="button"
                      onClick={downloadExcel}
                      className="block w-full text-left min-h-[44px] px-4 py-2 text-sm hover:bg-slate-50 active:bg-slate-100 rounded-b-lg"
                    >
                      Download Excel
                    </button>
                  </div>
                )}
              </div>
              {canEditEmployees && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...initialForm, empId: nextEmpId });
                    setSelectedRole(null);
                    setRoleSearch('');
                    setShowRoleDropdown(false);
                    setShowAddModal(true);
                  }}
                  className="inline-flex items-center justify-center min-h-[44px] rounded-lg bg-[#1B6B6B] hover:bg-[#155858] active:bg-[#0f4444] text-white text-sm font-medium px-4 py-2"
                >
                  Add Employee
                </button>
              )}
            </>
          }
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center mb-4">
        <div className="flex flex-wrap gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 sm:mx-0 sm:px-0 pb-1 sm:pb-0">
          {['all', 'active', 'noticeperiod', 'onleave', 'offboarding', 'inactive'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg min-h-[44px] px-3 py-2 text-sm font-medium flex-shrink-0 active:opacity-90 ${
                tab === t ? 'bg-[#1B6B6B] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
              }`}
            >
              {t === 'all'
                ? 'All'
                : t === 'active'
                  ? 'Active'
                  : t === 'noticeperiod'
                    ? 'Notice Period'
                    : t === 'onleave'
                      ? 'On Leave'
                      : t === 'offboarding'
                        ? 'Offboarding'
                        : 'Inactive'}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search (3+ chars searches all employees)..."
          className="w-full sm:ml-auto sm:w-72 min-h-[44px] rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
        />
      </div>

      <p className="text-sm text-slate-500 mb-3">
        Showing {filtered.length} of {totalCount} employees
        {employees.length < totalCount && !searchAllMode && hasMore ? ` · ${employees.length} loaded` : ''}
        {searchAllMode ? ' · search all results' : ''}
        {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active (extra filters apply to loaded rows)` : ''}
      </p>

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setShowFilters((o) => !o)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-sm transition-colors relative min-h-[44px] ${
              showFilters || activeFilterCount > 0
                ? 'border-[#1B6B6B] text-[#1B6B6B] bg-[#E8F5F5]'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>⚙️</span>
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-[#1B6B6B] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {activeFilters.map((f) => (
              <span
                key={f.key}
                className="flex items-center gap-1 bg-[#E8F5F5] text-[#1B6B6B] text-xs px-2.5 py-1 rounded-full border border-[#C5E8E8]"
              >
                {f.label}: {f.value}
                <button type="button" onClick={() => clearFilter(f.key)} className="ml-1 hover:text-[#0A2E2E]">
                  ✕
                </button>
              </span>
            ))}
            <button type="button" onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1">
              Clear all
            </button>
          </div>
        )}

        {showFilters && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Filter Employees</h3>
              <button
                type="button"
                onClick={() => setFilters({ ...EMPTY_EMPLOYEE_FILTERS })}
                className="text-xs text-[#1B6B6B] hover:underline"
              >
                Clear all filters
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Department</label>
                <select
                  value={filters.department}
                  onChange={(e) => setFilters((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Branch</label>
                <select
                  value={filters.branch}
                  onChange={(e) => setFilters((prev) => ({ ...prev, branch: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Location</label>
                <select
                  value={filters.location}
                  onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  {locationFilterOptions.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Employment Type</label>
                <select
                  value={filters.employmentType}
                  onChange={(e) => setFilters((prev) => ({ ...prev, employmentType: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  {employmentTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Designation</label>
                <select
                  value={filters.designation}
                  onChange={(e) => setFilters((prev) => ({ ...prev, designation: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  {designationFilterOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Gender</label>
                <select
                  value={filters.gender}
                  onChange={(e) => setFilters((prev) => ({ ...prev, gender: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Blood Group</label>
                <select
                  value={filters.bloodGroup}
                  onChange={(e) => setFilters((prev) => ({ ...prev, bloodGroup: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Marital Status</label>
                <select
                  value={filters.maritalStatus}
                  onChange={(e) => setFilters((prev) => ({ ...prev, maritalStatus: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Disability</label>
                <select
                  value={filters.disability}
                  onChange={(e) => setFilters((prev) => ({ ...prev, disability: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  <option value="none">None</option>
                  <option value="Visual Impairment">Visual Impairment</option>
                  <option value="Hearing Impairment">Hearing Impairment</option>
                  <option value="Physical Disability">Physical Disability</option>
                  <option value="Intellectual Disability">Intellectual Disability</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Reporting Manager</label>
                <select
                  value={filters.reportingManager}
                  onChange={(e) => setFilters((prev) => ({ ...prev, reportingManager: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  {reportingManagerFilterOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">PF Applicable</label>
                <select
                  value={filters.pfApplicable}
                  onChange={(e) => setFilters((prev) => ({ ...prev, pfApplicable: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">ESIC Applicable</label>
                <select
                  value={filters.esicApplicable}
                  onChange={(e) => setFilters((prev) => ({ ...prev, esicApplicable: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Joined From Year</label>
                <select
                  value={filters.joinYearFrom}
                  onChange={(e) => setFilters((prev) => ({ ...prev, joinYearFrom: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">Any</option>
                  {joinYearSelectOptions.map((y) => (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Joined To Year</label>
                <select
                  value={filters.joinYearTo}
                  onChange={(e) => setFilters((prev) => ({ ...prev, joinYearTo: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">Any</option>
                  {joinYearSelectOptions.map((y) => (
                    <option key={`to-${y}`} value={String(y)}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activeFilterCount > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-[#1B6B6B]">
                  {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <SkeletonTable rows={8} />
        </>
      ) : null}

      {!loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-slate-800">{totalCount}</p>
              <p className="text-xs text-slate-500">All</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-green-700">{statsCounts.active}</p>
              <p className="text-xs text-slate-500">Active</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-amber-600">{statsCounts.noticePeriod}</p>
              <p className="text-xs text-slate-500">Notice Period</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-blue-700">{statsCounts.onLeave}</p>
              <p className="text-xs text-slate-500">On Leave</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-orange-600">{statsCounts.offboarding}</p>
              <p className="text-xs text-slate-500">Offboarding</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-slate-400">{statsCounts.inactive}</p>
              <p className="text-xs text-slate-500">Inactive</p>
            </div>
          </div>

          <div className="hidden lg:block overflow-x-auto overflow-y-auto max-h-[70vh] border border-slate-200 rounded-xl bg-white">
          <table className="min-w-[1400px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Emp ID</th>
                <th className="px-4 py-3 text-left font-medium">Name + Email</th>
                <th className="px-4 py-3 text-left font-medium">Department</th>
                <th className="px-4 py-3 text-left font-medium">Designation</th>
                <th className="px-4 py-3 text-left font-medium">Phone</th>
                <th className="px-4 py-3 text-left font-medium">Joining Date</th>
                <th className="px-4 py-3 text-left font-medium">Branch</th>
                <th className="px-4 py-3 text-left font-medium">Location</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 transition-all ${getRowTintClass(emp.status)}`}
                    onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                    style={{
                      borderLeft: `3px solid ${STATUS_BORDER_COLOR[emp.status] || getDeptColor(emp.department)}`,
                    }}
                  >
                    <td className="px-4 py-3 font-mono text-slate-700">{emp.empId || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <EmployeeAvatar employee={emp} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{emp.fullName || '—'}</p>
                          <p className="text-xs text-slate-500">{emp.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{emp.department || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{emp.designation || '—'}</span>
                        <EmployeeStatusSubline emp={emp} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{emp.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{toDisplayDate(emp.joiningDate)}</td>
                    <td className="px-4 py-3 text-slate-700">{emp.branch || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{emp.location || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={emp.status || 'Active'} />
                      {(emp.offboarding?.phase === 'exit_tasks' || emp.offboarding?.status === 'in_progress') && (
                        <div className="flex items-center gap-1 mt-1">
                          <div className="w-16 bg-gray-100 rounded-full h-1">
                            <div
                              className="bg-orange-400 h-1 rounded-full"
                              style={{ width: `${emp.offboarding?.completionPct || 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-orange-600">Exit tasks</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)} className="text-[#1B6B6B] text-xs font-medium hover:underline">
                        {canEditEmployees ? 'View Profile' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-0">
                    <EmptyState
                      illustration={
                        <div className="w-16 h-16 rounded-2xl bg-[#E1F5EE] flex items-center justify-center">
                          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                            <circle cx="14" cy="11" r="5" fill="#9FE1CB" />
                            <path
                              d="M4 30c0-5.523 4.477-10 10-10s10 4.477 10 10"
                              stroke="#0F6E56"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                            <circle cx="26" cy="13" r="3.5" fill="#5DCAA5" />
                            <path
                              d="M26 20c3.314 0 6 2.686 6 6"
                              stroke="#1D9E75"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                            <circle cx="26" cy="26" r="5" fill="#1B6B6B" />
                            <path d="M24 26h4M26 24v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </div>
                      }
                      title={
                        search || Object.values(filters).some(Boolean)
                          ? `No results for "${search || 'current filters'}"`
                          : 'No employees yet'
                      }
                      description={
                        search || Object.values(filters).some(Boolean)
                          ? 'Try a different name, Emp ID, or department'
                          : 'Add your first employee to get started with HR management.'
                      }
                      action={
                        search || Object.values(filters).some(Boolean)
                          ? () => {
                              setSearch('');
                              setFilters({ ...EMPTY_EMPLOYEE_FILTERS });
                            }
                          : canEditEmployees
                            ? () => setShowAddModal(true)
                            : null
                      }
                      actionLabel={
                        search || Object.values(filters).some(Boolean)
                          ? 'Clear filters'
                          : 'Add first employee'
                      }
                      actionColor={
                        search || Object.values(filters).some(Boolean) ? '#5F5E5A' : '#1B6B6B'
                      }
                      hint={
                        !(search || Object.values(filters).some(Boolean)) && canEditEmployees
                          ? 'or import from Excel'
                          : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Showing {(currentPage - 1) * TABLE_PAGE_SIZE + (filtered.length === 0 ? 0 : 1)}–
                {Math.min(currentPage * TABLE_PAGE_SIZE, filtered.length)} of {filtered.length} employees
              </p>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                >
                  «
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let page;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 text-xs rounded-lg border transition-colors ${
                        currentPage === page
                          ? 'bg-[#1B6B6B] text-white border-[#1B6B6B]'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                >
                  Next ›
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>

          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {paginatedEmployees.map((emp) => (
              <div
                key={emp.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate(`/company/${companyId}/employees/${emp.id}`);
                }}
                className={`bg-white border border-gray-100 rounded-2xl overflow-hidden p-4 cursor-pointer hover:border-gray-200 active:bg-gray-50 ${getCardTopBorderClass(emp.status)} ${getRowTintClass(emp.status)}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <EmployeeAvatar employee={emp} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{emp.fullName || '—'}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {emp.empId || '—'} · {emp.department || '—'}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <StatusBadge status={emp.status || 'Active'} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div>
                    <span className="text-gray-400">Designation</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-gray-700 font-medium truncate">{emp.designation || '—'}</p>
                      <EmployeeStatusSubline emp={emp} />
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400">Joined</span>
                    <p className="text-gray-700 font-medium">{toDisplayDate(emp.joiningDate)}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Phone</span>
                    <p className="text-gray-700 font-medium">{emp.phone || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Branch</span>
                    <p className="text-gray-700 font-medium truncate">{emp.branch || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Location</span>
                    <p className="text-gray-700 font-medium truncate">{emp.location || '—'}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                    className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-[#1B6B6B] border border-gray-200 hover:bg-gray-50 active:bg-gray-100"
                  >
                    {canEditEmployees ? 'View Profile' : 'View'}
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <EmptyState
                illustration={
                  <div className="w-16 h-16 rounded-2xl bg-[#E1F5EE] flex items-center justify-center">
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                      <circle cx="14" cy="11" r="5" fill="#9FE1CB" />
                      <path
                        d="M4 30c0-5.523 4.477-10 10-10s10 4.477 10 10"
                        stroke="#0F6E56"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle cx="26" cy="13" r="3.5" fill="#5DCAA5" />
                      <path d="M26 20c3.314 0 6 2.686 6 6" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="26" cy="26" r="5" fill="#1B6B6B" />
                      <path d="M24 26h4M26 24v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                }
                title={
                  search || Object.values(filters).some(Boolean)
                    ? `No results for "${search || 'current filters'}"`
                    : 'No employees yet'
                }
                description={
                  search || Object.values(filters).some(Boolean)
                    ? 'Try a different name, Emp ID, or department'
                    : 'Add your first employee to get started with HR management.'
                }
                action={
                  search || Object.values(filters).some(Boolean)
                    ? () => {
                        setSearch('');
                        setFilters({ ...EMPTY_EMPLOYEE_FILTERS });
                      }
                    : canEditEmployees
                      ? () => setShowAddModal(true)
                      : null
                }
                actionLabel={
                  search || Object.values(filters).some(Boolean) ? 'Clear filters' : 'Add first employee'
                }
                actionColor={
                  search || Object.values(filters).some(Boolean) ? '#5F5E5A' : '#1B6B6B'
                }
                hint={
                  !(search || Object.values(filters).some(Boolean)) && canEditEmployees
                    ? 'or import from Excel'
                    : undefined
                }
              />
            )}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-2 py-3 border-t border-gray-100 bg-white rounded-b-2xl">
                <p className="text-sm text-gray-500 text-center sm:text-left">
                  Showing {(currentPage - 1) * TABLE_PAGE_SIZE + (filtered.length === 0 ? 0 : 1)}–
                  {Math.min(currentPage * TABLE_PAGE_SIZE, filtered.length)} of {filtered.length} employees
                </p>
                <div className="flex items-center justify-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let page;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 text-xs rounded-lg border transition-colors ${
                          currentPage === page
                            ? 'bg-[#1B6B6B] text-white border-[#1B6B6B]'
                            : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>

          {hasMore && !searchAllMode && (
            <div className="flex justify-center py-4">
              <button
                type="button"
                onClick={() => fetchEmployees(false)}
                disabled={loadingMore}
                className="flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load more (${Math.max(0, totalCount - employees.length)} remaining)`
                )}
              </button>
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] min-h-0 flex flex-col overflow-hidden sm:my-8">
            {(() => {
              try {
                return (
                  <>
                    <div className="flex justify-center pt-2 pb-1 sm:hidden flex-shrink-0">
                      <div className="w-10 h-1 bg-gray-200 rounded-full" />
                    </div>
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                      <div>
                        <h2 className="text-base font-semibold text-gray-800">Add Employee</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Step {addStep + 1} of {ADD_STEPS.length} — {ADD_STEPS[addStep].sub}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCloseAddModal}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-lg"
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center px-6 py-3 gap-1 border-b border-gray-100 flex-shrink-0 bg-gray-50/50">
                      {ADD_STEPS.map((step, i) => (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => {
                            if (i < addStep) setAddStep(i);
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex-1 justify-center ${
                            i === addStep
                              ? 'bg-[#1B6B6B] text-white'
                              : i < addStep
                                ? 'text-[#1B6B6B] bg-[#E1F5EE]'
                                : 'text-gray-400 bg-transparent'
                          }`}
                        >
                          <span
                            className={
                              i === addStep
                                ? 'text-white'
                                : i < addStep
                                  ? 'text-[#0F6E56]'
                                  : 'text-gray-300'
                            }
                          >
                            {i < addStep ? (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path
                                  d="M2 6l3 3 5-5"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : (
                              step.icon
                            )}
                          </span>
                          <span className="hidden sm:inline">{step.label}</span>
                        </button>
                      ))}
                    </div>
                    <form onSubmit={handleAddEmployee} className="flex flex-col flex-1 min-h-0">
                      <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {addStep === 0 && (<>
              <div className="flex flex-col items-center py-4 mb-6 border-b border-gray-100">
                <div className="relative group mb-3">
                  {newEmpPhotoSrc ? (
                    <img
                      src={newEmpPhotoSrc}
                      alt="Preview"
                      loading="lazy"
                      className="w-24 h-24 rounded-full object-cover ring-4 ring-[#E8F5F5] border-2 border-[#4ECDC4]"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400">
                      <span className="text-2xl">📷</span>
                      <span className="text-xs mt-1">No photo</span>
                    </div>
                  )}
                  {newEmpPhotoSrc && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewEmpPhoto(null);
                        setNewEmpPhotoSrc(null);
                        setNewEmpRawSrc(null);
                      }}
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center border-2 border-white hover:bg-red-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    className="hidden"
                    onChange={(ev) => {
                      const file = ev.target.files?.[0];
                      if (!file) return;
                      ev.target.value = '';
                      if (!file.type.startsWith('image/')) {
                        showError('Please select an image file');
                        return;
                      }
                      if (file.size > 10 * 1024 * 1024) {
                        showError('Image must be under 10MB');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (re) => {
                        setNewEmpRawSrc(re.target?.result || null);
                        setNewEmpCrop({ x: 0, y: 0 });
                        setNewEmpZoom(1);
                        setNewEmpCroppedPixels(null);
                        setNewEmpCropOpen(true);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <span className="px-4 py-2 text-sm border border-[#1B6B6B] text-[#1B6B6B] rounded-xl hover:bg-[#E8F5F5] transition-colors font-medium inline-block">
                    {newEmpPhotoSrc ? '🔄 Change Photo' : '📷 Add Photo'}
                  </span>
                </label>
                <p className="text-xs text-gray-400 mt-2">Optional · JPG or PNG · Max 10MB</p>
              </div>
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-base">👤</span>
                  Personal Info
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                    <input name="fullName" value={form.fullName} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" />
                    {formErrors.fullName && <p className="text-red-500 text-xs mt-1">{formErrors.fullName}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Father&apos;s Name</label>
                    <input
                      name="fatherName"
                      value={form.fatherName}
                      onChange={handleFormChange}
                      placeholder="Father's full name"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                    <input type="email" name="email" value={form.email} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" />
                    {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                    <input name="phone" value={form.phone} onChange={handleFormChange} placeholder="10-digit mobile number" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Alternative Mobile</label>
                    <input
                      type="tel"
                      name="alternativeMobile"
                      placeholder="Alternative 10-digit number"
                      value={form.alternativeMobile}
                      onChange={handleFormChange}
                      maxLength={10}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                    <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" />
                    {formErrors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{formErrors.dateOfBirth}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Gender</label>
                    <select name="gender" value={form.gender} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                      <option value="">—</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Blood Group</label>
                    <select
                      name="bloodGroup"
                      value={form.bloodGroup}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    >
                      <option value="">Select blood group</option>
                      {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                        <option key={bg} value={bg}>
                          {bg}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Marital Status</label>
                    <select
                      name="maritalStatus"
                      value={form.maritalStatus}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    >
                      <option value="">Select status</option>
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                      <option value="Divorced">Divorced</option>
                      <option value="Widowed">Widowed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 block mb-1">Disability</label>
                    <select
                      name="disability"
                      value={form.disability}
                      onChange={handleFormChange}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    >
                      <option value="">None</option>
                      <option value="Visual Impairment">Visual Impairment</option>
                      <option value="Hearing Impairment">Hearing Impairment</option>
                      <option value="Physical Disability">Physical Disability</option>
                      <option value="Intellectual Disability">Intellectual Disability</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  {form.maritalStatus === 'Married' && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Marriage Date / Wedding Date</label>
                      <input
                        type="date"
                        name="marriageDate"
                        value={form.marriageDate}
                        onChange={handleFormChange}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-base">📍</span>
                  Address
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Street Address</label>
                    <input
                      name="streetAddress"
                      value={form.streetAddress}
                      onChange={handleFormChange}
                      placeholder="House/Flat no, Street name"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                    <input
                      name="city"
                      value={form.city}
                      onChange={handleFormChange}
                      placeholder="City"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                    <select
                      name="state"
                      value={form.state}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    >
                      <option value="">Select state</option>
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Pincode</label>
                    <input
                      name="pincode"
                      value={form.pincode}
                      onChange={handleFormChange}
                      placeholder="6-digit pincode"
                      maxLength={6}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                    {formErrors.pincode && <p className="text-red-500 text-xs mt-1">{formErrors.pincode}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
                    <input
                      name="country"
                      value={form.country}
                      onChange={handleFormChange}
                      placeholder="Country"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                </div>
              </div>

              </>)}

              {addStep === 3 && (<>
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-base">🚨</span>
                  Emergency Contact
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Contact Name</label>
                    <input
                      name="emergencyContactName"
                      value={form.emergencyContactName}
                      onChange={handleFormChange}
                      placeholder="Full name"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                    {formErrors.emergencyContactName && <p className="text-red-500 text-xs mt-1">{formErrors.emergencyContactName}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Relationship</label>
                    <select
                      name="emergencyRelationship"
                      value={form.emergencyRelationship}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
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
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Contact Phone</label>
                    <input
                      name="emergencyPhone"
                      value={form.emergencyPhone}
                      onChange={handleFormChange}
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                    {formErrors.emergencyPhone && <p className="text-red-500 text-xs mt-1">{formErrors.emergencyPhone}</p>}
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-[#E1F5EE] rounded-xl border border-[#9FE1CB]">
                <p className="text-xs font-medium text-[#0F6E56] mb-2">Ready to add employee</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { l: 'Name', v: form.fullName },
                    { l: 'Emp ID', v: form.empId || '(auto)' },
                    { l: 'Department', v: form.department || '—' },
                    { l: 'Joining', v: form.joiningDate || '—' },
                  ].map(({ l, v }) => (
                    <div key={l}>
                      <p className="text-xs text-[#0F6E56]/60">{l}</p>
                      <p className="text-xs font-medium text-[#085041] truncate">{v || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
              </>)}

              {addStep === 1 && (<>
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-base">💼</span>
                  Previous Experience
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Previous Company Name</label>
                    <input
                      name="prevCompany"
                      placeholder="e.g. Infosys Pvt Ltd"
                      value={form.prevCompany}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Previous Designation</label>
                    <input
                      name="prevDesignation"
                      placeholder="e.g. Software Engineer"
                      value={form.prevDesignation}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">From Date</label>
                        <input
                          type="date"
                          name="prevFromDate"
                          value={form.prevFromDate}
                          onChange={handleFormChange}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">To Date</label>
                        <input
                          type="date"
                          name="prevToDate"
                          value={form.prevToDate}
                          onChange={handleFormChange}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm hover:border-[#1B6B6B] focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                        />
                      </div>
                    </div>
                    {form.prevFromDate && form.prevToDate && (
                      <div className="mt-1.5 px-3 py-1.5 bg-[#E8F5F5] rounded-lg">
                        <p className="text-xs text-[#1B6B6B]">
                          📅 Duration:{' '}
                          {(() => {
                            const from = new Date(form.prevFromDate);
                            const to = new Date(form.prevToDate);
                            const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
                            const years = Math.floor(months / 12);
                            const remainingMonths = months % 12;
                            if (years === 0) {
                              return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
                            }
                            if (remainingMonths === 0) {
                              return `${years} year${years !== 1 ? 's' : ''}`;
                            }
                            return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
                          })()}
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Previous Manager Name</label>
                    <input
                      name="prevManagerName"
                      placeholder="Manager's full name"
                      value={form.prevManagerName}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Previous Manager Phone</label>
                    <input
                      type="tel"
                      name="prevManagerPhone"
                      placeholder="Manager's phone number"
                      value={form.prevManagerPhone}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Previous Manager Email</label>
                    <input
                      type="email"
                      name="prevManagerEmail"
                      placeholder="Manager's email address"
                      value={form.prevManagerEmail}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-base">💼</span>
                  Employment Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Emp ID</label>
                    <input
                      name="empId"
                      value={form.empId}
                      onChange={handleFormChange}
                      onBlur={handleEmpIdBlur}
                      placeholder={nextEmpId}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20 font-mono"
                    />
                    {formErrors.empId && <p className="text-xs text-red-500 mt-1">{formErrors.empId}</p>}
                    {!formErrors.empId && formWarnings.empId && <p className="text-xs text-amber-600 mt-1">{formWarnings.empId}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                    <select name="department" value={form.department} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                      <option value="">—</option>
                      {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                      {!departments.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div className="sm:col-span-2 relative" ref={roleDropdownRef}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Designation</label>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setShowRoleDropdown(true)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') setShowRoleDropdown(true);
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px]"
                    >
                      {selectedRole ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="min-w-0 text-left">
                            <p className="text-sm font-medium text-gray-900">{selectedRole.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {selectedRole.reportsTo
                                ? `Reports to ${selectedRole.reportsTo}`
                                : 'Top level designation'}
                              {selectedRole.salaryBand?.min != null &&
                                selectedRole.salaryBand?.min !== '' &&
                                ` · ₹${formatLakhs(selectedRole.salaryBand.min)}–${formatLakhs(selectedRole.salaryBand.max)}/mo`}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Search or select designation…</span>
                      )}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {selectedRole && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRole(null);
                              setForm((prev) => ({ ...prev, designation: '', designationRoleId: '' }));
                            }}
                            className="text-slate-400 hover:text-slate-600 text-xs"
                          >
                            ✕
                          </button>
                        )}
                        <span className="text-slate-400 text-xs">▾</span>
                      </div>
                    </div>
                    {showRoleDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-[60] max-h-64 overflow-hidden">
                        <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
                          <input
                            autoFocus
                            placeholder="Search by designation or reports-to…"
                            value={roleSearch}
                            onChange={(e) => setRoleSearch(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="overflow-y-auto max-h-52">
                          {roles.length === 0 && (
                            <div className="px-3 py-4 text-center">
                              <p className="text-sm text-slate-400 mb-2">No designations defined yet</p>
                              <p className="text-xs text-slate-400">Go to Library → Designations to add</p>
                            </div>
                          )}
                          {roles
                            .filter((r) => r.isActive !== false)
                            .filter((r) => {
                              if (!roleSearch.trim()) return true;
                              const q = roleSearch.toLowerCase();
                              return (
                                (r.title || '').toLowerCase().includes(q) ||
                                (r.reportsTo || '').toLowerCase().includes(q)
                              );
                            })
                            .map((role) => (
                              <div
                                key={role.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setSelectedRole(role);
                                  setForm((prev) => ({
                                    ...prev,
                                    designation: role.title || '',
                                    designationRoleId: role.id,
                                  }));
                                  setShowRoleDropdown(false);
                                  setRoleSearch('');
                                }}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter' || ev.key === ' ') {
                                    setSelectedRole(role);
                                    setForm((prev) => ({
                                      ...prev,
                                      designation: role.title || '',
                                      designationRoleId: role.id,
                                    }));
                                    setShowRoleDropdown(false);
                                    setRoleSearch('');
                                  }
                                }}
                                className={`px-3 py-3 hover:bg-[#E8F5F5] cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${
                                  selectedRole?.id === role.id ? 'bg-[#E8F5F5]' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex-1 min-w-0 text-left">
                                    <p className="text-sm font-medium text-gray-900">{role.title}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {role.reportsTo ? `Reports to ${role.reportsTo}` : 'Top level designation'}
                                      {role.salaryBand?.min != null &&
                                        role.salaryBand?.min !== '' &&
                                        ` · ₹${formatLakhs(role.salaryBand.min)}–${formatLakhs(role.salaryBand.max)}/mo (₹${formatLakhs(Number(role.salaryBand.min) * 12)}–${formatLakhs(Number(role.salaryBand.max) * 12)} pa)`}
                                    </p>
                                  </div>
                                  {selectedRole?.id === role.id && (
                                    <span className="text-[#1B6B6B] flex-shrink-0">✓</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          {roles.filter((r) => r.isActive !== false).filter((r) => {
                            if (!roleSearch.trim()) return true;
                            const q = roleSearch.toLowerCase();
                            return (
                              (r.title || '').toLowerCase().includes(q) ||
                              (r.reportsTo || '').toLowerCase().includes(q)
                            );
                          }).length === 0 &&
                            roles.length > 0 && (
                              <div className="px-3 py-4 text-center text-sm text-gray-400">No designations found.</div>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
                    <select name="branch" value={form.branch} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                      <option value="">—</option>
                      {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                      {!branches.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div className="sm:col-span-2 relative" ref={locationDropdownRef}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setShowLocationDropdown(true)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') setShowLocationDropdown(true);
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px]"
                    >
                      {form.location ? (
                        <span>{form.location}</span>
                      ) : (
                        <span className="text-gray-400">Select location...</span>
                      )}
                      <span className="text-gray-400 text-xs">▾</span>
                    </div>
                    {showLocationDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-52 overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            autoFocus
                            placeholder="Search location..."
                            value={locationSearch}
                            onChange={(e) => setLocationSearch(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="overflow-y-auto max-h-40">
                          {(company?.locations || [])
                            .filter((l) => !locationSearch || l.toLowerCase().includes(locationSearch.toLowerCase()))
                            .map((loc) => (
                              <div
                                key={loc}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setForm((prev) => ({ ...prev, location: loc }));
                                  setShowLocationDropdown(false);
                                  setLocationSearch('');
                                }}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter' || ev.key === ' ') {
                                    setForm((prev) => ({ ...prev, location: loc }));
                                    setShowLocationDropdown(false);
                                    setLocationSearch('');
                                  }
                                }}
                                className="px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer text-sm border-b border-gray-50 last:border-0"
                              >
                                {loc}
                              </div>
                            ))}
                          {(company?.locations || []).length === 0 && (
                            <div className="px-3 py-4 text-center text-sm text-gray-400">
                              No locations configured.
                              <br />
                              Add in Settings → Manage Lists
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Employment Type</label>
                    <select name="employmentType" value={form.employmentType} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                      {employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      {!employmentTypes.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                    <select name="category" value={form.category} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                      <option value="">—</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      {!categories.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Qualification</label>
                    <select name="qualification" value={form.qualification} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20">
                      <option value="">—</option>
                      {qualifications.map((q) => <option key={q} value={q}>{q}</option>)}
                      {!qualifications.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Joining Date</label>
                    <input type="date" name="joiningDate" value={form.joiningDate} onChange={handleFormChange} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Reporting Manager</label>
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
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:border-[#4ECDC4]"
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
                              className="w-full text-sm px-2 py-1.5 border border-slate-200 rounded focus:outline-none focus:border-[#4ECDC4]"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>

                          <div className="overflow-y-auto max-h-36">
                            <div
                              role="button"
                              tabIndex={0}
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

                            {reportingManagerOptions
                              .filter((emp) => {
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
                                  role="button"
                                  tabIndex={0}
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

                            {reportingManagerOptions.filter((emp) => {
                              if (!managerSearch) return true;
                              return emp.fullName?.toLowerCase().includes(managerSearch.toLowerCase());
                            }).length === 0 && (
                              <div className="px-3 py-4 text-center text-sm text-slate-400">No employees found</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-base">💰</span>
                  Compensation
                </h3>
                {form.designation && roleSalaryBand && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4">
                    <p className="text-xs text-blue-700 font-medium">
                      💼 Salary band for <strong>{form.designation}</strong>: ₹{formatLakhs(roleSalaryBand.min)}/mo — ₹
                      {formatLakhs(roleSalaryBand.max)}/mo (₹{formatLakhs(roleSalaryBand.min * 12)}—₹
                      {formatLakhs(roleSalaryBand.max * 12)} p.a.)
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Basic Salary (per month) ₹</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={form.basicSalary || ''}
                      onChange={(e) => {
                        const basic = Number(e.target.value);
                        const hra = Number(form.hra) || 0;
                        const incentive = Number(form.incentive) || 0;
                        const annual = (basic + hra + incentive) * 12;
                        setForm((prev) => ({
                          ...prev,
                          basicSalary: e.target.value,
                          ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum,
                        }));
                      }}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] border-gray-200"
                    />
                    {form.basicSalary ? (
                      <p className="text-xs text-gray-400 mt-1">
                        = ₹{formatLakhs(Number(form.basicSalary) * 12)} per annum
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">HRA (per month) ₹</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={form.hra || ''}
                      onChange={(e) => {
                        const hra = Number(e.target.value);
                        const basic = Number(form.basicSalary) || 0;
                        const incentive = Number(form.incentive) || 0;
                        const annual = (basic + hra + incentive) * 12;
                        setForm((prev) => ({
                          ...prev,
                          hra: e.target.value,
                          ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum,
                        }));
                      }}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] border-gray-200"
                    />
                    {form.hra ? (
                      <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.hra) * 12)} per annum</p>
                    ) : null}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Incentive (per month)</label>
                    <input
                      type="number"
                      min="0"
                      name="incentive"
                      placeholder="0"
                      value={form.incentive}
                      onChange={(e) => {
                        const incentive = Number(e.target.value);
                        const basic = Number(form.basicSalary) || 0;
                        const hra = Number(form.hra) || 0;
                        const annual = (basic + hra + incentive) * 12;
                        setForm((prev) => ({
                          ...prev,
                          incentive: e.target.value,
                          ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum,
                        }));
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                    {form.incentive !== '' && form.incentive != null && !Number.isNaN(Number(form.incentive)) && Number(form.incentive) !== 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        = ₹{formatLakhs(Number(form.incentive))} per month · ₹{formatLakhs(Number(form.incentive) * 12)} per annum
                      </p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-gray-500 block mb-1.5">
                      Annual Gross Salary ₹
                      <span className="text-gray-300 ml-1 font-normal">(auto-calculated · editable)</span>
                    </label>
                    <input
                      type="number"
                      placeholder="Auto-calculated from above"
                      value={form.ctcPerAnnum || ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, ctcPerAnnum: e.target.value }))}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] border-gray-200"
                    />
                    {form.ctcPerAnnum ? (
                      <p className="text-xs text-gray-400 mt-1">
                        = ₹{formatLakhs(Number(form.ctcPerAnnum) / 12)} per month
                      </p>
                    ) : null}
                    {form.ctcPerAnnum && roleSalaryBand && (
                      <p
                        className={`text-xs mt-1 font-medium ${
                          Number(form.ctcPerAnnum) >= roleSalaryBand.min * 12 &&
                          Number(form.ctcPerAnnum) <= roleSalaryBand.max * 12
                            ? 'text-green-600'
                            : 'text-amber-600'
                        }`}
                      >
                        {Number(form.ctcPerAnnum) >= roleSalaryBand.min * 12 &&
                        Number(form.ctcPerAnnum) <= roleSalaryBand.max * 12
                          ? '✓ Within salary band'
                          : '⚠ Outside salary band for this designation'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span>🏥</span> Benefits
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Provident Fund (PF)</p>
                        <p className="text-xs text-gray-400">Statutory benefit</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            pfApplicable: !prev.pfApplicable,
                            pfNumber: prev.pfApplicable ? '' : prev.pfNumber,
                          }))
                        }
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.pfApplicable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                            form.pfApplicable ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                    {form.pfApplicable && (
                      <input
                        name="pfNumber"
                        placeholder="PF Account Number"
                        value={form.pfNumber}
                        onChange={handleFormChange}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                      />
                    )}
                  </div>
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-700">ESIC</p>
                        <p className="text-xs text-gray-400">Statutory benefit</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            esicApplicable: !prev.esicApplicable,
                            esicNumber: prev.esicApplicable ? '' : prev.esicNumber,
                          }))
                        }
                        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.esicApplicable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                            form.esicApplicable ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                    {form.esicApplicable && (
                      <input
                        name="esicNumber"
                        placeholder="ESIC Number"
                        value={form.esicNumber}
                        onChange={handleFormChange}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                      />
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700">Additional Benefits</p>
                    <button
                      type="button"
                      onClick={() => {
                        const newBenefit = { id: `benefit_${Date.now()}`, name: '', value: '', notes: '' };
                        setForm((prev) => ({
                          ...prev,
                          customBenefits: [...(prev.customBenefits || []), newBenefit],
                        }));
                      }}
                      className="text-xs text-[#1B6B6B] hover:underline flex items-center gap-1"
                    >
                      + Add Benefit
                    </button>
                  </div>
                  {(form.customBenefits || []).length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({
                          ...prev,
                          customBenefits: [{ id: `benefit_${Date.now()}`, name: '', value: '', notes: '' }],
                        }));
                      }}
                      className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors"
                    >
                      + Add benefit (Medical Insurance, Food Allowance, etc.)
                    </button>
                  )}
                  <div className="space-y-2">
                    {(form.customBenefits || []).map((benefit, index) => (
                      <div key={benefit.id} className="p-3 border border-gray-100 rounded-xl bg-gray-50">
                        <div className="flex gap-2 mb-2">
                          <select
                            value={
                              !benefit.name
                                ? ''
                                : benefitTemplates.some((t) => t.name === benefit.name)
                                  ? benefit.name
                                  : '__custom__'
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              setForm((prev) => {
                                const updated = [...(prev.customBenefits || [])];
                                const cur = updated[index];
                                updated[index] = {
                                  ...cur,
                                  name: v === '__custom__' ? '__custom__' : v,
                                  customName: v === '__custom__' ? cur.customName || '' : '',
                                };
                                return { ...prev, customBenefits: updated };
                              });
                            }}
                            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                          >
                            <option value="">Select benefit...</option>
                            {benefitTemplates.map((bt) => (
                              <option key={bt.id} value={bt.name}>
                                {bt.name}
                              </option>
                            ))}
                            <option value="__custom__">Other (type below)</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                customBenefits: (prev.customBenefits || []).filter((_, i) => i !== index),
                              }));
                            }}
                            className="text-red-400 hover:text-red-600 px-2"
                          >
                            ✕
                          </button>
                        </div>
                        {(benefit.name === '__custom__' ||
                          (benefit.name && !benefitTemplates.some((t) => t.name === benefit.name))) && (
                          <input
                            placeholder="Enter benefit name"
                            value={
                              benefit.name === '__custom__'
                                ? benefit.customName || ''
                                : benefit.name || ''
                            }
                            onChange={(e) => {
                              setForm((prev) => {
                                const updated = [...(prev.customBenefits || [])];
                                updated[index] = {
                                  ...updated[index],
                                  name: '__custom__',
                                  customName: e.target.value,
                                };
                                return { ...prev, customBenefits: updated };
                              });
                            }}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-2 bg-white"
                          />
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            placeholder="Value (e.g. ₹5,00,000 or 2,500/month)"
                            value={benefit.value}
                            onChange={(e) => {
                              setForm((prev) => {
                                const updated = [...(prev.customBenefits || [])];
                                updated[index] = { ...updated[index], value: e.target.value };
                                return { ...prev, customBenefits: updated };
                              });
                            }}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                          />
                          <input
                            placeholder="Notes (e.g. Family floater)"
                            value={benefit.notes}
                            onChange={(e) => {
                              setForm((prev) => {
                                const updated = [...(prev.customBenefits || [])];
                                updated[index] = { ...updated[index], notes: e.target.value };
                                return { ...prev, customBenefits: updated };
                              });
                            }}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              </>)}

              {addStep === 2 && (<>
              {/* ── Bank Details ── */}
              <div className="pt-4 border-t border-gray-100 mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  💳 Bank Details
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Bank Name</label>
                    <input
                      value={form.bankName}
                      onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))}
                      placeholder="e.g. State Bank of India"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Account Holder Name</label>
                    <input
                      value={form.accountHolderName}
                      onChange={(e) => setForm((p) => ({ ...p, accountHolderName: e.target.value }))}
                      placeholder="As per bank records"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">IFSC Code</label>
                    <input
                      value={form.ifscCode}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          ifscCode: e.target.value.toUpperCase().trim(),
                        }))
                      }
                      placeholder="e.g. SBIN0001234"
                      maxLength={11}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:border-[#1B6B6B]"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Account Type</label>
                    <select
                      value={form.accountType}
                      onChange={(e) => setForm((p) => ({ ...p, accountType: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">Select account type...</option>
                      <option value="Savings">Savings</option>
                      <option value="Current">Current</option>
                      <option value="Salary">Salary</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-base">🪪</span>
                  Statutory &amp; Identity
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">PAN Number</label>
                    <input
                      name="panNumber"
                      value={form.panNumber}
                      onChange={handleFormChange}
                      placeholder="e.g. ABCDE1234F"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20 uppercase"
                      maxLength={20}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Aadhaar Number</label>
                    <input
                      name="aadhaarNumber"
                      value={form.aadhaarNumber}
                      onChange={handleFormChange}
                      placeholder="12-digit number"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                      maxLength={20}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Driving Licence No.</label>
                    <input
                      name="drivingLicenceNumber"
                      value={form.drivingLicenceNumber}
                      onChange={handleFormChange}
                      placeholder="e.g. MH0120210012345"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20"
                    />
                  </div>
                </div>
              </div>
              </>)}
                      </div>

                      <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
                        <button
                          type="button"
                          onClick={() => {
                            if (addStep === 0) {
                              handleCloseAddModal();
                            } else {
                              setAddStep((s) => s - 1);
                            }
                          }}
                          disabled={saving}
                          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          {addStep === 0 ? 'Cancel' : '← Back'}
                        </button>
                        {addStep < ADD_STEPS.length - 1 ? (
                          <button
                            type="button"
                            onClick={() => setAddStep((s) => s + 1)}
                            className="px-5 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] transition-colors flex items-center gap-2"
                          >
                            Next
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <path
                                d="M5 3l4 4-4 4"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        ) : (
                          <button
                            type="submit"
                            disabled={saving}
                            className="px-5 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50 transition-colors"
                          >
                            {saving ? 'Saving...' : 'Add Employee'}
                          </button>
                        )}
                      </div>
                    </form>
                  </>
                );
              } catch {
                return (
                  <div className="p-6 text-center">
                    <p className="text-red-500 mb-4">Something went wrong loading the form.</p>
                    <button type="button" onClick={handleCloseAddModal} className="px-4 py-2 bg-gray-100 rounded-lg text-sm">
                      Close
                    </button>
                  </div>
                );
              }
            })()}
          </div>
        </div>
      )}

      {newEmpCropOpen && newEmpRawSrc && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Adjust Photo</h3>
                <p className="text-xs text-gray-400 mt-0.5">Drag to reposition · Scroll to zoom</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewEmpCropOpen(false);
                  setNewEmpRawSrc(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
              >
                ✕
              </button>
            </div>

            <div className="relative bg-gray-900" style={{ height: '300px' }}>
              <Cropper
                image={newEmpRawSrc}
                crop={newEmpCrop}
                zoom={newEmpZoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setNewEmpCrop}
                onZoomChange={setNewEmpZoom}
                onCropComplete={(_, pixels) => setNewEmpCroppedPixels(pixels)}
                style={{
                  cropAreaStyle: {
                    border: '3px solid #4ECDC4',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
                  },
                }}
              />
            </div>

            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">🔍</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={newEmpZoom}
                  onChange={(ev) => setNewEmpZoom(Number(ev.target.value))}
                  className="flex-1 accent-[#1B6B6B]"
                />
                <span className="text-xs text-gray-400">🔎</span>
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setNewEmpCropOpen(false);
                  setNewEmpRawSrc(null);
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!newEmpCroppedPixels) return;
                  try {
                    const blob = await getCroppedBlob(newEmpRawSrc, newEmpCroppedPixels);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const base64 = reader.result;
                      setNewEmpPhoto(base64);
                      setNewEmpPhotoSrc(base64);
                    };
                    reader.readAsDataURL(blob);
                    setNewEmpCropOpen(false);
                    setNewEmpRawSrc(null);
                  } catch (err) {
                    if (import.meta.env.DEV) console.error('Crop failed:', err);
                    showError('Failed to crop image');
                  }
                }}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]"
              >
                ✓ Use This Photo
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
