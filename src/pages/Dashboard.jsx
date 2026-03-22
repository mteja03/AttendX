import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import StatCard from '../components/StatCard';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { toDateString, toDisplayDate, toJSDate } from '../utils';

const EMPTY_ASSET_STATS = {
  total: 0,
  assigned: 0,
  available: 0,
  damaged: 0,
  consumableIssued: 0,
};

function enrichOnboarding(emp) {
  const tasks = Array.isArray(emp.onboarding?.tasks) ? emp.onboarding.tasks : [];
  const done = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : emp.onboarding?.completionPct || 0;
  return { ...emp, _onboardingDone: done, _onboardingTotal: total, _onboardingPct: pct };
}

function enrichOffboarding(emp) {
  const tasks = Array.isArray(emp.offboarding?.tasks) ? emp.offboarding.tasks : [];
  const done = tasks.filter((t) => t.completed).length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : emp.offboarding?.completionPct || 0;
  return { ...emp, _offDone: done, _offTotal: total, _offPct: pct };
}

function isFailedPrecondition(err) {
  return err?.code === 'failed-precondition' || String(err?.message || '').toLowerCase().includes('index');
}

function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function UserAddIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
    </svg>
  );
}
const LEAVE_TYPE_STYLE = {
  SL: 'bg-red-100 text-red-700',
  CL: 'bg-[#E8F5F5] text-[#1B6B6B]',
  EL: 'bg-green-100 text-green-700',
  ML: 'bg-purple-100 text-purple-700',
  UL: 'bg-gray-100 text-gray-700',
};
const STATUS_STYLE = {
  Pending: 'bg-amber-100 text-amber-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
};

