import { useState, useEffect, useMemo, useCallback } from 'react';
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
  if (next.riskLevel == null || next.riskLevel === '') next.riskLevel = 'Medium';
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
    if (!a.dueDate) return false;
    return new Date(a.dueDate) < new Date();
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
                    {audit.branch || audit.location || '—'} · Due: {audit.dueDate || '—'}
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

function AuditTemplates({ auditTypes, companyId, currentUser, saving, setSaving, showSuccess, showError }) {
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [selectedColor, setSelectedColor] = useState(AUDIT_COLORS[0]);
  const [form, setForm] = useState({
    auditCategory: '',
    name: '',
    description: '',
    color: AUDIT_COLORS[0],
  });
  const [checklist, setChecklist] = useState([]);
  const [newSection, setNewSection] = useState('');
  const [sections, setSections] = useState(['General']);

  const resetForm = () => {
    setForm({ auditCategory: '', name: '', description: '', color: AUDIT_COLORS[0] });
    setChecklist([]);
    setSections(['General']);
    setSelectedColor(AUDIT_COLORS[0]);
    setEditingType(null);
  };

  const openEdit = (type) => {
    setEditingType(type);
    setForm({
      auditCategory: type.auditCategory || 'Internal',
      name: type.name,
      description: type.description || '',
      color: type.color || AUDIT_COLORS[0],
    });
    setSelectedColor(type.color || AUDIT_COLORS[0]);
    const tpl = (type.checklistTemplate || []).map((i) => {
      const { type: _t, ...rest } = i;
      return {
        ...rest,
        riskLevel: i.riskLevel || 'Medium',
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
      riskLevel: 'Medium',
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
        const { type: _omit, response: _r, ...rest } = item;
        return { ...rest, order: idx, riskLevel: item.riskLevel || 'Medium' };
      });
      const data = {
        auditCategory: form.auditCategory,
        name: form.name.trim(),
        description: form.description.trim(),
        color: selectedColor,
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Audit Templates</h2>
          <p className="text-sm text-gray-400">Define audit templates and their checklist items</p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]"
        >
          + Add Audit Template
        </button>
      </div>

      {auditTypes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-base font-medium text-gray-700 mb-1">No audit templates yet</p>
          <p className="text-sm text-gray-400 mb-4">Create your first audit template with a checklist</p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium"
          >
            + Create Audit Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {auditTypes.map((type) => (
            <div
              key={type.id}
              className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold"
                    style={{ background: type.color || '#8B5CF6' }}
                  >
                    {type.name?.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{type.name}</p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          type.auditCategory === 'Internal' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}
                      >
                        {type.auditCategory || 'Internal'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{(type.checklistTemplate || []).length} items</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => openEdit(type)} className="text-xs text-[#1B6B6B] hover:underline px-2">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(type)} className="text-xs text-red-400 hover:text-red-600 px-2">
                    Delete
                  </button>
                </div>
              </div>

              {type.description && <p className="text-xs text-gray-400 mb-3">{type.description}</p>}

              {[...new Set((type.checklistTemplate || []).map((i) => i.section))]
                .slice(0, 3)
                .map((section) => (
                  <div key={section} className="flex items-center justify-between py-1.5 border-t border-gray-50">
                    <span className="text-xs text-gray-500">{section}</span>
                    <span className="text-xs text-gray-300">
                      {(type.checklistTemplate || []).filter((i) => i.section === section).length} items
                    </span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

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
                      {cat === 'Internal' ? '🏢 Internal Audit' : '🌐 External Audit'}
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

              {form.auditCategory && (
                <>
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
                      placeholder="Brief description of this audit template"
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
                </>
              )}

              {form.auditCategory && form.name.trim() && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist Template</label>
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
                                <select
                                  value={item.riskLevel || 'Medium'}
                                  onChange={(e) => updateItem(item.id, 'riskLevel', e.target.value)}
                                  className={`border rounded-lg px-2 py-1.5 text-xs font-medium ${
                                    (item.riskLevel || 'Medium') === 'Critical'
                                      ? 'bg-red-50 border-red-200 text-red-700'
                                      : (item.riskLevel || 'Medium') === 'High'
                                        ? 'bg-orange-50 border-orange-200 text-orange-700'
                                        : (item.riskLevel || 'Medium') === 'Medium'
                                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                                          : 'bg-green-50 border-green-200 text-green-700'
                                  }`}
                                >
                                  <option value="Low">🟢 Low</option>
                                  <option value="Medium">🟡 Medium</option>
                                  <option value="High">🟠 High</option>
                                  <option value="Critical">🔴 Critical</option>
                                </select>
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
              )}
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
    </div>
  );
}

function AuditDetail({ audit, companyId, currentUser, onClose, showSuccess, showError }) {
  const [checklist, setChecklist] = useState(() => (audit.checklist || []).map(normalizeChecklistItem));
  const [saving, setSaving] = useState(false);
  const [managerComment, setManagerComment] = useState(audit.managerComments || '');

  useEffect(() => {
    setChecklist((audit.checklist || []).map(normalizeChecklistItem));
    setManagerComment(audit.managerComments || '');
  }, [audit.id]);

  const completedCount = useMemo(() => checklist.filter((i) => itemFullyAnswered(i)).length, [checklist]);

  const updateItemResponse = (id, field, value) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleSaveDraft = async () => {
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        checklist,
        completedItems: completedCount,
        status: audit.status === 'Assigned' ? 'In Progress' : audit.status,
        lastSavedAt: serverTimestamp(),
        lastSavedBy: currentUser?.email || '',
      });
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
        status: 'Closed',
        closedAt: serverTimestamp(),
        closedBy: currentUser?.email || '',
        managerComments: managerComment,
      });
      showSuccess('Audit closed!');
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

  const isReadOnly =
    audit.status === 'Submitted' || audit.status === 'Under Review' || audit.status === 'Closed';

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
            <p className="text-xs text-gray-400">
              {audit.branch || audit.location || '—'} · Due: {audit.dueDate || 'Not set'} · Auditor: {audit.auditorName || '—'}
            </p>
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isReadOnly && (
            <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl flex items-center gap-2">
              <span>🔒</span>
              <p className="text-sm text-gray-500">This audit has been submitted — checklist is read-only.</p>
            </div>
          )}

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
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="text-xs font-medium text-gray-400 mt-0.5 w-5 flex-shrink-0">{idx + 1}.</span>
                          <p className="text-sm font-medium text-gray-800">
                            {item.question}
                            {item.required && <span className="text-red-400 ml-1">*</span>}
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            item.riskLevel === 'Critical'
                              ? 'bg-red-100 text-red-700'
                              : item.riskLevel === 'High'
                                ? 'bg-orange-100 text-orange-700'
                                : item.riskLevel === 'Medium'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {item.riskLevel === 'Critical' && '🔴 '}
                          {item.riskLevel === 'High' && '🟠 '}
                          {item.riskLevel === 'Medium' && '🟡 '}
                          {item.riskLevel === 'Low' && '🟢 '}
                          {item.riskLevel || 'Medium'}
                        </span>
                      </div>

                      <div className="ml-7 space-y-3">
                        <div>
                          <p className="text-xs text-gray-400 mb-1.5 font-medium">Compliance Check</p>
                          <div className="flex gap-2">
                            {['Yes', 'No', 'N/A'].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => updateItemResponse(item.id, 'yesNoResponse', opt)}
                                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                  item.yesNoResponse === opt
                                    ? opt === 'Yes'
                                      ? 'bg-green-500 text-white'
                                      : opt === 'No'
                                        ? 'bg-red-500 text-white'
                                        : 'bg-gray-500 text-white'
                                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                } ${isReadOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
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
                                disabled={isReadOnly}
                                onClick={() => updateItemResponse(item.id, 'rating', n)}
                                className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                                  item.rating === n ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                } ${isReadOnly ? 'cursor-not-allowed' : 'cursor-pointer'}`}
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
                            disabled={isReadOnly}
                            onChange={(e) => updateItemResponse(item.id, 'remarks', e.target.value)}
                            placeholder="Remarks / observations..."
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] disabled:bg-gray-50"
                          />
                        </div>

                        {item.yesNoResponse === 'No' && (
                          <div className="p-3 bg-red-50 rounded-lg border border-red-100 space-y-2">
                            <p className="text-xs font-medium text-red-700">⚠️ Non-compliant — assign owner to fix</p>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                value={item.ownerName || ''}
                                disabled={isReadOnly}
                                onChange={(e) => updateItemResponse(item.id, 'ownerName', e.target.value)}
                                placeholder="Owner name"
                                className="border rounded-lg px-3 py-2 text-xs bg-white focus:outline-none"
                              />
                              <input
                                type="date"
                                value={item.targetDate || ''}
                                disabled={isReadOnly}
                                onChange={(e) => updateItemResponse(item.id, 'targetDate', e.target.value)}
                                className="border rounded-lg px-3 py-2 text-xs bg-white focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}

          {(audit.status === 'Submitted' || audit.status === 'Under Review' || audit.status === 'Closed') && (
            <div className="pt-4 border-t border-gray-100">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Manager Comments</label>
              <textarea
                value={managerComment}
                onChange={(e) => setManagerComment(e.target.value)}
                disabled={audit.status === 'Closed'}
                rows={3}
                placeholder="Add review comments..."
                className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B] disabled:bg-gray-50"
              />
            </div>
          )}
        </div>

        <div className="p-6 border-t flex-shrink-0">
          {(audit.status === 'Assigned' || audit.status === 'In Progress') && (
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">
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
                {saving ? 'Submitting...' : '✅ Submit'}
              </button>
            </div>
          )}

          {(audit.status === 'Submitted' || audit.status === 'Under Review') && (
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
                disabled={saving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Closing...' : '✅ Close Audit'}
              </button>
            </div>
          )}

          {audit.status === 'Closed' && (
            <button type="button" onClick={onClose} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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

  const [createForm, setCreateForm] = useState({
    auditTypeId: '',
    title: '',
    location: '',
    branch: '',
    department: '',
    auditorId: '',
    auditorName: '',
    auditorEmail: '',
    auditorDesignation: '',
    startDate: '',
    dueDate: '',
    notes: '',
  });

  const branchOptions = company?.branches?.length ? company.branches : [];
  const locationOptions = company?.locations || [];
  const departmentOptions = company?.departments?.length ? company.departments : [];

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
    if (!createForm.dueDate) {
      showError('Set a due date');
      return;
    }

    try {
      setSaving(true);

      const auditType = auditTypes.find((t) => t.id === createForm.auditTypeId);

      const checklist = (auditType?.checklistTemplate || []).map((item) => {
        const { type: _t, response: _r, ...rest } = item;
        return {
          ...rest,
          riskLevel: item.riskLevel || 'Medium',
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
        auditCategory: auditType?.auditCategory || 'Internal',
        auditTypeColor: auditType?.color || '#8B5CF6',
        title: createForm.title.trim() || auditType?.name || '',
        location: createForm.location,
        branch: createForm.branch,
        department: createForm.department,
        auditorId: createForm.auditorId || '',
        auditorName: createForm.auditorName.trim(),
        auditorEmail: (createForm.auditorEmail || '').trim().toLowerCase(),
        auditorDesignation: createForm.auditorDesignation || '',
        startDate: createForm.startDate,
        dueDate: createForm.dueDate,
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

      showSuccess('Audit created and assigned!');
      setShowCreateModal(false);
      setCreateForm({
        auditTypeId: '',
        title: '',
        location: '',
        branch: '',
        department: '',
        auditorId: '',
        auditorName: '',
        auditorEmail: '',
        auditorDesignation: '',
        startDate: '',
        dueDate: '',
        notes: '',
      });
    } catch (e) {
      showError(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const isOverdue = (audit) => {
    if (audit.status === 'Closed') return false;
    if (!audit.dueDate) return false;
    return new Date(audit.dueDate) < new Date();
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
          + New Audit
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
                      {audit.branch && <p className="text-xs text-gray-400">· {audit.branch}</p>}
                      {audit.auditorName && <p className="text-xs text-gray-400">· {audit.auditorName}</p>}
                      <p className="text-xs text-gray-400">· Due: {audit.dueDate || 'Not set'}</p>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">Create New Audit</h2>
              <button type="button" onClick={() => setShowCreateModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Audit Template *</label>
                <select
                  value={createForm.auditTypeId}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, auditTypeId: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">Select audit template...</option>
                  {auditTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {(t.checklistTemplate || []).length} items
                    </option>
                  ))}
                </select>
                {createForm.auditTypeId &&
                  (() => {
                    const t = auditTypes.find((x) => x.id === createForm.auditTypeId);
                    if (!t) return null;
                    return (
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            t.auditCategory === 'Internal' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {t.auditCategory || 'Internal'}
                        </span>
                        <span className="text-xs text-gray-400">{(t.checklistTemplate || []).length} checklist items</span>
                      </div>
                    );
                  })()}
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Audit Title (optional)</label>
                <input
                  value={createForm.title}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Leave blank to use template name"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Branch</label>
                  <select
                    value={createForm.branch}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, branch: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                  >
                    <option value="">Select branch...</option>
                    {branchOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Location</label>
                  <select
                    value={createForm.location}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, location: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                  >
                    <option value="">Select location...</option>
                    {locationOptions.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Department</label>
                <select
                  value={createForm.department}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, department: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">Select department...</option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Assign Auditor</label>
                <select
                  value={createForm.auditorId}
                  onChange={(e) => {
                    const emp = employees.find((x) => x.id === e.target.value);
                    setCreateForm((prev) => ({
                      ...prev,
                      auditorId: e.target.value,
                      auditorName: emp?.fullName || '',
                      auditorEmail: emp?.email || '',
                      auditorDesignation: emp?.designation || '',
                    }));
                  }}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">Select auditor...</option>
                  {[...employees]
                    .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', undefined, { sensitivity: 'base' }))
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} — {emp.designation || emp.department || ''}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1.5">Due Date *</label>
                  <input
                    type="date"
                    value={createForm.dueDate}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Notes (optional)</label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any instructions for the auditor..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>
            </div>

            <div className="p-6 border-t flex-shrink-0 flex gap-3">
              <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Audit'}
              </button>
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
          />
        )}
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            role="presentation"
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowSettings(false)}
          />
          <div className="relative bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">Audit Settings</h2>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 p-6">
              <AuditTemplates
                auditTypes={auditTypes}
                companyId={companyId}
                currentUser={currentUser}
                saving={saving}
                setSaving={setSaving}
                showSuccess={showSuccess}
                showError={showError}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
