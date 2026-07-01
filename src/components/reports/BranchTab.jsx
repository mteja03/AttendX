import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { REPORT_FILTER_SELECT } from '../../utils/reportHelpers';

export default function BranchTab({
  branchAnalytics,
  filterLocation,
  setFilterLocation,
  structuredLocations,
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-[#1B6B6B]">
          <option value="">All locations</option>
          {structuredLocations.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
        <span className="text-xs text-gray-400">{branchAnalytics.length} branch{branchAnalytics.length !== 1 ? 'es' : ''}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total branches', value: branchAnalytics.length, color: 'bg-[#E1F5EE] text-[#0F6E56]' },
          { label: 'Total employees', value: branchAnalytics.reduce((s, b) => s + b.employees, 0), color: 'bg-blue-50 text-blue-700' },
          { label: 'Total asset value', value: `₹${(branchAnalytics.reduce((s, b) => s + b.assetValue, 0) / 100000).toFixed(1)}L`, color: 'bg-amber-50 text-amber-700' },
          { label: 'Avg per branch', value: branchAnalytics.length ? Math.round(branchAnalytics.reduce((s, b) => s + b.employees, 0) / branchAnalytics.length) : 0, color: 'bg-purple-50 text-purple-700' },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-xl p-3 ${kpi.color}`}>
            <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">{kpi.label}</p>
            <p className="text-lg font-semibold mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Employees by branch</h3>
        <ResponsiveContainer width="100%" height={Math.max(250, branchAnalytics.length * 32)}>
          <BarChart data={branchAnalytics.slice(0, 20)} layout="vertical" margin={{ left: 100, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} />
            <Bar dataKey="employees" fill="#1B6B6B" radius={[0, 4, 4, 0]} name="Employees" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Branch scorecard</h3>
          <span className="text-xs text-gray-400">{branchAnalytics.length} branches</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Branch', 'Location', 'Employees', 'Active', 'Depts', 'Avg salary', 'Assets', 'Branch assets', 'Asset value', 'Leaves'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {branchAnalytics.map((b) => (
                <tr key={b.name} className="hover:bg-[#E8F5F5]/20">
                  <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap">{b.name}</td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{b.location}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{b.employees}</td>
                  <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[10px] font-medium">{b.active}</span></td>
                  <td className="px-3 py-2.5 text-gray-500">{b.departments.size}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{b.salaryCount > 0 ? `₹${Math.round(b.totalSalary / b.salaryCount).toLocaleString('en-IN')}` : '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{b.assetCount}</td>
                  <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 rounded bg-[#E1F5EE] text-[#0F6E56] text-[10px] font-medium">{b.branchAssetCount}</span></td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{b.assetValue > 0 ? `₹${(b.assetValue / 1000).toFixed(0)}K` : '—'}</td>
                  <td className="px-3 py-2.5 text-gray-600">{b.leaveCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
