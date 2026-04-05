import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { trackPageView } from '../utils/analytics';

const AUDIT_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'audits', label: 'Audits', icon: '🔍' },
];

const STATUS_COLORS = {
  Assigned: 'bg-purple-100 text-purple-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Submitted: 'bg-orange-100 text-orange-700',
  'Under Review': 'bg-pink-100 text-pink-700',
  Closed: 'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700',
};

const AUDIT_COLORS = [
  '#8B5CF6',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#1B6B6B',
  '#6366F1',
  '#14B8A6',
];

function itemFullyAnswered(item) {
  const yn = item.yesNoResponse;
  const hasYn = yn === 'Yes' || yn === 'No' || yn === 'N/A';
  const hasRating = typeof item.rating === 'number' && item.rating >= 1 && item.rating <= 5;
  return hasYn && hasRating;
}

function normalizeChecklistItem(item) {
  const next = { ...item };
  delete next.riskLevel;
  if (next.yesNoResponse == null && ['Yes', 'No', 'N/A'].includes(next.response)) {
    next.yesNoResponse = next.response;
  }
  if (next.rating == null && typeof next.response === 'number' && next.response >= 1 && next.response <= 5) {
    next.rating = next.response;
  }
  return next;
}

function AuditDashboard({ audits }) {
  const total = audits.length;
  const inProgress = audits.filter((a) => a.status === 'In Progress').length;
  const submitted = audits.filter((a) => a.status === 'Submitted' || a.status === 'Under Review').length;
  const closed = audits.filter((a) => a.status === 'Closed').length;
  const overdue = audits.filter((a) => {
    if (a.status === 'Closed') return false;
    const end = a.endDate || a.dueDate;
    if (!end) return false;
    return new Date(end) < new Date();
  }).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Audits', value: total, icon: '🔍', color: 'gray' },
          { label: 'In Progress', value: inProgress, icon: '📝', color: 'blue' },
          { label: 'Under Review', value: submitted, icon: '👀', color: 'orange' },
          { label: 'Closed', value: closed, icon: '✅', color: 'green' },
          { label: 'Overdue', value: overdue, icon: '⚠️', color: 'red' },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">{card.label}</p>
              <span className="text-xl">{card.icon}</span>
            </div>
            <p
              className={`text-3xl font-bold ${card.color === 'red' && card.value > 0 ? 'text-red-600' : 'text-gray-900'}`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Audits</h3>
        {audits.slice(0, 5).length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-3xl mb-2">🔍</p>
            <p className="text-sm">No audits yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {audits.slice(0, 5).map((audit) => (
              <div key={audit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-800">{audit.title || audit.auditTypeName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {audit.branch || audit.location || '—'} · End: {audit.endDate || audit.dueDate || '—'}
                  </p>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    STATUS_COLORS[audit.status] || STATUS_COLORS.Assigned
                  }`}
                >
                  {audit.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const AuditTemplates = forwardRef(function AuditTemplates(
  { companyId, currentUser, saving, setSaving, showSuccess, showError },
  ref,
) {
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [selectedColor, setSelectedColor] = useState(AUDIT_COLORS[0]);
  const [form, setForm] = useState({
    auditCategory: '',
    name: '',
    description: '',
    color: AUDIT_COLORS[0],
    riskLevel: 'Medium',
  });
  const [checklist, setChecklist] = useState([]);
  const [newSection, setNewSection] = useState('');
  const [sections, setSections] = useState(['General']);

  const resetForm = () => {
    setForm({ auditCategory: '', name: '', description: '', color: AUDIT_COLORS[0], riskLevel: 'Medium' });
    setChecklist([]);
    setSections(['General']);
    setSelectedColor(AUDIT_COLORS[0]);
    setEditingType(null);
  };

  const openEdit = (type) => {
    setEditingType(type);
    setForm({
      auditCategory: type.auditCategory || '',
      name: type.name,
      description: type.description || '',
      color: type.color || AUDIT_COLORS[0],
      riskLevel: type.riskLevel || 'Medium',
    });
    setSelectedColor(type.color || AUDIT_COLORS[0]);
    const tpl = (type.checklistTemplate || []).map((i) => {
      const { type: _t, riskLevel: _rl, ...rest } = i;
      return {
        ...rest,
        required: i.required !== false,
      };
    });
    setChecklist(tpl);
    const uniqueSections = [...new Set(tpl.map((x) => x.section))];
    setSections(uniqueSections.length > 0 ? uniqueSections : ['General']);
    setShowModal(true);
  };

  const addChecklistItem = (section) => {
    const newItem = {
      id: `item_${Date.now()}`,
      section,
      question: '',
      required: true,
      order: checklist.length,
    };
    setChecklist((prev) => [...prev, newItem]);
  };

  const updateItem = (id, field, value) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const removeItem = (id) => {
    setChecklist((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    if (!form.auditCategory) {
      showError('Select Internal or External audit');
      return;
    }
    if (!form.name.trim()) {
      showError('Enter template name');
      return;
    }
    if (checklist.length === 0) {
      showError('Add at least one checklist item');
      return;
    }
    const emptyItems = checklist.filter((i) => !i.question.trim());
    if (emptyItems.length > 0) {
      showError('All checklist items need a question');
      return;
    }

    try {
      setSaving(true);
      const checklistTemplate = checklist.map((item, idx) => {
        const { type: _omit, response: _r, riskLevel: _rl, ...rest } = item;
        return { ...rest, order: idx };
      });
      const data = {
        auditCategory: form.auditCategory,
        name: form.name.trim(),
        description: form.description.trim(),
        color: selectedColor,
        riskLevel: form.riskLevel || 'Medium',
        checklistTemplate,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.email || '',
      };

      if (editingType) {
        await updateDoc(doc(db, 'companies', companyId, 'auditTypes', editingType.id), data);
        showSuccess('Audit template updated!');
      } else {
        await addDoc(collection(db, 'companies', companyId, 'auditTypes'), {
          ...data,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.email || '',
        });
        showSuccess('Audit template created!');
      }
      setShowModal(false);
      resetForm();
    } catch (e) {
      showError(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type) => {
    if (!window.confirm(`Delete audit template "${type.name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'companies', companyId, 'auditTypes', type.id));
      showSuccess(`"${type.name}" deleted`);
    } catch (e) {
      showError('Failed to delete');
    }
  };

  useImperativeHandle(ref, () => ({
    openNew: () => {
      resetForm();
      setShowModal(true);
    },
    openEdit,
    deleteType: handleDelete,
  }));

  return (
    <>
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">{editingType ? 'Edit Audit Template' : 'New Audit Template'}</h2>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Audit Category *</label>
                <div className="grid grid-cols-2 gap-3">
                  {['Internal', 'External'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, auditCategory: cat }))}
                      className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.auditCategory === cat
                          ? 'border-[#1B6B6B] bg-[#E8F5F5] text-[#1B6B6B]'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {cat === 'Internal' ? '🏢 Internal' : '🌐 External'}
                    </button>
                  ))}
                </div>
                {form.auditCategory && (
                  <p className="text-xs text-gray-400 mt-1">
                    {form.auditCategory === 'Internal'
                      ? 'Conducted by internal team members'
                      : 'Conducted by external auditors'}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Template Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Cash Handling Audit, Compliance Audit, Safety Audit"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Description (optional)</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {AUDIT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        selectedColor === color ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'
                      }`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Risk Level</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    {
                      value: 'Low',
                      color: 'bg-green-50 border-green-200 text-green-700',
                      active: 'bg-green-500 border-green-500 text-white',
                      icon: '🟢',
                    },
                    {
                      value: 'Medium',
                      color: 'bg-amber-50 border-amber-200 text-amber-700',
                      active: 'bg-amber-500 border-amber-500 text-white',
                      icon: '🟡',
                    },
                    {
                      value: 'High',
                      color: 'bg-orange-50 border-orange-200 text-orange-700',
                      active: 'bg-orange-500 border-orange-500 text-white',
                      icon: '🟠',
                    },
                    {
                      value: 'Critical',
                      color: 'bg-red-50 border-red-200 text-red-700',
                      active: 'bg-red-500 border-red-500 text-white',
                      icon: '🔴',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, riskLevel: opt.value }))}
                      className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.riskLevel === opt.value ? opt.active : opt.color
                      }`}
                    >
                      {opt.icon} {opt.value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist</label>
                  <span className="text-xs text-gray-400">{checklist.length} items</span>
                </div>

                {sections.map((section) => (
                  <div key={section} className="mb-4">
                    <div className="flex items-center justify-between py-2 border-b border-gray-200 mb-2">
                      <h4 className="text-sm font-semibold text-gray-700">{section}</h4>
                      <button type="button" onClick={() => addChecklistItem(section)} className="text-xs text-[#1B6B6B] hover:underline">
                        + Add item
                      </button>
                    </div>

                    {checklist
                      .filter((i) => i.section === section)
                      .map((item) => (
                        <div key={item.id} className="flex gap-2 mb-3 p-3 bg-gray-50 rounded-xl">
                          <div className="flex-1 space-y-2">
                            <input
                              value={item.question}
                              onChange={(e) => updateItem(item.id, 'question', e.target.value)}
                              placeholder="Checklist item question..."
                              className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                            />
                            <div className="flex gap-2 items-center flex-wrap">
                              <div className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-lg">
                                <span className="text-xs text-gray-400">✅ Yes/No + ⭐ Rating 1-5</span>
                              </div>
                              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.required}
                                  onChange={(e) => updateItem(item.id, 'required', e.target.checked)}
                                  className="accent-[#1B6B6B]"
                                />
                                Required
                              </label>
                            </div>
                          </div>
                          <button type="button" onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 px-1 flex-shrink-0 self-start mt-2">
                            ✕
                          </button>
                        </div>
                      ))}

                    {checklist.filter((i) => i.section === section).length === 0 && (
                      <button
                        type="button"
                        onClick={() => addChecklistItem(section)}
                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors"
                      >
                        + Add first item
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex gap-2 mt-3">
                  <input
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    placeholder="New section name..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newSection.trim()) {
                        setSections((prev) => [...prev, newSection.trim()]);
                        setNewSection('');
                      }
                    }}
                    className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newSection.trim()) return;
                      setSections((prev) => [...prev, newSection.trim()]);
                      setNewSection('');
                    }}
                    className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm"
                  >
                    + Section
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t flex-shrink-0 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingType ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

