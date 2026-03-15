import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal'];
const DEFAULT_DESIGNATIONS = ['Director', 'General Manager', 'Manager', 'Assistant Manager', 'Team Lead', 'Senior Executive', 'Executive', 'Junior Executive', 'Intern', 'Other'];
const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];
const INDUSTRIES = ['IT', 'Manufacturing', 'Automobile', 'Retail', 'Finance', 'Healthcare', 'Education', 'Media', 'Logistics', 'Real Estate', 'Other'];
const COLOR_PRESETS = [
  { value: '#378ADD' }, { value: '#1D9E75' }, { value: '#D85A30' },
  { value: '#534AB7' }, { value: '#A32D2D' }, { value: '#BA7517' },
];

const SECTIONS = [
  { key: 'branches', label: 'Branch', plural: 'Branches', field: 'branch', defaults: DEFAULT_BRANCHES },
  { key: 'departments', label: 'Department', plural: 'Departments', field: 'department', defaults: DEFAULT_DEPARTMENTS },
  { key: 'designations', label: 'Designation', plural: 'Designations', field: 'designation', defaults: DEFAULT_DESIGNATIONS },
  { key: 'employmentTypes', label: 'Employment Type', plural: 'Employment Types', field: 'employmentType', defaults: DEFAULT_EMPLOYMENT_TYPES },
  { key: 'categories', label: 'Category', plural: 'Categories', field: 'category', defaults: DEFAULT_CATEGORIES, description: 'Categorize employees by type or group (e.g. Permanent, Trainee, Contractual)' },
  { key: 'qualifications', label: 'Qualification', plural: 'Qualifications', field: 'qualification', defaults: DEFAULT_QUALIFICATIONS },
];

