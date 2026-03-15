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
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';

const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal', 'Other'];
const DEFAULT_DESIGNATIONS = ['Director', 'General Manager', 'Manager', 'Assistant Manager', 'Team Lead', 'Senior Executive', 'Executive', 'Junior Executive', 'Intern', 'Other'];
const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];
const JOINING_YEARS = ['All Years', 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_REGEX = /^[0-9]{12}$/;

const initialForm = {
  fullName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  address: '',
  qualification: '',
  empId: '',
  department: '',
  branch: '',
  designation: '',
  employmentType: 'Full-time',
  category: '',
  joiningDate: new Date().toISOString().slice(0, 10),
  reportingManager: '',
  ctcPerAnnum: '',
  basicSalary: '',
  hra: '',
  pfNumber: '',
  esicNumber: '',
  panNumber: '',
  aadhaarNumber: '',
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
  const [saving, setSaving] = useState(false);

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
        const j = e.joiningDate;
        if (!j) return false;
        const d = typeof j === 'string' ? new Date(j) : j?.toDate ? j.toDate() : new Date(j);
        return d.getFullYear() === year;
      });
    }
    return list;
  }, [employees, tab, search, filterDept, filterDesignation, filterBranch, filterEmploymentType, filterCategory, filterJoiningYear]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validate = () => {
    const err = {};
    if (!form.fullName?.trim()) err.fullName = 'Required';
    if (!form.email?.trim()) err.email = 'Required';
    if (!form.phone?.trim()) err.phone = 'Required';
    if (!form.dateOfBirth?.trim()) err.dateOfBirth = 'Required';
    if (form.dateOfBirth) {
      const dob = new Date(form.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
      if (age < 18) err.dateOfBirth = 'Employee must be at least 18 years old';
      if (age >= 65) err.dateOfBirth = 'Employee must be less than 65 years old';
    }
    if (form.panNumber && !PAN_REGEX.test(form.panNumber.replace(/\s/g, ''))) err.panNumber = 'Invalid PAN (e.g. ABCDE1234F)';
    if (form.aadhaarNumber && !AADHAAR_REGEX.test(form.aadhaarNumber.replace(/\s/g, ''))) err.aadhaarNumber = 'Must be 12 digits';
    setFormErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        address: form.address || null,
        empId: form.empId || nextEmpId,
        department: form.department || null,
        branch: form.branch || null,
        designation: form.designation || null,
        employmentType: form.employmentType || 'Full-time',
        category: form.category || null,
        qualification: form.qualification || null,
        joiningDate: form.joiningDate || null,
        reportingManager: form.reportingManager || null,
        ctcPerAnnum: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        basicSalary: form.basicSalary ? Number(form.basicSalary) : null,
        hra: form.hra ? Number(form.hra) : null,
        pfNumber: form.pfNumber || null,
        esicNumber: form.esicNumber || null,
        panNumber: form.panNumber?.replace(/\s/g, '') || null,
        aadhaarNumber: form.aadhaarNumber?.replace(/\s/g, '') || null,
        status: 'Active',
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'companies', companyId, 'employees'), payload);
      await updateDoc(doc(db, 'companies', companyId), { employeeCount: increment(1) });
      setEmployees((prev) => [{ id: ref.id, ...payload, createdAt: new Date() }, ...prev]);
      setShowAddModal(false);
      setForm(initialForm);
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

  const formatDate = (v) => {
    if (!v) return '—';
    const d = v?.toDate ? v.toDate() : new Date(v);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  if (!companyId) return null;

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Employees</h1>
          <p className="text-slate-500 mt-1">Manage employee records and directory</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowAddModal(true); setForm({ ...initialForm, empId: nextEmpId }); }}
          className="inline-flex items-center justify-center rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
        >
          Add Employee
        </button>
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

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => setFilterOpen((o) => !o)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${activeFilterCount > 0 ? 'bg-[#378ADD] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </button>
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
              Clear Filters
            </button>
          )}
        </div>
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
        <p className="text-slate-500 text-xs">{filtered.length} employee{filtered.length !== 1 ? 's' : ''} found</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#378ADD] border-t-transparent" />
        </div>
      ) : (
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
                  className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-slate-700">{emp.empId || '—'}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-800">{emp.fullName || '—'}</p>
                      <p className="text-slate-500 text-xs">{emp.email || '—'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{emp.department || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{emp.designation || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{emp.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(emp.joiningDate)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        emp.status === 'Active'
                          ? 'bg-green-100 text-green-800'
                          : emp.status === 'On Leave'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {emp.status || 'Active'}
                    </span>
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
                    <input name="fullName" value={form.fullName} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" required />
                    {formErrors.fullName && <p className="text-red-500 text-xs mt-1">{formErrors.fullName}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
                    <input type="email" name="email" value={form.email} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" required />
                    {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Phone *</label>
                    <input name="phone" value={form.phone} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth *</label>
                    <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" required />
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">Address</label>
                    <input name="address" value={form.address} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-medium text-slate-700 mb-3">Employment Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Emp ID</label>
                    <input name="empId" value={form.empId} onChange={handleFormChange} placeholder={nextEmpId} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD] font-mono" />
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
                    <input name="reportingManager" value={form.reportingManager} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">PAN (e.g. ABCDE1234F)</label>
                    <input name="panNumber" value={form.panNumber} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD] uppercase" maxLength={10} />
                    {formErrors.panNumber && <p className="text-red-500 text-xs mt-1">{formErrors.panNumber}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Aadhaar (12 digits)</label>
                    <input name="aadhaarNumber" value={form.aadhaarNumber} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" maxLength={12} />
                    {formErrors.aadhaarNumber && <p className="text-red-500 text-xs mt-1">{formErrors.aadhaarNumber}</p>}
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
