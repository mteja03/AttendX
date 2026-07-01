import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import EmptyState from '../EmptyState';
import { toDisplayDate } from '../../utils';
import { calculateProRatedAllowance, isMidYearJoinerThisYear } from '../../utils/leaveProration';
import { REPORT_FILTER_SELECT, getAllowanceForType, downloadReport } from '../../utils/reportHelpers';
import { StatCard, ChartCard, DownloadExcelButton } from './ReportUIComponents';

export default function LeaveTab({
  leaveList,
  leaveStats,
  leaveByType,
  monthlyLeave,
  leaveByDept,
  leaveBalanceByEmp,
  locationFilteredEmployees,
  topLeaveEmployees,
  topLeaveTakers,
  absenceByBranch,
  paidLeaveTypes,
  leavePolicyMap,
  currentYear,
  filterLocation,
  setFilterLocation,
  structuredLocations,
  handlePrintReport,
  safeCompanyFile,
  leaveYearList,
}) {
  if (leaveList.length === 0) {
    return (
      <EmptyState
        illustration={
          <div className="w-16 h-16 rounded-2xl bg-[#FAEEDA] flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect x="4" y="6" width="28" height="24" rx="4" fill="#FAC775" />
              <path d="M4 14h28" stroke="#854F0B" strokeWidth="1.5" />
              <path d="M11 6V4M25 6V4" stroke="#854F0B" strokeWidth="2" strokeLinecap="round" />
              <path d="M10 22h16M10 26h10" stroke="#EF9F27" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        }
        title="No leave data yet"
        description="Leave requests will appear here once your team starts submitting them."
        actionColor="#854F0B"
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
        <StatCard value={leaveStats.total} label={`Leave requests (${currentYear})`} />
        <StatCard value={leaveStats.approved} label="Approved" />
        <StatCard value={leaveStats.pending} label="Pending" />
        <StatCard value={leaveStats.rejected} label="Rejected" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Leave by type (total vs approved)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={leaveByType}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" fill="#1B6B6B" name="Total" radius={[4, 4, 0, 0]} />
              <Bar dataKey="approved" fill="#4ECDC4" name="Approved" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Leave trend by month">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={monthlyLeave}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#1B6B6B" strokeWidth={2} dot={{ fill: '#1B6B6B', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Leave requests by department">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={leaveByDept}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={56} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#2BB8B0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <ChartCard title="Leave balance (approved days used vs policy)">
        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="text-left px-2 py-2">Employee</th>
                {paidLeaveTypes.map((lt) => (
                  <th key={lt.shortCode} className="text-left px-2 py-2 whitespace-nowrap">
                    {lt.shortCode} used / total
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locationFilteredEmployees.map((emp) => {
                const row = leaveBalanceByEmp[emp.id];
                if (!row) return null;
                const joinStar = isMidYearJoinerThisYear(emp.joiningDate);
                return (
                  <tr key={emp.id} className="border-t border-gray-100">
                    <td className="px-2 py-1.5">
                      {emp.fullName}
                      {joinStar && (
                        <span className="text-xs text-amber-500 ml-1" title="Pro-rated for joining date">
                          *
                        </span>
                      )}
                    </td>
                    {paidLeaveTypes.map((lt) => {
                      const used = row[lt.shortCode] || 0;
                      const base = getAllowanceForType(lt, leavePolicyMap);
                      const allowed = calculateProRatedAllowance(base, emp.joiningDate);
                      const bad = allowed > 0 && used > allowed;
                      return (
                        <td key={lt.shortCode} className={`px-2 py-1.5 whitespace-nowrap ${bad ? 'text-red-600 font-semibold' : ''}`}>
                          {used} / {allowed}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-2 px-2">* Pro-rated based on joining date (calendar year).</p>
        </div>
      </ChartCard>
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Top 10 Leave Takers (This Year)</h3>
        <div className="space-y-2">
          {topLeaveEmployees.map((emp, i) => (
            <div
              key={emp.employeeId || emp.empId || i}
              className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0"
            >
              <span className="text-sm font-bold text-gray-300 w-6 text-center">{i + 1}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                <p className="text-xs text-gray-400">
                  {emp.department} · {emp.count} request{emp.count !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-[#1B6B6B]">{emp.totalDays} days</span>
              </div>
            </div>
          ))}
          {topLeaveEmployees.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No approved leaves this year</p>
          )}
        </div>
      </div>

          {/* Top leave takers */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Top leave takers</h3>
            <p className="text-xs text-gray-400 mb-3">Most leave days taken (approved) this year</p>
            {topLeaveTakers.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-6">No leave data</p>
            ) : (
              <div className="space-y-1.5">
                {topLeaveTakers.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-gray-50">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${i < 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{t.name}</p>
                      <p className="text-[10px] text-gray-400">{t.department} · {t.branch}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{t.days}<span className="text-[10px] text-gray-400 ml-0.5">days</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Absence rate by branch */}
          {absenceByBranch.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Absence rate by branch</h3>
              <p className="text-xs text-gray-400 mb-3">Leave days as % of total working days</p>
              <ResponsiveContainer width="100%" height={Math.max(200, absenceByBranch.length * 28)}>
                <BarChart data={absenceByBranch} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} formatter={(v) => `${v}%`} />
                  <Bar dataKey="rate" fill="#EF9F27" name="Absence %" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => handlePrintReport('leave')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          🖨️ Print Report
        </button>
        <DownloadExcelButton
          onClick={() =>
            downloadReport(safeCompanyFile, 'Leave', leaveYearList, [
              { header: 'Employee', accessor: (l) => l.employeeName || '' },
              { header: 'Type', accessor: (l) => l.leaveType || '' },
              { header: 'Start', accessor: (l) => toDisplayDate(l.startDate) },
              { header: 'End', accessor: (l) => toDisplayDate(l.endDate) },
              { header: 'Days', accessor: (l) => l.days ?? '' },
              { header: 'Status', accessor: (l) => l.status || '' },
            ])
          }
          label="Download leave report (Excel)"
        />
      </div>
    </>
  );
}