function formatAuditTimestamp(val) {
  if (val == null) return null;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toLocaleDateString('en-IN');
    } catch {
      return null;
    }
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN');
}

function AuditDetail({ audit, companyId, currentUser, employees = [], onClose, showSuccess, showError }) {
  const [checklist, setChecklist] = useState(() => (audit.checklist || []).map(normalizeChecklistItem));
  const [saving, setSaving] = useState(false);
  const [managerComment, setManagerComment] = useState(audit.managerComments || '');
  const [detailTab, setDetailTab] = useState('overview');

  useEffect(() => {
    setChecklist((audit.checklist || []).map(normalizeChecklistItem));
    setManagerComment(audit.managerComments || '');
    setDetailTab('overview');
  }, [audit.id]);

  const completedCount = useMemo(() => checklist.filter((i) => itemFullyAnswered(i)).length, [checklist]);

  const findings = useMemo(() => checklist.filter((i) => i.yesNoResponse === 'No'), [checklist]);
  const actionItems = useMemo(() => findings.filter((i) => i.ownerName), [findings]);
  const resolvedItems = useMemo(() => actionItems.filter((i) => i.resolved === true), [actionItems]);

  const updateItemResponse = (id, field, value) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const updateItemOwnerFromSelect = (itemId, fullName) => {
    const emp = fullName ? (employees || []).find((e) => e.fullName === fullName || e.id === fullName) : null;
    setChecklist((prev) =>
      prev.map((it) =>
        it.id !== itemId
          ? it
          : {
              ...it,
              ownerName: fullName,
              ownerId: emp?.id ?? '',
              ownerEmail: emp?.email ?? '',
            },
      ),
    );
  };

  const handleSaveDraft = async () => {
    try {
      setSaving(true);
      const payload = {
        checklist,
        completedItems: completedCount,
        status: audit.status === 'Assigned' ? 'In Progress' : audit.status,
        lastSavedAt: serverTimestamp(),
        lastSavedBy: currentUser?.email || '',
      };
      if (audit.status === 'Submitted' || audit.status === 'Under Review' || audit.status === 'Closed') {
        payload.managerComments = managerComment;
      }
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), payload);
      showSuccess('Draft saved!');
    } catch (e) {
      showError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const requiredIncomplete = checklist.filter((i) => i.required && !itemFullyAnswered(i));
    if (requiredIncomplete.length > 0) {
      showError(
        `Complete all required items. ${requiredIncomplete.length} items need both Yes/No and Rating.`,
      );
      return;
    }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        checklist,
        completedItems: completedCount,
        status: 'Submitted',
        submittedAt: serverTimestamp(),
        submittedBy: currentUser?.email || '',
        auditorSignature: currentUser?.email || '',
      });
      showSuccess('Audit submitted!');
      onClose();
    } catch (e) {
      showError(`Submit failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        checklist,
        status: 'Closed',
        closedAt: serverTimestamp(),
        closedBy: currentUser?.email || '',
        managerComments: managerComment,
        resolvedCount: resolvedItems.length,
        totalActionItems: actionItems.length,
      });
      showSuccess('Audit closed successfully!');
      onClose();
    } catch (e) {
      showError(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSendBack = async () => {
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        checklist,
        status: 'In Progress',
        managerComments: managerComment,
        sentBackAt: serverTimestamp(),
        sentBackBy: currentUser?.email || '',
      });
      showSuccess('Sent back to auditor');
      onClose();
    } catch (e) {
      showError(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const sections = [...new Set(checklist.map((i) => i.section))];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-start justify-between p-6 border-b flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-gray-800">{audit.title || audit.auditTypeName}</h2>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[audit.status] || STATUS_COLORS.Assigned}`}>
                {audit.status}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-gray-400">
                {audit.branch || audit.location || '—'} · End: {audit.endDate || audit.dueDate || 'Not set'} · Auditor:{' '}
                {audit.auditorName || '—'}
              </p>
              {audit.category && <span className="text-xs text-gray-400">{audit.category}</span>}
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-400 mb-1.5">Audit Team</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {audit.auditorName && (
                  <div className="flex items-center gap-1.5 bg-[#E8F5F5] px-2.5 py-1 rounded-full">
                    <div className="w-4 h-4 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold">
                      {audit.auditorName?.charAt(0)}
                    </div>
                    <span className="text-xs text-[#1B6B6B] font-medium">{audit.auditorName}</span>
                    <span className="text-xs text-[#1B6B6B]/60">Lead</span>
                  </div>
                )}
                {(audit.teamMembers || []).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-full"
                  >
                    <div className="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold">
                      {m.fullName?.charAt(0)}
                    </div>
                    <span className="text-xs text-gray-600">{m.fullName}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
            ✕
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-50 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-gray-500">Progress</p>
            <p className="text-xs font-medium text-gray-700">
              {completedCount} / {checklist.length} items
            </p>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1B6B6B] rounded-full transition-all"
              style={{
                width: checklist.length > 0 ? `${Math.round((completedCount / checklist.length) * 100)}%` : '0%',
              }}
            />
          </div>
        </div>

        {(audit.status === 'Submitted' || audit.status === 'Under Review' || audit.status === 'Closed') && (
          <div className="px-6 pt-4 pb-0 border-b border-gray-100 flex-shrink-0">
            <div className="flex gap-1">
              {[
                { id: 'overview', label: '📊 Overview' },
                { id: 'findings', label: `⚠️ Findings (${findings.length})` },
                { id: 'actions', label: `✅ Action Items (${actionItems.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDetailTab(tab.id)}
                  className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                    detailTab === tab.id
                      ? 'border-[#1B6B6B] text-[#1B6B6B] bg-[#E8F5F5]'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {(audit.status === 'Assigned' || audit.status === 'In Progress') && (
            <div className="space-y-6">
              {sections.map((section) => (
                <div key={section}>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">{section}</h4>
                  <div className="space-y-4">
                    {checklist
                      .filter((i) => i.section === section)
                      .map((item, idx) => (
                        <div
                          key={item.id}
                          className={`p-4 rounded-xl border transition-colors ${
                            item.yesNoResponse != null &&
                            item.yesNoResponse !== '' &&
                            typeof item.rating === 'number' &&
                            item.rating >= 1 &&
                            item.rating <= 5
                              ? 'bg-green-50 border-green-100'
                              : 'bg-white border-gray-100'
                          }`}
                        >
                          <div className="flex items-start gap-2 min-w-0 mb-3">
                            <span className="text-xs font-medium text-gray-400 mt-0.5 w-5 flex-shrink-0">{idx + 1}.</span>
                            <p className="text-sm font-medium text-gray-800">
                              {item.question}
                              {item.required && <span className="text-red-400 ml-1">*</span>}
                            </p>
                          </div>

                          <div className="ml-7 space-y-3">
                            <div>
                              <p className="text-xs text-gray-400 mb-1.5 font-medium">Compliance Check</p>
                              <div className="flex gap-2">
                                {['Yes', 'No', 'N/A'].map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => updateItemResponse(item.id, 'yesNoResponse', opt)}
                                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                                      item.yesNoResponse === opt
                                        ? opt === 'Yes'
                                          ? 'bg-green-500 text-white'
                                          : opt === 'No'
                                            ? 'bg-red-500 text-white'
                                            : 'bg-gray-500 text-white'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <p className="text-xs text-gray-400 mb-1.5 font-medium">Quality Rating</p>
                              <div className="flex gap-2 items-center flex-wrap">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => updateItemResponse(item.id, 'rating', n)}
                                    className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                                      item.rating === n ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                  >
                                    {n}
                                  </button>
                                ))}
                                {item.rating != null && (
                                  <span className="text-xs text-gray-400 ml-1">
                                    {item.rating === 1 && 'Poor'}
                                    {item.rating === 2 && 'Fair'}
                                    {item.rating === 3 && 'Good'}
                                    {item.rating === 4 && 'Very Good'}
                                    {item.rating === 5 && 'Excellent'}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <input
                                value={item.remarks || ''}
                                onChange={(e) => updateItemResponse(item.id, 'remarks', e.target.value)}
                                placeholder="Remarks / observations..."
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                              />
                            </div>

                            {item.yesNoResponse === 'No' && (
                              <div className="p-3 bg-red-50 rounded-lg border border-red-100 space-y-2">
                                <p className="text-xs font-medium text-red-700">⚠️ Non-compliant — assign owner</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-gray-400 block mb-1">Owner (responsible to fix)</label>
                                    <select
                                      value={item.ownerName || ''}
                                      onChange={(e) => updateItemOwnerFromSelect(item.id, e.target.value)}
                                      className="w-full border rounded-lg px-2 py-2 text-xs bg-white focus:outline-none"
                                    >
                                      <option value="">Select owner...</option>
                                      {(employees || [])
                                        .filter((e) => e.status === 'Active')
                                        .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', undefined, { sensitivity: 'base' }))
                                        .map((emp) => (
                                          <option key={emp.id} value={emp.fullName}>
                                            {emp.fullName}
                                            {emp.designation ? ` — ${emp.designation}` : ''}
                                          </option>
                                        ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-400 block mb-1">Target Fix Date</label>
                                    <input
                                      type="date"
                                      value={item.targetDate || ''}
                                      onChange={(e) => updateItemResponse(item.id, 'targetDate', e.target.value)}
                                      className="w-full border rounded-lg px-2 py-2 text-xs bg-white focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(audit.status === 'Submitted' || audit.status === 'Under Review' || audit.status === 'Closed') && (
            <>
              {detailTab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-gray-800">{checklist.length}</p>
                      <p className="text-xs text-gray-400 mt-1">Total Items</p>
                    </div>
                    <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-green-700">
                        {checklist.filter((i) => i.yesNoResponse === 'Yes').length}
                      </p>
                      <p className="text-xs text-green-600 mt-1">Compliant</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-red-700">{findings.length}</p>
                      <p className="text-xs text-red-600 mt-1">Non-compliant</p>
                    </div>
                  </div>

                  {(() => {
                    const rated = checklist.filter((i) => i.rating != null && typeof i.rating === 'number');
                    const avg =
                      rated.length > 0
                        ? (rated.reduce((sum, i) => sum + i.rating, 0) / rated.length).toFixed(1)
                        : null;
                    if (!avg) return null;
                    const rounded = Math.round(Number(avg));
                    return (
                      <div className="bg-white border border-gray-100 rounded-xl p-4">
                        <p className="text-xs text-gray-400 mb-2">Average Quality Rating</p>
                        <div className="flex items-center gap-3">
                          <p className="text-3xl font-bold text-gray-800">{avg}</p>
                          <div>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <div
                                  key={n}
                                  className={`w-6 h-6 rounded text-center text-xs leading-6 font-bold ${
                                    n <= rounded ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-300'
                                  }`}
                                >
                                  {n}
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">out of 5.0</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Audit Details</p>
                    {[
                      { label: 'Template', value: audit.auditTypeName },
                      { label: 'Category', value: audit.auditCategory },
                      { label: 'Workforce category', value: audit.category },
                      { label: 'Risk Level', value: audit.riskLevel },
                      { label: 'Branch', value: audit.branch },
                      { label: 'Location', value: audit.location },
                      { label: 'Department', value: audit.department },
                      { label: 'Lead Auditor', value: audit.auditorName },
                      { label: 'Start Date', value: audit.startDate },
                      { label: 'End Date', value: audit.endDate || audit.dueDate },
                      { label: 'Submitted', value: formatAuditTimestamp(audit.submittedAt) },
                    ]
                      .filter((r) => r.value)
                      .map((row) => (
                        <div key={row.label} className="flex items-center justify-between">
                          <p className="text-xs text-gray-400">{row.label}</p>
                          <p className="text-xs font-medium text-gray-700">{row.value}</p>
                        </div>
                      ))}
                  </div>

                  {(audit.teamMembers?.length ?? 0) > 0 && (
                    <div className="bg-white border border-gray-100 rounded-xl p-4">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Audit Team</p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold">
                            {audit.auditorName?.charAt(0)}
                          </div>
                          <p className="text-sm text-gray-700 flex-1">{audit.auditorName}</p>
                          <span className="text-xs bg-[#E8F5F5] text-[#1B6B6B] px-2 py-0.5 rounded-full font-medium">Lead</span>
                        </div>
                        {(audit.teamMembers || []).map((m) => (
                          <div key={m.id} className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-bold">
                              {m.fullName?.charAt(0)}
                            </div>
                            <p className="text-sm text-gray-700 flex-1">{m.fullName}</p>
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Member</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Manager Comments</label>
                    <textarea
                      value={managerComment}
                      onChange={(e) => setManagerComment(e.target.value)}
                      disabled={audit.status === 'Closed'}
                      rows={3}
                      placeholder="Add review comments or instructions..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B] disabled:bg-gray-50"
                    />
                  </div>
                </div>
              )}

              {detailTab === 'findings' && (
                <div className="space-y-3">
                  {findings.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-3xl mb-2">✅</p>
                      <p className="text-sm font-medium text-gray-700">No findings</p>
                      <p className="text-xs text-gray-400">All checklist items passed</p>
                    </div>
                  ) : (
                    findings.map((item) => (
                      <div key={item.id} className="bg-red-50 border border-red-100 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <p className="text-sm font-medium text-gray-800">{item.question}</p>
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            ❌ Non-compliant
                          </span>
                        </div>
                        {item.remarks ? (
                          <div className="mb-3">
                            <p className="text-xs text-gray-400 mb-1">Auditor remarks</p>
                            <p className="text-sm text-gray-700 bg-white rounded-lg px-3 py-2 border border-red-100">{item.remarks}</p>
                          </div>
                        ) : null}
                        <div className="flex items-center gap-3 flex-wrap">
                          {item.ownerName ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">Owner:</span>
                              <span className="text-xs font-medium text-gray-700 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                                👤 {item.ownerName}
                              </span>
                            </div>
                          ) : null}
                          {item.targetDate ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">Fix by:</span>
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                                  new Date(item.targetDate) < new Date()
                                    ? 'bg-red-100 text-red-700 border-red-200'
                                    : 'bg-white text-gray-700 border-gray-200'
                                }`}
                              >
                                📅 {item.targetDate}
                              </span>
                            </div>
                          ) : null}
                          {item.rating != null ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">Rating:</span>
                              <span className="text-xs font-medium text-gray-700 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                                ⭐ {item.rating}/5
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'actions' && (
                <div className="space-y-3">
                  {actionItems.length > 0 && (
                    <div className="bg-white border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500">Resolution Progress</p>
                        <p className="text-xs font-medium text-gray-700">
                          {resolvedItems.length} / {actionItems.length} resolved
                        </p>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{
                            width:
                              actionItems.length > 0
                                ? `${Math.round((resolvedItems.length / actionItems.length) * 100)}%`
                                : '0%',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {actionItems.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-3xl mb-2">📋</p>
                      <p className="text-sm font-medium text-gray-700">No action items</p>
                      <p className="text-xs text-gray-400">No non-compliant items with owners assigned</p>
                    </div>
                  ) : (
                    actionItems.map((item) => (
                      <div
                        key={item.id}
                        className={`border rounded-xl p-4 transition-all ${
                          item.resolved ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-gray-800 flex-1">{item.question}</p>
                          {audit.status !== 'Closed' ? (
                            <button
                              type="button"
                              onClick={() => updateItemResponse(item.id, 'resolved', !item.resolved)}
                              className={`text-xs px-3 py-1 rounded-full font-medium flex-shrink-0 transition-colors ${
                                item.resolved
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-700'
                              }`}
                            >
                              {item.resolved ? '✅ Resolved' : 'Mark Resolved'}
                            </button>
                          ) : (
                            <span
                              className={`text-xs px-3 py-1 rounded-full font-medium ${
                                item.resolved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {item.resolved ? '✅ Resolved' : '⏳ Pending'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400">Owner:</span>
                            <span className="text-xs font-medium text-gray-700">👤 {item.ownerName}</span>
                          </div>
                          {item.targetDate ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">Fix by:</span>
                              <span
                                className={`text-xs font-medium ${
                                  !item.resolved && new Date(item.targetDate) < new Date() ? 'text-red-600' : 'text-gray-700'
                                }`}
                              >
                                {!item.resolved && new Date(item.targetDate) < new Date() ? '⚠️ ' : ''}
                                {item.targetDate}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}

                  {audit.status !== 'Closed' && actionItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={saving}
                      className="w-full py-2.5 border border-[#1B6B6B] text-[#1B6B6B] rounded-xl text-sm font-medium hover:bg-[#E8F5F5] disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : '💾 Save Progress'}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t flex-shrink-0">
          {(audit.status === 'Assigned' || audit.status === 'In Progress') && (
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving}
                className="flex-1 py-2.5 border border-[#1B6B6B] text-[#1B6B6B] rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : '💾 Save Draft'}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
              >
                {saving ? 'Submitting...' : '📤 Submit'}
              </button>
            </div>
          )}

          {(audit.status === 'Submitted' || audit.status === 'Under Review') && (
            <div className="space-y-2">
              {actionItems.length > 0 && resolvedItems.length < actionItems.length && (
                <p className="text-xs text-amber-600 text-center">
                  ⚠️ {actionItems.length - resolvedItems.length} action item
                  {actionItems.length - resolvedItems.length !== 1 ? 's' : ''} pending resolution before closing
                </p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSendBack}
                  disabled={saving}
                  className="flex-1 py-2.5 border border-amber-400 text-amber-600 rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  ↩ Send Back
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={
                    saving ||
                    (actionItems.length > 0 && resolvedItems.length < actionItems.length)
                  }
                  title={
                    actionItems.length > 0 && resolvedItems.length < actionItems.length
                      ? 'Resolve all action items first'
                      : ''
                  }
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Closing...' : '✅ Close Audit'}
                </button>
              </div>
            </div>
          )}

          {audit.status === 'Closed' && (
            <div className="space-y-2">
              <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-center">
                <p className="text-xs font-medium text-green-700">
                  ✅ Audit closed by {audit.closedBy || 'manager'}
                </p>
              </div>
              <button type="button" onClick={onClose} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_ASSIGN_AUDIT_FORM = {
  auditTypeId: '',
  category: '',
  location: '',
  branch: '',
  department: '',
  auditorId: '',
  auditorName: '',
  auditorEmail: '',
  teamMembers: [],
  startDate: '',
  endDate: '',
  notes: '',
};

function AuditList({
  audits,
  auditTypes,
  company,
  companyId,
  currentUser,
  saving,
  setSaving,
  showSuccess,
  showError,
  setShowSettings,
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    if (!companyId) return undefined;
    getDocs(collection(db, 'companies', companyId, 'employees'))
      .then((snap) => {
        setEmployees(
          snap.docs
            .filter((d) => d.data().status === 'Active')
            .map((d) => ({ id: d.id, ...d.data() })),
        );
      })
      .catch(() => setEmployees([]));
    return undefined;
  }, [companyId]);

  const [filters, setFilters] = useState({
    status: '',
    type: '',
    branch: '',
    search: '',
  });

  const [createForm, setCreateForm] = useState(() => ({ ...EMPTY_ASSIGN_AUDIT_FORM }));

  const branchOptions = company?.branches?.length ? company.branches : [];

  const filteredAudits = useMemo(() => {
    return audits.filter((audit) => {
      if (filters.status && audit.status !== filters.status) return false;
      if (filters.type && audit.auditTypeId !== filters.type) return false;
      if (filters.branch && audit.branch !== filters.branch) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        return (
          audit.title?.toLowerCase().includes(q) ||
          audit.auditTypeName?.toLowerCase().includes(q) ||
          audit.branch?.toLowerCase().includes(q) ||
          audit.auditorName?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [audits, filters]);

  const handleCreate = async () => {
    if (!createForm.auditTypeId) {
      showError('Select an audit template');
      return;
    }
    if (!createForm.auditorId) {
      showError('Select a lead auditor');
      return;
    }
    if (!createForm.endDate) {
      showError('Set an end date');
      return;
    }

    try {
      setSaving(true);

      const auditType = auditTypes.find((t) => t.id === createForm.auditTypeId);

      const checklist = (auditType?.checklistTemplate || []).map((item) => {
        const { type: _t, response: _r, riskLevel: _rl, ...rest } = item;
        return {
          ...rest,
          yesNoResponse: null,
          rating: null,
          remarks: '',
          isCompliant: null,
          ownerName: '',
          targetDate: '',
          managerComment: '',
        };
      });

      await addDoc(collection(db, 'companies', companyId, 'audits'), {
        auditTypeId: createForm.auditTypeId,
        auditTypeName: auditType?.name || '',
        auditTypeColor: auditType?.color || '#8B5CF6',
        auditCategory: auditType?.auditCategory || 'Internal',
        riskLevel: auditType?.riskLevel || 'Medium',
        title: auditType?.name || '',
        category: createForm.category,
        location: createForm.location,
        branch: createForm.branch,
        department: createForm.department,
        auditorId: createForm.auditorId,
        auditorName: createForm.auditorName.trim(),
        auditorEmail: (createForm.auditorEmail || '').trim().toLowerCase(),
        teamMembers: createForm.teamMembers,
        teamSize: 1 + createForm.teamMembers.length,
        startDate: createForm.startDate,
        endDate: createForm.endDate,
        dueDate: createForm.endDate,
        notes: createForm.notes,
        status: 'Assigned',
        checklist,
        totalItems: checklist.length,
        completedItems: 0,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.email || '',
        submittedAt: null,
        submittedBy: null,
        closedAt: null,
        closedBy: null,
        managerComments: '',
        overallScore: null,
      });

      showSuccess(
        createForm.teamMembers.length > 0
          ? `Audit assigned to ${createForm.auditorName} and team (${1 + createForm.teamMembers.length} people)!`
          : `Audit assigned to ${createForm.auditorName}!`,
      );
      setShowCreateModal(false);
      setCreateForm({ ...EMPTY_ASSIGN_AUDIT_FORM });
    } catch (e) {
      showError(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const isOverdue = (audit) => {
    if (audit.status === 'Closed') return false;
    const end = audit.endDate || audit.dueDate;
    if (!end) return false;
    return new Date(end) < new Date();
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row gap-3 mb-6 flex-wrap">
        <input
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          placeholder="Search audits..."
          className="flex-1 min-w-[160px] border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] bg-white"
        />

        <select
          value={filters.status}
          onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          className="border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
        >
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={filters.type}
          onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
          className="border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
        >
          <option value="">All Templates</option>
          {auditTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        {branchOptions.length > 0 && (
          <select
            value={filters.branch}
            onChange={(e) => setFilters((prev) => ({ ...prev, branch: e.target.value }))}
            className="border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
          >
            <option value="">All Branches</option>
            {branchOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          disabled={auditTypes.length === 0}
          title={auditTypes.length === 0 ? 'Create an audit template first' : ''}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50 whitespace-nowrap"
        >
          + Assign Audit
        </button>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Showing {filteredAudits.length} of {audits.length} audits
      </p>

      {filteredAudits.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-base font-medium text-gray-700 mb-1">
            {audits.length === 0 ? 'No audits yet' : 'No audits match filters'}
          </p>
          {audits.length === 0 && <p className="text-sm text-gray-400 mb-4">Create your first audit to get started</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAudits.map((audit) => (
            <div
              key={audit.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedAudit(audit)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setSelectedAudit(audit);
              }}
              className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-[#4ECDC4] hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div
                    className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-sm"
                    style={{ background: audit.auditTypeColor || '#8B5CF6' }}
                  >
                    {audit.auditTypeName?.charAt(0) || 'A'}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{audit.title || audit.auditTypeName}</p>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          isOverdue(audit) ? STATUS_COLORS.Overdue : STATUS_COLORS[audit.status] || STATUS_COLORS.Assigned
                        }`}
                      >
                        {isOverdue(audit) ? 'Overdue' : audit.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <p className="text-xs text-gray-400">{audit.auditTypeName}</p>
                      {audit.category && (
                        <p className="text-xs text-gray-400">
                          · {audit.category}
                        </p>
                      )}
                      {audit.branch && <p className="text-xs text-gray-400">· {audit.branch}</p>}
                      {audit.auditorName && <p className="text-xs text-gray-400">· {audit.auditorName}</p>}
                      {(audit.teamMembers?.length ?? 0) > 0 && (
                        <span className="text-xs text-gray-400">
                          · 👥 Team of {1 + audit.teamMembers.length}
                        </span>
                      )}
                      <p className="text-xs text-gray-400">
                        · End: {audit.endDate || audit.dueDate || 'Not set'}
                      </p>
                    </div>
                  </div>
                </div>

                {audit.totalItems > 0 && (
                  <div className="text-right flex-shrink-0 ml-4">
                    <p className="text-sm font-bold text-gray-700">
                      {audit.completedItems || 0}/{audit.totalItems}
                    </p>
                    <p className="text-xs text-gray-400">items done</p>
                    <div className="w-20 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-[#1B6B6B] rounded-full"
                        style={{
                          width: `${Math.round(((audit.completedItems || 0) / audit.totalItems) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#E8F5F5] rounded-xl flex items-center justify-center text-lg">🔍</div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-800">Assign Audit</h2>
                    <p className="text-xs text-gray-400">Assign an audit to an auditor for a location</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateForm({ ...EMPTY_ASSIGN_AUDIT_FORM });
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Audit Template</p>
                {auditTypes.length === 0 ? (
                  <div className="p-4 border-2 border-dashed border-gray-200 rounded-xl text-center">
                    <p className="text-sm text-gray-400">
                      No templates yet.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateModal(false);
                          setShowSettings(true);
                        }}
                        className="text-[#1B6B6B] underline"
                      >
                        Create one in Settings
                      </button>
                    </p>
                  </div>
                ) : (
                  <>
                    <select
                      value={createForm.auditTypeId}
                      onChange={(e) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          auditTypeId: e.target.value,
                        }))
                      }
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">Select audit template...</option>
                      {auditTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.auditCategory || 'Internal'} · {t.riskLevel || 'Medium'} Risk
                        </option>
                      ))}
                    </select>
                    {createForm.auditTypeId &&
                      (() => {
                        const t = auditTypes.find((x) => x.id === createForm.auditTypeId);
                        if (!t) return null;
                        return (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                t.auditCategory === 'External' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {t.auditCategory === 'External' ? '🌐' : '🏢'} {t.auditCategory || 'Internal'}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                t.riskLevel === 'Critical'
                                  ? 'bg-red-100 text-red-700'
                                  : t.riskLevel === 'High'
                                    ? 'bg-orange-100 text-orange-700'
                                    : t.riskLevel === 'Medium'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {t.riskLevel === 'Critical' && '🔴 '}
                              {t.riskLevel === 'High' && '🟠 '}
                              {t.riskLevel === 'Medium' && '🟡 '}
                              {t.riskLevel === 'Low' && '🟢 '}
                              {t.riskLevel || 'Medium'}
                            </span>
                            <span className="text-xs text-gray-400">{(t.checklistTemplate || []).length} checklist items</span>
                          </div>
                        );
                      })()}
                  </>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Location</p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Category</label>
                    <select
                      value={createForm.category}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, category: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">Select category...</option>
                      {(company?.categories || []).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Location</label>
                    <select
                      value={createForm.location}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, location: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">Select location...</option>
                      {(company?.locations || []).map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Branch</label>
                      <select
                        value={createForm.branch}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, branch: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                      >
                        <option value="">Select branch...</option>
                        {(company?.branches || []).map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Department</label>
                      <select
                        value={createForm.department}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, department: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                      >
                        <option value="">Select department...</option>
                        {(company?.departments || []).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Audit Team</p>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">
                      Lead Auditor *
                      <span className="text-gray-400 font-normal ml-1">(responsible for submission)</span>
                    </label>
                    <select
                      value={createForm.auditorId}
                      onChange={(e) => {
                        const emp = employees.find((x) => x.id === e.target.value);
                        setCreateForm((prev) => ({
                          ...prev,
                          auditorId: e.target.value,
                          auditorName: emp?.fullName || '',
                          auditorEmail: emp?.email || '',
                          teamMembers: prev.teamMembers.filter((m) => m.id !== e.target.value),
                        }));
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">Select lead auditor...</option>
                      {employees
                        .filter((e) => e.status === 'Active')
                        .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', undefined, { sensitivity: 'base' }))
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullName}
                            {emp.designation ? ` — ${emp.designation}` : emp.department ? ` — ${emp.department}` : ''}
                          </option>
                        ))}
                    </select>
                    {createForm.auditorId && (
                      <div className="mt-2 flex items-center gap-2 p-2.5 bg-[#E8F5F5] rounded-xl">
                        <div className="w-6 h-6 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {createForm.auditorName?.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-[#1B6B6B] font-medium">{createForm.auditorName}</p>
                          <p className="text-xs text-[#1B6B6B]/60">Lead Auditor</p>
                        </div>
                        <span className="text-xs bg-[#1B6B6B] text-white px-2 py-0.5 rounded-full font-medium">Lead</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">
                      Team Members
                      <span className="text-gray-400 font-normal ml-1">(optional)</span>
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        const emp = employees.find((x) => x.id === id);
                        if (!emp) return;
                        setCreateForm((prev) => {
                          if (prev.teamMembers.some((m) => m.id === id)) return prev;
                          return {
                            ...prev,
                            teamMembers: [
                              ...prev.teamMembers,
                              {
                                id: emp.id,
                                fullName: emp.fullName || '',
                                email: emp.email || '',
                                designation: emp.designation || emp.department || '',
                              },
                            ],
                          };
                        });
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">+ Add team member...</option>
                      {employees
                        .filter(
                          (e) =>
                            e.status === 'Active' &&
                            e.id !== createForm.auditorId &&
                            !createForm.teamMembers.some((m) => m.id === e.id),
                        )
                        .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', undefined, { sensitivity: 'base' }))
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullName}
                            {emp.designation ? ` — ${emp.designation}` : emp.department ? ` — ${emp.department}` : ''}
                          </option>
                        ))}
                    </select>
                    {createForm.teamMembers.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {createForm.teamMembers.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center gap-2 p-2.5 bg-gray-50 border border-gray-100 rounded-xl"
                          >
                            <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {member.fullName?.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 truncate">{member.fullName}</p>
                              {member.designation ? (
                                <p className="text-xs text-gray-400 truncate">{member.designation}</p>
                              ) : null}
                            </div>
                            <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                              Member
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setCreateForm((prev) => ({
                                  ...prev,
                                  teamMembers: prev.teamMembers.filter((m) => m.id !== member.id),
                                }))
                              }
                              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors text-sm"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {(createForm.auditorId || createForm.teamMembers.length > 0) && (
                      <div className="mt-2 p-2.5 bg-gray-50 rounded-xl">
                        <p className="text-xs text-gray-500">
                          👥 Team of <strong>{1 + createForm.teamMembers.length}</strong> — {createForm.auditorName || '—'}
                          {createForm.teamMembers.length > 0
                            ? ` + ${createForm.teamMembers.map((m) => (m.fullName || '').split(' ')[0]).join(', ')}`
                            : ''}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Schedule</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={createForm.startDate}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">End Date *</label>
                    <input
                      type="date"
                      value={createForm.endDate}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, endDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Notes for Auditor (optional)</label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any special instructions or context for the auditor..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
              {createForm.auditTypeId && createForm.auditorId && (
                <div className="mb-3 p-3 bg-[#E8F5F5] rounded-xl">
                  <p className="text-xs text-[#1B6B6B] font-medium">
                    📋 {auditTypes.find((t) => t.id === createForm.auditTypeId)?.name}
                    {' → '}
                    👥 Team of {1 + createForm.teamMembers.length}
                    {createForm.branch && ` · ${createForm.branch}`}
                    {createForm.endDate && ` · Ends ${createForm.endDate}`}
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateForm({ ...EMPTY_ASSIGN_AUDIT_FORM });
                  }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving || !createForm.auditTypeId || !createForm.auditorId}
                  className="flex-[2] px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Assigning...' : '+ Assign Audit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedAudit && (
        <AuditDetail
          key={selectedAudit.id}
          audit={selectedAudit}
          companyId={companyId}
          currentUser={currentUser}
          employees={employees}
          onClose={() => setSelectedAudit(null)}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}
    </div>
  );
}

export default function Audit() {
  const { companyId } = useParams();
  const { currentUser } = useAuth();
  const { company } = useCompany();
  const auditTemplatesRef = useRef(null);

  const [activeTab, setActiveTab] = useState('audits');
  const [showSettings, setShowSettings] = useState(false);
  const [auditTypes, setAuditTypes] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState(null);
  const showSuccess = useCallback((msg) => {
    setToast({ type: 'success', msg });
    setTimeout(() => setToast(null), 3000);
  }, []);
  const showError = useCallback((msg) => {
    setToast({ type: 'error', msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    trackPageView('Audit');
  }, []);

  useEffect(() => {
    if (!companyId) return undefined;
    const unsub = onSnapshot(
      query(collection(db, 'companies', companyId, 'auditTypes'), orderBy('createdAt', 'asc')),
      (snap) => {
        setAuditTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return undefined;
    const unsub = onSnapshot(
      query(collection(db, 'companies', companyId, 'audits'), orderBy('createdAt', 'desc')),
      (snap) => {
        setAudits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );
    return unsub;
  }, [companyId]);

  if (!companyId) {
    return <p className="p-6 text-sm text-gray-500">Missing company.</p>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading audit…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">Audit</h1>
            <p className="text-sm text-gray-400 mt-0.5">Manage audits and compliance tracking</p>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 flex-shrink-0"
          >
            ⚙️ Settings
          </button>
        </div>

        <div className="flex gap-1 mt-4 flex-wrap">
          {AUDIT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-[#E8F5F5] text-[#1B6B6B]' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'dashboard' && <AuditDashboard audits={audits} />}

        {activeTab === 'audits' && (
          <AuditList
            audits={audits}
            auditTypes={auditTypes}
            company={company}
            companyId={companyId}
            currentUser={currentUser}
            saving={saving}
            setSaving={setSaving}
            showSuccess={showSuccess}
            showError={showError}
            setShowSettings={setShowSettings}
          />
        )}
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            role="presentation"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />
          <div className="relative bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-white flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#E8F5F5] rounded-xl flex items-center justify-center text-lg">⚙️</div>
                <div>
                  <h2 className="text-base font-semibold text-gray-800">Audit Settings</h2>
                  <p className="text-xs text-gray-400">Manage audit templates and checklist configurations</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="px-6 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Audit Templates</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {auditTypes.length} template{auditTypes.length !== 1 ? 's' : ''} configured
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  auditTemplatesRef.current?.openNew();
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#1B6B6B] text-white rounded-xl text-xs font-medium hover:bg-[#155858]"
              >
                + Add Template
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {auditTypes.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                  <p className="text-3xl mb-3">📋</p>
                  <p className="text-sm font-medium text-gray-600 mb-1">No audit templates yet</p>
                  <p className="text-xs text-gray-400 mb-4">Create your first template to start assigning audits</p>
                  <button
                    type="button"
                    onClick={() => {
                      auditTemplatesRef.current?.openNew();
                    }}
                    className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium"
                  >
                    + Create Template
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {auditTypes.map((type) => (
                    <div
                      key={type.id}
                      className="bg-white border border-gray-100 rounded-2xl p-4 hover:border-gray-200 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div
                            className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-base"
                            style={{ background: type.color || '#8B5CF6' }}
                          >
                            {type.name?.charAt(0)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{type.name}</p>

                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  type.auditCategory === 'External' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {type.auditCategory === 'External' ? '🌐' : '🏢'}{' '}
                                {type.auditCategory || 'Internal'}
                              </span>

                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  type.riskLevel === 'Critical'
                                    ? 'bg-red-100 text-red-700'
                                    : type.riskLevel === 'High'
                                      ? 'bg-orange-100 text-orange-700'
                                      : type.riskLevel === 'Medium'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-green-100 text-green-700'
                                }`}
                              >
                                {type.riskLevel === 'Critical' && '🔴 '}
                                {type.riskLevel === 'High' && '🟠 '}
                                {type.riskLevel === 'Medium' && '🟡 '}
                                {type.riskLevel === 'Low' && '🟢 '}
                                {type.riskLevel || 'Medium'}
                              </span>

                              <span className="text-xs text-gray-400">
                                {(type.checklistTemplate || []).length} items
                              </span>
                            </div>

                            {type.description && (
                              <p className="text-xs text-gray-400 mt-1 truncate">{type.description}</p>
                            )}

                            {[...new Set((type.checklistTemplate || []).map((i) => i.section))].length > 0 && (
                              <div className="flex gap-1 mt-2 flex-wrap">
                                {[...new Set((type.checklistTemplate || []).map((i) => i.section))].map((section) => (
                                  <span
                                    key={section}
                                    className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full"
                                  >
                                    {section} (
                                    {(type.checklistTemplate || []).filter((i) => i.section === section).length})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-1 ml-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => auditTemplatesRef.current?.openEdit(type)}
                            className="px-3 py-1.5 text-xs text-[#1B6B6B] hover:bg-[#E8F5F5] rounded-lg transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => auditTemplatesRef.current?.deleteType(type)}
                            className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <AuditTemplates
              ref={auditTemplatesRef}
              companyId={companyId}
              currentUser={currentUser}
              saving={saving}
              setSaving={setSaving}
              showSuccess={showSuccess}
              showError={showError}
            />
          </div>
        </div>
      )}
    </div>
  );
}
