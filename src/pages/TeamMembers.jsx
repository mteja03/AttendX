import { useEffect, useMemo, useState, useCallback } from 'react';
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
import { useAuth } from '../contexts/AuthContext';
import { toDisplayDate } from '../utils';
import { ROLE_LABELS, ROLE_COLORS } from '../utils/roles';

const ROLE_INFO_CARDS = [
  {
    role: 'HR Manager',
    badgeClass: 'bg-green-100 text-green-700',
    desc: 'Full HR access — employees, leave, docs, assets',
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
];

function availableRolesToAdd(viewerRole) {
  if (viewerRole === 'admin') return ['hrmanager', 'manager', 'itmanager'];
  if (viewerRole === 'hrmanager') return ['manager', 'itmanager'];
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
  return targetRole === 'manager' || targetRole === 'itmanager';
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
  const [saving, setSaving] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [changeRoleFor, setChangeRoleFor] = useState(null);
  const [newRoleValue, setNewRoleValue] = useState('');

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
          isActive: true,
          name: selectedEmployee.fullName,
          linkedEmployeeId: selectedEmployee.id,
        });
      } else {
        await setDoc(userRef, {
          email,
          name: selectedEmployee.fullName,
          role: grantRole,
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
    try {
      await updateDoc(doc(db, 'users', changeRoleFor.id), { role: newRoleValue });
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
                        <div className="w-9 h-9 rounded-full bg-[#C5E8E8] flex items-center justify-center text-sm font-medium text-[#1B6B6B]">
                          {(m.name || emp?.fullName || m.email || '?').charAt(0).toUpperCase()}
                        </div>
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
                        <div className="flex flex-wrap gap-2">
                          {active ? (
                            <button
                              type="button"
                              onClick={() => handleDeactivateMember(m)}
                              className="text-amber-600 text-xs font-medium hover:underline"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleActivateMember(m)}
                              className="text-green-600 text-xs font-medium hover:underline"
                            >
                              Activate
                            </button>
                          )}
                          {userRole === 'admin' && (
                            <button
                              type="button"
                              onClick={() => {
                                setChangeRoleFor(m);
                                setNewRoleValue(m.role);
                              }}
                              className="text-[#1B6B6B] text-xs font-medium hover:underline"
                            >
                              Change Role
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setRemoveConfirm(m)}
                            className="text-red-600 text-xs font-medium hover:underline"
                          >
                            Remove
                          </button>
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
                            : 'bg-[#C5E8E8] text-[#1B6B6B]'
                      }`}
                    >
                      {(ROLE_LABELS[role] || role).charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{ROLE_LABELS[role]}</p>
                      <p className="text-xs text-gray-400">
                        {role === 'hrmanager'
                          ? 'Full HR access — employees, leave, docs, assets'
                          : role === 'manager'
                            ? 'Team leave and attendance only'
                            : 'View employees, manage assets'}
                      </p>
                    </div>
                    {grantRole === role && <span className="text-[#4ECDC4] text-lg">✓</span>}
                  </div>
                ))}
              </div>
            </div>

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
              {['hrmanager', 'manager', 'itmanager'].map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
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
    </div>
  );
}
