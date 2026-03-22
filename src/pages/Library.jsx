import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { toDisplayDate, toJSDate } from '../utils';

const LIBRARY_TABS = [
  { id: 'policies', label: 'Policies', icon: '📋' },
  { id: 'roles', label: 'Roles & Responsibilities', icon: '👔' },
];

const DEFAULT_DEPARTMENTS = [
  'Engineering',
  'Sales',
  'HR',
  'Finance',
  'Operations',
  'Marketing',
  'Design',
  'Legal',
  'Management',
  'Other',
];

const CATEGORIES = [
  'Leave',
  'Attendance',
  'IT & Security',
  'Code of Conduct',
  'HR Policies',
  'Safety',
  'Finance',
  'Other',
];

function getCategoryIcon(cat) {
  const m = {
    Leave: '🏖️',
    Attendance: '⏰',
    'IT & Security': '🔒',
    'Code of Conduct': '📋',
    'HR Policies': '👥',
    Safety: '⛑️',
    Finance: '💰',
    Other: '📄',
  };
  return m[cat] || '📄';
}

function getCategoryBg(cat) {
  const m = {
    Leave: 'bg-blue-50',
    Attendance: 'bg-amber-50',
    'IT & Security': 'bg-purple-50',
    'Code of Conduct': 'bg-green-50',
    'HR Policies': 'bg-[#E8F5F5]',
    Safety: 'bg-red-50',
    Finance: 'bg-yellow-50',
    Other: 'bg-gray-50',
  };
  return m[cat] || 'bg-gray-50';
}

const DEFAULT_POLICIES = [
  {
    title: 'Leave Policy',
    category: 'Leave',
    description: 'Guidelines for applying and managing leaves',
    content: `LEAVE POLICY

1. CASUAL LEAVE (CL)
Employees are entitled to 12 days of casual leave per year. CL cannot be carried forward to the next year.

2. SICK LEAVE (SL)
Employees are entitled to 12 days of sick leave per year. Medical certificate required for more than 2 consecutive days.

3. EARNED LEAVE (EL)
Employees earn 1.25 days of EL per month worked. EL can be carried forward up to 30 days.

4. APPLICATION PROCESS
All leave applications must be submitted through AttendX at least 2 days in advance (except sick leave).

5. APPROVAL
Leave is subject to manager approval. Emergency leave should be communicated via phone.`,
    version: '1.0',
    isActive: true,
  },
  {
    title: 'Code of Conduct',
    category: 'Code of Conduct',
    description: 'Expected behavior and professional standards',
    content: `CODE OF CONDUCT

1. PROFESSIONAL BEHAVIOR
All employees are expected to maintain professional behavior at all times in the workplace.

2. PUNCTUALITY
Employees must report to work on time. Habitual late-coming will result in disciplinary action.

3. DRESS CODE
Employees must dress professionally. Casual attire is permitted on Fridays.

4. CONFIDENTIALITY
Employees must maintain confidentiality of company information and client data.

5. ANTI-HARASSMENT
The company has zero tolerance for any form of harassment or discrimination.

6. CONFLICT OF INTEREST
Employees must disclose any conflict of interest to HR immediately.`,
    version: '1.0',
    isActive: true,
  },
  {
    title: 'IT & Data Security Policy',
    category: 'IT & Security',
    description: 'Rules for using company IT systems and data security',
    content: `IT & DATA SECURITY POLICY

1. ACCEPTABLE USE
Company systems must only be used for business purposes. Personal use should be minimal.

2. PASSWORD POLICY
Passwords must be at least 8 characters. Change passwords every 90 days. Never share passwords.

3. DATA PROTECTION
Company data must not be shared with unauthorized persons. No data should be stored on personal devices.

4. INTERNET USAGE
Employees must not visit inappropriate websites on company systems or networks.

5. SOFTWARE
Only licensed software approved by IT may be installed on company devices.

6. INCIDENTS
Any security incident must be reported to IT immediately.`,
    version: '1.0',
    isActive: true,
  },
  {
    title: 'Attendance & Punctuality',
    category: 'Attendance',
    description: 'Attendance tracking and punctuality expectations',
    content: `ATTENDANCE & PUNCTUALITY

1. WORK HOURS
Employees must adhere to scheduled work hours unless otherwise approved.

2. CHECK-IN
Use the prescribed attendance system daily.

3. LATE ARRIVALS
Repeated late arrivals may be recorded and reviewed with your manager.

4. ABSENCE
Unplanned absence must be reported to your manager as soon as possible.`,
    version: '1.0',
    isActive: true,
  },
  {
    title: 'Workplace Safety',
    category: 'Safety',
    description: 'General safety rules for all employees',
    content: `WORKPLACE SAFETY

1. EMERGENCY EXITS
Keep emergency exits clear at all times.

2. REPORTING
Report hazards or incidents to HR or facilities immediately.

3. EQUIPMENT
Use equipment only as trained and intended.

4. FIRST AID
Know the location of first-aid kits and emergency contacts.`,
    version: '1.0',
    isActive: true,
  },
];

