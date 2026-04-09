import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
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
  LineChart,
  Line,
  ResponsiveContainer,
} from 'recharts';
import PageLoader from '../components/PageLoader';
import EmployeeAvatar from '../components/EmployeeAvatar';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { formatLakhs, toDateString, toDisplayDate, toJSDate } from '../utils';
import { calculateProRatedAllowance, isMidYearJoinerThisYear } from '../utils/leaveProration';
import { DOCUMENT_CHECKLIST, getDocById, getMandatoryDocCount } from '../utils/documentTypes';
import { createPrintDocument, escapeHtml, openPrintWindow } from '../utils/printTemplate';
import { trackPageView, trackReportViewed } from '../utils/analytics';

const CHART_COLORS = ['#1B6B6B', '#4ECDC4', '#2BB8B0', '#155858', '#7EDDD8', '#0F4444', '#A8EDEA', '#264653', '#2A9D8F'];

function getEmployeeOffboardingPhase(e) {
  const o = e?.offboarding;
  if (!o) return null;
  if (o.status === 'completed' || o.phase === 'completed') return 'completed';
  if (o.phase === 'notice_period') return 'notice_period';
  if (o.phase === 'exit_tasks') return 'exit_tasks';
  if (o.phase === 'withdrawn') return 'withdrawn';
  if (o.status === 'in_progress' && Array.isArray(o.tasks) && o.tasks.length > 0) return 'exit_tasks';
  return null;
}

const REPORT_TABS = [
  { id: 'headcount', label: 'Headcount', icon: '👥' },
  { id: 'employee', label: 'Employees', icon: '👤' },
  { id: 'compensation', label: 'Compensation', icon: '💰' },
  { id: 'leave', label: 'Leave', icon: '📅' },
  { id: 'asset', label: 'Assets', icon: '📦' },
  { id: 'document', label: 'Documents', icon: '📄' },
  { id: 'onboarding', label: 'Onboarding', icon: '🎯' },
  { id: 'offboarding', label: 'Offboarding', icon: '👋' },
];

const defaultTotalMandatory = getMandatoryDocCount();

const DEFAULT_LEAVE_TYPE_OBJECTS = [
  { name: 'Casual Leave', shortCode: 'CL', isPaid: true },
  { name: 'Sick Leave', shortCode: 'SL', isPaid: true },
  { name: 'Earned Leave', shortCode: 'EL', isPaid: true },
  { name: 'Maternity Leave', shortCode: 'ML', isPaid: true },
  { name: 'Unpaid Leave', shortCode: 'UL', isPaid: false },
];

