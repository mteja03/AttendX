import { useEffect, useMemo, useRef, useState } from 'react';
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
import PageLoader from '../components/PageLoader';
import EmployeeAvatar from '../components/EmployeeAvatar';
import { toDisplayDate, toJSDate } from '../utils';

const DEFAULT_LEAVE_TYPE_OBJECTS = [
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

function abbrevLeaveTypeName(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

function normalizeLeaveTypesFromCompany(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_LEAVE_TYPE_OBJECTS.map((t) => ({ ...t }));
  }
  return raw.map((t) => {
    if (typeof t === 'string') {
      const name = t.trim();
      return { name, shortCode: abbrevLeaveTypeName(name), isPaid: true };
    }
    const name = (t.name || '').trim() || 'Leave';
    const shortCode = (t.shortCode || abbrevLeaveTypeName(name)).toUpperCase().slice(0, 8);
    return { name, shortCode, isPaid: t.isPaid !== false };
  });
}

function buildAllowancesMapFromCompany(data, normalizedTypes) {
  const lp = data?.leavePolicy || {};
  const out = {};
  normalizedTypes.filter((lt) => lt.isPaid).forEach((lt) => {
    let n =
      lp[lt.shortCode] ??
      lp[lt.name] ??
      (lt.shortCode === 'CL' ? lp.cl : lt.shortCode === 'SL' ? lp.sl : lt.shortCode === 'EL' ? lp.el : undefined);
    if (n === undefined || Number.isNaN(Number(n))) n = lt.shortCode === 'EL' ? 15 : 12;
    out[lt.shortCode] = Number(n);
  });
  return out;
}

function leaveRecordMatchesType(l, lt) {
  const t = (l.leaveType || '').trim();
  if (t === lt.name || t === lt.shortCode) return true;
  if (lt.shortCode === 'CL' && t === 'CL') return true;
  if (lt.shortCode === 'SL' && t === 'SL') return true;
  if (lt.shortCode === 'EL' && t === 'EL') return true;
  return false;
}

function getAllowanceForType(lt, leavePolicyMap) {
  const lp = leavePolicyMap || {};
  let n = lp[lt.shortCode] ?? lp[lt.name];
  if (n === undefined) {
    if (lt.shortCode === 'CL') n = lp.cl;
    else if (lt.shortCode === 'SL') n = lp.sl;
    else if (lt.shortCode === 'EL') n = lp.el;
  }
  if (n === undefined || Number.isNaN(Number(n))) n = 0;
  return Number(n);
}

function incrementKeyForLeaveType(leaveTypeRaw, leaveTypesArr) {
  const r = (leaveTypeRaw || '').trim();
  const lt = leaveTypesArr.find((x) => x.name === r || x.shortCode === r);
  return lt?.shortCode || r || 'CL';
}

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

const TYPE_STYLE = {
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
const STATUS_STYLE = { Pending: 'bg-amber-100 text-amber-800', Approved: 'bg-green-100 text-green-800', Rejected: 'bg-red-100 text-red-800' };

function leaveTypeBadgeClass(raw, leaveTypesArr) {
  const r = (raw || '').trim();
  const lt = leaveTypesArr.find((x) => x.name === r || x.shortCode === r);
  const code = lt?.shortCode || r;
  return TYPE_STYLE[code] || 'bg-slate-100 text-slate-700';
}

export default function Leave() {
  const { companyId } = useParams();
  const { success, error: showError } = useToast();
  const [leaveList, setLeaveList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leavePolicy, setLeavePolicy] = useState({ CL: 12, SL: 12, EL: 15 });
  const [leaveTypes, setLeaveTypes] = useState(DEFAULT_LEAVE_TYPE_OBJECTS);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Pending');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBalance, setShowBalance] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    employeeName: '',
    empId: '',
    department: '',
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

  const empDropdownRef = useRef(null);

  useEffect(() => {
    const handleClick = (ev) => {
      if (empDropdownRef.current?.contains(ev.target)) return;
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
          const types = normalizeLeaveTypesFromCompany(data?.leaveTypes);
          setLeaveTypes(types);
          setLeavePolicy(buildAllowancesMapFromCompany(data, types));
        }
        setLeaveList(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => (e.status || 'Active') !== 'Inactive'));
      } catch {
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

  const leaveEligibleEmployees = useMemo(
    () => employees.filter((emp) => emp.status !== 'Inactive'),
    [employees],
  );

  const filteredEmployeesForLeaveModal = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return leaveEligibleEmployees;
    return leaveEligibleEmployees.filter(
      (e) => e.fullName?.toLowerCase().includes(q) || (e.empId || '').toLowerCase().includes(q),
    );
  }, [leaveEligibleEmployees, empSearch]);

  const handleSelectLeaveEmployee = (emp) => {
    setForm((prev) => ({
      ...prev,
      employeeId: emp.id,
      employeeName: emp.fullName || '',
      empId: emp.empId || '',
      department: emp.department || '',
    }));
    setSelectedEmployee(emp);
    setEmpSearch('');
    setShowEmpDropdown(false);
  };

  const days = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    return getDaysBetween(form.startDate, form.endDate);
  }, [form.startDate, form.endDate]);

  const paidLeaveTypes = useMemo(() => leaveTypes.filter((lt) => lt.isPaid), [leaveTypes]);

  const leaveBalance = useMemo(() => {
    const approved = leaveList.filter((l) => l.status === 'Approved');
    const byEmployee = {};

    const ensureRow = (id, name) => {
      if (!byEmployee[id]) {
        const row = { name: name || '—' };
        paidLeaveTypes.forEach((lt) => {
          row[lt.shortCode] = 0;
        });
        byEmployee[id] = row;
      }
    };

    employees.forEach((e) => ensureRow(e.id, e.fullName));

    approved.forEach((l) => {
      ensureRow(l.employeeId, l.employeeName);
      paidLeaveTypes.forEach((lt) => {
        if (leaveRecordMatchesType(l, lt)) {
          byEmployee[l.employeeId][lt.shortCode] += l.days || 0;
        }
      });
    });

    return byEmployee;
  }, [leaveList, employees, paidLeaveTypes]);

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
      const code = incrementKeyForLeaveType(leaveDoc.leaveType, leaveTypes);
      const key = `leaveUsed.${code}`;
      await updateDoc(empRef, { [key]: increment(leaveDoc.days || 0) });
      setLeaveList((prev) => prev.map((l) => (l.id === leaveDoc.id ? { ...l, status: 'Approved' } : l)));
      success('Leave approved');
    } catch {
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
    } catch {
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
        empId: emp.empId || '',
        employeePhotoURL: emp.photoURL || null,
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
          id: `leave_${Date.now()}`,
          employeeId: form.employeeId,
          employeeName: emp.fullName,
          empId: emp.empId || '',
          employeePhotoURL: emp.photoURL || null,
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
      setForm({
        employeeId: '',
        employeeName: '',
        empId: '',
        department: '',
        leaveType: '',
        startDate: '',
        endDate: '',
        reason: '',
      });
      setSelectedEmployee(null);
      setEmpSearch('');
      setShowEmpDropdown(false);
      success('Leave added');
    } catch {
      showError('Failed to add leave');
    }
    setSaving(false);
  };

  const openAddModal = () => {
    setSelectedEmployee(null);
    setEmpSearch('');
    setShowEmpDropdown(false);
    setForm({
      employeeId: '',
      employeeName: '',
      empId: '',
      department: '',
      leaveType: leaveTypes[0]?.name || '',
      startDate: '',
      endDate: '',
      reason: '',
    });
    setShowAddModal(true);
  };

  if (!companyId) return null;

  const filtersActive = !!(filterEmployee || filterType || filterDept || filterFrom || filterTo || filterStatusDropdown);

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Leave</h1>
          <p className="text-sm text-gray-500 mt-1">Leave requests and balance</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setShowDownload((v) => !v)}
              className="flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 active:bg-gray-100"
            >
              Download ▾
            </button>
            {showDownload && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-40" onMouseDown={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => downloadLeaveReport('csv')}
                  className="block w-full text-left min-h-[44px] px-4 py-2.5 text-sm hover:bg-gray-50 active:bg-gray-100"
                >
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => downloadLeaveReport('excel')}
                  className="block w-full text-left min-h-[44px] px-4 py-2.5 text-sm hover:bg-gray-50 active:bg-gray-100 border-t border-gray-100"
                >
                  Download Excel
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center min-h-[44px] rounded-lg bg-[#1B6B6B] hover:bg-[#155858] active:bg-[#0f4444] text-white text-sm font-medium px-4 py-2"
          >
            Add Leave
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowBalance(!showBalance)}
        className="mb-4 min-h-[44px] text-sm font-medium text-slate-600 hover:text-slate-800 active:text-slate-900 px-1 rounded-lg"
      >
        {showBalance ? '▼' : '▶'} Leave Balance
      </button>
      {showBalance && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto mb-6">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-600">Employee</th>
                {paidLeaveTypes.map((lt) => {
                  const allowed = getAllowanceForType(lt, leavePolicy);
                  return (
                    <th key={lt.shortCode} className="px-4 py-2 text-left font-medium text-slate-600 whitespace-nowrap">
                      {lt.shortCode}
                      <span className="block text-xs font-normal text-gray-400">/{allowed}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Object.entries(leaveBalance).map(([empId, row]) => (
                <tr key={empId} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                  {paidLeaveTypes.map((lt) => {
                    const used = row[lt.shortCode] ?? 0;
                    const allowed = getAllowanceForType(lt, leavePolicy);
                    return (
                      <td key={lt.shortCode} className="px-4 py-2 whitespace-nowrap">
                        <span className={used > allowed ? 'text-red-600' : 'text-gray-800'}>{used}</span>
                        <span className="text-gray-400">/{allowed}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {Object.keys(leaveBalance).length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={paidLeaveTypes.length + 1}>
                    No employees
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0 mb-4">
        <div className="flex gap-2 min-w-max pb-1">
          {['Pending', 'Approved', 'Rejected', 'All'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setFilterStatusDropdown('');
              }}
              className={`rounded-lg min-h-[44px] px-3 py-2 text-sm font-medium flex-shrink-0 active:opacity-90 ${
                tab === t && !filterStatusDropdown ? 'bg-[#1B6B6B] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0 mb-4">
        <div className="flex gap-2 min-w-max p-3 bg-gray-50 rounded-xl border border-gray-200">
          <input
            placeholder="Search employee..."
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] w-44 flex-shrink-0"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] flex-shrink-0"
          >
            <option value="">All leave types</option>
            {leaveTypes.map((lt) => (
              <option key={lt.name} value={lt.name}>
                {lt.name} ({lt.shortCode})
                {!lt.isPaid ? ' — Unpaid' : ''}
              </option>
            ))}
          </select>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] flex-shrink-0"
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
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] flex-shrink-0"
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
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] flex-shrink-0"
          />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] flex-shrink-0"
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
              className="text-sm text-red-500 hover:text-red-700 active:text-red-800 px-3 py-2 min-h-[44px] flex-shrink-0 rounded-lg"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <>
          <div className="hidden lg:block overflow-x-auto border border-slate-200 rounded-xl bg-white">
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
                      <div className="flex items-center gap-2.5">
                        <EmployeeAvatar
                          employee={{
                            fullName: l.employeeName,
                            photoURL:
                              l.employeePhotoURL ?? employees.find((e) => e.id === l.employeeId)?.photoURL,
                          }}
                          size="sm"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{l.employeeName || '—'}</p>
                          <p className="text-xs text-gray-400">
                            {l.empId || employees.find((e) => e.id === l.employeeId)?.empId || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${leaveTypeBadgeClass(l.leaveType, leaveTypes)}`}>
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

          <div className="lg:hidden space-y-3">
            {filteredLeave.map((leave) => (
              <div key={leave.id} className="bg-white border border-gray-100 rounded-2xl p-4 mb-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <EmployeeAvatar
                      employee={{
                        fullName: leave.employeeName,
                        photoURL:
                          leave.employeePhotoURL ?? employees.find((e) => e.id === leave.employeeId)?.photoURL,
                      }}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{leave.employeeName || '—'}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {leave.empId || employees.find((e) => e.id === leave.employeeId)?.empId || '—'} ·{' '}
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${leaveTypeBadgeClass(leave.leaveType, leaveTypes)}`}>
                          {leave.leaveType || '—'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_STYLE[leave.status] || 'bg-slate-100 text-slate-600'}`}>
                    {leave.status || '—'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {leave.startDate ? toDisplayDate(leave.startDate) : '—'} → {leave.endDate ? toDisplayDate(leave.endDate) : '—'}
                  </span>
                  <span className="font-medium text-slate-700">{leave.days ?? '—'} day(s)</span>
                </div>

                {leave.reason && (
                  <p className="text-xs text-gray-400 mt-2 truncate" title={leave.reason}>
                    {leave.reason}
                  </p>
                )}

                {leave.status === 'Pending' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      disabled={actioningId === leave.id}
                      onClick={() => handleApprove(leave)}
                      className="flex-1 min-h-[44px] py-2 bg-green-600 text-white rounded-xl text-xs font-medium hover:bg-green-700 active:bg-green-800 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={actioningId === leave.id}
                      onClick={() => handleReject(leave)}
                      className="flex-1 min-h-[44px] py-2 bg-red-100 text-red-600 rounded-xl text-xs font-medium hover:bg-red-200 active:bg-red-300 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
            {filteredLeave.length === 0 && <p className="text-center text-slate-500 py-8 text-sm">No leave requests.</p>}
          </div>
        </>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Leave</h2>
            <form onSubmit={handleAddLeave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
                <div ref={empDropdownRef} className="relative" onClick={(e) => e.stopPropagation()}>
                  {selectedEmployee ? (
                    <div className="flex items-center gap-3 p-3 bg-[#E8F5F5] rounded-xl border border-[#4ECDC4]">
                      <EmployeeAvatar employee={selectedEmployee} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1B6B6B] truncate">{selectedEmployee.fullName}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {selectedEmployee.empId} · {selectedEmployee.department || '—'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEmployee(null);
                          setForm((prev) => ({
                            ...prev,
                            employeeId: '',
                            employeeName: '',
                            empId: '',
                            department: '',
                          }));
                        }}
                        className="text-gray-400 hover:text-gray-600 text-sm flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowEmpDropdown(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setShowEmpDropdown(true);
                        }}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:border-[#4ECDC4] min-h-[38px]"
                      >
                        <span className="text-gray-400">Select employee...</span>
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
                              className="w-full text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-[#4ECDC4]"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="overflow-y-auto max-h-44">
                            {filteredEmployeesForLeaveModal.map((emp) => (
                              <div
                                key={emp.id}
                                role="button"
                                tabIndex={0}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectLeaveEmployee(emp);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSelectLeaveEmployee(emp);
                                }}
                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer border-b border-gray-100 last:border-0"
                              >
                                <EmployeeAvatar employee={emp} size="sm" />
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate">{emp.fullName}</p>
                                  <p className="text-xs text-gray-400">
                                    {emp.empId} · {emp.department || '—'}
                                  </p>
                                </div>
                              </div>
                            ))}
                            {filteredEmployeesForLeaveModal.length === 0 && (
                              <p className="text-center py-4 text-sm text-gray-400">No employees found</p>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Leave Type</label>
                <select
                  name="leaveType"
                  value={form.leaveType}
                  onChange={(e) => setForm((p) => ({ ...p, leaveType: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                >
                  <option value="">Select leave type</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.name} value={lt.name}>
                      {lt.name} ({lt.shortCode})
                      {!lt.isPaid ? ' — Unpaid' : ''}
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
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
                    setForm({
                      employeeId: '',
                      employeeName: '',
                      empId: '',
                      department: '',
                      leaveType: '',
                      startDate: '',
                      endDate: '',
                      reason: '',
                    });
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
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
