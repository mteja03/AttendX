import { toDisplayDate } from './index';
import { tenureLabel, getOverallPct, getDaysRemainingLastDay } from './reportHelpers';

export async function handleHeadcountExcel({
  employees,
  safeCompanyFile,
}) {
  const { default: XLSX } = await import('xlsx');
  const rows = employees.map((emp) => ({
    'Emp ID': emp.empId || '',
    Name: emp.fullName || '',
    Department: emp.department || '',
    Branch: emp.branch || '',
    Location: emp.location || '',
    Designation: emp.designation || '',
    'Employment Type': emp.employmentType || '',
    Category: emp.category || '',
    Gender: emp.gender || '',
    'Joining Date': toDisplayDate(emp.joiningDate),
    Tenure: tenureLabel(emp.joiningDate),
    Status: emp.status || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  if (rows.length > 0) {
    ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length + 2, 15) }));
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (cell && cell.t === 's' && cell.v !== '' && !Number.isNaN(Number(cell.v))) {
          cell.t = 'n'; cell.v = Number(cell.v);
        }
      }
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Headcount');
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  XLSX.writeFile(wb, `${safeCompanyFile}_Headcount-Report_${today}.xlsx`);
}

export async function handleOffboardingExcel({
  noticePeriodReportRows,
  activeOffboardingRows,
  withdrawnOffboardingRows,
  completedOffboardingRows,
  safeCompanyFile,
}) {
  const { default: XLSX } = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const fmtWs = (ws, rows) => {
    if (!rows.length) return ws;
    ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: Math.max(k.length + 2, 15) }));
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (cell && cell.t === 's' && cell.v !== '' && !Number.isNaN(Number(cell.v))) { cell.t = 'n'; cell.v = Number(cell.v); }
      }
    }
    return ws;
  };

  if (noticePeriodReportRows.length > 0) {
    const noticeData = noticePeriodReportRows.map(({ e }) => ({
      Name: e.fullName,
      'Emp ID': e.empId,
      Department: e.department || '',
      'Resignation Date': toDisplayDate(e.offboarding?.resignationDate),
      'Expected Last Day': toDisplayDate(e.offboarding?.expectedLastDay),
      'Days Remaining': getDaysRemainingLastDay(e.offboarding?.expectedLastDay),
      Reason: e.offboarding?.reason || e.offboarding?.exitReason || '',
    }));
    XLSX.utils.book_append_sheet(wb, fmtWs(XLSX.utils.json_to_sheet(noticeData), noticeData), 'Notice Period');
  }

  if (activeOffboardingRows.length > 0) {
    const exitData = activeOffboardingRows.map(({ e, pct }) => ({
      Name: e.fullName,
      'Emp ID': e.empId,
      Department: e.department || '',
      'Exit Date': toDisplayDate(
        e.offboarding?.actualLastDay || e.offboarding?.exitDate || e.offboarding?.expectedLastDay,
      ),
      'Completion %': pct,
      Reason: e.offboarding?.reason || e.offboarding?.exitReason || '',
    }));
    XLSX.utils.book_append_sheet(wb, fmtWs(XLSX.utils.json_to_sheet(exitData), exitData), 'Exit In Progress');
  }

  if (withdrawnOffboardingRows.length > 0) {
    const withdrawnData = withdrawnOffboardingRows.map(({ e }) => ({
      Name: e.fullName,
      'Emp ID': e.empId,
      Department: e.department || '',
      'Withdrawn On': toDisplayDate(e.offboarding?.withdrawnOn),
      Notes: e.offboarding?.withdrawNotes || '',
    }));
    XLSX.utils.book_append_sheet(wb, fmtWs(XLSX.utils.json_to_sheet(withdrawnData), withdrawnData), 'Withdrawn');
  }

  if (completedOffboardingRows.length > 0) {
    const completedData = completedOffboardingRows.map(({ e }) => ({
      Name: e.fullName,
      'Emp ID': e.empId,
      Department: e.department || '',
      'Exit Date': toDisplayDate(e.offboarding?.actualLastDay || e.offboarding?.completedAt),
      Reason: e.offboarding?.reason || e.offboarding?.exitReason || '',
      Tenure: tenureLabel(e.joiningDate),
    }));
    XLSX.utils.book_append_sheet(wb, fmtWs(XLSX.utils.json_to_sheet(completedData), completedData), 'Completed Exits');
  }

  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ Message: 'No offboarding rows in this report.' }]),
      'Summary',
    );
  }

  XLSX.writeFile(wb, `${safeCompanyFile}_Offboarding-Report_${new Date().toLocaleDateString('en-GB').split('/').join('-')}.xlsx`);
}

