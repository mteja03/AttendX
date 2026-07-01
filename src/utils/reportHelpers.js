import { getDocById } from './documentTypes';
import { toJSDate, toDisplayDate } from './index';

export const CHART_COLORS = ['#1B6B6B', '#4ECDC4', '#2BB8B0', '#155858', '#7EDDD8', '#0F4444', '#A8EDEA', '#264653', '#2A9D8F'];

export const REPORT_FILTER_SELECT =
  'border border-gray-200 rounded-xl px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]';

export const REPORT_TABS = [
  { id: 'headcount', label: 'Headcount', icon: '👥' },
  { id: 'employee', label: 'Employees', icon: '👤' },
  { id: 'compensation', label: 'Compensation', icon: '💰' },
  { id: 'leave', label: 'Leave', icon: '📅' },
  { id: 'asset', label: 'Assets', icon: '📦' },
  { id: 'document', label: 'Documents', icon: '📄' },
  { id: 'onboarding', label: 'Onboarding', icon: '🎯' },
  { id: 'offboarding', label: 'Offboarding', icon: '👋' },
  { id: 'branch', label: 'Branch', icon: '🏢' },
  { id: 'audit', label: 'Audit', icon: '🔍' },
];

export const DEFAULT_LEAVE_TYPE_OBJECTS = [
  { name: 'Casual Leave', shortCode: 'CL', isPaid: true },
  { name: 'Sick Leave', shortCode: 'SL', isPaid: true },
  { name: 'Earned Leave', shortCode: 'EL', isPaid: true },
  { name: 'Maternity Leave', shortCode: 'ML', isPaid: true },
  { name: 'Unpaid Leave', shortCode: 'UL', isPaid: false },
];

export function getEmployeeOffboardingPhase(e) {
  const o = e?.offboarding;
  if (!o) return null;
  if (o.status === 'completed' || o.phase === 'completed') return 'completed';
  if (o.phase === 'notice_period') return 'notice_period';
  if (o.phase === 'exit_tasks') return 'exit_tasks';
  if (o.phase === 'withdrawn') return 'withdrawn';
  if (o.status === 'in_progress' && Array.isArray(o.tasks) && o.tasks.length > 0) return 'exit_tasks';
  return null;
}

export function abbrevLeaveTypeName(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

export function normalizeLeaveTypesFromCompany(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_LEAVE_TYPE_OBJECTS.map((t) => ({ ...t }));
  }
  return raw.map((t) => {
    if (typeof t === 'string') {
      const name = t.trim();
      return { name, shortCode: abbrevLeaveTypeName(name), isPaid: true };
    }
    const name = (t.name || '').trim() || 'Leave';
    const shortCode = (t.shortCode || abbrevLeaveTypeName(name)).toUpperCase().slice(0, 8);
    return { name, shortCode, isPaid: t.isPaid !== false };
  });
}

export function leaveRecordMatchesType(l, lt) {
  const t = (l.leaveType || '').trim();
  if (t === lt.name || t === lt.shortCode) return true;
  return false;
}

export function buildAllowancesMapFromCompany(data, normalizedTypes) {
  const lp = data?.leavePolicy || {};
  const out = {};
  normalizedTypes.filter((lt) => lt.isPaid).forEach((lt) => {
    let n =
      lp[lt.shortCode] ??
      lp[lt.name] ??
      (lt.shortCode === 'CL' ? lp.cl : lt.shortCode === 'SL' ? lp.sl : lt.shortCode === 'EL' ? lp.el : undefined);
    if (n === undefined || Number.isNaN(Number(n))) n = lt.shortCode === 'EL' ? 15 : 12;
    out[lt.shortCode] = Number(n);
  });
  return out;
}

export function getAllowanceForType(lt, leavePolicyMap) {
  const lp = leavePolicyMap || {};
  let n = lp[lt.shortCode] ?? lp[lt.name];
  if (n === undefined) {
    if (lt.shortCode === 'CL') n = lp.cl;
    else if (lt.shortCode === 'SL') n = lp.sl;
    else if (lt.shortCode === 'EL') n = lp.el;
  }
  if (n === undefined || Number.isNaN(Number(n))) n = 0;
  return Number(n);
}

export function getDocByTypeMap(emp) {
  const map = {};
  (emp.documents || []).forEach((d) => {
    if (d.id && getDocById(d.id)) map[d.id] = d;
  });
  return map;
}

export function getOverallPct(emp, activeChecklist, totalMandatory) {
  const docByType = getDocByTypeMap(emp);
  let mandatoryUploaded = 0;
  activeChecklist.forEach((cat) => {
    cat.documents.filter((d) => d.mandatory).forEach((d) => {
      if (docByType[d.id]) mandatoryUploaded++;
    });
  });
  return totalMandatory ? Math.round((mandatoryUploaded / totalMandatory) * 100) : 100;
}

export function getMissingMandatoryNames(emp, activeChecklist) {
  const docByType = getDocByTypeMap(emp);
  const missing = [];
  activeChecklist.forEach((cat) => {
    cat.documents.filter((d) => d.mandatory).forEach((d) => {
      if (!docByType[d.id]) missing.push(d.name || d.id);
    });
  });
  return missing;
}

export function tenureLabel(joiningDate) {
  const joined = toJSDate(joiningDate);
  if (!joined || Number.isNaN(joined.getTime())) return '—';
  const years = (Date.now() - joined.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) return `${Math.max(0, Math.floor(years * 12))} mo`;
  return `${years.toFixed(1)} yr`;
}

export function getDaysRemainingLastDay(lastDay) {
  const end = toJSDate(lastDay);
  if (!end || Number.isNaN(end.getTime())) return 0;
  const diff = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export async function downloadReport(companyName, reportName, data, columns) {
  const xlsxMod = await import('xlsx');
  const XLSX = xlsxMod.default ?? xlsxMod;
  const rows = data.map((item) => {
    const row = {};
    columns.forEach((col) => {
      row[col.header] = col.accessor(item);
    });
    return row;
  });
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
  XLSX.utils.book_append_sheet(wb, ws, reportName.slice(0, 31));
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  const safeCo = (companyName || 'Company').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `${safeCo}_${reportName}_${today}.xlsx`);
}
