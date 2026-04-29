import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import EmployeeAvatar from '../components/EmployeeAvatar';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { toDateString, toDisplayDate, toJSDate } from '../utils';
import { trackPageView } from '../utils/analytics';
import { WhatsAppButton } from '../utils/whatsapp';
import { getCacheKey, getEmployeeCache, setEmployeeCache } from '../utils/employeeCache';

const EMPTY_ASSET_STATS = {
  total: 0,
  assigned: 0,
  available: 0,
  damaged: 0,
  consumableIssued: 0,
};

/** Dashboard employee list: include Inactive so total count is not under-reported (max 500 docs). */
const DASHBOARD_EMPLOYEE_STATUS_IN = ['Active', 'Notice Period', 'Offboarding', 'Inactive', 'On Leave'];

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

const CELEBRATION_COLORS = {
  birthday: {
    bg: 'bg-pink-50',
    border: 'border-pink-100',
    text: 'text-pink-700',
    avatar: 'bg-pink-100 text-pink-700',
    badge: 'bg-pink-100 text-pink-700',
    dot: 'bg-pink-400',
  },
  wedding: {
    bg: 'bg-purple-50',
    border: 'border-purple-100',
    text: 'text-purple-700',
    avatar: 'bg-purple-100 text-purple-700',
    badge: 'bg-purple-100 text-purple-700',
    dot: 'bg-purple-400',
  },
  work: {
    bg: 'bg-[#E8F5F5]',
    border: 'border-[#4ECDC4]/30',
    text: 'text-[#1B6B6B]',
    avatar: 'bg-[#E8F5F5] text-[#1B6B6B]',
    badge: 'bg-[#E8F5F5] text-[#1B6B6B]',
    dot: 'bg-[#4ECDC4]',
  },
};

