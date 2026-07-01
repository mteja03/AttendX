import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { SkeletonTable } from '../components/SkeletonRow';
import PageHeader from '../components/PageHeader';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { toDateString, toDisplayDate, toJSDate } from '../utils';
import { DOCUMENT_CHECKLIST, getMandatoryDocCount } from '../utils/documentTypes';
import { trackPageView, trackReportViewed } from '../utils/analytics';
import {
  REPORT_TABS,
  getEmployeeOffboardingPhase,
  normalizeLeaveTypesFromCompany,
  buildAllowancesMapFromCompany,
  getOverallPct,
  getMissingMandatoryNames,
  tenureLabel,
  getDaysRemainingLastDay,
  leaveRecordMatchesType,
} from '../utils/reportHelpers';
import { handlePrintReport as buildPrintReport } from '../utils/reportPrint';
import {
  handleHeadcountExcel as _handleHeadcountExcel,
  handleOffboardingExcel as _handleOffboardingExcel,
  handleCompensationExcel as _handleCompensationExcel,
  downloadEmployeeCSV as _downloadEmployeeCSV,
  downloadEmployeeExcel as _downloadEmployeeExcel,
} from '../utils/reportExcel';

import HeadcountTab from '../components/reports/HeadcountTab';
import EmployeeTab from '../components/reports/EmployeeTab';
import CompensationTab from '../components/reports/CompensationTab';
import LeaveTab from '../components/reports/LeaveTab';
import AssetTab from '../components/reports/AssetTab';
import DocumentTab from '../components/reports/DocumentTab';
import OnboardingTab from '../components/reports/OnboardingTab';
import OffboardingTab from '../components/reports/OffboardingTab';
import BranchTab from '../components/reports/BranchTab';
import AuditTab from '../components/reports/AuditTab';

const defaultTotalMandatory = getMandatoryDocCount();

