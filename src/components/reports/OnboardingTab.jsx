import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import EmptyState from '../EmptyState';
import { toDisplayDate } from '../../utils';
import { CHART_COLORS, tenureLabel, downloadReport } from '../../utils/reportHelpers';
import { StatCard, ChartCard, DownloadExcelButton } from './ReportUIComponents';

export default function OnboardingTab({
  companyId,
  employees,
  onboardingStats,
  onboardingDonutData,
  deptOnboardingAvg,
  newJoinersTable,
  handlePrintReport,
  safeCompanyFile,
}) {
  if (employees.length === 0) {
    return (
      <EmptyState
        illustration={
          <div className="w-16 h-16 rounded-2xl bg-[#EAF3DE] flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="13" r="6" fill="#C0DD97" />
              <path
                d="M8 32c0-5.523 4.477-10 10-10s10 4.477 10 10"
                stroke="#3B6D11"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="27" cy="24" r="5" fill="#639922" />
              <path
                d="M25 24l1.5 1.5 3-3"
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        }
        title="No onboarding data yet"
        description="Start employee onboarding from the employee profile to see progress here."
        actionColor="#3B6D11"
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard value={onboardingStats.started} label="Onboardings started" />
        <StatCard value={onboardingStats.completed} label="Completed" />
        <StatCard value={onboardingStats.inProgress} label="In progress" />
        <StatCard value={onboardingStats.notStarted} label="Not started" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Onboarding status">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={onboardingDonutData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {onboardingDonutData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Average onboarding completion % by department">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={deptOnboardingAvg}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={56} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="avg" fill="#4ECDC4" name="Avg %" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <ChartCard title="New joiners (last 90 days)">
        <div className="overflow-x-auto -mx-2 px-2">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2">Name</th>
              <th className="py-2">Joining Date</th>
              <th className="py-2">Tenure</th>
              <th className="py-2">Onboarding %</th>
              <th className="py-2">Status</th>
              <th className="py-2">Tasks left</th>
            </tr>
          </thead>
          <tbody>
            {newJoinersTable.map(({ e, pct, left, status }) => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="py-2">
                  <Link className="text-[#1B6B6B] hover:underline" to={`/company/${companyId}/employees/${e.id}?tab=onboarding`}>
                    {e.fullName}
                  </Link>
                </td>
                <td className="py-2">{toDisplayDate(e.joiningDate)}</td>
                <td className="py-2">{tenureLabel(e.joiningDate)}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2 w-32">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${status === 'Completed' ? 'bg-green-500' : status === 'In Progress' ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs">{pct}%</span>
                  </div>
                </td>
                <td className="py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      status === 'Completed' ? 'bg-green-100 text-green-800' : status === 'In Progress' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {status}
                  </span>
                </td>
                <td className="py-2">{left}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </ChartCard>
      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => handlePrintReport('onboarding')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          🖨️ Print Report
        </button>
        <DownloadExcelButton
          onClick={() =>
            downloadReport(safeCompanyFile, 'Onboarding', newJoinersTable, [
              { header: 'Name', accessor: (r) => r.e.fullName || '' },
              { header: 'Joining Date', accessor: (r) => toDisplayDate(r.e.joiningDate) },
              { header: 'Tenure', accessor: (r) => tenureLabel(r.e.joiningDate) },
              { header: 'Onboarding %', accessor: (r) => r.pct },
              { header: 'Status', accessor: (r) => r.status },
              { header: 'Tasks left', accessor: (r) => r.left },
            ])
          }
        />
      </div>
    </>
  );
}
