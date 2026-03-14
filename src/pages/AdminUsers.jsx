import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { canAccessUserManagement } from '../utils/roles';

const ROLE_OPTIONS = [
  { value: 'hrmanager', label: 'HR Manager' },
  { value: 'manager', label: 'Manager' },
];

export default function AdminUsers() {
  const { currentUser, role } = useAuth();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: '',
    name: '',
    role: 'hrmanager',
    companyId: '',
  });

  const isAdmin = canAccessUserManagement(role);

  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      setLoading(true);
      const [usersSnap, companiesSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'companies')),
      ]);
      setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCompanies(companiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    load();
  }, [isAdmin]);

  const companyMap = useMemo(
    () => Object.fromEntries(companies.map((c) => [c.id, c.name])),
    [companies],
  );

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
    if (filterCompany) {
      list = list.filter((u) => u.companyId === filterCompany);
    }
    if (filterRole) {
      list = list.filter((u) => u.role === filterRole);
    }
    return list;
  }, [users, search, filterCompany, filterRole]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    const email = form.email.trim().toLowerCase();
    if (!email) return;
    const ref = doc(db, 'users', email);
    await setDoc(ref, {
      email,
      name: form.name.trim(),
      role: form.role,
      companyId: form.companyId || null,
      isActive: true,
      createdAt: serverTimestamp(),
      addedBy: currentUser?.email || '',
    });
    setUsers((prev) => [
      { id: email, email, name: form.name.trim(), role: form.role, companyId: form.companyId || null, isActive: true, createdAt: new Date() },
      ...prev.filter((u) => u.id !== email),
    ]);
    setShowForm(false);
    setForm({ email: '', name: '', role: 'hrmanager', companyId: '' });
  };

  const handleDeactivate = async (user) => {
    const ref = doc(db, 'users', user.id);
    await updateDoc(ref, { isActive: false });
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: false } : u)));
  };

  const handleRemove = async (user) => {
    const ref = doc(db, 'users', user.id);
    await deleteDoc(ref);
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
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
    };
    const label = { admin: 'Admin', hrmanager: 'HR Manager', manager: 'Manager' }[r] || r;
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
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
        >
          Add User
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD] w-56"
        />
        <select
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD] w-44"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD] w-40"
        >
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
          <option value="admin">Admin</option>
        </select>
      </div>

      {loading ? (
        <div className="text-slate-500 text-sm py-8">Loading users...</div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Avatar</th>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-left font-medium">Company</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <img
                      src={u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name || u.email || 'U')}`}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-800">{u.name || '—'}</td>
                  <td className="px-4 py-2 text-slate-700">{u.email}</td>
                  <td className="px-4 py-2">{roleBadge(u.role)}</td>
                  <td className="px-4 py-2 text-slate-700">{companyMap[u.companyId] || '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.isActive !== false
                          ? 'bg-green-50 text-green-700 border border-green-100'
                          : 'bg-slate-50 text-slate-500 border border-slate-100'
                      }`}
                    >
                      {u.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-2 space-x-2">
                    {u.isActive !== false && (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(u)}
                        className="text-xs font-medium text-amber-600 hover:text-amber-700"
                      >
                        Deactivate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(u)}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-center text-slate-500 text-sm" colSpan={7}>
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
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Gmail address</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full Name</label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
                >
                  <option value="">— Select company —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
                <button type="submit" className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
