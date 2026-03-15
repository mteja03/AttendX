import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';

const DEPT_COLOR = {
  Engineering: '#378ADD',
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
const DOC_TYPES = ['Appointment Letter', 'PAN Card', 'Aadhaar Card', 'Relieving Letter', 'Offer Letter', 'Experience Certificate', 'Education Certificate', 'Other'];

const LEAVE_TYPE_STYLE = { CL: 'bg-blue-100 text-blue-800', SL: 'bg-red-100 text-red-800', EL: 'bg-green-100 text-green-800' };
const STATUS_STYLE = { Pending: 'bg-amber-100 text-amber-800', Approved: 'bg-green-100 text-green-800', Rejected: 'bg-red-100 text-red-800' };

function formatDate(v) {
  if (!v) return '—';
  const d = v?.toDate ? v.toDate() : new Date(v);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateDDMMYYYY(v) {
  if (!v) return '—';
  const d = v?.toDate ? v.toDate() : new Date(v);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function EmployeeProfile() {
  const { companyId, empId } = useParams();
  const { success, error: showError } = useToast();
  const [employee, setEmployee] = useState(null);
  const [company, setCompany] = useState(null);
  const [leaveList, setLeaveList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('personal');
  const [showSalary, setShowSalary] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [uploadDocType, setUploadDocType] = useState(DOC_TYPES[0]);
  const [uploadDocName, setUploadDocName] = useState('');

  const deptColor = employee ? (DEPT_COLOR[employee.department] || DEFAULT_DEPT_COLOR) : DEFAULT_DEPT_COLOR;
  const departments = company?.departments?.length ? company.departments : DEFAULT_DEPARTMENTS;
  const designations = company?.designations?.length ? company.designations : DEFAULT_DESIGNATIONS;
  const employmentTypes = company?.employmentTypes?.length ? company.employmentTypes : DEFAULT_EMPLOYMENT_TYPES;
  const branches = company?.branches?.length ? company.branches : DEFAULT_BRANCHES;
  const qualifications = company?.qualifications?.length ? company.qualifications : DEFAULT_QUALIFICATIONS;

  useEffect(() => {
    if (!companyId || !empId) return;
    console.log('EmployeeProfile empId (Firestore doc id):', empId);
    const load = async () => {
      setLoading(true);
      try {
        const [empSnap, companySnap, leaveSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId, 'employees', empId)),
          getDoc(doc(db, 'companies', companyId)),
          getDocs(query(collection(db, 'companies', companyId, 'leave'), where('employeeId', '==', empId), orderBy('appliedAt', 'desc'))),
        ]);
        if (empSnap.exists()) setEmployee({ id: empSnap.id, ...empSnap.data() });
        else setEmployee(null);
        if (companySnap.exists()) setCompany({ id: companySnap.id, ...companySnap.data() });
        setLeaveList(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        showError('Failed to load profile');
      }
      setLoading(false);
    };
    load();
  }, [companyId, empId, showError]);

  const leavePolicy = company?.leavePolicy || { cl: 12, sl: 12, el: 15 };
  const clUsed = leaveList.filter((l) => l.status === 'Approved' && (l.leaveType || '') === 'CL').reduce((s, l) => s + (l.days || 0), 0);
  const slUsed = leaveList.filter((l) => l.status === 'Approved' && (l.leaveType || '') === 'SL').reduce((s, l) => s + (l.days || 0), 0);
  const elUsed = leaveList.filter((l) => l.status === 'Approved' && (l.leaveType || '') === 'EL').reduce((s, l) => s + (l.days || 0), 0);

  const timeline = useMemo(() => {
    if (!employee) return [];
    const events = [];
    if (employee.joiningDate) {
      events.push({ date: employee.joiningDate, type: 'joined', text: 'Joined the company' });
    }
    leaveList.forEach((l) => {
      const typeLabel = l.leaveType === 'CL' ? 'Casual Leave' : l.leaveType === 'SL' ? 'Sick Leave' : 'Earned Leave';
      const days = l.days || 0;
      if (l.status === 'Approved') events.push({ date: l.decidedAt || l.appliedAt, type: 'leave_approved', text: `Leave approved — ${typeLabel} ${days} day(s)` });
      if (l.status === 'Rejected') events.push({ date: l.decidedAt || l.appliedAt, type: 'leave_rejected', text: `Leave rejected — ${typeLabel} ${days} day(s)` });
    });
    events.sort((a, b) => {
      const ta = a.date?.toMillis?.() ?? (typeof a.date === 'string' ? new Date(a.date).getTime() : 0);
      const tb = b.date?.toMillis?.() ?? (typeof b.date === 'string' ? new Date(b.date).getTime() : 0);
      return tb - ta;
    });
    return events;
  }, [employee, leaveList]);

  const openEdit = () => {
    if (!employee) return;
    setForm({
      fullName: employee.fullName || '',
      email: employee.email || '',
      phone: employee.phone || '',
      dateOfBirth: employee.dateOfBirth ? (typeof employee.dateOfBirth === 'string' ? employee.dateOfBirth : employee.dateOfBirth?.toDate?.()?.toISOString?.()?.slice(0, 10)) : '',
      gender: employee.gender || '',
      address: employee.address || '',
      qualification: employee.qualification || '',
      empId: employee.empId || '',
      department: employee.department || '',
      branch: employee.branch || '',
      designation: employee.designation || '',
      employmentType: employee.employmentType || 'Full-time',
      joiningDate: employee.joiningDate ? (typeof employee.joiningDate === 'string' ? employee.joiningDate : employee.joiningDate?.toDate?.()?.toISOString?.()?.slice(0, 10)) : '',
      reportingManager: employee.reportingManager || '',
      ctcPerAnnum: employee.ctcPerAnnum ?? employee.ctc ?? '',
      basicSalary: employee.basicSalary ?? '',
      hra: employee.hra ?? '',
      pfNumber: employee.pfNumber || '',
      esicNumber: employee.esicNumber || '',
      panNumber: employee.panNumber || '',
      aadhaarNumber: employee.aadhaarNumber || '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!employee || !form) return;
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName?.trim(),
        email: form.email?.trim(),
        phone: form.phone?.trim(),
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        address: form.address || null,
        empId: form.empId || null,
        department: form.department || null,
        branch: form.branch || null,
        designation: form.designation || null,
        employmentType: form.employmentType || 'Full-time',
        qualification: form.qualification || null,
        joiningDate: form.joiningDate || null,
        reportingManager: form.reportingManager || null,
        ctcPerAnnum: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        ctc: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        basicSalary: form.basicSalary ? Number(form.basicSalary) : null,
        hra: form.hra ? Number(form.hra) : null,
        pfNumber: form.pfNumber || null,
        esicNumber: form.esicNumber || null,
        panNumber: form.panNumber?.replace(/\s/g, '') || null,
        aadhaarNumber: form.aadhaarNumber?.replace(/\s/g, '') || null,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
      setEmployee((prev) => (prev ? { ...prev, ...payload } : null));
      setShowEditModal(false);
      success('Employee updated');
    } catch (err) {
      showError('Failed to update');
    }
    setSaving(false);
  };

  const handleDeactivate = async () => {
    if (!employee) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), { status: 'Inactive', updatedAt: serverTimestamp() });
      setEmployee((prev) => (prev ? { ...prev, status: 'Inactive' } : null));
      setDeactivateConfirm(false);
      success('Employee deactivated');
    } catch (err) {
      showError('Failed to deactivate');
    }
    setSaving(false);
  };

  const handleUploadDoc = async () => {
    if (!employee || !uploadDocName.trim()) return;
    const entry = { type: uploadDocType, name: uploadDocName.trim(), uploadDate: new Date().toISOString() };
    try {
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), {
        documents: arrayUnion(entry),
        updatedAt: serverTimestamp(),
      });
      setEmployee((prev) => (prev ? { ...prev, documents: [...(prev.documents || []), entry] } : null));
      setUploadDocName('');
      success('Document added');
    } catch (err) {
      showError('Failed to add document');
    }
  };

  const handleDeleteDoc = async (index) => {
    if (!employee?.documents) return;
    const next = employee.documents.filter((_, i) => i !== index);
    try {
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), { documents: next, updatedAt: serverTimestamp() });
      setEmployee((prev) => (prev ? { ...prev, documents: next } : null));
      success('Document removed');
    } catch (err) {
      showError('Failed to remove document');
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#378ADD] border-t-transparent" />
      </div>
    );
  }
  if (!employee) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Employee not found.</p>
        <Link to={`/company/${companyId}/employees`} className="text-[#378ADD] text-sm mt-2 inline-block">← Employees</Link>
      </div>
    );
  }

  const tabs = [
    { id: 'personal', label: 'Personal Info' },
    { id: 'documents', label: 'Documents' },
    { id: 'leave', label: 'Leave History' },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className="p-8">
      <Link to={`/company/${companyId}/employees`} className="text-sm text-slate-600 hover:text-[#378ADD] mb-4 inline-block">← Employees</Link>

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
                  employee.status === 'Active' ? 'bg-green-100 text-green-800' : employee.status === 'On Leave' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {employee.status || 'Active'}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-1">Joined {formatDate(employee.joiningDate)}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={openEdit} className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2">Edit</button>
            {(employee.status || 'Active') === 'Active' && (
              <button type="button" onClick={() => setDeactivateConfirm(true)} className="rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium px-4 py-2">Deactivate</button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 mb-6">
        {tabs.map((t) => (
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
              <p><span className="text-slate-500 text-sm">Email</span><br />{employee.email || '—'}</p>
              <p><span className="text-slate-500 text-sm">Phone</span><br />{employee.phone || '—'}</p>
              <p><span className="text-slate-500 text-sm">Date of Birth</span><br />{formatDateDDMMYYYY(employee.dateOfBirth)}</p>
              <p><span className="text-slate-500 text-sm">Gender</span><br />{employee.gender || '—'}</p>
              <p><span className="text-slate-500 text-sm">Highest Qualification</span><br />{employee.qualification || '—'}</p>
              <p><span className="text-slate-500 text-sm">Address</span><br />{employee.address || '—'}</p>
            </div>
            <div className="space-y-3">
              <p><span className="text-slate-500 text-sm">Emp ID</span><br />{employee.empId || '—'}</p>
              <p><span className="text-slate-500 text-sm">Department</span><br />{employee.department || '—'}</p>
              <p><span className="text-slate-500 text-sm">Branch</span><br />{employee.branch || '—'}</p>
              <p><span className="text-slate-500 text-sm">Designation</span><br />{employee.designation || '—'}</p>
              <p><span className="text-slate-500 text-sm">Employment Type</span><br />{employee.employmentType || '—'}</p>
              <p><span className="text-slate-500 text-sm">Reporting Manager</span><br />{employee.reportingManager || '—'}</p>
              <p><span className="text-slate-500 text-sm">Joining Date</span><br />{formatDateDDMMYYYY(employee.joiningDate)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-medium text-slate-800 mb-3">Compensation</h3>
            {!showSalary ? (
              <div className="flex items-center gap-3">
                <span className="text-slate-400 select-none">₹ ••••••••</span>
                <button type="button" onClick={() => setShowSalary(true)} className="text-sm text-[#378ADD] hover:underline">Show</button>
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
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 p-4 bg-slate-50 rounded-xl">
            <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="text" value={uploadDocName} onChange={(e) => setUploadDocName(e.target.value)} placeholder="Document name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48" />
            <button type="button" onClick={handleUploadDoc} className="rounded-lg bg-[#378ADD] text-white text-sm px-4 py-2">Upload Document</button>
          </div>
          {(!employee.documents || employee.documents.length === 0) ? (
            <p className="text-slate-500 py-8 text-center">No documents uploaded yet.</p>
          ) : (
            <ul className="border border-slate-200 rounded-xl divide-y">
              {employee.documents.map((doc, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">{doc.name} ({doc.type}) — {doc.uploadDate ? formatDate(doc.uploadDate) : '—'}</span>
                  <div className="flex gap-2">
                    {doc.url && <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-[#378ADD] text-sm">View</a>}
                    <button type="button" onClick={() => handleDeleteDoc(i)} className="text-red-600 text-sm">Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'leave' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-slate-500 text-sm">CL</p>
              <p className="font-semibold text-slate-800">{clUsed} / {leavePolicy.cl ?? 12}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-slate-500 text-sm">SL</p>
              <p className="font-semibold text-slate-800">{slUsed} / {leavePolicy.sl ?? 12}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-slate-500 text-sm">EL</p>
              <p className="font-semibold text-slate-800">{elUsed} / {leavePolicy.el ?? 15}</p>
            </div>
          </div>
          {leaveList.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No leave records found.</p>
          ) : (
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
                      <td className="px-4 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LEAVE_TYPE_STYLE[l.leaveType] || 'bg-slate-100'}`}>{l.leaveType}</span></td>
                      <td className="px-4 py-2">{l.startDate}</td>
                      <td className="px-4 py-2">{l.endDate}</td>
                      <td className="px-4 py-2">{l.days}</td>
                      <td className="px-4 py-2">{l.reason || '—'}</td>
                      <td className="px-4 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] || 'bg-slate-100'}`}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="space-y-3">
          {timeline.length === 0 ? (
            <p className="text-slate-500">No timeline events yet.</p>
          ) : (
            timeline.map((ev, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="text-slate-400 text-sm shrink-0">{formatDate(ev.date)}</span>
                <span className="text-slate-700">{ev.text}</span>
              </div>
            ))
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
                <div><label className="block text-xs text-slate-600 mb-1">Phone</label><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">DOB</label><input type="date" value={form.dateOfBirth} onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Gender</label><select value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
                <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Address</label><input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Emp ID</label><input value={form.empId} onChange={(e) => setForm((p) => ({ ...p, empId: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Department</label><select value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{!departments.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Branch</label><select value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{branches.map((b) => <option key={b} value={b}>{b}</option>)}{!branches.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Designation</label><select value={form.designation} onChange={(e) => setForm((p) => ({ ...p, designation: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{designations.map((d) => <option key={d} value={d}>{d}</option>)}{!designations.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Employment Type</label><select value={form.employmentType} onChange={(e) => setForm((p) => ({ ...p, employmentType: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}{!employmentTypes.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Highest Qualification</label><select value={form.qualification} onChange={(e) => setForm((p) => ({ ...p, qualification: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{qualifications.map((q) => <option key={q} value={q}>{q}</option>)}{!qualifications.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Joining Date</label><input type="date" value={form.joiningDate} onChange={(e) => setForm((p) => ({ ...p, joiningDate: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Reporting Manager</label><input value={form.reportingManager} onChange={(e) => setForm((p) => ({ ...p, reportingManager: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">CTC</label><input type="number" value={form.ctcPerAnnum} onChange={(e) => setForm((p) => ({ ...p, ctcPerAnnum: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Basic Salary</label><input type="number" value={form.basicSalary} onChange={(e) => setForm((p) => ({ ...p, basicSalary: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">HRA</label><input type="number" value={form.hra} onChange={(e) => setForm((p) => ({ ...p, hra: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">PAN</label><input value={form.panNumber} onChange={(e) => setForm((p) => ({ ...p, panNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Aadhaar</label><input value={form.aadhaarNumber} onChange={(e) => setForm((p) => ({ ...p, aadhaarNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">PF Number</label><input value={form.pfNumber} onChange={(e) => setForm((p) => ({ ...p, pfNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">ESIC Number</label><input value={form.esicNumber} onChange={(e) => setForm((p) => ({ ...p, esicNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowEditModal(false)} className="text-slate-500 text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-[#378ADD] text-white text-sm font-medium px-4 py-2 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deactivateConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Deactivate {employee?.fullName}?</h3>
            <p className="text-sm text-slate-600 mb-4">They will be marked as Inactive.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeactivateConfirm(false)} className="text-slate-500 text-sm">Cancel</button>
              <button type="button" onClick={handleDeactivate} disabled={saving} className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50">Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
