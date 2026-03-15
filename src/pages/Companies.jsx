import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { seedData } from '../firebase/seed';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const COLOR_PRESETS = [
  { name: 'Blue', value: '#378ADD' },
  { name: 'Green', value: '#1D9E75' },
  { name: 'Orange', value: '#D85A30' },
  { name: 'Purple', value: '#534AB7' },
  { name: 'Red', value: '#A32D2D' },
  { name: 'Teal', value: '#BA7517' },
];

const INDUSTRIES = [
  'IT', 'Manufacturing', 'Retail', 'Finance', 'Healthcare', 'Education',
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
  const { currentUser } = useAuth();
  const { success, error: showError } = useToast();
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingLeavesCount, setPendingLeavesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [menuCompanyId, setMenuCompanyId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [form, setForm] = useState({
    name: '',
    initials: '',
    color: COLOR_PRESETS[0].value,
    industry: '',
    location: '',
  });

  // Real-time listener: companies (no filters — show all including inactive for admin)
  useEffect(() => {
    console.log('[Companies] Setting up onSnapshot for collection(db, "companies")');
    const companiesRef = collection(db, 'companies');
    const unsubscribe = onSnapshot(
      companiesRef,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        const sorted = [...docs].sort((a, b) => {
          const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.getTime?.() ?? 0;
          const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.getTime?.() ?? 0;
          return tb - ta;
        });
        console.log('[Companies] onSnapshot received', sorted.length, 'companies', sorted);
        setCompanies(sorted);
      },
      (err) => {
        console.error('[Companies] onSnapshot error', err);
        showError('Failed to load companies');
      },
    );
    setLoading(false);
    return () => {
      console.log('[Companies] Cleaning up onSnapshot unsubscribe');
      unsubscribe();
    };
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

  const totalEmployees = useMemo(
    () => companies.reduce((sum, c) => sum + (Number(c.employeeCount) || 0), 0),
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
    setSeeding(true);
    success('Seeding…');
    try {
      const result = await seedData(currentUser?.uid || currentUser?.email || '');
      if (result.seeded) {
        success('Sample data seeded. Two companies with employees, leave and attendance added.');
        // onSnapshot listener will update companies list automatically
      } else {
        success(result.message || 'Already seeded.');
        // Listener already has companies; optionally refetch once without orderBy
        getDocs(collection(db, 'companies')).then((snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setCompanies((prev) => (list.length > prev.length ? list : prev));
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Seed error:', err);
      const msg = err?.message || err?.code || 'Seed failed';
      showError(msg.includes('Permission') ? 'Seed failed: check Firestore rules allow write to companies' : `Seed failed: ${msg}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleDeactivate = async (company) => {
    try {
      await updateDoc(doc(db, 'companies', company.id), { isActive: false });
      setMenuCompanyId(null);
      success('Company deactivated');
      // onSnapshot will update companies list automatically
    } catch (err) {
      showError('Failed to deactivate');
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">All Companies</h1>
          <p className="text-slate-500 text-sm mt-1">Manage companies on the platform.</p>
        </div>
        <button
          type="button"
          onClick={() => { setEditingCompany(null); setShowAddModal(true); setForm({ name: '', initials: '', color: COLOR_PRESETS[0].value, industry: '', location: '' }); }}
          className="inline-flex items-center justify-center rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
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
              <p className="text-xl font-semibold text-slate-800 mt-1">{companies.length}</p>
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
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
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
          <p className="font-medium text-slate-700">No companies yet.</p>
          <p className="text-sm mt-1">Add your first company to get started.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="text-[#378ADD] text-sm font-medium hover:underline"
            >
              Add your first company
            </button>
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {seeding ? 'Seeding…' : 'Seed sample data (2 companies)'}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCompanies.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-12 w-12 rounded-full flex items-center justify-center text-white font-semibold text-lg shrink-0"
                    style={{ backgroundColor: c.color || '#378ADD' }}
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
                    onClick={() => setMenuCompanyId(menuCompanyId === c.id ? null : c.id)}
                    className="p-1 rounded text-slate-400 hover:bg-slate-100"
                    aria-label="Menu"
                  >
                    <span className="text-lg leading-none">⋯</span>
                  </button>
                  {menuCompanyId === c.id && (
                    <div className="absolute right-0 top-full mt-1 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-[140px]">
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => openEdit(c)}
                      >
                        Edit Company
                      </button>
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-1.5 text-sm text-amber-600 hover:bg-slate-50"
                        onClick={() => handleDeactivate(c)}
                      >
                        Deactivate
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {c.employeeCount ?? 0} employee{(c.employeeCount ?? 0) !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <Link
                  to={`/company/${c.id}/dashboard`}
                  className="flex-1 inline-flex items-center justify-center rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium py-2"
                >
                  Manage →
                </Link>
              </div>
            </div>
          ))}
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD] uppercase"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
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
                  className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
