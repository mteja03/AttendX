import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';
import { toDateString, toDisplayDate, toJSDate } from '../utils';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal', 'Other'];
const DEFAULT_DESIGNATIONS = ['Director', 'General Manager', 'Manager', 'Assistant Manager', 'Team Lead', 'Senior Executive', 'Executive', 'Junior Executive', 'Intern', 'Other'];
const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];
const JOINING_YEARS = ['All Years', 2020, 2021, 2022, 2023, 2024, 2025, 2026];

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
  const [employees, setEmployees] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [empSnap, companySnap] = await Promise.all([
          getDocs(query(collection(db, 'companies', companyId, 'employees'), orderBy('createdAt', 'desc'))),
          getDoc(doc(db, 'companies', companyId)),
        ]);
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        if (companySnap.exists()) setCompany({ id: companySnap.id, ...companySnap.data() });
      } catch (err) {
        showError('Failed to load employees');
      }
      setLoading(false);
    };
    load();
  }, [companyId, showError]);

  const departments = company?.departments?.length ? company.departments : DEFAULT_DEPARTMENTS;
  const designations = company?.designations?.length ? company.designations : DEFAULT_DESIGNATIONS;
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

  const nextEmpId = useMemo(() => {
    const nums = employees
      .map((e) => e.empId && e.empId.replace(/^EMP/i, ''))
      .filter((n) => /^\d+$/.test(n))
      .map(Number);
    const max = nums.length ? Math.max(...nums) : 0;
    return `EMP${String(max + 1).padStart(3, '0')}`;
  }, [employees]);

  const filtered = useMemo(() => {
    let list = employees;
    if (tab === 'active') list = list.filter((e) => (e.status || 'Active') === 'Active');
    if (tab === 'onleave') list = list.filter((e) => (e.status || '') === 'On Leave');
    if (tab === 'inactive') list = list.filter((e) => (e.status || '') === 'Inactive');
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (e) =>
          e.fullName?.toLowerCase().includes(term) ||
          e.email?.toLowerCase().includes(term) ||
          (e.empId || '').toLowerCase().includes(term) ||
          (e.department || '').toLowerCase().includes(term),
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
  }, [employees, tab, search, filterDept, filterDesignation, filterBranch, filterEmploymentType, filterCategory, filterJoiningYear]);

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
      setShowAddModal(false);
      setForm(initialForm);
      setManagerSearch('');
      setShowManagerDropdown(false);
      setFormErrors({});
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
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Employees</h1>
          <p className="text-slate-500 mt-1">Manage employee records and directory</p>
        </div>
        <div className="flex items-center gap-2">
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
                  onClick={downloadCSV}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-50"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={downloadExcel}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-50 rounded-b-lg"
                >
                  Download Excel
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setShowAddModal(true); setForm({ ...initialForm, empId: nextEmpId }); }}
            className="inline-flex items-center justify-center rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
          >
            Add Employee
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        {['all', 'active', 'onleave', 'inactive'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t ? 'bg-[#378ADD] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t === 'all' ? 'All' : t === 'active' ? 'Active' : t === 'onleave' ? 'On Leave' : 'Inactive'}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, Emp ID, department..."
          className="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD] w-64"
        />
      </div>

      <p className="text-sm text-slate-500 mb-3">
        Showing {filtered.length} of {employees.length} employees
        {activeFilterCount > 0 ? ` · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active` : ''}
      </p>

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-500">
              <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-[#378ADD] text-white px-2 py-0.5 text-[10px] font-semibold">
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
                className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full border border-blue-200"
              >
                {f.label}: {f.value}
                <button type="button" onClick={() => clearFilter(f.key)} className="ml-1 hover:text-blue-900">
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
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Department</label>
                <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option>All Departments</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-0.5">Designation</label>
                <select value={filterDesignation} onChange={(e) => setFilterDesignation(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                  <option>All Designations</option>
                  {designations.map((d) => <option key={d} value={d}>{d}</option>)}
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
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#378ADD] border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-slate-800">
                {employees.filter((e) => (e.status || 'Active') === 'Active').length}
              </p>
              <p className="text-xs text-slate-500">Active</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-amber-600">
                {employees.filter((e) => (e.status || '') === 'On Leave').length}
              </p>
              <p className="text-xs text-slate-500">On Leave</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-slate-400">
                {employees.filter((e) => (e.status || '') === 'Inactive').length}
              </p>
              <p className="text-xs text-slate-500">Inactive</p>
            </div>
            <div className="bg-white border rounded-lg p-3 text-center">
              <p className="text-xl font-semibold text-blue-600">
                {new Set(employees.map((e) => e.department).filter(Boolean)).size}
              </p>
              <p className="text-xs text-slate-500">Departments</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
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
              {filtered.map((emp) => (
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
                            ? 'bg-blue-100 text-blue-800'
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
                    <button type="button" onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)} className="text-[#378ADD] text-xs font-medium hover:underline">
                      View Profile
                    </button>
                    {(emp.status || 'Active') === 'Active' && (
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
        </>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Employee</h2>
            <form onSubmit={handleAddEmployee} className="space-y-6">
              <section>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Personal Info</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                    <input name="fullName" value={form.fullName} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                    {formErrors.fullName && <p className="text-red-500 text-xs mt-1">{formErrors.fullName}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Father&apos;s Name</label>
                    <input
                      name="fatherName"
                      value={form.fatherName}
                      onChange={handleFormChange}
                      placeholder="Father's full name"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                    <input type="email" name="email" value={form.email} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                    {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                    <input name="phone" value={form.phone} onChange={handleFormChange} placeholder="10-digit mobile number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                    <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                    {formErrors.dateOfBirth && <p className="text-red-500 text-xs mt-1">{formErrors.dateOfBirth}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Gender</label>
                    <select name="gender" value={form.gender} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]">
                      <option value="">—</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Highest Qualification</label>
                    <select name="qualification" value={form.qualification} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]">
                      <option value="">—</option>
                      {qualifications.map((q) => <option key={q} value={q}>{q}</option>)}
                      {!qualifications.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Street Address</label>
                    <input
                      name="streetAddress"
                      value={form.streetAddress}
                      onChange={handleFormChange}
                      placeholder="House/Flat no, Street name"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                    <input
                      name="city"
                      value={form.city}
                      onChange={handleFormChange}
                      placeholder="City"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                    <select
                      name="state"
                      value={form.state}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-gray-700 mt-2 mb-3 pb-2 border-b">Emergency Contact</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Contact Name</label>
                    <input
                      name="emergencyContactName"
                      value={form.emergencyContactName}
                      onChange={handleFormChange}
                      placeholder="Full name"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    />
                    {formErrors.emergencyContactName && <p className="text-red-500 text-xs mt-1">{formErrors.emergencyContactName}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Relationship</label>
                    <select
                      name="emergencyRelationship"
                      value={form.emergencyRelationship}
                      onChange={handleFormChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Contact Address</label>
                    <input
                      name="emergencyAddress"
                      value={form.emergencyAddress}
                      onChange={handleFormChange}
                      placeholder="Contact's address"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Employment Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Emp ID</label>
                    <input
                      name="empId"
                      value={form.empId}
                      onChange={handleFormChange}
                      onBlur={handleEmpIdBlur}
                      placeholder={nextEmpId}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD] font-mono"
                    />
                    {formErrors.empId && <p className="text-xs text-red-500 mt-1">{formErrors.empId}</p>}
                    {!formErrors.empId && formWarnings.empId && <p className="text-xs text-amber-600 mt-1">{formWarnings.empId}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
                    <select name="department" value={form.department} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]">
                      <option value="">—</option>
                      {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                      {!departments.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Branch</label>
                    <select name="branch" value={form.branch} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]">
                      <option value="">—</option>
                      {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                      {!branches.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Designation</label>
                    <select name="designation" value={form.designation} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]">
                      <option value="">—</option>
                      {designations.map((d) => <option key={d} value={d}>{d}</option>)}
                      {!designations.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Employment Type</label>
                    <select name="employmentType" value={form.employmentType} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]">
                      {employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      {!employmentTypes.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                    <select name="category" value={form.category} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]">
                      <option value="">—</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      {!categories.includes('Other') && <option value="Other">Other</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Joining Date</label>
                    <input type="date" name="joiningDate" value={form.joiningDate} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
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
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:border-[#378ADD]"
                      >
                        {form.reportingManagerId ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
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
                              className="w-full text-sm px-2 py-1.5 border border-slate-200 rounded focus:outline-none focus:border-[#378ADD]"
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
                                  className={`flex items-center gap-3 px-3 py-2 hover:bg-blue-50 cursor-pointer ${
                                    form.reportingManagerId === emp.id ? 'bg-blue-50' : ''
                                  }`}
                                >
                                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 flex-shrink-0">
                                    {emp.fullName?.charAt(0)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p>
                                    <p className="text-xs text-slate-400">{emp.empId} · {emp.designation || '—'}</p>
                                  </div>
                                  {form.reportingManagerId === emp.id && (
                                    <span className="text-[#378ADD] text-xs">✓</span>
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
              </section>

              <section>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Compensation (₹)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">CTC per annum</label>
                    <input type="number" min="0" name="ctcPerAnnum" value={form.ctcPerAnnum} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Basic Salary / month</label>
                    <input type="number" min="0" name="basicSalary" value={form.basicSalary} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">HRA / month</label>
                    <input type="number" min="0" name="hra" value={form.hra} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">PF Number</label>
                    <input name="pfNumber" value={form.pfNumber} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">ESIC Number</label>
                    <input name="esicNumber" value={form.esicNumber} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Identity Documents</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">PAN Number</label>
                    <input
                      name="panNumber"
                      value={form.panNumber}
                      onChange={handleFormChange}
                      placeholder="e.g. ABCDE1234F"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD] uppercase"
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
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                      maxLength={20}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Driving Licence No.</label>
                    <input
                      name="drivingLicenceNumber"
                      value={form.drivingLicenceNumber}
                      onChange={handleFormChange}
                      placeholder="e.g. MH0120210012345"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    />
                  </div>
                </div>
              </section>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="text-sm text-slate-500 hover:text-slate-700" disabled={saving}>Cancel</button>
                <button type="submit" className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2 disabled:opacity-50" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
