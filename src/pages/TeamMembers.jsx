import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useToast } from '../contexts/ToastContext';
import PageLoader from '../components/PageLoader';
import EmployeeAvatar from '../components/EmployeeAvatar';
import { useAuth } from '../contexts/AuthContext';
import { toDisplayDate } from '../utils';
import { ROLE_LABELS, ROLE_COLORS } from '../utils/roles';

const ROLE_INFO_CARDS = [
  {
    role: 'HR Manager',
    badgeClass: 'bg-green-100 text-green-700',
    desc: 'Full HR access — employees, leave, docs, assets, audits',
  },
  {
    role: 'Manager',
    badgeClass: 'bg-amber-100 text-amber-700',
    desc: 'Team leave and attendance only',
  },
  {
    role: 'IT Manager',
    badgeClass: 'bg-[#C5E8E8] text-[#1B6B6B]',
    desc: 'View employees, manage assets',
  },
  {
    role: 'Audit Manager',
    badgeClass: 'bg-blue-100 text-blue-700',
    desc: 'Audit module — scoped internal/external audits',
  },
  {
    role: 'Auditor',
    badgeClass: 'bg-teal-100 text-teal-700',
    desc: 'Fill assigned audits and submit for review',
  },
];

const TEAM_MEMBER_ROLES = ['hrmanager', 'manager', 'itmanager', 'auditmanager', 'auditor'];

const DEFAULT_PERMISSIONS = {
  hrmanager: {
    employees: true,
    leave: true,
    calendar: true,
    documents: true,
    policies: true,
    assets: true,
    reports: true,
    audit: false,
    team: true,
    orgchart: true,
    settings: true,
    onboarding: true,
    offboarding: true,
  },
  manager: {
    employees: false,
    leave: true,
    calendar: true,
    documents: false,
    policies: false,
    assets: false,
    reports: true,
    audit: false,
    team: false,
    orgchart: true,
    settings: false,
    onboarding: false,
    offboarding: false,
  },
  itmanager: {
    employees: false,
    leave: false,
    calendar: true,
    documents: false,
    policies: false,
    assets: true,
    reports: true,
    audit: false,
    team: false,
    orgchart: false,
    settings: false,
    onboarding: false,
    offboarding: false,
  },
  auditmanager: {
    employees: false,
    leave: false,
    calendar: false,
    documents: false,
    policies: false,
    assets: false,
    reports: false,
    audit: true,
    team: false,
    orgchart: false,
    settings: false,
    onboarding: false,
    offboarding: false,
  },
  auditor: {
    employees: false,
    leave: false,
    calendar: false,
    documents: false,
    policies: false,
    assets: false,
    reports: false,
    audit: true,
    team: false,
    orgchart: false,
    settings: false,
    onboarding: false,
    offboarding: false,
  },
};

