import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { findAndDeleteFolder, deleteFileFromDrive } from '../utils/googleDrive';

const COLOR_PRESETS = [
  { name: 'Teal', value: '#1B6B6B' },
  { name: 'Green', value: '#1D9E75' },
  { name: 'Orange', value: '#D85A30' },
  { name: 'Purple', value: '#534AB7' },
  { name: 'Red', value: '#A32D2D' },
  { name: 'Teal', value: '#BA7517' },
];

const INDUSTRIES = [
  'IT', 'Manufacturing', 'Automobile', 'Retail', 'Finance', 'Healthcare', 'Education',
  'Media', 'Logistics', 'Real Estate', 'Other',
];

function getCount(company) {
  return {
    total: company?.employeeCount || 0,
    active: company?.activeEmployeeCount || 0,
    inactive: company?.inactiveEmployeeCount || 0,
    noticePeriod: company?.noticePeriodCount || 0,
    offboarding: company?.offboardingCount || 0,
  };
}

function CompanyMenu({ company, onEdit, onDelete, onDeactivate, onActivate }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const items = [
    {
      icon: '📊',
      label: 'View Dashboard',
      action: () => navigate(`/company/${company.id}/dashboard`),
    },
    {
      icon: '👥',
      label: 'View Employees',
      action: () => navigate(`/company/${company.id}/employees`),
    },
    {
      icon: '✏️',
      label: 'Edit Company',
      action: () => {
        onEdit();
      },
    },
    {
      icon: '📋',
      label: 'View Reports',
      action: () => navigate(`/company/${company.id}/reports`),
    },
  ];
  if (company.isActive !== false) {
    items.push({
      icon: '⏸️',
      label: 'Deactivate Company',
      action: () => onDeactivate(),
    });
  } else {
    items.push({
      icon: '▶️',
      label: 'Activate Company',
      action: () => onActivate(),
    });
  }
  items.push(null);
  items.push({
    icon: '🗑️',
    label: 'Delete Company',
    action: () => onDelete(),
    danger: true,
  });

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
        aria-label="Company menu"
        aria-expanded={open}
      >
        ···
      </button>
      {open && (
        <div className="absolute right-0 top-8 bg-white border border-gray-100 rounded-xl shadow-xl z-50 w-48 overflow-hidden">
          {items.map((item, i) =>
            item === null ? (
              <div key={`sep-${company.id}-${i}`} className="border-t border-gray-100" />
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.action();
                }}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition-colors ${
                  item.danger ? 'text-red-500 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-24 mb-2" />
      <div className="h-7 bg-slate-200 rounded w-12" />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-slate-200" />
          <div>
            <div className="h-4 bg-slate-200 rounded w-32 mb-2" />
            <div className="h-3 bg-slate-200 rounded w-24 mb-1" />
            <div className="h-3 bg-slate-200 rounded w-20" />
          </div>
        </div>
      </div>
      <div className="h-4 bg-slate-200 rounded w-20 mt-3" />
      <div className="h-9 bg-slate-200 rounded mt-4" />
    </div>
  );
}

export default function Companies() {
  const navigate = useNavigate();
  const { currentUser, getValidToken, role: userRole } = useAuth();
  const { success, error: showError } = useToast();
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [industryFilter, setIndustryFilter] = useState('');
  const [deactivateConfirm, setDeactivateConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorLogs, setErrorLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    initials: '',
    color: COLOR_PRESETS[0].value,
    industry: '',
    location: '',
  });

  // Real-time listener: companies with orderBy (fires immediately, updates on change, cleans up on unmount)
  useEffect(() => {
    const q = query(
      collection(db, 'companies'),
      orderBy('createdAt', 'desc'),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const companiesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setCompanies(companiesData);
        setLoading(false);
      },
      (error) => {
        console.error('Companies listener error:', error);
        setLoading(false);
        showError('Failed to load companies');
      },
    );
    return () => unsubscribe();
  }, [showError]);

  // Platform users: fetch once on mount
  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, 'users'))
      .then((snap) => {
        if (!cancelled) setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch((err) => {
        if (!cancelled) console.error('[Companies] users fetch error', err);
      });
    return () => { cancelled = true; };
  }, []);

  const uniqueIndustries = useMemo(
    () => [...new Set(companies.map((c) => c.industry).filter(Boolean))],
    [companies],
  );

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter((c) => {
      const matchSearch =
        !term ||
        c.name?.toLowerCase().includes(term) ||
        c.industry?.toLowerCase().includes(term) ||
        c.location?.toLowerCase().includes(term) ||
        c.initials?.toLowerCase().includes(term);
      const matchIndustry = !industryFilter || c.industry === industryFilter;
      return matchSearch && matchIndustry;
    });
  }, [companies, search, industryFilter]);

  const totalActive = useMemo(
    () => companies.reduce((sum, c) => sum + (c.activeEmployeeCount || 0), 0),
    [companies],
  );

  const totalEmployeesAgg = useMemo(
    () => companies.reduce((sum, c) => sum + (c.employeeCount || 0), 0),
    [companies],
  );

  const companiesWithEmployees = useMemo(
    () => companies.filter((c) => (c.employeeCount || 0) > 0).length,
    [companies],
  );

  const platformUsersActive = useMemo(
    () => users.filter((u) => u.isActive !== false).length,
    [users],
  );

  const adminStats = useMemo(
    () => [
      {
        label: 'Total Companies',
        value: companies.length,
        icon: '🏢',
        sub: `${companiesWithEmployees} with employees`,
      },
      {
        label: 'Total Employees',
        value: totalEmployeesAgg,
        icon: '👥',
        sub: `${totalActive} active`,
      },
      {
        label: 'Platform Users',
        value: users.length,
        icon: '👤',
        sub: `${platformUsersActive} active`,
      },
      {
        label: 'Active Companies',
        value: companiesWithEmployees,
        icon: '✅',
        sub: `${companies.length - companiesWithEmployees} empty`,
      },
    ],
    [
      companies,
      companiesWithEmployees,
      totalEmployeesAgg,
      totalActive,
      platformUsersActive,
      users.length,
    ],
  );

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === 'name' && value.length >= 2 && !editingCompany) {
      setForm((prev) => ({
        ...prev,
        initials: value.slice(0, 2).toUpperCase(),
      }));
    }
  };

  const openEdit = (company) => {
    setEditingCompany(company);
    setForm({
      name: company.name || '',
      initials: company.initials || company.name?.slice(0, 2)?.toUpperCase() || '',
      color: company.color || COLOR_PRESETS[0].value,
      industry: company.industry || '',
      location: company.location || '',
    });
  };

  const closeModal = () => {
    setShowAddModal(false);
    setEditingCompany(null);
    setForm({ name: '', initials: '', color: COLOR_PRESETS[0].value, industry: '', location: '' });
  };

  const handleSubmitCompany = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const initials = (form.initials || name.slice(0, 2)).toUpperCase().slice(0, 2);
    const payload = {
      name,
      initials,
      color: form.color,
      industry: form.industry.trim(),
      location: form.location.trim(),
      employeeCount: editingCompany ? editingCompany.employeeCount : 0,
      isActive: editingCompany ? editingCompany.isActive !== false : true,
      createdBy: currentUser?.uid || currentUser?.email || '',
    };
    setSaving(true);
    try {
      if (editingCompany) {
        await updateDoc(doc(db, 'companies', editingCompany.id), {
          name: payload.name,
          initials: payload.initials,
          color: payload.color,
          industry: payload.industry,
          location: payload.location,
        });
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === editingCompany.id
              ? { ...c, ...payload, employeeCount: c.employeeCount }
              : c,
          ),
        );
        success('Company updated');
      } else {
        const ref = doc(collection(db, 'companies'));
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        success('Company added');
        // onSnapshot listener will update companies list automatically
      }
      closeModal();
    } catch (err) {
      console.error(err);
      showError(editingCompany ? 'Failed to update company' : 'Failed to add company');
    }
    setSaving(false);
  };

  const handleDeactivate = async () => {
    const company = deactivateConfirm;
    if (!company) return;
    setDeactivateConfirm(null);
    try {
      await updateDoc(doc(db, 'companies', company.id), { isActive: false });
      success('Company deactivated');
    } catch {
      showError('Failed to deactivate');
    }
  };

  const handleActivate = async (company) => {
    try {
      await updateDoc(doc(db, 'companies', company.id), { isActive: true });
      success('Company activated');
    } catch {
      showError('Failed to activate');
    }
  };

  async function deleteSubcollection(companyId, subcollectionName) {
    const snap = await getDocs(collection(db, 'companies', companyId, subcollectionName));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }

  const handleDelete = async () => {
    const company = deleteConfirm;
    if (!company) return;
    setDeleting(true);
    const companyId = company.id;
    const companyName = company.name || 'Company';
    let driveCleanupOk = true;
    let driveToken = null;

    try {
      // Step 1 — Collect all Drive file IDs from all employees
      const employeesSnap = await getDocs(collection(db, 'companies', companyId, 'employees'));
      const driveFileIds = [];
      employeesSnap.docs.forEach((empDoc) => {
        const data = empDoc.data();
        const docs = data.documents || [];
        docs.forEach((d) => {
          if (d.fileId) driveFileIds.push(d.fileId);
        });
      });

      // Step 2 & 3 — Delete all Drive files and company folder
      driveToken = await getValidToken();
      if (driveToken) {
        for (const fileId of driveFileIds) {
          try {
            await deleteFileFromDrive(driveToken, fileId);
          } catch {
            driveCleanupOk = false;
          }
        }
        try {
          await findAndDeleteFolder(driveToken, companyName, 'AttendX HR Documents');
        } catch {
          driveCleanupOk = false;
        }
      } else {
        driveCleanupOk = false;
      }

      // Step 4 — Delete Firestore data (existing logic)
      await deleteSubcollection(companyId, 'attendance');
      await deleteSubcollection(companyId, 'leave');
      await deleteSubcollection(companyId, 'employees');
      await deleteSubcollection(companyId, 'teamMembers');
      await deleteDoc(doc(db, 'companies', companyId));

      const usersSnap = await getDocs(collection(db, 'users'));
      await Promise.all(
        usersSnap.docs
          .filter((d) => d.data().companyId === companyId)
          .map((d) => updateDoc(doc(db, 'users', d.id), { companyId: null })),
      );

      setDeleteConfirm(null);

      // Step 5 — Toast based on Drive cleanup status
      if (driveCleanupOk) {
        success('Company and all documents deleted permanently');
      } else if (!driveToken) {
        showError(
          'Company deleted. Please manually remove the company folder from Google Drive (Google Drive access token not available).',
        );
      } else {
        showError(
          `Company deleted. Please manually remove the ${companyName} folder from Google Drive.`,
        );
      }
    } catch (err) {
      console.error(err);
      showError('Failed to delete company');
    }
    setDeleting(false);
  };

  const fetchErrorLogs = async () => {
    try {
      setLogsLoading(true);
      const logsSnap = await getDocs(
        query(collection(db, 'errorLogs'), orderBy('timestamp', 'desc'), limit(50)),
      );
      setErrorLogs(logsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/logo/icon.png"
            alt=""
            className="w-10 h-10 rounded-xl object-cover shrink-0"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-800">All Companies</h1>
            <p className="text-slate-500 text-sm mt-1">Manage companies on the platform.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setEditingCompany(null); setShowAddModal(true); setForm({ name: '', initials: '', color: COLOR_PRESETS[0].value, industry: '', location: '' }); }}
          className="inline-flex items-center justify-center rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2"
        >
          Add Company
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          [...Array(4)].map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            {adminStats.map((stat) => (
              <div key={stat.label} className="bg-white border border-gray-100 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <span className="text-xl">{stat.icon}</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                {stat.sub && <p className="text-xs text-gray-400 mt-1">{stat.sub}</p>}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies..."
          className="w-full max-w-md rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
        />
        <select
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
          className="border rounded-xl px-3 py-2 text-sm text-gray-600 min-w-[10rem]"
        >
          <option value="">All Industries</option>
          {uniqueIndustries.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          {companies.length === 0 ? (
            <>
              <p className="font-medium text-slate-700">No companies yet.</p>
              <p className="text-sm mt-1">Add your first company to get started.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="text-[#1B6B6B] text-sm font-medium hover:underline"
                >
                  Add your first company
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-700">No companies match your search.</p>
              <p className="text-sm mt-1">Try a different search term or clear the filter.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-visible">
          {filteredCompanies.map((c) => (
            <div
              key={c.id}
              className={`bg-white border border-gray-100 rounded-2xl p-5 hover:border-[#4ECDC4] hover:shadow-sm transition-all flex flex-col relative ${
                c.isActive === false ? 'opacity-60' : ''
              }`}
            >
              {c.isActive === false && (
                <div className="absolute inset-0 rounded-2xl bg-slate-100/50 pointer-events-none" aria-hidden />
              )}
              {c.isActive === false && (
                <span className="absolute top-3 right-12 z-10 inline-flex items-center rounded-full bg-slate-500 px-2.5 py-0.5 text-xs font-medium text-white">
                  Inactive
                </span>
              )}
              <div className="flex items-start justify-between mb-3 relative z-50">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background: c.color || '#1B6B6B' }}
                  >
                    {c.initials || c.name?.slice(0, 2)?.toUpperCase() || '—'}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-800 truncate">{c.name || '—'}</h3>
                    <p className="text-xs text-gray-400">
                      {c.industry || 'Company'}
                      {c.location ? ` · ${c.location}` : ''}
                    </p>
                  </div>
                </div>
                <CompanyMenu
                  company={c}
                  onEdit={() => openEdit(c)}
                  onDelete={() => setDeleteConfirm(c)}
                  onDeactivate={() => setDeactivateConfirm(c)}
                  onActivate={() => handleActivate(c)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 py-3 border-t border-b border-gray-50 mb-3 relative z-10">
                <>
                  {getCount(c).active > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs text-gray-600 font-medium">{getCount(c).active} active</span>
                    </div>
                  )}
                  {getCount(c).noticePeriod > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-xs text-gray-500">{getCount(c).noticePeriod} notice</span>
                    </div>
                  )}
                  {getCount(c).offboarding > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      <span className="text-xs text-gray-500">{getCount(c).offboarding} offboarding</span>
                    </div>
                  )}
                  {getCount(c).total === 0 && (
                    <span className="text-xs text-gray-400">No employees yet</span>
                  )}
                </>
              </div>

              <button
                type="button"
                onClick={() => navigate(`/company/${c.id}/dashboard`)}
                className="w-full py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] transition-colors"
              >
                Manage Company →
              </button>
            </div>
          ))}
        </div>
      )}

      {userRole === 'admin' && (
        <div className="mt-8">
          <button
            onClick={() => {
              setShowLogs(!showLogs);
              if (!showLogs) fetchErrorLogs();
            }}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600"
          >
            🔧 {showLogs ? 'Hide' : 'View'} Error Logs
            {errorLogs.length > 0 && (
              <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">
                {errorLogs.length}
              </span>
            )}
          </button>

          {showLogs && (
            <div className="mt-4 bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Recent Error Logs (last 50)</h3>
                <button onClick={fetchErrorLogs} className="text-xs text-[#1B6B6B] hover:underline">
                  Refresh
                </button>
              </div>

              {logsLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
              ) : errorLogs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No errors logged</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        {['Time', 'User', 'Page', 'Action', 'Error', 'Code'].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 font-semibold text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {errorLogs.map((log, i) => (
                        <tr key={log.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('en-IN') : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-gray-700">{log.context?.userEmail?.split('@')[0] || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500 max-w-32 truncate">{log.context?.page || '—'}</td>
                          <td className="px-4 py-2.5 text-gray-500">{log.context?.action || '—'}</td>
                          <td className="px-4 py-2.5 text-red-600 max-w-48 truncate" title={log.errorMessage}>
                            {log.errorMessage?.substring(0, 60) || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-gray-400">{log.errorCode || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(showAddModal || editingCompany) && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              {editingCompany ? 'Edit Company' : 'Add Company'}
            </h2>
            <form onSubmit={handleSubmitCompany} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
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
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Initials (2 chars)
                </label>
                <input
                  type="text"
                  name="initials"
                  value={form.initials}
                  onChange={handleFormChange}
                  maxLength={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4] uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, color: preset.value }))}
                      className={`h-8 w-8 rounded-lg border-2 ${
                        form.color === preset.value ? 'border-slate-800' : 'border-slate-200'
                      }`}
                      style={{ backgroundColor: preset.value }}
                      title={preset.name}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Industry</label>
                <select
                  name="industry"
                  value={form.industry}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
                >
                  <option value="">— Select —</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                <input
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deactivateConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Deactivate company?</h3>
            <p className="text-sm text-slate-600 mb-4">
              Deactivating will prevent team members from accessing this company. Continue?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeactivateConfirm(null)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Delete {deleteConfirm.name || 'this company'}?
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              This will permanently delete:
              <br />
              • All employee records ({deleteConfirm.employeeCount ?? 0} employees)
              <br />
              • All leave and attendance data
              <br />
              • All documents from Google Drive
              <br />
              <br />
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => !deleting && setDeleteConfirm(null)}
                className="text-sm text-slate-500 hover:text-slate-700"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
              >
                {deleting ? 'Deleting company data and Drive files...' : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
