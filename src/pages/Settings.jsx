import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { DOCUMENT_CHECKLIST } from '../utils/documentTypes';

const FORMAT_OPTIONS = [
  { ext: '.pdf', label: 'PDF' },
  { ext: '.jpg', label: 'JPG' },
  { ext: '.jpeg', label: 'JPEG' },
  { ext: '.png', label: 'PNG' },
  { ext: '.doc', label: 'DOC' },
  { ext: '.docx', label: 'DOCX' },
  { ext: '.xls', label: 'XLS' },
  { ext: '.xlsx', label: 'XLSX' },
];

const SIZE_OPTIONS = [
  { value: 1, label: '1 MB' },
  { value: 2, label: '2 MB' },
  { value: 5, label: '5 MB' },
  { value: 10, label: '10 MB' },
  { value: 15, label: '15 MB' },
  { value: 20, label: '20 MB' },
  { value: 25, label: '25 MB' },
];

const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal'];
const DEFAULT_DESIGNATIONS = ['Director', 'General Manager', 'Manager', 'Assistant Manager', 'Team Lead', 'Senior Executive', 'Executive', 'Junior Executive', 'Intern', 'Other'];
const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];
const DEFAULT_ASSET_TYPES = [
  { name: 'Laptop', mode: 'trackable' },
  { name: 'Desktop', mode: 'trackable' },
  { name: 'Mobile Phone', mode: 'trackable' },
  { name: 'SIM Card', mode: 'consumable' },
  { name: 'Tablet', mode: 'trackable' },
  { name: 'ID Card', mode: 'consumable' },
  { name: 'Access Card', mode: 'consumable' },
  { name: 'Uniform', mode: 'consumable' },
  { name: 'Headset', mode: 'consumable' },
  { name: 'Charger', mode: 'consumable' },
  { name: 'Vehicle', mode: 'trackable' },
  { name: 'Tools', mode: 'trackable' },
  { name: 'Furniture', mode: 'trackable' },
  { name: 'Other', mode: 'trackable' },
];
const INDUSTRIES = ['IT', 'Manufacturing', 'Automobile', 'Retail', 'Finance', 'Healthcare', 'Education', 'Media', 'Logistics', 'Real Estate', 'Other'];
const COLOR_PRESETS = [
  { value: '#378ADD' }, { value: '#1D9E75' }, { value: '#D85A30' },
  { value: '#534AB7' }, { value: '#A32D2D' }, { value: '#BA7517' },
];

const SECTIONS = [
  { key: 'departments', label: 'Department', plural: 'Departments', field: 'department', defaults: DEFAULT_DEPARTMENTS },
  { key: 'branches', label: 'Branch', plural: 'Branches', field: 'branch', defaults: DEFAULT_BRANCHES },
  { key: 'designations', label: 'Designation', plural: 'Designations', field: 'designation', defaults: DEFAULT_DESIGNATIONS },
  { key: 'employmentTypes', label: 'Employment Type', plural: 'Employment Types', field: 'employmentType', defaults: DEFAULT_EMPLOYMENT_TYPES },
  { key: 'categories', label: 'Category', plural: 'Categories', field: 'category', defaults: DEFAULT_CATEGORIES },
  { key: 'qualifications', label: 'Qualification', plural: 'Qualifications', field: 'qualification', defaults: DEFAULT_QUALIFICATIONS },
];

const TABS = [
  { id: 'company', label: 'Company Info' },
  { id: 'lists', label: 'Manage Lists' },
  { id: 'leave', label: 'Leave Policy' },
  { id: 'documents', label: 'Document Types' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'danger', label: 'Danger Zone' },
];

