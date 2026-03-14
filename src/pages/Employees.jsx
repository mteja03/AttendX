import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
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

const DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal', 'Other'];
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract'];

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAAR_REGEX = /^[0-9]{12}$/;

const initialForm = {
  fullName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: '',
  address: '',
  empId: '',
  department: '',
  designation: '',
  employmentType: 'Full-time',
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
  const { success, error: showError } = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'companies', companyId, 'employees'), orderBy('createdAt', 'desc')),
        );
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        showError('Failed to load employees');
      }
      setLoading(false);
    };
    load();
  }, [companyId, showError]);

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
    return list;
  }, [employees, tab, search]);

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
        designation: form.designation || null,
        employmentType: form.employmentType || 'Full-time',
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
                <tr key={emp.id} className="border-t border-slate-100">
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
                  <td className="px-4 py-3 space-x-2">
                    <button type="button" className="text-[#378ADD] text-xs font-medium hover:underline">
                      View Profile
                    </button>
                    <button type="button" className="text-slate-600 text-xs font-medium hover:underline">
                      Edit
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
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date of Birth</label>
                    <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
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
                      {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Designation</label>
                    <input name="designation" value={form.designation} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Employment Type</label>
                    <select name="employmentType" value={form.employmentType} onChange={handleFormChange} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]">
                      {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
