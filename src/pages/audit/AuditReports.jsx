import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { effStatus, getAuditScore } from './auditHelpers';
import { BranchScoreChart, LocationScoreChart } from './ScoreCharts';

export default function AuditReports({ audits }) {
  const [perfPeriod, setPerfPeriod] = useState('year');
  const [perfBranch, setPerfBranch] = useState('');
  const [perfLocation, setPerfLocation] = useState('');
  const [perfCategory, setPerfCategory] = useState('');

  const perfDateFrom = useMemo(() => {
    const now = new Date();
    if (perfPeriod === 'month') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    if (perfPeriod === '3months') { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString().split('T')[0]; }
    if (perfPeriod === 'year') return `${now.getFullYear()}-01-01`;
    return '';
  }, [perfPeriod]);

  const uniqueBranches = useMemo(() => [...new Set(audits.map((a) => a.branch).filter(Boolean))].sort(), [audits]);
  const uniqueLocations = useMemo(() => [...new Set(audits.map((a) => a.location).filter(Boolean))].sort(), [audits]);

  const perfAudits = useMemo(() => audits.filter((a) => {
    if (perfBranch && a.branch !== perfBranch) return false;
    if (perfLocation && a.location !== perfLocation) return false;
    if (perfCategory && a.auditCategory !== perfCategory) return false;
    if (perfDateFrom) { const end = a.endDate || a.startDate; if (!end || end < perfDateFrom) return false; }
    return true;
  }), [audits, perfBranch, perfLocation, perfCategory, perfDateFrom]);

  const closedAudits = audits.filter((a) => effStatus(a.status) === 'Closed');
  const overallScores = closedAudits.map((a) => getAuditScore(a)).filter((s) => s !== null);
  const overallRate = overallScores.length > 0 ? Math.round(overallScores.reduce((sum, s) => sum + s, 0) / overallScores.length) : null;
  const ratedAudits = audits.filter((a) => a.auditRating);
  const avgRating = ratedAudits.length > 0 ? (ratedAudits.reduce((sum, a) => sum + a.auditRating, 0) / ratedAudits.length).toFixed(1) : null;
  const findingsTotal = audits.reduce((sum, a) => sum + (a.findings || []).length, 0);
  const findingsResolved = audits.reduce((sum, a) => sum + (a.findings || []).filter((f) => f.status === 'Resolved').length, 0);
  const findingsOpen = findingsTotal - findingsResolved;

  const auditorPerf = useMemo(() => {
    const map = {};
    perfAudits.forEach((a) => {
      if (!a.auditorName) return;
      if (!map[a.auditorName]) {
        map[a.auditorName] = { name: a.auditorName, email: a.auditorEmail || '', totalAssigned: 0, closed: 0, inProgress: 0, overdue: 0, scores: [], ratings: [], findings: 0, resolvedFindings: 0, onTime: 0, late: 0, branchMap: {}, locationMap: {} };
      }
      const p = map[a.auditorName];
      p.totalAssigned++;
      if (a.branch) p.branchMap[a.branch] = (p.branchMap[a.branch] || 0) + 1;
      if (a.location) p.locationMap[a.location] = (p.locationMap[a.location] || 0) + 1;
      if (effStatus(a.status) === 'Closed') {
        p.closed++;
        const score = getAuditScore(a);
        if (score !== null) p.scores.push(score);
        if (a.endDate && a.closedAt) {
          const endDate = new Date(a.endDate);
          const closedDate = a.closedAt?.toDate ? a.closedAt.toDate() : new Date(a.closedAt);
          if (closedDate <= endDate) p.onTime++; else p.late++;
        }
      }
      if (effStatus(a.status) === 'In Progress') p.inProgress++;
      if (a.auditRating) p.ratings.push(a.auditRating);
      const now = new Date(); now.setHours(0, 0, 0, 0);
      if (effStatus(a.status) !== 'Closed' && a.endDate && new Date(a.endDate) < now) p.overdue++;
      const f = a.findings || [];
      p.findings += f.length;
      p.resolvedFindings += f.filter((x) => x.status === 'Resolved').length;
    });
    return Object.values(map).map((a) => ({
      ...a,
      avgScore: a.scores.length > 0 ? Math.round(a.scores.reduce((s, v) => s + v, 0) / a.scores.length) : null,
      avgRating: a.ratings.length > 0 ? (a.ratings.reduce((s, v) => s + v, 0) / a.ratings.length).toFixed(1) : null,
      closedRate: a.totalAssigned > 0 ? Math.round((a.closed / a.totalAssigned) * 100) : 0,
      branches: Object.entries(a.branchMap).sort((x, y) => y[1] - x[1]).map(([name, count]) => ({ name, count })),
      locations: Object.entries(a.locationMap).sort((x, y) => y[1] - x[1]).map(([name, count]) => ({ name, count })),
    })).sort((a, b) => b.totalAssigned - a.totalAssigned);
  }, [perfAudits]);

  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), assigned: 0, closed: 0 };
    });
    audits.forEach((a) => {
      const assignedDate = a.startDate || (() => { try { return a.createdAt?.toDate ? a.createdAt.toDate().toISOString().split('T')[0] : null; } catch { return null; } })();
      if (assignedDate) { const m = months.find((x) => x.key === assignedDate.slice(0, 7)); if (m) m.assigned++; }
      if (effStatus(a.status) === 'Closed') {
        let closedDate = null;
        try { if (a.closedAt) closedDate = (a.closedAt?.toDate ? a.closedAt.toDate() : new Date(a.closedAt)).toISOString().split('T')[0]; } catch { /* ignore */ }
        if (!closedDate && a.endDate) closedDate = a.endDate;
        if (closedDate) { const m = months.find((x) => x.key === closedDate.slice(0, 7)); if (m) m.closed++; }
      }
    });
    return months;
  }, [audits]);

  const branchCompliance = useMemo(() => {
    const map = {};
    audits.forEach((a) => {
      const branch = a.branch || '—';
      if (!map[branch]) map[branch] = { branch, total: 0, closed: 0, scores: [], openFindings: 0 };
      map[branch].total++;
      if (effStatus(a.status) === 'Closed') { map[branch].closed++; const score = getAuditScore(a); if (score !== null) map[branch].scores.push(score); }
      map[branch].openFindings += (a.findings || []).filter((f) => f.status !== 'Resolved').length;
    });
    return Object.values(map).map((b) => ({ ...b, avgScore: b.scores.length > 0 ? Math.round(b.scores.reduce((s, v) => s + v, 0) / b.scores.length) : null }))
      .sort((a, b) => { if (a.avgScore === null && b.avgScore === null) return 0; if (a.avgScore === null) return 1; if (b.avgScore === null) return -1; return a.avgScore - b.avgScore; });
  }, [audits]);

  const locationCompliance = useMemo(() => {
    const map = {};
    audits.forEach((a) => {
      const location = a.location || '—';
      if (!map[location]) map[location] = { location, total: 0, closed: 0, scores: [], openFindings: 0 };
      map[location].total++;
      if (effStatus(a.status) === 'Closed') { map[location].closed++; const score = getAuditScore(a); if (score !== null) map[location].scores.push(score); }
      map[location].openFindings += (a.findings || []).filter((f) => f.status !== 'Resolved').length;
    });
    return Object.values(map).map((l) => ({ ...l, avgScore: l.scores.length > 0 ? Math.round(l.scores.reduce((s, v) => s + v, 0) / l.scores.length) : null }))
      .sort((a, b) => { if (a.avgScore === null && b.avgScore === null) return 0; if (a.avgScore === null) return 1; if (b.avgScore === null) return -1; return a.avgScore - b.avgScore; });
  }, [audits]);

  const handleExportAuditorPerf = async () => {
    try {
      const xlsxMod = await import('xlsx');
      const XLSX = xlsxMod.default ?? xlsxMod;
      const { saveAs } = await import('file-saver');
      const rows = auditorPerf.map((ap) => ({
        Auditor: ap.name, Email: ap.email, 'Total Assigned': ap.totalAssigned, Closed: ap.closed, 'In Progress': ap.inProgress, Overdue: ap.overdue,
        'Completion Rate (%)': ap.closedRate, 'Avg Score (%)': ap.avgScore ?? '', 'Avg Rating': ap.avgRating ?? '',
        'Total Findings': ap.findings, 'Resolved Findings': ap.resolvedFindings,
        Branches: ap.branches.map((b) => `${b.name} (${b.count})`).join(', '),
        Locations: ap.locations.map((l) => `${l.name} (${l.count})`).join(', '),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [24, 30, 16, 10, 14, 10, 20, 16, 12, 16, 20, 40, 40].map((w) => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Auditor Performance');
      const period = perfPeriod === 'month' ? 'ThisMonth' : perfPeriod === '3months' ? 'Last3Months' : perfPeriod === 'year' ? 'ThisYear' : 'AllTime';
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([buf], { type: 'application/octet-stream' }), `AuditorPerformance_${period}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (e) {
      if (import.meta.env.DEV) console.error('Export failed', e);
    }
  };

  if (audits.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
        <p className="text-5xl mb-4">📈</p>
        <p className="text-base font-semibold text-gray-700 mb-2">No audits yet</p>
        <p className="text-sm text-gray-400">Reports appear when audits are available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-2">Overall Compliance</p>
          <p className="text-4xl font-bold">{overallRate !== null ? `${overallRate}%` : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">From {closedAudits.length} closed audits</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <p className="text-xs text-blue-600 mb-2">Total Audits</p>
          <p className="text-4xl font-bold text-blue-700">{audits.length}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
          <p className="text-xs text-green-600 mb-2">Closed Audits</p>
          <p className="text-4xl font-bold text-green-700">{closedAudits.length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <p className="text-xs text-amber-600 mb-2">Open Findings</p>
          <p className="text-4xl font-bold text-amber-700">{findingsOpen}</p>
        </div>
        {avgRating && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
            <p className="text-xs text-amber-600 mb-2">⭐ Avg Audit Rating</p>
            <p className="text-4xl font-bold text-amber-700">{avgRating}<span className="text-lg">/5</span></p>
            <p className="text-xs text-amber-400 mt-1">From {ratedAudits.length} rated audits</p>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-700">📈 Monthly Trend</h3>
          <span className="text-xs text-gray-400">Last 12 months</span>
        </div>
        <p className="text-xs text-gray-400 mb-4">Audits assigned vs closed per month</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={monthlyTrend} barSize={12} barGap={2} margin={{ top: 0, right: 0, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ border: '0.5px solid #E5E7EB', borderRadius: 8, fontSize: 12, boxShadow: 'none', padding: '6px 10px' }} cursor={{ fill: '#F9FAFB' }} />
            <Bar dataKey="assigned" name="Assigned" fill="#D3D1C7" radius={[3, 3, 0, 0]} />
            <Bar dataKey="closed" name="Closed" fill="#1B6B6B" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#D3D1C7' }} />Assigned</span>
          <span className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-3 h-3 rounded-sm inline-block bg-[#1B6B6B]" />Closed</span>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">👤 Auditor Performance</h3>
          {auditorPerf.length > 0 && (
            <button type="button" onClick={handleExportAuditorPerf}
              className="flex items-center gap-1.5 text-xs border border-[#9FE1CB] bg-[#E1F5EE] text-[#0F6E56] px-3 py-1.5 rounded-xl hover:bg-[#1B6B6B] hover:text-white hover:border-[#1B6B6B] transition-colors">
              ⬇️ Export Excel
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap p-3 bg-gray-50 border border-gray-100 rounded-xl mb-3">
          <span className="text-xs font-medium text-gray-400">⚙️ Filter</span>
          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />
          {uniqueBranches.length > 0 && (
            <select value={perfBranch} onChange={(e) => setPerfBranch(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:border-[#1B6B6B]">
              <option value="">All branches</option>
              {uniqueBranches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {uniqueLocations.length > 0 && (
            <select value={perfLocation} onChange={(e) => setPerfLocation(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:border-[#1B6B6B]">
              <option value="">All locations</option>
              {uniqueLocations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          <select value={perfCategory} onChange={(e) => setPerfCategory(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:border-[#1B6B6B]">
            <option value="">All categories</option>
            <option value="Internal">🏢 Internal</option>
            <option value="External">🌐 External</option>
          </select>
          {(perfBranch || perfLocation || perfCategory || perfPeriod !== 'year') && (
            <button type="button" onClick={() => { setPerfBranch(''); setPerfLocation(''); setPerfCategory(''); setPerfPeriod('year'); }} className="text-xs text-[#1B6B6B] hover:underline ml-auto">Clear</button>
          )}
        </div>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-400">Period:</span>
          {[{ id: 'month', label: 'This month' }, { id: '3months', label: 'Last 3 months' }, { id: 'year', label: 'This year' }, { id: 'all', label: 'All time' }].map((p) => (
            <button key={p.id} type="button" onClick={() => setPerfPeriod(p.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${perfPeriod === p.id ? 'bg-[#E1F5EE] text-[#0F6E56] border-[#9FE1CB] font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'}`}>
              {p.label}
            </button>
          ))}
          <span className="text-xs text-gray-400 ml-auto">{auditorPerf.length} auditor{auditorPerf.length !== 1 ? 's' : ''} · {perfAudits.length} audits</span>
        </div>
        {auditorPerf.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No data for selected filters</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {auditorPerf.map((ap) => (
              <div key={ap.name} className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4 transition-colors hover:border-gray-200 hover:shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{ap.name?.charAt(0)}</div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{ap.name}</p>
                      <p className="text-xs text-gray-400">{ap.totalAssigned} total audits assigned</p>
                    </div>
                  </div>
                  {ap.avgScore !== null && (
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${ap.avgScore >= 80 ? 'text-green-600' : ap.avgScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{ap.avgScore}%</p>
                      <p className="text-xs text-gray-400">avg score</p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  {[
                    { label: 'Closed', value: ap.closed, color: 'bg-green-50 text-green-700' },
                    { label: 'In Progress', value: ap.inProgress, color: 'bg-blue-50 text-blue-700' },
                    { label: 'Overdue', value: ap.overdue, color: ap.overdue > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500' },
                    { label: 'Findings', value: ap.findings, color: ap.findings > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500' },
                  ].map((s) => (
                    <div key={s.label} className={`rounded-2xl p-2.5 text-center ${s.color}`}>
                      <p className="text-lg font-bold">{s.value}</p>
                      <p className="text-xs mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Completion Rate</span>
                      <span className="text-xs font-medium text-gray-600">{ap.closedRate}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${ap.closedRate >= 80 ? 'bg-green-500' : ap.closedRate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${ap.closedRate}%` }} />
                    </div>
                  </div>
                  {ap.findings > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">Finding Resolution</span>
                        <span className="text-xs font-medium text-gray-600">{ap.resolvedFindings}/{ap.findings}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1B6B6B] rounded-full" style={{ width: `${Math.round((ap.resolvedFindings / ap.findings) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                  {ap.avgRating && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-400">Manager Rating</span>
                      <div className="flex items-center gap-1"><span className="text-amber-400">⭐</span><span className="text-sm font-bold text-amber-600">{ap.avgRating}/5</span></div>
                    </div>
                  )}
                </div>
                {(ap.branches.length > 0 || ap.locations.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                    {ap.branches.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {ap.branches.map(({ name, count }) => (
                          <span key={name} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[#E1F5EE] text-[#0F6E56] border border-[#9FE1CB]">
                            🏢 {name} <span className="font-medium opacity-70">· {count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {ap.locations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {ap.locations.map(({ name, count }) => (
                          <span key={name} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[#E6F1FB] text-[#185FA5] border border-[#B5D4F4]">
                            📍 {name} <span className="font-medium opacity-70">· {count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <BranchScoreChart audits={audits} />
      <LocationScoreChart audits={audits} />

      {locationCompliance.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">📍 Location Compliance Ranking</h3>
              <p className="text-xs text-gray-400 mt-0.5">Sorted by lowest score — worst performers first</p>
            </div>
            <span className="text-xs text-gray-400">{locationCompliance.length} location{locationCompliance.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px]" style={{ tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: '30%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /><col style={{ width: '25%' }} /><col style={{ width: '15%' }} /></colgroup>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Location', 'Total', 'Closed', 'Avg Score', 'Open Findings'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {locationCompliance.map((l) => {
                  const scoreColor = l.avgScore === null ? 'text-gray-300' : l.avgScore >= 80 ? 'text-green-600' : l.avgScore >= 60 ? 'text-amber-600' : 'text-red-600';
                  const barColor = l.avgScore === null ? '#D3D1C7' : l.avgScore >= 80 ? '#639922' : l.avgScore >= 60 ? '#EF9F27' : '#E24B4A';
                  return (
                    <tr key={l.location} className={`hover:bg-gray-50/80 transition-colors ${l.avgScore !== null && l.avgScore < 60 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-5 py-3.5"><div className="flex items-center gap-2.5 min-w-0"><div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: barColor }} /><span className="text-sm font-medium text-gray-800 truncate">{l.location}</span></div></td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{l.total}</td>
                      <td className="px-5 py-3.5"><span className="text-sm text-gray-600">{l.closed}</span><span className="text-xs text-gray-400 ml-1">({l.total > 0 ? Math.round((l.closed / l.total) * 100) : 0}%)</span></td>
                      <td className="px-5 py-3.5">
                        {l.avgScore !== null ? (
                          <div className="flex items-center gap-2"><span className={`text-sm font-bold ${scoreColor}`}>{l.avgScore}%</span><div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[64px]"><div className="h-full rounded-full" style={{ width: `${l.avgScore}%`, background: barColor }} /></div></div>
                        ) : <span className="text-sm text-gray-300">No closed audits</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {l.openFindings > 0 ? <span className="inline-flex items-center text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full">{l.openFindings} open</span> : <span className="text-sm text-green-600 font-medium">✓ Clear</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {branchCompliance.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">🏢 Branch Compliance Ranking</h3>
              <p className="text-xs text-gray-400 mt-0.5">Sorted by lowest score — worst performers first</p>
            </div>
            <span className="text-xs text-gray-400">{branchCompliance.length} branch{branchCompliance.length !== 1 ? 'es' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px]" style={{ tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: '30%' }} /><col style={{ width: '15%' }} /><col style={{ width: '15%' }} /><col style={{ width: '25%' }} /><col style={{ width: '15%' }} /></colgroup>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Branch', 'Total', 'Closed', 'Avg Score', 'Open Findings'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {branchCompliance.map((b) => {
                  const scoreColor = b.avgScore === null ? 'text-gray-300' : b.avgScore >= 80 ? 'text-green-600' : b.avgScore >= 60 ? 'text-amber-600' : 'text-red-600';
                  const barColor = b.avgScore === null ? '#D3D1C7' : b.avgScore >= 80 ? '#639922' : b.avgScore >= 60 ? '#EF9F27' : '#E24B4A';
                  return (
                    <tr key={b.branch} className={`hover:bg-gray-50/80 transition-colors ${b.avgScore !== null && b.avgScore < 60 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-5 py-3.5"><div className="flex items-center gap-2.5 min-w-0"><div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: barColor }} /><span className="text-sm font-medium text-gray-800 truncate">{b.branch}</span></div></td>
                      <td className="px-5 py-3.5 text-sm text-gray-600">{b.total}</td>
                      <td className="px-5 py-3.5"><span className="text-sm text-gray-600">{b.closed}</span><span className="text-xs text-gray-400 ml-1">({b.total > 0 ? Math.round((b.closed / b.total) * 100) : 0}%)</span></td>
                      <td className="px-5 py-3.5">
                        {b.avgScore !== null ? (
                          <div className="flex items-center gap-2"><span className={`text-sm font-bold ${scoreColor}`}>{b.avgScore}%</span><div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[64px]"><div className="h-full rounded-full" style={{ width: `${b.avgScore}%`, background: barColor }} /></div></div>
                        ) : <span className="text-sm text-gray-300">No closed audits</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        {b.openFindings > 0 ? <span className="inline-flex items-center text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full">{b.openFindings} open</span> : <span className="text-sm text-green-600 font-medium">✓ Clear</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