const DEFAULT_ONBOARDING_TEMPLATE = {
  tasks: [
    { id: 'task_001', title: 'Send offer letter', description: '', category: 'Pre-joining', assignedTo: 'hr', daysFromJoining: -7, isRequired: true, order: 1 },
    { id: 'task_002', title: 'Send welcome email', description: 'Send welcome email with company handbook and first day details', category: 'Pre-joining', assignedTo: 'hr', daysFromJoining: -3, isRequired: true, order: 2 },
    { id: 'task_003', title: 'Collect documents list sent', description: '', category: 'Pre-joining', assignedTo: 'hr', daysFromJoining: -3, isRequired: true, order: 3 },
    { id: 'task_004', title: 'IT setup request raised (laptop/email/access)', description: '', category: 'Pre-joining', assignedTo: 'it', daysFromJoining: -2, isRequired: true, order: 4 },
    { id: 'task_005', title: 'Workspace/desk arranged', description: '', category: 'Pre-joining', assignedTo: 'admin', daysFromJoining: -1, isRequired: true, order: 5 },

    { id: 'task_006', title: 'ID card issued', description: '', category: 'Day 1', assignedTo: 'admin', daysFromJoining: 0, isRequired: true, order: 6 },
    { id: 'task_007', title: 'Office tour completed', description: '', category: 'Day 1', assignedTo: 'hr', daysFromJoining: 0, isRequired: false, order: 7 },
    { id: 'task_008', title: 'Introduction to team', description: '', category: 'Day 1', assignedTo: 'manager', daysFromJoining: 0, isRequired: true, order: 8 },
    { id: 'task_009', title: 'HR documentation completed (forms, policies signed)', description: '', category: 'Day 1', assignedTo: 'hr', daysFromJoining: 0, isRequired: true, order: 9 },
    { id: 'task_010', title: 'System access provided (email, tools)', description: '', category: 'Day 1', assignedTo: 'it', daysFromJoining: 0, isRequired: true, order: 10 },

    { id: 'task_011', title: 'Employee added to payroll', description: '', category: 'Week 1', assignedTo: 'admin', daysFromJoining: 3, isRequired: true, order: 11 },
    { id: 'task_012', title: 'PF/ESIC registration done', description: '', category: 'Week 1', assignedTo: 'admin', daysFromJoining: 3, isRequired: false, order: 12 },
    { id: 'task_013', title: 'Bank account details collected', description: '', category: 'Week 1', assignedTo: 'hr', daysFromJoining: 3, isRequired: true, order: 13 },
    { id: 'task_014', title: 'Emergency contact collected', description: '', category: 'Week 1', assignedTo: 'hr', daysFromJoining: 5, isRequired: true, order: 14 },
    { id: 'task_015', title: 'Reporting manager introduced', description: '', category: 'Week 1', assignedTo: 'manager', daysFromJoining: 1, isRequired: true, order: 15 },

    { id: 'task_016', title: '30-day check-in meeting done', description: '', category: 'Month 1', assignedTo: 'manager', daysFromJoining: 30, isRequired: true, order: 16 },
    { id: 'task_017', title: 'Access card issued', description: '', category: 'Month 1', assignedTo: 'admin', daysFromJoining: 7, isRequired: false, order: 17 },
    { id: 'task_018', title: 'Company policies acknowledged', description: '', category: 'Month 1', assignedTo: 'employee', daysFromJoining: 7, isRequired: true, order: 18 },
    { id: 'task_019', title: 'Probation goals set', description: '', category: 'Month 1', assignedTo: 'manager', daysFromJoining: 14, isRequired: true, order: 19 },
    { id: 'task_020', title: 'All documents collected and verified', description: '', category: 'Month 1', assignedTo: 'hr', daysFromJoining: 30, isRequired: true, order: 20 },
  ],
};