export async function handleCompensationExcel({
  compensationData,
  safeCompanyFile,
}) {
  const { default: XLSX } = await import('xlsx');
  const rows = compensationData.allEmps.map((emp) => ({
    'Emp ID': emp.empId || '',
    Name: emp.fullName || '',
    Department: emp.department || '',
    Designation: emp.designation || '',
    'Annual Gross Salary': emp.ctcPerAnnum || '',
    'Monthly Salary': emp.ctcPerAnnum ? Math.round(Number(emp.ctcPerAnnum) / 12) : '',
    'Incentive (Monthly)': emp.incentive || '',
    'PF Applicable': emp.pfApplicable ? 'Yes' : 'No',
    'PF Number': emp.pfNumber || '',
    'ESIC Applicable': emp.esicApplicable ? 'Yes' : 'No',
    'ESIC Number': emp.esicNumber || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Compensation');
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  XLSX.writeFile(wb, `${safeCompanyFile}_Compensation-Report_${today}.xlsx`);
}

export async function downloadEmployeeCSV({
  filteredEmployeesForReport,
  activeChecklist,
  totalMandatory,
  defaultTotalMandatory,
  safeCompanyFile,
}) {
  const [{ default: XLSX }, { saveAs }] = await Promise.all([
    import('xlsx'),
    import('file-saver'),
  ]);
  const rows = filteredEmployeesForReport.map((emp) => ({
    'Emp ID': emp.empId || '',
    'Full Name': emp.fullName || '',
    Department: emp.department || '',
    Designation: emp.designation || '',
    Branch: emp.branch || '',
    Location: emp.location || '',
    'Employment Type': emp.employmentType || '',
    Category: emp.category || '',
    'Joining Date': toDisplayDate(emp.joiningDate),
    Tenure: tenureLabel(emp.joiningDate),
    Status: emp.status || '',
    'Onboarding Status': emp.onboarding?.status || 'not_started',
    'Documents %': `${getOverallPct(emp, activeChecklist, totalMandatory || defaultTotalMandatory)}%`,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  saveAs(blob, `${safeCompanyFile}_Employees_Report_${today}.csv`);
}

export async function downloadEmployeeExcel({
  filteredEmployeesForReport,
  activeChecklist,
  totalMandatory,
  defaultTotalMandatory,
  safeCompanyFile,
}) {
  const { default: XLSX } = await import('xlsx');
  const rows = filteredEmployeesForReport.map((emp) => ({
    'Emp ID': emp.empId || '',
    'Full Name': emp.fullName || '',
    Department: emp.department || '',
    Designation: emp.designation || '',
    Branch: emp.branch || '',
    Location: emp.location || '',
    'Employment Type': emp.employmentType || '',
    Category: emp.category || '',
    'Joining Date': toDisplayDate(emp.joiningDate),
    Tenure: tenureLabel(emp.joiningDate),
    Status: emp.status || '',
    'Onboarding Status': emp.onboarding?.status || 'not_started',
    'Documents %': `${getOverallPct(emp, activeChecklist, totalMandatory || defaultTotalMandatory)}%`,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  XLSX.writeFile(wb, `${safeCompanyFile}_Employees_Report_${today}.xlsx`);
}