export default function Reports() {
  const { companyId } = useParams();

  const { currentUser } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [assets, setAssets] = useState([]);
  const [audits, setAudits] = useState([]);
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
  const [filterLocation, setFilterLocation] = useState('');

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
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
      const [empSnap, leaveSnap, assetSnap, compSnap, rolesSnap, auditSnap] = await Promise.all([
        getDocs(query(collection(db, 'companies', companyId, 'employees'), limit(1000))),
        getDocs(
          query(
            collection(db, 'companies', companyId, 'leave'),
            where('startDate', '>=', yearStart),
            orderBy('startDate', 'desc'),
            limit(500),
          ),
        ).catch(() =>
          getDocs(query(collection(db, 'companies', companyId, 'leave'), limit(500))),
        ),
        getDocs(query(collection(db, 'companies', companyId, 'assets'), limit(500))),
        getDoc(doc(db, 'companies', companyId)),
        getDocs(query(collection(db, 'companies', companyId, 'roles'), limit(200))).catch(() => ({
          docs: [],
        })),
        getDocs(query(collection(db, 'companies', companyId, 'audits'), limit(200))).catch(() => ({
          docs: [],
        })),
      ]);
      setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLeaveList(leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAssets(assetSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAudits(auditSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  const structuredLocations = useMemo(() => {
    const raw = company?.locations || [];
    if (raw.length > 0 && typeof raw[0] === 'object' && raw[0].branches) return raw;
    return raw.map((l, i) => ({
      id: `loc_${i}`,
      name: typeof l === 'string' ? l : (l.name || String(l)),
      branches: [],
    }));
  }, [company?.locations]);

  const employeeMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  const locationFilteredEmployees = useMemo(() => {
    if (!filterLocation) return employees;
    return employees.filter((e) => (e.location || '') === filterLocation);
  }, [employees, filterLocation]);

  const locationFilteredLeaveList = useMemo(() => {
    if (!filterLocation) return leaveList;
    const ids = new Set(locationFilteredEmployees.map((e) => e.id));
    return leaveList.filter((l) => ids.has(l.employeeId));
  }, [leaveList, filterLocation, locationFilteredEmployees]);

  const locationFilteredAssets = useMemo(() => {
    if (!filterLocation) return assets;
    return assets.filter((a) => {
      if (a.assignmentType === 'branch') {
        return (a.assignedLocation || '') === filterLocation;
      }
      const emp = employeeMap[a.assignedToId];
      if (emp) return (emp.location || '') === filterLocation;
      return false;
    });
  }, [assets, filterLocation, employeeMap]);

  const leaveBalanceByEmp = useMemo(() => {
    if (activeTab !== 'leave') return {};
    const approved = locationFilteredLeaveList.filter((l) => l.status === 'Approved');
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
    locationFilteredEmployees.forEach((e) => ensureRow(e.id, e.fullName));
    approved.forEach((l) => {
      ensureRow(l.employeeId, l.employeeName);
      paidLeaveTypes.forEach((lt) => {
        if (leaveRecordMatchesType(l, lt)) {
          byEmployee[l.employeeId][lt.shortCode] += l.days || 0;
        }
      });
    });
    return byEmployee;
  }, [activeTab, locationFilteredLeaveList, locationFilteredEmployees, paidLeaveTypes]);

  const todayStr = toDateString(new Date());
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const headcountStats = useMemo(() => {
    if (activeTab !== 'headcount') {
      return { total: 0, active: 0, onLeaveToday: 0, newJoiners: 0 };
    }
    const total = locationFilteredEmployees.length;
    const active = locationFilteredEmployees.filter((e) => (e.status || 'Active') === 'Active').length;
    const locationEmpIds = new Set(locationFilteredEmployees.map((e) => e.id));
    const onLeaveToday = leaveList.filter((l) => {
      if (filterLocation && !locationEmpIds.has(l.employeeId)) return false;
      if (l.status !== 'Approved') return false;
      const start = toDateString(l.startDate);
      const end = toDateString(l.endDate);
      if (!start || !end) return false;
      return todayStr >= start && todayStr <= end;
    }).length;
    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const newJoiners = locationFilteredEmployees.filter((e) => {
      const j = toJSDate(e.joiningDate);
      return j && !Number.isNaN(j.getTime()) && j >= startOfMonth;
    }).length;
    return { total, active, onLeaveToday, newJoiners };
  }, [activeTab, locationFilteredEmployees, leaveList, todayStr, currentYear, currentMonth, filterLocation]);

  const deptData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const acc = {};
    locationFilteredEmployees.forEach((emp) => {
      const dept = emp.department || 'Other';
      acc[dept] = (acc[dept] || 0) + 1;
    });
    return Object.entries(acc)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, locationFilteredEmployees]);

  const roleVacancyData = useMemo(
    () => {
      if (activeTab !== 'headcount') return [];
      return roles
        .filter((r) => r.isActive !== false)
        .map((role) => {
          const filled = locationFilteredEmployees.filter(
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
    [activeTab, roles, locationFilteredEmployees],
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
    locationFilteredEmployees.forEach((emp) => {
      const t = emp.employmentType || 'Other';
      acc[t] = (acc[t] || 0) + 1;
    });
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [activeTab, locationFilteredEmployees]);

  const categoryData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const acc = {};
    locationFilteredEmployees.forEach((emp) => {
      const c = emp.category || 'Other';
      acc[c] = (acc[c] || 0) + 1;
    });
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [activeTab, locationFilteredEmployees]);

  const genderData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const acc = {};
    locationFilteredEmployees.forEach((emp) => {
      const g = emp.gender || 'Not specified';
      acc[g] = (acc[g] || 0) + 1;
    });
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [activeTab, locationFilteredEmployees]);

  const tenureData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const buckets = { '< 1 year': 0, '1-2 years': 0, '2-5 years': 0, '5+ years': 0 };
    locationFilteredEmployees.forEach((emp) => {
      const joined = toJSDate(emp.joiningDate);
      if (!joined || Number.isNaN(joined.getTime())) return;
      const years = (new Date() - joined) / (365.25 * 24 * 60 * 60 * 1000);
      if (years < 1) buckets['< 1 year'] += 1;
      else if (years < 2) buckets['1-2 years'] += 1;
      else if (years < 5) buckets['2-5 years'] += 1;
      else buckets['5+ years'] += 1;
    });
    return Object.entries(buckets).map(([name, count]) => ({ name, count }));
  }, [activeTab, locationFilteredEmployees]);

  const branchData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const acc = {};
    locationFilteredEmployees.forEach((emp) => {
      const b = emp.branch || 'Other';
      acc[b] = (acc[b] || 0) + 1;
    });
    return Object.entries(acc)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, locationFilteredEmployees]);

  const locationData = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const counts = {};
    locationFilteredEmployees.forEach((emp) => {
      if (emp.location) {
        counts[emp.location] = (counts[emp.location] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, locationFilteredEmployees]);

  const attritionTrend = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      months.push({ key, label, exits: 0, joins: 0 });
    }
    const filtered = filterLocation ? employees.filter((e) => (e.location || '') === filterLocation) : employees;
    filtered.forEach((e) => {
      const jd = e.joiningDate || e.dateOfJoining;
      if (jd) {
        const jKey = typeof jd === 'string' ? jd.slice(0, 7) : '';
        const m = months.find((mo) => mo.key === jKey);
        if (m) m.joins++;
      }
      const exitDate = e.offboarding?.expectedLastDay || e.offboarding?.lastWorkingDay;
      if (exitDate && (e.status === 'Notice Period' || e.status === 'Offboarding' || e.status === 'Inactive')) {
        const eKey = typeof exitDate === 'string' ? exitDate.slice(0, 7) : '';
        const m = months.find((mo) => mo.key === eKey);
        if (m) m.exits++;
      }
    });
    return months;
  }, [activeTab, employees, filterLocation]);

  const tenureDistribution = useMemo(() => {
    if (activeTab !== 'headcount') return [];
    const filtered = filterLocation ? employees.filter((e) => (e.location || '') === filterLocation) : employees;
    const buckets = [
      { label: '<1 year', min: 0, max: 1, count: 0 },
      { label: '1-2 years', min: 1, max: 2, count: 0 },
      { label: '2-3 years', min: 2, max: 3, count: 0 },
      { label: '3-5 years', min: 3, max: 5, count: 0 },
      { label: '5+ years', min: 5, max: 100, count: 0 },
    ];
    const now = new Date();
    filtered.forEach((e) => {
      if (e.status !== 'Active') return;
      const jd = e.joiningDate || e.dateOfJoining;
      if (!jd) return;
      const joinDate = new Date(jd);
      const years = (now - joinDate) / (365.25 * 24 * 60 * 60 * 1000);
      const bucket = buckets.find((b) => years >= b.min && years < b.max);
      if (bucket) bucket.count++;
    });
    return buckets;
  }, [activeTab, employees, filterLocation]);

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
    let list = [...employees];
    if (filterLocation) list = list.filter((e) => (e.location || '') === filterLocation);
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
  }, [activeTab, employees, filterLocation, empFilterDept, empFilterBranch, empFilterStatus, empFilterType, empFilterYear]);

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
      return locationFilteredLeaveList.filter((l) => {
      const d = toJSDate(l.appliedAt);
      return d && d.getFullYear() === currentYear;
    });
    },
    [activeTab, locationFilteredLeaveList, currentYear],
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
        const count = locationFilteredLeaveList.filter((l) => {
          const d = toJSDate(l.appliedAt);
          return d && d.getMonth() === i && d.getFullYear() === currentYear;
        }).length;
        return { month: monthName, count };
      });
    },
    [activeTab, locationFilteredLeaveList, currentYear],
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

  const topLeaveTakers = useMemo(() => {
    if (activeTab !== 'leave') return [];
    const filtered = filterLocation ? employees.filter((e) => (e.location || '') === filterLocation) : employees;
    const leaveMap = {};
    leaveList.forEach((l) => {
      if (l.status !== 'Approved') return;
      const id = l.employeeId;
      if (!leaveMap[id]) leaveMap[id] = { days: 0 };
      leaveMap[id].days += (l.totalDays || l.numberOfDays || 1);
    });
    return filtered
      .filter((e) => e.status === 'Active' && leaveMap[e.id])
      .map((e) => ({ id: e.id, name: e.fullName || e.name || e.email, department: e.department || '—', branch: e.branch || '—', days: leaveMap[e.id]?.days || 0 }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 10);
  }, [activeTab, employees, leaveList, filterLocation]);

  const absenceByBranch = useMemo(() => {
    if (activeTab !== 'leave') return [];
    const filtered = filterLocation ? employees.filter((e) => (e.location || '') === filterLocation) : employees;
    const branchMap = {};
    filtered.forEach((e) => {
      const br = e.branch || e.location || '—';
      if (!branchMap[br]) branchMap[br] = { name: br, employees: 0, leaveDays: 0 };
      branchMap[br].employees++;
    });
    leaveList.forEach((l) => {
      if (l.status !== 'Approved') return;
      const emp = filtered.find((e) => e.id === l.employeeId);
      if (!emp) return;
      const br = emp.branch || emp.location || '—';
      if (branchMap[br]) branchMap[br].leaveDays += (l.totalDays || l.numberOfDays || 1);
    });
    return Object.values(branchMap)
      .map((b) => ({ ...b, rate: b.employees > 0 ? parseFloat(((b.leaveDays / (b.employees * 260)) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 15);
  }, [activeTab, employees, leaveList, filterLocation]);

  const assetStats = useMemo(() => {
    if (activeTab !== 'asset') {
      return { total: 0, trackable: 0, consumable: 0, assigned: 0, available: 0, totalStock: 0, issued: 0 };
    }
    const trackable = locationFilteredAssets.filter((a) => (a.mode || 'trackable') === 'trackable');
    const consumable = locationFilteredAssets.filter((a) => (a.mode || 'trackable') === 'consumable');
    const assigned = trackable.filter((a) => a.status === 'Assigned').length;
    const available = trackable.filter((a) => a.status === 'Available').length;
    const totalStock = consumable.reduce((s, a) => s + (Number(a.stockQuantity) || 0), 0);
    const issued = consumable.reduce((s, a) => s + (Number(a.issuedCount) || 0), 0);
    return {
      total: locationFilteredAssets.length,
      trackable: trackable.length,
      consumable: consumable.length,
      assigned,
      available,
      totalStock,
      issued,
    };
  }, [activeTab, locationFilteredAssets]);

  const assetByType = useMemo(() => {
    if (activeTab !== 'asset') return [];
    const acc = {};
    locationFilteredAssets.forEach((a) => {
      const t = a.type || 'Other';
      acc[t] = (acc[t] || 0) + 1;
    });
    return Object.entries(acc)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeTab, locationFilteredAssets]);

  const assetStatusData = useMemo(() => {
    if (activeTab !== 'asset') return [];
    const trackable = locationFilteredAssets.filter((a) => (a.mode || 'trackable') === 'trackable');
    const acc = { Available: 0, Assigned: 0, Damaged: 0, 'In Repair': 0, Lost: 0, Other: 0 };
    trackable.forEach((a) => {
      const st = a.status || 'Other';
      if (acc[st] === undefined) acc.Other += 1;
      else acc[st] += 1;
    });
    return Object.entries(acc)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [activeTab, locationFilteredAssets]);

  const branchAnalytics = useMemo(() => {
    if (activeTab !== 'branch') return [];
    const branchMap = {};
    employees.forEach((e) => {
      const br = e.branch || e.location || '—';
      if (!branchMap[br]) branchMap[br] = {
        name: br,
        location: e.location || '—',
        employees: 0,
        active: 0,
        notice: 0,
        offboarding: 0,
        departments: new Set(),
        totalSalary: 0,
        salaryCount: 0,
        assetCount: 0,
        branchAssetCount: 0,
        assetValue: 0,
        leaveCount: 0,
        auditCount: 0,
        auditsClosed: 0,
        auditScoreSum: 0,
        auditScoreCount: 0,
        verified: 0,
        mismatch: 0,
      };
      const b = branchMap[br];
      b.employees++;
      if (e.status === 'Active') b.active++;
      else if (e.status === 'Notice Period') b.notice++;
      else if (e.status === 'Offboarding') b.offboarding++;
      if (e.department) b.departments.add(e.department);
      const sal = parseFloat(e.salary || e.ctc || 0);
      if (sal > 0) { b.totalSalary += sal; b.salaryCount++; }
    });

    assets.forEach((a) => {
      if (a.assignmentType === 'branch') {
        const br = a.assignedBranch || a.assignedLocation || '—';
        if (branchMap[br]) { branchMap[br].branchAssetCount++; branchMap[br].assetValue += (a.purchasePrice || 0); }
      } else {
        const emp = employees.find((em) => em.id === a.assignedToId);
        if (emp) {
          const br = emp.branch || emp.location || '—';
          if (branchMap[br]) { branchMap[br].assetCount++; branchMap[br].assetValue += (a.purchasePrice || 0); }
        }
      }
    });

    leaveList.forEach((l) => {
      const emp = employees.find((em) => em.id === l.employeeId);
      if (emp) {
        const br = emp.branch || emp.location || '—';
        if (branchMap[br]) branchMap[br].leaveCount++;
      }
    });

    return Object.values(branchMap)
      .filter((b) => !filterLocation || b.location === filterLocation)
      .sort((a, b) => b.employees - a.employees);
  }, [activeTab, employees, assets, leaveList, filterLocation]);

  const assetsPerEmployeeRows = useMemo(() => {
    if (activeTab !== 'asset') return [];
    const rows = {};
    locationFilteredAssets
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
  }, [activeTab, locationFilteredAssets, employeeMap]);

  const consumableRows = useMemo(
    () => {
      if (activeTab !== 'asset') return [];
      return locationFilteredAssets
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
    [activeTab, locationFilteredAssets],
  );

  const assetsByTypeAndAssignment = useMemo(() => {
    if (activeTab !== 'asset') return [];
    const filtered = filterLocation
      ? assets.filter((a) => a.assignmentType === 'branch' ? (a.assignedLocation || '') === filterLocation : employees.some((e) => e.id === a.assignedToId && (e.location || '') === filterLocation))
      : assets;
    const typeMap = {};
    filtered.forEach((a) => {
      const type = a.type || 'Other';
      if (!typeMap[type]) typeMap[type] = { type, employee: 0, branch: 0, value: 0 };
      if (a.assignmentType === 'branch') typeMap[type].branch++;
      else typeMap[type].employee++;
      typeMap[type].value += (a.purchasePrice || 0);
    });
    return Object.values(typeMap).sort((a, b) => (b.employee + b.branch) - (a.employee + a.branch)).slice(0, 10);
  }, [activeTab, assets, employees, filterLocation]);

  const warrantyExpiring = useMemo(() => {
    if (activeTab !== 'asset') return [];
    const now = new Date();
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    return assets
      .filter((a) => {
        if (!a.warrantyExpiry) return false;
        const exp = a.warrantyExpiry?.toDate ? a.warrantyExpiry.toDate() : new Date(a.warrantyExpiry);
        return exp >= now && exp <= in90;
      })
      .map((a) => {
        const exp = a.warrantyExpiry?.toDate ? a.warrantyExpiry.toDate() : new Date(a.warrantyExpiry);
        const daysLeft = Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
        return { id: a.id, name: a.name || a.assetId, type: a.type || '—', assignedTo: a.assignmentType === 'branch' ? `🏢 ${a.assignedBranch || '—'}` : (a.assignedToName || 'Unassigned'), expiryDate: exp.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), daysLeft };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [activeTab, assets]);

  const auditByBranch = useMemo(() => {
    if (activeTab !== 'audit') return [];
    const filtered = filterLocation
      ? audits.filter((a) => (a.location || '') === filterLocation)
      : audits;
    const branchMap = {};
    filtered.forEach((a) => {
      const br = a.branch || a.location || '—';
      if (!branchMap[br]) branchMap[br] = {
        name: br,
        total: 0,
        closed: 0,
        avgScore: 0,
        scoreSum: 0,
        scoreCount: 0,
        verified: 0,
        mismatch: 0,
        noVerification: 0,
      };
      const b = branchMap[br];
      b.total++;
      if (a.status === 'Closed') {
        b.closed++;
        const score = a.auditScore || a.score || 0;
        if (score > 0) { b.scoreSum += score; b.scoreCount++; }
      }
      if (a.locationCheck) {
        if (a.locationCheck.verified) b.verified++;
        else b.mismatch++;
      } else if (a.requireLocation) {
        b.noVerification++;
      }
    });
    return Object.values(branchMap)
      .map((b) => ({ ...b, avgScore: b.scoreCount > 0 ? Math.round(b.scoreSum / b.scoreCount) : 0, completionRate: b.total > 0 ? Math.round((b.closed / b.total) * 100) : 0, verificationRate: (b.verified + b.mismatch) > 0 ? Math.round((b.verified / (b.verified + b.mismatch)) * 100) : null }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [activeTab, audits, filterLocation]);

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
    const activeEmps = locationFilteredEmployees.filter((e) => e.status !== 'Inactive' && e.ctcPerAnnum);

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
  }, [activeTab, locationFilteredEmployees]);

  const handleHeadcountExcel = () => _handleHeadcountExcel({ employees, safeCompanyFile });

  const handleOffboardingExcel = () => _handleOffboardingExcel({
    noticePeriodReportRows,
    activeOffboardingRows,
    withdrawnOffboardingRows,
    completedOffboardingRows,
    safeCompanyFile,
  });

  const handleCompensationExcel = () => _handleCompensationExcel({ compensationData, safeCompanyFile });

  const downloadEmployeeCSV = () => _downloadEmployeeCSV({
    filteredEmployeesForReport,
    activeChecklist,
    totalMandatory,
    defaultTotalMandatory,
    safeCompanyFile,
  });

  const downloadEmployeeExcel = () => _downloadEmployeeExcel({
    filteredEmployeesForReport,
    activeChecklist,
    totalMandatory,
    defaultTotalMandatory,
    safeCompanyFile,
  });

  const handlePrintReport = (tabId) => {
    buildPrintReport(tabId, {
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
      currentUserEmail: currentUser?.email || '',
    });
  };

  // (print logic extracted to src/utils/reportPrint.js)


  if (!companyId) return null;

  if (loading) {
    return (
      <div className="animate-pulse">

        {/* Page header skeleton */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 mb-0">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-2">
              <div className="h-5 bg-gray-200 rounded w-24" />
              <div className="h-3 bg-gray-100 rounded w-48" />
            </div>
          </div>
          {/* Tab bar */}
          <div className="flex gap-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded-lg w-24" />
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
                <div className="h-3 bg-gray-100 rounded w-24" />
                <div className="h-8 bg-gray-200 rounded w-16" />
                <div className="h-2.5 bg-gray-100 rounded w-32" />
              </div>
            ))}
          </div>

          {/* Chart placeholder */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-4">
            <div className="h-4 bg-gray-200 rounded w-32 mb-4" />
            <div className="h-48 bg-gray-100 rounded-xl" />
          </div>

          {/* Table placeholder */}
          <SkeletonTable rows={5} />
        </div>

      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <PageHeader
          title="Reports"
          subtitle={`Analytics and insights for ${companyDisplayName}`}
          tabs={REPORT_TABS}
          activeTab={activeTab}
          onTabChange={handleTabSwitch}
        />
      </div>

      {tabLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#1B6B6B] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === 'headcount' && (
            <HeadcountTab
              companyId={companyId}
              employees={employees}
              headcountStats={headcountStats}
              deptData={deptData}
              typeData={typeData}
              categoryData={categoryData}
              genderData={genderData}
              tenureData={tenureData}
              branchData={branchData}
              locationData={locationData}
              attritionTrend={attritionTrend}
              tenureDistribution={tenureDistribution}
              roleVacancyData={roleVacancyData}
              roleVacancySummary={roleVacancySummary}
              filterLocation={filterLocation}
              setFilterLocation={setFilterLocation}
              structuredLocations={structuredLocations}
              handlePrintReport={handlePrintReport}
              handleHeadcountExcel={handleHeadcountExcel}
            />
          )}

          {activeTab === 'employee' && (
            <EmployeeTab
              companyId={companyId}
              employees={employees}
              filteredEmployeesForReport={filteredEmployeesForReport}
              employeeSummary={employeeSummary}
              filterLocation={filterLocation}
              setFilterLocation={setFilterLocation}
              structuredLocations={structuredLocations}
              empFilterDept={empFilterDept}
              setEmpFilterDept={setEmpFilterDept}
              empFilterBranch={empFilterBranch}
              setEmpFilterBranch={setEmpFilterBranch}
              empFilterStatus={empFilterStatus}
              setEmpFilterStatus={setEmpFilterStatus}
              empFilterType={empFilterType}
              setEmpFilterType={setEmpFilterType}
              empFilterYear={empFilterYear}
              setEmpFilterYear={setEmpFilterYear}
              deptOptions={deptOptions}
              branchOptions={branchOptions}
              activeChecklist={activeChecklist}
              totalMandatory={totalMandatory}
              defaultTotalMandatory={defaultTotalMandatory}
              handlePrintReport={handlePrintReport}
              downloadEmployeeCSV={downloadEmployeeCSV}
              downloadEmployeeExcel={downloadEmployeeExcel}
            />
          )}

          {activeTab === 'compensation' && (
            <CompensationTab
              companyId={companyId}
              locationFilteredEmployees={locationFilteredEmployees}
              compensationData={compensationData}
              filterLocation={filterLocation}
              setFilterLocation={setFilterLocation}
              structuredLocations={structuredLocations}
              handlePrintReport={handlePrintReport}
              handleCompensationExcel={handleCompensationExcel}
            />
          )}

          {activeTab === 'leave' && (
            <LeaveTab
              leaveList={leaveList}
              leaveStats={leaveStats}
              leaveByType={leaveByType}
              monthlyLeave={monthlyLeave}
              leaveByDept={leaveByDept}
              leaveBalanceByEmp={leaveBalanceByEmp}
              locationFilteredEmployees={locationFilteredEmployees}
              topLeaveEmployees={topLeaveEmployees}
              topLeaveTakers={topLeaveTakers}
              absenceByBranch={absenceByBranch}
              paidLeaveTypes={paidLeaveTypes}
              leavePolicyMap={leavePolicyMap}
              currentYear={currentYear}
              filterLocation={filterLocation}
              setFilterLocation={setFilterLocation}
              structuredLocations={structuredLocations}
              handlePrintReport={handlePrintReport}
              safeCompanyFile={safeCompanyFile}
              leaveYearList={leaveYearList}
            />
          )}

          {activeTab === 'asset' && (
            <AssetTab
              companyId={companyId}
              assets={assets}
              assetStats={assetStats}
              assetByType={assetByType}
              assetStatusData={assetStatusData}
              assetsPerEmployeeRows={assetsPerEmployeeRows}
              consumableRows={consumableRows}
              assetsByTypeAndAssignment={assetsByTypeAndAssignment}
              warrantyExpiring={warrantyExpiring}
              filterLocation={filterLocation}
              setFilterLocation={setFilterLocation}
              structuredLocations={structuredLocations}
              handlePrintReport={handlePrintReport}
              safeCompanyFile={safeCompanyFile}
            />
          )}

          {activeTab === 'document' && (
            <DocumentTab
              companyId={companyId}
              employees={employees}
              docStats={docStats}
              completionBuckets={completionBuckets}
              missingDocTableRows={missingDocTableRows}
              activeChecklist={activeChecklist}
              totalMandatory={totalMandatory}
              defaultTotalMandatory={defaultTotalMandatory}
              handlePrintReport={handlePrintReport}
              safeCompanyFile={safeCompanyFile}
            />
          )}

          {activeTab === 'onboarding' && (
            <OnboardingTab
              companyId={companyId}
              employees={employees}
              onboardingStats={onboardingStats}
              onboardingDonutData={onboardingDonutData}
              deptOnboardingAvg={deptOnboardingAvg}
              newJoinersTable={newJoinersTable}
              handlePrintReport={handlePrintReport}
              safeCompanyFile={safeCompanyFile}
            />
          )}

          {activeTab === 'offboarding' && (
            <OffboardingTab
              companyId={companyId}
              employees={employees}
              offboardingReportStats={offboardingReportStats}
              exitReasons={exitReasons}
              monthlyExits={monthlyExits}
              inNoticePeriodByStatus={inNoticePeriodByStatus}
              noticePeriodReportRows={noticePeriodReportRows}
              activeOffboardingRows={activeOffboardingRows}
              withdrawnOffboardingRows={withdrawnOffboardingRows}
              completedOffboardingRows={completedOffboardingRows}
              handlePrintReport={handlePrintReport}
              handleOffboardingExcel={handleOffboardingExcel}
            />
          )}

          {activeTab === 'branch' && (
            <BranchTab
              branchAnalytics={branchAnalytics}
              filterLocation={filterLocation}
              setFilterLocation={setFilterLocation}
              structuredLocations={structuredLocations}
            />
          )}

          {activeTab === 'audit' && (
            <AuditTab
              audits={audits}
              auditByBranch={auditByBranch}
              filterLocation={filterLocation}
              setFilterLocation={setFilterLocation}
              structuredLocations={structuredLocations}
            />
          )}
        </>
      )}
    </div>
  );
}
