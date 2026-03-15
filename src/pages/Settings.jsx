import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal'];
const INDUSTRIES = ['IT', 'Manufacturing', 'Automobile', 'Retail', 'Finance', 'Healthcare', 'Education', 'Media', 'Logistics', 'Real Estate', 'Other'];
const COLOR_PRESETS = [
  { value: '#378ADD' }, { value: '#1D9E75' }, { value: '#D85A30' },
  { value: '#534AB7' }, { value: '#A32D2D' }, { value: '#BA7517' },
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
  const [newDept, setNewDept] = useState('');
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

  const departments = company?.departments?.length ? company.departments : DEFAULT_DEPARTMENTS;

  const departmentCount = (dept) => employees.filter((e) => (e.department || '').trim() === dept).length;

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

  const handleAddDepartment = async () => {
    const name = newDept.trim();
    if (!name || departments.includes(name)) return;
    try {
      const next = company?.departments?.length ? [...company.departments] : [...DEFAULT_DEPARTMENTS];
      if (next.includes(name)) return;
      next.push(name);
      await updateDoc(doc(db, 'companies', companyId), { departments: next });
      setCompany((prev) => (prev ? { ...prev, departments: next } : null));
      setNewDept('');
      success('Department added');
    } catch (err) {
      showError('Failed to add department');
    }
  };

  const handleRemoveDepartment = async (dept) => {
    if (departmentCount(dept) > 0) return;
    const next = (company?.departments || DEFAULT_DEPARTMENTS).filter((d) => d !== dept);
    try {
      await updateDoc(doc(db, 'companies', companyId), { departments: next });
      setCompany((prev) => (prev ? { ...prev, departments: next } : null));
      success('Department removed');
    } catch (err) {
      showError('Failed to remove department');
    }
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

      <section className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Department Management</h2>
        <ul className="space-y-2 mb-4">
          {departments.map((d) => (
            <li key={d} className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="font-medium text-slate-800">{d}</span>
              <span className="text-slate-500 text-sm">{departmentCount(d)} employee(s)</span>
              <button type="button" onClick={() => handleRemoveDepartment(d)} disabled={departmentCount(d) > 0} className="text-red-600 text-sm disabled:opacity-40 disabled:cursor-not-allowed">Delete</button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="New department name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48" />
          <button type="button" onClick={handleAddDepartment} className="rounded-lg bg-[#378ADD] text-white text-sm font-medium px-4 py-2">Add Department</button>
        </div>
      </section>

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