import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDocs, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { toDisplayDate, toJSDate } from '../utils';

const CATEGORIES = [
  'Leave',
  'Attendance',
  'IT & Security',
  'Code of Conduct',
  'HR Policies',
  'Safety',
  'Finance',
  'Other',
];

function getCategoryIcon(cat) {
  const m = {
    Leave: '🏖️',
    Attendance: '⏰',
    'IT & Security': '🔒',
    'Code of Conduct': '📋',
    'HR Policies': '👥',
    Safety: '⛑️',
    Finance: '💰',
    Other: '📄',
  };
  return m[cat] || '📄';
}

function getCategoryBg(cat) {
  const m = {
    Leave: 'bg-blue-50',
    Attendance: 'bg-amber-50',
    'IT & Security': 'bg-purple-50',
    'Code of Conduct': 'bg-green-50',
    'HR Policies': 'bg-[#E8F5F5]',
    Safety: 'bg-red-50',
    Finance: 'bg-yellow-50',
    Other: 'bg-gray-50',
  };
  return m[cat] || 'bg-gray-50';
}

const DEFAULT_POLICIES = [
  {
    title: 'Leave Policy',
    category: 'Leave',
    description: 'Guidelines for applying and managing leaves',
    content: `LEAVE POLICY

1. CASUAL LEAVE (CL)
Employees are entitled to 12 days of casual leave per year. CL cannot be carried forward to the next year.

2. SICK LEAVE (SL)
Employees are entitled to 12 days of sick leave per year. Medical certificate required for more than 2 consecutive days.

3. EARNED LEAVE (EL)
Employees earn 1.25 days of EL per month worked. EL can be carried forward up to 30 days.

4. APPLICATION PROCESS
All leave applications must be submitted through AttendX at least 2 days in advance (except sick leave).

5. APPROVAL
Leave is subject to manager approval. Emergency leave should be communicated via phone.`,
    version: '1.0',
    isActive: true,
  },
  {
    title: 'Code of Conduct',
    category: 'Code of Conduct',
    description: 'Expected behavior and professional standards',
    content: `CODE OF CONDUCT

1. PROFESSIONAL BEHAVIOR
All employees are expected to maintain professional behavior at all times in the workplace.

2. PUNCTUALITY
Employees must report to work on time. Habitual late-coming will result in disciplinary action.

3. DRESS CODE
Employees must dress professionally. Casual attire is permitted on Fridays.

4. CONFIDENTIALITY
Employees must maintain confidentiality of company information and client data.

5. ANTI-HARASSMENT
The company has zero tolerance for any form of harassment or discrimination.

6. CONFLICT OF INTEREST
Employees must disclose any conflict of interest to HR immediately.`,
    version: '1.0',
    isActive: true,
  },
  {
    title: 'IT & Data Security Policy',
    category: 'IT & Security',
    description: 'Rules for using company IT systems and data security',
    content: `IT & DATA SECURITY POLICY

1. ACCEPTABLE USE
Company systems must only be used for business purposes. Personal use should be minimal.

2. PASSWORD POLICY
Passwords must be at least 8 characters. Change passwords every 90 days. Never share passwords.

3. DATA PROTECTION
Company data must not be shared with unauthorized persons. No data should be stored on personal devices.

4. INTERNET USAGE
Employees must not visit inappropriate websites on company systems or networks.

5. SOFTWARE
Only licensed software approved by IT may be installed on company devices.

6. INCIDENTS
Any security incident must be reported to IT immediately.`,
    version: '1.0',
    isActive: true,
  },
  {
    title: 'Attendance & Punctuality',
    category: 'Attendance',
    description: 'Attendance tracking and punctuality expectations',
    content: `ATTENDANCE & PUNCTUALITY

1. WORK HOURS
Employees must adhere to scheduled work hours unless otherwise approved.

2. CHECK-IN
Use the prescribed attendance system daily.

3. LATE ARRIVALS
Repeated late arrivals may be recorded and reviewed with your manager.

4. ABSENCE
Unplanned absence must be reported to your manager as soon as possible.`,
    version: '1.0',
    isActive: true,
  },
  {
    title: 'Workplace Safety',
    category: 'Safety',
    description: 'General safety rules for all employees',
    content: `WORKPLACE SAFETY

1. EMERGENCY EXITS
Keep emergency exits clear at all times.

2. REPORTING
Report hazards or incidents to HR or facilities immediately.

3. EQUIPMENT
Use equipment only as trained and intended.

4. FIRST AID
Know the location of first-aid kits and emergency contacts.`,
    version: '1.0',
    isActive: true,
  },
];

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function previewText(policy) {
  const d = policy.description?.trim();
  if (d) {
    return d.length > 120 ? `${d.slice(0, 120)}…` : d;
  }
  const c = (policy.content || '').trim();
  if (!c) return '—';
  return c.length > 100 ? `${c.slice(0, 100)}…` : c;
}

