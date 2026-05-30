import { useState, useMemo } from 'react';
import { effStatus, formatDate, getAuditScore } from './auditHelpers';

export default function AuditHistory({ audits, company }) {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  const filteredAudits = useMemo(() => {
    return audits
      .filter((a) => {
        if (selectedBranch && a.branch !== selectedBranch) return false;
        const end = a.endDate || a.dueDate;
        if (!end) return false;
        if (dateFrom && new Date(end) < new Date(dateFrom)) return false;
        if (dateTo && new Date(end) > new Date(dateTo)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.endDate || b.dueDate || 0) - new Date(a.endDate || a.dueDate || 0));
  }, [audits, selectedBranch, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-2 flex-wrap">
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20"
        >
          <option value="">All Branches</option>
          {(company?.branches || []).map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20"
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-gray-100">
        <div className="min-w-[800px] bg-white rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr_100px_120px_100px_80px_80px] gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
            {['Audit', 'Branch', 'Auditor', 'End Date', 'Status', 'Score', 'Rating', 'Findings'].map((h) => (
              <p key={h} className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</p>
            ))}
          </div>
          <div className="divide-y divide-gray-50">
            {filteredAudits.map((audit) => {
              const score = getAuditScore(audit);
              const openF = (audit.findings || []).filter((f) => f.status !== 'Resolved').length;
              return (
                <div key={audit.id} className="grid grid-cols-[1fr_1fr_1fr_100px_120px_100px_80px_80px] gap-3 px-5 py-3.5 items-center">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-gray-400">{audit.auditRefId}</p>
                    <p className="text-sm font-medium truncate">{audit.auditTypeName}</p>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{audit.branch || '—'}</p>
                  <p className="text-sm text-gray-600 truncate">{audit.auditorName || '—'}</p>
                  <p className="text-sm text-gray-600">{formatDate(audit.endDate)}</p>
                  <p className="text-sm text-gray-600">{effStatus(audit.status)}</p>
                  <p className="text-sm text-gray-600">{score === null ? '—' : `${score}%`}</p>
                  <div>
                    {audit.auditRating ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-amber-400">{'⭐'.repeat(audit.auditRating)}</span>
                        <span className="text-xs text-gray-400">{audit.auditRating}/5</span>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-300">—</p>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{openF || '—'}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
