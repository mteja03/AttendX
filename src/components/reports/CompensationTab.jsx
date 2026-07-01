import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import EmptyState from '../EmptyState';
import EmployeeAvatar from '../EmployeeAvatar';
import { formatLakhs } from '../../utils';
import { REPORT_FILTER_SELECT } from '../../utils/reportHelpers';

export default function CompensationTab({
  companyId,
  locationFilteredEmployees,
  compensationData,
  filterLocation,
  setFilterLocation,
  structuredLocations,
  handlePrintReport,
  handleCompensationExcel,
}) {
  const navigate = useNavigate();

  if (locationFilteredEmployees.filter((e) => e.ctcPerAnnum || e.ctc).length === 0) {
    return (
      <EmptyState
        illustration={
          <div className="w-16 h-16 rounded-2xl bg-[#EEEDFE] flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <circle cx="18" cy="18" r="12" fill="#CECBF6" />
              <path d="M18 11v2M18 23v2" stroke="#534AB7" strokeWidth="1.8" strokeLinecap="round" />
              <path
                d="M14 15c0-1.1.9-2 2-2h4a2 2 0 010 4H16a2 2 0 000 4h4a2 2 0 002-2"
                stroke="#534AB7"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
        }
        title="No salary data yet"
        description="Add CTC per annum to employee profiles to see compensation breakdowns."
        actionColor="#534AB7"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className={REPORT_FILTER_SELECT}>
          <option value="">All locations</option>
          {structuredLocations.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Monthly Payroll',
            value: `₹${formatLakhs(compensationData.totalPayroll / 12)}`,
            sub: `₹${formatLakhs(compensationData.totalPayroll)} per annum`,
            icon: '💰',
          },
          {
            label: 'Average Salary',
            value: `₹${formatLakhs(compensationData.avgSalary)}`,
            sub: 'Annual gross per employee',
            icon: '📊',
          },
          {
            label: 'PF Enrolled',
            value: compensationData.pfCount,
            sub: `of ${compensationData.activeCount} employees`,
            icon: '🏦',
          },
          {
            label: 'ESIC Enrolled',
            value: compensationData.esicCount,
            sub: `of ${compensationData.activeCount} employees`,
            icon: '🏥',
          },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-500">{card.label}</p>
              <span className="text-xl">{card.icon}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Salary Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={compensationData.salaryDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#1B6B6B" radius={[4, 4, 0, 0]} name="Employees" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Average Salary by Department</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={compensationData.deptSalaryData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis type="number" tickFormatter={(v) => `₹${formatLakhs(v)}`} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="dept" tick={{ fontSize: 10 }} width={80} />
              <Tooltip formatter={(v) => `₹${formatLakhs(v)}`} />
              <Bar dataKey="avg" fill="#4ECDC4" radius={[0, 4, 4, 0]} name="Avg Salary" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Compensation by Department</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Department', 'Employees', 'Min Salary', 'Max Salary', 'Avg Salary', 'Total Cost (Annual)'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 pb-3 pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compensationData.deptSalaryData.map((row) => (
                <tr key={row.dept} className="border-b border-gray-50">
                  <td className="py-3 pr-4 font-medium text-gray-800">{row.dept}</td>
                  <td className="py-3 pr-4 text-gray-500">{row.count}</td>
                  <td className="py-3 pr-4 text-gray-500">₹{formatLakhs(row.min)}</td>
                  <td className="py-3 pr-4 text-gray-500">₹{formatLakhs(row.max)}</td>
                  <td className="py-3 pr-4 font-medium text-gray-700">₹{formatLakhs(row.avg)}</td>
                  <td className="py-3 pr-4 text-[#1B6B6B] font-medium">₹{formatLakhs(row.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200">
                <td className="py-3 font-bold text-gray-800">Total</td>
                <td className="py-3 font-bold">{compensationData.activeCount}</td>
                <td colSpan={3} />
                <td className="py-3 font-bold text-[#1B6B6B]">₹{formatLakhs(compensationData.totalPayroll)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Employee Compensation Details</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Employee', 'Department', 'Designation', 'Annual Gross Salary', 'Monthly', 'Incentive/mo', 'PF', 'ESIC'].map((h) => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-400 pb-3 pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...compensationData.allEmps]
                .sort((a, b) => (Number(b.ctcPerAnnum) || 0) - (Number(a.ctcPerAnnum) || 0))
                .map((emp) => (
                  <tr
                    key={emp.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <EmployeeAvatar employee={emp} size="xs" />
                        <span className="font-medium text-gray-800">{emp.fullName}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{emp.department || '—'}</td>
                    <td className="py-3 pr-4 text-gray-500">{emp.designation || '—'}</td>
                    <td className="py-3 pr-4 font-medium text-gray-800">
                      {emp.ctcPerAnnum ? `₹${formatLakhs(Number(emp.ctcPerAnnum))}` : '—'}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">
                      {emp.ctcPerAnnum ? `₹${formatLakhs(Number(emp.ctcPerAnnum) / 12)}` : '—'}
                    </td>
                    <td className="py-3 pr-4 text-gray-500">
                      {emp.incentive ? `₹${formatLakhs(Number(emp.incentive))}` : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      {emp.pfApplicable ? (
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Yes</span>
                      ) : (
                        <span className="text-xs text-gray-300">No</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {emp.esicApplicable ? (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">Yes</span>
                      ) : (
                        <span className="text-xs text-gray-300">No</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handlePrintReport('compensation')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
        >
          🖨️ Print Report
        </button>
        <button
          type="button"
          onClick={handleCompensationExcel}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]"
        >
          ⬇️ Download Excel
        </button>
      </div>
    </div>
  );
}