const ALL_PERMISSIONS = [
  { key: 'employees', label: 'Employees', icon: '🧑‍💼' },
  { key: 'leave', label: 'Leave', icon: '🏖️' },
  { key: 'calendar', label: 'Calendar', icon: '📅' },
  { key: 'documents', label: 'Documents', icon: '📄' },
  { key: 'policies', label: 'Library', icon: '📚' },
  { key: 'assets', label: 'Assets', icon: '💻' },
  { key: 'reports', label: 'Reports', icon: '📈' },
  { key: 'audit', label: 'Audit', icon: '🔍' },
  { key: 'team', label: 'Team Members', icon: '👥' },
  { key: 'orgchart', label: 'Org Chart', icon: '🌐' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
  { key: 'onboarding', label: 'Onboarding', icon: '🎉' },
  { key: 'offboarding', label: 'Offboarding', icon: '📤' },
];

function availableRolesToAdd(viewerRole) {
  if (viewerRole === 'admin') return TEAM_MEMBER_ROLES;
  if (viewerRole === 'hrmanager') return TEAM_MEMBER_ROLES.filter((r) => r !== 'hrmanager');
  return [];
}

function roleBadge(role) {
  const cls = ROLE_COLORS[role] || 'bg-slate-100 text-slate-700';
  const label = ROLE_LABELS[role] || role;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

function canHrActOnTarget(viewerRole, targetRole) {
  if (viewerRole !== 'hrmanager') return false;
  if (targetRole === 'hrmanager' || targetRole === 'admin') return false;
  return ['manager', 'itmanager', 'auditmanager', 'auditor'].includes(targetRole);
}

export default function TeamMembers() {
  const { companyId } = useParams();
  const { success, error: showError } = useToast();
  const { currentUser, role: userRole } = useAuth();

  const [members, setMembers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [empPickerSearch, setEmpPickerSearch] = useState('');
  const [grantEmail, setGrantEmail] = useState('');
  const [grantRole, setGrantRole] = useState('');
  const [grantAuditScope, setGrantAuditScope] = useState('both');
  const [saving, setSaving] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [changeRoleFor, setChangeRoleFor] = useState(null);
  const [newRoleValue, setNewRoleValue] = useState('');
  const [changeRoleAuditScope, setChangeRoleAuditScope] = useState('both');
  const [menuOpenForId, setMenuOpenForId] = useState(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [permissionsTarget, setPermissionsTarget] = useState(null);
  const [permissionsForm, setPermissionsForm] = useState({});
  const [savingPerms, setSavingPerms] = useState(false);
  const actionsMenuRef = useRef(null);

  const canAddManagers = userRole === 'admin' || userRole === 'hrmanager';
  const roleOptions = availableRolesToAdd(userRole);

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [usersSnap, empSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('companyId', '==', companyId))),
        getDocs(collection(db, 'companies', companyId, 'employees')),
      ]);
      const emps = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const usersList = usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.role !== 'admin');
      const merged = usersList.map((u) => {
        const emp =
          emps.find((e) => e.id === u.linkedEmployeeId) ||
          emps.find((e) => (e.email || '').toLowerCase().trim() === (u.email || '').toLowerCase().trim());
        return { ...u, _emp: emp };
      });
      setMembers(merged);
      setEmployees(emps);
    } catch {
      showError('Failed to load team members');
    }
    setLoading(false);
  }, [companyId, showError]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      fetchData();
    });
    return () => cancelAnimationFrame(id);
  }, [fetchData]);

  useEffect(() => {
    if (!menuOpenForId) return;
    const close = (e) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target)) {
        setMenuOpenForId(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpenForId]);

  const employeesWithoutAccess = useMemo(() => {
    return employees.filter((emp) => {
      const em = (emp.email || '').toLowerCase().trim();
      const linked = members.some((m) => m.linkedEmployeeId === emp.id);
      const byEmail = em && members.some((m) => (m.email || '').toLowerCase().trim() === em);
      return !linked && !byEmail;
    });
  }, [employees, members]);

  const formatLastLogin = (v) => {
    if (!v) return 'Never';
    try {
      return toDisplayDate(v);
    } catch {
      return '—';
    }
  };

  const handleGrantAccess = async () => {
    if (!selectedEmployee || !grantEmail.trim() || !grantRole) {
      showError('Please fill all fields');
      return;
    }
    const email = grantEmail.trim().toLowerCase();
    const auditScope = grantRole === 'auditmanager' ? grantAuditScope || 'both' : null;
    setSaving(true);
    try {
      const userRef = doc(db, 'users', email);
      const existingSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
      let userDocId = email;

      if (!existingSnap.empty) {
        const udoc = existingSnap.docs[0];
        userDocId = udoc.id;
        await updateDoc(doc(db, 'users', userDocId), {
          companyId,
          role: grantRole,
          auditScope,
          isActive: true,
          name: selectedEmployee.fullName,
          linkedEmployeeId: selectedEmployee.id,
        });
      } else {
        await setDoc(userRef, {
          email,
          name: selectedEmployee.fullName,
          role: grantRole,
          auditScope,
          companyId,
          linkedEmployeeId: selectedEmployee.id,
          isActive: true,
          photoURL: '',
          createdAt: serverTimestamp(),
          addedBy: currentUser?.email || '',
        });
      }

      await addDoc(collection(db, 'companies', companyId, 'teamMembers'), {
        userId: userDocId,
        email,
        name: selectedEmployee.fullName,
        role: grantRole,
        employeeId: selectedEmployee.id,
        empId: selectedEmployee.empId || '',
        department: selectedEmployee.department || '',
        isActive: true,
        addedAt: serverTimestamp(),
        addedBy: currentUser?.email || '',
      });

      success(`Access granted to ${selectedEmployee.fullName} as ${ROLE_LABELS[grantRole]}`);
      setShowAddModal(false);
      setSelectedEmployee(null);
      setGrantEmail('');
      setGrantRole('');
      setGrantAuditScope('both');
      setShowEmpPicker(false);
      await fetchData();
    } catch {
      showError('Failed to grant access');
    }
    setSaving(false);
  };

  const findTeamMemberDocId = async (email) => {
    const snap = await getDocs(collection(db, 'companies', companyId, 'teamMembers'));
    const e = (email || '').toLowerCase().trim();
    const found = snap.docs.find((d) => (d.data().email || '').toLowerCase().trim() === e);
    return found?.id || null;
  };

  const handleDeactivateMember = async (member) => {
    try {
      const tmId = await findTeamMemberDocId(member.email);
      if (tmId) {
        await updateDoc(doc(db, 'companies', companyId, 'teamMembers', tmId), { isActive: false });
      }
      await updateDoc(doc(db, 'users', member.id), { isActive: false });
      success('Member deactivated');
      await fetchData();
    } catch {
      showError('Failed to deactivate');
    }
  };

  const handleActivateMember = async (member) => {
    try {
      const tmId = await findTeamMemberDocId(member.email);
      if (tmId) {
        await updateDoc(doc(db, 'companies', companyId, 'teamMembers', tmId), { isActive: true });
      }
      await updateDoc(doc(db, 'users', member.id), { isActive: true });
      success('Member activated');
      await fetchData();
    } catch {
      showError('Failed to activate');
    }
  };

  const handleRemoveMember = async (member) => {
    try {
      const tmId = await findTeamMemberDocId(member.email);
      if (tmId) {
        await deleteDoc(doc(db, 'companies', companyId, 'teamMembers', tmId));
      }
      await updateDoc(doc(db, 'users', member.id), { isActive: false, companyId: null });
      success('Access removed');
      setRemoveConfirm(null);
      await fetchData();
    } catch {
      showError('Failed to remove access');
    }
  };

  const handleChangeRole = async () => {
    if (!changeRoleFor || !newRoleValue) return;
    const auditScope = newRoleValue === 'auditmanager' ? changeRoleAuditScope || 'both' : null;
    try {
      await updateDoc(doc(db, 'users', changeRoleFor.id), { role: newRoleValue, auditScope });
      const tmId = await findTeamMemberDocId(changeRoleFor.email);
      if (tmId) {
        await updateDoc(doc(db, 'companies', companyId, 'teamMembers', tmId), { role: newRoleValue });
      }
      success('Role updated');
      setChangeRoleFor(null);
      setNewRoleValue('');
      await fetchData();
    } catch {
      showError('Failed to change role');
    }
  };

  const handleSavePermissions = async () => {
    if (!permissionsTarget) return;
    try {
      setSavingPerms(true);
      const tmId = await findTeamMemberDocId(permissionsTarget.email);
      if (tmId) {
        await updateDoc(doc(db, 'companies', companyId, 'teamMembers', tmId), {
          permissions: permissionsForm,
          updatedAt: new Date(),
        });
      }
      await updateDoc(doc(db, 'users', permissionsTarget.id), { permissions: permissionsForm }).catch(() => {});
      success(
        `Permissions updated for ${permissionsTarget.name || permissionsTarget.email || 'member'}`,
      );
      setShowPermissions(false);
      setPermissionsTarget(null);
      await fetchData();
    } catch (e) {
      showError('Failed: ' + (e?.message || String(e)));
    } finally {
      setSavingPerms(false);
    }
  };

  const showActions = (m) => {
    if (userRole === 'admin') return m.role !== 'admin';
    if (userRole === 'hrmanager') return canHrActOnTarget(userRole, m.role);
    return false;
  };

  const openAddModal = () => {
    setSelectedEmployee(null);
    setGrantEmail('');
    setGrantRole(roleOptions[0] || '');
    setShowEmpPicker(false);
    setEmpPickerSearch('');
    setShowAddModal(true);
  };

  if (!companyId) return null;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Team Members</h1>
          <p className="text-sm text-gray-500">Employees with AttendX login access</p>
        </div>
        {canAddManagers && (
          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2 bg-[#1B6B6B] text-white rounded-lg text-sm font-medium hover:bg-[#155858]"
          >
            + Grant Access
          </button>
        )}
      </div>

      <div className="bg-[#E8F5F5] border border-[#E8F5F5] rounded-xl p-4 mb-6">
        <p className="text-sm font-medium text-[#0F4444] mb-2">About Team Access</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROLE_INFO_CARDS.map((r) => (
            <div key={r.role} className="flex items-start gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 shrink-0 ${r.badgeClass}`}>{r.role}</span>
              <span className="text-xs text-[#0F4444]">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Employee</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Last Login</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const emp = m._emp;
                const active = m.isActive !== false;
                return (
                  <tr key={m.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <EmployeeAvatar
                          employee={{
                            fullName: m.name || emp?.fullName || m.email,
                            photoURL: m.photoURL || emp?.photoURL,
                          }}
                          size="md"
                        />
                        <div>
                          <p className="font-medium text-slate-800">{m.name || emp?.fullName || '—'}</p>
                          <p className="text-xs text-gray-400">
                            {emp?.empId || '—'} · {emp?.department || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{roleBadge(m.role)}</td>
                    <td className="px-4 py-3 text-slate-700">{m.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          active ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatLastLogin(m.lastLogin)}</td>
                    <td className="px-4 py-3">
                      {showActions(m) ? (
                        <div
                          className="relative inline-block"
                          ref={(node) => {
                            if (menuOpenForId === m.id) {
                              actionsMenuRef.current = node;
                            } else if (actionsMenuRef.current === node) {
                              actionsMenuRef.current = null;
                            }
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenForId((id) => (id === m.id ? null : m.id));
                            }}
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-lg leading-none"
                            aria-label="More actions"
                          >
                            ⋯
                          </button>
                          {menuOpenForId === m.id && (
                            <div className="absolute right-0 top-full mt-1 z-50 min-w-[11rem] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                              {active ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuOpenForId(null);
                                    handleDeactivateMember(m);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-amber-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuOpenForId(null);
                                    handleActivateMember(m);
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-green-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                  Activate
                                </button>
                              )}
                              {userRole === 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuOpenForId(null);
                                    setChangeRoleFor(m);
                                    setNewRoleValue(m.role);
                                    setChangeRoleAuditScope(m.auditScope || 'both');
                                  }}
                                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                  ✏️ Edit
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setPermissionsTarget(m);
                                  setPermissionsForm({
                                    ...(DEFAULT_PERMISSIONS[m.role] || {}),
                                    ...(m.permissions || {}),
                                  });
                                  setShowPermissions(true);
                                  setMenuOpenForId(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                🔑 Permissions
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuOpenForId(null);
                                  setRemoveConfirm(m);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-gray-50 flex items-center gap-2"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                    No team members with login for this company yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 my-8 max-h-[90vh] overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-800">Grant AttendX Access</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">Select an employee to give them login access to this company</p>

            <div className="relative mb-4">
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowEmpPicker(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setShowEmpPicker(true);
                }}
                className="w-full border rounded-xl px-3 py-2.5 cursor-pointer flex items-center justify-between hover:border-[#4ECDC4]"
              >
                {selectedEmployee ? (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#C5E8E8] flex items-center justify-center text-sm font-medium text-[#1B6B6B]">
                      {selectedEmployee.fullName?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{selectedEmployee.fullName}</p>
                      <p className="text-xs text-gray-400">
                        {selectedEmployee.empId} · {selectedEmployee.department}
                      </p>
                    </div>
                  </div>
                ) : (
                  <span className="text-gray-400 text-sm">Select an employee...</span>
                )}
                <span className="text-gray-400">▾</span>
              </div>

              {showEmpPicker && (
                <div
                  className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-56 overflow-hidden"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="p-2 border-b">
                    <input
                      autoFocus
                      placeholder="Search employee..."
                      value={empPickerSearch}
                      onChange={(e) => setEmpPickerSearch(e.target.value)}
                      className="w-full text-sm border rounded-lg px-2 py-1.5"
                    />
                  </div>
                  <div className="overflow-y-auto max-h-44">
                    {employeesWithoutAccess
                      .filter(
                        (e) =>
                          !empPickerSearch ||
                          (e.fullName || '').toLowerCase().includes(empPickerSearch.toLowerCase()) ||
                          (e.empId || '').toLowerCase().includes(empPickerSearch.toLowerCase()),
                      )
                      .map((emp) => (
                        <div
                          key={emp.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedEmployee(emp);
                            setShowEmpPicker(false);
                            setEmpPickerSearch('');
                            setGrantEmail((emp.email || '').trim());
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setSelectedEmployee(emp);
                              setShowEmpPicker(false);
                              setEmpPickerSearch('');
                              setGrantEmail((emp.email || '').trim());
                            }
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer border-b last:border-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#C5E8E8] flex items-center justify-center text-sm font-medium text-[#1B6B6B]">
                            {emp.fullName?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{emp.fullName}</p>
                            <p className="text-xs text-gray-400">
                              {emp.empId} · {emp.department} · {emp.designation}
                            </p>
                          </div>
                        </div>
                      ))}
                    {employeesWithoutAccess.length === 0 && (
                      <p className="text-center py-4 text-sm text-gray-400">All employees already have access</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 block mb-1">Gmail address for login</label>
              <input
                type="email"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder="employee@gmail.com"
                className="w-full border rounded-xl px-3 py-2.5 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">They will use this Gmail to sign into AttendX</p>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium text-gray-700 block mb-2">Assign role</label>
              <div className="grid grid-cols-1 gap-2">
                {roleOptions.map((role) => (
                  <div
                    key={role}
                    role="button"
                    tabIndex={0}
                    onClick={() => setGrantRole(role)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setGrantRole(role);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      grantRole === role ? 'border-[#4ECDC4] bg-[#E8F5F5]' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                        role === 'hrmanager'
                          ? 'bg-green-100 text-green-700'
                          : role === 'manager'
                            ? 'bg-amber-100 text-amber-700'
                            : role === 'auditmanager'
                              ? 'bg-blue-100 text-blue-700'
                              : role === 'auditor'
                                ? 'bg-teal-100 text-teal-700'
                                : 'bg-[#C5E8E8] text-[#1B6B6B]'
                      }`}
                    >
                      {(ROLE_LABELS[role] || role).charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{ROLE_LABELS[role]}</p>
                      <p className="text-xs text-gray-400">
                        {role === 'hrmanager'
                          ? 'Full HR access — employees, leave, docs, assets, audits'
                          : role === 'manager'
                            ? 'Team leave and attendance only'
                            : role === 'auditmanager'
                              ? 'Manage audits by scope (internal / external / both)'
                              : role === 'auditor'
                                ? 'Complete assigned audit checklists'
                                : 'View employees, manage assets'}
                      </p>
                    </div>
                    {grantRole === role && <span className="text-[#4ECDC4] text-lg">✓</span>}
                  </div>
                ))}
              </div>
            </div>

            {grantRole === 'auditmanager' && (
              <div className="mb-4">
                <label className="text-xs text-gray-500 block mb-1.5">Audit Scope</label>
                <select
                  value={grantAuditScope}
                  onChange={(e) => setGrantAuditScope(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="internal">🏢 Internal Audits Only</option>
                  <option value="external">🌐 External Audits Only</option>
                  <option value="both">🔄 Both Internal &amp; External</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Which audits this manager can see and manage</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="text-sm text-slate-500" disabled={saving}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGrantAccess}
                disabled={saving}
                className="px-4 py-2 bg-[#1B6B6B] text-white rounded-lg text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Grant Access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {removeConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Remove access?</h3>
            <p className="text-sm text-slate-600 mb-4">
              Remove {removeConfirm.name || removeConfirm.email}&apos;s access? They will no longer be able to log in.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setRemoveConfirm(null)} className="text-slate-500 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRemoveMember(removeConfirm)}
                className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {changeRoleFor && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Change role</h3>
            <select
              value={newRoleValue}
              onChange={(e) => setNewRoleValue(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
            >
              {TEAM_MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            {newRoleValue === 'auditmanager' && (
              <div className="mb-4">
                <label className="text-xs text-gray-500 block mb-1.5">Audit Scope</label>
                <select
                  value={changeRoleAuditScope}
                  onChange={(e) => setChangeRoleAuditScope(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="internal">🏢 Internal Audits Only</option>
                  <option value="external">🌐 External Audits Only</option>
                  <option value="both">🔄 Both Internal &amp; External</option>
                </select>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setChangeRoleFor(null)} className="text-slate-500 text-sm">
                Cancel
              </button>
              <button type="button" onClick={handleChangeRole} className="rounded-lg bg-[#1B6B6B] text-white text-sm font-medium px-4 py-2">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showPermissions && permissionsTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white font-bold text-base flex-shrink-0">
                    {(permissionsTarget.name || permissionsTarget.email)?.charAt(0)?.toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-800">Permissions</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {permissionsTarget.name || permissionsTarget.email}
                      {' · '}
                      {ROLE_LABELS[permissionsTarget.role] || permissionsTarget.role}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPermissions(false);
                    setPermissionsTarget(null);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
                >
                  ✕
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPermissionsForm({ ...(DEFAULT_PERMISSIONS[permissionsTarget.role] || {}) })
                }
                className="mt-3 text-xs text-[#1B6B6B] hover:underline"
              >
                Reset to role defaults
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <p className="text-xs text-gray-400 mb-4">Toggle which sections this user can access in AttendX.</p>
              <div className="space-y-2">
                {ALL_PERMISSIONS.map((perm) => {
                  const isOn = permissionsForm[perm.key] !== false;
                  return (
                    <div
                      key={perm.key}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setPermissionsForm((prev) => ({
                          ...prev,
                          [perm.key]: !isOn,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setPermissionsForm((prev) => ({
                            ...prev,
                            [perm.key]: !isOn,
                          }));
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        isOn
                          ? 'bg-[#E8F5F5] border-[#4ECDC4]'
                          : 'bg-white border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg w-7 text-center">{perm.icon}</span>
                        <span
                          className={`text-sm font-medium ${isOn ? 'text-[#1B6B6B]' : 'text-gray-500'}`}
                        >
                          {perm.label}
                        </span>
                      </div>
                      <div
                        className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative ${
                          isOn ? 'bg-[#1B6B6B]' : 'bg-gray-200'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                            isOn ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2 font-medium">Quick presets</p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const all = {};
                      ALL_PERMISSIONS.forEach((p) => {
                        all[p.key] = true;
                      });
                      setPermissionsForm(all);
                    }}
                    className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100"
                  >
                    ✅ Enable All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const none = {};
                      ALL_PERMISSIONS.forEach((p) => {
                        none[p.key] = false;
                      });
                      setPermissionsForm(none);
                    }}
                    className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100"
                  >
                    ❌ Disable All
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPermissionsForm({ ...(DEFAULT_PERMISSIONS[permissionsTarget.role] || {}) })
                    }
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-100"
                  >
                    🔄 Role Defaults
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowPermissions(false);
                  setPermissionsTarget(null);
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePermissions}
                disabled={savingPerms}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
              >
                {savingPerms ? 'Saving...' : '💾 Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