export default function Dashboard() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { success, error: showError } = useToast();
  const [employees, setEmployees] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [onboardingEmployees, setOnboardingEmployees] = useState([]);
  const [offboardingEmployees, setOffboardingEmployees] = useState([]);
  const [assetStats, setAssetStats] = useState(EMPTY_ASSET_STATS);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [leaveLoaded, setLeaveLoaded] = useState(false);
  const [actioningId, setActioningId] = useState(null);
  const [birthdayCardOpen, setBirthdayCardOpen] = useState(true);

  const showAssetOverview = role === 'admin' || role === 'hrmanager' || role === 'itmanager';

  const fetchEmployees = useCallback(async () => {
    if (!companyId) return;
    try {
      let snap;
      try {
        snap = await getDocs(query(collection(db, 'companies', companyId, 'employees'), orderBy('createdAt', 'desc')));
      } catch (e) {
        if (isFailedPrecondition(e)) {
          snap = await getDocs(collection(db, 'companies', companyId, 'employees'));
        } else {
          throw e;
        }
      }
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds ?? 0;
        return tb - ta;
      });
      setEmployees(rows);
    } catch (e) {
      console.error('Employees fetch:', e);
      setEmployees([]);
    } finally {
      setEmployeesLoaded(true);
    }
  }, [companyId]);

  const fetchLeave = useCallback(async () => {
    if (!companyId) return;
    try {
      let snap;
      try {
        snap = await getDocs(query(collection(db, 'companies', companyId, 'leave'), orderBy('appliedAt', 'desc')));
      } catch (e) {
        if (isFailedPrecondition(e)) {
          snap = await getDocs(collection(db, 'companies', companyId, 'leave'));
        } else {
          throw e;
        }
      }
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = a.appliedAt?.toMillis?.() ?? a.appliedAt?.seconds ?? 0;
        const tb = b.appliedAt?.toMillis?.() ?? b.appliedAt?.seconds ?? 0;
        return tb - ta;
      });
      setLeaveList(rows);
    } catch (e) {
      console.error('Leave fetch:', e);
      setLeaveList([]);
    } finally {
      setLeaveLoaded(true);
    }
  }, [companyId]);

  const fetchAssets = useCallback(async () => {
    if (!companyId) return;
    try {
      const snap = await getDocs(collection(db, 'companies', companyId, 'assets'));
      const assetData = snap.docs.map((d) => d.data());
      const trackable = assetData.filter((a) => (a.mode || 'trackable') === 'trackable');
      const consumable = assetData.filter((a) => (a.mode || 'trackable') === 'consumable');

      setAssetStats({
        total: assetData.length,
        assigned: trackable.filter((a) => a.status === 'Assigned').length,
        available: trackable.filter((a) => a.status === 'Available').length,
        damaged: trackable.filter((a) => a.status === 'Damaged' || a.status === 'Lost').length,
        consumableIssued: consumable.reduce((sum, a) => sum + (Number(a.issuedCount) || 0), 0),
      });
    } catch (e) {
      console.error('Assets fetch:', e);
      setAssetStats({ ...EMPTY_ASSET_STATS });
    }
  }, [companyId]);

  const fetchOnboarding = useCallback(async () => {
    if (!companyId) return;
    const mapAndSort = (rows) =>
      rows
        .map(enrichOnboarding)
        .sort((a, b) => (b._onboardingPct || 0) - (a._onboardingPct || 0))
        .slice(0, 6);

    try {
      const snap = await getDocs(
        query(collection(db, 'companies', companyId, 'employees'), where('onboarding.status', '==', 'in_progress')),
      );
      setOnboardingEmployees(mapAndSort(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    } catch (e) {
      if (isFailedPrecondition(e)) {
        try {
          const snap = await getDocs(collection(db, 'companies', companyId, 'employees'));
          const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const filtered = all.filter((emp) => emp.onboarding?.status === 'in_progress');
          setOnboardingEmployees(mapAndSort(filtered));
        } catch (e2) {
          console.error('Onboarding fallback:', e2);
          setOnboardingEmployees([]);
        }
      } else {
        console.error('Onboarding fetch:', e);
        setOnboardingEmployees([]);
      }
    }
  }, [companyId]);

  const fetchOffboarding = useCallback(async () => {
    if (!companyId) return;
    const mapAndSort = (rows) =>
      rows
        .map(enrichOffboarding)
        .sort((a, b) => {
          const aExit = toJSDate(a.offboarding?.exitDate);
          const bExit = toJSDate(b.offboarding?.exitDate);
          if (aExit && bExit) return aExit - bExit;
          if (aExit) return -1;
          if (bExit) return 1;
          return (b._offPct || 0) - (a._offPct || 0);
        })
        .slice(0, 6);

    try {
      const snap = await getDocs(
        query(collection(db, 'companies', companyId, 'employees'), where('offboarding.status', '==', 'in_progress')),
      );
      setOffboardingEmployees(mapAndSort(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    } catch (e) {
      if (isFailedPrecondition(e)) {
        try {
          const snap = await getDocs(collection(db, 'companies', companyId, 'employees'));
          const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const filtered = all.filter((emp) => emp.offboarding?.status === 'in_progress');
          setOffboardingEmployees(mapAndSort(filtered));
        } catch (e2) {
          console.error('Offboarding fallback:', e2);
          setOffboardingEmployees([]);
        }
      } else {
        console.error('Offboarding fetch:', e);
        setOffboardingEmployees([]);
      }
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setEmployeesLoaded(false);
    setLeaveLoaded(false);
    fetchEmployees();
    fetchLeave();
    fetchAssets();
    fetchOnboarding();
    fetchOffboarding();
  }, [companyId, fetchEmployees, fetchLeave, fetchAssets, fetchOnboarding, fetchOffboarding]);

  const stats = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const total = employees.length;
    const active = employees.filter((e) => (e.status || 'Active') !== 'Inactive').length;
    const newJoiners = employees.filter((e) => {
      const d = toJSDate(e.joiningDate);
      if (!d || Number.isNaN(d.getTime())) return false;
      return d >= thirtyDaysAgo;
    }).length;
    const pendingLeaves = leaveList.filter((l) => l.status === 'Pending').length;
    const today = toDateString(new Date());
    const onLeaveToday = leaveList.filter((l) => {
      if (l.status !== 'Approved') return false;
      const start = toDateString(l.startDate);
      const end = toDateString(l.endDate);
      if (!start || !end) return false;
      return today >= start && today <= end;
    }).length;
    return {
      totalEmployees: total,
      activeEmployees: active,
      newJoiners,
      onLeaveToday,
      pendingLeaves,
    };
  }, [employees, leaveList]);

  const recentLeave = useMemo(() => leaveList.slice(0, 5), [leaveList]);

  const birthdayData = useMemo(() => {
    const now = new Date();
    const todayMonth = now.getMonth();
    const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

    const withDob = employees
      .map((e) => ({ ...e, _dob: toJSDate(e.dateOfBirth) }))
      .filter((e) => e._dob && !Number.isNaN(e._dob.getTime()));

    const norm = (dt) => {
      const m = dt.getMonth();
      const d = dt.getDate();
      if (m === 1 && d === 29 && !isLeapYear(now.getFullYear())) return { month: 1, day: 28 };
      return { month: m, day: d };
    };

    const todayList = [];
    const upcomingList = [];

    for (let i = 0; i < 8; i += 1) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      if (i === 0) {
        withDob.forEach((emp) => {
          const { month, day } = norm(emp._dob);
          if (month === d.getMonth() && day === d.getDate()) {
            todayList.push(emp);
          }
        });
      } else {
        withDob.forEach((emp) => {
          const { month, day } = norm(emp._dob);
          if (month === d.getMonth() && day === d.getDate()) {
            upcomingList.push({ emp, daysAhead: i });
          }
        });
      }
    }

    const thisMonthSample = withDob.filter((emp) => emp._dob.getMonth() === todayMonth).slice(0, 5);
    const thisMonthTotal = withDob.filter((emp) => emp._dob.getMonth() === todayMonth).length;

    return { todayList, upcomingList, thisMonthTotal, thisMonthSample };
  }, [employees]);

  const handleApprove = async (leaveDoc) => {
    setActioningId(leaveDoc.id);
    try {
      await updateDoc(doc(db, 'companies', companyId, 'leave', leaveDoc.id), {
        status: 'Approved',
        decidedAt: serverTimestamp(),
      });
      setLeaveList((prev) =>
        prev.map((l) => (l.id === leaveDoc.id ? { ...l, status: 'Approved' } : l)),
      );
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
      setLeaveList((prev) =>
        prev.map((l) => (l.id === leaveDoc.id ? { ...l, status: 'Rejected' } : l)),
      );
      success('Leave rejected');
    } catch (err) {
      showError('Failed to reject');
    }
    setActioningId(null);
  };

  const handleEmployeeClick = (employeeId) => {
    if (!employeeId || !companyId) {
      console.warn('Missing employeeId or companyId', { employeeId, companyId });
      return;
    }
    navigate(`/company/${companyId}/employees/${employeeId}`);
  };

  if (!companyId) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Select a company to view dashboard.</p>
      </div>
    );
  }

  const statCards = [
    { title: 'Total Employees', value: String(stats.totalEmployees), icon: UsersIcon, subtitle: `${stats.activeEmployees} active` },
    { title: 'On Leave Today', value: String(stats.onLeaveToday), icon: CalendarIcon, subtitle: 'Approved leaves' },
    { title: 'New Joiners (30 days)', value: String(stats.newJoiners), icon: UserAddIcon, subtitle: 'Last 30 days' },
  ];

  const statsLoading = !employeesLoaded || !leaveLoaded;

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Company overview</p>
        </div>
      </div>

      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-24 mb-2" />
              <div className="h-8 bg-slate-200 rounded w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {statCards.map((stat) => (
            <StatCard key={stat.title} {...stat} />
          ))}
        </div>
      )}

      {showAssetOverview && (
        <div className="bg-white border rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">Asset Overview</h3>
            <button
              type="button"
              onClick={() => navigate(`/company/${companyId}/assets`)}
              className="text-xs text-[#1B6B6B] hover:underline"
            >
              View all →
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-800">{assetStats?.total ?? 0}</p>
              <p className="text-xs text-gray-400">Total assets</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-green-600">{assetStats?.assigned ?? 0}</p>
              <p className="text-xs text-gray-400">Assigned</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-[#1B6B6B]">{assetStats?.available ?? 0}</p>
              <p className="text-xs text-gray-400">Available</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-red-500">{assetStats?.damaged ?? 0}</p>
              <p className="text-xs text-gray-400">Damaged/Lost</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                🎯 Onboarding in Progress
              </h3>
              <span className="text-xs text-gray-400">
                {onboardingEmployees.length} employees
              </span>
            </div>

            {onboardingEmployees.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">No active onboardings</p>
            ) : (
              <div className="space-y-2">
                {onboardingEmployees.map((emp) => (
                  <div
                    key={emp.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/company/${companyId}/employees/${emp.id}?tab=onboarding`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`/company/${companyId}/employees/${emp.id}?tab=onboarding`);
                    }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-[#C5E8E8] hover:bg-[#E8F5F5] cursor-pointer transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 text-xs font-medium">
                      {(emp.fullName || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {emp.designation || '—'} · {emp.department || '—'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {emp._onboardingDone}/{emp._onboardingTotal} tasks · {emp._onboardingPct}% complete
                      </p>
                    </div>
                    <div className="w-24 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-[#4ECDC4] h-2 rounded-full"
                        style={{ width: `${Math.min(emp._onboardingPct || 0, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#1B6B6B]">View →</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                👋 Offboarding in Progress
              </h3>
              <span className="text-xs text-gray-400">
                {offboardingEmployees.length} employees
              </span>
            </div>

            {offboardingEmployees.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-3">No active offboardings</p>
            ) : (
              <div className="space-y-2">
                {offboardingEmployees.map((emp) => {
                  const exitDate = toJSDate(emp.offboarding?.exitDate);
                  const daysLeft = exitDate ? Math.ceil((exitDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
                  return (
                    <div
                      key={emp.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/company/${companyId}/employees/${emp.id}?tab=offboarding`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(`/company/${companyId}/employees/${emp.id}?tab=offboarding`);
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-amber-200 hover:bg-amber-50 cursor-pointer transition-all"
                    >
                      <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-medium">
                        {(emp.fullName || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {emp.designation || '—'} · {emp.department || '—'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div
                              className="bg-amber-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(emp._offPct || 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{emp._offPct || 0}%</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">Exit: {toDisplayDate(emp.offboarding?.exitDate)}</p>
                        {daysLeft !== null && (
                          <p
                            className={`text-xs font-medium ${
                              daysLeft <= 0 ? 'text-red-600' : daysLeft <= 7 ? 'text-amber-600' : 'text-gray-500'
                            }`}
                          >
                            {daysLeft < 0 ? 'Exited' : daysLeft === 0 ? 'Today!' : `${daysLeft} days left`}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(`/company/${companyId}/employees`)}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-[#1B6B6B] hover:bg-[#155858] active:bg-[#0f4444] text-white text-sm font-medium px-4 py-2"
        >
          <UserAddIcon className="w-4 h-4" />
          Add Employee
        </button>
        <Link
          to={`/company/${companyId}/leave`}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg border border-slate-300 hover:bg-slate-50 active:bg-slate-100 text-slate-700 text-sm font-medium px-4 py-2"
        >
          <CalendarIcon className="w-4 h-4" />
          View Leave Requests
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => setBirthdayCardOpen((o) => !o)}
          className="w-full flex items-center justify-between px-6 py-4 border-b border-slate-100 hover:bg-slate-50/50 text-left"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-800 inline-flex items-center gap-2">
              <span role="img" aria-label="cake">🎂</span> Birthdays
            </h2>
            <p className="text-slate-500 text-sm mt-0.5">
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <span className="text-slate-400 text-sm">{birthdayCardOpen ? '▼' : '▶'}</span>
        </button>
        {birthdayCardOpen && (
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Today&apos;s Birthdays</h3>
              {birthdayData.todayList.length === 0 ? (
                <p className="text-slate-500 text-sm">No birthdays today</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {birthdayData.todayList.map((emp) => (
                    <Link
                      key={emp.id}
                      to={`/company/${companyId}/employees/${emp.id}`}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-pink-50/50 p-3 min-w-[200px] hover:bg-pink-100/50 hover:border-[#4ECDC4]/30 transition-colors cursor-pointer"
                    >
                      <div className="h-10 w-10 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {(emp.fullName || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{emp.fullName || '—'}</p>
                        <p className="text-slate-500 text-xs truncate">{emp.designation || '—'} · {emp.department || '—'}</p>
                        <span className="inline-flex mt-1 rounded-full bg-pink-200 text-pink-800 px-2 py-0.5 text-xs font-medium">🎂 Today!</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Upcoming (next 7 days)</h3>
              {birthdayData.upcomingList.length === 0 ? (
                <p className="text-slate-500 text-sm">No upcoming birthdays this week</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {birthdayData.upcomingList.map(({ emp, daysAhead }) => (
                    <Link
                      key={emp.id}
                      to={`/company/${companyId}/employees/${emp.id}`}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 min-w-[200px] hover:bg-slate-50 hover:border-[#4ECDC4]/30 transition-colors cursor-pointer"
                    >
                      <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold shrink-0">
                        {(emp.fullName || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{emp.fullName || '—'}</p>
                        <p className="text-slate-500 text-xs truncate">{emp.designation || '—'}</p>
                        <span className="inline-flex mt-1 text-xs text-slate-600">in {daysAhead} day{daysAhead !== 1 ? 's' : ''}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">This month</h3>
              <p className="text-slate-600 text-sm">{birthdayData.thisMonthTotal} birthday{birthdayData.thisMonthTotal !== 1 ? 's' : ''} this month</p>
                {birthdayData.thisMonthSample.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  {birthdayData.thisMonthSample.map((emp) => (
                    <Link
                      key={emp.id}
                      to={`/company/${companyId}/employees/${emp.id}`}
                      className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-medium hover:ring-2 hover:ring-[#4ECDC4]/50 transition-shadow cursor-pointer"
                      title={emp.fullName}
                    >
                      {(emp.fullName || '?').slice(0, 2).toUpperCase()}
                    </Link>
                  ))}
                  {birthdayData.thisMonthTotal > 5 && (
                    <span className="text-slate-500 text-xs">+{birthdayData.thisMonthTotal - 5} more</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h2 className="text-lg font-semibold text-slate-800 px-6 py-4 border-b border-slate-100">
          Recent Leave Requests
        </h2>
        {!leaveLoaded ? (
          <div className="p-6 text-slate-500 text-sm">Loading…</div>
        ) : recentLeave.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No leave requests yet.</div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Employee</th>
                    <th className="px-4 py-2 text-left font-medium">Type</th>
                    <th className="px-4 py-2 text-left font-medium">Dates</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLeave.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <button
                          type="button"
                          onClick={() => handleEmployeeClick(l.employeeId)}
                          className="cursor-pointer hover:text-teal-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={!l.employeeId}
                        >
                          {l.employeeName || '—'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LEAVE_TYPE_STYLE[l.leaveType] || 'bg-[#E8F5F5] text-[#1B6B6B]'}`}>
                          {l.leaveType || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {toDisplayDate(l.startDate)} – {toDisplayDate(l.endDate)}
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
                              className="text-xs font-medium text-green-600 hover:text-green-700 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={actioningId === l.id}
                              onClick={() => handleReject(l)}
                              className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden space-y-3 p-4">
              {recentLeave.map((leave) => (
                <div key={leave.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#E8F5F5] flex items-center justify-center text-xs font-medium text-[#1B6B6B] flex-shrink-0">
                        {leave.employeeName?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => handleEmployeeClick(leave.employeeId)}
                          disabled={!leave.employeeId}
                          className="text-sm font-medium text-slate-800 truncate text-left hover:text-[#1B6B6B] disabled:opacity-60"
                        >
                          {leave.employeeName || '—'}
                        </button>
                        <p className="text-xs text-gray-400 truncate">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${LEAVE_TYPE_STYLE[leave.leaveType] || 'bg-[#E8F5F5] text-[#1B6B6B]'}`}>
                            {leave.leaveType || '—'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_STYLE[leave.status] || 'bg-slate-100'}`}>
                      {leave.status || '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {toDisplayDate(leave.startDate)} → {toDisplayDate(leave.endDate)}
                    </span>
                  </div>
                  {leave.status === 'Pending' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        disabled={actioningId === leave.id}
                        onClick={() => handleApprove(leave)}
                        className="flex-1 min-h-[44px] py-2 bg-green-600 text-white rounded-xl text-xs font-medium disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actioningId === leave.id}
                        onClick={() => handleReject(leave)}
                        className="flex-1 min-h-[44px] py-2 bg-red-100 text-red-600 rounded-xl text-xs font-medium disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
