import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  increment,
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
function CheckCircleIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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
  const [attendanceToday, setAttendanceToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      const today = todayStr();
      try {
        const [empSnap, leaveSnap, attSnap] = await Promise.all([
          getDocs(query(collection(db, 'companies', companyId, 'employees'), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'companies', companyId, 'leave'), orderBy('appliedAt', 'desc'))),
          getDocs(query(collection(db, 'companies', companyId, 'attendance'), where('date', '==', today))),
        ]);
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLeaveList(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAttendanceToday(attSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
    const presentToday = attendanceToday.filter((a) => a.status === 'Present').length;
    return {
      totalEmployees: total,
      activeEmployees: active,
      newJoiners,
      onLeaveToday,
      pendingLeaves,
      presentToday,
    };
  }, [employees, leaveList, attendanceToday]);

  const recentLeave = useMemo(() => leaveList.slice(0, 5), [leaveList]);

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
    { title: 'Present Today', value: String(stats.presentToday), icon: CheckCircleIcon, subtitle: 'Marked attendance' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Company overview</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-24 mb-2" />
              <div className="h-8 bg-slate-200 rounded w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
        <button
          type="button"
          onClick={() => navigate(`/company/${companyId}/attendance`)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2"
        >
          <CheckCircleIcon className="w-4 h-4" />
          Mark Attendance
        </button>
        <Link
          to={`/company/${companyId}/leave`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2"
        >
          <CalendarIcon className="w-4 h-4" />
          View Leave Requests
        </Link>
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
