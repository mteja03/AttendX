import { escapeHtml, createPrintDocument, openPrintWindow } from './printTemplate';
import { formatLakhs, toDisplayDate } from './index';
import { calculateProRatedAllowance } from './leaveProration';
import { getOverallPct, getAllowanceForType, tenureLabel, REPORT_TABS } from './reportHelpers';

export function handlePrintReport(tabId, {
  employees,
  totalMandatory,
  defaultTotalMandatory,
  activeChecklist,
  headcountStats,
  deptData,
  locationData,
  filteredEmployeesForReport,
  compensationData,
  leaveByType,
  monthlyLeave,
  leaveBalanceByEmp,
  paidLeaveTypes,
  leavePolicyMap,
  currentYear,
  assets,
  missingDocTableRows,
  newJoinersTable,
  inNoticePeriodByStatus,
  noticePeriodReportRows,
  activeOffboardingRows,
  withdrawnOffboardingRows,
  completedOffboardingRows,
  companyDisplayName,
  currentUserEmail,
}) {
  const tabMeta = REPORT_TABS.find((t) => t.id === tabId);
  const esc = escapeHtml;
  const total = employees.length || 1;
  const tm = totalMandatory || defaultTotalMandatory;

  let content = '';
  switch (tabId) {
    case 'headcount':
      content = `
        <div class="print-section">
          <div class="print-section-title">Summary</div>
          <div class="print-grid-2">
            <div><div class="print-field-label">Total employees</div><div class="print-field-value">${headcountStats.total}</div></div>
            <div><div class="print-field-label">Active</div><div class="print-field-value">${headcountStats.active}</div></div>
            <div><div class="print-field-label">On leave today</div><div class="print-field-value">${headcountStats.onLeaveToday}</div></div>
            <div><div class="print-field-label">New joiners (MTD)</div><div class="print-field-value">${headcountStats.newJoiners}</div></div>
          </div>
        </div>
        <div class="print-section">
          <div class="print-section-title">Department summary</div>
          <table class="print-table">
            <thead><tr><th>Department</th><th>Employees</th><th>% of total</th></tr></thead>
            <tbody>
            ${deptData
              .map(
                (d) =>
                  `<tr><td>${esc(d.name)}</td><td>${d.count}</td><td>${((d.count / total) * 100).toFixed(0)}%</td></tr>`,
              )
              .join('')}
            </tbody>
          </table>
        </div>
        <div class="print-section">
          <div class="print-section-title">Location summary</div>
          <table class="print-table">
            <thead><tr><th>Location</th><th>Employees</th><th>% of total</th></tr></thead>
            <tbody>
            ${locationData
              .map(
                (d) =>
                  `<tr><td>${esc(d.name)}</td><td>${d.count}</td><td>${((d.count / total) * 100).toFixed(0)}%</td></tr>`,
              )
              .join('')}
            ${locationData.length === 0 ? '<tr><td colspan="3">No location data</td></tr>' : ''}
            </tbody>
          </table>
        </div>`;
      break;
    case 'employee':
      content = `
        <div class="print-section">
          <div class="print-section-title">Employees (${filteredEmployeesForReport.length} shown)</div>
          <table class="print-table">
            <thead><tr>
              <th>Emp ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Branch</th><th>Location</th>
              <th>Employment type</th><th>Category</th><th>Joining</th><th>Tenure</th><th>Status</th><th>Onboarding</th><th>Docs %</th>
            </tr></thead>
            <tbody>
              ${filteredEmployeesForReport
                .map(
                  (emp) =>
                    `<tr>
                      <td>${esc(emp.empId || '—')}</td>
                      <td>${esc(emp.fullName || '—')}</td>
                      <td>${esc(emp.department || '—')}</td>
                      <td>${esc(emp.designation || '—')}</td>
                      <td>${esc(emp.branch || '—')}</td>
                      <td>${esc(emp.location || '—')}</td>
                      <td>${esc(emp.employmentType || '—')}</td>
                      <td>${esc(emp.category || '—')}</td>
                      <td>${esc(toDisplayDate(emp.joiningDate) || '—')}</td>
                      <td>${esc(tenureLabel(emp.joiningDate))}</td>
                      <td>${esc(emp.status || 'Active')}</td>
                      <td>${esc(emp.onboarding?.status || 'not_started')}</td>
                      <td>${getOverallPct(emp, activeChecklist, tm)}%</td>
                    </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>`;
      break;
    case 'compensation':
      content = `
        <div class="print-section">
          <div class="print-section-title">Summary</div>
          <div class="print-grid-2">
            <div><div class="print-field-label">Total annual payroll</div><div class="print-field-value">₹${formatLakhs(compensationData.totalPayroll)}</div></div>
            <div><div class="print-field-label">Average annual salary</div><div class="print-field-value">₹${formatLakhs(compensationData.avgSalary)}</div></div>
            <div><div class="print-field-label">PF enrolled</div><div class="print-field-value">${compensationData.pfCount}</div></div>
            <div><div class="print-field-label">ESIC enrolled</div><div class="print-field-value">${compensationData.esicCount}</div></div>
          </div>
        </div>
        <div class="print-section">
          <div class="print-section-title">Compensation by department</div>
          <table class="print-table">
            <thead><tr><th>Department</th><th>Employees</th><th>Min</th><th>Max</th><th>Average</th><th>Total cost</th></tr></thead>
            <tbody>
            ${compensationData.deptSalaryData
              .map(
                (r) =>
                  `<tr><td>${esc(r.dept)}</td><td>${r.count}</td><td>₹${formatLakhs(r.min)}</td><td>₹${formatLakhs(r.max)}</td><td>₹${formatLakhs(r.avg)}</td><td>₹${formatLakhs(r.total)}</td></tr>`,
              )
              .join('')}
            </tbody>
          </table>
        </div>
        <div class="print-section">
          <div class="print-section-title">Employee compensation</div>
          <table class="print-table">
            <thead><tr><th>Emp ID</th><th>Name</th><th>Department</th><th>Annual Gross Salary</th><th>Monthly</th><th>PF</th><th>ESIC</th></tr></thead>
            <tbody>
            ${[...compensationData.allEmps]
              .sort((a, b) => (Number(b.ctcPerAnnum) || 0) - (Number(a.ctcPerAnnum) || 0))
              .map(
                (e) =>
                  `<tr>
                    <td>${esc(e.empId || '')}</td>
                    <td>${esc(e.fullName || '')}</td>
                    <td>${esc(e.department || '')}</td>
                    <td>${e.ctcPerAnnum ? `₹${formatLakhs(Number(e.ctcPerAnnum))}` : '—'}</td>
                    <td>${e.ctcPerAnnum ? `₹${formatLakhs(Number(e.ctcPerAnnum) / 12)}` : '—'}</td>
                    <td>${e.pfApplicable ? 'Yes' : 'No'}</td>
                    <td>${e.esicApplicable ? 'Yes' : 'No'}</td>
                  </tr>`,
              )
              .join('')}
            </tbody>
          </table>
        </div>`;
      break;
    case 'leave':
      content = `
        <div class="print-section">
          <div class="print-section-title">Leave by type (${currentYear})</div>
          <table class="print-table">
            <thead><tr><th>Type</th><th>Total requests</th><th>Approved</th></tr></thead>
            <tbody>
            ${leaveByType
              .map((row) => `<tr><td>${esc(row.name)}</td><td>${row.total}</td><td>${row.approved}</td></tr>`)
              .join('')}
            </tbody>
          </table>
        </div>
        <div class="print-section">
          <div class="print-section-title">Monthly trend (${currentYear})</div>
          <table class="print-table">
            <thead><tr><th>Month</th><th>Requests</th></tr></thead>
            <tbody>
            ${monthlyLeave
              .map((m) => `<tr><td>${esc(m.month)}</td><td>${m.count}</td></tr>`)
              .join('')}
            </tbody>
          </table>
        </div>
        <div class="print-section">
          <div class="print-section-title">Leave balance (approved days used / policy)</div>
          <table class="print-table">
            <thead><tr><th>Employee</th>${paidLeaveTypes.map((lt) => `<th>${esc(lt.shortCode)}</th>`).join('')}</tr></thead>
            <tbody>
              ${employees
                .map((emp) => {
                  const row = leaveBalanceByEmp[emp.id];
                  if (!row) return '';
                  return `<tr><td>${esc(emp.fullName || '—')}</td>${paidLeaveTypes
                    .map((lt) => {
                      const used = row[lt.shortCode] || 0;
                      const base = getAllowanceForType(lt, leavePolicyMap);
                      const allowed = calculateProRatedAllowance(base, emp.joiningDate);
                      return `<td>${used} / ${allowed}</td>`;
                    })
                    .join('')}</tr>`;
                })
                .join('')}
            </tbody>
          </table>
        </div>`;
      break;
    case 'asset':
      content = `
        <div class="print-section">
          <div class="print-section-title">Asset register</div>
          <table class="print-table">
            <thead><tr><th>Type</th><th>Name</th><th>Mode</th><th>Status</th><th>Asset ID</th></tr></thead>
            <tbody>
            ${assets
              .map(
                (a) =>
                  `<tr><td>${esc(a.type || '—')}</td><td>${esc(a.name || '—')}</td><td>${esc(a.mode || 'trackable')}</td><td>${esc(
                    a.status || '—',
                  )}</td><td>${esc(a.assetId || '—')}</td></tr>`,
              )
              .join('')}
            </tbody>
          </table>
        </div>`;
      break;
    case 'document':
      content = `
        <div class="print-section">
          <div class="print-section-title">Missing mandatory documents</div>
          <table class="print-table">
            <thead><tr><th>Name</th><th>Emp ID</th><th>Department</th><th>Completion %</th><th>Missing</th></tr></thead>
            <tbody>
            ${missingDocTableRows
              .map(
                ({ emp, pct, missing }) =>
                  `<tr>
                    <td>${esc(emp.fullName || '—')}</td>
                    <td>${esc(emp.empId || '—')}</td>
                    <td>${esc(emp.department || '—')}</td>
                    <td>${pct}%</td>
                    <td>${esc(missing.join(', '))}</td>
                  </tr>`,
              )
              .join('')}
            </tbody>
          </table>
        </div>`;
      break;
    case 'onboarding':
      content = `
        <div class="print-section">
          <div class="print-section-title">New joiners (last 90 days)</div>
          <table class="print-table">
            <thead><tr><th>Name</th><th>Joining Date</th><th>Tenure</th><th>Onboarding %</th><th>Status</th><th>Tasks left</th></tr></thead>
            <tbody>
            ${newJoinersTable
              .map(
                ({ e, pct, left, status }) =>
                  `<tr>
                    <td>${esc(e.fullName || '—')}</td>
                    <td>${esc(toDisplayDate(e.joiningDate) || '—')}</td>
                    <td>${esc(tenureLabel(e.joiningDate))}</td>
                    <td>${pct}%</td>
                    <td>${esc(status)}</td>
                    <td>${left}</td>
                  </tr>`,
              )
              .join('')}
            </tbody>
          </table>
        </div>`;
      break;
    case 'offboarding':
      content = `
        <div class="print-section">
          <div class="print-section-title">Notice Period (status: Notice Period)</div>
          <table class="print-table">
            <thead><tr><th>Employee</th><th>Resignation date</th><th>Last day</th><th>Days remaining</th><th>Reason</th></tr></thead>
            <tbody>
            ${inNoticePeriodByStatus
              .map(
                ({ e, daysRemaining }) =>
                  `<tr>
                    <td>${esc(e.fullName || '—')}</td>
                    <td>${esc(toDisplayDate(e.offboarding?.recordedAt) || toDisplayDate(e.offboarding?.resignationDate) || '—')}</td>
                    <td>${esc(toDisplayDate(e.offboarding?.expectedLastDay) || '—')}</td>
                    <td>${daysRemaining}</td>
                    <td>${esc(e.offboarding?.reason || e.offboarding?.exitReason || '—')}</td>
                  </tr>`,
              )
              .join('')}
            ${inNoticePeriodByStatus.length === 0 ? '<tr><td colspan="5">No employees in Notice Period</td></tr>' : ''}
            </tbody>
          </table>
        </div>
        <div class="print-section">
          <div class="print-section-title">Notice Period (offboarding phase)</div>
          <table class="print-table">
            <thead><tr><th>Name</th><th>Department</th><th>Resigned</th><th>Expected last day</th><th>Reason</th></tr></thead>
            <tbody>
            ${noticePeriodReportRows
              .map(
                ({ e }) =>
                  `<tr>
                    <td>${esc(e.fullName || '—')}</td>
                    <td>${esc(e.department || '—')}</td>
                    <td>${esc(toDisplayDate(e.offboarding?.resignationDate) || '—')}</td>
                    <td>${esc(toDisplayDate(e.offboarding?.expectedLastDay) || '—')}</td>
                    <td>${esc(e.offboarding?.reason || e.offboarding?.exitReason || '—')}</td>
                  </tr>`,
              )
              .join('')}
            </tbody>
          </table>
        </div>
        <div class="print-section">
          <div class="print-section-title">Exit tasks in progress</div>
          <table class="print-table">
            <thead><tr><th>Name</th><th>Department</th><th>Exit date</th><th>Days left</th><th>Reason</th><th>Completion</th><th>Pending tasks</th></tr></thead>
            <tbody>
            ${activeOffboardingRows
              .map(({ e, daysLeft, pct, pending }) => {
                const dl = daysLeft == null ? '—' : daysLeft < 0 ? 'Past' : String(daysLeft);
                const exitDisp =
                  toDisplayDate(e.offboarding?.exitDate) ||
                  toDisplayDate(e.offboarding?.actualLastDay) ||
                  toDisplayDate(e.offboarding?.expectedLastDay) ||
                  '—';
                return `<tr>
                  <td>${esc(e.fullName || '—')}</td>
                  <td>${esc(e.department || '—')}</td>
                  <td>${esc(exitDisp)}</td>
                  <td>${esc(dl)}</td>
                  <td>${esc(e.offboarding?.exitReason || e.offboarding?.reason || '—')}</td>
                  <td>${pct}%</td>
                  <td>${pending}</td>
                </tr>`;
              })
              .join('')}
            </tbody>
          </table>
        </div>
        <div class="print-section">
          <div class="print-section-title">Withdrawn</div>
          <table class="print-table">
            <thead><tr><th>Name</th><th>Department</th><th>Withdrawn on</th></tr></thead>
            <tbody>
            ${withdrawnOffboardingRows
              .map(
                ({ e }) =>
                  `<tr>
                    <td>${esc(e.fullName || '—')}</td>
                    <td>${esc(e.department || '—')}</td>
                    <td>${esc(toDisplayDate(e.offboarding?.withdrawnOn) || '—')}</td>
                  </tr>`,
              )
              .join('')}
            </tbody>
          </table>
        </div>
        <div class="print-section">
          <div class="print-section-title">Completed offboarding</div>
          <table class="print-table">
            <thead><tr><th>Name</th><th>Department</th><th>Exit date</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
            ${completedOffboardingRows
              .map(
                ({ e }) =>
                  `<tr>
                    <td>${esc(e.fullName || '—')}</td>
                    <td>${esc(e.department || '—')}</td>
                    <td>${esc(toDisplayDate(e.offboarding?.exitDate) || '—')}</td>
                    <td>${esc(e.offboarding?.exitReason || '—')}</td>
                    <td>${esc(e.status || 'Inactive')}</td>
                  </tr>`,
              )
              .join('')}
            </tbody>
          </table>
        </div>`;
      break;
    default:
      content = '<p class="print-body-text">No printable content.</p>';
  }

  const html = createPrintDocument({
    title: `${tabMeta?.label || 'Report'} report`,
    subtitle: 'HR Analytics Report',
    companyName: companyDisplayName,
    generatedBy: currentUserEmail || '',
    content,
  });
  openPrintWindow(html);
}
