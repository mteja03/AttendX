import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
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
import { getOverallPct, getMissingMandatoryNames, downloadReport } from '../../utils/reportHelpers';
import { WhatsAppButton } from '../../utils/whatsapp';
import { StatCard, ChartCard, DownloadExcelButton } from './ReportUIComponents';

export default function DocumentTab({
  companyId,
  employees,
  docStats,
  completionBuckets,
  missingDocTableRows,
  activeChecklist,
  totalMandatory,
  defaultTotalMandatory,
  handlePrintReport,
  safeCompanyFile,
}) {
  const navigate = useNavigate();

  const progressBarClass = useCallback((pct) => {
    if (pct <= 25) return 'bg-red-500';
    if (pct <= 75) return 'bg-amber-500';
    if (pct < 100) return 'bg-blue-500';
    return 'bg-green-500';
  }, []);

  if (employees.length === 0) {
    return (
      <EmptyState
        illustration={
          <div className="w-16 h-16 rounded-2xl bg-[#F1EFE8] flex items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect x="8" y="4" width="20" height="28" rx="3" fill="#D3D1C7" />
              <path d="M13 12h10M13 17h10M13 22h7" stroke="#5F5E5A" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        }
        title="No document data yet"
        description="Document completion stats will appear once employees and document types are set up."
        actionColor="#5F5E5A"
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard value={docStats.full} label="100% mandatory docs" />
        <StatCard value={docStats.missing} label="With missing mandatory" />
        <StatCard value={docStats.totalDocs} label="Total documents uploaded" />
        <StatCard value={docStats.mostMissing} label="Most missing doc type" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Document completion distribution">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={completionBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#1B6B6B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <ChartCard title="Employees with missing mandatory documents">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-gray-600 border-b">
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Emp ID</th>
                <th className="py-2 px-2">Department</th>
                <th className="py-2 px-2">Completion</th>
                <th className="py-2 px-2">Missing</th>
                <th className="py-2 px-2 w-24">Remind</th>
              </tr>
            </thead>
            <tbody>
              {missingDocTableRows.map(({ emp, pct, missing }) => (
                <tr
                  key={emp.id}
                  className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/company/${companyId}/employees/${emp.id}?tab=documents`)}
                >
                  <td className="py-2 px-2 font-medium text-[#1B6B6B]">{emp.fullName}</td>
                  <td className="py-2 px-2">{emp.empId}</td>
                  <td className="py-2 px-2">{emp.department}</td>
                  <td className="py-2 px-2 w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${progressBarClass(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs w-8">{pct}%</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-600 max-w-xs">{missing.slice(0, 5).join(', ')}{missing.length > 5 ? '…' : ''}</td>
                  <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                    {(emp.mobile || emp.phone || emp.mobileNumber) && missing.length > 0 ? (
                      <WhatsAppButton
                        phone={emp.mobile || emp.phone || emp.mobileNumber}
                        message={
                          `Dear ${emp.fullName} Garu,\n\n` +
                          `This is a reminder from HR Department.\n\n` +
                          `The following mandatory document is pending submission:\n\n` +
                          `📄 *${missing.join(', ')}*\n\n` +
                          `Please submit it at the earliest convenience.\n\n` +
                          `Thank you,\nHR Team`
                        }
                        size="xs"
                        label="Remind"
                      />
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      <div className="mt-4 flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => handlePrintReport('document')}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          🖨️ Print Report
        </button>
        <DownloadExcelButton
          onClick={() =>
            downloadReport(
              safeCompanyFile,
              'Documents',
              employees.map((e) => ({ e, pct: getOverallPct(e, activeChecklist, totalMandatory || defaultTotalMandatory), missing: getMissingMandatoryNames(e, activeChecklist) })),
              [
                { header: 'Emp ID', accessor: (r) => r.e.empId || '' },
                { header: 'Name', accessor: (r) => r.e.fullName || '' },
                { header: 'Department', accessor: (r) => r.e.department || '' },
                { header: 'Completion %', accessor: (r) => r.pct },
                { header: 'Missing mandatory', accessor: (r) => r.missing.join('; ') },
              ],
            )
          }
        />
      </div>
    </>
  );
}