function abbrevLeaveTypeName(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

function normalizeLeaveTypesFromCompany(raw) {
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

function leaveRecordMatchesType(l, lt) {
  const t = (l.leaveType || '').trim();
  if (t === lt.name || t === lt.shortCode) return true;
  return false;
}

function buildAllowancesMapFromCompany(data, normalizedTypes) {
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

function getAllowanceForType(lt, leavePolicyMap) {
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

function getDocByTypeMap(emp) {
  const map = {};
  (emp.documents || []).forEach((d) => {
    if (d.id && getDocById(d.id)) map[d.id] = d;
  });
  return map;
}

function getOverallPct(emp, activeChecklist, totalMandatory) {
  const docByType = getDocByTypeMap(emp);
  let mandatoryUploaded = 0;
  activeChecklist.forEach((cat) => {
    cat.documents.filter((d) => d.mandatory).forEach((d) => {
      if (docByType[d.id]) mandatoryUploaded++;
    });
  });
  return totalMandatory ? Math.round((mandatoryUploaded / totalMandatory) * 100) : 100;
}

function getMissingMandatoryNames(emp, activeChecklist) {
  const docByType = getDocByTypeMap(emp);
  const missing = [];
  activeChecklist.forEach((cat) => {
    cat.documents.filter((d) => d.mandatory).forEach((d) => {
      if (!docByType[d.id]) missing.push(d.name || d.id);
    });
  });
  return missing;
}

function tenureLabel(joiningDate) {
  const joined = toJSDate(joiningDate);
  if (!joined || Number.isNaN(joined.getTime())) return '—';
  const years = (Date.now() - joined.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) return `${Math.max(0, Math.floor(years * 12))} mo`;
  return `${years.toFixed(1)} yr`;
}

function getDaysRemainingLastDay(lastDay) {
  const end = toJSDate(lastDay);
  if (!end || Number.isNaN(end.getTime())) return 0;
  const diff = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function downloadReport(companyName, reportName, data, columns) {
  const rows = data.map((item) => {
    const row = {};
    columns.forEach((col) => {
      row[col.header] = col.accessor(item);
    });
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, reportName.slice(0, 31));
  const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
  const safeCo = (companyName || 'Company').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `${safeCo}_${reportName}_${today}.xlsx`);
}

function StatCard({ value, label }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function DownloadExcelButton({ onClick, label = 'Download Excel' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium"
    >
      {label}
    </button>
  );
}

export default function Reports() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState(null);
  const [roles, setRoles] = useState([]);
  const [activeTab, setActiveTab] = useState('headcount');
  const [tabLoading, setTabLoading] = useState(false);

  useEffect(() => {
    trackPageView('Reports');
  }, []);

  useEffect(() => {
    trackReportViewed(activeTab);
  }, [activeTab]);
  const [empFilterDept, setEmpFilterDept] = useState('All');
  const [empFilterBranch, setEmpFilterBranch] = useState('All');
  const [empFilterStatus, setEmpFilterStatus] = useState('All');
  const [empFilterType, setEmpFilterType] = useState('All');
  const [empFilterYear, setEmpFilterYear] = useState('All');

  const companyDisplayName = company?.name || 'Company';
  const safeCompanyFile = companyDisplayName.replace(/\s+/g, '_');

  const handleTabSwitch = (tabId) => {
    setTabLoading(true);
    setActiveTab(tabId);
    setTimeout(() => setTabLoading(false), 150);
  };

  const fetchAllData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [empSnap, leaveSnap, assetSnap, compSnap, rolesSnap] = await Promise.all([
        getDocs(collection(db, 'companies', companyId, 'employees')),
        getDocs(collection(db, 'companies', companyId, 'leave')),
        getDocs(collection(db, 'companies', companyId, 'assets')),
        getDoc(doc(db, 'companies', companyId)),
        getDocs(collection(db, 'companies', companyId, 'roles')).catch(() => ({ docs: [] })),
      ]);
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLeaveList(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAssets(assetSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const rd = rolesSnap && Array.isArray(rolesSnap.docs) ? rolesSnap.docs : [];
      setRoles(rd.map((d) => ({ id: d.id, ...d.data() })));
      if (compSnap.exists()) {
        setCompany({ id: compSnap.id, ...compSnap.data() });
      } else {
        setCompany(null);
      }
    } catch {
      /* ignore fetch errors; UI shows empty state */
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const activeChecklist = useMemo(() => {
    if (company?.documentTypes && company.documentTypes.length > 0) return company.documentTypes;
    return DOCUMENT_CHECKLIST;
  }, [company]);

  const totalMandatory = useMemo(
    () => activeChecklist.flatMap((cat) => cat.documents).filter((d) => d.mandatory).length,
    [activeChecklist],
  );

  const leaveTypes = useMemo(() => normalizeLeaveTypesFromCompany(company?.leaveTypes), [company]);
  const paidLeaveTypes = useMemo(() => leaveTypes.filter((lt) => lt.isPaid), [leaveTypes]);
  const leavePolicyMap = useMemo(() => buildAllowancesMapFromCompany(company, leaveTypes), [company, leaveTypes]);

  const employeeMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  const leaveBalanceByEmp = useMemo(() => {
    if (activeTab !== 'leave') return {};
    const approved = leaveList.filter((l) => l.status === 'Approved');
    const byEmployee = {};
    const ensureRow = (id, name) => {
      if (!byEmployee[id]) {
        const row = { id, name: name || '—' };
        paidLeaveTypes.forEach((lt) => {
          row[lt.shortCode] = 0;
        });
        byEmployee[id] = row;
      }
    };
    employees.forEach((e) => ensureRow(e.id, e.fullName));
    approved.forEach((l) => {
      ensureRow(l.employeeId, l.employeeName);
      paidLeaveTypes.forEach((lt) => {
        if (leaveRecordMatchesType(l, lt)) {
          byEmployee[l.employeeId][lt.shortCode] += l.days || 0;
        }
      });
    });
    return byEmployee;
  }, [activeTab, leaveList, employees, paidLeaveTypes]);

  const todayStr = toDateString(new Date());
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const headcountStats = useMemo(() => {
    if (activeTab !== 'headcount') {
      return { total: 0, active: 0, onLeaveToday: 0, newJoiners: 0 };
    }
    const total = employees.length;
    const active = employees.filter((e) => (e.status || 'Active') === 'Active').length;
    const onLeaveToday = leaveList.filter((l) => {
      if (l.status !== 'Approved') return false;
      const start = toDateString(l.startDate);
      const end = toDateString(l.endDate);
      if (!start || !end) return false;
      return todayStr >= start && todayStr <= end;
    }).length;
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const newJoiners = employees.filter((e) => {
      const j = toJSDate(e.joiningDate);
      return j && !Number.isNaN(j.getTime()) && j >= startOfMonth;
    }).length;
    return { total, active, onLeaveToday, newJoiners };
  }, [activeTab, employees, leaveList, todayStr, currentYear, currentMonth]);

  const deptData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const acc = {};
    employees.forEach((emp) => {
      const dept = emp.department || 'Other';
      acc[dept] = (acc[dept] || 0) + 1;
    });
    return Object.entries(acc)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, employees]);

  const roleVacancyData = useMemo(
    () => {
      if (activeTab !== 'headcount') return [];
      return roles
        .filter((r) => r.isActive !== false)
        .map((role) => {
          const filled = employees.filter(
            (e) =>
              (e.designation || '').trim() === (role.title || '').trim() && (e.status || 'Active') === 'Active',
          ).length;
          return {
            id: role.id,
            title: role.title,
            role: role.title,
            filled,
            salaryBand: role.salaryBand,
            reportsTo: role.reportsTo,
          };
        })
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    },
    [activeTab, roles, employees],
  );

  const roleVacancySummary = useMemo(() => {
    if (activeTab !== 'headcount') return { totalFilled: 0, totalVacant: 0 };
    const totalFilled = roleVacancyData.reduce((sum, r) => sum + r.filled, 0);
    const totalVacant = roleVacancyData.filter((r) => r.filled === 0).length;
    return { totalFilled, totalVacant };
  }, [activeTab, roleVacancyData]);

  const typeData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const acc = {};
    employees.forEach((emp) => {
      const t = emp.employmentType || 'Other';
      acc[t] = (acc[t] || 0) + 1;
    });
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [activeTab, employees]);

  const categoryData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const acc = {};
    employees.forEach((emp) => {
      const c = emp.category || 'Other';
      acc[c] = (acc[c] || 0) + 1;
    });
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [activeTab, employees]);

  const genderData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const acc = {};
    employees.forEach((emp) => {
      const g = emp.gender || 'Not specified';
      acc[g] = (acc[g] || 0) + 1;
    });
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [activeTab, employees]);

  const tenureData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const buckets = { '< 1 year': 0, '1-2 years': 0, '2-5 years': 0, '5+ years': 0 };
    employees.forEach((emp) => {
      const joined = toJSDate(emp.joiningDate);
      if (!joined || Number.isNaN(joined.getTime())) return;
      const years = (new Date() - joined) / (365.25 * 24 * 60 * 60 * 1000);
      if (years < 1) buckets['< 1 year'] += 1;
      else if (years < 2) buckets['1-2 years'] += 1;
      else if (years < 5) buckets['2-5 years'] += 1;
      else buckets['5+ years'] += 1;
    });
    return Object.entries(buckets).map(([name, count]) => ({ name, count }));
  }, [activeTab, employees]);

  const branchData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const acc = {};
    employees.forEach((emp) => {
      const b = emp.branch || 'Other';
      acc[b] = (acc[b] || 0) + 1;
    });
    return Object.entries(acc)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, employees]);

  const locationData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const counts = {};
    employees.forEach((emp) => {
      if (emp.location) {
        counts[emp.location] = (counts[emp.location] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, employees]);

  const inNoticePeriodByStatus = useMemo(
    () => {
      if (activeTab !== 'offboarding') return [];
      return employees
        .filter((e) => e.status === 'Notice Period')
        .map((e) => ({
          e,
          daysRemaining: getDaysRemainingLastDay(e.offboarding?.expectedLastDay),
        }))
        .sort((a, b) => {
          const ta = toJSDate(a.e.offboarding?.expectedLastDay)?.getTime() || 0;
          const tb = toJSDate(b.e.offboarding?.expectedLastDay)?.getTime() || 0;
          return ta - tb;
        });
    },
    [activeTab, employees],
  );

  const deptOptions = useMemo(() => {
    if (activeTab !== 'employee') return ['All'];
    const s = new Set(employees.map((e) => e.department).filter(Boolean));
    return ['All', ...Array.from(s).sort()];
  }, [activeTab, employees]);
  const branchOptions = useMemo(() => {
    if (activeTab !== 'employee') return ['All'];
    const s = new Set(employees.map((e) => e.branch).filter(Boolean));
    return ['All', ...Array.from(s).sort()];
  }, [activeTab, employees]);

  const filteredEmployeesForReport = useMemo(() => {
    if (activeTab !== 'employee') return [];
    let list = employees;
    if (empFilterDept !== 'All') list = list.filter((e) => (e.department || '') === empFilterDept);
    if (empFilterBranch !== 'All') list = list.filter((e) => (e.branch || '') === empFilterBranch);
    if (empFilterStatus !== 'All') list = list.filter((e) => (e.status || 'Active') === empFilterStatus);
    if (empFilterType !== 'All') list = list.filter((e) => (e.employmentType || '') === empFilterType);
    if (empFilterYear !== 'All') {
      const y = Number(empFilterYear);
      list = list.filter((e) => {
        const j = toJSDate(e.joiningDate);
        return j && j.getFullYear() === y;
      });
    }
    return list;
  }, [activeTab, employees, empFilterDept, empFilterBranch, empFilterStatus, empFilterType, empFilterYear]);

  const employeeSummary = useMemo(() => {
    if (activeTab !== 'employee') return { total: 0, active: 0, inactive: 0, offboarding: 0 };
    const total = employees.length;
    const active = employees.filter((e) => (e.status || 'Active') === 'Active').length;
    const inactive = employees.filter((e) => e.status === 'Inactive').length;
    const offboarding = employees.filter(
      (e) =>
        e.status === 'Offboarding' ||
        e.status === 'Notice Period' ||
        e.offboarding?.status === 'in_progress' ||
        getEmployeeOffboardingPhase(e) === 'notice_period',
    ).length;
    return { total, active, inactive, offboarding };
  }, [activeTab, employees]);

  const leaveYearList = useMemo(
    () => {
      if (activeTab !== 'leave') return [];
      return leaveList.filter((l) => {
      const d = toJSDate(l.appliedAt);
      return d && d.getFullYear() === currentYear;
    });
    },
    [activeTab, leaveList, currentYear],
  );

  const leaveStats = useMemo(() => ({
   total: leaveYearList.length,
    approved: leaveYearList.filter((l) => l.status === 'Approved').length,
    pending: leaveYearList.filter((l) => l.status === 'Pending').length,
    rejected: leaveYearList.filter((l) => l.status === 'Rejected').length,
  }), [leaveYearList]);

  const leaveByType = useMemo(
    () => {
      if (activeTab !== 'leave') return [];
      return leaveTypes.map((lt) => ({
        name: lt.shortCode || lt.name,
        total: leaveYearList.filter((l) => leaveRecordMatchesType(l, lt)).length,
        approved: leaveYearList.filter((l) => leaveRecordMatchesType(l, lt) && l.status === 'Approved').length,
      }));
    },
    [activeTab, leaveTypes, leaveYearList],
  );

  const monthlyLeave = useMemo(
    () => {
      if (activeTab !== 'leave') return [];
      return Array.from({ length: 12 }, (_, i) => {
        const month = new Date(currentYear, i, 1);
        const monthName = month.toLocaleDateString('en-GB', { month: 'short' });
        const count = leaveList.filter((l) => {
          const d = toJSDate(l.appliedAt);
          return d && d.getMonth() === i && d.getFullYear() === currentYear;
        }).length;
        return { month: monthName, count };
      });
    },
    [activeTab, leaveList, currentYear],
  );

  const leaveByDept = useMemo(() => {
    if (activeTab !== 'leave') return [];
    const acc = {};
    leaveYearList.forEach((l) => {
      const dept = employeeMap[l.employeeId]?.department || 'Other';
      acc[dept] = (acc[dept] || 0) + 1;
    });
    return Object.entries(acc)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, leaveYearList, employeeMap]);

  const topLeaveEmployees = useMemo(() => {
    if (activeTab !== 'leave') return [];
    const empLeave = {};
    leaveYearList
      .filter((l) => l.status === 'Approved')
      .forEach((l) => {
        const key = l.employeeId;
        if (!key) return;
        if (!empLeave[key]) {
          empLeave[key] = {
            employeeId: key,
            name: l.employeeName || employeeMap[key]?.fullName || '—',
            empId: employeeMap[key]?.empId || l.empId || '',
            department: employeeMap[key]?.department || l.department || '',
            totalDays: 0,
            count: 0,
          };
        }
        empLeave[key].totalDays += Number(l.days) || 1;
        empLeave[key].count += 1;
      });
    return Object.values(empLeave)
      .sort((a, b) => b.totalDays - a.totalDays)
      .slice(0, 10);
  }, [activeTab, leaveYearList, employeeMap]);

  const assetStats = useMemo(() => {
    if (activeTab !== 'asset') {
      return { total: 0, trackable: 0, consumable: 0, assigned: 0, available: 0, totalStock: 0, issued: 0 };
    }
    const trackable = assets.filter((a) => (a.mode || 'trackable') === 'trackable');
    const consumable = assets.filter((a) => (a.mode || 'trackable') === 'consumable');
    const assigned = trackable.filter((a) => a.status === 'Assigned').length;
    const available = trackable.filter((a) => a.status === 'Available').length;
    const totalStock = consumable.reduce((s, a) => s + (Number(a.stockQuantity) || 0), 0);
    const issued = consumable.reduce((s, a) => s + (Number(a.issuedCount) || 0), 0);
    return {
      total: assets.length,
      trackable: trackable.length,
      consumable: consumable.length,
      assigned,
      available,
      totalStock,
      issued,
    };
  }, [activeTab, assets]);

  const assetByType = useMemo(() => {
    if (activeTab !== 'asset') return [];
    const acc = {};
    assets.forEach((a) => {
      const t = a.type || 'Other';
      acc[t] = (acc[t] || 0) + 1;
    });
    return Object.entries(acc)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, assets]);

  const assetStatusData = useMemo(() => {
    if (activeTab !== 'asset') return [];
    const trackable = assets.filter((a) => (a.mode || 'trackable') === 'trackable');
    const acc = { Available: 0, Assigned: 0, Damaged: 0, 'In Repair': 0, Lost: 0, Other: 0 };
    trackable.forEach((a) => {
      const st = a.status || 'Other';
      if (acc[st] === undefined) acc.Other += 1;
      else acc[st] += 1;
    });
    return Object.entries(acc)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [activeTab, assets]);

  const assetsPerEmployeeRows = useMemo(() => {
    if (activeTab !== 'asset') return [];
    const rows = {};
    assets
      .filter((a) => (a.mode || 'trackable') === 'trackable' && a.status === 'Assigned' && a.assignedTo)
      .forEach((a) => {
        const id = a.assignedTo;
        if (!rows[id]) rows[id] = { employeeId: id, count: 0, names: [] };
        rows[id].count += 1;
        rows[id].names.push(a.name || a.assetId || 'Asset');
      });
    return Object.values(rows)
      .map((r) => ({
        ...r,
        empName: employeeMap[r.employeeId]?.fullName || '—',
        empId: employeeMap[r.employeeId]?.empId || '',
        namesStr: r.names.join(', '),
      }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, assets, employeeMap]);

  const consumableRows = useMemo(
    () => {
      if (activeTab !== 'asset') return [];
      return assets
        .filter((a) => (a.mode || 'trackable') === 'consumable')
        .map((a) => {
          const stock = Number(a.stockQuantity) || 0;
          const issued = Number(a.issuedCount) || 0;
          return {
            id: a.id,
            name: a.name || a.type || '—',
            stock,
            issued,
            available: Math.max(0, stock - issued),
          };
        });
    },
    [activeTab, assets],
  );

  const docStats = useMemo(() => {
    if (activeTab !== 'document') {
      return { full: 0, missing: 0, totalDocs: 0, mostMissing: '—', enriched: [] };
    }
    const enriched = employees.map((e) => ({
      ...e,
      pct: getOverallPct(e, activeChecklist, totalMandatory || defaultTotalMandatory),
    }));
    const full = enriched.filter((e) => e.pct === 100).length;
    const missing = enriched.filter((e) => e.pct < 100).length;
    const totalDocs = employees.reduce((s, e) => s + (e.documents || []).length, 0);
    const missCounts = {};
    enriched.forEach((e) => {
      getMissingMandatoryNames(e, activeChecklist).forEach((n) => {
        missCounts[n] = (missCounts[n] || 0) + 1;
      });
    });
    let mostMissing = '—';
    let maxC = 0;
    Object.entries(missCounts).forEach(([k, v]) => {
      if (v > maxC) {
        maxC = v;
        mostMissing = k;
      }
    });
    return { full, missing, totalDocs, mostMissing, enriched };
  }, [activeTab, employees, activeChecklist, totalMandatory]);

  const completionBuckets = useMemo(() => {
    if (activeTab !== 'document') return [];
    const buckets = { '0%': 0, '1-25%': 0, '26-50%': 0, '51-75%': 0, '76-99%': 0, '100%': 0 };
    employees.forEach((emp) => {
      const pct = getOverallPct(emp, activeChecklist, totalMandatory || defaultTotalMandatory);
      if (pct === 0) buckets['0%'] += 1;
      else if (pct <= 25) buckets['1-25%'] += 1;
      else if (pct <= 50) buckets['26-50%'] += 1;
      else if (pct <= 75) buckets['51-75%'] += 1;
      else if (pct < 100) buckets['76-99%'] += 1;
      else buckets['100%'] += 1;
    });
    return Object.entries(buckets).map(([name, count]) => ({ name, count }));
  }, [activeTab, employees, activeChecklist, totalMandatory]);

  const missingDocTableRows = useMemo(() => {
    if (activeTab !== 'document') return [];
    return employees
      .map((emp) => {
        const pct = getOverallPct(emp, activeChecklist, totalMandatory || defaultTotalMandatory);
        const missing = getMissingMandatoryNames(emp, activeChecklist);
        return { emp, pct, missing };
      })
      .filter((r) => r.missing.length > 0)
      .sort((a, b) => a.pct - b.pct);
  }, [activeTab, employees, activeChecklist, totalMandatory]);

  const onboardingStats = useMemo(() => {
    if (activeTab !== 'onboarding') return { started: 0, completed: 0, inProgress: 0, notStarted: 0, total: 0 };
    let started = 0;
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    employees.forEach((e) => {
      const ob = e.onboarding;
      if (!ob || ob.status === 'not_started' || (!ob.tasks?.length && ob.status !== 'completed')) {
        notStarted += 1;
        return;
      }
      if (ob.status === 'completed') {
        completed += 1;
        started += 1;
      } else if (ob.status === 'in_progress') {
        inProgress += 1;
        started += 1;
      } else {
        notStarted += 1;
      }
    });
    return { started, completed, inProgress, notStarted, total: employees.length };
  }, [activeTab, employees]);

  const onboardingDonutData = useMemo(
    () => [
      { name: 'Not Started', value: onboardingStats.notStarted },
      { name: 'In Progress', value: onboardingStats.inProgress },
      { name: 'Completed', value: onboardingStats.completed },
    ],
    [onboardingStats],
  );

  const deptOnboardingAvg = useMemo(() => {
    if (activeTab !== 'onboarding') return [];
    const acc = {};
    employees.forEach((e) => {
      const d = e.department || 'Other';
      const tasks = Array.isArray(e.onboarding?.tasks) ? e.onboarding.tasks : [];
      const pct =
        tasks.length > 0 ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100) : e.onboarding?.completionPct ?? 0;
      if (!acc[d]) acc[d] = { sum: 0, n: 0 };
      acc[d].sum += pct;
      acc[d].n += 1;
    });
    return Object.entries(acc)
      .map(([name, { sum, n }]) => ({ name, avg: n ? Math.round(sum / n) : 0 }))
      .sort((a, b) => b.avg - a.avg);
  }, [employees, activeTab]);

  const ninetyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d;
  }, []);

  const newJoinersTable = useMemo(() => {
    return employees
      .filter((e) => {
        const j = toJSDate(e.joiningDate);
        return j && j >= ninetyDaysAgo;
      })
      .map((e) => {
        const tasks = Array.isArray(e.onboarding?.tasks) ? e.onboarding.tasks : [];
        const done = tasks.filter((t) => t.completed).length;
        const total = tasks.length;
        const pct = total ? Math.round((done / total) * 100) : e.onboarding?.completionPct ?? 0;
        const left = total - done;
        let status = 'Not Started';
        if (e.onboarding?.status === 'completed') status = 'Completed';
        else if (e.onboarding?.status === 'in_progress' || (total > 0 && done > 0)) status = 'In Progress';
        return { e, pct, left, status, join: toJSDate(e.joiningDate) };
      })
      .sort((a, b) => (b.join?.getTime() || 0) - (a.join?.getTime() || 0));
  }, [employees, ninetyDaysAgo]);

  const offboardingEmployees = useMemo(
    () => (activeTab !== 'offboarding' ? [] : employees.filter((e) => e.offboarding)),
    [activeTab, employees],
  );

  const offboardingReportStats = useMemo(() => {
    if (activeTab !== 'offboarding') {
      return { inNotice: 0, exitTasks: 0, exitsThisMonth: 0, withdrawnThisMonth: 0 };
    }
    const now = new Date();
    const y = now.getFullYear();
    const mo = now.getMonth();
    const inNotice = employees.filter((e) => getEmployeeOffboardingPhase(e) === 'notice_period').length;
    const exitTasks = employees.filter((e) => getEmployeeOffboardingPhase(e) === 'exit_tasks').length;
    const exitsThisMonth = employees.filter((e) => {
      if (getEmployeeOffboardingPhase(e) !== 'completed') return false;
      const d = toJSDate(e.offboarding?.completedAt) || toJSDate(e.offboarding?.exitDate);
      return d && d.getFullYear() === y && d.getMonth() === mo;
    }).length;
    const withdrawnThisMonth = employees.filter((e) => {
      const w = toJSDate(e.offboarding?.withdrawnOn);
      return w && w.getFullYear() === y && w.getMonth() === mo;
    }).length;
    return { inNotice, exitTasks, exitsThisMonth, withdrawnThisMonth };
  }, [activeTab, employees]);

  const exitReasons = useMemo(() => {
    if (activeTab !== 'offboarding') return [];
    const acc = {};
    offboardingEmployees.forEach((emp) => {
      const reason = emp.offboarding?.exitReason || 'Other';
      acc[reason] = (acc[reason] || 0) + 1;
    });
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [activeTab, offboardingEmployees]);

  const monthlyExits = useMemo(
    () => {
      if (activeTab !== 'offboarding') return [];
      return Array.from({ length: 12 }, (_, i) => {
        const month = new Date(currentYear, i, 1);
        const monthName = month.toLocaleDateString('en-GB', { month: 'short' });
        const count = offboardingEmployees.filter((e) => {
          if (getEmployeeOffboardingPhase(e) !== 'completed') return false;
          const d = toJSDate(e.offboarding?.completedAt) || toJSDate(e.offboarding?.exitDate);
          return d && d.getFullYear() === currentYear && d.getMonth() === i;
        }).length;
        return { month: monthName, count };
      });
    },
    [activeTab, offboardingEmployees, currentYear],
  );

  const noticePeriodReportRows = useMemo(
    () => {
      if (activeTab !== 'offboarding') return [];
      return employees
        .filter((e) => getEmployeeOffboardingPhase(e) === 'notice_period')
        .map((e) => ({
          e,
          expected: toJSDate(e.offboarding?.expectedLastDay),
        }))
        .sort((a, b) => (a.expected?.getTime() || 0) - (b.expected?.getTime() || 0));
    },
    [activeTab, employees],
  );

  const activeOffboardingRows = useMemo(() => {
    if (activeTab !== 'offboarding') return [];
    return employees
      .filter((e) => getEmployeeOffboardingPhase(e) === 'exit_tasks')
      .map((e) => {
        const exitDate =
          toJSDate(e.offboarding?.exitDate) ||
          toJSDate(e.offboarding?.actualLastDay) ||
          toJSDate(e.offboarding?.expectedLastDay);
        const daysLeft = exitDate ? Math.ceil((exitDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
        const tasks = Array.isArray(e.offboarding?.tasks) ? e.offboarding.tasks : [];
        const done = tasks.filter((t) => t.completed).length;
        const pct = tasks.length ? Math.round((done / tasks.length) * 100) : e.offboarding?.completionPct ?? 0;
        const pending = tasks.filter((t) => !t.completed).length;
        return { e, exitDate, daysLeft, pct, pending };
      })
      .sort((a, b) => (a.exitDate?.getTime() || 0) - (b.exitDate?.getTime() || 0));
  }, [activeTab, employees]);

  const withdrawnOffboardingRows = useMemo(
    () => {
      if (activeTab !== 'offboarding') return [];
      return employees
        .filter((e) => getEmployeeOffboardingPhase(e) === 'withdrawn')
        .map((e) => ({
          e,
          withdrawnD: toJSDate(e.offboarding?.withdrawnOn),
        }))
        .sort((a, b) => (b.withdrawnD?.getTime() || 0) - (a.withdrawnD?.getTime() || 0));
    },
    [activeTab, employees],
  );

  const completedOffboardingRows = useMemo(
    () => {
      if (activeTab !== 'offboarding') return [];
      return employees
        .filter((e) => getEmployeeOffboardingPhase(e) === 'completed')
        .map((e) => ({
          e,
          exitD: toJSDate(e.offboarding?.exitDate),
          completedD: toJSDate(e.offboarding?.completedAt),
        }))
        .sort((a, b) => (b.completedD?.getTime() || 0) - (a.completedD?.getTime() || 0));
    },
    [activeTab, employees],
  );

  const compensationData = useMemo(() => {
    if (activeTab !== 'compensation') {
      return {
        totalPayroll: 0,
        avgSalary: 0,
        activeCount: 0,
        deptSalaryData: [],
        salaryDistribution: [],
        pfCount: 0,
        esicCount: 0,
        topPaid: [],
        allEmps: [],
      };
    }
    const activeEmps = employees.filter((e) => e.status !== 'Inactive' && e.ctcPerAnnum);

    const totalPayroll = activeEmps.reduce((sum, e) => sum + (Number(e.ctcPerAnnum) || 0), 0);

    const avgSalary = activeEmps.length > 0 ? totalPayroll / activeEmps.length : 0;

    const deptSalary = {};
    activeEmps.forEach((emp) => {
      const dept = emp.department || 'Unknown';
      if (!deptSalary[dept]) {
        deptSalary[dept] = {
          total: 0,
          count: 0,
          min: Infinity,
          max: 0,
        };
      }
      const ctc = Number(emp.ctcPerAnnum) || 0;
      deptSalary[dept].total += ctc;
      deptSalary[dept].count += 1;
      deptSalary[dept].min = Math.min(deptSalary[dept].min, ctc);
      deptSalary[dept].max = Math.max(deptSalary[dept].max, ctc);
    });

    const deptSalaryData = Object.entries(deptSalary)
      .map(([dept, data]) => ({
        dept,
        avg: Math.round(data.total / data.count),
        min: data.min === Infinity ? 0 : data.min,
        max: data.max,
        count: data.count,
        total: data.total,
      }))
      .sort((a, b) => b.avg - a.avg);

    const ranges = [
      { label: 'Below 3L', min: 0, max: 300000 },
      { label: '3L - 6L', min: 300000, max: 600000 },
      { label: '6L - 10L', min: 600000, max: 1000000 },
      { label: '10L - 15L', min: 1000000, max: 1500000 },
      { label: '15L - 25L', min: 1500000, max: 2500000 },
      { label: 'Above 25L', min: 2500000, max: Infinity },
    ];

    const salaryDistribution = ranges.map((range) => ({
      label: range.label,
      count: activeEmps.filter((e) => {
        const ctc = Number(e.ctcPerAnnum) || 0;
        return ctc >= range.min && ctc < range.max;
      }).length,
    }));

    const pfCount = activeEmps.filter((e) => e.pfApplicable).length;
    const esicCount = activeEmps.filter((e) => e.esicApplicable).length;

    const topPaid = [...activeEmps]
      .sort((a, b) => (Number(b.ctcPerAnnum) || 0) - (Number(a.ctcPerAnnum) || 0))
      .slice(0, 10);

    return {
      totalPayroll,
      avgSalary,
      activeCount: activeEmps.length,
      deptSalaryData,
      salaryDistribution,
      pfCount,
      esicCount,
      topPaid,
      allEmps: activeEmps,
    };
  }, [activeTab, employees]);

  const handleHeadcountExcel = () => {
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
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Headcount');
    const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
    XLSX.writeFile(wb, `${safeCompanyFile}_Headcount-Report_${today}.xlsx`);
  };

  const handleOffboardingExcel = () => {
    const wb = XLSX.utils.book_new();

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
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(noticeData), 'Notice Period');
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
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exitData), 'Exit In Progress');
    }

    if (withdrawnOffboardingRows.length > 0) {
      const withdrawnData = withdrawnOffboardingRows.map(({ e }) => ({
        Name: e.fullName,
        'Emp ID': e.empId,
        Department: e.department || '',
        'Withdrawn On': toDisplayDate(e.offboarding?.withdrawnOn),
        Notes: e.offboarding?.withdrawNotes || '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(withdrawnData), 'Withdrawn');
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
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(completedData), 'Completed Exits');
    }

    if (wb.SheetNames.length === 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([{ Message: 'No offboarding rows in this report.' }]),
        'Summary',
      );
    }

    XLSX.writeFile(wb, `${safeCompanyFile}_Offboarding-Report_${new Date().toLocaleDateString('en-GB').split('/').join('-')}.xlsx`);
  };

  const handleCompensationExcel = () => {
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
  };

  const downloadEmployeeCSV = () => {
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
  };

  const downloadEmployeeExcel = () => {
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
  };

  const progressBarClass = (pct) => {
    if (pct <= 25) return 'bg-red-500';
    if (pct <= 75) return 'bg-amber-500';
    if (pct < 100) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const handlePrintReport = (tabId) => {
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
      generatedBy: currentUser?.email || '',
      content,
    });
    openPrintWindow(html);
  };

  if (!companyId) return null;

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <PageLoader />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Analytics and insights for {companyDisplayName}</p>
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-none pb-2 mb-6 border-b border-gray-100 -mx-4 px-4 lg:mx-0 lg:px-0">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabSwitch(tab.id)}
            className={`flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg text-sm whitespace-nowrap font-medium flex-shrink-0 transition-all active:opacity-90 ${
              activeTab === tab.id ? 'bg-[#1B6B6B] text-white' : 'text-gray-500 hover:bg-gray-100 active:bg-gray-200'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {tabLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#1B6B6B] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
      {/* HEADCOUNT */}
      {activeTab === 'headcount' && (
        <>
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
      )}

      {/* EMPLOYEES */}
      {activeTab === 'employee' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard value={employeeSummary.total} label="Total" />
            <StatCard value={employeeSummary.active} label="Active" />
            <StatCard value={employeeSummary.inactive} label="Inactive" />
            <StatCard value={employeeSummary.offboarding} label="Offboarding" />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <select value={empFilterDept} onChange={(e) => setEmpFilterDept(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              {deptOptions.map((d) => (
                <option key={d} value={d}>
                  Dept: {d}
                </option>
              ))}
            </select>
            <select value={empFilterBranch} onChange={(e) => setEmpFilterBranch(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              {branchOptions.map((b) => (
                <option key={b} value={b}>
                  Branch: {b}
                </option>
              ))}
            </select>
            <select value={empFilterStatus} onChange={(e) => setEmpFilterStatus(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="All">Status: All</option>
              <option value="Active">Active</option>
              <option value="Notice Period">Notice Period</option>
              <option value="Inactive">Inactive</option>
              <option value="On Leave">On Leave</option>
              <option value="Offboarding">Offboarding</option>
            </select>
            <select value={empFilterType} onChange={(e) => setEmpFilterType(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="All">Employment: All</option>
              {[...new Set(employees.map((e) => e.employmentType).filter(Boolean))].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select value={empFilterYear} onChange={(e) => setEmpFilterYear(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
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
      )}

      {/* COMPENSATION */}
      {activeTab === 'compensation' && (
        <div className="space-y-6">
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
      )}

      {/* LEAVE */}
      {activeTab === 'leave' && (
        <>
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
                  {employees.map((emp) => {
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
      )}

      {/* ASSETS */}
      {activeTab === 'asset' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard value={assetStats.total} label="Total assets" />
            <StatCard value={assetStats.assigned} label="Assigned (trackable)" />
            <StatCard value={assetStats.available} label="Available (trackable)" />
            <StatCard value={`${assetStats.issued} / ${assetStats.totalStock}`} label="Consumable issued / stock" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <ChartCard title="Assets by type">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={assetByType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1B6B6B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Trackable status breakdown">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={assetStatusData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {assetStatusData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <ChartCard title="Assets per employee">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b">
                  <th className="py-2">Employee</th>
                  <th className="py-2">Emp ID</th>
                  <th className="py-2">Count</th>
                  <th className="py-2">Assets</th>
                </tr>
              </thead>
              <tbody>
                {assetsPerEmployeeRows.map((r) => (
                  <tr key={r.employeeId} className="border-t border-gray-100">
                    <td className="py-2">
                      <Link to={`/company/${companyId}/employees/${r.employeeId}`} className="text-[#1B6B6B] hover:underline">
                        {r.empName}
                      </Link>
                    </td>
                    <td className="py-2">{r.empId}</td>
                    <td className="py-2">{r.count}</td>
                    <td className="py-2 text-gray-600 text-xs max-w-md truncate" title={r.namesStr}>
                      {r.namesStr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ChartCard>
          <ChartCard title="Consumable stock levels">
            <div className="space-y-3">
              {consumableRows.map((c) => {
                const pct = c.stock > 0 ? Math.round((c.available / c.stock) * 100) : 0;
                return (
                  <div key={c.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-gray-500">
                        Stock {c.stock} · Issued {c.issued} · Avail {c.available}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#4ECDC4] rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {consumableRows.length === 0 && <p className="text-gray-400 text-sm">No consumable assets</p>}
            </div>
          </ChartCard>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => handlePrintReport('asset')}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              🖨️ Print Report
            </button>
            <DownloadExcelButton
              onClick={() =>
                downloadReport(safeCompanyFile, 'Assets', assets, [
                  { header: 'Type', accessor: (a) => a.type || '' },
                  { header: 'Name', accessor: (a) => a.name || '' },
                  { header: 'Mode', accessor: (a) => a.mode || 'trackable' },
                  { header: 'Status', accessor: (a) => a.status || '' },
                  { header: 'Asset ID', accessor: (a) => a.assetId || '' },
                ])
              }
            />
          </div>
        </>
      )}

      {/* DOCUMENTS */}
      {activeTab === 'document' && (
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
      )}

      {/* ONBOARDING */}
      {activeTab === 'onboarding' && (
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
      )}

      {/* OFFBOARDING */}
      {activeTab === 'offboarding' && (
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
      )}
        </>
      )}
    </div>
  );
}
