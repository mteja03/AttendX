import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { seedData } from '../firebase/seed';
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
  const { currentUser, googleAccessToken } = useAuth();
  const { success, error: showError } = useToast();
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [menuCompanyId, setMenuCompanyId] = useState(null);
  const [menuCompany, setMenuCompany] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
        console.log('Companies snapshot:', snapshot.docs.length, 'companies found');
        console.log('Companies data:', snapshot.docs.map((d) => ({ id: d.id, name: d.data().name })));
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

  // Pending leaves: fetch once; if collectionGroup index not ready, show 0
  useEffect(() => {
    let cancelled = false;
    getDocs(query(collectionGroup(db, 'leave'), where('status', '==', 'Pending')))
      .then((snap) => {
        if (!cancelled) setPendingLeavesCount(snap.size);
      })
      .catch(() => {
        if (!cancelled) setPendingLeavesCount(0);
      });
    return () => { cancelled = true; };
  }, []);

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter(
      (c) =>
        c.name?.toLowerCase().includes(term) ||
        c.industry?.toLowerCase().includes(term) ||
        c.location?.toLowerCase().includes(term) ||
        c.initials?.toLowerCase().includes(term),
    );
  }, [companies, search]);

  const totalCompanies = companies.length;
  const totalEmployees = useMemo(
    () => companies.reduce((sum, c) => sum + (c.employeeCount || 0), 0),
    [companies],
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
    setMenuCompanyId(null);
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

  const handleSeed = async () => {
    try {
      setSeedLoading(true);
      const result = await seedData(currentUser?.email || 'admin');
      if (result.success) {
        success(result.message);
      } else {
        showError(result.message);
      }
    } catch (error) {
      showError(`Seed failed: ${error?.message || error?.code || 'Unknown error'}`);
    } finally {
      setSeedLoading(false);
    }
  };

  const handleDeactivate = async () => {
    const company = deactivateConfirm;
    if (!company) return;
    setDeactivateConfirm(null);
    setMenuCompanyId(null);
    try {
      await updateDoc(doc(db, 'companies', company.id), { isActive: false });
      success('Company deactivated');
    } catch (err) {
      showError('Failed to deactivate');
    }
  };

  const handleActivate = async (company) => {
    setMenuCompanyId(null);
    try {
      await updateDoc(doc(db, 'companies', company.id), { isActive: true });
      success('Company activated');
    } catch (err) {
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
      if (googleAccessToken) {
        for (const fileId of driveFileIds) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await deleteFileFromDrive(googleAccessToken, fileId);
          } catch (e) {
            driveCleanupOk = false;
            // eslint-disable-next-line no-console
            console.warn('Could not delete Drive file:', fileId, e.message);
          }
        }
        try {
          await findAndDeleteFolder(googleAccessToken, companyName, 'AttendX HR Documents');
        } catch (e) {
          driveCleanupOk = false;
          // eslint-disable-next-line no-console
          console.warn('Could not delete Drive folder for company:', companyName, e.message);
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
      setMenuCompanyId(null);

      // Step 5 — Toast based on Drive cleanup status
      if (driveCleanupOk) {
        success('Company and all documents deleted permanently');
      } else if (!googleAccessToken) {
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
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-500 text-sm">Total Companies</p>
              <p className="text-xl font-semibold text-slate-800 mt-1">{totalCompanies}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-500 text-sm">Total Employees</p>
              <p className="text-xl font-semibold text-slate-800 mt-1">{totalEmployees}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-500 text-sm">Platform Users</p>
              <p className="text-xl font-semibold text-slate-800 mt-1">{users.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-slate-500 text-sm">Pending Leaves</p>
              <p className="text-xl font-semibold text-slate-800 mt-1">{pendingLeavesCount}</p>
            </div>
          </>
        )}
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies..."
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
        />
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
              <button
                type="button"
                onClick={handleSeed}
                disabled={seedLoading}
                className="px-6 py-3 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50 mt-4 flex items-center gap-2 mx-auto"
              >
                {seedLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating sample data...
                  </>
                ) : (
                  '🌱 Load sample data'
                )}
              </button>
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
              className={`bg-white rounded-xl border border-slate-200 p-5 flex flex-col relative overflow-visible transition-colors hover:border-[#4ECDC4] ${
                c.isActive === false ? 'opacity-60' : ''
              }`}
            >
              {c.isActive === false && (
                <div className="absolute inset-0 rounded-xl bg-slate-100/50 pointer-events-none" aria-hidden />
              )}
              {c.isActive === false && (
                <span className="absolute top-3 right-12 z-10 inline-flex items-center rounded-full bg-slate-500 px-2.5 py-0.5 text-xs font-medium text-white">
                  Inactive
                </span>
              )}
              <div className="flex items-start justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold text-lg shrink-0"
                    style={{ backgroundColor: c.color || '#1B6B6B' }}
                  >
                    {c.initials || c.name?.slice(0, 2)?.toUpperCase() || '—'}
                  </div>
                  <div>
                    <h2 className="font-medium text-slate-800">{c.name || '—'}</h2>
                    <p className="text-slate-500 text-sm">{c.industry || '—'}</p>
                    <p className="text-slate-500 text-xs">{c.location || '—'}</p>
                  </div>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      if (menuCompanyId === c.id) {
                        setMenuCompanyId(null);
                        setMenuCompany(null);
                        setMenuPosition(null);
                      } else {
                        setMenuCompany(c);
                        setMenuCompanyId(c.id);
                        setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                      }
                    }}
                    className="p-1 rounded text-slate-400 hover:bg-slate-100"
                    aria-label="Menu"
                  >
                    <span className="text-lg leading-none">⋯</span>
                  </button>
                </div>
              </div>
              <div className="mt-2 relative z-10">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {c.employeeCount ?? 0} employee{(c.employeeCount ?? 0) !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="mt-4 flex gap-2 relative z-10">
                <Link
                  to={`/company/${c.id}/dashboard`}
                  className="flex-1 inline-flex items-center justify-center rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium py-2"
                >
                  Manage →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {menuCompany && menuPosition && createPortal(
        <>
          <div
            className="fixed inset-0 z-[90]"
            aria-hidden
            onClick={() => { setMenuCompanyId(null); setMenuCompany(null); setMenuPosition(null); }}
          />
          <div
            className="fixed z-[100] py-1 bg-white border border-slate-200 rounded-lg shadow-xl min-w-[180px]"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            <button
              type="button"
              className="block w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-t-lg"
              onClick={() => { openEdit(menuCompany); setMenuCompanyId(null); setMenuCompany(null); setMenuPosition(null); }}
            >
              Edit Company
            </button>
            {menuCompany.isActive !== false ? (
              <button
                type="button"
                className="block w-full text-left px-3 py-2 text-sm text-amber-600 hover:bg-slate-50"
                onClick={() => { setMenuCompanyId(null); setMenuCompany(null); setMenuPosition(null); setDeactivateConfirm(menuCompany); }}
              >
                Deactivate Company
              </button>
            ) : (
              <button
                type="button"
                className="block w-full text-left px-3 py-2 text-sm text-green-600 hover:bg-slate-50"
                onClick={() => { handleActivate(menuCompany); setMenuCompanyId(null); setMenuCompany(null); setMenuPosition(null); }}
              >
                Activate Company
              </button>
            )}
            <div className="border-t border-slate-200 mt-0.5 pt-0.5">
              <button
                type="button"
                className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-b-lg font-medium"
                onClick={() => { setMenuCompanyId(null); setMenuCompany(null); setMenuPosition(null); setDeleteConfirm(menuCompany); }}
              >
                Delete Company
              </button>
            </div>
          </div>
        </>,
        document.body,
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