/** Seed payloads — refs assigned in seedRolesIfEmpty for reportsToRoleId */
const DEFAULT_ROLE_SEEDS = [
  {
    key: 'gm',
    title: 'General Manager',
    department: 'Management',
    reportsTo: '',
    reportsToRoleId: null,
    salaryBand: { min: 1500000, max: 3000000, currency: 'INR' },
    responsibilities: [
      'Oversee all company operations',
      'Set strategic goals and objectives',
      'Manage department heads',
      'Report to Board/Directors',
    ],
    qualifications: {
      education: 'MBA or equivalent',
      experience: '10+ years',
      notes: 'Proven leadership experience required',
    },
    skills: {
      technical: ['Business Strategy', 'Financial Management', 'ERP'],
      soft: ['Leadership', 'Decision Making', 'Communication', 'Problem Solving'],
    },
    kpis: [
      { metric: 'Revenue growth', target: '20% YoY' },
      { metric: 'Employee retention', target: '>85%' },
    ],
  },
  {
    key: 'hr',
    title: 'HR Manager',
    department: 'HR',
    reportsTo: 'General Manager',
    salaryBand: { min: 600000, max: 1200000, currency: 'INR' },
    responsibilities: [
      'Manage end-to-end recruitment',
      'Handle employee relations',
      'Oversee payroll processing',
      'Manage compliance and statutory requirements',
      'Conduct performance appraisals',
    ],
    qualifications: {
      education: 'MBA (HR) or equivalent',
      experience: '5-8 years',
      notes: 'Experience with Indian labor laws required',
    },
    skills: {
      technical: ['HRMS', 'MS Excel', 'Payroll Software', 'Labour Laws'],
      soft: ['People Management', 'Conflict Resolution', 'Empathy'],
    },
    kpis: [
      { metric: 'Time to hire', target: '< 30 days' },
      { metric: 'Attrition rate', target: '< 15%' },
      { metric: 'Training completion', target: '90%' },
    ],
  },
  {
    key: 'sales',
    title: 'Sales Executive',
    department: 'Sales',
    reportsTo: 'Sales Manager',
    reportsToRoleId: null,
    salaryBand: { min: 250000, max: 500000, currency: 'INR' },
    responsibilities: [
      'Generate leads through cold calling',
      'Meet monthly sales targets',
      'Maintain and grow client relationships',
      'Submit daily activity reports',
      'Achieve conversion targets',
    ],
    qualifications: {
      education: 'Graduate (any stream)',
      experience: '0-3 years',
      notes: 'Freshers with good communication welcome',
    },
    skills: {
      technical: ['MS Excel', 'CRM Software', 'Sales Tools'],
      soft: ['Communication', 'Negotiation', 'Persistence', 'Time Management'],
    },
    kpis: [
      { metric: 'Monthly revenue', target: '₹5L per month' },
      { metric: 'Calls per day', target: '30 calls' },
      { metric: 'Conversion rate', target: '15%' },
    ],
  },
];

