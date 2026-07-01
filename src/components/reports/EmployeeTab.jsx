import { useNavigate } from 'react-router-dom';
import { REPORT_FILTER_SELECT, tenureLabel, getOverallPct } from '../../utils/reportHelpers';
import { toDisplayDate } from '../../utils';
import { StatCard } from './ReportUIComponents';

export default function EmployeeTab({
  companyId,
  employees,
  filteredEmployeesForReport,
  employeeSummary,
  filterLocation,
  setFilterLocation,
  structuredLocations,
  empFilterDept,
  setEmpFilterDept,
  empFilterBranch,
  setEmpFilterBranch,
  empFilterStatus,
  setEmpFilterStatus,
  empFilterType,
  setEmpFilterType,
  empFilterYear,
  setEmpFilterYear,
  deptOptions,
  branchOptions,
  activeChecklist,
  totalMandatory,
  defaultTotalMandatory,
  handlePrintReport,
  downloadEmployeeCSV,
  downloadEmployeeExcel,
}) {
  const navigate = useNavigate();

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard value={employeeSummary.total} label="Total" />
        <StatCard value={employeeSummary.active} label="Active" />
        <StatCard value={employeeSummary.inactive} label="Inactive" />
        <StatCard value={employeeSummary.offboarding} label="Offboarding" />
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className={REPORT_FILTER_SELECT}>
          <option value="">All locations</option>
          {structuredLocations.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
        <select value={empFilterDept} onChange={(e) => setEmpFilterDept(e.target.value)} className={REPORT_FILTER_SELECT}>
          {deptOptions.map((d) => (
            <option key={d} value={d}>
              Dept: {d}
            </option>
          ))}
        </select>
        <select value={empFilterBranch} onChange={(e) => setEmpFilterBranch(e.target.value)} className={REPORT_FILTER_SELECT}>
          {branchOptions.map((b) => (
            <option key={b} value={b}>
              Branch: {b}
            </option>
          ))}
        </select>
        <select value={empFilterStatus} onChange={(e) => setEmpFilterStatus(e.target.value)} className={REPORT_FILTER_SELECT}>
          <option value="All">Status: All</option>
          <option value="Active">Active</option>
          <option value="Notice Period">Notice Period</option>
          <option value="Inactive">Inactive</option>
          <option value="On Leave">On Leave</option>
          <option value="Offboarding">Offboarding</option>
        </select>
        <select value={empFilterType} onChange={(e) => setEmpFilterType(e.target.value)} className={REPORT_FILTER_SELECT}>
          <option value="All">Employment: All</option>
          {[...new Set(employees.map((e) => e.employmentType).filter(Boolean))].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={empFilterYear} onChange={(e) => setEmpFilterYear(e.target.value)} className={REPORT_FILTER_SELECT}>
          <option value="All">Join year: All</option>
          {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl overflow-x-auto shadow-sm mb-4">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              {['Emp ID', 'Name', 'Department', 'Designation', 'Branch', 'Location', 'Employment Type', 'Category', 'Joining', 'Tenure', 'Status', 'Onboarding', 'Docs %'].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEmployeesForReport.map((emp) => (
              <tr
                key={emp.id}
                className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
              >
                <td className="px-3 py-2">{emp.empId || '—'}</td>
                <td className="px-3 py-2 font-medium text-[#1B6B6B]">{emp.fullName || '—'}</td>
                <td className="px-3 py-2">{emp.department || '—'}</td>
                <td className="px-3 py-2">{emp.designation || '—'}</td>
                <td className="px-3 py-2">{emp.branch || '—'}</td>
                <td className="px-3 py-2">{emp.location || '—'}</td>
                <td className="px-3 py-2">{emp.employmentType || '—'}</td>
                <td className="px-3 py-2">{emp.category || '—'}</td>
                <td className="px-3 py-2">{toDisplayDate(emp.joiningDate)}</td>
                <td className="px-3 py-2">{tenureLabel(emp.joiningDate)}</td>
                <td className="px-3 py-2">{emp.status || 'Active'}</td>
                <td className="px-3 py-2">{emp.onboarding?.status || 'not_started'}</td>
                <td className="px-3 py-2">{getOverallPct(emp, activeChecklist, totalMandatory || defaultTotalMandatory)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Total showing: {filteredEmployeesForReport.length} of {employees.length} employees
      </p>
      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={() => handlePrintReport('employee')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          🖨️ Print Report
        </button>
        <button type="button" onClick={downloadEmployeeCSV} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
          Download CSV
        </button>
        <button type="button" onClick={downloadEmployeeExcel} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
          Download Excel
        </button>
      </div>
    </>
  );
}
