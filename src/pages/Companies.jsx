import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';

const COLOR_PRESETS = [
  { name: 'Blue', value: '#378ADD' },
  { name: 'Green', value: '#1D9E75' },
  { name: 'Orange', value: '#E67E22' },
  { name: 'Purple', value: '#9B59B6' },
  { name: 'Red', value: '#E74C3C' },
  { name: 'Teal', value: '#1ABC9C' },
];

export default function Companies() {
  const { currentUser } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [menuCompanyId, setMenuCompanyId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    initials: '',
    color: COLOR_PRESETS[0].value,
    industry: '',
    location: '',
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [companiesSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, 'companies'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'users')),
      ]);
      setCompanies(companiesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    load();
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
    if (name === 'name' && value.length >= 2) {
      setForm((prev) => ({
        ...prev,
        initials: value.slice(0, 2).toUpperCase(),
      }));
    }
  };

  const handleAddCompany = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      initials: (form.initials || form.name.slice(0, 2)).toUpperCase().slice(0, 2),
      color: form.color,
      industry: form.industry.trim(),
      location: form.location.trim(),
      employeeCount: 0,
      isActive: true,
      createdAt: serverTimestamp(),
      createdBy: currentUser?.email || '',
    };
    const ref = doc(collection(db, 'companies'));
    await setDoc(ref, payload);
    setCompanies((prev) => [{ id: ref.id, ...payload, createdAt: new Date() }, ...prev]);
    setShowAddModal(false);
    setForm({ name: '', initials: '', color: COLOR_PRESETS[0].value, industry: '', location: '' });
  };

  const handleDeactivate = async (company) => {
    await updateDoc(doc(db, 'companies', company.id), { isActive: false });
    setCompanies((prev) =>
      prev.map((c) => (c.id === company.id ? { ...c, isActive: false } : c)),
    );
    setMenuCompanyId(null);
  };

  const pendingLeaves = 0; // placeholder; could aggregate from companies/{id}/leave

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">All Companies</h1>
          <p className="text-slate-500 text-sm mt-1">Manage companies on the platform.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center justify-center rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
        >
          Add Company
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
          <p className="text-xl font-semibold text-slate-800 mt-1">{pendingLeaves}</p>
        </div>
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
        <div className="text-slate-500 text-sm py-8">Loading...</div>
      ) : filteredCompanies.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <p className="font-medium text-slate-700">No companies yet.</p>
          <p className="text-sm mt-1">Add your first company to get started.</p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mt-4 text-[#378ADD] text-sm font-medium hover:underline"
          >
            Add Company
          </button>
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
                    className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-semibold text-lg"
                    style={{ backgroundColor: c.color || '#378ADD' }}
                  >
                    {c.initials || c.name?.slice(0, 2)?.toUpperCase() || '—'}
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-800">{c.name || '—'}</h2>
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
                    <div className="absolute right-0 top-full mt-1 py-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-[120px]">
                      <button
                        type="button"
                        className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => setMenuCompanyId(null)}
                      >
                        Edit
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
              <p className="text-slate-600 text-sm mt-2">
                {c.employeeCount ?? 0} employee{(c.employeeCount ?? 0) !== 1 ? 's' : ''}
              </p>
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

      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Add Company</h2>
            <form onSubmit={handleAddCompany} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Company Name
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
                <input
                  type="text"
                  name="industry"
                  value={form.industry}
                  onChange={handleFormChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#378ADD]"
                />
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
                  onClick={() => setShowAddModal(false)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
