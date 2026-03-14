import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';

const ROLE_OPTIONS = [
  { value: 'hrmanager', label: 'HR Manager' },
  { value: 'manager', label: 'Manager' },
];

function formatDate(v) {
  if (!v) return '—';
  const d = v?.toDate ? v.toDate() : new Date(v);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TeamMembers() {
  const { companyId } = useParams();
  const { success, error: showError } = useToast();
  const [teamMembers, setTeamMembers] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'hrmanager' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'teamMembers'));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTeamMembers(list);
        const emails = [...new Set(list.map((t) => t.email).filter(Boolean))];
        const map = {};
        await Promise.all(
          emails.map(async (email) => {
            const ref = doc(db, 'users', email);
            const s = await getDoc(ref);
            if (s.exists()) map[email] = { id: s.id, ...s.data() };
          }),
        );
        setUsersMap(map);
      } catch (err) {
        showError('Failed to load team members');
      }
      setLoading(false);
    };
    load();
  }, [companyId, showError]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!email) return;
    setSaving(true);
    try {
      const userRef = doc(db, 'users', email);
      const userSnap = await getDoc(userRef);
      const teamRef = doc(collection(db, 'companies', companyId, 'teamMembers'), email);

      if (userSnap.exists()) {
        await updateDoc(userRef, { companyId, role: form.role });
      } else {
        await setDoc(userRef, {
          email,
          name: form.name.trim(),
          role: form.role,
          companyId,
          isActive: true,
          createdAt: serverTimestamp(),
          photoURL: '',
        });
      }
      await setDoc(teamRef, {
        email,
        name: form.name.trim(),
        role: form.role,
        isActive: true,
        addedAt: serverTimestamp(),
      });
      setTeamMembers((prev) => [
        { id: email, email, name: form.name.trim(), role: form.role, isActive: true, addedAt: new Date() },
        ...prev.filter((t) => t.email !== email),
      ]);
      setUsersMap((prev) => ({ ...prev, [email]: { email, name: form.name.trim(), role: form.role, companyId, isActive: true } }));
      setShowAddModal(false);
      setForm({ email: '', name: '', role: 'hrmanager' });
      success('Team member added');
    } catch (err) {
      showError('Failed to add team member');
    }
    setSaving(false);
  };

  const handleDeactivate = async (member) => {
    try {
      const userRef = doc(db, 'users', member.email);
      const teamRef = doc(db, 'companies', companyId, 'teamMembers', member.id);
      await Promise.all([
        updateDoc(userRef, { isActive: false }),
        updateDoc(teamRef, { isActive: false }),
      ]);
      setTeamMembers((prev) => prev.map((t) => (t.id === member.id ? { ...t, isActive: false } : t)));
      success('Member deactivated');
    } catch (err) {
      showError('Failed to deactivate');
    }
  };

  const handleActivate = async (member) => {
    try {
      const userRef = doc(db, 'users', member.email);
      const teamRef = doc(db, 'companies', companyId, 'teamMembers', member.id);
      await Promise.all([
        updateDoc(userRef, { isActive: true }),
        updateDoc(teamRef, { isActive: true }),
      ]);
      setTeamMembers((prev) => prev.map((t) => (t.id === member.id ? { ...t, isActive: true } : t)));
      success('Member activated');
    } catch (err) {
      showError('Failed to activate');
    }
  };

  const handleRemove = async (member) => {
    try {
      const userRef = doc(db, 'users', member.email);
      const teamRef = doc(db, 'companies', companyId, 'teamMembers', member.id);
      await deleteDoc(teamRef);
      await updateDoc(userRef, { companyId: null });
      setTeamMembers((prev) => prev.filter((t) => t.id !== member.id));
      success('Member removed');
    } catch (err) {
      showError('Failed to remove member');
    }
  };

  const roleBadge = (r) => {
    const styles = { hrmanager: 'bg-green-100 text-green-800', manager: 'bg-amber-100 text-amber-800' };
    const label = { hrmanager: 'HR Manager', manager: 'Manager' }[r] || r;
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[r] || 'bg-slate-100 text-slate-700'}`}>
        {label}
      </span>
    );
  };

  if (!companyId) return null;

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Team Members</h1>
          <p className="text-slate-500 mt-1">Users with access to this company</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center justify-center rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
        >
          Add Team Member
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#378ADD] border-t-transparent" />
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Avatar</th>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Added date</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <img
                      src={usersMap[t.email]?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.name || t.email || 'U')}`}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{t.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{t.email}</td>
                  <td className="px-4 py-3">{roleBadge(t.role)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${t.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                      {t.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(t.addedAt)}</td>
                  <td className="px-4 py-3 space-x-2">
                    {t.isActive !== false ? (
                      <button type="button" onClick={() => handleDeactivate(t)} className="text-amber-600 text-xs font-medium hover:underline">Deactivate</button>
                    ) : (
                      <button type="button" onClick={() => handleActivate(t)} className="text-green-600 text-xs font-medium hover:underline">Activate</button>
                    )}
                    <button type="button" onClick={() => handleRemove(t)} className="text-red-600 text-xs font-medium hover:underline">Remove</button>
                  </td>
                </tr>
              ))}
              {teamMembers.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={7}>No team members yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Team Member</h2>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Gmail address</label>
                <input type="email" name="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                <input type="text" name="name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                <select name="role" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#378ADD]">
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="text-sm text-slate-500 hover:text-slate-700" disabled={saving}>Cancel</button>
                <button type="submit" className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2 disabled:opacity-50" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
