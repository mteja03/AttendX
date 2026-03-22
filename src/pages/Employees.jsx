import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  getCountFromServer,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { SkeletonCard } from '../components/SkeletonRow';
import { formatLakhs, toDateString, toDisplayDate, toJSDate } from '../utils';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal', 'Other'];
const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];
const JOINING_YEARS = ['All Years', 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const PAGE_SIZE = 50;
const VISIBLE_ROWS = 20;
const ROW_HEIGHT = 56;

// Add Employee form is intentionally flexible:
// Only blocking validations:
// - Emp ID cannot be empty and must not contain spaces
// - Date of birth cannot be in the future
// - Emp ID must be unique

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

/** CTC vs role salary band — guideline only, not blocking save */
function validateCTC(ctcValue, role) {
  if (!role?.salaryBand || role.salaryBand.min === '' || role.salaryBand.min == null) return null;
  const str = ctcValue != null ? String(ctcValue).trim() : '';
  if (!str) return null;
  const ctc = Number(str);
  if (Number.isNaN(ctc)) return null;
  const min = Number(role.salaryBand.min);
  const max = Number(role.salaryBand.max);
  const title = role.title || 'this role';
  if (Number.isNaN(min)) return null;
  const maxOk = !Number.isNaN(max) && role.salaryBand.max !== '' && role.salaryBand.max != null;
  const bandStr = `₹${formatLakhs(min)}–${maxOk ? formatLakhs(max) : '—'}`;

  if (ctc < min) {
    return {
      type: 'warning',
      message: `⚠️ CTC ₹${formatLakhs(ctc)} is below ${title} band (${bandStr})`,
    };
  }
  if (maxOk && ctc > max) {
    return {
      type: 'warning',
      message: `⚠️ CTC ₹${formatLakhs(ctc)} is above ${title} band (₹${formatLakhs(min)}–${formatLakhs(max)})`,
    };
  }
  return {
    type: 'success',
    message: `✓ CTC is within ${title} band (${maxOk ? `₹${formatLakhs(min)}–${formatLakhs(max)}` : `≥ ₹${formatLakhs(min)}`})`,
  };
}

const initialForm = {
  fullName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
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
  designation: '',
  designationRoleId: '',
  employmentType: 'Full-time',
  category: '',
  joiningDate: toDateString(new Date()),
  reportingManagerId: '',
  reportingManagerName: '',
  reportingManagerEmpId: '',
  ctcPerAnnum: '',
  basicSalary: '',
  hra: '',
  pfNumber: '',
  esicNumber: '',
  panNumber: '',
  aadhaarNumber: '',
  drivingLicenceNumber: '',
  emergencyContactName: '',
  emergencyRelationship: '',
  emergencyPhone: '',
  emergencyEmail: '',
  emergencyAddress: '',
};

export default function Employees() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { role: userRole } = useAuth();
  const { company } = useCompany();
  const canEditEmployees = userRole === 'admin' || userRole === 'hrmanager';
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastDocRef = useRef(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [statsCounts, setStatsCounts] = useState({ active: 0, onLeave: 0, inactive: 0 });
  const [searchAllMode, setSearchAllMode] = useState(false);
  const searchTimeoutRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDept, setFilterDept] = useState('All Departments');
  const [filterDesignation, setFilterDesignation] = useState('All Designations');
  const [filterBranch, setFilterBranch] = useState('All Branches');
  const [filterEmploymentType, setFilterEmploymentType] = useState('All Types');
  const [filterCategory, setFilterCategory] = useState('All Categories');
  const [filterJoiningYear, setFilterJoiningYear] = useState('All Years');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});
  const [formWarnings, setFormWarnings] = useState({});
  const [saving, setSaving] = useState(false);
  const [managerSearch, setManagerSearch] = useState('');
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);
  const [roles, setRoles] = useState([]);
  const [roleSearch, setRoleSearch] = useState('');
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [ctcValidation, setCtcValidation] = useState(null);
  const roleDropdownRef = useRef(null);

  useEffect(() => {
    if (!companyId) return;
    const fetchRoles = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'roles'));
        setRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Could not fetch roles:', error?.message ?? String(error));
        setRoles([]);
      }
    };
    fetchRoles();
  }, [companyId]);

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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      showError('Failed to load employees');
    }
  }, [collRef, showError]);

  const fetchTotalCount = useCallback(async () => {
    if (!collRef) return;
    try {
      const snapshot = await getCountFromServer(collRef);
      setTotalCount(snapshot.data().count);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }, [collRef]);

  const fetchStatsCounts = useCallback(async () => {
    if (!collRef) return;
    try {
      const [activeSnap, onLeaveSnap, inactiveSnap] = await Promise.all([
        getCountFromServer(query(collRef, where('status', '==', 'Active'))),
        getCountFromServer(query(collRef, where('status', '==', 'On Leave'))),
        getCountFromServer(query(collRef, where('status', '==', 'Inactive'))),
      ]);
      setStatsCounts({
        active: activeSnap.data().count,
        onLeave: onLeaveSnap.data().count,
        inactive: inactiveSnap.data().count,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Stats count failed', err);
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
        else if (tab === 'onleave') constraints.push(where('status', '==', 'On Leave'));
        else if (tab === 'inactive') constraints.push(where('status', '==', 'Inactive'));
        if (filterDept !== 'All Departments') {
          constraints.push(where('department', '==', filterDept.trim()));
        }
        if (filterBranch !== 'All Branches') {
          constraints.push(where('branch', '==', filterBranch.trim()));
        }
        constraints.push(orderBy('fullName', 'asc'));
        constraints.push(limit(PAGE_SIZE));
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
        setHasMore(snap.docs.length === PAGE_SIZE);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Fetch error:', error);
        if (error?.code === 'failed-precondition') {
          // eslint-disable-next-line no-console
          console.warn('Missing Firestore index, falling back to full load');
          await fetchAllEmployeesFallback();
        } else {
          showError('Failed to load employees');
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [companyId, collRef, tab, filterDept, filterBranch, fetchAllEmployeesFallback, showError],
  );

  const searchAllEmployees = useCallback(
    async (term) => {
      if (!term || term.length < 3 || !collRef) return;
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
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
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
    if (term.trim().length < 3) {
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
  }, [companyId, tab, filterDept, filterBranch, fetchEmployees, fetchTotalCount, fetchStatsCounts]);

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
  const employmentTypes = company?.employmentTypes?.length ? company.employmentTypes : DEFAULT_EMPLOYMENT_TYPES;
  const branches = company?.branches?.length ? company.branches : DEFAULT_BRANCHES;
  const qualifications = company?.qualifications?.length ? company.qualifications : DEFAULT_QUALIFICATIONS;
  const categories = company?.categories?.length ? company.categories : DEFAULT_CATEGORIES;

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filterDept !== 'All Departments') n++;
    if (filterDesignation !== 'All Designations') n++;
    if (filterBranch !== 'All Branches') n++;
    if (filterEmploymentType !== 'All Types') n++;
    if (filterCategory !== 'All Categories') n++;
    if (filterJoiningYear !== 'All Years') n++;
    return n;
  }, [filterDept, filterDesignation, filterBranch, filterEmploymentType, filterCategory, filterJoiningYear]);

  const activeFilters = useMemo(() => {
    const list = [];
    if (filterDept !== 'All Departments') list.push({ key: 'department', label: 'Department', value: filterDept });
    if (filterBranch !== 'All Branches') list.push({ key: 'branch', label: 'Branch', value: filterBranch });
    if (filterDesignation !== 'All Designations') list.push({ key: 'designation', label: 'Designation', value: filterDesignation });
    if (filterEmploymentType !== 'All Types') list.push({ key: 'employmentType', label: 'Type', value: filterEmploymentType });
    if (filterCategory !== 'All Categories') list.push({ key: 'category', label: 'Category', value: filterCategory });
    if (filterJoiningYear !== 'All Years') list.push({ key: 'joiningYear', label: 'Year', value: filterJoiningYear });
    return list;
  }, [filterDept, filterBranch, filterDesignation, filterEmploymentType, filterCategory, filterJoiningYear]);

  const clearFilter = (key) => {
    if (key === 'department') setFilterDept('All Departments');
    if (key === 'branch') setFilterBranch('All Branches');
    if (key === 'designation') setFilterDesignation('All Designations');
    if (key === 'employmentType') setFilterEmploymentType('All Types');
    if (key === 'category') setFilterCategory('All Categories');
    if (key === 'joiningYear') setFilterJoiningYear('All Years');
  };

  const clearFilters = () => {
    setFilterDept('All Departments');
    setFilterDesignation('All Designations');
    setFilterBranch('All Branches');
    setFilterEmploymentType('All Types');
    setFilterCategory('All Categories');
    setFilterJoiningYear('All Years');
  };

  const filtered = useMemo(() => {
    let list = employees;
    if (searchAllMode) {
      if (tab === 'active') list = list.filter((e) => (e.status || 'Active') === 'Active');
      if (tab === 'onleave') list = list.filter((e) => (e.status || '') === 'On Leave');
      if (tab === 'inactive') list = list.filter((e) => (e.status || '') === 'Inactive');
    }
    const term = search.trim().toLowerCase();
    if (term && (!searchAllMode || term.length < 3)) {
      list = list.filter(
        (e) =>
          e.fullName?.toLowerCase().includes(term) ||
          e.email?.toLowerCase().includes(term) ||
          (e.empId || '').toLowerCase().includes(term) ||
          (e.department || '').toLowerCase().includes(term) ||
          (e.phone && String(e.phone).includes(search.trim())),
      );
    }
    if (filterDept !== 'All Departments') list = list.filter((e) => (e.department || '').trim() === filterDept);
    if (filterDesignation !== 'All Designations') list = list.filter((e) => (e.designation || '').trim() === filterDesignation);
    if (filterBranch !== 'All Branches') list = list.filter((e) => (e.branch || '').trim() === filterBranch);
    if (filterEmploymentType !== 'All Types') list = list.filter((e) => (e.employmentType || '').trim() === filterEmploymentType);
    if (filterCategory !== 'All Categories') list = list.filter((e) => (e.category || '').trim() === filterCategory);
    if (filterJoiningYear !== 'All Years') {
      const year = Number(filterJoiningYear);
      list = list.filter((e) => {
        const d = toJSDate(e.joiningDate);
        if (!d || Number.isNaN(d.getTime())) return false;
        return d.getFullYear() === year;
      });
    }
    return list;
  }, [
    employees,
    searchAllMode,
    tab,
    search,
    filterDept,
    filterDesignation,
    filterBranch,
    filterEmploymentType,
    filterCategory,
    filterJoiningYear,
  ]);

  const useVirtualList = filtered.length > 30;
  const visibleWindow = useMemo(() => {
    const startIndex = Math.floor(scrollTop / ROW_HEIGHT);
    const endIndex = Math.min(startIndex + VISIBLE_ROWS, filtered.length);
    return {
      items: filtered.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      bottomSpacer: Math.max(0, filtered.length - endIndex) * ROW_HEIGHT,
      topSpacer: startIndex * ROW_HEIGHT,
    };
  }, [filtered, scrollTop]);

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setForm(initialForm);
    setFormErrors({});
    setFormWarnings({});
    setSelectedRole(null);
    setRoleSearch('');
    setShowRoleDropdown(false);
    setManagerSearch('');
    setShowManagerDropdown(false);
    setCtcValidation(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: null }));
    if (formWarnings[name]) setFormWarnings((prev) => ({ ...prev, [name]: null }));
  };

  useEffect(() => {
    setCtcValidation(validateCTC(form.ctcPerAnnum, selectedRole));
  }, [selectedRole, form.ctcPerAnnum]);

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
      const payload = {
        fullName: form.fullName?.trim() || null,
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        dateOfBirth: form.dateOfBirth ? Timestamp.fromDate(new Date(form.dateOfBirth)) : null,
        gender: form.gender || null,
        fatherName: form.fatherName?.trim() || null,
        streetAddress: form.streetAddress?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state || null,
        pincode: form.pincode?.trim() || null,
        country: form.country?.trim() || 'India',
        empId: (form.empId || '').trim(),
        department: form.department || null,
        branch: form.branch || null,
        designation: form.designation || null,
        designationRoleId: form.designationRoleId || null,
        employmentType: form.employmentType || 'Full-time',
        category: form.category || null,
        qualification: form.qualification || null,
        joiningDate: form.joiningDate ? Timestamp.fromDate(new Date(form.joiningDate)) : null,
        reportingManagerId: form.reportingManagerId || null,
        reportingManagerName: form.reportingManagerName || null,
        reportingManagerEmpId: form.reportingManagerEmpId || null,
        ctcPerAnnum: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        basicSalary: form.basicSalary ? Number(form.basicSalary) : null,
        hra: form.hra ? Number(form.hra) : null,
        pfNumber: form.pfNumber || null,
        esicNumber: form.esicNumber || null,
        panNumber: form.panNumber?.trim() || null,
        aadhaarNumber: form.aadhaarNumber?.trim() || null,
        drivingLicenceNumber: form.drivingLicenceNumber?.trim() || null,
        emergencyContact: {
          name: form.emergencyContactName?.trim() || '',
          relationship: form.emergencyRelationship || '',
          phone: form.emergencyPhone?.trim() || '',
          email: form.emergencyEmail?.trim() || '',
          address: form.emergencyAddress?.trim() || '',
        },
        status: 'Active',
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'companies', companyId, 'employees'), payload);
      await updateDoc(doc(db, 'companies', companyId), { employeeCount: increment(1) });
      setEmployees((prev) => [{ id: ref.id, ...payload, createdAt: new Date() }, ...prev]);
      setTotalCount((c) => c + 1);
      fetchStatsCounts();
      handleCloseAddModal();
      success('Employee added');
    } catch (err) {
      showError('Failed to add employee');
    }
    setSaving(false);
  };

  const handleDeactivate = async (emp) => {
    try {
      await updateDoc(doc(db, 'companies', companyId, 'employees', emp.id), { status: 'Inactive' });
      setEmployees((prev) => prev.map((e) => (e.id === emp.id ? { ...e, status: 'Inactive' } : e)));
      fetchStatsCounts();
      success('Employee deactivated');
    } catch (err) {
      showError('Failed to deactivate');
    }
  };

  const companyName = (company?.name || 'Company').replace(/\s+/g, '');

  const downloadRows = (emps) =>
    emps.map((emp) => ({
      'Emp ID': emp.empId || '',
      'Full Name': emp.fullName || '',
      Email: emp.email || '',
      Phone: emp.phone || '',
      Department: emp.department || '',
      Designation: emp.designation || '',
      Branch: emp.branch || '',
      'Employment Type': emp.employmentType || '',
      Category: emp.category || '',
      'Joining Date': toDisplayDate(emp.joiningDate),
      CTC: emp.ctcPerAnnum ?? emp.ctc ?? '',
      'Basic Salary': emp.basicSalary ?? '',
      'PF Number': emp.pfNumber || '',
      'ESIC Number': emp.esicNumber || '',
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
    <div className="p-4 sm:p-8">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Employees</h1>
          <p className="text-sm text-gray-500 mt-1">Manage employee records and directory</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
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
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center mb-4">
        <div className="flex flex-wrap gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 sm:mx-0 sm:px-0 pb-1 sm:pb-0">
          {['all', 'active', 'onleave', 'inactive'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg min-h-[44px] px-3 py-2 text-sm font-medium flex-shrink-0 active:opacity-90 ${
                tab === t ? 'bg-[#1B6B6B] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
              }`}
            >
              {t === 'all' ? 'All' : t === 'active' ? 'Active' : t === 'onleave' ? 'On Leave' : 'Inactive'}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search (3+ chars searches all employees)..."
          className="w-full sm:ml-auto sm:w-72 min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
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
            onClick={() => setFilterOpen((o) => !o)}
            className="inline-flex items-center gap-2 min-h-[44px] rounded-lg px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-500">
              <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-[#1B6B6B] text-white px-2 py-0.5 text-[10px] font-semibold">
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

        {filterOpen && (
          <div className="overflow-x-auto scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0 mb-2">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 min-w-0 lg:min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-w-[min(100%,520px)] sm:min-w-0">
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Department</label>
                <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option>All Departments</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Role / Designation</label>
                <select value={filterDesignation} onChange={(e) => setFilterDesignation(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option>All Designations</option>
                  {designationFilterOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Branch</label>
                <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option>All Branches</option>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Employment Type</label>
                <select value={filterEmploymentType} onChange={(e) => setFilterEmploymentType(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option>All Types</option>
                  {employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Category</label>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option>All Categories</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Joining Year</label>
                <select value={filterJoiningYear} onChange={(e) => setFilterJoiningYear(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  {JOINING_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : null}

      {!loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-slate-800">{statsCounts.active}</p>
              <p className="text-xs text-slate-500">Active</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-amber-600">{statsCounts.onLeave}</p>
              <p className="text-xs text-slate-500">On Leave</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-slate-400">{statsCounts.inactive}</p>
              <p className="text-xs text-slate-500">Inactive</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-[#1B6B6B]">{departments.length}</p>
              <p className="text-xs text-slate-500">Dept types</p>
            </div>
          </div>

          <div
            className="hidden lg:block overflow-x-auto overflow-y-auto max-h-[70vh] border border-slate-200 rounded-xl bg-white"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Emp ID</th>
                <th className="px-4 py-3 text-left font-medium">Name + Email</th>
                <th className="px-4 py-3 text-left font-medium">Department</th>
                <th className="px-4 py-3 text-left font-medium">Designation</th>
                <th className="px-4 py-3 text-left font-medium">Phone</th>
                <th className="px-4 py-3 text-left font-medium">Joining Date</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {useVirtualList ? (
                <>
                  {visibleWindow.topSpacer > 0 && (
                    <tr aria-hidden className="pointer-events-none">
                      <td colSpan={8} style={{ height: visibleWindow.topSpacer, padding: 0, border: 'none' }} />
                    </tr>
                  )}
                  {visibleWindow.items.map((emp) => (
                    <tr
                      key={emp.id}
                      className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 transition-all"
                      style={{ height: ROW_HEIGHT, borderLeft: `3px solid ${getDeptColor(emp.department)}` }}
                      onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-slate-700">{emp.empId || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                            style={{ background: getDeptColor(emp.department) }}
                          >
                            {emp.fullName?.charAt(0) || '—'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800">{emp.fullName || '—'}</p>
                            <p className="text-xs text-slate-500">{emp.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{emp.department || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{emp.designation || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{emp.phone || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{toDisplayDate(emp.joiningDate)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            emp.status === 'Active'
                              ? 'bg-green-100 text-green-800'
                              : emp.status === 'On Leave'
                                ? 'bg-[#C5E8E8] text-[#0F4444]'
                                : emp.status === 'Offboarding'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {emp.status || 'Active'}
                        </span>
                        {emp.offboarding?.status === 'in_progress' && (
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-16 bg-gray-100 rounded-full h-1">
                              <div
                                className="bg-amber-500 h-1 rounded-full"
                                style={{ width: `${emp.offboarding?.completionPct || 0}%` }}
                              />
                            </div>
                            <span className="text-xs text-amber-600">Offboarding</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 space-x-2" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)} className="text-[#1B6B6B] text-xs font-medium hover:underline">
                          {canEditEmployees ? 'View Profile' : 'View'}
                        </button>
                        {canEditEmployees && (emp.status || 'Active') === 'Active' && (
                          <button
                            type="button"
                            onClick={() => handleDeactivate(emp)}
                            className="text-amber-600 text-xs font-medium hover:underline"
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visibleWindow.bottomSpacer > 0 && (
                    <tr aria-hidden className="pointer-events-none">
                      <td colSpan={8} style={{ height: visibleWindow.bottomSpacer, padding: 0, border: 'none' }} />
                    </tr>
                  )}
                </>
              ) : (
                filtered.map((emp) => (
                  <tr
                    key={emp.id}
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 transition-all"
                    onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                    style={{ borderLeft: `3px solid ${getDeptColor(emp.department)}` }}
                  >
                    <td className="px-4 py-3 font-mono text-slate-700">{emp.empId || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                          style={{ background: getDeptColor(emp.department) }}
                        >
                          {emp.fullName?.charAt(0) || '—'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{emp.fullName || '—'}</p>
                          <p className="text-xs text-slate-500">{emp.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{emp.department || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{emp.designation || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{emp.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{toDisplayDate(emp.joiningDate)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          emp.status === 'Active'
                            ? 'bg-green-100 text-green-800'
                            : emp.status === 'On Leave'
                              ? 'bg-[#C5E8E8] text-[#0F4444]'
                              : emp.status === 'Offboarding'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {emp.status || 'Active'}
                      </span>
                      {emp.offboarding?.status === 'in_progress' && (
                        <div className="flex items-center gap-1 mt-1">
                          <div className="w-16 bg-gray-100 rounded-full h-1">
                            <div
                              className="bg-amber-500 h-1 rounded-full"
                              style={{ width: `${emp.offboarding?.completionPct || 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-amber-600">Offboarding</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)} className="text-[#1B6B6B] text-xs font-medium hover:underline">
                        {canEditEmployees ? 'View Profile' : 'View'}
                      </button>
                      {canEditEmployees && (emp.status || 'Active') === 'Active' && (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(emp)}
                          className="text-amber-600 text-xs font-medium hover:underline"
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                    No employees found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

          <div className="lg:hidden space-y-3">
            {filtered.map((emp) => (
              <div
                key={emp.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate(`/company/${companyId}/employees/${emp.id}`);
                }}
                className="bg-white border border-gray-100 rounded-2xl p-4 cursor-pointer hover:border-gray-200 active:bg-gray-50"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                    style={{ background: getDeptColor(emp.department) }}
                  >
                    {emp.fullName?.charAt(0) || '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{emp.fullName || '—'}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {emp.empId || '—'} · {emp.department || '—'}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${
                      emp.status === 'Active'
                        ? 'bg-green-100 text-green-700'
                        : emp.status === 'On Leave'
                          ? 'bg-[#C5E8E8] text-[#0F4444]'
                          : emp.status === 'Offboarding'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {emp.status || 'Active'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div>
                    <span className="text-gray-400">Role</span>
                    <p className="text-gray-700 font-medium truncate">{emp.designation || '—'}</p>
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
                </div>

                <div className="flex flex-wrap gap-2 mt-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                    className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-[#1B6B6B] border border-gray-200 hover:bg-gray-50 active:bg-gray-100"
                  >
                    {canEditEmployees ? 'View Profile' : 'View'}
                  </button>
                  {canEditEmployees && (emp.status || 'Active') === 'Active' && (
                    <button
                      type="button"
                      onClick={() => handleDeactivate(emp)}
                      className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-amber-700 border border-amber-200 hover:bg-amber-50 active:bg-amber-100"
                    >
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-slate-500 py-8 text-sm">No employees found.</p>
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
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] min-h-0 flex flex-col overflow-hidden sm:my-8">
            {(() => {
              try {
                return (
                  <>
                    <div className="flex justify-center pt-2 pb-1 sm:hidden flex-shrink-0">
                      <div className="w-10 h-1 bg-gray-200 rounded-full" />
                    </div>
                    <div className="flex items-center justify-between px-6 py-4 sm:px-6 sm:py-5 border-b border-gray-100 flex-shrink-0">
                      <h2 className="text-lg font-semibold text-slate-800">Add Employee</h2>
                      <button
                        type="button"
                        onClick={handleCloseAddModal}
                        className="text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] rounded-lg flex items-center justify-center text-xl leading-none"
                        aria-label="Close"
                      >
                        ✕
                      </button>
                    </div>
                    <form onSubmit={handleAddEmployee} className="flex flex-col flex-1 min-h-0">
                      <div className="flex-1 overflow-y-auto p-6 min-h-0">
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-base">👤</span>
                  Personal Info
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                    <input name="fullName" value={form.fullName} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]" />
                    {formErrors.fullName && <p className="text-red-500 text-xs mt-1">{formErrors.fullName}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Father&apos;s Name</label>
                    <input
                      name="fatherName"
                      value={form.fatherName}
                      onChange={handleFormChange}
                      placeholder="Father's full name"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                    <input type="email" name="email" value={form.email} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]" />
                    {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                    <input name="phone" value={form.phone} onChange={handleFormChange} placeholder="10-digit mobile number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                    <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]" />
                    {formErrors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{formErrors.dateOfBirth}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Gender</label>
                    <select name="gender" value={form.gender} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]">
                      <option value="">—</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                    <input
                      name="city"
                      value={form.city}
                      onChange={handleFormChange}
                      placeholder="City"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                    <select
                      name="state"
                      value={form.state}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    />
                  </div>
                </div>
              </div>

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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    />
                    {formErrors.emergencyContactName && <p className="text-red-500 text-xs mt-1">{formErrors.emergencyContactName}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Relationship</label>
                    <select
                      name="emergencyRelationship"
                      value={form.emergencyRelationship}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    />
                    {formErrors.emergencyPhone && <p className="text-red-500 text-xs mt-1">{formErrors.emergencyPhone}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Contact Email</label>
                    <input
                      name="emergencyEmail"
                      value={form.emergencyEmail}
                      onChange={handleFormChange}
                      placeholder="Email address"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Contact Address</label>
                    <input
                      name="emergencyAddress"
                      value={form.emergencyAddress}
                      onChange={handleFormChange}
                      placeholder="Contact's address"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4] font-mono"
                    />
                    {formErrors.empId && <p className="text-xs text-red-500 mt-1">{formErrors.empId}</p>}
                    {!formErrors.empId && formWarnings.empId && <p className="text-xs text-amber-600 mt-1">{formWarnings.empId}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                    <select name="department" value={form.department} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]">
                      <option value="">—</option>
                      {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                      {!departments.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div className="sm:col-span-2 relative" ref={roleDropdownRef}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Role / Designation</label>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setShowRoleDropdown(true)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') setShowRoleDropdown(true);
                      }}
                      className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px]"
                    >
                      {selectedRole ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="min-w-0 text-left">
                            <p className="text-sm font-medium text-gray-900">{selectedRole.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {selectedRole.reportsTo
                                ? `Reports to ${selectedRole.reportsTo}`
                                : 'Top level role'}
                              {selectedRole.salaryBand?.min != null &&
                                selectedRole.salaryBand?.min !== '' &&
                                ` · ₹${formatLakhs(selectedRole.salaryBand.min)}–${formatLakhs(selectedRole.salaryBand.max)}`}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Select role/designation…</span>
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
                    {selectedRole?.salaryBand?.min != null && selectedRole?.salaryBand?.min !== '' && (
                      <div className="mt-1.5 text-xs text-[#1B6B6B] bg-[#E8F5F5] px-3 py-1.5 rounded-lg">
                        💰 {selectedRole.title} salary band: ₹{formatLakhs(selectedRole.salaryBand.min)} – ₹
                        {formatLakhs(selectedRole.salaryBand.max)} per annum
                      </div>
                    )}
                    {showRoleDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-[60] max-h-64 overflow-hidden">
                        <div className="p-2 border-b border-slate-100 sticky top-0 bg-white">
                          <input
                            autoFocus
                            placeholder="Search by role or reports-to…"
                            value={roleSearch}
                            onChange={(e) => setRoleSearch(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="overflow-y-auto max-h-52">
                          {roles.length === 0 && (
                            <div className="px-3 py-4 text-center">
                              <p className="text-sm text-slate-400 mb-2">No roles defined yet</p>
                              <p className="text-xs text-slate-400">Add roles in Library → Roles &amp; Responsibilities</p>
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
                                      {role.reportsTo ? `Reports to ${role.reportsTo}` : 'Top level role'}
                                      {role.salaryBand?.min != null &&
                                        role.salaryBand?.min !== '' &&
                                        ` · ₹${formatLakhs(role.salaryBand.min)}–${formatLakhs(role.salaryBand.max)}`}
                                    </p>
                                  </div>
                                  {selectedRole?.id === role.id && (
                                    <span className="text-[#1B6B6B] flex-shrink-0">✓</span>
                                  )}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
                    <select name="branch" value={form.branch} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]">
                      <option value="">—</option>
                      {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                      {!branches.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Employment Type</label>
                    <select name="employmentType" value={form.employmentType} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]">
                      {employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      {!employmentTypes.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                    <select name="category" value={form.category} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]">
                      <option value="">—</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      {!categories.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Qualification</label>
                    <select name="qualification" value={form.qualification} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]">
                      <option value="">—</option>
                      {qualifications.map((q) => <option key={q} value={q}>{q}</option>)}
                      {!qualifications.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Joining Date</label>
                    <input type="date" name="joiningDate" value={form.joiningDate} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]" />
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
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:border-[#4ECDC4]"
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

                            {employees
                              .filter((emp) => {
                                if (form.empId && emp.empId === form.empId) return false;
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

                            {employees.filter((emp) => {
                              if (form.empId && emp.empId === form.empId) return false;
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">CTC per annum</label>
                    <input
                      type="number"
                      min="0"
                      name="ctcPerAnnum"
                      value={form.ctcPerAnnum}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    />
                    {ctcValidation && (
                      <div
                        className={`flex items-center gap-2 mt-1.5 px-3 py-1.5 rounded-lg text-xs ${
                          ctcValidation.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {ctcValidation.message}
                      </div>
                    )}
                    {selectedRole?.salaryBand?.min != null && selectedRole?.salaryBand?.min !== '' && (
                      <p className="text-xs text-gray-400 mt-1.5">This is a guideline, not a restriction.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Basic Salary / month</label>
                    <input type="number" min="0" name="basicSalary" value={form.basicSalary} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">HRA / month</label>
                    <input type="number" min="0" name="hra" value={form.hra} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]" />
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4] uppercase"
                      maxLength={20}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">PF Number</label>
                    <input name="pfNumber" value={form.pfNumber} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">ESIC Number</label>
                    <input name="esicNumber" value={form.esicNumber} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Aadhaar Number</label>
                    <input
                      name="aadhaarNumber"
                      value={form.aadhaarNumber}
                      onChange={handleFormChange}
                      placeholder="12-digit number"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                    />
                  </div>
                </div>
              </div>
                      </div>

                      <div className="p-6 border-t border-gray-100 flex-shrink-0 flex gap-3 justify-end">
                        <button
                          type="button"
                          onClick={handleCloseAddModal}
                          className="rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 px-4 py-2 min-h-[44px]"
                          disabled={saving}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 min-h-[44px] disabled:opacity-50"
                          disabled={saving}
                        >
                          {saving ? 'Saving...' : 'Add Employee'}
                        </button>
                      </div>
                    </form>
                  </>
                );
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error('Add employee modal:', err);
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
    </div>
  );
}
