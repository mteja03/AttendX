import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import EmptyState from '../EmptyState';
import AuditReports from '../../pages/audit/AuditReports';
import { REPORT_FILTER_SELECT } from '../../utils/reportHelpers';

export default function AuditTab({
  audits,
  auditByBranch,
  filterLocation,
  setFilterLocation,
  structuredLocations,
}) {
  if (audits.length === 0) {
    return (
      <EmptyState
        illustration={
          <div className="w-16 h-16 rounded-2xl bg-[#E1F5EE] flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <circle cx="16" cy="16" r="10" stroke="#1B6B6B" strokeWidth="2" />
              <path d="M22 22l8 8" stroke="#1B6B6B" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        }
        title="No audits yet"
        description="Audit reports appear when audits are created and assigned."
        actionColor="#1B6B6B"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className={REPORT_FILTER_SELECT}>
          <option value="">All locations</option>
          {structuredLocations.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
      </div>
      <AuditReports audits={filterLocation ? audits.filter((a) => (a.location || '') === filterLocation) : audits} />

          {/* Audit completion by branch */}
          {auditByBranch.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Audit completion by branch</h3>
              <p className="text-xs text-gray-400 mb-3">Completion rate and average score per branch</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Branch', 'Total', 'Closed', 'Completion', 'Avg score', 'Verified', 'Mismatch'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {auditByBranch.map((b) => (
                      <tr key={b.name} className="hover:bg-[#E8F5F5]/20">
                        <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{b.name}</td>
                        <td className="px-3 py-2 text-gray-600">{b.total}</td>
                        <td className="px-3 py-2 text-gray-600">{b.closed}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${b.completionRate >= 80 ? 'bg-green-500' : b.completionRate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${b.completionRate}%` }} /></div>
                            <span className="text-[10px] font-medium text-gray-600">{b.completionRate}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${b.avgScore >= 80 ? 'bg-green-50 text-green-700' : b.avgScore >= 60 ? 'bg-amber-50 text-amber-700' : b.avgScore > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'}`}>{b.avgScore > 0 ? `${b.avgScore}%` : '—'}</span></td>
                        <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700">{b.verified}</span></td>
                        <td className="px-3 py-2">{b.mismatch > 0 ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600">{b.mismatch}</span> : <span className="text-gray-300">0</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Verification rate chart */}
          {auditByBranch.filter((b) => b.verificationRate !== null).length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Location verification rate</h3>
              <p className="text-xs text-gray-400 mb-3">% of audits where auditor was on-site verified</p>
              <ResponsiveContainer width="100%" height={Math.max(200, auditByBranch.filter((b) => b.verificationRate !== null).length * 28)}>
                <BarChart data={auditByBranch.filter((b) => b.verificationRate !== null)} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} formatter={(v) => `${v}%`} />
                  <Bar dataKey="verificationRate" name="Verified %" radius={[0, 4, 4, 0]}>
                    {auditByBranch.filter((b) => b.verificationRate !== null).map((b, i) => (
                      <Cell key={i} fill={b.verificationRate >= 80 ? '#639922' : b.verificationRate >= 50 ? '#EF9F27' : '#E24B4A'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
    </div>
  );
}