export default function Policies() {
  const { companyId } = useParams();
  const { currentUser, role } = useAuth();
  const { success, error: showError } = useToast();
  const canManage = role === 'admin' || role === 'hrmanager';

  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryTab, setCategoryTab] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewingPolicy, setViewingPolicy] = useState(null);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '',
    category: CATEGORIES[0],
    description: '',
    content: '',
    version: '1.0',
    effectiveDate: new Date().toISOString().slice(0, 10),
    isActive: true,
  });

  const seedDefaultsIfEmpty = useCallback(async () => {
    if (!companyId || !currentUser?.email) return;
    const colRef = collection(db, 'companies', companyId, 'policies');
    const snap = await getDocs(colRef);
    if (!snap.empty) return;
    const batch = writeBatch(db);
    const now = serverTimestamp();
    DEFAULT_POLICIES.forEach((p) => {
      const ref = doc(colRef);
      batch.set(ref, {
        ...p,
        fileUrl: null,
        fileId: null,
        effectiveDate: now,
        createdAt: now,
        createdBy: currentUser.email,
        updatedAt: now,
      });
    });
    await batch.commit();
  }, [companyId, currentUser]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await seedDefaultsIfEmpty();
      } catch (e) {
        console.error(e);
      }
      if (cancelled) return;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, seedDefaultsIfEmpty]);

  useEffect(() => {
    if (!companyId) return () => {};
    const unsub = onSnapshot(collection(db, 'companies', companyId, 'policies'), (snap) => {
      setPolicies(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [companyId]);

  const filtered = useMemo(() => {
    if (categoryTab === 'All') return policies;
    return policies.filter((p) => p.category === categoryTab);
  }, [policies, categoryTab]);

  const openAdd = () => {
    setEditingPolicy(null);
    setForm({
      title: '',
      category: CATEGORIES[0],
      description: '',
      content: '',
      version: '1.0',
      effectiveDate: new Date().toISOString().slice(0, 10),
      isActive: true,
    });
    setShowAddModal(true);
  };

  const openEdit = (policy) => {
    setViewingPolicy(null);
    setEditingPolicy(policy);
    setForm({
      title: policy.title || '',
      category: policy.category || CATEGORIES[0],
      description: policy.description || '',
      content: policy.content || '',
      version: policy.version || '1.0',
      effectiveDate: toJSDate(policy.effectiveDate) ? toJSDate(policy.effectiveDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      isActive: policy.isActive !== false,
    });
    setShowAddModal(true);
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    if (!companyId || !currentUser?.email) return;
    if (!form.title.trim()) {
      showError('Title is required');
      return;
    }
    setSaving(true);
    try {
      const effective = form.effectiveDate ? new Date(form.effectiveDate) : new Date();
      const payload = {
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim(),
        content: form.content,
        version: form.version.trim() || '1.0',
        effectiveDate: effective,
        isActive: form.isActive,
        fileUrl: editingPolicy?.fileUrl ?? null,
        fileId: editingPolicy?.fileId ?? null,
        updatedAt: serverTimestamp(),
      };

      if (editingPolicy) {
        await updateDoc(doc(db, 'companies', companyId, 'policies', editingPolicy.id), payload);
        success('Policy updated');
      } else {
        await addDoc(collection(db, 'companies', companyId, 'policies'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: currentUser.email,
        });
        success('Policy created');
      }
      setShowAddModal(false);
      setEditingPolicy(null);
    } catch (err) {
      console.error(err);
      showError('Failed to save policy');
    }
    setSaving(false);
  };

  const printPolicy = useCallback((policy) => {
    if (!policy) return;
    const cat = escapeHtml(policy.category);
    const title = escapeHtml(policy.title);
    const ver = escapeHtml(policy.version || '1.0');
    const eff = escapeHtml(toDisplayDate(policy.effectiveDate));
    const desc = policy.description ? escapeHtml(policy.description) : '';
    const content = escapeHtml(policy.content || '');
    const printContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
      color: #1f2937;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 2px solid #1B6B6B;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .category {
      font-size: 12px;
      color: #1B6B6B;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    h1 {
      font-size: 24px;
      color: #1B6B6B;
      margin: 0 0 8px;
    }
    .meta {
      font-size: 13px;
      color: #6b7280;
      margin-top: 8px;
    }
    .content {
      font-size: 14px;
      line-height: 1.8;
      white-space: pre-wrap;
      color: #374151;
    }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #9ca3af;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="category">${cat}</div>
    <h1>${title}</h1>
    <div class="meta">Version ${ver} · Effective: ${eff}</div>
    ${desc ? `<p style="color:#6b7280;font-size:14px;margin-top:8px">${desc}</p>` : ''}
  </div>
  <div class="content">${content}</div>
  <div class="footer">
    <span>AttendX HR Platform</span>
    <span>${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
  </div>
</body>
</html>`;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showError('Pop-up blocked — allow pop-ups to print');
      return;
    }
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, [showError]);

  if (!companyId) return null;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Policy Library</h1>
          <p className="text-sm text-gray-500 mt-1">Company policies and guidelines</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-[#1B6B6B] text-white text-sm font-medium hover:bg-[#155858] active:bg-[#0f4444]"
          >
            + Add Policy
          </button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-none pb-2 mb-6 border-b border-gray-100 -mx-4 px-4 lg:mx-0 lg:px-0">
        {['All', ...CATEGORIES].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoryTab(c)}
            className={`flex-shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              categoryTab === c ? 'bg-[#1B6B6B] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#1B6B6B] border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((policy) => (
            <div
              key={policy.id}
              role="button"
              tabIndex={0}
              onClick={() => setViewingPolicy(policy)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setViewingPolicy(policy);
              }}
              className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-[#4ECDC4] transition-colors cursor-pointer text-left"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${getCategoryBg(policy.category)}`}
                  >
                    {getCategoryIcon(policy.category)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{policy.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {policy.category} · v{policy.version || '1.0'}
                    </p>
                  </div>
                </div>
                {policy.isActive !== false ? (
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium flex-shrink-0">Active</span>
                ) : (
                  <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded-full flex-shrink-0">Inactive</span>
                )}
              </div>

              <p className="text-sm text-gray-500 line-clamp-2 mb-3">{previewText(policy)}</p>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-gray-400">Effective: {toDisplayDate(policy.effectiveDate)}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingPolicy(policy);
                    }}
                    className="text-xs text-[#1B6B6B] font-medium hover:underline"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingPolicy(policy);
                      setTimeout(() => printPolicy(policy), 100);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                    title="Print"
                  >
                    🖨️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-center text-slate-500 py-12 text-sm">No policies in this category.</p>
      )}

      {/* Add / Edit modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg p-6 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex justify-center mb-4 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-4">{editingPolicy ? 'Edit Policy' : 'Add Policy'}</h2>
            <form onSubmit={handleSavePolicy} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Short summary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Content</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Version</label>
                  <input
                    value={form.version}
                    onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Effective date</label>
                  <input
                    type="date"
                    value={form.effectiveDate}
                    onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  className="rounded border-slate-300"
                />
                Active
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingPolicy(null);
                  }}
                  className="flex-1 min-h-[44px] rounded-xl border border-slate-200 text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 min-h-[44px] rounded-xl bg-[#1B6B6B] text-white text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View modal */}
      {viewingPolicy && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[60] sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto shadow-xl flex flex-col">
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex flex-wrap items-start gap-3 z-10">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${getCategoryBg(viewingPolicy.category)}`}>
                {getCategoryIcon(viewingPolicy.category)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">{viewingPolicy.title}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  v{viewingPolicy.version || '1.0'} · Effective {toDisplayDate(viewingPolicy.effectiveDate)}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => printPolicy(viewingPolicy)}
                  className="flex items-center gap-2 min-h-[44px] px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  🖨️ Print
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => openEdit(viewingPolicy)}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm font-medium text-[#1B6B6B]"
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingPolicy(null)}
                  className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 text-slate-500"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
              {viewingPolicy.description && <p className="text-sm text-gray-500 mb-4">{viewingPolicy.description}</p>}
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-w-none">{viewingPolicy.content || '—'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