export default function Settings() {
  const { companyId } = useParams();
  const { role, currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: '', industry: '', location: '', initials: '', color: '#378ADD' });
  const [leavePolicy, setLeavePolicy] = useState({ cl: 12, sl: 12, el: 15 });
  const [addingSection, setAddingSection] = useState(null);
  const [addValue, setAddValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sectionSearch, setSectionSearch] = useState({});
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);
  const [tab, setTab] = useState('company');
  const [newAssetType, setNewAssetType] = useState('');
  const [newAssetMode, setNewAssetMode] = useState('trackable');
  const [docTypes, setDocTypes] = useState(null);
  const [docTypesLoading, setDocTypesLoading] = useState(false);
  const [newDocNames, setNewDocNames] = useState({});
  const [templateTasks, setTemplateTasks] = useState([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const isAdmin = role === 'admin';
  const activeTab = tab;

  // eslint-disable-next-line no-console
  console.log('Company ID in settings:', companyId);

  useEffect(() => {
    if (companyId) {
      const stored = localStorage.getItem(`settings_tab_${companyId}`);
      if (stored && TABS.some((t) => t.id === stored)) setTab(stored);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) {
      localStorage.setItem(`settings_tab_${companyId}`, tab);
    }
  }, [tab, companyId]);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [companySnap, empSnap, assetSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId)),
          getDocs(collection(db, 'companies', companyId, 'employees')),
          getDocs(collection(db, 'companies', companyId, 'assets')),
        ]);
        if (companySnap.exists()) {
          const data = companySnap.data();
          setCompany({ id: companySnap.id, ...data });
          setCompanyForm({
            name: data.name || '',
            industry: data.industry || '',
            location: data.location || '',
            initials: data.initials || '',
            color: data.color || '#378ADD',
          });
          setLeavePolicy(data.leavePolicy || { cl: 12, sl: 12, el: 15 });
        }
        setEmployees(empSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setAssets(assetSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        showError('Failed to load settings');
      }
      setLoading(false);
    };
    load();
  }, [companyId, showError]);

  // Load document types when Documents tab is active
  useEffect(() => {
    if (!companyId || tab !== 'documents') return;
    const fetchDocTypes = async () => {
      setDocTypesLoading(true);
      try {
        const companyDoc = await getDoc(doc(db, 'companies', companyId));
        const data = companyDoc.data();
        if (data?.documentTypes && Array.isArray(data.documentTypes)) {
          setDocTypes(data.documentTypes);
        } else {
          setDocTypes(DOCUMENT_CHECKLIST);
        }
      } catch (err) {
        showError('Failed to load document types');
        setDocTypes(DOCUMENT_CHECKLIST);
      }
      setDocTypesLoading(false);
    };
    fetchDocTypes();
  }, [tab, companyId, showError]);

  useEffect(() => {
    if (activeTab !== 'onboarding') return;

    // eslint-disable-next-line no-console
    console.log('Loading template for company:', companyId);
    // eslint-disable-next-line no-console
    console.log('Active tab:', activeTab);
    // eslint-disable-next-line no-console
    console.log('DB instance:', db);

    const loadTemplate = async () => {
      try {
        setTemplateLoading(true);
        // eslint-disable-next-line no-console
        console.log('Loading template, companyId:', companyId);

        if (!companyId) {
          // eslint-disable-next-line no-console
          console.error('No companyId available');
          setTemplateTasks(DEFAULT_ONBOARDING_TEMPLATE.tasks);
          return;
        }

        if (!db) {
          // eslint-disable-next-line no-console
          console.error('No db instance');
          setTemplateTasks(DEFAULT_ONBOARDING_TEMPLATE.tasks);
          return;
        }

        const templateRef = doc(db, 'companies', companyId, 'onboardingTemplate');
        // eslint-disable-next-line no-console
        console.log('Template ref path:', templateRef.path);

        const templateDoc = await getDoc(templateRef);
        // eslint-disable-next-line no-console
        console.log('Template exists:', templateDoc.exists());

        if (templateDoc.exists() && templateDoc.data()?.tasks?.length > 0) {
          // eslint-disable-next-line no-console
          console.log('Loaded tasks:', templateDoc.data().tasks.length);
          setTemplateTasks(templateDoc.data().tasks);
        } else {
          // eslint-disable-next-line no-console
          console.log('Using default template');
          setTemplateTasks(DEFAULT_ONBOARDING_TEMPLATE.tasks);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Load template error:', error.message, error);
        setTemplateTasks(DEFAULT_ONBOARDING_TEMPLATE.tasks);
        showError(`Failed to load template: ${error.message}`);
      } finally {
        setTemplateLoading(false);
      }
    };

    loadTemplate();
  }, [activeTab, companyId, showError]);

  const getList = (key, defaults) => (company?.[key]?.length ? company[key] : defaults);
  const getCount = (field) => (value) => employees.filter((e) => (e[field] || '').trim() === value).length;

  const normalizedAssetTypes = useMemo(() => {
    const raw = company?.assetTypes;
    if (!Array.isArray(raw)) return DEFAULT_ASSET_TYPES;
    if (raw.length === 0) return [];
    if (typeof raw[0] === 'string') {
      return raw.map((name) => {
        const defaultMode = DEFAULT_ASSET_TYPES.find((t) => t.name === name)?.mode || 'trackable';
        return { name, mode: defaultMode };
      });
    }
    return raw
      .map((t) => ({
        name: t?.name || '',
        mode: t?.mode || 'trackable',
      }))
      .filter((t) => t.name);
  }, [company]);

  const countEmployeesUsingAssetType = (typeName) => {
    const type = (typeName || '').trim();
    const trackableSet = new Set(
      assets
        .filter((a) => (a.mode || 'trackable') === 'trackable' && a.type === type && a.status === 'Assigned')
        .map((a) => a.assignedToId)
        .filter(Boolean),
    );

    const consumableSet = new Set(
      assets
        .filter((a) => (a.mode || 'trackable') === 'consumable' && a.type === type)
        .flatMap((a) => (a.assignments || []).filter((as) => !as.returned).map((as) => as.employeeId))
        .filter(Boolean),
    );

    return trackableSet.size + consumableSet.size;
  };

  const saveAssetTypes = async (next) => {
    await updateDoc(doc(db, 'companies', companyId), { assetTypes: next });
    setCompany((prev) => (prev ? { ...prev, assetTypes: next } : prev));
  };

  const handleAdd = async (sectionKey, defaults) => {
    const name = addValue.trim();
    if (!name) return;
    const list = getList(sectionKey, defaults);
    if (list.includes(name)) {
      showError('Already exists');
      return;
    }
    setSaving(true);
    try {
      const next = [...list, name];
      await updateDoc(doc(db, 'companies', companyId), { [sectionKey]: next });
      setCompany((prev) => (prev ? { ...prev, [sectionKey]: next } : null));
      setAddValue('');
      setAddingSection(null);
      const section = SECTIONS.find((s) => s.key === sectionKey);
      success(section ? `${section.label} added` : 'Added');
    } catch (err) {
      showError('Failed to add');
    }
    setSaving(false);
  };

  const handleRemove = async (sectionKey, name, defaults) => {
    const section = SECTIONS.find((s) => s.key === sectionKey);
    const count = getCount(section.field)(name);
    if (count > 0) return;
    try {
      const list = getList(sectionKey, defaults);
      const next = list.filter((x) => x !== name);
      await updateDoc(doc(db, 'companies', companyId), { [sectionKey]: next });
      setCompany((prev) => (prev ? { ...prev, [sectionKey]: next } : null));
      setDeleteConfirm(null);
      success(section ? `${section.label} removed` : 'Removed');
    } catch (err) {
      showError('Failed to remove');
    }
  };

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'companies', companyId), {
        name: companyForm.name.trim(),
        industry: companyForm.industry.trim(),
        location: companyForm.location.trim(),
        initials: (companyForm.initials || '').slice(0, 2).toUpperCase(),
        color: companyForm.color,
      });
      setCompany((prev) => (prev ? { ...prev, ...companyForm } : null));
      success('Company details saved');
    } catch (err) {
      showError('Failed to save');
    }
    setSaving(false);
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'companies', companyId), {
        leavePolicy: {
          cl: Number(leavePolicy.cl) || 12,
          sl: Number(leavePolicy.sl) || 12,
          el: Number(leavePolicy.el) || 15,
        },
      });
      success('Leave policy saved');
    } catch (err) {
      showError('Failed to save policy');
    }
    setSaving(false);
  };

  const handleDeactivateCompany = async () => {
    try {
      await updateDoc(doc(db, 'companies', companyId), { isActive: false });
      setDeactivateConfirm(false);
      success('Company deactivated');
    } catch (err) {
      showError('Failed to deactivate company');
    }
  };

  const addDocType = (category) => {
    if (!docTypes) return;
    const name = (newDocNames[category] || '').trim();
    if (!name) return;
    const id = `${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const next = docTypes.map((cat) =>
      cat.category === category
        ? {
            ...cat,
            documents: [
              ...cat.documents,
              {
                id,
                name,
                mandatory: false,
                accepts: ['.pdf', '.jpg', '.jpeg', '.png'],
                maxSizeMB: 5,
              },
            ],
          }
        : cat,
    );
    setDocTypes(next);
    setNewDocNames((prev) => ({ ...prev, [category]: '' }));
  };

  const toggleFormat = (categoryName, docId, ext) => {
    setDocTypes((prev) => {
      if (!prev) return prev;
      return prev.map((cat) => {
        if (cat.category !== categoryName) return cat;
        return {
          ...cat,
          documents: cat.documents.map((d) => {
            if (d.id !== docId) return d;
            const current = Array.isArray(d.accepts) ? d.accepts : ['.pdf', '.jpg', '.jpeg', '.png'];
            const has = current.includes(ext);
            if (has && current.length === 1) return d;
            return {
              ...d,
              accepts: has ? current.filter((e) => e !== ext) : [...current, ext],
            };
          }),
        };
      });
    });
  };

  const updateMaxSize = (categoryName, docId, sizeMB) => {
    setDocTypes((prev) => {
      if (!prev) return prev;
      return prev.map((cat) => {
        if (cat.category !== categoryName) return cat;
        return {
          ...cat,
          documents: cat.documents.map((d) => (d.id === docId ? { ...d, maxSizeMB: sizeMB } : d)),
        };
      });
    });
  };

  const toggleMandatory = (categoryName, docId) => {
    setDocTypes((prev) => {
      if (!prev) return prev;
      return prev.map((cat) => {
        if (cat.category !== categoryName) return cat;
        return {
          ...cat,
          documents: cat.documents.map((d) => (d.id === docId ? { ...d, mandatory: !d.mandatory } : d)),
        };
      });
    });
  };

  const removeDocType = (categoryName, docId) => {
    setDocTypes((prev) => {
      if (!prev) return prev;
      return prev.map((cat) => {
        if (cat.category !== categoryName) return cat;
        return {
          ...cat,
          documents: cat.documents.filter((d) => d.id !== docId),
        };
      });
    });
  };

  const saveDocTypes = async () => {
    if (!docTypes) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'companies', companyId), { documentTypes: docTypes });
      success('Document types saved successfully');
    } catch (err) {
      showError(`Failed to save: ${err?.message || 'Unknown error'}`);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#378ADD] border-t-transparent" />
      </div>
    );
  }

  const renderCompanyTab = () => (
    <section className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Company Information</h2>
      <form onSubmit={handleSaveCompany} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Company Name</label>
            <input
              value={companyForm.name}
              onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Industry</label>
            <select
              value={companyForm.industry}
              onChange={(e) => setCompanyForm((p) => ({ ...p, industry: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select industry</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
            <input
              value={companyForm.location}
              onChange={(e) => setCompanyForm((p) => ({ ...p, location: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Company Initials (2 chars)</label>
            <input
              value={companyForm.initials}
              onChange={(e) => setCompanyForm((p) => ({ ...p, initials: e.target.value.slice(0, 2) }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
              maxLength={2}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Color</label>
          <div className="flex gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCompanyForm((p) => ({ ...p, color: c.value }))}
                className={`h-8 w-8 rounded-full border-2 ${
                  companyForm.color === c.value ? 'border-slate-800' : 'border-slate-200'
                }`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          Save Changes
        </button>
      </form>
    </section>
  );

  const renderListsTab = () => {
    const getItems = (key, defaults) => getList(key, defaults);

    const cards = SECTIONS.map((section) => {
      const items = getItems(section.key, section.defaults);
      const countFn = getCount(section.field);
      const [newVal, setNewVal] = [
        addValue && addingSection === section.key ? addValue : '',
        (val) => {
          setAddingSection(section.key);
          setAddValue(val);
        },
      ];
      return { section, items, countFn, newVal, setNewVal };
    });

    const left = cards.filter((c) =>
      ['departments', 'branches', 'designations'].includes(c.section.key),
    );
    const right = cards.filter((c) =>
      ['employmentTypes', 'categories', 'qualifications'].includes(c.section.key),
    );

    const handleToggleAssetTypeMode = async (typeName) => {
      const current = normalizedAssetTypes.find((t) => t.name === typeName);
      if (!current) return;
      const nextMode = current.mode === 'trackable' ? 'consumable' : 'trackable';
      const next = normalizedAssetTypes.map((t) => (t.name === typeName ? { ...t, mode: nextMode } : t));
      try {
        await saveAssetTypes(next);
        success('Asset type updated');
      } catch (e) {
        showError('Failed to update asset type');
      }
    };

    const handleDeleteAssetType = async (typeName) => {
      const usage = assets.filter((a) => (a.type || '').trim() === typeName).length;
      if (usage > 0) {
        showError('This asset type is used by existing assets');
        return;
      }
      const next = normalizedAssetTypes.filter((t) => t.name !== typeName);
      try {
        await saveAssetTypes(next);
        success('Asset type deleted');
      } catch (e) {
        showError('Failed to delete asset type');
      }
    };

    const handleAddAssetType = async () => {
      const name = newAssetType.trim();
      if (!name) return;
      const exists = normalizedAssetTypes.some((t) => t.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        showError('Asset type already exists');
        return;
      }
      const next = [...normalizedAssetTypes, { name, mode: newAssetMode }];
      try {
        await saveAssetTypes(next);
        setNewAssetType('');
        setNewAssetMode('trackable');
        success('Asset type added');
      } catch (e) {
        showError('Failed to add asset type');
      }
    };

    const renderAssetTypesCard = () => (
      <div className="bg-white border rounded-xl p-4">
        <div className="flex justify-between mb-3">
          <h3 className="font-medium text-sm">Asset Types</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {normalizedAssetTypes.length} types
          </span>
        </div>

        <div className="flex gap-3 mb-3 p-2 bg-gray-50 rounded-lg">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            🔵 <span>Trackable — unique items with individual IDs</span>
          </span>
          <span className="text-xs text-gray-500 flex items-center gap-1 ml-3">
            🟢 <span>Consumable — stock quantity issued to multiple employees</span>
          </span>
        </div>

        <div className="max-h-48 overflow-y-auto space-y-1 mb-3 pr-1 settings-list">
          {normalizedAssetTypes.map((t) => {
            const usedByAssets = assets.filter((a) => (a.type || '').trim() === t.name).length;
            const empCount = countEmployeesUsingAssetType(t.name);
            return (
              <div key={t.name} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 mr-1">
                <span className="flex-1 text-sm truncate mr-2">
                  {t.name}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleAssetTypeMode(t.name)}
                    className={`text-xs px-3 py-1.5 rounded border font-medium ${
                      t.mode === 'trackable'
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : 'bg-green-50 text-green-600 border-green-200'
                    }`}
                  >
                    {t.mode === 'trackable' ? 'Trackable' : 'Consumable'}
                  </button>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{empCount} emp</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteAssetType(t.name)}
                    className="w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded text-xs flex-shrink-0 disabled:opacity-50"
                    disabled={usedByAssets > 0}
                    title={usedByAssets > 0 ? 'Delete disabled: assets exist for this type' : 'Delete asset type'}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-3 pt-3 border-t">
          <input
            placeholder="Asset type name..."
            value={newAssetType}
            onChange={(e) => setNewAssetType(e.target.value)}
            className="flex-1 text-sm border rounded px-2 py-1.5"
          />
          <button
            type="button"
            onClick={() => setNewAssetMode(newAssetMode === 'trackable' ? 'consumable' : 'trackable')}
            className={`text-xs px-3 py-1.5 rounded border font-medium ${
              newAssetMode === 'trackable'
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'bg-green-50 text-green-600 border-green-200'
            }`}
          >
            {newAssetMode === 'trackable' ? 'Trackable' : 'Consumable'}
          </button>
          <button
            type="button"
            onClick={handleAddAssetType}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
          >
            Add
          </button>
        </div>
      </div>
    );

    const renderCard = ({ section, items, countFn }) => (
      <div key={section.key} className="bg-white border rounded-xl p-4">
        <div className="flex justify-between mb-3">
          <h3 className="font-medium text-sm">{section.plural}</h3>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {items.length} items
          </span>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1 mb-3 pr-1 settings-list">
          {items.map((item) => (
            <div
              key={item}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 mr-1"
            >
              <span className="flex-1 text-sm truncate mr-2">
                {item}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {countFn(item)} emp
                </span>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm({ section: section.key, name: item, defaults: section.defaults })}
                  className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded text-xs flex-shrink-0"
                  disabled={countFn(item) > 0}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-xs text-slate-400">No items yet</p>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={addingSection === section.key ? addValue : ''}
            onChange={(e) => {
              setAddingSection(section.key);
              setAddValue(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd(section.key, section.defaults);
            }}
            placeholder="Add new..."
            className="flex-1 text-sm border rounded px-2 py-1"
          />
          <button
            type="button"
            onClick={() => handleAdd(section.key, section.defaults)}
            className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={saving || (addingSection === section.key && !addValue.trim())}
          >
            Add
          </button>
        </div>
      </div>
    );

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          {left.map(renderCard)}
        </div>
        <div className="space-y-4">
          {right.map(renderCard)}
          {renderAssetTypesCard()}
        </div>
      </div>
    );
  };

  const renderLeaveTab = () => (
    <section className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Leave Policy</h2>
      <form onSubmit={handleSavePolicy} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Casual Leave (CL)</label>
            <input
              type="number"
              min={0}
              value={leavePolicy.cl}
              onChange={(e) => setLeavePolicy((p) => ({ ...p, cl: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Sick Leave (SL)</label>
            <input
              type="number"
              min={0}
              value={leavePolicy.sl}
              onChange={(e) => setLeavePolicy((p) => ({ ...p, sl: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Earned Leave (EL)</label>
            <input
              type="number"
              min={0}
              value={leavePolicy.el}
              onChange={(e) => setLeavePolicy((p) => ({ ...p, el: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          Save Policy
        </button>
      </form>
    </section>
  );

  const renderDocumentsTab = () => (
    <div className="space-y-4">
      {docTypesLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
      )}
      {!docTypesLoading && docTypes && docTypes.map((cat) => (
        <div key={cat.category} className="bg-white border rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">{cat.category}</h3>
            <span className="text-xs text-gray-400">
              {cat.documents.length} document types
            </span>
          </div>
          {cat.documents.map((docItem) => (
            <div key={docItem.id} className="py-3 border-b last:border-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-800">
                  {docItem.name}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleMandatory(cat.category, docItem.id)}
                    className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${
                      docItem.mandatory
                        ? 'bg-red-50 text-red-600 border-red-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {docItem.mandatory ? 'Mandatory' : 'Optional'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDocType(cat.category, docItem.id)}
                    className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded text-sm"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="mb-2">
                <span className="text-xs text-gray-400 block mb-1">Accepted formats</span>
                <div className="flex flex-wrap gap-1">
                  {FORMAT_OPTIONS.map((fmt) => (
                    <button
                      key={fmt.ext}
                      type="button"
                      onClick={() => toggleFormat(cat.category, docItem.id, fmt.ext)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        (Array.isArray(docItem.accepts) ? docItem.accepts : [])
                          .includes(fmt.ext)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Max file size</span>
                <div className="flex gap-1 flex-wrap">
                  {SIZE_OPTIONS.map((size) => (
                    <button
                      key={size.value}
                      type="button"
                      onClick={() => updateMaxSize(cat.category, docItem.id, size.value)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                        (docItem.maxSizeMB || 5) === size.value
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-3 pt-3 border-t">
            <input
              value={newDocNames[cat.category] || ''}
              onChange={(e) =>
                setNewDocNames((prev) => ({
                  ...prev,
                  [cat.category]: e.target.value,
                }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') addDocType(cat.category);
              }}
              placeholder="Add document type..."
              className="flex-1 text-sm border rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={() => addDocType(cat.category)}
              className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        </div>
      ))}
      {!docTypesLoading && docTypes && (
        <button
          type="button"
          onClick={saveDocTypes}
          disabled={saving}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 mt-2"
        >
          Save Document Types
        </button>
      )}
    </div>
  );

  const renderOnboardingTab = () => {
    const tasks = templateTasks || [];
    const categories = ['Pre-joining', 'Day 1', 'Week 1', 'Month 1'];
    const assignedToOptions = ['hr', 'manager', 'it', 'admin', 'employee'];

    const updateTask = (taskId, field, value) => {
      setTemplateTasks((prev) =>
        (prev || []).map((t) => (t.id === taskId ? { ...t, [field]: value } : t)),
      );
    };

    const handleAddTask = () => {
      // eslint-disable-next-line no-console
      console.log('Add task clicked');
      const newTask = {
        id: `task_${Date.now()}`,
        title: '',
        description: '',
        category: 'Day 1',
        assignedTo: 'hr',
        daysFromJoining: 0,
        isRequired: false,
        order: (templateTasks?.length || 0) + 1,
      };
      // eslint-disable-next-line no-console
      console.log('Adding task:', newTask);
      setTemplateTasks((prev) => [...(prev || []), newTask]);
    };

    const removeTask = (taskId) => {
      setTemplateTasks((prev) => (prev || []).filter((t) => t.id !== taskId));
    };

    const handleSaveTemplate = async () => {
      try {
        // eslint-disable-next-line no-console
        console.log('Save clicked');
        // eslint-disable-next-line no-console
        console.log('Saving template...');
        // eslint-disable-next-line no-console
        console.log('Company ID:', companyId);
        // eslint-disable-next-line no-console
        console.log('Template tasks:', templateTasks);
        // eslint-disable-next-line no-console
        console.log('DB:', db);

        if (!companyId) {
          showError('Company ID not found');
          return;
        }

        if (!templateTasks || templateTasks.length === 0) {
          showError('No tasks to save. Add tasks first.');
          return;
        }

        setSavingTemplate(true);

        const cleanTasks = templateTasks.map((t, index) => ({
          id: t.id || `task_${Date.now()}_${index}`,
          title: t.title || 'Untitled task',
          description: t.description || '',
          category: t.category || 'Day 1',
          assignedTo: t.assignedTo || 'hr',
          daysFromJoining: Number(t.daysFromJoining) || 0,
          isRequired: Boolean(t.isRequired),
          order: Number(t.order) || index,
        }));

        // eslint-disable-next-line no-console
        console.log('Clean tasks to save:', cleanTasks.length);

        const templateRef = doc(db, 'companies', companyId, 'onboardingTemplate');
        await setDoc(templateRef, {
          tasks: cleanTasks,
          updatedAt: new Date(),
          updatedBy: currentUser?.email || 'admin',
        });

        // eslint-disable-next-line no-console
        console.log('Template saved successfully!');
        success(`${cleanTasks.length} tasks saved successfully!`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Save error:', error.message, error);
        showError(`Save failed: ${error.message}`);
      } finally {
        setSavingTemplate(false);
      }
    };

    const grouped = categories.map((cat) => ({
      category: cat,
      tasks: tasks
        .filter((t) => (t.category || 'Day 1') === cat)
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    }));

    return (
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Onboarding Checklist</h2>
            <p className="text-sm text-slate-500 mt-1">Customize the checklist template used for new employees.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddTask}
              className="rounded-lg border border-slate-300 text-slate-700 text-sm font-medium px-3 py-2 hover:bg-slate-50"
              disabled={templateLoading}
            >
              + Add task
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              className="rounded-lg bg-blue-600 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
              disabled={savingTemplate || templateLoading}
            >
              {savingTemplate ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>

        {templateLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.category}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">{g.category}</h3>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {g.tasks.length} tasks
                  </span>
                </div>

                {g.tasks.length === 0 ? (
                  <p className="text-xs text-slate-400">No tasks in this category.</p>
                ) : (
                  <div className="space-y-3">
                    {g.tasks.map((t) => (
                      <div key={t.id} className="border border-slate-200 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                            <input
                              value={t.title || ''}
                              onChange={(e) => updateTask(t.id, 'title', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              placeholder="Task title"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeTask(t.id)}
                            className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>

                        <div className="mt-3">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                          <textarea
                            value={t.description || ''}
                            onChange={(e) => updateTask(t.id, 'description', e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            placeholder="Optional description"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                            <select
                              value={t.category || 'Day 1'}
                              onChange={(e) => updateTask(t.id, 'category', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            >
                              {categories.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Assigned to</label>
                            <select
                              value={t.assignedTo || 'hr'}
                              onChange={(e) => updateTask(t.id, 'assignedTo', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            >
                              {assignedToOptions.map((o) => (
                                <option key={o} value={o}>{o.toUpperCase()}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Days from joining</label>
                            <input
                              type="number"
                              value={t.daysFromJoining ?? 0}
                              onChange={(e) => updateTask(t.id, 'daysFromJoining', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="flex items-center gap-2 mt-6">
                            <input
                              id={`req_${t.id}`}
                              type="checkbox"
                              checked={!!t.isRequired}
                              onChange={(e) => updateTask(t.id, 'isRequired', e.target.checked)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                            />
                            <label htmlFor={`req_${t.id}`} className="text-xs text-slate-700">
                              Required
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleAddTask(g.category)}
                  className="w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors mt-2"
                >
                  + Add task to {g.category}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  const renderDangerTab = () => (
    <div className="space-y-4">
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
        <h3 className="font-medium text-amber-800 mb-1">Deactivate Company</h3>
        <p className="text-sm text-amber-700 mb-3">
          Team members will lose access. Data is preserved.
        </p>
        <button
          type="button"
          onClick={() => setDeactivateConfirm(true)}
          className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm"
        >
          Deactivate Company
        </button>
      </div>
      <div className="border border-red-200 bg-red-50 rounded-xl p-4">
        <h3 className="font-medium text-red-800 mb-1">Delete Company</h3>
        <p className="text-sm text-red-700 mb-3">
          Permanently deletes all employees, leave, documents and Drive files.
        </p>
        <button
          type="button"
          onClick={() => showError('Please delete the company from the Companies page.')}
          className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
        >
          Delete Company
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-800 mb-2">Settings</h1>
      <p className="text-slate-500 text-sm mb-4">Manage company configuration, lists and policies.</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? 'bg-blue-600 text-white rounded-full px-4 py-2 text-sm font-medium'
                : 'text-gray-600 px-4 py-2 text-sm rounded-full hover:bg-gray-100'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'company' && renderCompanyTab()}
      {tab === 'lists' && renderListsTab()}
      {tab === 'leave' && renderLeaveTab()}
      {tab === 'documents' && renderDocumentsTab()}
      {tab === 'onboarding' && renderOnboardingTab()}
      {tab === 'danger' && renderDangerTab()}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Delete {deleteConfirm.name}?
            </h3>
            <p className="text-sm text-slate-600 mb-4">This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="text-slate-500 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRemove(deleteConfirm.section, deleteConfirm.name, deleteConfirm.defaults)}
                className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {deactivateConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Deactivate this company?</h3>
            <p className="text-sm text-slate-600 mb-4">
              Team members will lose access. You can reactivate from the Companies page.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeactivateConfirm(false)}
                className="text-slate-500 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivateCompany}
                className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
