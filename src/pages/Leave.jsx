import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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

const LEAVE_TYPES = [
  { value: 'CL', label: 'Casual Leave', max: 12 },
  { value: 'SL', label: 'Sick Leave', max: 12 },
  { value: 'EL', label: 'Earned Leave', max: 15 },
];

function getDaysBetween(startVal, endVal) {
  const start = toJSDate(startVal);
  const end = toJSDate(endVal);
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

const TYPE_STYLE = { CL: 'bg-blue-100 text-blue-800', SL: 'bg-red-100 text-red-800', EL: 'bg-green-100 text-green-800' };
const STATUS_STYLE = { Pending: 'bg-amber-100 text-amber-800', Approved: 'bg-green-100 text-green-800', Rejected: 'bg-red-100 text-red-800' };

export default function Leave() {
  const { companyId } = useParams();
  const { success, error: showError } = useToast();
  const [leaveList, setLeaveList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leavePolicy, setLeavePolicy] = useState({ cl: 12, sl: 12, el: 15 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Pending');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    leaveType: 'CL',
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [actioningId, setActioningId] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [companySnap, leaveSnap, empSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId)),
          getDocs(query(collection(db, 'companies', companyId, 'leave'), orderBy('appliedAt', 'desc'))),
          getDocs(collection(db, 'companies', companyId, 'employees')),
        ]);
        if (companySnap.exists() && companySnap.data().leavePolicy) setLeavePolicy(companySnap.data().leavePolicy);
        setLeaveList(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => (e.status || 'Active') !== 'Inactive'));
      } catch (err) {
        showError('Failed to load leave data');
      }
      setLoading(false);
    };
    load();
  }, [companyId, showError]);

  const filtered = useMemo(() => {
    if (tab === 'All') return leaveList;
    return leaveList.filter((l) => l.status === tab);
  }, [leaveList, tab]);

  const employeeMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  const days = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    return getDaysBetween(form.startDate, form.endDate);
  }, [form.startDate, form.endDate]);

  const leaveBalance = useMemo(() => {
    const approved = leaveList.filter((l) => l.status === 'Approved');
    const byEmployee = {};
    employees.forEach((e) => {
      byEmployee[e.id] = { name: e.fullName, CL: 0, SL: 0, EL: 0 };
    });
    approved.forEach((l) => {
      if (!byEmployee[l.employeeId]) byEmployee[l.employeeId] = { name: l.employeeName || '—', CL: 0, SL: 0, EL: 0 };
      const key = l.leaveType || 'CL';
      if (key in byEmployee[l.employeeId]) byEmployee[l.employeeId][key] += l.days || 0;
    });
    return byEmployee;
  }, [leaveList, employees]);

  const handleApprove = async (leaveDoc) => {
    setActioningId(leaveDoc.id);
    try {
      await updateDoc(doc(db, 'companies', companyId, 'leave', leaveDoc.id), {
        status: 'Approved',
        decidedAt: serverTimestamp(),
      });
      const empRef = doc(db, 'companies', companyId, 'employees', leaveDoc.employeeId);
      const key = `leaveUsed.${leaveDoc.leaveType || 'CL'}`;
      await updateDoc(empRef, { [key]: increment(leaveDoc.days || 0) });
      setLeaveList((prev) => prev.map((l) => (l.id === leaveDoc.id ? { ...l, status: 'Approved' } : l)));
      success('Leave approved');
    } catch (err) {
      showError('Failed to approve');
    }
    setActioningId(null);
  };

  const handleReject = async (leaveDoc) => {
    setActioningId(leaveDoc.id);
    try {
      await updateDoc(doc(db, 'companies', companyId, 'leave', leaveDoc.id), {
        status: 'Rejected',
        decidedAt: serverTimestamp(),
      });
      setLeaveList((prev) => prev.map((l) => (l.id === leaveDoc.id ? { ...l, status: 'Rejected' } : l)));
      success('Leave rejected');
    } catch (err) {
      showError('Failed to reject');
    }
    setActioningId(null);
  };

  const handleAddLeave = async (e) => {
    e.preventDefault();
    const emp = employeeMap[form.employeeId];
    if (!emp) return;
    setSaving(true);
    try {
      const daysCount = getDaysBetween(form.startDate, form.endDate);
      const startTs = Timestamp.fromDate(new Date(form.startDate));
      const endTs = Timestamp.fromDate(new Date(form.endDate));
      await addDoc(collection(db, 'companies', companyId, 'leave'), {
        employeeId: form.employeeId,
        employeeName: emp.fullName,
        leaveType: form.leaveType,
        startDate: startTs,
        endDate: endTs,
        days: daysCount,
        reason: form.reason?.trim() || '',
        status: 'Approved',
        appliedAt: serverTimestamp(),
        decidedAt: serverTimestamp(),
      });
      setLeaveList((prev) => [
        {
          id: 'temp',
          employeeId: form.employeeId,
          employeeName: emp.fullName,
          leaveType: form.leaveType,
          startDate: startTs,
          endDate: endTs,
          days: daysCount,
          reason: form.reason?.trim() || '',
          status: 'Approved',
          appliedAt: new Date(),
        },
        ...prev,
      ]);
      setShowAddModal(false);
      setForm({ employeeId: '', leaveType: 'CL', startDate: '', endDate: '', reason: '' });
      success('Leave added');
    } catch (err) {
      showError('Failed to add leave');
    }
    setSaving(false);
  };

  if (!companyId) return null;

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Leave</h1>
          <p className="text-slate-500 mt-1">Leave requests and balance</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center justify-center rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
        >
          Add Leave
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowBalance(!showBalance)}
        className="mb-4 text-sm font-medium text-slate-600 hover:text-slate-800"
      >
        {showBalance ? '▼' : '▶'} Leave Balance
      </button>
      {showBalance && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Employee</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">CL (used/{leavePolicy.cl ?? 12})</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">SL (used/{leavePolicy.sl ?? 12})</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600">EL (used/{leavePolicy.el ?? 15})</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(leaveBalance).map(([empId, row]) => (
                <tr key={empId} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                  <td className="px-4 py-2 text-slate-600">{row.CL || 0}/{leavePolicy.cl ?? 12}</td>
                  <td className="px-4 py-2 text-slate-600">{row.SL || 0}/{leavePolicy.sl ?? 12}</td>
                  <td className="px-4 py-2 text-slate-600">{row.EL || 0}/{leavePolicy.el ?? 15}</td>
                </tr>
              ))}
              {Object.keys(leaveBalance).length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={4}>No employees</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {['Pending', 'Approved', 'Rejected', 'All'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t ? 'bg-[#378ADD] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
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
                <th className="px-4 py-3 text-left font-medium">Employee</th>
                <th className="px-4 py-3 text-left font-medium">Leave Type</th>
                <th className="px-4 py-3 text-left font-medium">Start</th>
                <th className="px-4 py-3 text-left font-medium">End</th>
                <th className="px-4 py-3 text-left font-medium">Days</th>
                <th className="px-4 py-3 text-left font-medium">Reason</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                        {(l.employeeName || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-800">{l.employeeName || '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLE[l.leaveType] || 'bg-slate-100'}`}>
                      {l.leaveType || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{toDisplayDate(l.startDate)}</td>
                  <td className="px-4 py-3 text-slate-700">{toDisplayDate(l.endDate)}</td>
                  <td className="px-4 py-3 text-slate-700">{l.days ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate" title={l.reason}>{l.reason || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] || 'bg-slate-100'}`}>
                      {l.status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {l.status === 'Pending' && (
                      <span className="flex gap-2">
                        <button type="button" disabled={actioningId === l.id} onClick={() => handleApprove(l)} className="text-green-600 text-xs font-medium hover:underline disabled:opacity-50">Approve</button>
                        <button type="button" disabled={actioningId === l.id} onClick={() => handleReject(l)} className="text-red-600 text-xs font-medium hover:underline disabled:opacity-50">Reject</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>No leave requests.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Leave</h2>
            <form onSubmit={handleAddLeave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
                <select name="employeeId" value={form.employeeId} onChange={(e) => setForm((p) => ({ ...p, employeeId: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" required>
                  <option value="">— Select —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.empId})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Leave Type</label>
                <select name="leaveType" value={form.leaveType} onChange={(e) => setForm((p) => ({ ...p, leaveType: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]">
                  {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                  <input type="date" name="startDate" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                  <input type="date" name="endDate" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" required />
                </div>
              </div>
              <p className="text-xs text-slate-500">Days (excl. weekends): {days}</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason</label>
                <textarea name="reason" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="text-sm text-slate-500 hover:text-slate-700" disabled={saving}>Cancel</button>
                <button type="submit" className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2 disabled:opacity-50" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
