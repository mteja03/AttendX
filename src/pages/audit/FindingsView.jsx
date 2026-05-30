import { useState, useMemo } from 'react';

export default function FindingsView({ audits, onSelect = () => {} }) {
  const [severityFilter, setSeverityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  const allFindings = useMemo(() => {
    const rows = [];
    (audits || []).forEach((a) => {
      (a.findings || []).forEach((f) => {
        rows.push({
          ...f,
          auditRefId: a.auditRefId || a.id,
          auditTypeName: a.auditTypeName || '—',
          branch: a.branch || a.location || '—',
          location: a.location || '',
          auditId: a.id,
        });
      });
    });
    return rows.sort((a, b) => {
      const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9);
    });
  }, [audits]);

  const findingMonths = useMemo(() => {
    const months = new Set();
    allFindings.forEach((f) => { if (f.createdAt) months.add(String(f.createdAt).slice(0, 7)); });
    return [...months].sort().reverse();
  }, [allFindings]);

  const findingBranches = useMemo(() => [...new Set(allFindings.map((f) => f.branch).filter((b) => b && b !== '—'))].sort(), [allFindings]);
  const findingLocations = useMemo(() => [...new Set(allFindings.map((f) => f.location).filter(Boolean))].sort(), [allFindings]);

  const filtered = useMemo(() => allFindings.filter((f) => {
    if (severityFilter !== 'All' && f.severity !== severityFilter) return false;
    if (statusFilter !== 'All' && f.status !== statusFilter) return false;
    if (monthFilter && (!f.createdAt || !String(f.createdAt).startsWith(monthFilter))) return false;
    if (branchFilter && f.branch !== branchFilter) return false;
    if (locationFilter && f.location !== locationFilter) return false;
    return true;
  }), [allFindings, severityFilter, statusFilter, monthFilter, branchFilter, locationFilter]);

  const counts = useMemo(() => ({
    Critical: allFindings.filter((f) => f.severity === 'Critical').length,
    High: allFindings.filter((f) => f.severity === 'High').length,
    Medium: allFindings.filter((f) => f.severity === 'Medium').length,
    Low: allFindings.filter((f) => f.severity === 'Low').length,
    Open: allFindings.filter((f) => f.status !== 'Resolved').length,
    Resolved: allFindings.filter((f) => f.status === 'Resolved').length,
  }), [allFindings]);

  const SEV_STYLE = {
    Critical: { bar: '#E24B4A', bg: '#FCEBEB', text: '#791F1F' },
    High:     { bar: '#EF9F27', bg: '#FAEEDA', text: '#633806' },
    Medium:   { bar: '#378ADD', bg: '#E6F1FB', text: '#0C447C' },
    Low:      { bar: '#639922', bg: '#EAF3DE', text: '#27500A' },
  };

  const STATUS_STYLE = {
    Resolved:      { bg: '#EAF3DE', text: '#3B6D11' },
    'In Progress': { bg: '#FAEEDA', text: '#854F0B' },
    Open:          { bg: '#FCEBEB', text: '#A32D2D' },
  };

  if (allFindings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4 text-2xl">🔍</div>
        <p className="text-sm font-medium text-gray-700 mb-1">No findings yet</p>
        <p className="text-xs text-gray-400">Findings added during audits will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap gap-2 mb-4">
        {[['Critical', '#FCEBEB', '#791F1F'], ['High', '#FAEEDA', '#633806'], ['Medium', '#E6F1FB', '#0C447C'], ['Low', '#EAF3DE', '#27500A']].map(([sev, bg, color]) => (
          counts[sev] > 0 && (
            <span key={sev} className="text-xs font-medium px-2.5 py-1 rounded-full cursor-pointer" style={{ background: bg, color }} onClick={() => setSeverityFilter(severityFilter === sev ? 'All' : sev)}>
              {sev} {counts[sev]}
              {severityFilter === sev && ' ✕'}
            </span>
          )
        ))}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {findingBranches.length > 0 && (
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:border-[#1B6B6B]">
              <option value="">All branches</option>
              {findingBranches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {findingLocations.length > 0 && (
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:border-[#1B6B6B]">
              <option value="">All locations</option>
              {findingLocations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
          {findingMonths.length > 0 && (
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:border-[#1B6B6B]">
              <option value="">All months</option>
              {findingMonths.map((m) => (
                <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</option>
              ))}
            </select>
          )}
          {['All', 'Open', 'In Progress', 'Resolved'].map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${statusFilter === s ? 'bg-[#1B6B6B] text-white border-[#1B6B6B]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="text-xs text-gray-400 mb-3">{filtered.length} finding{filtered.length !== 1 ? 's' : ''} · {counts.Open} open · {counts.Resolved} resolved</div>
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">No findings match the selected filters</div>
        ) : (
          filtered.map((f, i) => {
            const sev = SEV_STYLE[f.severity] || SEV_STYLE.Low;
            const st = STATUS_STYLE[f.status] || STATUS_STYLE.Open;
            const isLast = i === filtered.length - 1;
            return (
              <div
                key={`${f.auditId}-${f.id}`}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#F8FFFE] transition-colors ${isLast ? '' : 'border-b border-gray-50'}`}
                onClick={() => { const a = (audits || []).find((x) => x.id === f.auditId); if (a) onSelect(a); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') { const a = (audits || []).find((x) => x.id === f.auditId); if (a) onSelect(a); } }}
              >
                <div className="w-0.5 h-9 rounded-full flex-shrink-0" style={{ background: sev.bar, borderRadius: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 font-medium leading-snug truncate">{f.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{f.auditRefId} · {f.branch}{f.ownerName ? ` · ${f.ownerName}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: sev.bg, color: sev.text }}>{f.severity}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.text }}>{f.status || 'Open'}</span>
                  {f.targetDate && <span className="text-xs text-gray-400 hidden sm:inline">{f.targetDate}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
