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
  where,
  increment,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import EmptyState from '../components/EmptyState';
import PageHeader from '../components/PageHeader';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { SkeletonTable } from '../components/SkeletonRow';
import ErrorModal from '../components/ErrorModal';
import EmployeeAvatar from '../components/EmployeeAvatar';
import { toDisplayDate, toJSDate } from '../utils';
import { calculateProRatedAllowance, isMidYearJoinerThisYear } from '../utils/leaveProration';
import { withRetry } from '../utils/firestoreWithRetry';
import { ERROR_MESSAGES, getErrorMessage, logError } from '../utils/errorHandler';
import {
  trackLeaveAdded,
  trackLeaveApproved,
  trackLeaveRejected,
  trackPageView,
} from '../utils/analytics';
import { WhatsAppButton } from '../utils/whatsapp';

function mergeLeaveListsById(a, b) {
  const m = new Map();
  [...a, ...b].forEach((x) => m.set(x.id, x));
  return Array.from(m.values()).sort((x, y) => {
    const ax = toJSDate(x.appliedAt)?.getTime() || 0;
    const ay = toJSDate(y.appliedAt)?.getTime() || 0;
    return ay - ax;
  });
}

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
  const { currentUser, signOut } = useAuth();
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
  const [errorModal, setErrorModal] = useState(null);

  // Clear error modal on re-login
  useEffect(() => {
    if (!currentUser) return undefined;
    const timer = setTimeout(() => {
      setErrorModal(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentUser]);

  const getEmployeeMobile = (empId) => {
    const emp = employees.find((e) => e.id === empId);
    return emp?.mobile || emp?.phone || emp?.mobileNumber || '';
  };

  const handleSmartError = async (error, context, fallback = 'Failed to save. Please try again.') => {
    await logError(error, { companyId, ...context });
    const errType = getErrorMessage(error);
    if (error?._needsReauth || errType === 'auth_expired') return setErrorModal('auth_expired');
    if (errType === 'permission_denied') return setErrorModal('permission_denied');
    if (errType === 'network_error') return setErrorModal('network_error');
    showError(ERROR_MESSAGES[errType]?.message || fallback);
  };

  useEffect(() => {
    trackPageView('Leave');
  }, []);

  const [empSearch, setEmpSearch] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const [leaveFilters, setLeaveFilters] = useState({
    status: '',
    leaveType: '',
    employeeId: '',
    department: '',
    branch: '',
    location: '',
    month: '',
    year: new Date().getFullYear().toString(),
  });
  const [showLeaveFilters, setShowLeaveFilters] = useState(false);

  const [showDownload, setShowDownload] = useState(false);
  const [loadedYears, setLoadedYears] = useState([]);
  const [loadingOlderYear, setLoadingOlderYear] = useState(false);

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
        const calendarYear = new Date().getFullYear();
        const yearStart = Timestamp.fromDate(new Date(calendarYear, 0, 1));
        const yearEnd = Timestamp.fromDate(new Date(calendarYear, 11, 31, 23, 59, 59, 999));
        const leavesQuery = query(
          collection(db, 'companies', companyId, 'leave'),
          where('startDate', '>=', yearStart),
          where('startDate', '<=', yearEnd),
          orderBy('startDate', 'desc'),
        );
        const [companySnap, leaveSnap, empSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId)),
          getDocs(leavesQuery),
          getDocs(collection(db, 'companies', companyId, 'employees')),
        ]);
        if (companySnap.exists()) {
          const data = companySnap.data();
          const types = normalizeLeaveTypesFromCompany(data?.leaveTypes);
          setLeaveTypes(types);
          setLeavePolicy(buildAllowancesMapFromCompany(data, types));
        }
        setLeaveList(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadedYears([calendarYear]);
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

  const branches = useMemo(() => {
    const s = new Set();
    employees.forEach((e) => {
      if (e.branch?.trim()) s.add(e.branch.trim());
    });
    return [...s].sort();
  }, [employees]);

  const locations = useMemo(() => {
    const s = new Set();
    employees.forEach((e) => {
      if (e.location?.trim()) s.add(e.location.trim());
    });
    return [...s].sort();
  }, [employees]);

  const activeEmployeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);

  const activeEmployeeLeaves = useMemo(
    () => leaveList.filter((leave) => activeEmployeeIds.has(leave.employeeId)),
    [leaveList, activeEmployeeIds],
  );

  const filteredLeaves = useMemo(() => {
    const activeIds = activeEmployeeIds;
    const effectiveStatus = leaveFilters.status || (tab === 'All' ? '' : tab);

    return activeEmployeeLeaves.filter((leave) => {
      // Hide deleted employee leaves (defensive; activeEmployeeLeaves already does this)
      if (!activeIds.has(leave.employeeId)) return false;

      if (effectiveStatus && (leave.status || '') !== effectiveStatus) return false;
      if (leaveFilters.leaveType && (leave.leaveType || '') !== leaveFilters.leaveType) return false;
      if (leaveFilters.employeeId && leave.employeeId !== leaveFilters.employeeId) return false;

      if (leaveFilters.department) {
        const emp = employees.find((e) => e.id === leave.employeeId);
        if (!emp || (emp.department || '').trim() !== leaveFilters.department) return false;
      }

      if (leaveFilters.branch) {
        const emp = employees.find((e) => e.id === leave.employeeId);
        if (!emp || (emp.branch || '').trim() !== leaveFilters.branch) return false;
      }

      if (leaveFilters.location) {
        const emp = employees.find((e) => e.id === leave.employeeId);
        if (!emp || (emp.location || '').trim() !== leaveFilters.location) return false;
      }

      if (leaveFilters.month || leaveFilters.year) {
        const start = toJSDate(leave.startDate);
        if (!start) return false;
        if (leaveFilters.month && start.getMonth() + 1 !== Number(leaveFilters.month)) return false;
        if (leaveFilters.year && start.getFullYear() !== Number(leaveFilters.year)) return false;
      }

      return true;
    });
  }, [activeEmployeeLeaves, activeEmployeeIds, leaveFilters, employees, tab]);

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
    const approved = activeEmployeeLeaves.filter((l) => l.status === 'Approved');
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
  }, [activeEmployeeLeaves, employees, paidLeaveTypes]);

  const loadPreviousCalendarYear = async () => {
    if (!companyId || loadedYears.length === 0) return;
    const y = Math.min(...loadedYears) - 1;
    if (y < 2000) return;
    setLoadingOlderYear(true);
    try {
      const yearStart = Timestamp.fromDate(new Date(y, 0, 1));
      const yearEnd = Timestamp.fromDate(new Date(y, 11, 31, 23, 59, 59, 999));
      const q = query(
        collection(db, 'companies', companyId, 'leave'),
        where('startDate', '>=', yearStart),
        where('startDate', '<=', yearEnd),
        orderBy('startDate', 'desc'),
      );
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLeaveList((prev) => mergeLeaveListsById(prev, rows));
      setLoadedYears((prev) => [...prev, y]);
    } catch {
      showError('Failed to load older leave records');
    }
    setLoadingOlderYear(false);
  };

  const downloadLeaveReport = async (format) => {
    const [xlsxMod, { saveAs }] = await Promise.all([
      import('xlsx'),
      import('file-saver'),
    ]);
    const XLSX = xlsxMod.default || xlsxMod;
    if (!XLSX?.utils) {
      showError('Excel library failed to load. Please refresh and try again.');
      return;
    }
    const rows = filteredLeaves.map((l) => ({
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
      await withRetry(() => updateDoc(doc(db, 'companies', companyId, 'leave', leaveDoc.id), {
        status: 'Approved',
        decidedAt: serverTimestamp(),
      }), { companyId, action: 'approveLeave' });
      const empRef = doc(db, 'companies', companyId, 'employees', leaveDoc.employeeId);
      const code = incrementKeyForLeaveType(leaveDoc.leaveType, leaveTypes);
      const key = `leaveUsed.${code}`;
      await withRetry(() => updateDoc(empRef, { [key]: increment(leaveDoc.days || 0) }), { companyId, action: 'approveLeaveBalanceUpdate' });
      setLeaveList((prev) => prev.map((l) => (l.id === leaveDoc.id ? { ...l, status: 'Approved' } : l)));
      trackLeaveApproved();
      success('Leave approved');
    } catch (error) {
      await handleSmartError(error, { action: 'approveLeave', leaveId: leaveDoc.id }, 'Failed to approve');
    }
    setActioningId(null);
  };

  const handleReject = async (leaveDoc) => {
    setActioningId(leaveDoc.id);
    try {
      await withRetry(() => updateDoc(doc(db, 'companies', companyId, 'leave', leaveDoc.id), {
        status: 'Rejected',
        decidedAt: serverTimestamp(),
      }), { companyId, action: 'rejectLeave' });
      setLeaveList((prev) => prev.map((l) => (l.id === leaveDoc.id ? { ...l, status: 'Rejected' } : l)));
      trackLeaveRejected();
      success('Leave rejected');
    } catch (error) {
      await handleSmartError(error, { action: 'rejectLeave', leaveId: leaveDoc.id }, 'Failed to reject');
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
      await withRetry(() => addDoc(collection(db, 'companies', companyId, 'leave'), {
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
      }), { companyId, action: 'addLeave' });
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
      trackLeaveAdded(form.leaveType);
      success('Leave added');
    } catch (error) {
      await handleSmartError(error, { action: 'addLeave', employeeId: form.employeeId }, 'Failed to add leave');
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

  const currentYearStr = new Date().getFullYear().toString();
  const activeLeaveFiltersCount = Object.entries(leaveFilters).filter(
    ([k, v]) => v && !(k === 'year' && v === currentYearStr),
  ).length;
  const hasActiveLeaveFilters = activeLeaveFiltersCount > 0;

  return (
    <div>
      <div className="mb-6">
        <PageHeader
          title="Leave"
          subtitle="Manage and approve team leave requests"
          actions={
            <>
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
                  <div
                    className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-40"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
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
            </>
          }
        />
      </div>
      {hasActiveLeaveFilters && (
        <p className="text-xs text-amber-600 mb-3">
          ⚠️ Download will include only filtered results ({filteredLeaves.length} records)
        </p>
      )}

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
                  const policyMax = getAllowanceForType(lt, leavePolicy);
                  return (
                    <th key={lt.shortCode} className="px-4 py-2 text-left font-medium text-slate-600 whitespace-nowrap">
                      {lt.shortCode}
                      <span className="block text-xs font-normal text-gray-400">max {policyMax}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Object.entries(leaveBalance).map(([empId, row]) => {
                const emp = employeeMap[empId];
                const showJoinStar = emp && isMidYearJoinerThisYear(emp.joiningDate);
                return (
                  <tr key={empId} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {row.name}
                      {showJoinStar && (
                        <span className="text-xs text-amber-500 ml-1" title="Pro-rated for joining date">
                          *
                        </span>
                      )}
                    </td>
                    {paidLeaveTypes.map((lt) => {
                      const used = row[lt.shortCode] ?? 0;
                      const base = getAllowanceForType(lt, leavePolicy);
                      const allowed = calculateProRatedAllowance(base, emp?.joiningDate);
                      return (
                        <td key={lt.shortCode} className="px-4 py-2 whitespace-nowrap">
                          <span className={used > allowed ? 'text-red-600' : 'text-gray-800'}>{used}</span>
                          <span className="text-gray-400">/{allowed}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {Object.keys(leaveBalance).length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={paidLeaveTypes.length + 1}>
                    No employees
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 px-4 py-2 border-t border-slate-100">* Pro-rated based on joining date (calendar year).</p>
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
              }}
              className={`rounded-lg min-h-[44px] px-3 py-2 text-sm font-medium flex-shrink-0 active:opacity-90 ${
                tab === t ? 'bg-[#1B6B6B] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <button
          onClick={() => setShowLeaveFilters((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 min-h-[44px] border rounded-xl text-sm flex-wrap ${
            showLeaveFilters || hasActiveLeaveFilters
              ? 'border-[#1B6B6B] text-[#1B6B6B] bg-[#E8F5F5]'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          ⚙️ Filters
          {hasActiveLeaveFilters && (
            <span className="bg-[#1B6B6B] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
              {activeLeaveFiltersCount}
            </span>
          )}
        </button>

        {showLeaveFilters && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold text-gray-700">Filter Leave</h3>
              <button
                onClick={() =>
                  setLeaveFilters({
                    status: '',
                    leaveType: '',
                    employeeId: '',
                    department: '',
                    branch: '',
                    location: '',
                    month: '',
                    year: currentYearStr,
                  })
                }
                className="text-xs text-[#1B6B6B] hover:underline"
              >
                Clear all
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Status */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Status</label>
                <select
                  value={leaveFilters.status}
                  onChange={(e) => setLeaveFilters((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              {/* Leave Type */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Leave Type</label>
                <select
                  value={leaveFilters.leaveType}
                  onChange={(e) => setLeaveFilters((prev) => ({ ...prev, leaveType: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Types</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id || lt.name} value={lt.name}>
                      {lt.name} ({lt.shortCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Employee */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Employee</label>
                <select
                  value={leaveFilters.employeeId}
                  onChange={(e) => setLeaveFilters((prev) => ({ ...prev, employeeId: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Employees</option>
                  {employees
                    .filter((e) => (e.status || 'Active') !== 'Inactive')
                    .sort((a, b) => a.fullName.localeCompare(b.fullName))
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName}
                      </option>
                    ))}
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Department</label>
                <select
                  value={leaveFilters.department}
                  onChange={(e) => setLeaveFilters((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Branch</label>
                <select
                  value={leaveFilters.branch}
                  onChange={(e) => setLeaveFilters((prev) => ({ ...prev, branch: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Location</label>
                <select
                  value={leaveFilters.location}
                  onChange={(e) => setLeaveFilters((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Locations</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              {/* Month */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Month</label>
                <select
                  value={leaveFilters.month}
                  onChange={(e) => setLeaveFilters((prev) => ({ ...prev, month: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Months</option>
                  {[
                    'January',
                    'February',
                    'March',
                    'April',
                    'May',
                    'June',
                    'July',
                    'August',
                    'September',
                    'October',
                    'November',
                    'December',
                  ].map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Year</label>
                <select
                  value={leaveFilters.year}
                  onChange={(e) => setLeaveFilters((prev) => ({ ...prev, year: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Years</option>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {Object.values(leaveFilters).some((v) => v && v !== currentYearStr) && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-[#1B6B6B]">
                  {Object.values(leaveFilters).filter((v) => v && v !== currentYearStr).length} filter
                  {Object.values(leaveFilters).filter((v) => v && v !== currentYearStr).length !== 1 ? 's' : ''} active
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={8} />
      ) : (
        <>
          <div className="hidden lg:block overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-[600px] w-full text-sm">
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
                {filteredLeaves.map((l) => (
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
                        <div className="flex items-center gap-2 flex-wrap">
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
                          <WhatsAppButton
                            phone={l.employeeMobile || getEmployeeMobile(l.employeeId)}
                            message={
                              `Dear ${l.employeeName} Garu,\n\n` +
                              `Your leave request from ${l.startDate ? toDisplayDate(l.startDate) : '—'} to ` +
                              `${l.endDate ? toDisplayDate(l.endDate) : '—'} ` +
                              `(${l.days ?? 1} day${(l.days ?? 1) !== 1 ? 's' : ''}) is pending review.\n\n` +
                              `Thank you,\nAttendX HR`
                            }
                            size="xs"
                          />
                        </div>
                      )}
                      {(l.status === 'Approved' || l.status === 'Rejected') && (
                        <WhatsAppButton
                          phone={l.employeeMobile || getEmployeeMobile(l.employeeId)}
                          message={
                            `Dear ${l.employeeName} Garu,\n\n` +
                            `Your leave request from ${l.startDate ? toDisplayDate(l.startDate) : '—'} to ` +
                            `${l.endDate ? toDisplayDate(l.endDate) : '—'} ` +
                            `(${l.days ?? 1} day${(l.days ?? 1) !== 1 ? 's' : ''}) ` +
                            `has been *${l.status}*.\n\n` +
                            (l.status === 'Rejected' && l.rejectReason
                              ? `Reason: ${l.rejectReason}\n\n`
                              : '') +
                            `Thank you,\nAttendX HR`
                          }
                          size="xs"
                        />
                      )}
                    </td>
                  </tr>
                ))}
                {filteredLeaves.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <EmptyState
                        illustration={
                          <div className="w-16 h-16 rounded-2xl bg-[#FAEEDA] flex items-center justify-center">
                            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                              <rect x="4" y="6" width="28" height="24" rx="4" fill="#FAC775" />
                              <path d="M4 14h28" stroke="#854F0B" strokeWidth="1.5" />
                              <path d="M11 6V4M25 6V4" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" />
                              <circle cx="25" cy="25" r="6" fill="#EF9F27" />
                              <path d="M23 25h4M25 23v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </div>
                        }
                        title={hasActiveLeaveFilters ? 'No matching leave requests' : 'No leave requests yet'}
                        description={
                          hasActiveLeaveFilters
                            ? 'Try adjusting your filters to see more results.'
                            : 'Leave requests from your team will appear here once submitted.'
                        }
                        action={
                          hasActiveLeaveFilters
                            ? () =>
                                setLeaveFilters({
                                  status: '',
                                  leaveType: '',
                                  employeeId: '',
                                  department: '',
                                  branch: '',
                                  location: '',
                                  month: '',
                                  year: currentYearStr,
                                })
                            : () => setShowAddModal(true)
                        }
                        actionLabel={hasActiveLeaveFilters ? 'Clear filters' : 'Add leave request'}
                        actionColor={hasActiveLeaveFilters ? '#5F5E5A' : '#854F0B'}
                        hint={!hasActiveLeaveFilters ? 'approvals will show here too' : undefined}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-3">
            {filteredLeaves.map((leave) => (
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
                  <div className="flex flex-col gap-2 mt-3">
                    <div className="flex gap-2">
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
                    <WhatsAppButton
                      phone={leave.employeeMobile || getEmployeeMobile(leave.employeeId)}
                      message={
                        `Dear ${leave.employeeName} Garu,\n\n` +
                        `Your leave request from ${leave.startDate ? toDisplayDate(leave.startDate) : '—'} to ` +
                        `${leave.endDate ? toDisplayDate(leave.endDate) : '—'} ` +
                        `(${leave.days ?? 1} day${(leave.days ?? 1) !== 1 ? 's' : ''}) is pending review.\n\n` +
                        `Thank you,\nAttendX HR`
                      }
                      size="xs"
                      className="w-full justify-center"
                    />
                  </div>
                )}
                {(leave.status === 'Approved' || leave.status === 'Rejected') && (
                  <div className="mt-3">
                    <WhatsAppButton
                      phone={leave.employeeMobile || getEmployeeMobile(leave.employeeId)}
                      message={
                        `Dear ${leave.employeeName} Garu,\n\n` +
                        `Your leave request from ${leave.startDate ? toDisplayDate(leave.startDate) : '—'} to ` +
                        `${leave.endDate ? toDisplayDate(leave.endDate) : '—'} ` +
                        `(${leave.days ?? 1} day${(leave.days ?? 1) !== 1 ? 's' : ''}) ` +
                        `has been *${leave.status}*.\n\n` +
                        (leave.status === 'Rejected' && leave.rejectReason
                          ? `Reason: ${leave.rejectReason}\n\n`
                          : '') +
                        `Thank you,\nAttendX HR`
                      }
                      size="xs"
                      className="w-full justify-center"
                    />
                  </div>
                )}
              </div>
            ))}
            {filteredLeaves.length === 0 && (
              <EmptyState
                illustration={
                  <div className="w-16 h-16 rounded-2xl bg-[#FAEEDA] flex items-center justify-center">
                    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                      <rect x="4" y="6" width="28" height="24" rx="4" fill="#FAC775" />
                      <path d="M4 14h28" stroke="#854F0B" strokeWidth="1.5" />
                      <path d="M11 6V4M25 6V4" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="25" cy="25" r="6" fill="#EF9F27" />
                      <path d="M23 25h4M25 23v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                }
                title={hasActiveLeaveFilters ? 'No matching leave requests' : 'No leave requests yet'}
                description={
                  hasActiveLeaveFilters
                    ? 'Try adjusting your filters to see more results.'
                    : 'Leave requests from your team will appear here once submitted.'
                }
                action={
                  hasActiveLeaveFilters
                    ? () =>
                        setLeaveFilters({
                          status: '',
                          leaveType: '',
                          employeeId: '',
                          department: '',
                          branch: '',
                          location: '',
                          month: '',
                          year: currentYearStr,
                        })
                    : () => setShowAddModal(true)
                }
                actionLabel={hasActiveLeaveFilters ? 'Clear filters' : 'Add leave request'}
                actionColor={hasActiveLeaveFilters ? '#5F5E5A' : '#854F0B'}
                hint={!hasActiveLeaveFilters ? 'approvals will show here too' : undefined}
              />
            )}
            {loadedYears.length > 0 && Math.min(...loadedYears) > 2000 && (
              <button
                type="button"
                onClick={loadPreviousCalendarYear}
                disabled={loadingOlderYear}
                className="w-full py-3 text-sm text-gray-400 hover:text-[#1B6B6B] border-t border-gray-100 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingOlderYear ? 'Loading…' : `Load ${Math.min(...loadedYears) - 1} records →`}
              </button>
            )}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
