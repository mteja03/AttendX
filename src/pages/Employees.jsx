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
  getCountFromServer,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { SkeletonCard, SkeletonTable } from '../components/SkeletonRow';
import EmployeeAvatar from '../components/EmployeeAvatar';
import EmptyState from '../components/EmptyState';
import ErrorModal from '../components/ErrorModal';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/employees/StatusBadge';
import EmployeeStatusSubline from '../components/employees/EmployeeStatusSubline';
import FilterPanel from '../components/employees/FilterPanel';
import AddEmployeeModal from '../components/employees/AddEmployeeModal';
import PhotoCropModal from '../components/employees/PhotoCropModal';
import Pagination from '../components/employees/Pagination';
import LocationView from '../components/employees/LocationView';
import { toDisplayDate } from '../utils';
import { updateCompanyCounts } from '../utils/updateCompanyCounts';
import { withRetry } from '../utils/firestoreWithRetry';
import { ERROR_MESSAGES, getErrorMessage, logError } from '../utils/errorHandler';
import { trackEmployeeAdded, trackPageView } from '../utils/analytics';
import {
  getCacheKey,
  getEmployeeCache,
  setEmployeeCache,
  clearEmployeeCache,
} from '../utils/employeeCache';
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_EMPLOYMENT_TYPES,
  DEFAULT_QUALIFICATIONS,
  DEFAULT_CATEGORIES,
  EMPTY_EMPLOYEE_FILTERS,
  FILTER_LABELS,
  FETCH_PAGE_SIZE,
  TABLE_PAGE_SIZE,
  STATUS_BORDER_COLOR,
  initialForm,
  countStatsFromEmployees,
  getRowTintClass,
  getCardTopBorderClass,
  getDeptColor,
  sanitizeCustomBenefitsForSave,
  customBenefitsExportText,
  getEmployeeJoinYear,
  noticePeriodDaysRemaining,
} from '../utils/employeeListHelpers.jsx';
export default function Employees() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { currentUser, role: userRole, signOut } = useAuth();
  const { company } = useCompany();
  const canEditEmployees = userRole === 'admin' || userRole === 'companyadmin' || userRole === 'hrmanager';
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const [viewMode, setViewMode] = useState('list');

  const collRef = useMemo(
    () => (companyId ? collection(db, 'companies', companyId, 'employees') : null),
    [companyId],
  );

  const fetchAllEmployeesFallback = useCallback(async () => {
    if (!collRef) return;
    try {
      const snap = await getDocs(collRef);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEmployees(list);
      setHasMore(false);
      lastDocRef.current = null;
      setTotalCount(snap.size);
      setStatsCounts(countStatsFromEmployees(list));
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
          // Check cache first
          const cacheKey = getCacheKey(companyId, tab, {
            department: filters.department,
            branch: filters.branch,
            location: filters.location,
          });
          const cached = getEmployeeCache(cacheKey);
          if (cached) {
            // Restore from cache — no Firestore read needed
            setEmployees(cached.employees);
            setTotalCount(cached.totalCount);
            setStatsCounts(cached.statsCounts);
            setHasMore(cached.hasMore);
            lastDocRef.current = null;
            setLoading(false);
            return;
          }
          setLoading(true);
          setEmployees([]);
          lastDocRef.current = null;
          setSearchAllMode(false);
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
        constraints.push(limit(500));

        const q = query(collRef, ...constraints);
        const snap = await getDocs(q);
        const newEmployees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const last = snap.docs[snap.docs.length - 1] || null;
        lastDocRef.current = last;

        if (reset) {
          setEmployees(newEmployees);
          // Write to cache after successful first-page fetch
          const cacheKey = getCacheKey(companyId, tab, {
            department: filters.department,
            branch: filters.branch,
            location: filters.location,
          });
          setEmployeeCache(cacheKey, {
            employees: newEmployees,
            totalCount: newEmployees.length,
            statsCounts: countStatsFromEmployees(newEmployees),
            hasMore: snap.docs.length === FETCH_PAGE_SIZE,
          });
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
      }
    },
    [companyId, collRef, tab, filters.department, filters.branch, filters.location, fetchAllEmployeesFallback, showError],
  );

  const searchAllEmployees = useCallback(
    async (term) => {
      if (!term || term.length < 2 || !collRef) return;
      setLoading(true);
      try {
        const snap = await getDocs(query(collRef, orderBy('fullName', 'asc'), limit(500)));
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
  const structuredLocations = useMemo(() => {
    const raw = company?.locations || [];
    if (raw.length > 0 && typeof raw[0] === 'object' && raw[0].branches) return raw;
    // Old format — flat strings. Create simple structure.
    return raw.map((l, i) => ({
      id: `loc_${i}`,
      name: typeof l === 'string' ? l : (l.name || String(l)),
      branches: [],
    }));
  }, [company?.locations]);
  const allBranchNames = useMemo(() => structuredLocations.flatMap((l) => (l.branches || []).map((b) => b.name)), [structuredLocations]);
  const branches = allBranchNames.length > 0 ? allBranchNames : (company?.branches || []).map((b) => typeof b === 'object' ? b.name : b);
  const qualifications = company?.qualifications?.length ? company.qualifications : DEFAULT_QUALIFICATIONS;
  const categories = company?.categories?.length ? company.categories : DEFAULT_CATEGORIES;
  const locationFilterOptions = useMemo(() => structuredLocations.map((l) => l.name), [structuredLocations]);

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

  const canDeriveFullCompanyList = useMemo(
    () =>
      !searchAllMode &&
      tab === 'all' &&
      !filters.department &&
      !filters.branch &&
      !filters.location &&
      !hasMore,
    [searchAllMode, tab, filters.department, filters.branch, filters.location, hasMore],
  );

  const displayTotal = useMemo(() => {
    if (totalCount > 0) return totalCount;
    if (canDeriveFullCompanyList && employees.length > 0) return employees.length;
    return totalCount;
  }, [totalCount, canDeriveFullCompanyList, employees.length]);

  const displayStats = useMemo(() => {
    if (totalCount > 0) return statsCounts;
    if (canDeriveFullCompanyList && employees.length > 0) {
      return countStatsFromEmployees(employees);
    }
    return statsCounts;
  }, [totalCount, statsCounts, canDeriveFullCompanyList, employees]);

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
        showError(`Emp ID "${form.empId}" is already taken — please use a different ID.`);
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
      clearEmployeeCache(companyId);
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

  const downloadCSV = async () => {
    const [xlsxMod, { saveAs }] = await Promise.all([
      import('xlsx'),
      import('file-saver'),
    ]);
    const XLSX = xlsxMod.default || xlsxMod;
    if (!XLSX?.utils) {
      showError('Excel library failed to load. Please refresh and try again.');
      return;
    }
    const rows = downloadRows(filtered);
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
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
    saveAs(blob, `${companyName}_Employees_${today}.csv`);
    setShowDownload(false);
  };

  const downloadExcel = async () => {
    const xlsxMod = await import('xlsx');
    const XLSX = xlsxMod.default || xlsxMod;
    if (!XLSX?.utils) {
      showError('Excel library failed to load. Please refresh and try again.');
      return;
    }
    const rows = downloadRows(filtered);
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
          subtitle={`${displayTotal} total · ${displayStats.active || 0} active`}
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
        <div className="inline-flex rounded-xl border border-gray-200 overflow-hidden flex-shrink-0">
          <button type="button" onClick={() => setViewMode('list')}
            className={`px-3 py-2 text-xs font-medium transition-colors min-h-[44px] ${viewMode === 'list' ? 'bg-[#1B6B6B] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            List
          </button>
          <button type="button" onClick={() => setViewMode('location')}
            className={`px-3 py-2 text-xs font-medium transition-colors border-l border-gray-200 min-h-[44px] ${viewMode === 'location' ? 'bg-[#1B6B6B] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
            Location
          </button>
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
        Showing {filtered.length} of {displayTotal} employees
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
          <FilterPanel
            filters={filters}
            setFilters={setFilters}
            departments={departments}
            branches={branches}
            locationFilterOptions={locationFilterOptions}
            employmentTypes={employmentTypes}
            categories={categories}
            designationFilterOptions={designationFilterOptions}
            reportingManagerFilterOptions={reportingManagerFilterOptions}
            joinYearSelectOptions={joinYearSelectOptions}
            activeFilterCount={activeFilterCount}
          />
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
              <p className="text-xl font-semibold text-slate-800">{displayTotal}</p>
              <p className="text-xs text-slate-500">All</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-green-700">{displayStats.active}</p>
              <p className="text-xs text-slate-500">Active</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-amber-600">{displayStats.noticePeriod}</p>
              <p className="text-xs text-slate-500">Notice Period</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-blue-700">{displayStats.onLeave}</p>
              <p className="text-xs text-slate-500">On Leave</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-orange-600">{displayStats.offboarding}</p>
              <p className="text-xs text-slate-500">Offboarding</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-slate-400">{displayStats.inactive}</p>
              <p className="text-xs text-slate-500">Inactive</p>
            </div>
          </div>

          {viewMode === 'list' ? (
          <>
          <div className="hidden lg:block overflow-y-auto max-h-[70vh] border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 text-left font-medium">Emp ID</th>
                <th className="px-3 py-3 text-left font-medium">Name + Email</th>
                <th className="px-3 py-3 text-left font-medium">Phone</th>
                <th className="px-3 py-3 text-left font-medium">Designation</th>
                <th className="px-3 py-3 text-left font-medium">Department</th>
                <th className="px-3 py-3 text-left font-medium">Location</th>
                <th className="px-3 py-3 text-left font-medium">Branch</th>
                <th className="px-3 py-3 text-left font-medium">Status</th>
                <th className="px-3 py-3 text-left font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEmployees.map((emp) => (
                  <tr
                    key={emp.id}
                    className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 transition-all ${getRowTintClass(emp.status)}`}
                    onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                    onMouseEnter={() => {
                      // Prime the EmployeeProfile JS chunk on hover
                      import('../pages/EmployeeProfile').catch(() => {});
                    }}
                    style={{
                      borderLeft: `3px solid ${STATUS_BORDER_COLOR[emp.status] || getDeptColor(emp.department)}`,
                    }}
                  >
                    <td className="px-3 py-3 font-mono text-slate-700 text-xs">{emp.empId || '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <EmployeeAvatar employee={emp} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName || '—'}</p>
                          <p className="text-xs text-slate-500 truncate">{emp.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700 text-xs">{emp.phone || '—'}</td>
                    <td className="px-3 py-3 text-slate-700 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{emp.designation || '—'}</span>
                        <EmployeeStatusSubline emp={emp} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-700 text-xs">{emp.department || '—'}</td>
                    <td className="px-3 py-3 text-slate-700 text-xs">{emp.location || '—'}</td>
                    <td className="px-3 py-3 text-slate-700 text-xs">{emp.branch || '—'}</td>
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
                    <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)} className="text-[#1B6B6B] text-xs font-medium hover:underline">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-0">
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
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            filteredLength={filtered.length}
            setCurrentPage={setCurrentPage}
            variant="table"
          />
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-500">
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
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              filteredLength={filtered.length}
              setCurrentPage={setCurrentPage}
              variant="cards"
            />
          </div>

          </>
          ) : (
            <LocationView filtered={filtered} companyId={companyId} />
          )}
        </>
      )}


      {showAddModal && (
        <AddEmployeeModal
          addStep={addStep}
          setAddStep={setAddStep}
          form={form}
          setForm={setForm}
          formErrors={formErrors}
          formWarnings={formWarnings}
          saving={saving}
          handleAddEmployee={handleAddEmployee}
          handleCloseAddModal={handleCloseAddModal}
          handleFormChange={handleFormChange}
          handleEmpIdBlur={handleEmpIdBlur}
          nextEmpId={nextEmpId}
          departments={departments}
          branches={branches}
          categories={categories}
          qualifications={qualifications}
          employmentTypes={employmentTypes}
          structuredLocations={structuredLocations}
          locationFilterOptions={locationFilterOptions}
          reportingManagerOptions={reportingManagerOptions}
          roles={roles}
          selectedRole={selectedRole}
          setSelectedRole={setSelectedRole}
          roleSearch={roleSearch}
          setRoleSearch={setRoleSearch}
          showRoleDropdown={showRoleDropdown}
          setShowRoleDropdown={setShowRoleDropdown}
          roleDropdownRef={roleDropdownRef}
          locationSearch={locationSearch}
          setLocationSearch={setLocationSearch}
          showLocationDropdown={showLocationDropdown}
          setShowLocationDropdown={setShowLocationDropdown}
          locationDropdownRef={locationDropdownRef}
          managerSearch={managerSearch}
          setManagerSearch={setManagerSearch}
          showManagerDropdown={showManagerDropdown}
          setShowManagerDropdown={setShowManagerDropdown}
          roleSalaryBand={roleSalaryBand}
          benefitTemplates={benefitTemplates}
          newEmpPhotoSrc={newEmpPhotoSrc}
          setNewEmpPhoto={setNewEmpPhoto}
          setNewEmpPhotoSrc={setNewEmpPhotoSrc}
          setNewEmpRawSrc={setNewEmpRawSrc}
          setNewEmpCrop={setNewEmpCrop}
          setNewEmpZoom={setNewEmpZoom}
          setNewEmpCroppedPixels={setNewEmpCroppedPixels}
          setNewEmpCropOpen={setNewEmpCropOpen}
          showError={showError}
        />
      )}

      {newEmpCropOpen && newEmpRawSrc && (
        <PhotoCropModal
          newEmpRawSrc={newEmpRawSrc}
          newEmpCrop={newEmpCrop}
          setNewEmpCrop={setNewEmpCrop}
          newEmpZoom={newEmpZoom}
          setNewEmpZoom={setNewEmpZoom}
          newEmpCroppedPixels={newEmpCroppedPixels}
          setNewEmpCroppedPixels={setNewEmpCroppedPixels}
          setNewEmpPhoto={setNewEmpPhoto}
          setNewEmpPhotoSrc={setNewEmpPhotoSrc}
          setNewEmpCropOpen={setNewEmpCropOpen}
          setNewEmpRawSrc={setNewEmpRawSrc}
          showError={showError}
        />
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