function CelebrationItem({ item, showDate, companyId, employees, navigate }) {
  const colors = CELEBRATION_COLORS[item.type];
  const emp = employees?.find((e) => e.id === item.empId);
  const phone = emp?.mobile || emp?.phone || emp?.mobileNumber || '';
  const years = item.years ?? 0;
  const cake = '\u{1f382}';
  const trophy = '\u{1f3c6}';
  const ring = '\u{1f48d}';
  const wishBirthday =
    phone &&
    `Dear ${item.name} Garu,\n\n${cake} *Happy Birthday!* ${cake}\n\nWishing you a wonderful birthday and a fantastic year ahead!\n\nBest wishes,\nHR Team`;
  const wishWork =
    phone &&
    `Dear ${item.name} Garu,\n\n${trophy} *Happy Work Anniversary!* ${trophy}\n\nCongratulations on completing ${years} year${years !== 1 ? 's' : ''} with us!\n\nYour dedication and hard work are truly valued.\n\nBest wishes,\nHR Team`;
  const wishWedding =
    phone &&
    `Dear ${item.name} Garu,\n\n${ring} *Happy Wedding Anniversary!* ${ring}\n\nWishing you and your family a joyful celebration!\n\nBest wishes,\nHR Team`;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/company/${companyId}/employees/${item.empId}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/company/${companyId}/employees/${item.empId}`);
        }
      }}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4] cursor-pointer"
    >
      <div
        className={`flex items-center gap-3 p-3 rounded-xl border ${colors.bg} ${colors.border} transition-all hover:shadow-sm`}
      >
        <div className="relative flex-shrink-0">
          <EmployeeAvatar employee={emp || { fullName: item.name }} size="sm" />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center text-xs shadow-sm border border-gray-100">
            {item.icon}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
          <p className={`text-xs font-medium ${colors.text}`}>{item.subtext}</p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1.5 text-right" onClick={(e) => e.stopPropagation()}>
          {item.type === 'birthday' && wishBirthday && (
            <WhatsAppButton phone={phone} message={wishBirthday} size="xs" label={`Wish ${cake}`} />
          )}
          {item.type === 'work' && wishWork && (
            <WhatsAppButton phone={phone} message={wishWork} size="xs" label={`Wish ${trophy}`} />
          )}
          {item.type === 'wedding' && wishWedding && (
            <WhatsAppButton phone={phone} message={wishWedding} size="xs" label={`Wish ${ring}`} />
          )}
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${colors.badge}`}>{item.label}</span>
          {showDate && item.diff > 1 && (
            <p className="text-xs text-gray-400 mt-0.5 text-right">
              {item.diff === 1 ? 'Tomorrow' : `in ${item.diff} days`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const STAT_TREND_COLORS = {
  up: { bg: '#EAF3DE', color: '#3B6D11' },
  down: { bg: '#FCEBEB', color: '#A32D2D' },
  neutral: { bg: '#F1EFE8', color: '#5F5E5A' },
};

function TrendArrow({ dir }) {
  if (dir === 'up') {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
          d="M2 7L5 3L8 7"
          stroke="#3B6D11"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (dir === 'down') {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path
          d="M2 3L5 7L8 3"
          stroke="#A32D2D"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return null;
}

function StatCard({
  icon,
  iconBg,
  trend,
  trendDir,
  number,
  label,
  subLabel,
  subLabelColor,
  rightLabel,
  sparkData,
}) {
  const tc = STAT_TREND_COLORS[trendDir] || STAT_TREND_COLORS.neutral;
  const maxBar = sparkData ? Math.max(...sparkData) : 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          {icon}
        </div>
        {trend !== undefined && (
          <span
            className="text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1"
            style={{ background: tc.bg, color: tc.color }}
          >
            <TrendArrow dir={trendDir} />
            {trend}
          </span>
        )}
      </div>

      <div className="text-3xl font-semibold text-gray-800 leading-none">{number}</div>

      <div className="border-t border-gray-100" />

      <div className="flex flex-col gap-1">
        <p className="text-xs text-gray-500">{label}</p>
        {(subLabel || rightLabel) && (
          <div className="flex items-center justify-between">
            {subLabel && (
              <p className="text-xs" style={{ color: subLabelColor || '#6B7280' }}>
                {subLabel}
              </p>
            )}
            {rightLabel && <p className="text-xs text-gray-400">{rightLabel}</p>}
          </div>
        )}
      </div>

      {sparkData && (
        <div className="flex items-end gap-0.5 h-6 mt-1">
          {sparkData.map((val, i) => (
            <div
              key={i}
              className="flex-1"
              style={{
                height: maxBar > 0 ? `${Math.round((val / maxBar) * 100)}%` : '20%',
                background: i === sparkData.length - 1 ? '#EF9F27' : '#FAC775',
                borderRadius: '2px 2px 0 0',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [celebTab, setCelebTab] = useState('today');
  const [showCelebrations, setShowCelebrations] = useState(true);

  useEffect(() => {
    trackPageView('Dashboard');
  }, []);

  const showAssetOverview = role === 'admin' || role === 'hrmanager' || role === 'itmanager';

  const fetchEmployees = useCallback(async () => {
    if (!companyId) return;
    const empCol = collection(db, 'companies', companyId, 'employees');
    try {
      let snap;
      try {
        snap = await getDocs(
          query(empCol, where('status', 'in', DASHBOARD_EMPLOYEE_STATUS_IN), limit(500)),
        );
      } catch (e) {
        if (isFailedPrecondition(e)) {
          try {
            snap = await getDocs(query(empCol, orderBy('createdAt', 'desc'), limit(500)));
          } catch (e2) {
            if (isFailedPrecondition(e2)) {
              try {
                snap = await getDocs(
                  query(empCol, where('status', 'in', DASHBOARD_EMPLOYEE_STATUS_IN), limit(500)),
                );
              } catch {
                snap = await getDocs(query(empCol, limit(500)));
              }
            } else {
              throw e2;
            }
          }
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
      if (import.meta.env.DEV) console.error('Employees fetch:', e);
      setEmployees([]);
    } finally {
      setEmployeesLoaded(true);
    }
  }, [companyId]);

  const fetchLeave = useCallback(async () => {
    if (!companyId) return;
    const leaveCol = collection(db, 'companies', companyId, 'leave');
    const currentYear = new Date().getFullYear();
    const yearStart = Timestamp.fromDate(new Date(currentYear, 0, 1));
    try {
      let snap;
      try {
        snap = await getDocs(
          query(leaveCol, where('startDate', '>=', yearStart), orderBy('startDate', 'desc'), limit(200)),
        );
      } catch (e) {
        if (isFailedPrecondition(e)) {
          try {
            snap = await getDocs(query(leaveCol, orderBy('appliedAt', 'desc'), limit(200)));
          } catch (e2) {
            if (isFailedPrecondition(e2)) {
              snap = await getDocs(query(leaveCol, limit(200)));
            } else {
              throw e2;
            }
          }
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
      if (import.meta.env.DEV) console.error('Leave fetch:', e);
      setLeaveList([]);
    } finally {
      setLeaveLoaded(true);
    }
  }, [companyId]);

  const fetchAssets = useCallback(async () => {
    if (!companyId) return;
    try {
      const snap = await getDocs(query(collection(db, 'companies', companyId, 'assets'), limit(200)));
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
      if (import.meta.env.DEV) console.error('Assets fetch:', e);
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
        query(
          collection(db, 'companies', companyId, 'employees'),
          where('onboarding.status', '==', 'in_progress'),
          limit(500),
        ),
      );
      setOnboardingEmployees(mapAndSort(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    } catch (e) {
      if (isFailedPrecondition(e)) {
        try {
          const snap = await getDocs(query(collection(db, 'companies', companyId, 'employees'), limit(500)));
          const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const filtered = all.filter((emp) => emp.onboarding?.status === 'in_progress');
          setOnboardingEmployees(mapAndSort(filtered));
        } catch (e2) {
          if (import.meta.env.DEV) console.error('Onboarding fallback:', e2);
          setOnboardingEmployees([]);
        }
      } else {
        if (import.meta.env.DEV) console.error('Onboarding fetch:', e);
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
        query(
          collection(db, 'companies', companyId, 'employees'),
          where('offboarding.status', '==', 'in_progress'),
          limit(500),
        ),
      );
      setOffboardingEmployees(mapAndSort(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    } catch (e) {
      if (isFailedPrecondition(e)) {
        try {
          const snap = await getDocs(query(collection(db, 'companies', companyId, 'employees'), limit(500)));
          const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          const filtered = all.filter((emp) => emp.offboarding?.status === 'in_progress');
          setOffboardingEmployees(mapAndSort(filtered));
        } catch (e2) {
          if (import.meta.env.DEV) console.error('Offboarding fallback:', e2);
          setOffboardingEmployees([]);
        }
      } else {
        if (import.meta.env.DEV) console.error('Offboarding fetch:', e);
        setOffboardingEmployees([]);
      }
    }
  }, [companyId]);

  const dataFetchedAt = useRef(null);
  const DASHBOARD_CACHE_MS = 5 * 60 * 1000;

  const refreshAll = useCallback(
    (force = false) => {
      if (!companyId) return;
      if (
        !force &&
        dataFetchedAt.current &&
        Date.now() - dataFetchedAt.current < DASHBOARD_CACHE_MS
      ) {
        return;
      }
      setEmployeesLoaded(false);
      setLeaveLoaded(false);
      Promise.all([fetchEmployees(), fetchLeave(), fetchAssets(), fetchOnboarding(), fetchOffboarding()])
        .then(() => {
          dataFetchedAt.current = Date.now();
        })
        .catch(() => {});
    },
    [companyId, fetchEmployees, fetchLeave, fetchAssets, fetchOnboarding, fetchOffboarding, DASHBOARD_CACHE_MS],
  );

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Prefetch employee list silently so Employees page loads instantly
  useEffect(() => {
    if (!companyId) return undefined;
    const cacheKey = getCacheKey(companyId, 'all', {});
    if (getEmployeeCache(cacheKey)) return undefined;
    const t = setTimeout(async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'companies', companyId, 'employees'),
            orderBy('fullName', 'asc'),
            limit(50),
          ),
        );
        const emps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployeeCache(cacheKey, {
          employees: emps,
          totalCount: emps.length,
          statsCounts: {},
          hasMore: snap.docs.length === 50,
        });
      } catch {
        // silent
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [companyId]);

  const activeEmployeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);

  const totalEmployees = useMemo(() => employees.length, [employees]);

  const activeCount = useMemo(
    () => employees.filter((e) => (e.status || 'Active') === 'Active').length,
    [employees],
  );

  const inactiveCount = useMemo(
    () => employees.filter((e) => e.status === 'Inactive').length,
    [employees],
  );

  const onLeaveToday = useMemo(() => {
    const today = toDateString(new Date());
    return leaveList.filter((l) => {
      if (l.status !== 'Approved') return false;
      if (!activeEmployeeIds.has(l.employeeId)) return false;
      const start = toDateString(l.startDate);
      const end = toDateString(l.endDate);
      if (!start || !end) return false;
      return today >= start && today <= end;
    }).length;
  }, [leaveList, activeEmployeeIds]);

  const leaveSparkData = useMemo(() => {
    const days = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      const count = leaveList.filter((l) => {
        if (l.status !== 'Approved') return false;
        if (!activeEmployeeIds.has(l.employeeId)) return false;
        const start = toDateString(l.startDate);
        const end = toDateString(l.endDate);
        if (!start || !end) return false;
        return dateStr >= start && dateStr <= end;
      }).length;
      days.push(count);
    }
    return days;
  }, [leaveList, activeEmployeeIds]);

  const newJoinersThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    return employees.filter((e) => {
      if ((e.status || 'Active') === 'Inactive') return false;
      const d = toJSDate(e.joiningDate);
      if (!d || Number.isNaN(d.getTime())) return false;
      return d >= monthStart;
    }).length;
  }, [employees]);

  const onboardingCount = useMemo(
    () =>
      employees.filter(
        (e) => e.onboarding?.status === 'in_progress' && (e.status || 'Active') === 'Active',
      ).length,
    [employees],
  );

  const avgOnboardingPct = useMemo(() => {
    const inProgress = employees.filter(
      (e) => e.onboarding?.status === 'in_progress' && (e.status || 'Active') === 'Active',
    );
    if (inProgress.length === 0) return 0;
    const total = inProgress.reduce((sum, e) => {
      const items = Array.isArray(e.onboarding?.tasks) ? e.onboarding.tasks : [];
      if (items.length === 0) return sum + (e.onboarding?.completionPct || 0);
      const done = items.filter((t) => t.completed).length;
      return sum + Math.round((done / items.length) * 100);
    }, 0);
    return Math.round(total / inProgress.length);
  }, [employees]);

  const offboardingCount = useMemo(
    () => employees.filter((e) => e.status === 'Notice Period' || e.status === 'Offboarding').length,
    [employees],
  );

  const overdueOffboardingTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return employees
      .filter((e) => e.offboarding?.status === 'in_progress')
      .reduce((sum, e) => {
        const tasks = Array.isArray(e.offboarding?.tasks) ? e.offboarding.tasks : [];
        return (
          sum +
          tasks.filter((t) => {
            if (t.completed) return false;
            const due = toJSDate(t.dueDate);
            if (!due || Number.isNaN(due.getTime())) return false;
            due.setHours(0, 0, 0, 0);
            return due < today;
          }).length
        );
      }, 0);
  }, [employees]);

  const birthdaysThisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    return employees.filter((emp) => {
      if (!emp.dateOfBirth) return false;
      if (emp.status === 'Inactive') return false;
      const dob = toJSDate(emp.dateOfBirth);
      if (!dob || Number.isNaN(dob.getTime())) return false;
      const thisYear = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
      thisYear.setHours(0, 0, 0, 0);
      return thisYear >= today && thisYear <= weekEnd;
    }).length;
  }, [employees]);

  const birthdaysToday = useMemo(() => {
    const today = new Date();
    return employees.filter((emp) => {
      if (!emp.dateOfBirth) return false;
      if (emp.status === 'Inactive') return false;
      const dob = toJSDate(emp.dateOfBirth);
      if (!dob || Number.isNaN(dob.getTime())) return false;
      return dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate();
    }).length;
  }, [employees]);

  const recentLeave = useMemo(
    () => leaveList.filter((l) => activeEmployeeIds.has(l.employeeId)).slice(0, 5),
    [leaveList, activeEmployeeIds],
  );

  const onLeaveThisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + 7);
    const todayTime = today.getTime();
    const weekEndTime = weekEnd.getTime();

    const overlaps = (leave) => {
      if (leave.status !== 'Approved') return false;
      const start = toJSDate(leave.startDate);
      const end = toJSDate(leave.endDate);
      if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
      const s = new Date(start);
      s.setHours(0, 0, 0, 0);
      const e = new Date(end);
      e.setHours(0, 0, 0, 0);
      return s.getTime() <= weekEndTime && e.getTime() >= todayTime;
    };

    const leavesForActive = leaveList.filter((l) => activeEmployeeIds.has(l.employeeId));
    return employees.filter((emp) => leavesForActive.some((l) => l.employeeId === emp.id && overlaps(l)));
  }, [employees, leaveList, activeEmployeeIds]);

  const celebratingEmployees = useMemo(
    () => employees.filter((emp) => emp.status !== 'Inactive' && emp.status !== 'Offboarding'),
    [employees],
  );

  const celebrations = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const currentYear = today.getFullYear();

    const result = {
      today: [],
      tomorrow: [],
      thisWeek: [],
      thisMonth: [],
    };

    const getNextOccurrence = (month, date) => {
      const next = new Date(currentYear, month, date);
      next.setHours(0, 0, 0, 0);
      if (next < today && !(next.getMonth() === todayMonth && next.getDate() === todayDate)) {
        next.setFullYear(currentYear + 1);
      }
      return next;
    };

    const getDiffDays = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const diff = d - today;
      return Math.round(diff / (1000 * 60 * 60 * 24));
    };

    celebratingEmployees.forEach((emp) => {
      if (emp.dateOfBirth) {
        const dob = toJSDate(emp.dateOfBirth);
        if (dob && !Number.isNaN(dob.getTime())) {
          const next = getNextOccurrence(dob.getMonth(), dob.getDate());
          const diff = getDiffDays(next);
          const age = currentYear - dob.getFullYear();

          const item = {
            id: `${emp.id}_bday`,
            empId: emp.id,
            name: emp.fullName,
            type: 'birthday',
            label: 'Birthday',
            icon: '🎂',
            color: 'pink',
            subtext: `Turning ${age}`,
            diff,
            next,
          };

          if (diff === 0) result.today.push(item);
          else if (diff === 1) result.tomorrow.push(item);
          else if (diff <= 7) result.thisWeek.push(item);
          else if (next.getMonth() === todayMonth && next.getFullYear() === currentYear) result.thisMonth.push(item);
        }
      }

      if (emp.maritalStatus === 'Married' && emp.marriageDate) {
        const md = toJSDate(emp.marriageDate);
        if (md && !Number.isNaN(md.getTime())) {
          const years = currentYear - md.getFullYear();
          if (years >= 1) {
            const next = getNextOccurrence(md.getMonth(), md.getDate());
            const diff = getDiffDays(next);

            const item = {
              id: `${emp.id}_wedding`,
              empId: emp.id,
              name: emp.fullName,
              type: 'wedding',
              label: 'Wedding Anniversary',
              icon: '💍',
              color: 'purple',
              subtext: `${years} year${years !== 1 ? 's' : ''} together`,
              years,
              diff,
              next,
            };

            if (diff === 0) result.today.push(item);
            else if (diff === 1) result.tomorrow.push(item);
            else if (diff <= 7) result.thisWeek.push(item);
            else if (next.getMonth() === todayMonth && next.getFullYear() === currentYear) result.thisMonth.push(item);
          }
        }
      }

      if (emp.joiningDate && (emp.status || 'Active') === 'Active') {
        const jd = toJSDate(emp.joiningDate);
        if (jd && !Number.isNaN(jd.getTime())) {
          const years = currentYear - jd.getFullYear();
          if (years >= 1) {
            const next = getNextOccurrence(jd.getMonth(), jd.getDate());
            const diff = getDiffDays(next);

            const item = {
              id: `${emp.id}_work`,
              empId: emp.id,
              name: emp.fullName,
              type: 'work',
              label: 'Work Anniversary',
              icon: '🏆',
              color: 'teal',
              subtext: `${years} year${years !== 1 ? 's' : ''} at company`,
              years,
              diff,
              next,
            };

            if (diff === 0) result.today.push(item);
            else if (diff === 1) result.tomorrow.push(item);
            else if (diff <= 7) result.thisWeek.push(item);
            else if (next.getMonth() === todayMonth && next.getFullYear() === currentYear) result.thisMonth.push(item);
          }
        }
      }
    });

    const sortByDiff = (a, b) => a.diff - b.diff;
    result.today.sort(sortByDiff);
    result.tomorrow.sort(sortByDiff);
    result.thisWeek.sort(sortByDiff);
    result.thisMonth.sort(sortByDiff);

    return result;
  }, [celebratingEmployees]);

  const totalCelebrations =
    celebrations.today.length +
    celebrations.tomorrow.length +
    celebrations.thisWeek.length +
    celebrations.thisMonth.length;

  const celebTabs = [
    { id: 'today', label: 'Today', count: celebrations.today.length },
    { id: 'tomorrow', label: 'Tomorrow', count: celebrations.tomorrow.length },
    { id: 'thisWeek', label: 'This Week', count: celebrations.thisWeek.length },
    { id: 'thisMonth', label: 'This Month', count: celebrations.thisMonth.length },
  ];

  const activeCelebrations = celebrations[celebTab] || [];

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
      setLeaveList((prev) =>
        prev.map((l) => (l.id === leaveDoc.id ? { ...l, status: 'Rejected' } : l)),
      );
      success('Leave rejected');
    } catch {
      showError('Failed to reject');
    }
    setActioningId(null);
  };

  const handleEmployeeClick = (employeeId) => {
    if (!employeeId || !companyId) return;
    navigate(`/company/${companyId}/employees/${employeeId}`);
  };

  if (!companyId) {
    return (
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-slate-800">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Select a company to view dashboard.</p>
      </div>
    );
  }

  const statsLoading = !employeesLoaded || !leaveLoaded;

  return (
    <div>
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-slate-200" />
                <div className="h-5 w-10 bg-slate-200 rounded-full" />
              </div>
              <div className="h-7 bg-slate-200 rounded w-12 mb-3" />
              <div className="h-px bg-slate-100 mb-3" />
              <div className="h-3 bg-slate-200 rounded w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          <StatCard
            iconBg="#E1F5EE"
            icon={
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="7" cy="5" r="3" fill="#0F6E56" />
                <path
                  d="M1 15c0-3.314 2.686-6 6-6s6 2.686 6 6"
                  stroke="#0F6E56"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle cx="13" cy="6" r="2" fill="#5DCAA5" />
                <path
                  d="M13 10c1.657 0 3 1.343 3 3"
                  stroke="#5DCAA5"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            }
            number={totalEmployees}
            trend={newJoinersThisMonth > 0 ? `+${newJoinersThisMonth}` : '—'}
            trendDir={newJoinersThisMonth > 0 ? 'up' : 'neutral'}
            label="Total employees"
            subLabel={`${activeCount} active`}
            subLabelColor="#0F6E56"
            rightLabel={`${inactiveCount} inactive`}
          />

          <StatCard
            iconBg="#FAEEDA"
            icon={
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="3" width="14" height="13" rx="2" stroke="#854F0B" strokeWidth="1.5" />
                <path
                  d="M6 2v2M12 2v2M2 8h14"
                  stroke="#854F0B"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <circle cx="9" cy="12" r="1.5" fill="#EF9F27" />
              </svg>
            }
            number={onLeaveToday}
            trend="—"
            trendDir="neutral"
            label="On leave today"
            sparkData={leaveSparkData}
          />

          <StatCard
            iconBg="#E6F1FB"
            icon={
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="7" stroke="#185FA5" strokeWidth="1.5" />
                <path d="M9 5v4l3 2" stroke="#185FA5" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
            number={newJoinersThisMonth}
            trend={newJoinersThisMonth > 0 ? `+${newJoinersThisMonth}` : '0'}
            trendDir={newJoinersThisMonth > 0 ? 'up' : 'neutral'}
            label="New joiners"
            subLabel="this month"
          />

          <StatCard
            iconBg="#FCEBEB"
            icon={
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M9 2v8M9 10L6 7M9 10L12 7"
                  stroke="#A32D2D"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 13h12M3 16h12"
                  stroke="#E24B4A"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            }
            number={offboardingCount}
            trend={offboardingCount > 0 ? `${offboardingCount}` : '—'}
            trendDir={offboardingCount > 0 ? 'down' : 'neutral'}
            label="Offboarding"
            subLabel={
              overdueOffboardingTasks > 0
                ? `${overdueOffboardingTasks} overdue tasks`
                : 'All on track'
            }
            subLabelColor={overdueOffboardingTasks > 0 ? '#A32D2D' : '#3B6D11'}
          />

          <StatCard
            iconBg="#EEEDFE"
            icon={
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="10" width="3" height="6" rx="1" fill="#534AB7" />
                <rect x="7.5" y="6" width="3" height="10" rx="1" fill="#7F77DD" />
                <rect x="13" y="2" width="3" height="14" rx="1" fill="#AFA9EC" />
              </svg>
            }
            number={onboardingCount}
            trend={avgOnboardingPct > 0 ? `${avgOnboardingPct}%` : '—'}
            trendDir={avgOnboardingPct >= 80 ? 'up' : 'neutral'}
            label="Onboarding"
            subLabel={
              avgOnboardingPct > 0 ? `avg ${avgOnboardingPct}% complete` : 'None in progress'
            }
            subLabelColor="#534AB7"
          />

          <StatCard
            iconBg="#E1F5EE"
            icon={
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M9 2l1.8 3.6L15 6.5l-3 2.9.7 4.1L9 11.4 6.3 13.5l.7-4.1-3-2.9 4.2-.9z"
                  stroke="#0F6E56"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            }
            number={birthdaysThisWeek}
            trend="—"
            trendDir="neutral"
            label="Birthdays this week"
            subLabel={birthdaysToday > 0 ? `${birthdaysToday} today` : 'None today'}
          />
        </div>
      )}

      {!statsLoading && onLeaveThisWeek.length > 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate(`/company/${companyId}/calendar`)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') navigate(`/company/${companyId}/calendar`);
          }}
          className="bg-white border border-gray-100 rounded-2xl p-4 mb-6 cursor-pointer hover:border-[#4ECDC4] transition-colors group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base">📅</span>
              <h3 className="text-sm font-medium text-gray-700">On Leave This Week</h3>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                {onLeaveThisWeek.length} employee{onLeaveThisWeek.length > 1 ? 's' : ''}
              </span>
            </div>
            <span className="text-xs text-[#1B6B6B] group-hover:underline">View Calendar →</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {onLeaveThisWeek.slice(0, 8).map((emp) => {
              const leave = leaveList.find(
                (l) =>
                  l.employeeId === emp.id &&
                  l.status === 'Approved' &&
                  (() => {
                    const start = toJSDate(l.startDate);
                    const end = toJSDate(l.endDate);
                    if (!start || !end) return false;
                    const t0 = new Date();
                    t0.setHours(0, 0, 0, 0);
                    const t7 = new Date(t0);
                    t7.setDate(t7.getDate() + 7);
                    const s = new Date(start);
                    s.setHours(0, 0, 0, 0);
                    const e = new Date(end);
                    e.setHours(0, 0, 0, 0);
                    return s.getTime() <= t7.getTime() && e.getTime() >= t0.getTime();
                  })(),
              );
              const leaveTypeLabel = (leave?.leaveType || leave?.type || '').split(' ')[0];
              return (
                <div
                  key={emp.id}
                  className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-1"
                >
                  <EmployeeAvatar employee={emp} size="xs" className="ring-2 ring-amber-100" />
                  <span className="text-xs text-amber-800 font-medium">{emp.fullName?.split(' ')[0]}</span>
                  {leave && leaveTypeLabel && <span className="text-xs text-amber-500">· {leaveTypeLabel}</span>}
                </div>
              );
            })}
            {onLeaveThisWeek.length > 8 && (
              <div className="flex items-center px-2.5 py-1 text-xs text-gray-400">+{onLeaveThisWeek.length - 8} more</div>
            )}
          </div>
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/company/${companyId}/employees/${emp.id}?tab=onboarding`);
                      }
                    }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-[#C5E8E8] hover:bg-[#E8F5F5] cursor-pointer transition-all"
                  >
                    <EmployeeAvatar employee={emp} size="md" />
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
                    <Link
                      to={`/company/${companyId}/employees/${emp.id}?tab=onboarding`}
                      className="text-xs text-[#1B6B6B] shrink-0 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View →
                    </Link>
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
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/company/${companyId}/employees/${emp.id}?tab=offboarding`);
                        }
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-amber-200 hover:bg-amber-50 cursor-pointer transition-all"
                    >
                      <EmployeeAvatar employee={emp} size="md" />
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
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
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
                        <Link
                          to={`/company/${companyId}/employees/${emp.id}?tab=offboarding`}
                          className="text-xs text-[#1B6B6B] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View →
                        </Link>
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

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => setShowCelebrations((prev) => !prev)}
          className="w-full flex items-center justify-between p-5 hover:bg-gray-50/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex -space-x-1">
              <span className="text-xl" aria-hidden>
                🎂
              </span>
              <span className="text-xl" aria-hidden>
                💍
              </span>
              <span className="text-xl" aria-hidden>
                🏆
              </span>
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-gray-800">Celebrations</h3>
              <p className="text-xs text-gray-400">Birthdays, Anniversaries &amp; Milestones</p>
            </div>
            {totalCelebrations > 0 && (
              <span className="bg-[#1B6B6B] text-white text-xs font-bold px-2 py-0.5 rounded-full ml-1">
                {totalCelebrations}
              </span>
            )}
          </div>
          <span className="text-gray-400 text-xs">{showCelebrations ? '▲' : '▼'}</span>
        </button>

        {showCelebrations && (
          <div>
            <div className="flex border-t border-gray-100 overflow-x-auto scrollbar-none">
              {celebTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCelebTab(tab.id)}
                  className={`flex-1 min-w-[100px] shrink-0 py-2.5 px-2 text-xs font-medium transition-colors relative ${
                    celebTab === tab.id
                      ? 'text-[#1B6B6B] bg-[#E8F5F5]'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${
                        celebTab === tab.id ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {celebTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1B6B6B]" />}
                </button>
              ))}
            </div>

            <div className="p-4">
              {activeCelebrations.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-2xl mb-2">
                    {celebTab === 'today' ? '😊' : celebTab === 'tomorrow' ? '📅' : '🗓️'}
                  </p>
                  <p className="text-sm text-gray-400">
                    No celebrations
                    {celebTab === 'today'
                      ? ' today'
                      : celebTab === 'tomorrow'
                        ? ' tomorrow'
                        : celebTab === 'thisWeek'
                          ? ' this week'
                          : ' this month'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeCelebrations.map((item) => (
                    <CelebrationItem
                      key={item.id}
                      item={item}
                      showDate={celebTab !== 'today' && celebTab !== 'tomorrow'}
                      companyId={companyId}
                      employees={employees}
                      navigate={navigate}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 pb-4 pt-0">
              <div className="flex items-center gap-4 pt-3 border-t border-gray-50 flex-wrap">
                {[
                  { icon: '🎂', label: 'Birthday', color: 'bg-pink-400' },
                  { icon: '💍', label: 'Wedding', color: 'bg-purple-400' },
                  { icon: '🏆', label: 'Work', color: 'bg-[#4ECDC4]' },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${l.color}`} aria-hidden />
                    <span className="text-sm" aria-hidden>
                      {l.icon}
                    </span>
                    <span className="text-xs text-gray-400">{l.label}</span>
                  </div>
                ))}
              </div>
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
                          <button
                            type="button"
                            onClick={() => handleEmployeeClick(l.employeeId)}
                            className="text-left text-sm font-medium text-slate-800 cursor-pointer hover:text-teal-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={!l.employeeId}
                          >
                            {l.employeeName || '—'}
                          </button>
                        </div>
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
                      <EmployeeAvatar
                        employee={{
                          fullName: leave.employeeName,
                          photoURL:
                            leave.employeePhotoURL ?? employees.find((e) => e.id === leave.employeeId)?.photoURL,
                        }}
                        size="sm"
                      />
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
