import { useNavigate } from 'react-router-dom';
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
import { formatLakhs } from '../../utils';
import { CHART_COLORS, REPORT_FILTER_SELECT } from '../../utils/reportHelpers';
import { StatCard, ChartCard, DownloadExcelButton } from './ReportUIComponents';

export default function HeadcountTab({
  companyId,
  employees,
  headcountStats,
  deptData,
  typeData,
  categoryData,
  genderData,
  tenureData,
  branchData,
  locationData,
  attritionTrend,
  tenureDistribution,
  roleVacancyData,
  roleVacancySummary,
  filterLocation,
  setFilterLocation,
  structuredLocations,
  handlePrintReport,
  handleHeadcountExcel,
}) {
  const navigate = useNavigate();

  if (employees.length === 0) {
    return (
      <EmptyState
        illustration={
          <div className="w-16 h-16 rounded-2xl bg-[#E1F5EE] flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect x="4" y="20" width="6" height="12" rx="2" fill="#9FE1CB" />
              <rect x="13" y="12" width="6" height="20" rx="2" fill="#5DCAA5" />
              <rect x="22" y="6" width="6" height="26" rx="2" fill="#1B6B6B" />
            </svg>
          </div>
        }
        title="No headcount data yet"
        description="Add employees to see department breakdown, location distribution and headcount trends."
        actionColor="#1B6B6B"
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
        <StatCard value={headcountStats.total} label="Total Employees" />
        <StatCard value={headcountStats.active} label="Active Employees" />
        <StatCard value={headcountStats.onLeaveToday} label="On Leave Today" />
        <StatCard value={headcountStats.newJoiners} label="New Joiners This Month" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Department-wise headcount">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={deptData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#1B6B6B" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Employment type">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={typeData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {typeData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Category breakdown">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={48}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Gender breakdown">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={genderData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={55}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {genderData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Tenure distribution">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={tenureData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#4ECDC4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Branch-wise headcount">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart layout="vertical" data={branchData} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#1B6B6B" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Employees by Location">
          {locationData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No employees have a location set.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={locationData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2BB8B0" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Joins vs Exits trend */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Joins vs exits — last 12 months</h3>
            <p className="text-xs text-gray-400 mb-3">Monthly new hires and departures</p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={attritionTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="joins" fill="#1B6B6B" name="Joins" radius={[4, 4, 0, 0]} />
                <Bar dataKey="exits" fill="#E24B4A" name="Exits" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tenure distribution */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Tenure distribution</h3>
            <p className="text-xs text-gray-400 mb-3">Active employees by years of service</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tenureDistribution} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} />
                <Bar dataKey="count" fill="#2BB8B0" name="Employees" radius={[4, 4, 0, 0]}>
                  {tenureDistribution.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5 mt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Designation Vacancy Analysis</h3>
          <div className="flex gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              {roleVacancySummary.totalFilled} filled
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              {roleVacancySummary.totalVacant} vacant
            </span>
          </div>
        </div>
        {roleVacancyData.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">No designations defined yet.</p>
            <button
              type="button"
              onClick={() => navigate(`/company/${companyId}/policies?tab=roles`)}
              className="text-sm text-[#1B6B6B] hover:underline mt-1"
            >
              Go to Library → Designations to add
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {roleVacancyData.map((role) => (
              <div
                key={role.id || role.title}
                className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{role.title}</p>
                  {role.reportsTo && <p className="text-xs text-gray-400">Reports to {role.reportsTo}</p>}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {role.salaryBand?.min != null && role.salaryBand?.min !== '' && (
                    <span className="text-[10px] sm:text-xs text-[#1B6B6B] bg-[#E8F5F5] px-2 py-0.5 rounded-full whitespace-normal text-right leading-tight max-w-[11rem] sm:max-w-none inline-block">
                      ₹{formatLakhs(role.salaryBand.min)}/mo (₹{formatLakhs(Number(role.salaryBand.min) * 12)}pa) – ₹
                      {formatLakhs(role.salaryBand.max)}/mo (₹{formatLakhs(Number(role.salaryBand.max) * 12)}pa)
                    </span>
                  )}
                  <div className="text-right">
                    <span
                      className={`text-sm font-semibold ${role.filled > 0 ? 'text-green-600' : 'text-amber-500'}`}
                    >
                      {role.filled}
                    </span>
                    <span className="text-xs text-gray-400 ml-1">
                      {role.filled === 1 ? 'employee' : 'employees'}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium w-16 text-center ${
                      role.filled > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {role.filled > 0 ? 'Filled' : 'Vacant'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => handlePrintReport('headcount')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          🖨️ Print Report
        </button>
        <DownloadExcelButton onClick={handleHeadcountExcel} />
      </div>
    </>
  );
}