function formatLakhs(amount) {
  if (amount == null || amount === '') return '0';
  const n = Number(amount);
  if (Number.isNaN(n) || n === 0) return '0';
  if (n >= 10000000) {
    return `${(n / 10000000).toFixed(1)}Cr`;
  }
  if (n >= 100000) {
    return `${(n / 100000).toFixed(1)}L`;
  }
  if (n >= 1000) {
    return `${Math.round(n / 1000)}K`;
  }
  return String(n);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function previewText(policy) {
  const d = policy.description?.trim();
  if (d) {
    return d.length > 120 ? `${d.slice(0, 120)}…` : d;
  }
  const c = (policy.content || '').trim();
  if (!c) return '—';
  return c.length > 100 ? `${c.slice(0, 100)}…` : c;
}

function createEmptyRoleForm() {
  return {
    title: '',
    department: '',
    reportsToRoleId: '',
    isActive: true,
    salaryBand: { min: '', max: '', currency: 'INR' },
    qualifications: { education: '', experience: '', notes: '' },
    responsibilities: [''],
    skills: { technical: [], soft: [] },
    kpis: [{ metric: '', target: '' }],
  };
}

function roleDocToForm(role) {
  const sb = role.salaryBand || {};
  return {
    title: role.title || '',
    department: role.department || '',
    reportsToRoleId: role.reportsToRoleId || '',
    isActive: role.isActive !== false,
    salaryBand: {
      min: sb.min != null ? String(sb.min) : '',
      max: sb.max != null ? String(sb.max) : '',
      currency: sb.currency || 'INR',
    },
    qualifications: {
      education: role.qualifications?.education || '',
      experience: role.qualifications?.experience || '',
      notes: role.qualifications?.notes || '',
    },
    responsibilities: (role.responsibilities?.length ? role.responsibilities : ['']).map(String),
    skills: {
      technical: [...(role.skills?.technical || [])],
      soft: [...(role.skills?.soft || [])],
    },
    kpis:
      role.kpis?.length > 0
        ? role.kpis.map((k) => ({ metric: k.metric || '', target: k.target || '' }))
        : [{ metric: '', target: '' }],
  };
}

export default function Library() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { currentUser, role } = useAuth();
  const { company } = useCompany();
  const { success, error: showError } = useToast();
  const canEdit = role === 'admin' || role === 'hrmanager';

  const departments = useMemo(() => {
    const fromCo = company?.departments;
    if (Array.isArray(fromCo) && fromCo.length > 0) return fromCo;
    return DEFAULT_DEPARTMENTS;
  }, [company?.departments]);

  const [libraryTab, setLibraryTab] = useState('policies');
  const [policies, setPolicies] = useState([]);
  const [roles, setRoles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [viewingPolicy, setViewingPolicy] = useState(null);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[0],
    description: '',
    content: '',
    version: '1.0',
    effectiveDate: new Date().toISOString().slice(0, 10),
    isActive: true,
  });

  const [roleSearch, setRoleSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [viewingRole, setViewingRole] = useState(null);
  const [roleForm, setRoleForm] = useState(createEmptyRoleForm);
  const [savingRole, setSavingRole] = useState(false);
  const [techSkillDraft, setTechSkillDraft] = useState('');
  const [softSkillDraft, setSoftSkillDraft] = useState('');

  useEffect(() => {
    document.title = 'Library · AttendX';
    return () => {
      document.title = 'AttendX';
    };
  }, []);

  const seedPoliciesIfEmpty = useCallback(async () => {
    if (!companyId || !currentUser?.email) return;
    const colRef = collection(db, 'companies', companyId, 'policies');
    const snap = await getDocs(colRef);
    if (!snap.empty) return;
    const batch = writeBatch(db);
    const now = serverTimestamp();
    DEFAULT_POLICIES.forEach((p) => {
      const ref = doc(colRef);
      batch.set(ref, {
        ...p,
        fileUrl: null,
        fileId: null,
        effectiveDate: now,
        createdAt: now,
        createdBy: currentUser.email,
        updatedAt: now,
      });
    });
    await batch.commit();
  }, [companyId, currentUser]);

  const seedRolesIfEmpty = useCallback(async () => {
    if (!companyId || !currentUser?.email) return;
    const colRef = collection(db, 'companies', companyId, 'roles');
    const snap = await getDocs(colRef);
    if (!snap.empty) return;
    const batch = writeBatch(db);
    const now = serverTimestamp();
    const gmRef = doc(colRef);
    const hrRef = doc(colRef);
    const salesRef = doc(colRef);

    const gm = DEFAULT_ROLE_SEEDS[0];
    batch.set(gmRef, {
      title: gm.title,
      department: gm.department,
      reportsTo: gm.reportsTo,
      reportsToRoleId: null,
      salaryBand: gm.salaryBand,
      responsibilities: gm.responsibilities,
      qualifications: gm.qualifications,
      skills: gm.skills,
      kpis: gm.kpis,
      isActive: true,
      createdAt: now,
      createdBy: currentUser.email,
      updatedAt: now,
    });

    const hr = DEFAULT_ROLE_SEEDS[1];
    batch.set(hrRef, {
      title: hr.title,
      department: hr.department,
      reportsTo: hr.reportsTo,
      reportsToRoleId: gmRef.id,
      salaryBand: hr.salaryBand,
      responsibilities: hr.responsibilities,
      qualifications: hr.qualifications,
      skills: hr.skills,
      kpis: hr.kpis,
      isActive: true,
      createdAt: now,
      createdBy: currentUser.email,
      updatedAt: now,
    });

    const se = DEFAULT_ROLE_SEEDS[2];
    batch.set(salesRef, {
      title: se.title,
      department: se.department,
      reportsTo: se.reportsTo,
      reportsToRoleId: null,
      salaryBand: se.salaryBand,
      responsibilities: se.responsibilities,
      qualifications: se.qualifications,
      skills: se.skills,
      kpis: se.kpis,
      isActive: true,
      createdAt: now,
      createdBy: currentUser.email,
      updatedAt: now,
    });

    await batch.commit();
  }, [companyId, currentUser]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await seedPoliciesIfEmpty();
        await seedRolesIfEmpty();
      } catch (e) {
        console.error(e);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, seedPoliciesIfEmpty, seedRolesIfEmpty]);

  useEffect(() => {
    if (!companyId) return () => {};
    const unsub = onSnapshot(collection(db, 'companies', companyId, 'policies'), (snap) => {
      setPolicies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return () => {};
    const unsub = onSnapshot(collection(db, 'companies', companyId, 'roles'), (snap) => {
      setRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return () => {};
    const unsub = onSnapshot(collection(db, 'companies', companyId, 'employees'), (snap) => {
      setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [companyId]);

  const rolesWithHeadcount = useMemo(
    () =>
      roles.map((r) => ({
        ...r,
        currentHeadcount: employees.filter(
          (e) =>
            (e.designation || '').trim() === (r.title || '').trim() && (e.status || 'Active') === 'Active',
        ).length,
      })),
    [roles, employees],
  );

  const uniqueDepts = useMemo(
    () => [...new Set(roles.map((r) => r.department).filter(Boolean))].sort(),
    [roles],
  );

  const filteredRoles = useMemo(() => {
    let list = rolesWithHeadcount;
    if (deptFilter) list = list.filter((r) => r.department === deptFilter);
    const q = roleSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.title || '').toLowerCase().includes(q) ||
          (r.department || '').toLowerCase().includes(q) ||
          (r.reportsTo || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [rolesWithHeadcount, deptFilter, roleSearch]);

  const totalHeadcount = useMemo(
    () => employees.filter((e) => (e.status || 'Active') === 'Active').length,
    [employees],
  );

  const openAddPolicy = () => {
    setEditingPolicy(null);
    setForm({
      title: '',
      category: CATEGORIES[0],
      description: '',
      content: '',
      version: '1.0',
      effectiveDate: new Date().toISOString().slice(0, 10),
      isActive: true,
    });
    setShowAddModal(true);
  };

  const openEditPolicy = (policy) => {
    setViewingPolicy(null);
    setEditingPolicy(policy);
    setForm({
      title: policy.title || '',
      category: policy.category || CATEGORIES[0],
      description: policy.description || '',
      content: policy.content || '',
      version: policy.version || '1.0',
      effectiveDate: toJSDate(policy.effectiveDate)
        ? toJSDate(policy.effectiveDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      isActive: policy.isActive !== false,
    });
    setShowAddModal(true);
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser?.email) return;
    if (!form.title.trim()) {
      showError('Title is required');
      return;
    }
    setSaving(true);
    try {
      const effective = form.effectiveDate ? new Date(form.effectiveDate) : new Date();
      const payload = {
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim(),
        content: form.content,
        version: form.version.trim() || '1.0',
        effectiveDate: effective,
        isActive: form.isActive,
        fileUrl: editingPolicy?.fileUrl ?? null,
        fileId: editingPolicy?.fileId ?? null,
        updatedAt: serverTimestamp(),
      };

      if (editingPolicy) {
        await updateDoc(doc(db, 'companies', companyId, 'policies', editingPolicy.id), payload);
        success('Policy updated');
      } else {
        await addDoc(collection(db, 'companies', companyId, 'policies'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: currentUser.email,
        });
        success('Policy created');
      }
      setShowAddModal(false);
      setEditingPolicy(null);
    } catch (err) {
      console.error(err);
      showError('Failed to save policy');
    }
    setSaving(false);
  };

  const printPolicy = useCallback(
    (policy) => {
      if (!policy) return;
      const cat = escapeHtml(policy.category);
      const title = escapeHtml(policy.title);
      const ver = escapeHtml(policy.version || '1.0');
      const eff = escapeHtml(toDisplayDate(policy.effectiveDate));
      const desc = policy.description ? escapeHtml(policy.description) : '';
      const content = escapeHtml(policy.content || '');
      const printContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; color: #1f2937; max-width: 800px; margin: 0 auto; }
    .header { border-bottom: 2px solid #1B6B6B; padding-bottom: 20px; margin-bottom: 30px; }
    .category { font-size: 12px; color: #1B6B6B; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
    h1 { font-size: 24px; color: #1B6B6B; margin: 0 0 8px; }
    .meta { font-size: 13px; color: #6b7280; margin-top: 8px; }
    .content { font-size: 14px; line-height: 1.8; white-space: pre-wrap; color: #374151; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="category">${cat}</div>
    <h1>${title}</h1>
    <div class="meta">Version ${ver} · Effective: ${eff}</div>
    ${desc ? `<p style="color:#6b7280;font-size:14px;margin-top:8px">${desc}</p>` : ''}
  </div>
  <div class="content">${content}</div>
  <div class="footer">
    <span>AttendX HR Platform</span>
    <span>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
  </div>
</body>
</html>`;
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) {
        showError('Pop-up blocked — allow pop-ups to print');
        return;
      }
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    },
    [showError],
  );

  const resolveReportsToTitle = (rid) => {
    if (!rid) return '';
    const target = roles.find((x) => x.id === rid);
    return target?.title || '';
  };

  const handlePrintRole = useCallback(
    (role) => {
      if (!role) return;
      const matchingEmps = employees.filter((e) => (e.designation || '').trim() === (role.title || '').trim());
      const title = escapeHtml(role.title);
      const dept = escapeHtml(role.department || '—');
      const reports = role.reportsTo ? escapeHtml(role.reportsTo) : '';
      const edu = escapeHtml(role.qualifications?.education || '—');
      const exp = escapeHtml(role.qualifications?.experience || '—');
      const notes = role.qualifications?.notes ? escapeHtml(role.qualifications.notes) : '';
      const respHtml = (role.responsibilities || [])
        .map(
          (r, i) =>
            `<div class="resp-item"><span style="color:#1B6B6B;font-weight:bold">${i + 1}.</span><span>${escapeHtml(r)}</span></div>`,
        )
        .join('');
      const techHtml = (role.skills?.technical || [])
        .map((s) => `<span class="skill-pill tech-skill">${escapeHtml(s)}</span>`)
        .join('');
      const softHtml = (role.skills?.soft || [])
        .map((s) => `<span class="skill-pill soft-skill">${escapeHtml(s)}</span>`)
        .join('');
      const kpiSection =
        role.kpis?.length > 0
          ? `<div class="section"><div class="section-title">KPIs</div><table class="kpi-table"><tr><th>Metric</th><th>Target</th></tr>${role.kpis
              .map(
                (kpi) =>
                  `<tr><td>${escapeHtml(kpi.metric)}</td><td>${escapeHtml(kpi.target)}</td></tr>`,
              )
              .join('')}</table></div>`
          : '';

      const printContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} - Role Profile</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; color: #1f2937; max-width: 800px; margin: 0 auto; }
    .header { background: #1B6B6B; color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
    .title { font-size: 24px; font-weight: bold; margin: 0 0 4px; }
    .subtitle { opacity: 0.8; font-size: 14px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 13px; font-weight: 600; color: #1B6B6B; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; }
    .salary-band { background: #E8F5F5; border: 1px solid #4ECDC4; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px; }
    .salary-label { font-size: 12px; color: #1B6B6B; margin-bottom: 4px; }
    .salary-value { font-size: 22px; font-weight: bold; color: #1B6B6B; }
    .resp-item { display: flex; gap: 8px; margin-bottom: 6px; font-size: 13px; }
    .kpi-table { width: 100%; border-collapse: collapse; }
    .kpi-table th { background: #f9fafb; padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280; border: 1px solid #e5e7eb; }
    .kpi-table td { padding: 8px 12px; font-size: 13px; border: 1px solid #e5e7eb; }
    .skill-pill { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 12px; margin: 2px; }
    .tech-skill { background: #EFF6FF; color: #1D4ED8; }
    .soft-skill { background: #F0FDF4; color: #166534; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">${title}</div>
    <div class="subtitle">${dept}${reports ? ` · Reports to ${reports}` : ''} · ${matchingEmps.length} employee(s)</div>
  </div>
  <div class="salary-band">
    <div class="salary-label">SALARY BAND (CTC per annum)</div>
    <div class="salary-value">₹${formatLakhs(role.salaryBand?.min)} — ₹${formatLakhs(role.salaryBand?.max)}</div>
  </div>
  <div class="section">
    <div class="section-title">Qualifications & Experience</div>
    <p style="font-size:13px"><strong>Education:</strong> ${edu}</p>
    <p style="font-size:13px;margin-top:6px"><strong>Experience:</strong> ${exp}</p>
    ${notes ? `<p style="font-size:13px;margin-top:6px;color:#6b7280">${notes}</p>` : ''}
  </div>
  <div class="section">
    <div class="section-title">Key Responsibilities</div>
    ${respHtml}
  </div>
  <div class="section">
    <div class="section-title">Skills</div>
    <p style="font-size:12px;color:#6b7280;margin-bottom:8px">Technical Skills</p>
    ${techHtml}
    <p style="font-size:12px;color:#6b7280;margin:12px 0 8px">Soft Skills</p>
    ${softHtml}
  </div>
  ${kpiSection}
  <div class="footer">
    <span>AttendX HR Platform · Role Profile</span>
    <span>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
  </div>
</body>
</html>`;
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) {
        showError('Pop-up blocked — allow pop-ups to print');
        return;
      }
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    },
    [employees, showError],
  );

  const openAddRole = () => {
    setEditingRoleId(null);
    setRoleForm(createEmptyRoleForm());
    setTechSkillDraft('');
    setSoftSkillDraft('');
    setShowRoleModal(true);
  };

  const openEditRole = (role) => {
    setViewingRole(null);
    setEditingRoleId(role.id);
    setRoleForm(roleDocToForm(role));
    setTechSkillDraft('');
    setSoftSkillDraft('');
    setShowRoleModal(true);
  };

  const addResponsibility = () => {
    setRoleForm((f) => ({ ...f, responsibilities: [...f.responsibilities, ''] }));
  };

  const updateResponsibility = (i, v) => {
    setRoleForm((f) => {
      const next = [...f.responsibilities];
      next[i] = v;
      return { ...f, responsibilities: next };
    });
  };

  const removeResponsibility = (i) => {
    setRoleForm((f) => ({
      ...f,
      responsibilities: f.responsibilities.filter((_, idx) => idx !== i),
    }));
  };

  const addTechnicalSkill = (v) => {
    const t = v.trim();
    if (!t) return;
    setRoleForm((f) => ({ ...f, skills: { ...f.skills, technical: [...f.skills.technical, t] } }));
  };

  const removeTechnicalSkill = (i) => {
    setRoleForm((f) => ({
      ...f,
      skills: { ...f.skills, technical: f.skills.technical.filter((_, idx) => idx !== i) },
    }));
  };

  const addSoftSkill = (v) => {
    const t = v.trim();
    if (!t) return;
    setRoleForm((f) => ({ ...f, skills: { ...f.skills, soft: [...f.skills.soft, t] } }));
  };

  const removeSoftSkill = (i) => {
    setRoleForm((f) => ({
      ...f,
      skills: { ...f.skills, soft: f.skills.soft.filter((_, idx) => idx !== i) },
    }));
  };

  const addKPI = () => {
    setRoleForm((f) => ({ ...f, kpis: [...f.kpis, { metric: '', target: '' }] }));
  };

  const updateKPI = (i, field, v) => {
    setRoleForm((f) => {
      const next = f.kpis.map((k, idx) => (idx === i ? { ...k, [field]: v } : k));
      return { ...f, kpis: next };
    });
  };

  const removeKPI = (i) => {
    setRoleForm((f) => ({ ...f, kpis: f.kpis.filter((_, idx) => idx !== i) }));
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser?.email) return;
    if (!roleForm.title.trim()) {
      showError('Role title is required');
      return;
    }
    if (!roleForm.department) {
      showError('Department is required');
      return;
    }
    const min = Number(roleForm.salaryBand.min);
    const max = Number(roleForm.salaryBand.max);
    if (roleForm.salaryBand.min !== '' && Number.isNaN(min)) {
      showError('Invalid minimum salary');
      return;
    }
    if (roleForm.salaryBand.max !== '' && Number.isNaN(max)) {
      showError('Invalid maximum salary');
      return;
    }

    const reportsToRid = roleForm.reportsToRoleId || null;
    const reportsToTitle =
      reportsToRid && reportsToRid !== editingRoleId ? resolveReportsToTitle(reportsToRid) : '';

    const responsibilities = roleForm.responsibilities.map((r) => r.trim()).filter(Boolean);
    const kpis = roleForm.kpis.filter((k) => k.metric.trim() || k.target.trim());

    const payload = {
      title: roleForm.title.trim(),
      department: roleForm.department,
      reportsTo: reportsToTitle,
      reportsToRoleId: reportsToRid && reportsToRid !== editingRoleId ? reportsToRid : null,
      salaryBand: {
        min: roleForm.salaryBand.min === '' ? null : min,
        max: roleForm.salaryBand.max === '' ? null : max,
        currency: roleForm.salaryBand.currency || 'INR',
      },
      qualifications: {
        education: roleForm.qualifications.education.trim(),
        experience: roleForm.qualifications.experience.trim(),
        notes: roleForm.qualifications.notes.trim(),
      },
      responsibilities,
      skills: {
        technical: roleForm.skills.technical,
        soft: roleForm.skills.soft,
      },
      kpis,
      isActive: roleForm.isActive,
      updatedAt: serverTimestamp(),
    };

    setSavingRole(true);
    try {
      if (editingRoleId) {
        await updateDoc(doc(db, 'companies', companyId, 'roles', editingRoleId), payload);
        success('Role updated');
      } else {
        await addDoc(collection(db, 'companies', companyId, 'roles'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: currentUser.email,
        });
        success('Role created');
      }
      setShowRoleModal(false);
      setEditingRoleId(null);
    } catch (err) {
      console.error(err);
      showError('Failed to save role');
    }
    setSavingRole(false);
  };

  const matchingEmployeesForRole = (role) =>
    employees.filter((e) => (e.designation || '').trim() === (role?.title || '').trim());

  if (!companyId) return null;

  const reportsToOptions = roles.filter((r) => r.id !== editingRoleId);

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Library</h1>
          <p className="text-sm text-gray-500 mt-1">Policies and role definitions</p>
        </div>
        {libraryTab === 'policies' && canEdit && (
          <button
            type="button"
            onClick={openAddPolicy}
            className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-[#1B6B6B] text-white text-sm font-medium hover:bg-[#155858] active:bg-[#0f4444]"
          >
            + Add Policy
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {LIBRARY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setLibraryTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
              libraryTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {libraryTab === 'policies' && (
        <>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#1B6B6B] border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policies.map((policy) => (
                <div
                  key={policy.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewingPolicy(policy)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') setViewingPolicy(policy);
                  }}
                  className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#4ECDC4] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${getCategoryBg(policy.category)}`}
                      >
                        {getCategoryIcon(policy.category)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm truncate">{policy.title}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {policy.category} · v{policy.version || '1.0'}
                        </p>
                      </div>
                    </div>
                    {policy.isActive !== false ? (
                      <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium flex-shrink-0">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full flex-shrink-0">Inactive</span>
                    )}
                  </div>

                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">{previewText(policy)}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-gray-400">Effective: {toDisplayDate(policy.effectiveDate)}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setViewingPolicy(policy);
                        }}
                        className="text-xs text-[#1B6B6B] font-medium hover:underline"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setViewingPolicy(policy);
                          setTimeout(() => printPolicy(policy), 100);
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                        title="Print"
                      >
                        🖨️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && policies.length === 0 && (
            <p className="text-center text-slate-500 py-12 text-sm">No policies yet.</p>
          )}
        </>
      )}

      {libraryTab === 'roles' && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500">
                {roles.length} roles defined · {totalHeadcount} employees
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="search"
                placeholder="Search roles..."
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 w-full sm:w-48 min-h-[44px]"
              />
              {canEdit && (
                <button
                  type="button"
                  onClick={openAddRole}
                  className="px-4 py-2 min-h-[44px] bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]"
                >
                  + Add Role
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap mb-4">
            <button
              type="button"
              onClick={() => setDeptFilter('')}
              className={`text-xs px-3 py-1 rounded-full border font-medium min-h-[36px] ${
                !deptFilter ? 'bg-[#1B6B6B] text-white border-[#1B6B6B]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            {uniqueDepts.map((dept) => (
              <button
                key={dept}
                type="button"
                onClick={() => setDeptFilter(dept)}
                className={`text-xs px-3 py-1 rounded-full border font-medium min-h-[36px] ${
                  deptFilter === dept
                    ? 'bg-[#1B6B6B] text-white border-[#1B6B6B]'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRoles.map((role) => {
              const headcount = role.currentHeadcount ?? 0;
              return (
                <div
                  key={role.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewingRole(role)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') setViewingRole(role);
                  }}
                  className="bg-white border border-gray-100 rounded-2xl p-5 cursor-pointer hover:border-[#4ECDC4] hover:shadow-sm transition-all text-left"
                >
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900">{role.title}</h3>
                      <p className="text-sm text-gray-400 mt-0.5">
                        {role.department}
                        {role.reportsTo ? ` · Reports to ${role.reportsTo}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {headcount > 0 ? (
                        <span className="text-xs px-2 py-1 bg-[#E8F5F5] text-[#1B6B6B] rounded-full font-medium whitespace-nowrap">
                          {headcount} employee{headcount !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-400 rounded-full whitespace-nowrap">Vacant</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-3 p-2.5 bg-gray-50 rounded-xl">
                    <span className="text-xs text-gray-400">Salary Band</span>
                    <span className="text-sm font-semibold text-gray-800 ml-auto">
                      ₹{formatLakhs(role.salaryBand?.min)} — ₹{formatLakhs(role.salaryBand?.max)}
                    </span>
                  </div>

                  <div className="space-y-1 mb-3">
                    {(role.responsibilities || []).slice(0, 2).map((r, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
                        <span className="text-[#1B6B6B] mt-0.5 flex-shrink-0">•</span>
                        <span className="line-clamp-1">{r}</span>
                      </div>
                    ))}
                    {(role.responsibilities || []).length > 2 && (
                      <p className="text-xs text-gray-400 ml-3">+{(role.responsibilities || []).length - 2} more</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {[...(role.skills?.technical || []), ...(role.skills?.soft || [])].slice(0, 4).map((skill, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                        {skill}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                    <span className="text-xs text-gray-400">
                      {(role.kpis || []).length} KPIs · {(role.responsibilities || []).length} responsibilities
                    </span>
                    <div className="flex gap-2" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditRole(role)}
                            className="text-xs text-[#1B6B6B] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintRole(role)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            🖨️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredRoles.length === 0 && (
            <p className="text-center text-slate-500 py-12 text-sm">No roles match your filters.</p>
          )}
        </>
      )}

      {/* Policy add/edit modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">{editingPolicy ? 'Edit Policy' : 'Add Policy'}</h2>
            <form onSubmit={handleSavePolicy} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Short summary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Content</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Version</label>
                  <input
                    value={form.version}
                    onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Effective date</label>
                  <input
                    type="date"
                    value={form.effectiveDate}
                    onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded border-slate-300"
                />
                Active
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingPolicy(null);
                  }}
                  className="flex-1 min-h-[44px] rounded-xl border border-slate-200 text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 min-h-[44px] rounded-xl bg-[#1B6B6B] text-white text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Policy view modal */}
      {viewingPolicy && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[60] sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto shadow-xl flex flex-col">
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex flex-wrap items-start gap-3 z-10">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${getCategoryBg(viewingPolicy.category)}`}>
                {getCategoryIcon(viewingPolicy.category)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">{viewingPolicy.title}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  v{viewingPolicy.version || '1.0'} · Effective {toDisplayDate(viewingPolicy.effectiveDate)}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => printPolicy(viewingPolicy)}
                  className="flex items-center gap-2 min-h-[44px] px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  🖨️ Print
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openEditPolicy(viewingPolicy)}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm font-medium text-[#1B6B6B]"
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingPolicy(null)}
                  className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 text-slate-500"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
              {viewingPolicy.description && <p className="text-sm text-gray-500 mb-4">{viewingPolicy.description}</p>}
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-w-none">{viewingPolicy.content || '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Role add/edit modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black/40 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-3xl min-h-[50vh] max-h-[100dvh] sm:max-h-[95vh] overflow-y-auto shadow-xl p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Define Role</h2>
                <p className="text-sm text-gray-400 mt-1">Add role details, responsibilities and compensation</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRoleModal(false);
                  setEditingRoleId(null);
                }}
                className="text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Role title *</label>
                  <input
                    value={roleForm.title}
                    onChange={(e) => setRoleForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Sales Executive"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Department *</label>
                  <select
                    value={roleForm.department}
                    onChange={(e) => setRoleForm((f) => ({ ...f, department: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    required
                  >
                    <option value="">Select department</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Reports to</label>
                  <select
                    value={roleForm.reportsToRoleId}
                    onChange={(e) => setRoleForm((f) => ({ ...f, reportsToRoleId: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">None (Top level)</option>
                    {reportsToOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2 flex items-center gap-2">
                  <input
                    id="role-active"
                    type="checkbox"
                    checked={roleForm.isActive}
                    onChange={(e) => setRoleForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="role-active" className="text-sm text-gray-700">
                    Active
                  </label>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <h4 className="text-sm font-medium mb-3">Salary Band (CTC per annum)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Minimum (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={roleForm.salaryBand.min}
                      onChange={(e) =>
                        setRoleForm((f) => ({
                          ...f,
                          salaryBand: { ...f.salaryBand, min: e.target.value },
                        }))
                      }
                      placeholder="250000"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
                    />
                    <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(roleForm.salaryBand.min)}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Maximum (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={roleForm.salaryBand.max}
                      onChange={(e) =>
                        setRoleForm((f) => ({
                          ...f,
                          salaryBand: { ...f.salaryBand, max: e.target.value },
                        }))
                      }
                      placeholder="450000"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
                    />
                    <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(roleForm.salaryBand.max)}</p>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-medium mb-3">Qualifications & Experience</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Education required</label>
                    <input
                      value={roleForm.qualifications.education}
                      onChange={(e) =>
                        setRoleForm((f) => ({
                          ...f,
                          qualifications: { ...f.qualifications, education: e.target.value },
                        }))
                      }
                      placeholder="e.g. Graduate (any stream)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Experience required</label>
                    <input
                      value={roleForm.qualifications.experience}
                      onChange={(e) =>
                        setRoleForm((f) => ({
                          ...f,
                          qualifications: { ...f.qualifications, experience: e.target.value },
                        }))
                      }
                      placeholder="e.g. 2-5 years"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
                    />
                  </div>
                </div>
                <textarea
                  value={roleForm.qualifications.notes}
                  onChange={(e) =>
                    setRoleForm((f) => ({
                      ...f,
                      qualifications: { ...f.qualifications, notes: e.target.value },
                    }))
                  }
                  placeholder="Additional notes on qualifications..."
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-3 resize-none"
                />
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Responsibilities</h4>
                  <button type="button" onClick={addResponsibility} className="text-xs text-[#1B6B6B] hover:underline">
                    + Add
                  </button>
                </div>
                {roleForm.responsibilities.map((r, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      value={r}
                      onChange={(e) => updateResponsibility(i, e.target.value)}
                      placeholder={`Responsibility ${i + 1}`}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <button type="button" onClick={() => removeResponsibility(i)} className="text-red-400 hover:text-red-600 px-2">
                      ✕
                    </button>
                  </div>
                ))}
                {roleForm.responsibilities.length === 0 && (
                  <button
                    type="button"
                    onClick={addResponsibility}
                    className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B]"
                  >
                    + Add first responsibility
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-xs text-gray-500 block mb-2">Technical skills</label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {roleForm.skills.technical.map((s, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full"
                      >
                        {s}
                        <button type="button" onClick={() => removeTechnicalSkill(i)} className="hover:text-red-500">
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    value={techSkillDraft}
                    onChange={(e) => setTechSkillDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && techSkillDraft.trim()) {
                        e.preventDefault();
                        addTechnicalSkill(techSkillDraft);
                        setTechSkillDraft('');
                      }
                    }}
                    placeholder="Add skill, press Enter"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-2">Soft skills</label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {roleForm.skills.soft.map((s, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full"
                      >
                        {s}
                        <button type="button" onClick={() => removeSoftSkill(i)} className="hover:text-red-500">
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    value={softSkillDraft}
                    onChange={(e) => setSoftSkillDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && softSkillDraft.trim()) {
                        e.preventDefault();
                        addSoftSkill(softSkillDraft);
                        setSoftSkillDraft('');
                      }
                    }}
                    placeholder="Add skill, press Enter"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">KPIs (Key Performance Indicators)</h4>
                  <button type="button" onClick={addKPI} className="text-xs text-[#1B6B6B] hover:underline">
                    + Add KPI
                  </button>
                </div>
                {roleForm.kpis.map((kpi, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <input
                      value={kpi.metric}
                      onChange={(e) => updateKPI(i, 'metric', e.target.value)}
                      placeholder="e.g. Monthly revenue target"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        value={kpi.target}
                        onChange={(e) => updateKPI(i, 'target', e.target.value)}
                        placeholder="e.g. ₹5L per month"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      />
                      <button type="button" onClick={() => removeKPI(i)} className="text-red-400 px-2">
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2 pb-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowRoleModal(false);
                    setEditingRoleId(null);
                  }}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRole}
                  className="flex-1 py-3 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {savingRole ? 'Saving…' : 'Save Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Role view modal */}
      {viewingRole && (
        <div className="fixed inset-0 bg-black/40 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto shadow-xl flex flex-col">
            <div className="sticky top-0 bg-white border-b border-gray-100 p-4 z-10">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900">{viewingRole.title}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs px-2 py-1 bg-[#E8F5F5] text-[#1B6B6B] rounded-full">{viewingRole.department}</span>
                    {viewingRole.reportsTo && (
                      <span className="text-xs text-gray-500">Reports to {viewingRole.reportsTo}</span>
                    )}
                    <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                      {viewingRole.currentHeadcount ?? matchingEmployeesForRole(viewingRole).filter((e) => (e.status || 'Active') === 'Active').length}{' '}
                      active
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => handlePrintRole(viewingRole)}
                    className="min-h-[44px] px-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                  >
                    🖨️ Print
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditRole(viewingRole)}
                      className="min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm font-medium text-[#1B6B6B]"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewingRole(null)}
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 text-slate-500"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-6">
              <div className="p-4 rounded-xl bg-[#E8F5F5] border border-[#4ECDC4] text-center">
                <p className="text-xs text-[#1B6B6B] mb-1">Salary band (CTC per annum)</p>
                <p className="text-xl font-bold text-[#1B6B6B]">
                  ₹{formatLakhs(viewingRole.salaryBand?.min)} — ₹{formatLakhs(viewingRole.salaryBand?.max)}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[#1B6B6B] uppercase tracking-wide border-b border-gray-100 pb-2 mb-3">
                  Qualifications
                </h4>
                <p className="text-sm text-gray-700">
                  <strong>Education:</strong> {viewingRole.qualifications?.education || '—'}
                </p>
                <p className="text-sm text-gray-700 mt-2">
                  <strong>Experience:</strong> {viewingRole.qualifications?.experience || '—'}
                </p>
                {viewingRole.qualifications?.notes && (
                  <p className="text-sm text-gray-500 mt-2">{viewingRole.qualifications.notes}</p>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[#1B6B6B] uppercase tracking-wide border-b border-gray-100 pb-2 mb-3">
                  Responsibilities
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                  {(viewingRole.responsibilities || []).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ol>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-[#1B6B6B] uppercase tracking-wide border-b border-gray-100 pb-2 mb-3">
                  Skills
                </h4>
                <p className="text-xs text-gray-500 mb-2">Technical</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(viewingRole.skills?.technical || []).map((s, i) => (
                    <span key={i} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
                      {s}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mb-2">Soft</p>
                <div className="flex flex-wrap gap-1">
                  {(viewingRole.skills?.soft || []).map((s, i) => (
                    <span key={i} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-full">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {(viewingRole.kpis || []).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[#1B6B6B] uppercase tracking-wide border-b border-gray-100 pb-2 mb-3">
                    KPIs
                  </h4>
                  <div className="overflow-x-auto border border-gray-100 rounded-xl">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-left">
                          <th className="px-3 py-2 font-medium">Metric</th>
                          <th className="px-3 py-2 font-medium">Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(viewingRole.kpis || []).map((k, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2">{k.metric}</td>
                            <td className="px-3 py-2">{k.target}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-4">
                {(() => {
                  const matching = matchingEmployeesForRole(viewingRole);
                  return (
                    <>
                      <p className="text-sm font-medium mb-2">Current employees ({matching.length})</p>
                      {matching.map((emp) => (
                        <div
                          key={emp.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/company/${companyId}/employees/${emp.id}`)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') navigate(`/company/${companyId}/employees/${emp.id}`);
                          }}
                          className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg"
                        >
                          <div className="w-7 h-7 rounded-full bg-[#E8F5F5] flex items-center justify-center text-xs font-medium text-[#1B6B6B]">
                            {emp.fullName?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{emp.fullName}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {emp.empId} · {emp.branch || '—'}
                            </p>
                          </div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                              (emp.status || 'Active') === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {emp.status || 'Active'}
                          </span>
                        </div>
                      ))}
                      {matching.length === 0 && (
                        <p className="text-sm text-gray-400 py-3 text-center">No employees in this role yet</p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
