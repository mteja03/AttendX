import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { canAccessUserManagement, ROLE_COLORS, ROLE_LABELS } from '../utils/roles';

const DEFAULT_MODULE_PERMISSIONS = {
  employees: true,
  leave: true,
  documents: true,
  assets: true,
  reports: true,
  audit: true,
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
  { key: 'audit', label: 'Audit', icon: '🔍' },
  { key: 'policies', label: 'Library', icon: '📋' },
  { key: 'calendar', label: 'Calendar', icon: '🗓️' },
  { key: 'orgchart', label: 'Org Chart', icon: '🏢' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
  { key: 'team', label: 'Team Members', icon: '👤' },
];

function UserRow({ user, companies, currentUserRole, onEdit, onToggleActive, onDelete, onEditPermissions }) {
  const [showMenu, setShowMenu] = useState(false);
  const rowRef = useRef(null);
  const isActive = user.isActive !== false;
  const company = companies?.find((c) => c.id === user.companyId);
  const canMutate = user.role !== 'admin' && !(currentUserRole === 'companyadmin' && user.role === 'companyadmin');

  const lastLogin = user.lastLoginAt
    ? new Date(user.lastLoginAt?.toDate ? user.lastLoginAt.toDate() : user.lastLoginAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
      })
    : null;

  useEffect(() => {
    const handler = (e) => {
      if (rowRef.current && !rowRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const menuPanel = showMenu && canMutate && (
    <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
      <button
        type="button"
        onClick={() => {
          onEdit();
          setShowMenu(false);
        }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
      >
        ✏️ Edit
      </button>
      <button
        type="button"
        onClick={() => {
          onEditPermissions();
          setShowMenu(false);
        }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
      >
        🔑 Permissions
      </button>
      <button
        type="button"
        onClick={() => {
          onToggleActive();
          setShowMenu(false);
        }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
      >
        {isActive ? '🚫 Deactivate' : '✅ Activate'}
      </button>
      <div className="border-t border-gray-50" />
      <button
        type="button"
        onClick={() => {
          onDelete();
          setShowMenu(false);
        }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50"
      >
        🗑️ Remove
      </button>
    </div>
  );

  return (
    <div ref={rowRef} className="border-b border-gray-50 last:border-0">
      <div
        className={`hidden items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50/60 md:grid ${!isActive ? 'opacity-60' : ''}`}
        style={{ gridTemplateColumns: '2fr 1.2fr 1.4fr 1fr 1fr 120px 44px' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: isActive ? '#1B6B6B' : '#9CA3AF' }}
          >
            {(user.name || user.email)?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-800">{user.name || '—'}</p>
            <p className="truncate text-xs text-gray-400">{user.email}</p>
          </div>
        </div>
        <div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-600'}`}>
            {ROLE_LABELS[user.role] || user.role}
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-600">{company?.name || '—'}</p>
        </div>
        <div>
          {user.role === 'auditmanager' && user.auditScope ? (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
              {user.auditScope === 'internal' ? '🏢 Int' : user.auditScope === 'external' ? '🌐 Ext' : '🔄 Both'}
            </span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </div>
        <div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div>
          {lastLogin ? (
            <p className="text-xs text-gray-500">{lastLogin}</p>
          ) : (
            <p className="text-xs italic text-gray-300">Never</p>
          )}
        </div>
        <div className="relative flex justify-end">
          {canMutate ? (
            <>
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-lg text-gray-400 hover:bg-gray-100"
              >
                ···
              </button>
              {menuPanel}
            </>
          ) : null}
        </div>
      </div>

      <div className={`relative border-b border-gray-50 px-4 py-4 last:border-0 md:hidden ${!isActive ? 'opacity-60' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-bold text-white"
              style={{ background: isActive ? '#1B6B6B' : '#9CA3AF' }}
            >
              {(user.name || user.email)?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{user.name || user.email}</p>
              <p className="truncate text-xs text-gray-400">{user.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-600'}`}>
                  {ROLE_LABELS[user.role] || user.role}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
                {company && <span className="text-xs text-gray-400">{company.name}</span>}
              </div>
            </div>
          </div>
          {canMutate ? (
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-lg text-gray-400 hover:bg-gray-100"
              >
                ···
              </button>
              {menuPanel}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const { currentUser, role: currentUserRole, companyId: authCompanyId } = useAuth();
  const { success, error: showError } = useToast();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEmpDrop, setShowEmpDrop] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [addMethod, setAddMethod] = useState('employee');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [editingPermissionsUser, setEditingPermissionsUser] = useState(null);
  const [permissionDraft, setPermissionDraft] = useState(DEFAULT_MODULE_PERMISSIONS);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const empRef = useRef(null);
  const [form, setForm] = useState({ email: '', name: '', role: '', companyId: '', auditScope: 'both', selectedEmpId: '' });
  const isUserAdmin = canAccessUserManagement(currentUserRole);
  const isCompanyAdmin = currentUserRole === 'companyadmin';
  const isAdmin = currentUserRole === 'admin';

  const usersQuery = useMemo(() => {
    if (isAdmin) return query(collection(db, 'users'));
    return query(collection(db, 'users'), where('companyId', '==', authCompanyId));
  }, [authCompanyId, isAdmin]);

  const roleOptions = useMemo(
    () => [
      { value: 'hrmanager', label: 'HR Manager' },
      { value: 'manager', label: 'Manager' },
      { value: 'itmanager', label: 'IT Manager' },
      { value: 'auditmanager', label: 'Audit Manager' },
      { value: 'auditor', label: 'Auditor' },
      ...(currentUserRole === 'admin' ? [{ value: 'companyadmin', label: 'Company Admin' }] : []),
    ],
    [currentUserRole],
  );

  useEffect(() => {
    if (!isUserAdmin || !currentUser) return;
    const load = async () => {
      setLoading(true);
      try {
        const companiesSnap = await getDocs(collection(db, 'companies'));
        const allCompanies = companiesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const scopedCompanies = isCompanyAdmin ? allCompanies.filter((c) => c.id === authCompanyId) : allCompanies;
        setCompanies(scopedCompanies);
        const usersSnap = await getDocs(usersQuery);
        const allUsers = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUsers(allUsers);
      } catch {
        showError('Failed to load users');
      }
      setLoading(false);
    };
    load();
  }, [authCompanyId, currentUser, isCompanyAdmin, isUserAdmin, showError, usersQuery]);

  useEffect(() => {
    if (!showAddModal) return;
    const targetCompanyId = currentUserRole === 'admin' ? form.companyId : authCompanyId;
    if (!targetCompanyId) {
      const id = setTimeout(() => setEmployees([]), 0);
      return () => clearTimeout(id);
    }
    const loadEmployees = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', targetCompanyId, 'employees'));
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        setEmployees([]);
      }
    };
    loadEmployees();
  }, [authCompanyId, currentUserRole, form.companyId, showAddModal]);

  useEffect(() => {
    if (!showEmpDrop) return;
    const onDocClick = (ev) => {
      if (!empRef.current?.contains(ev.target)) setShowEmpDrop(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showEmpDrop]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((u) => {
      if (u.role === 'admin') return false;
      if (term && !(`${u.name || ''} ${u.email || ''}`.toLowerCase().includes(term))) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && u.isActive === false) return false;
      if (statusFilter === 'inactive' && u.isActive !== false) return false;
      if (companyFilter && u.companyId !== companyFilter) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter, companyFilter]);

  const resetAddForm = () => {
    setForm({
      email: '',
      name: '',
      role: '',
      companyId: currentUserRole === 'admin' ? '' : authCompanyId || '',
      auditScope: 'both',
      selectedEmpId: '',
    });
    setEmpSearch('');
    setAddMethod('employee');
    setFormError('');
  };

  const openAdd = () => {
    resetAddForm();
    setShowAddModal(true);
  };

  const isGmail = (email) => /^[^@]+@gmail\.com$/i.test((email || '').trim());

  const handleAddUser = async (e) => {
    e.preventDefault();
    const email = (form.email || '').trim().toLowerCase();
    if (!email || !form.name.trim() || !form.role) {
      setFormError('Please fill all required fields.');
      return;
    }
    if (!isGmail(email)) {
      setFormError('Must be a valid Gmail address.');
      return;
    }
    if (currentUserRole === 'companyadmin' && form.role === 'companyadmin') {
      setFormError('Company Admin cannot create another Company Admin.');
      return;
    }
    const existsByDocId = await getDoc(doc(db, 'users', email));
    if (existsByDocId.exists()) {
      setFormError('A user with this email already exists.');
      return;
    }
    const targetCompanyId = form.companyId || authCompanyId;
    if (!targetCompanyId) {
      setFormError('Please select a company.');
      return;
    }
    setSaving(true);
    try {
      const resolvedAuditScope = form.role === 'auditmanager' ? form.auditScope || 'both' : null;
      await setDoc(doc(db, 'users', email), {
        email,
        name: form.name.trim(),
        role: form.role,
        companyId: targetCompanyId,
        isActive: true,
        auditScope: resolvedAuditScope,
        employeeId: form.selectedEmpId || null,
        createdAt: new Date(),
        createdBy: currentUser?.email || '',
        permissions: { ...DEFAULT_MODULE_PERMISSIONS },
      });
      setUsers((prev) => [
        {
          id: email,
          email,
          name: form.name.trim(),
          role: form.role,
          companyId: targetCompanyId,
          isActive: true,
          auditScope: resolvedAuditScope,
          employeeId: form.selectedEmpId || null,
          createdAt: new Date(),
        },
        ...prev,
      ]);
      setShowAddModal(false);
      success('User added successfully');
    } catch {
      showError('Failed to add user');
    }
    setSaving(false);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setForm({
      email: user.email || '',
      name: user.name || '',
      role: user.role || '',
      companyId: user.companyId || authCompanyId || '',
      auditScope: user.auditScope || 'both',
      selectedEmpId: user.employeeId || '',
    });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    if (currentUserRole === 'companyadmin' && form.role === 'companyadmin') {
      setFormError('Company Admin cannot assign Company Admin role.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        role: form.role,
        companyId: currentUserRole === 'admin' ? form.companyId || null : authCompanyId || null,
        auditScope: form.role === 'auditmanager' ? form.auditScope || 'both' : null,
      };
      await updateDoc(doc(db, 'users', editingUser.id), payload);
      setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? { ...u, ...payload } : u)));
      setEditingUser(null);
      success('User updated');
    } catch {
      showError('Failed to update user');
    }
    setSaving(false);
  };

  const handleToggleActive = async (user) => {
    try {
      const next = user.isActive === false;
      await updateDoc(doc(db, 'users', user.id), { isActive: next });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: next } : u)));
      success(next ? 'User activated' : 'User deactivated');
    } catch {
      showError('Failed to update status');
    }
  };

  const handleDelete = async (user) => {
    try {
      await deleteDoc(doc(db, 'users', user.id));
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setRemoveConfirm(null);
      success('User removed');
    } catch {
      showError('Failed to remove user');
    }
  };

  const openPermissions = (user) => {
    setEditingPermissionsUser(user);
    setPermissionDraft({ ...DEFAULT_MODULE_PERMISSIONS, ...(user.permissions || {}) });
  };

  const savePermissions = async () => {
    if (!editingPermissionsUser) return;
    setSavingPermissions(true);
    try {
      await updateDoc(doc(db, 'users', editingPermissionsUser.id), { permissions: permissionDraft });
      setUsers((prev) => prev.map((u) => (u.id === editingPermissionsUser.id ? { ...u, permissions: { ...permissionDraft } } : u)));
      setEditingPermissionsUser(null);
      success('Permissions saved');
    } catch {
      showError('Failed to save permissions');
    }
    setSavingPermissions(false);
  };

  if (!isUserAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-gray-800">Platform Users</h1>
        <p className="text-sm text-gray-500 mt-2">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-30 isolate border-b border-gray-100 bg-white px-4 py-4 md:px-6">
        <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-lg font-semibold text-gray-800 sm:text-xl">Platform Users</h1>
            <p className="mt-0.5 text-sm text-gray-400">Manage who has access to AttendX</p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-[#1B6B6B] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#155858]"
          >
            + Add User
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="min-w-[140px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none"
          >
            <option value="">All Roles</option>
            {isAdmin && <option value="companyadmin">Company Admin</option>}
            <option value="hrmanager">HR Manager</option>
            <option value="manager">Manager</option>
            <option value="itmanager">IT Manager</option>
            <option value="auditmanager">Audit Manager</option>
            <option value="auditor">Auditor</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-w-[120px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="min-w-[150px] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none"
          >
            <option value="">All Companies</option>
            {(companies || [])
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span>
            {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
          </span>
          <span className="text-gray-300">·</span>
          <span className="text-green-600">{users.filter((u) => u.isActive !== false).length} active</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-400">{users.filter((u) => u.isActive === false).length} inactive</span>
          {(search || roleFilter || statusFilter || companyFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setRoleFilter('');
                setStatusFilter('');
                setCompanyFilter('');
              }}
              className="ml-auto text-xs text-[#1B6B6B] hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6">
        {loading ? (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-0"
              >
                <div className="h-9 w-9 flex-shrink-0 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 rounded bg-gray-200" />
                  <div className="h-2 w-56 rounded bg-gray-100" />
                </div>
                <div className="h-5 w-24 rounded-full bg-gray-100" />
                <div className="h-5 w-20 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white py-20 text-center">
            <p className="mb-3 text-4xl">👥</p>
            <p className="mb-1 text-base font-semibold text-gray-700">No users found</p>
            <p className="text-sm text-gray-400">
              {search || roleFilter || statusFilter || companyFilter ? 'Try adjusting your filters' : 'Add your first platform user'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
            <div
              className="hidden gap-4 border-b border-gray-100 bg-gray-50/80 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400 md:grid"
              style={{ gridTemplateColumns: '2fr 1.2fr 1.4fr 1fr 1fr 120px 44px' }}
            >
              <div>User</div>
              <div>Role</div>
              <div>Company</div>
              <div>Scope</div>
              <div>Status</div>
              <div>Last Login</div>
              <div />
            </div>
            <div>
              {filteredUsers.map((user) => (
                <UserRow
                  key={user.id || user.email}
                  user={user}
                  companies={companies}
                  currentUserRole={currentUserRole}
                  onEdit={() => openEdit(user)}
                  onToggleActive={() => handleToggleActive(user)}
                  onDelete={() => setRemoveConfirm(user)}
                  onEditPermissions={() => openPermissions(user)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {(showAddModal || editingUser) && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">{editingUser ? 'Edit User' : 'Add User'}</h3>
              <button type="button" onClick={() => { setShowAddModal(false); setEditingUser(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {formError && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>}
            {!editingUser && (
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[{ id: 'employee', icon: '👤', label: 'Select Employee', sub: 'From your employee list' }, { id: 'manual', icon: '✉️', label: 'Enter Manually', sub: 'Gmail + Full Name' }].map((m) => (
                  <button key={m.id} type="button" onClick={() => { setAddMethod(m.id); setForm((prev) => ({ ...prev, email: '', name: '', selectedEmpId: '' })); setEmpSearch(''); }} className={`p-4 rounded-xl border-2 text-left transition-all ${addMethod === m.id ? 'border-[#1B6B6B] bg-[#E8F5F5]' : 'border-gray-200 hover:border-gray-300'}`}>
                    <span className="text-2xl block mb-2">{m.icon}</span>
                    <p className={`text-sm font-medium ${addMethod === m.id ? 'text-[#1B6B6B]' : 'text-gray-800'}`}>{m.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={editingUser ? saveEdit : handleAddUser} className="space-y-3">
              {!editingUser && addMethod === 'employee' && (
                <div ref={empRef} className="relative">
                  <label className="text-xs text-gray-500 block mb-1.5">Select Employee *</label>
                  <input type="text" value={form.selectedEmpId ? form.name : empSearch} placeholder="Search employee by name..." onChange={(e) => { setEmpSearch(e.target.value); setShowEmpDrop(true); if (!e.target.value) setForm((p) => ({ ...p, email: '', name: '', selectedEmpId: '' })); }} onFocus={() => { setShowEmpDrop(true); setEmpSearch(''); setForm((p) => ({ ...p, email: '', name: '', selectedEmpId: '' })); }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                  {showEmpDrop && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto">
                      {employees.filter((emp) => emp.status === 'Active' && emp.email && (!empSearch || `${emp.fullName || ''} ${emp.email || ''}`.toLowerCase().includes(empSearch.toLowerCase()))).slice(0, 8).map((emp) => (
                        <div key={emp.id} onMouseDown={(ev) => { ev.preventDefault(); setForm((p) => ({ ...p, email: (emp.email || '').toLowerCase(), name: emp.fullName || '', selectedEmpId: emp.id })); setEmpSearch(''); setShowEmpDrop(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-[#E8F5F5] cursor-pointer border-b border-gray-50 last:border-0">
                          <div className="w-8 h-8 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{emp.fullName?.charAt(0)}</div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{emp.fullName}</p>
                            <p className="text-xs text-gray-400 truncate">{emp.email} · {emp.designation || emp.department || ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(!editingUser && addMethod === 'manual') && (
                <>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Full Name *</label>
                    <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Gmail Address *</label>
                    <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value.toLowerCase() }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                  </div>
                </>
              )}

              {editingUser && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Full Name *</label>
                  <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                </div>
              )}

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Role *</label>
                <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value, auditScope: e.target.value === 'auditmanager' ? 'both' : null }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]">
                  <option value="">Select role...</option>
                  {roleOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>

              {form.role === 'auditmanager' && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Audit Scope</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ v: 'internal', l: '🏢 Internal' }, { v: 'external', l: '🌐 External' }, { v: 'both', l: '🔄 Both' }].map((opt) => (
                      <button key={opt.v} type="button" onClick={() => setForm((p) => ({ ...p, auditScope: opt.v }))} className={`py-2 rounded-xl text-xs font-medium border-2 transition-all ${form.auditScope === opt.v ? 'border-[#1B6B6B] bg-[#E8F5F5] text-[#1B6B6B]' : 'border-gray-200 text-gray-500'}`}>{opt.l}</button>
                    ))}
                  </div>
                </div>
              )}

              {currentUserRole === 'admin' && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Assign to Company</label>
                  <select value={form.companyId || ''} onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]">
                    <option value="">Select company...</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAddModal(false); setEditingUser(null); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? 'Saving...' : editingUser ? 'Save Changes' : 'Add User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingPermissionsUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-slate-800 mb-1">Permissions</h3>
            <p className="text-sm text-gray-400 mb-4">{editingPermissionsUser.name || editingPermissionsUser.email} · {ROLE_LABELS[editingPermissionsUser.role] || editingPermissionsUser.role}</p>
            <div className="space-y-2">
              {PERMISSION_MODULES.map((module) => (
                <div key={module.key} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-gray-50">
                  <div className="min-w-0 flex-1"><span className="text-sm text-gray-800 truncate">{module.icon} {module.label}</span></div>
                  <button type="button" onClick={() => setPermissionDraft((prev) => ({ ...prev, [module.key]: !prev[module.key] }))} className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${permissionDraft[module.key] ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${permissionDraft[module.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setEditingPermissionsUser(null)} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm text-gray-600 hover:bg-slate-50" disabled={savingPermissions}>Cancel</button>
              <button type="button" onClick={savePermissions} disabled={savingPermissions} className="flex-1 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50">{savingPermissions ? 'Saving...' : 'Save Permissions'}</button>
            </div>
          </div>
        </div>
      )}

      {removeConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Remove user?</h3>
            <p className="text-sm text-slate-600 mb-4">This will permanently delete <strong>{removeConfirm.name || removeConfirm.email}</strong>.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRemoveConfirm(null)} className="text-sm text-slate-500 hover:text-slate-700">Cancel</button>
              <button type="button" onClick={() => handleDelete(removeConfirm)} className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2">Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