export default function Settings() {
  const { companyId } = useParams();
  const { role } = useAuth();
  const { success, error: showError } = useToast();
  const [company, setCompany] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: '', industry: '', location: '', initials: '', color: '#378ADD' });
  const [leavePolicy, setLeavePolicy] = useState({ cl: 12, sl: 12, el: 15 });
  const [addingSection, setAddingSection] = useState(null);
  const [addValue, setAddValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sectionSearch, setSectionSearch] = useState({});
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);
  const isAdmin = role === 'admin';

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [companySnap, empSnap] = await Promise.all([
          getDoc(doc(db, 'companies', companyId)),
          getDocs(collection(db, 'companies', companyId, 'employees')),
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
      } catch (err) {
        showError('Failed to load settings');
      }
      setLoading(false);
    };
    load();
  }, [companyId, showError]);

  const getList = (key, defaults) => (company?.[key]?.length ? company[key] : defaults);
  const getCount = (field) => (value) => employees.filter((e) => (e[field] || '').trim() === value).length;

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
      const next = list.includes ? [...list] : [...defaults];
      next.push(name);
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
        leavePolicy: { cl: Number(leavePolicy.cl) || 12, sl: Number(leavePolicy.sl) || 12, el: Number(leavePolicy.el) || 15 },
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

  if (loading) {
    return (
      <div className="p-8 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-[#378ADD] border-t-transparent" /></div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-800 mb-2">Settings</h1>
      <p className="text-slate-500 text-sm mb-6">Manage company and policies.</p>

      <section className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Company Information</h2>
        <form onSubmit={handleSaveCompany} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Company Name</label><input value={companyForm.name} onChange={(e) => setCompanyForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Industry</label><select value={companyForm.industry} onChange={(e) => setCompanyForm((p) => ({ ...p, industry: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Location</label><input value={companyForm.location} onChange={(e) => setCompanyForm((p) => ({ ...p, location: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Company Initials (2 chars)</label><input value={companyForm.initials} onChange={(e) => setCompanyForm((p) => ({ ...p, initials: e.target.value.slice(0, 2) }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase" maxLength={2} /></div>
          </div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Color</label><div className="flex gap-2">{COLOR_PRESETS.map((c) => <button key={c.value} type="button" onClick={() => setCompanyForm((p) => ({ ...p, color: c.value }))} className={`h-8 w-8 rounded-lg border-2 ${companyForm.color === c.value ? 'border-slate-800' : 'border-slate-200'}`} style={{ backgroundColor: c.value }} />)}</div></div>
          <button type="submit" disabled={saving} className="rounded-lg bg-[#378ADD] text-white text-sm font-medium px-4 py-2 disabled:opacity-50">Save Changes</button>
        </form>
      </section>

      {SECTIONS.map(({ key, label, plural, field, defaults, description }) => {
        const list = getList(key, defaults);
        const countFn = getCount(field);
        const searchTerm = (sectionSearch[key] || '').toLowerCase();
        const filteredList = searchTerm ? list.filter((x) => x.toLowerCase().includes(searchTerm)) : list;
        const isAdding = addingSection === key;
        return (
          <section key={key} className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">{plural} Management</h2>
            <p className="text-slate-500 text-sm mb-4">{description || `Used in Add Employee form. Each item shows employee count; delete only when 0.`}</p>
            {list.length > 8 && (
              <input
                type="text"
                value={sectionSearch[key] || ''}
                onChange={(e) => setSectionSearch((p) => ({ ...p, [key]: e.target.value }))}
                placeholder={`Search ${plural.toLowerCase()}...`}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4"
              />
            )}
            <ul className="space-y-2 mb-4">
              {filteredList.map((item) => (
                <li key={item} className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800">{item}</span>
                  <span className="text-slate-500 text-sm">{countFn(item)} employee(s)</span>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm({ section: key, name: item, defaults })}
                    disabled={countFn(item) > 0}
                    className="text-red-600 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:underline"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            {isAdding ? (
              <div className="flex gap-2 flex-wrap items-center">
                <input
                  value={addValue}
                  onChange={(e) => setAddValue(e.target.value)}
                  placeholder={`New ${label.toLowerCase()} name`}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48"
                  autoFocus
                />
                <button type="button" onClick={() => handleAdd(key, defaults)} disabled={saving || !addValue.trim()} className="rounded-lg bg-[#378ADD] text-white text-sm font-medium px-4 py-2 disabled:opacity-50">Save</button>
                <button type="button" onClick={() => { setAddingSection(null); setAddValue(''); }} className="text-slate-500 text-sm hover:underline">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => { setAddingSection(key); setAddValue(''); }} className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium px-4 py-2">Add {label}</button>
            )}
          </section>
        );
      })}

      <section className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Leave Policy</h2>
        <form onSubmit={handleSavePolicy} className="flex flex-wrap items-end gap-4">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Casual Leave (CL)</label><input type="number" min={0} value={leavePolicy.cl} onChange={(e) => setLeavePolicy((p) => ({ ...p, cl: e.target.value }))} className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Sick Leave (SL)</label><input type="number" min={0} value={leavePolicy.sl} onChange={(e) => setLeavePolicy((p) => ({ ...p, sl: e.target.value }))} className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Earned Leave (EL)</label><input type="number" min={0} value={leavePolicy.el} onChange={(e) => setLeavePolicy((p) => ({ ...p, el: e.target.value }))} className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
          <button type="submit" disabled={saving} className="rounded-lg bg-[#378ADD] text-white text-sm font-medium px-4 py-2 disabled:opacity-50">Save Policy</button>
        </form>
      </section>

      {isAdmin && (
        <section className="bg-white rounded-xl border-2 border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Danger Zone</h2>
          <p className="text-sm text-slate-600 mb-4">Deactivating the company will prevent team members from accessing it. You can reactivate it later from the Companies page.</p>
          <button type="button" onClick={() => setDeactivateConfirm(true)} className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2">Deactivate Company</button>
        </section>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Delete {deleteConfirm.name}?</h3>
            <p className="text-sm text-slate-600 mb-4">This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="text-slate-500 text-sm">Cancel</button>
              <button type="button" onClick={() => handleRemove(deleteConfirm.section, deleteConfirm.name, deleteConfirm.defaults)} className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2">Delete</button>
            </div>
          </div>
        </div>
      )}

      {deactivateConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Deactivate this company?</h3>
            <p className="text-sm text-slate-600 mb-4">Team members will lose access. You can reactivate from the Companies page.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeactivateConfirm(false)} className="text-slate-500 text-sm">Cancel</button>
              <button type="button" onClick={handleDeactivateCompany} className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2">Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
