import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, orderBy, limit,
} from 'firebase/firestore';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { isAuditOverdue } from './audit/auditHelpers';

const C = {
  teal: '#1B6B6B',
  green: '#639922',
  blue: '#378ADD',
  amber: '#EF9F27',
  red: '#E24B4A',
  purple: '#7F77DD',
  gray: '#888780',
  lightTeal: '#E1F5EE',
  lightBlue: '#E6F1FB',
};

const ROLE_META = {
  hrmanager:    { label: 'HR Manager',    color: C.teal   },
  auditor:      { label: 'Auditor',       color: C.blue   },
  companyadmin: { label: 'Company Admin', color: C.purple },
  auditmanager: { label: 'Audit Manager', color: C.amber  },
  itmanager:    { label: 'IT Manager',    color: C.red    },
  manager:      { label: 'Manager',       color: C.gray   },
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm">
      {label && <p className="text-xs font-medium text-gray-700 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color || p.fill }}>
          {p.name}: <span className="font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function KpiCard({ label, value, sub, subColor }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: subColor || '#9CA3AF' }}>{sub}</p>}
    </div>
  );
}

function ChartCard({ title, sub, children, className = '' }) {
  return (
    <div className={`bg-white border border-gray-100 rounded-2xl p-5 ${className}`}>
      <p className="text-sm font-semibold text-gray-700 mb-0.5">{title}</p>
      {sub && <p className="text-xs text-gray-400 mb-4">{sub}</p>}
      {children}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap items-center gap-4 mb-3">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function SkeletonPage() {
  return (
    <div className="p-8 animate-pulse">
      <div className="h-7 w-52 bg-gray-200 rounded-lg mb-2" />
      <div className="h-4 w-32 bg-gray-100 rounded mb-8" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="h-64 bg-gray-100 rounded-2xl" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
      <div className="h-52 bg-gray-100 rounded-2xl mb-4" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-56 bg-gray-100 rounded-2xl" />
        <div className="h-56 bg-gray-100 rounded-2xl" />
      </div>
    </div>
  );
}

export default function Analytics() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditStats, setAuditStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now] = useState(() => Date.now());

  const load = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (role !== 'admin') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [companiesSnap, usersSnap] = await Promise.all([
          getDocs(query(collection(db, 'companies'), orderBy('createdAt', 'desc'), limit(100))),
          getDocs(query(collection(db, 'users'), limit(500))),
        ]);
        if (cancelled) return;
        const companiesData = companiesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const usersData = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setCompanies(companiesData);
        setUsers(usersData);

        const stats = {};
        await Promise.all(
          companiesData.map(async (c) => {
            try {
              const snap = await getDocs(
                query(collection(db, 'companies', c.id, 'audits'), limit(200)),
              );
              const audits = snap.docs.map((d) => d.data());
              stats[c.id] = {
                total: audits.length,
                closed: audits.filter((a) => a.status === 'Closed').length,
                overdue: audits.filter((a) => isAuditOverdue(a)).length,
              };
            } catch {
              stats[c.id] = { total: 0, closed: 0, overdue: 0 };
            }
          }),
        );
        if (cancelled) return;
        setAuditStats(stats);
      } catch (err) {
        if (import.meta.env.DEV) console.error('[Analytics] load error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [role, refreshKey]);

  const companyUserCount = useMemo(() => {
    const map = {};
    users.filter((u) => u.role !== 'admin' && u.isActive !== false).forEach((u) => {
      if (u.companyId) map[u.companyId] = (map[u.companyId] || 0) + 1;
    });
    return map;
  }, [users]);

  const companyLastLogin = useMemo(() => {
    const map = {};
    users.filter((u) => u.role !== 'admin').forEach((u) => {
      const d = u.lastLoginAt?.toDate
        ? u.lastLoginAt.toDate()
        : u.lastLoginAt
          ? new Date(u.lastLoginAt)
          : null;
      if (!d || !u.companyId) return;
      if (!map[u.companyId] || d > map[u.companyId]) map[u.companyId] = d;
    });
    return map;
  }, [users]);

  const companyChartData = useMemo(
    () => companies.map((c) => ({
      name: c.initials || c.name?.slice(0, 5) || '—',
      fullName: c.name,
      active: c.activeEmployeeCount || 0,
      inactive: c.inactiveEmployeeCount || 0,
      users: companyUserCount[c.id] || 0,
    })),
    [companies, companyUserCount],
  );

  const statusData = useMemo(
    () => companies.map((c) => ({
      name: c.initials || c.name?.slice(0, 5) || '—',
      active: c.activeEmployeeCount || 0,
      notice: c.noticePeriodCount || 0,
      offboarding: c.offboardingCount || 0,
      inactive: c.inactiveEmployeeCount || 0,
    })),
    [companies],
  );

  const rolesData = useMemo(() => {
    const counts = {};
    users.filter((u) => u.role !== 'admin' && u.isActive !== false).forEach((u) => {
      if (u.role) counts[u.role] = (counts[u.role] || 0) + 1;
    });
    return Object.entries(counts).map(([r, v]) => ({
      name: ROLE_META[r]?.label || r,
      value: v,
      color: ROLE_META[r]?.color || C.gray,
    }));
  }, [users]);

  const growthData = useMemo(() => {
    const now = new Date();
    const months = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      months[key] = { month: key, newUsers: 0, newCompanies: 0 };
    }
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    let baseUsers = 0, baseCompanies = 0;
    users.filter((u) => u.role !== 'admin').forEach((u) => {
      const d = u.createdAt?.toDate ? u.createdAt.toDate() : u.createdAt ? new Date(u.createdAt) : null;
      if (!d) return;
      if (d < cutoff) { baseUsers += 1; return; }
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (months[key]) months[key].newUsers += 1;
    });
    companies.forEach((c) => {
      const d = c.createdAt?.toDate ? c.createdAt.toDate() : c.createdAt ? new Date(c.createdAt) : null;
      if (!d) return;
      if (d < cutoff) { baseCompanies += 1; return; }
      const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (months[key]) months[key].newCompanies += 1;
    });

    let tu = baseUsers, tc = baseCompanies;
    return Object.values(months).map((m) => {
      tu += m.newUsers;
      tc += m.newCompanies;
      return { month: m.month, totalUsers: tu, totalCompanies: tc };
    });
  }, [companies, users]);

  const auditChartData = useMemo(
    () => companies
      .map((c) => ({
        name: c.initials || c.name?.slice(0, 5) || '—',
        fullName: c.name,
        closed: auditStats[c.id]?.closed || 0,
        overdue: auditStats[c.id]?.overdue || 0,
        total: auditStats[c.id]?.total || 0,
      }))
      .filter((d) => d.total > 0),
    [companies, auditStats],
  );

  const kpis = useMemo(() => {
    const totalEmp = companies.reduce((s, c) => s + (c.employeeCount || 0), 0);
    const activeUsers = users.filter((u) => u.isActive !== false && u.role !== 'admin').length;
    const totalAudits = Object.values(auditStats).reduce((s, a) => s + a.total, 0);
    const closedAudits = Object.values(auditStats).reduce((s, a) => s + a.closed, 0);
    const overdueAudits = Object.values(auditStats).reduce((s, a) => s + a.overdue, 0);
    const activeCompanies = companies.filter((c) => (c.employeeCount || 0) > 0).length;
    const closeRate = totalAudits > 0 ? Math.round((closedAudits / totalAudits) * 100) : 0;
    return { companies: companies.length, activeCompanies, totalEmp, activeUsers, totalAudits, closedAudits, overdueAudits, closeRate };
  }, [companies, users, auditStats]);

  const formatDate = (date) => {
    if (!date) return 'Never';
    const days = Math.floor((now - date.getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  };

  const activityStatus = (companyId, employeeCount) => {
    const last = companyLastLogin[companyId];
    if (!employeeCount) return { label: 'Not started', color: '#9CA3AF', dot: '#D1D5DB' };
    if (!last) return { label: 'Never logged in', color: '#D97706', dot: '#FCD34D' };
    const days = (now - last.getTime()) / 86400000;
    if (days < 7) return { label: 'Active', color: '#3B6D11', dot: '#639922' };
    if (days < 30) return { label: 'Low activity', color: '#D97706', dot: '#F59E0B' };
    return { label: 'Inactive', color: '#DC2626', dot: '#EF4444' };
  };

  if (role !== 'admin') {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">You don't have access to this page.</p>
      </div>
    );
  }

  if (loading) return <SkeletonPage />;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Platform Analytics</h1>
          <p className="text-sm text-gray-400 mt-1">All companies · live data</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            className="text-xs text-[#1B6B6B] border border-[#1B6B6B]/30 rounded-xl px-3 py-2 hover:bg-[#E1F5EE] transition-colors"
          >
            ↻ Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate('/companies')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← All Companies
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total companies" value={kpis.companies} sub={`${kpis.activeCompanies} with employees`} />
        <KpiCard label="Total employees" value={kpis.totalEmp} sub={`across ${kpis.activeCompanies} companies`} />
        <KpiCard label="Platform users" value={kpis.activeUsers} sub="active accounts" />
        <KpiCard
          label="Audit close rate"
          value={`${kpis.closeRate}%`}
          sub={`${kpis.closedAudits}/${kpis.totalAudits} closed · ${kpis.overdueAudits} overdue`}
          subColor={kpis.overdueAudits > 0 ? '#DC2626' : '#9CA3AF'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Employees per company" sub="Active vs inactive headcount">
          <Legend items={[['Active', C.teal], ['Inactive', C.gray]]} />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={companyChartData} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="active" name="Active" fill={C.teal} radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="inactive" name="Inactive" fill={C.gray} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="User roles distribution" sub="Platform-wide active users">
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={rolesData} cx={65} cy={65} innerRadius={38} outerRadius={62} dataKey="value" paddingAngle={2}>
                  {rolesData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2.5 flex-1">
              {rolesData.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: r.color }} />
                  <span className="text-xs text-gray-600 flex-1">{r.name}</span>
                  <span className="text-xs font-medium text-gray-800">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Employee status breakdown" sub="Active · notice period · offboarding · inactive per company" className="mb-4">
        <Legend items={[['Active', C.green], ['Notice period', C.amber], ['Offboarding', C.red], ['Inactive', C.gray]]} />
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={statusData} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="active" name="Active" stackId="s" fill={C.green} maxBarSize={40} />
            <Bar dataKey="notice" name="Notice period" stackId="s" fill={C.amber} maxBarSize={40} />
            <Bar dataKey="offboarding" name="Offboarding" stackId="s" fill={C.red} maxBarSize={40} />
            <Bar dataKey="inactive" name="Inactive" stackId="s" fill={C.gray} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Platform growth" sub="Cumulative users and companies (last 6 months)">
          <Legend items={[['Users', C.teal], ['Companies', C.blue]]} />
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={growthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="totalUsers" name="Users" stroke={C.teal} fill={C.lightTeal} strokeWidth={2} dot={{ r: 3, fill: C.teal }} />
              <Area type="monotone" dataKey="totalCompanies" name="Companies" stroke={C.blue} fill={C.lightBlue} strokeWidth={2} dot={{ r: 3, fill: C.blue }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Audit performance" sub="Closed vs overdue per company">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Total', val: kpis.totalAudits, color: '#374151' },
              { label: 'Closed', val: kpis.closedAudits, color: '#3B6D11' },
              { label: 'Overdue', val: kpis.overdueAudits, color: '#A32D2D' },
            ].map((k) => (
              <div key={k.label} className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">{k.label}</p>
                <p className="text-xl font-semibold" style={{ color: k.color }}>{k.val}</p>
              </div>
            ))}
          </div>
          {auditChartData.length > 0 ? (
            <>
              <Legend items={[['Closed', C.green], ['Overdue', C.red]]} />
              <ResponsiveContainer width="100%" height={Math.max(80, auditChartData.length * 36)}>
                <BarChart data={auditChartData} layout="vertical" barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="closed" name="Closed" fill={C.green} radius={[0, 4, 4, 0]} maxBarSize={16} />
                  <Bar dataKey="overdue" name="Overdue" fill={C.red} radius={[0, 4, 4, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="flex items-center justify-center h-20 text-xs text-gray-400">No audit data yet</div>
          )}
        </ChartCard>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
          <p className="text-sm font-semibold text-gray-700">Company health ranking</p>
          <p className="text-xs text-gray-400">Sorted by activity</p>
        </div>
        {[...companies]
          .sort((a, b) => {
            const aL = companyLastLogin[a.id];
            const bL = companyLastLogin[b.id];
            if (aL && bL) return bL - aL;
            if (aL) return -1;
            if (bL) return 1;
            return 0;
          })
          .map((c, i) => {
            const status = activityStatus(c.id, c.employeeCount);
            const userCount = companyUserCount[c.id] || 0;
            const lastLogin = companyLastLogin[c.id];
            const auditStat = auditStats[c.id];
            return (
              <div
                key={c.id}
                className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => navigate(`/company/${c.id}/dashboard`)}
              >
                <span className="text-xs text-gray-300 w-4 flex-shrink-0">{i + 1}</span>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                  style={{ background: c.color || C.teal }}
                >
                  {c.initials || '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400">
                    {c.employeeCount || 0} employees · {userCount} users
                    {auditStat?.total ? ` · ${auditStat.closed}/${auditStat.total} audits closed` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1.5 justify-end">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: status.dot }} />
                    <span className="text-xs font-medium" style={{ color: status.color }}>{status.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Last login: {formatDate(lastLogin)}</p>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
