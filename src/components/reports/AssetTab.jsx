import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import EmptyState from '../EmptyState';
import { CHART_COLORS, REPORT_FILTER_SELECT, downloadReport } from '../../utils/reportHelpers';
import { StatCard, ChartCard, DownloadExcelButton } from './ReportUIComponents';

export default function AssetTab({
  companyId,
  assets,
  assetStats,
  assetByType,
  assetStatusData,
  assetsPerEmployeeRows,
  consumableRows,
  assetsByTypeAndAssignment,
  warrantyExpiring,
  filterLocation,
  setFilterLocation,
  structuredLocations,
  handlePrintReport,
  safeCompanyFile,
}) {
  if (assets.length === 0) {
    return (
      <EmptyState
        illustration={
          <div className="w-16 h-16 rounded-2xl bg-[#E6F1FB] flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect x="6" y="10" width="14" height="18" rx="3" fill="#B5D4F4" />
              <rect x="16" y="6" width="14" height="18" rx="3" fill="#85B7EB" />
              <path d="M8 18h10M8 23h6" stroke="#185FA5" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        }
        title="No assets tracked yet"
        description="Add assets on the Assets page to see assignment stats and utilisation here."
        actionColor="#185FA5"
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className={REPORT_FILTER_SELECT}>
          <option value="">All locations</option>
          {structuredLocations.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard value={assetStats.total} label="Total assets" />
        <StatCard value={assetStats.assigned} label="Assigned (trackable)" />
        <StatCard value={assetStats.available} label="Available (trackable)" />
        <StatCard value={`${assetStats.issued} / ${assetStats.totalStock}`} label="Consumable issued / stock" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Assets by type">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={assetByType}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#1B6B6B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Trackable status breakdown">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={assetStatusData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {assetStatusData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <ChartCard title="Assets per employee">
        <div className="overflow-x-auto -mx-2 px-2">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2">Employee</th>
              <th className="py-2">Emp ID</th>
              <th className="py-2">Count</th>
              <th className="py-2">Assets</th>
            </tr>
          </thead>
          <tbody>
            {assetsPerEmployeeRows.map((r) => (
              <tr key={r.employeeId} className="border-t border-gray-100">
                <td className="py-2">
                  <Link to={`/company/${companyId}/employees/${r.employeeId}`} className="text-[#1B6B6B] hover:underline">
                    {r.empName}
                  </Link>
                </td>
                <td className="py-2">{r.empId}</td>
                <td className="py-2">{r.count}</td>
                <td className="py-2 text-gray-600 text-xs max-w-md truncate" title={r.namesStr}>
                  {r.namesStr}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </ChartCard>
      <ChartCard title="Consumable stock levels">
        <div className="space-y-3">
          {consumableRows.map((c) => {
            const pct = c.stock > 0 ? Math.round((c.available / c.stock) * 100) : 0;
            return (
              <div key={c.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-gray-500">
                    Stock {c.stock} · Issued {c.issued} · Avail {c.available}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#1B6B6B] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          {consumableRows.length === 0 && <p className="text-gray-400 text-sm">No consumable assets</p>}
        </div>
      </ChartCard>

          {/* Employee vs Branch assets */}
          {assetsByTypeAndAssignment.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Assets by type — employee vs branch</h3>
              <p className="text-xs text-gray-400 mb-3">How assets are distributed across employees and branches</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={assetsByTypeAndAssignment} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="employee" stackId="a" fill="#1B6B6B" name="Employee" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="branch" stackId="a" fill="#4ECDC4" name="Branch" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Warranty expiry tracker */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Warranty expiring soon</h3>
            <p className="text-xs text-gray-400 mb-3">Assets with warranty expiring in the next 90 days</p>
            {warrantyExpiring.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-6">No warranties expiring in the next 90 days</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Asset', 'Type', 'Assigned to', 'Expiry', 'Days left'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {warrantyExpiring.map((a) => (
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{a.name}</td>
                        <td className="px-3 py-2 text-gray-500">{a.type}</td>
                        <td className="px-3 py-2 text-gray-600">{a.assignedTo}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{a.expiryDate}</td>
                        <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${a.daysLeft <= 30 ? 'bg-red-50 text-red-600' : a.daysLeft <= 60 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-700'}`}>{a.daysLeft} days</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => handlePrintReport('asset')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          🖨️ Print Report
        </button>
        <DownloadExcelButton
          onClick={() =>
            downloadReport(safeCompanyFile, 'Assets', assets, [
              { header: 'Type', accessor: (a) => a.type || '' },
              { header: 'Name', accessor: (a) => a.name || '' },
              { header: 'Mode', accessor: (a) => a.mode || 'trackable' },
              { header: 'Status', accessor: (a) => a.status || '' },
              { header: 'Asset ID', accessor: (a) => a.assetId || '' },
            ])
          }
        />
      </div>
    </>
  );
}
