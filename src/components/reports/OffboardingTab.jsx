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
import { CHART_COLORS } from '../../utils/reportHelpers';
import { StatCard, ChartCard, DownloadExcelButton } from './ReportUIComponents';

export default function OffboardingTab({
  companyId,
  employees,
  offboardingReportStats,
  exitReasons,
  monthlyExits,
  inNoticePeriodByStatus,
  noticePeriodReportRows,
  activeOffboardingRows,
  withdrawnOffboardingRows,
  completedOffboardingRows,
  handlePrintReport,
  handleOffboardingExcel,
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
        title="No offboarding data yet"
        description="Employees in notice period or with exit tasks will show up here."
        actionColor="#3B6D11"
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard value={offboardingReportStats.inNotice} label="Currently in Notice Period" />
        <StatCard value={offboardingReportStats.exitTasks} label="Exit tasks in progress" />
        <StatCard value={offboardingReportStats.exitsThisMonth} label="Exits this month" />
        <StatCard value={offboardingReportStats.withdrawnThisMonth} label="Withdrawn this month" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Exit reasons">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={exitReasons} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {exitReasons.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Exits by month (completed, current year)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyExits}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#1B6B6B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <ChartCard title="Notice Period (employee status)">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2">Employee</th>
                <th className="py-2">Resignation date</th>
                <th className="py-2">Last day</th>
                <th className="py-2">Days remaining</th>
                <th className="py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {inNoticePeriodByStatus.map(({ e, daysRemaining }) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="py-2">
                    <Link to={`/company/${companyId}/employees/${e.id}?tab=offboarding`} className="text-[#1B6B6B] hover:underline">
                      {e.fullName}
                    </Link>
                  </td>
                  <td className="py-2">
                    {toDisplayDate(e.offboarding?.recordedAt) || toDisplayDate(e.offboarding?.resignationDate) || '—'}
                  </td>
                  <td className="py-2">{toDisplayDate(e.offboarding?.expectedLastDay)}</td>
                  <td className="py-2">{daysRemaining}</td>
                  <td className="py-2">{e.offboarding?.reason || e.offboarding?.exitReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {inNoticePeriodByStatus.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No employees with status &quot;Notice Period&quot;.</p>
          )}
        </div>
      </ChartCard>
      <ChartCard title="Notice Period (offboarding phase)">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2">Name</th>
                <th className="py-2">Department</th>
                <th className="py-2">Resigned</th>
                <th className="py-2">Expected last day</th>
                <th className="py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {noticePeriodReportRows.map(({ e }) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="py-2">
                    <Link to={`/company/${companyId}/employees/${e.id}?tab=offboarding`} className="text-[#1B6B6B] hover:underline">
                      {e.fullName}
                    </Link>
                  </td>
                  <td className="py-2">{e.department}</td>
                  <td className="py-2">{toDisplayDate(e.offboarding?.resignationDate)}</td>
                  <td className="py-2">{toDisplayDate(e.offboarding?.expectedLastDay)}</td>
                  <td className="py-2">{e.offboarding?.reason || e.offboarding?.exitReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      <ChartCard title="Exit tasks in progress">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2">Name</th>
                <th className="py-2">Department</th>
                <th className="py-2">Exit date</th>
                <th className="py-2">Days left</th>
                <th className="py-2">Reason</th>
                <th className="py-2">Completion</th>
                <th className="py-2">Pending tasks</th>
              </tr>
            </thead>
            <tbody>
              {activeOffboardingRows.map(({ e, daysLeft, pct, pending }) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="py-2">
                    <Link to={`/company/${companyId}/employees/${e.id}?tab=offboarding`} className="text-[#1B6B6B] hover:underline">
                      {e.fullName}
                    </Link>
                  </td>
                  <td className="py-2">{e.department}</td>
                  <td className="py-2">
                    {toDisplayDate(e.offboarding?.exitDate || e.offboarding?.actualLastDay || e.offboarding?.expectedLastDay)}
                  </td>
                  <td className="py-2">{daysLeft == null ? '—' : daysLeft < 0 ? 'Past' : daysLeft}</td>
                  <td className="py-2">{e.offboarding?.exitReason || e.offboarding?.reason || '—'}</td>
                  <td className="py-2">{pct}%</td>
                  <td className="py-2">{pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      <ChartCard title="Withdrawn">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2">Name</th>
                <th className="py-2">Department</th>
                <th className="py-2">Withdrawn on</th>
              </tr>
            </thead>
            <tbody>
              {withdrawnOffboardingRows.map(({ e }) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="py-2">
                    <Link to={`/company/${companyId}/employees/${e.id}?tab=offboarding`} className="text-[#1B6B6B] hover:underline">
                      {e.fullName}
                    </Link>
                  </td>
                  <td className="py-2">{e.department}</td>
                  <td className="py-2">{toDisplayDate(e.offboarding?.withdrawnOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      <ChartCard title="Completed exits">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2">Name</th>
                <th className="py-2">Department</th>
                <th className="py-2">Exit date</th>
                <th className="py-2">Reason</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {completedOffboardingRows.map(({ e }) => (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="py-2">{e.fullName}</td>
                  <td className="py-2">{e.department}</td>
                  <td className="py-2">{toDisplayDate(e.offboarding?.exitDate)}</td>
                  <td className="py-2">{e.offboarding?.exitReason || '—'}</td>
                  <td className="py-2">{e.status || 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => handlePrintReport('offboarding')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          🖨️ Print Report
        </button>
        <DownloadExcelButton onClick={handleOffboardingExcel} label="Download offboarding report (Excel)" />
      </div>
    </>
  );
}
