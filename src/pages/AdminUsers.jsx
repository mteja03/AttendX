import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import PageLoader from '../components/PageLoader';
import { canAccessUserManagement, ROLE_LABELS } from '../utils/roles';

const DEFAULT_MODULE_PERMISSIONS = {
  employees: true,
  leave: true,
  documents: true,
  assets: true,
  reports: true,
  policies: true,
  calendar: true,
  onboarding: true,
  offboarding: true,
  orgchart: true,
  settings: false,
  team: false,
};

const PERMISSION_MODULES = [
  { key: 'employees', label: 'Employees', icon: '👥' },
  { key: 'leave', label: 'Leave', icon: '🏖️' },
  { key: 'documents', label: 'Documents', icon: '📄' },
  { key: 'assets', label: 'Assets', icon: '📦' },
  { key: 'reports', label: 'Reports', icon: '📊' },
  { key: 'policies', label: 'Library', icon: '📋' },
  { key: 'calendar', label: 'Calendar', icon: '🗓️' },
  { key: 'onboarding', label: 'Onboarding', icon: '🎯' },
  { key: 'offboarding', label: 'Offboarding', icon: '👋' },
  { key: 'orgchart', label: 'Org Chart', icon: '🏢' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
  { key: 'team', label: 'Team Members', icon: '👤' },
];

const ROLE_OPTIONS = [
  { value: 'hrmanager', label: 'HR Manager' },
  { value: 'manager', label: 'Manager' },
  { value: 'itmanager', label: 'IT Manager' },
];

function formatDate(v) {
  if (!v) return '—';
  const d = v?.toDate ? v.toDate() : new Date(v);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminUsers() {
  const { currentUser, role } = useAuth();
  const { success, error: showError } = useToast();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: '',
    name: '',
    role: 'hrmanager',
    companyId: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [editingPermissionsUser, setEditingPermissionsUser] = useState(null);
  const [permissionDraft, setPermissionDraft] = useState(DEFAULT_MODULE_PERMISSIONS);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const isAdmin = canAccessUserManagement(role);

  useEffect(() => {
    if (!isAdmin || !currentUser) return;
    const load = async () => {
      setLoading(true);
      try {
        const [usersSnap, companiesSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'companies')),
        ]);
        const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const byEmail = {};
        const keepUid = currentUser.uid;
        allUsers.forEach((u) => {
          const email = (u.email || '').toLowerCase().trim();
          if (!email) return;
          const existing = byEmail[email];
          const uTime = u.createdAt?.toMillis?.() ?? u.createdAt?.getTime?.() ?? 0;
          if (!existing) {
            byEmail[email] = u;
            return;
          }
          const existingTime = existing.createdAt?.toMillis?.() ?? existing.createdAt?.getTime?.() ?? 0;
          const keep =
            existing.id === keepUid
              ? existing
              : u.id === keepUid
                ? u
                : uTime >= existingTime
                  ? u
                  : existing;
          byEmail[email] = keep;
        });
        const toDelete = allUsers.filter((u) => {
          const email = (u.email || '').toLowerCase().trim();
          return email && byEmail[email] && byEmail[email].id !== u.id;
        });
        for (const u of toDelete) {
          try {
            await deleteDoc(doc(db, 'users', u.id));
          } catch (e) {
            console.warn('Could not delete duplicate user doc', u.id, e);
          }
        }
        const withEmail = Object.values(byEmail);
        const noEmail = allUsers.filter((u) => !(u.email || '').trim());
        setUsers([...withEmail, ...noEmail]);
        setCompanies(companiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        showError('Failed to load users');
      }
      setLoading(false);
    };
    load();
  }, [isAdmin, currentUser, showError]);

  const companyMap = useMemo(
    () => Object.fromEntries(companies.map((c) => [c.id, c.name])),
    [companies],
  );

  const stats = useMemo(() => {
    const active = users.filter((u) => u.isActive !== false).length;
    const inactive = users.filter((u) => u.isActive === false).length;
    return { total: users.length, active, inactive };
  }, [users]);

  const filtered = useMemo(() => {
    let list = users;
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (u) =>
          u.email?.toLowerCase().includes(term) ||
          u.name?.toLowerCase().includes(term),
      );
    }
    if (filterCompany) list = list.filter((u) => u.companyId === filterCompany);
    if (filterRole) list = list.filter((u) => u.role === filterRole);
    if (filterStatus === 'active') list = list.filter((u) => u.isActive !== false);
    if (filterStatus === 'inactive') list = list.filter((u) => u.isActive === false);
    return list;
  }, [users, search, filterCompany, filterRole, filterStatus]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFormError('');
  };

  const isGmail = (email) => /^[^@]+@gmail\.com$/i.test((email || '').trim());

  const handleAddUser = async (e) => {
    e.preventDefault();
    setFormError('');
    const email = form.email.trim().toLowerCase();
    if (!email) return;
    if (!isGmail(email)) {
      setFormError('Please enter a valid @gmail.com address.');
      return;
    }
    const existsByDocId = await getDoc(doc(db, 'users', email));
    const existsInList = users.some((u) => (u.email || '').toLowerCase() === email);
    if (existsByDocId.exists() || existsInList) {
      setFormError('A user with this email already exists.');
      return;
    }
    setSaving(true);
    try {
      const ref = doc(db, 'users', email);
      await setDoc(ref, {
        email,
        name: form.name.trim(),
        role: form.role,
        companyId: form.companyId || null,
        isActive: true,
        createdAt: serverTimestamp(),
        photoURL: '',
        addedBy: currentUser?.email || '',
        permissions: { ...DEFAULT_MODULE_PERMISSIONS },
      });
      setUsers((prev) => [
        {
          id: email,
          email,
          name: form.name.trim(),
          role: form.role,
          companyId: form.companyId || null,
          isActive: true,
          createdAt: new Date(),
          photoURL: '',
          permissions: { ...DEFAULT_MODULE_PERMISSIONS },
        },
        ...prev.filter((u) => u.id !== email),
      ]);
      setShowForm(false);
      setForm({ email: '', name: '', role: 'hrmanager', companyId: '' });
      success('User added');
    } catch {
      showError('Failed to add user');
    }
    setSaving(false);
  };

  const handleDeactivate = async (user) => {
    try {
      await updateDoc(doc(db, 'users', user.id), { isActive: false });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: false } : u)));
      success('User deactivated');
    } catch {
      showError('Failed to deactivate');
    }
  };

  const handleActivate = async (user) => {
    try {
      await updateDoc(doc(db, 'users', user.id), { isActive: true });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: true } : u)));
      success('User activated');
    } catch {
      showError('Failed to activate');
    }
  };

  const handleRemove = async (user) => {
    try {
      await deleteDoc(doc(db, 'users', user.id));
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setRemoveConfirm(null);
      success('User removed');
    } catch {
      showError('Failed to remove user');
    }
  };

  const openPermissionsModal = (user) => {
    setEditingPermissionsUser(user);
    setPermissionDraft({
      ...DEFAULT_MODULE_PERMISSIONS,
      ...(user.permissions && typeof user.permissions === 'object' ? user.permissions : {}),
    });
  };

  const togglePermission = (key) => {
    setPermissionDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const savePermissions = async () => {
    if (!editingPermissionsUser) return;
    setSavingPermissions(true);
    try {
      await updateDoc(doc(db, 'users', editingPermissionsUser.id), {
        permissions: permissionDraft,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === editingPermissionsUser.id ? { ...u, permissions: { ...permissionDraft } } : u)),
      );
      success('Permissions saved!');
      setEditingPermissionsUser(null);
    } catch (e) {
      console.error(e);
      showError('Failed to save permissions');
    }
    setSavingPermissions(false);
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-slate-800">Platform Users</h1>
        <p className="mt-2 text-slate-500 text-sm">You do not have permission to view this page.</p>
      </div>
    );
  }

  const roleBadge = (r) => {
    const styles = {
      admin: 'bg-purple-100 text-purple-800',
      hrmanager: 'bg-green-100 text-green-800',
      manager: 'bg-amber-100 text-amber-800',
      itmanager: 'bg-[#C5E8E8] text-[#0F4444]',
    };
    const label = { admin: 'Admin', hrmanager: 'HR Manager', manager: 'Manager', itmanager: 'IT Manager' }[r] || r;
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[r] || 'bg-slate-100 text-slate-700'}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Platform Users</h1>
          <p className="text-slate-500 text-sm mt-1">Manage who can access AttendX.</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(true); setFormError(''); }}
          className="inline-flex items-center justify-center rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2"
        >
          Add User
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-slate-500 text-sm">Total Users</p>
          <p className="text-xl font-semibold text-slate-800 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-slate-500 text-sm">Active</p>
          <p className="text-xl font-semibold text-slate-800 mt-1">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-slate-500 text-sm">Inactive</p>
          <p className="text-xl font-semibold text-slate-800 mt-1">{stats.inactive}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4] w-56"
        />
        <select
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4] w-44"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4] w-40"
        >
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
          <option value="admin">Admin</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4] w-32"
        >
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Avatar + Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Company</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Added date</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || u.email || 'U')}`}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                      <span className="font-medium text-slate-800">{u.name || '—'}</span>
                      {(currentUser?.email || '').toLowerCase() === (u.email || '').toLowerCase() && (
                        <span className="inline-flex items-center rounded-full bg-[#1B6B6B] px-2 py-0.5 text-xs font-medium text-white">
                          You
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{u.email}</td>
                  <td className="px-4 py-3">{roleBadge(u.role)}</td>
                  <td className="px-4 py-3 text-slate-700">{companyMap[u.companyId] || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.isActive !== false
                          ? 'bg-green-50 text-green-700 border border-green-100'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {u.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {u.role !== 'admin' && (
                        <>
                          <button
                            type="button"
                            onClick={() => openPermissionsModal(u)}
                            className="text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                          >
                            Permissions
                          </button>
                          {u.isActive !== false ? (
                            <button
                              type="button"
                              onClick={() => handleDeactivate(u)}
                              className="text-xs font-medium text-amber-600 hover:text-amber-700"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleActivate(u)}
                              className="text-xs font-medium text-green-600 hover:text-green-700"
                            >
                              Activate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setRemoveConfirm(u)}
                            className="text-xs font-medium text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </>
                      )}
                      {u.role === 'admin' && <span className="text-xs text-slate-400">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500 text-sm" colSpan={7}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Add User</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleAddUser} className="space-y-4">
              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Gmail address <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleFormChange}
                  placeholder="user@gmail.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Company</label>
                <select
                  name="companyId"
                  value={form.companyId}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
                >
                  <option value="">— Select company —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-700" disabled={saving}>Cancel</button>
                <button type="submit" className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingPermissionsUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-slate-800 mb-1">Permissions</h3>
            <p className="text-sm text-gray-400 mb-4">
              {editingPermissionsUser.name || editingPermissionsUser.email} ·{' '}
              {ROLE_LABELS[editingPermissionsUser.role] || editingPermissionsUser.role}
            </p>
            <div className="space-y-2">
              {PERMISSION_MODULES.map((module) => (
                <div
                  key={module.key}
                  className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span aria-hidden>{module.icon}</span>
                    <span className="text-sm text-gray-800 truncate">{module.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePermission(module.key)}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                      permissionDraft[module.key] ? 'bg-[#1B6B6B]' : 'bg-gray-200'
                    }`}
                    aria-pressed={!!permissionDraft[module.key]}
                    aria-label={`Toggle ${module.label}`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        permissionDraft[module.key] ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setEditingPermissionsUser(null)}
                className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-gray-600 hover:bg-slate-50"
                disabled={savingPermissions}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={savePermissions}
                disabled={savingPermissions}
                className="flex-1 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
              >
                {savingPermissions ? 'Saving…' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {removeConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Remove user?</h3>
            <p className="text-sm text-slate-600 mb-4">
              This will permanently delete <strong>{removeConfirm.name || removeConfirm.email}</strong>. They will lose access to AttendX.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemoveConfirm(null)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRemove(removeConfirm)}
                className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
