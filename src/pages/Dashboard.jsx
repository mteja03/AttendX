import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import StatCard from '../components/StatCard';
import { useToast } from '../contexts/ToastContext';

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
  CL: 'bg-blue-100 text-blue-800',
  SL: 'bg-red-100 text-red-800',
  EL: 'bg-green-100 text-green-800',
};
const STATUS_STYLE = {
  Pending: 'bg-amber-100 text-amber-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [employees, setEmployees] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState(null);
  const [birthdayCardOpen, setBirthdayCardOpen] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [empSnap, leaveSnap] = await Promise.all([
          getDocs(query(collection(db, 'companies', companyId, 'employees'), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'companies', companyId, 'leave'), orderBy('appliedAt', 'desc'))),
        ]);
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLeaveList(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
        showError('Failed to load dashboard data');
      }
      setLoading(false);
    };
    load();
  }, [companyId, showError]);

  const stats = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const total = employees.length;
    const active = employees.filter((e) => (e.status || 'Active') !== 'Inactive').length;
    const newJoiners = employees.filter((e) => {
      const j = e.joiningDate;
      if (!j) return false;
      const d = typeof j === 'string' ? new Date(j) : j?.toDate ? j.toDate() : new Date(j);
      return d >= thirtyDaysAgo;
    }).length;
    const pendingLeaves = leaveList.filter((l) => l.status === 'Pending').length;
    const onLeaveToday = leaveList.filter((l) => {
      if (l.status !== 'Approved') return false;
      const start = (l.startDate || '').slice(0, 10);
      const end = (l.endDate || '').slice(0, 10);
      return todayStr() >= start && todayStr() <= end;
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
    const todayDate = now.getDate();
    const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const daysInMonth = (m, y) => new Date(y, m + 1, 0).getDate();

    const withDob = employees.filter((e) => {
      const d = e.dateOfBirth;
      if (!d) return false;
      const dt = typeof d === 'string' ? new Date(d) : d?.toDate ? d.toDate() : new Date(d);
      return !isNaN(dt.getTime());
    });

    const norm = (dt) => {
      const m = dt.getMonth();
      const d = dt.getDate();
      if (m === 1 && d === 29 && !isLeapYear(now.getFullYear())) return { month: 1, day: 28 };
      return { month: m, day: d };
    };

    const todayList = [];
    const upcomingList = [];
    const thisMonthSet = new Set();

    for (let i = 0; i < 8; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const key = `${d.getMonth()}-${d.getDate()}`;
      if (i === 0) {
        withDob.forEach((emp) => {
          const dt = typeof emp.dateOfBirth === 'string' ? new Date(emp.dateOfBirth) : emp.dateOfBirth?.toDate ? emp.dateOfBirth.toDate() : new Date(emp.dateOfBirth);
          const { month, day } = norm(dt);
          if (month === d.getMonth() && day === d.getDate()) {
            todayList.push(emp);
            thisMonthSet.add(emp.id);
          }
        });
      } else {
        withDob.forEach((emp) => {
          const dt = typeof emp.dateOfBirth === 'string' ? new Date(emp.dateOfBirth) : emp.dateOfBirth?.toDate ? emp.dateOfBirth.toDate() : new Date(emp.dateOfBirth);
          const { month, day } = norm(dt);
          if (month === d.getMonth() && day === d.getDate()) {
            upcomingList.push({ emp, daysAhead: i });
            thisMonthSet.add(emp.id);
          }
        });
      }
    }

    const thisMonthTotal = withDob.filter((emp) => {
      const dt = typeof emp.dateOfBirth === 'string' ? new Date(emp.dateOfBirth) : emp.dateOfBirth?.toDate ? emp.dateOfBirth.toDate() : new Date(emp.dateOfBirth);
      return dt.getMonth() === todayMonth;
    }).length;

    const thisMonthSample = withDob
      .filter((emp) => {
        const dt = typeof emp.dateOfBirth === 'string' ? new Date(emp.dateOfBirth) : emp.dateOfBirth?.toDate ? emp.dateOfBirth.toDate() : new Date(emp.dateOfBirth);
        return dt.getMonth() === todayMonth;
      })
      .slice(0, 5);

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

  if (!companyId) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Select a company to view dashboard.</p>
      </div>
    );
  }

  const statCards = [
    { title: 'Total Employees', value: String(stats.totalEmployees), icon: UsersIcon, subtitle: `${stats.activeEmployees} active` },
    { title: 'On Leave Today', value: String(stats.onLeaveToday), icon: CalendarIcon, subtitle: 'Approved leaves' },
    { title: 'New Joiners (30 days)', value: String(stats.newJoiners), icon: UserAddIcon, subtitle: 'Last 30 days' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Company overview</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-24 mb-2" />
              <div className="h-8 bg-slate-200 rounded w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {statCards.map((stat) => (
            <StatCard key={stat.title} {...stat} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(`/company/${companyId}/employees`)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
        >
          <UserAddIcon className="w-4 h-4" />
          Add Employee
        </button>
        <Link
          to={`/company/${companyId}/leave`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2"
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
                    <div key={emp.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-pink-50/50 p-3 min-w-[200px]">
                      <div className="h-10 w-10 rounded-full bg-[#378ADD] flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {(emp.fullName || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{emp.fullName || '—'}</p>
                        <p className="text-slate-500 text-xs truncate">{emp.designation || '—'} · {emp.department || '—'}</p>
                        <span className="inline-flex mt-1 rounded-full bg-pink-200 text-pink-800 px-2 py-0.5 text-xs font-medium">🎂 Today!</span>
                      </div>
                    </div>
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
                    <div key={emp.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 min-w-[200px]">
                      <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-sm font-bold shrink-0">
                        {(emp.fullName || '?').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{emp.fullName || '—'}</p>
                        <p className="text-slate-500 text-xs truncate">{emp.designation || '—'}</p>
                        <span className="inline-flex mt-1 text-xs text-slate-600">in {daysAhead} day{daysAhead !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
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
                    <div
                      key={emp.id}
                      className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-medium"
                      title={emp.fullName}
                    >
                      {(emp.fullName || '?').slice(0, 2).toUpperCase()}
                    </div>
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
        {loading ? (
          <div className="p-6 text-slate-500 text-sm">Loading…</div>
        ) : recentLeave.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No leave requests yet.</div>
        ) : (
          <div className="overflow-x-auto">
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
                    <td className="px-4 py-3 font-medium text-slate-800">{l.employeeName || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LEAVE_TYPE_STYLE[l.leaveType] || 'bg-slate-100 text-slate-700'}`}>
                        {l.leaveType || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {l.startDate} – {l.endDate}
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
        )}
      </div>
    </div>
  );
}
