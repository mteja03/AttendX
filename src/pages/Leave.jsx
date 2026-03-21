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
  increment,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';
import { toDisplayDate, toJSDate } from '../utils';

const DEFAULT_LEAVE_TYPES = [
  'Casual Leave',
  'Sick Leave',
  'Earned Leave',
  'Maternity Leave',
  'Paternity Leave',
  'Bereavement Leave',
  'Compensatory Leave',
  'Marriage Leave',
  'Study Leave',
  'Unpaid Leave',
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

function matchLeaveBalanceKey(rawLeaveType, leaveTypes) {
  const r = (rawLeaveType || '').trim();
  if (leaveTypes.includes(r)) return r;
  if (r === 'CL' && leaveTypes.includes('Casual Leave')) return 'Casual Leave';
  if (r === 'SL' && leaveTypes.includes('Sick Leave')) return 'Sick Leave';
  if (r === 'EL' && leaveTypes.includes('Earned Leave')) return 'Earned Leave';
  return null;
}

function getMaxForLeaveType(typeLabel, leavePolicy) {
  const lp = leavePolicy || { cl: 12, sl: 12, el: 15 };
  if (typeLabel === 'Casual Leave') return Number(lp.cl) || 12;
  if (typeLabel === 'Sick Leave') return Number(lp.sl) || 12;
  if (typeLabel === 'Earned Leave') return Number(lp.el) || 15;
  return Number(lp[typeLabel]) || 12;
}

const TYPE_STYLE = { CL: 'bg-blue-100 text-blue-800', SL: 'bg-red-100 text-red-800', EL: 'bg-green-100 text-green-800' };
const STATUS_STYLE = { Pending: 'bg-amber-100 text-amber-800', Approved: 'bg-green-100 text-green-800', Rejected: 'bg-red-100 text-red-800' };

function leaveTypeBadgeClass(lt) {
  return TYPE_STYLE[lt] || 'bg-slate-100 text-slate-700';
}

export default function Leave() {
  const { companyId } = useParams();
  const { success, error: showError } = useToast();
  const [leaveList, setLeaveList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leavePolicy, setLeavePolicy] = useState({ cl: 12, sl: 12, el: 15 });
  const [leaveTypes, setLeaveTypes] = useState(DEFAULT_LEAVE_TYPES);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Pending');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    leaveType: '',
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [actioningId, setActioningId] = useState(null);

  const [empSearch, setEmpSearch] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterStatusDropdown, setFilterStatusDropdown] = useState('');

  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    const handleClick = () => {
      setShowEmpDropdown(false);
      setEmpSearch('');
    };
    if (showEmpDropdown) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showEmpDropdown]);

  useEffect(() => {
    const handleClick = () => setShowDownload(false);
    if (showDownload) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDownload]);

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
        if (companySnap.exists()) {
          const data = companySnap.data();
          if (data.leavePolicy) setLeavePolicy(data.leavePolicy);
          if (Array.isArray(data.leaveTypes) && data.leaveTypes.length > 0) {
            setLeaveTypes(data.leaveTypes);
          } else {
            setLeaveTypes(DEFAULT_LEAVE_TYPES);
          }
        }
        setLeaveList(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => (e.status || 'Active') !== 'Inactive'));
      } catch (err) {
        showError('Failed to load leave data');
      }
      setLoading(false);
    };
    load();
  }, [companyId, showError]);

  const departments = useMemo(() => {
    const s = new Set();
    employees.forEach((e) => {
      if (e.department?.trim()) s.add(e.department.trim());
    });
    return [...s].sort();
  }, [employees]);

  const activeStatus = filterStatusDropdown || tab;

  const filteredLeave = useMemo(() => {
    return leaveList.filter((l) => {
      if (activeStatus !== 'All' && (l.status || '') !== activeStatus) return false;
      if (filterEmployee && !(`${l.employeeName || ''}`.toLowerCase().includes(filterEmployee.toLowerCase()))) return false;
      if (filterType && (l.leaveType || '') !== filterType) return false;
      if (filterDept) {
        const emp = employees.find((e) => e.id === l.employeeId);
        if ((emp?.department || '').trim() !== filterDept) return false;
      }
      if (filterFrom) {
        const start = toJSDate(l.startDate);
        const fromD = new Date(filterFrom);
        if (!start || start < fromD) return false;
      }
      if (filterTo) {
        const end = toJSDate(l.endDate);
        const toD = new Date(filterTo);
        toD.setHours(23, 59, 59, 999);
        if (!end || end > toD) return false;
      }
      return true;
    });
  }, [leaveList, activeStatus, filterEmployee, filterType, filterDept, filterFrom, filterTo, employees]);

  const employeeMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  const days = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    return getDaysBetween(form.startDate, form.endDate);
  }, [form.startDate, form.endDate]);

  const leaveBalance = useMemo(() => {
    const approved = leaveList.filter((l) => l.status === 'Approved');
    const byEmployee = {};
    employees.forEach((e) => {
      byEmployee[e.id] = { name: e.fullName };
      leaveTypes.forEach((lt) => {
        byEmployee[e.id][lt] = 0;
      });
    });
    approved.forEach((l) => {
      if (!byEmployee[l.employeeId]) {
        byEmployee[l.employeeId] = { name: l.employeeName || '—' };
        leaveTypes.forEach((lt) => {
          byEmployee[l.employeeId][lt] = 0;
        });
      }
      const key = matchLeaveBalanceKey(l.leaveType, leaveTypes);
      if (key) byEmployee[l.employeeId][key] = (byEmployee[l.employeeId][key] || 0) + (l.days || 0);
    });
    return byEmployee;
  }, [leaveList, employees, leaveTypes]);

  const downloadLeaveReport = (format) => {
    const rows = filteredLeave.map((l) => ({
      'Employee Name': l.employeeName || '',
      'Emp ID': employees.find((e) => e.id === l.employeeId)?.empId || '',
      Department: employees.find((e) => e.id === l.employeeId)?.department || '',
      'Leave Type': l.leaveType || '',
      'Start Date': l.startDate ? toDisplayDate(l.startDate) : '',
      'End Date': l.endDate ? toDisplayDate(l.endDate) : '',
      Days: l.days ?? '',
      Reason: l.reason || '',
      Status: l.status || '',
      'Applied On': l.appliedAt ? toDisplayDate(l.appliedAt) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      saveAs(blob, `Leave_Report_${today}.csv`);
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leave');
      XLSX.writeFile(wb, `Leave_Report_${today}.xlsx`);
    }
    setShowDownload(false);
  };

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
    if (!emp || !form.leaveType) return;
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
      setForm({ employeeId: '', leaveType: '', startDate: '', endDate: '', reason: '' });
      setSelectedEmployee(null);
      setEmpSearch('');
      setShowEmpDropdown(false);
      success('Leave added');
    } catch (err) {
      showError('Failed to add leave');
    }
    setSaving(false);
  };

  const openAddModal = () => {
    setSelectedEmployee(null);
    setEmpSearch('');
    setShowEmpDropdown(false);
    setForm({ employeeId: '', leaveType: leaveTypes[0] || '', startDate: '', endDate: '', reason: '' });
    setShowAddModal(true);
  };

  if (!companyId) return null;

  const filtersActive = !!(filterEmployee || filterType || filterDept || filterFrom || filterTo || filterStatusDropdown);

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Leave</h1>
          <p className="text-slate-500 text-sm mt-1">Leave requests and balance</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setShowDownload((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              Download ▾
            </button>
            {showDownload && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-40" onMouseDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => downloadLeaveReport('csv')}
                  className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => downloadLeaveReport('excel')}
                  className="block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-t border-gray-100"
                >
                  Download Excel
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
          >
            Add Leave
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowBalance(!showBalance)}
        className="mb-4 text-sm font-medium text-slate-600 hover:text-slate-800"
      >
        {showBalance ? '▼' : '▶'} Leave Balance
      </button>
      {showBalance && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto mb-6">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Employee</th>
                {leaveTypes.map((lt) => (
                  <th key={lt} className="px-4 py-2 text-left font-medium text-slate-600 whitespace-nowrap">
                    {lt} (used/{getMaxForLeaveType(lt, leavePolicy)})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(leaveBalance).map(([empId, row]) => (
                <tr key={empId} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                  {leaveTypes.map((lt) => (
                    <td key={lt} className="px-4 py-2 text-slate-600 whitespace-nowrap">
                      {row[lt] ?? 0}/{getMaxForLeaveType(lt, leavePolicy)}
                    </td>
                  ))}
                </tr>
              ))}
              {Object.keys(leaveBalance).length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={leaveTypes.length + 1}>
                    No employees
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['Pending', 'Approved', 'Rejected', 'All'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setFilterStatusDropdown('');
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t && !filterStatusDropdown ? 'bg-[#378ADD] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
        <input
          placeholder="Search employee..."
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-44"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        >
          <option value="">All leave types</option>
          {leaveTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={filterStatusDropdown}
          onChange={(e) => setFilterStatusDropdown(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        >
          <option value="">Status: use tab above</option>
          <option value="Pending">Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
          <option value="All">All</option>
        </select>
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        />
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setFilterEmployee('');
              setFilterType('');
              setFilterDept('');
              setFilterFrom('');
              setFilterTo('');
              setFilterStatusDropdown('');
            }}
            className="text-sm text-red-500 hover:text-red-700 px-3 py-1.5"
          >
            Clear filters
          </button>
        )}
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
              {filteredLeave.map((l) => (
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
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${leaveTypeBadgeClass(l.leaveType)}`}>
                      {l.leaveType || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{l.startDate ? toDisplayDate(l.startDate) : '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{l.endDate ? toDisplayDate(l.endDate) : '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{l.days ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate" title={l.reason}>
                    {l.reason || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] || 'bg-slate-100'}`}>
                      {l.status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {l.status === 'Pending' && (
                      <span className="flex gap-2">
                        <button
                          type="button"
                          disabled={actioningId === l.id}
                          onClick={() => handleApprove(l)}
                          className="text-green-600 text-xs font-medium hover:underline disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={actioningId === l.id}
                          onClick={() => handleReject(l)}
                          className="text-red-600 text-xs font-medium hover:underline disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredLeave.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                    No leave requests.
                  </td>
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
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowEmpDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setShowEmpDropdown(true);
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:border-blue-400 min-h-[38px]"
                  >
                    {selectedEmployee ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 shrink-0">
                          {selectedEmployee.fullName?.charAt(0)}
                        </div>
                        <span className="text-gray-800 text-sm truncate">{selectedEmployee.fullName}</span>
                        <span className="text-xs text-gray-400 shrink-0">{selectedEmployee.empId}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">Select employee...</span>
                    )}
                    <span className="text-gray-400 text-xs shrink-0">▾</span>
                  </div>
                  {showEmpDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-56 overflow-hidden">
                      <div className="p-2 border-b sticky top-0 bg-white">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search by name or ID..."
                          value={empSearch}
                          onChange={(e) => setEmpSearch(e.target.value)}
                          className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="overflow-y-auto max-h-44">
                        {employees
                          .filter((e) => {
                            if (!empSearch) return true;
                            const q = empSearch.toLowerCase();
                            return (
                              e.fullName?.toLowerCase().includes(q) || (e.empId || '').toLowerCase().includes(q)
                            );
                          })
                          .map((emp) => (
                            <div
                              key={emp.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setSelectedEmployee(emp);
                                setForm((p) => ({ ...p, employeeId: emp.id }));
                                setShowEmpDropdown(false);
                                setEmpSearch('');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setSelectedEmployee(emp);
                                  setForm((p) => ({ ...p, employeeId: emp.id }));
                                  setShowEmpDropdown(false);
                                  setEmpSearch('');
                                }
                              }}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0"
                            >
                              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 shrink-0">
                                {emp.fullName?.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{emp.fullName}</p>
                                <p className="text-xs text-gray-400">
                                  {emp.empId} · {emp.department}
                                </p>
                              </div>
                            </div>
                          ))}
                        {employees.filter((e) => {
                          if (!empSearch) return true;
                          const q = empSearch.toLowerCase();
                          return e.fullName?.toLowerCase().includes(q) || (e.empId || '').toLowerCase().includes(q);
                        }).length === 0 && (
                          <p className="text-center py-4 text-sm text-gray-400">No employees found</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Leave Type</label>
                <select
                  name="leaveType"
                  value={form.leaveType}
                  onChange={(e) => setForm((p) => ({ ...p, leaveType: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                >
                  <option value="">Select leave type</option>
                  {leaveTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    name="startDate"
                    value={form.startDate}
                    onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                  <input
                    type="date"
                    name="endDate"
                    value={form.endDate}
                    onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500">Days (excl. weekends): {days}</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason</label>
                <textarea
                  name="reason"
                  value={form.reason}
                  onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedEmployee(null);
                    setEmpSearch('');
                    setShowEmpDropdown(false);
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                  disabled={saving || !form.employeeId || !form.leaveType}
                >
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
