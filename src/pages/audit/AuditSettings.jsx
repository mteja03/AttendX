import { useState, useMemo } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { AUDIT_COLORS, normaliseAuditCategory, TEMPLATE_TYPES, COLUMN_TYPES } from './auditHelpers';

export default function AuditSettings({ auditTypes, companyId, currentUser, onClose, showSuccess, showError }) {
  const { userRole, auditScope } = useAuth();
  const isAuditManager = userRole === 'auditmanager';

  const visibleTemplates = useMemo(() => {
    return auditTypes.filter((t) => {
      if (!isAuditManager) return true;
      if (import.meta.env.DEV && isAuditManager && !auditScope) {
        console.warn('[AuditSettings] auditScope is null for auditmanager — showing all.');
      }
      if (!auditScope || auditScope === 'both') return true;
      const cat = (t.auditCategory || 'internal').toLowerCase().trim();
      if (auditScope === 'internal') return cat === 'internal';
      if (auditScope === 'external') return cat === 'external';
      return true;
    });
  }, [auditTypes, isAuditManager, auditScope]);

  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ auditCategory: '', name: '', description: '', color: AUDIT_COLORS[0], riskLevel: 'Medium' });
  const [checklistItems, setChecklistItems] = useState([]);
  const [sections, setSections] = useState(['General']);
  const [newSection, setNewSection] = useState('');
  const [editingSection, setEditingSection] = useState(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [recordSections, setRecordSections] = useState([]);

  const resetForm = () => {
    const defaultCategory = isAuditManager && auditScope === 'internal' ? 'Internal' : isAuditManager && auditScope === 'external' ? 'External' : '';
    setForm({ auditCategory: defaultCategory, name: '', description: '', color: AUDIT_COLORS[0], riskLevel: 'Medium', templateType: TEMPLATE_TYPES.CHECKLIST });
    setChecklistItems([]);
    setSections(['General']);
    setNewSection('');
    setEditingType(null);
    setEditingSection(null);
    setEditSectionName('');
    setRecordSections([]);
  };

  const openEdit = (type) => {
    setEditingSection(null);
    setEditSectionName('');
    setEditingType(type);
    setForm({ auditCategory: type.auditCategory || '', name: type.name || '', description: type.description || '', color: type.color || AUDIT_COLORS[0], riskLevel: type.riskLevel || 'Medium', templateType: type.templateType || TEMPLATE_TYPES.CHECKLIST });
    setChecklistItems(type.checklistItems || []);
    const sects = [...new Set((type.checklistItems || []).map((i) => i.section))];
    setSections(sects.length > 0 ? sects : ['General']);
    setRecordSections(type.recordSections || []);
    setShowModal(true);
  };

  const addItem = (section) => setChecklistItems((prev) => [...prev, { id: 'item_' + Date.now(), section, question: '', riskLevel: 'Medium', order: prev.length }]);
  const updateItem = (id, field, value) => setChecklistItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  const removeItem = (id) => setChecklistItems((prev) => prev.filter((i) => i.id !== id));

  const handleSave = async () => {
    if (!form.auditCategory) { showError('Select Internal or External'); return; }
    if (!form.name.trim()) { showError('Enter template name'); return; }
    if (form.templateType === TEMPLATE_TYPES.RECORD) {
      if (recordSections.length === 0) { showError('Add at least one section'); return; }
      const hasDropdown = recordSections.some((s) => (s.columns || []).some((c) => c.type === COLUMN_TYPES.AUDITOR_DROPDOWN));
      if (!hasDropdown) { showError('Add at least one auditor dropdown column'); return; }
      const hasPrimary = recordSections.some((s) => (s.columns || []).some((c) => c.isPrimary));
      if (!hasPrimary) { showError('Mark one dropdown column as the scoring column (★)'); return; }
    }
    try {
      setSaving(true);
      const base = {
        templateType: form.templateType || TEMPLATE_TYPES.CHECKLIST,
        auditCategory: normaliseAuditCategory(form.auditCategory),
        name: form.name.trim(),
        description: form.description.trim(),
        color: form.color,
        riskLevel: form.riskLevel,
        updatedAt: new Date(),
        updatedBy: currentUser?.email || '',
      };
      const stripUndefined = (val) => {
        if (Array.isArray(val)) return val.map(stripUndefined);
        if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
          const r = {};
          Object.entries(val).forEach(([k, v]) => { if (v !== undefined) r[k] = stripUndefined(v); });
          return r;
        }
        return val;
      };
      const rawData = form.templateType === TEMPLATE_TYPES.RECORD
        ? { ...base, recordSections, checklistItems: [] }
        : { ...base, checklistItems, recordSections: [] };
      const data = stripUndefined(rawData);
      if (editingType) {
        await updateDoc(doc(db, 'companies', companyId, 'auditTypes', editingType.id), data);
        showSuccess('Template updated!');
      } else {
        await addDoc(collection(db, 'companies', companyId, 'auditTypes'), { ...data, createdAt: new Date(), createdBy: currentUser?.email || '' });
        showSuccess('Template created!');
      }
      setShowModal(false);
      resetForm();
    } catch (e) { showError('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (type) => {
    if (!window.confirm(`Delete "${type.name}"?`)) return;
    try { await deleteDoc(doc(db, 'companies', companyId, 'auditTypes', type.id)); showSuccess('Template deleted'); } catch { showError('Failed to delete'); }
  };

  const duplicateType = async (type) => {
    try {
      const { id: _omit, ...typeData } = type;
      const cleanDup = (val) => {
        if (Array.isArray(val)) return val.map(cleanDup);
        if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
          const r = {};
          Object.entries(val).forEach(([k, v]) => { if (v !== undefined) r[k] = cleanDup(v); });
          return r;
        }
        return val;
      };
      await addDoc(collection(db, 'companies', companyId, 'auditTypes'), cleanDup({ ...typeData, name: `Copy of ${type.name}`, createdAt: new Date() }));
      showSuccess(`"Copy of ${type.name}" created`);
    } catch (e) {
      if (import.meta.env.DEV) console.error('Duplicate type error', e);
      showError('Failed to duplicate template');
    }
  };

  const OPTION_COLORS = ['#639922', '#E24B4A', '#EF9F27', '#378ADD', '#7F77DD', '#888780'];
  const COLUMN_TYPE_OPTIONS = [
    { value: COLUMN_TYPES.PREFILLED_TEXT, label: 'Pre-filled · text' },
    { value: COLUMN_TYPES.PREFILLED_NUMBER, label: 'Pre-filled · number' },
    { value: COLUMN_TYPES.PREFILLED_DATE, label: 'Pre-filled · date' },
    { value: COLUMN_TYPES.AUDITOR_DROPDOWN, label: 'Auditor · dropdown' },
    { value: COLUMN_TYPES.AUDITOR_TEXT, label: 'Auditor · free text' },
  ];

  const addRecordSection = () => {
    setRecordSections((prev) => [...prev, { id: `sec_${Date.now()}`, name: `Section ${prev.length + 1}`, columns: [] }]);
  };

  const updateRecordSectionName = (sId, name) => {
    setRecordSections((prev) => prev.map((s) => s.id === sId ? { ...s, name } : s));
  };

  const removeRecordSection = (sId) => {
    setRecordSections((prev) => prev.filter((s) => s.id !== sId));
  };

  const addRecordColumn = (sId, type = COLUMN_TYPES.PREFILLED_TEXT) => {
    const col = {
      id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      label: '', type, widthHint: 'N',
      ...(type === COLUMN_TYPES.AUDITOR_DROPDOWN ? { options: [{ label: '', color: '#639922', isPass: true }], isPrimary: false } : {}),
    };
    setRecordSections((prev) => prev.map((s) => s.id === sId ? { ...s, columns: [...s.columns, col] } : s));
  };

  const updateRecordColumn = (sId, cId, patch) => {
    setRecordSections((prev) => {
      const applyPatch = (col) => {
        const merged = { ...col, ...patch };
        Object.keys(merged).forEach((k) => { if (merged[k] === undefined) delete merged[k]; });
        return merged;
      };
      if (patch.isPrimary === true) {
        return prev.map((s) => ({
          ...s,
          columns: s.columns.map((c) => s.id === sId && c.id === cId ? applyPatch(c) : { ...c, isPrimary: false }),
        }));
      }
      return prev.map((s) => s.id !== sId ? s : { ...s, columns: s.columns.map((c) => c.id === cId ? applyPatch(c) : c) });
    });
  };

  const removeRecordColumn = (sId, cId) => {
    setRecordSections((prev) => prev.map((s) => s.id === sId ? { ...s, columns: s.columns.filter((c) => c.id !== cId) } : s));
  };

  const addDropdownOption = (sId, cId) => {
    setRecordSections((prev) => prev.map((s) => s.id !== sId ? s : {
      ...s, columns: s.columns.map((c) => c.id !== cId ? c : { ...c, options: [...(c.options || []), { label: '', color: '#888780', isPass: false }] }),
    }));
  };

  const updateDropdownOption = (sId, cId, idx, patch) => {
    setRecordSections((prev) => prev.map((s) => s.id !== sId ? s : {
      ...s, columns: s.columns.map((c) => {
        if (c.id !== cId) return c;
        const opts = (c.options || []).map((o, i) => {
          const updated = i === idx ? { ...o, ...patch } : o;
          if (patch.isPass === true && i !== idx) return { ...updated, isPass: false };
          return updated;
        });
        return { ...c, options: opts };
      }),
    }));
  };

  const removeDropdownOption = (sId, cId, idx) => {
    setRecordSections((prev) => prev.map((s) => s.id !== sId ? s : {
      ...s, columns: s.columns.map((c) => c.id !== cId ? c : { ...c, options: (c.options || []).filter((_, i) => i !== idx) }),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <div className="relative bg-white w-full max-w-2xl h-full flex flex-col shadow-sm">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#E8F5F5] rounded-xl flex items-center justify-center text-lg">⚙️</div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Audit Settings</h2>
              <p className="text-xs text-gray-400">{visibleTemplates.length} template{visibleTemplates.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-700">Audit Templates</p>
            <button type="button" onClick={() => { resetForm(); setShowModal(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-[#1B6B6B] text-white rounded-xl text-xs font-medium hover:bg-[#155858]">+ Add Template</button>
          </div>

          {visibleTemplates.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
              <p className="text-3xl mb-3">📋</p>
              <p className="text-sm font-medium text-gray-600 mb-1">{auditTypes.length > 0 && isAuditManager ? 'No templates in your scope' : 'No templates yet'}</p>
              <p className="text-xs text-gray-400 mb-4">Create your first audit template to get started</p>
              <button type="button" onClick={() => { resetForm(); setShowModal(true); }} className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium">+ Create Template</button>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleTemplates.map((type) => (
                <div key={type.id} className="bg-white border border-gray-100 rounded-2xl p-4 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-base" style={{ background: type.color || '#8B5CF6' }}>{type.name?.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{type.name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {type.templateType === TEMPLATE_TYPES.RECORD && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[#E8F5F5] text-[#0F6E56]">Records</span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${type.auditCategory === 'External' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {type.auditCategory === 'External' ? '🌐' : '🏢'} {type.auditCategory}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${type.riskLevel === 'Critical' ? 'bg-red-100 text-red-700' : type.riskLevel === 'High' ? 'bg-orange-100 text-orange-700' : type.riskLevel === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {type.riskLevel === 'Critical' && '🔴 '}{type.riskLevel === 'High' && '🟠 '}{type.riskLevel === 'Medium' && '🟡 '}{type.riskLevel === 'Low' && '🟢 '}{type.riskLevel || 'Medium'}
                          </span>
                          <span className="text-xs text-gray-400">{(type.checklistItems || []).length} items</span>
                        </div>
                        {type.description && <p className="text-xs text-gray-400 mt-1 truncate">{type.description}</p>}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {[...new Set((type.checklistItems || []).map((i) => i.section))].map((s) => (
                            <span key={s} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{s} ({(type.checklistItems || []).filter((i) => i.section === s).length})</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button type="button" onClick={() => openEdit(type)} className="rounded-xl px-3 py-1.5 text-xs text-[#1B6B6B] hover:bg-[#E8F5F5]">Edit</button>
                      <button type="button" onClick={() => duplicateType(type)} className="rounded-xl px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100">Copy</button>
                      <button type="button" onClick={() => handleDelete(type)} className="rounded-xl px-3 py-1.5 text-xs text-red-400 hover:bg-red-50">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowModal(false); resetForm(); }} role="presentation" />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">{editingType ? 'Edit Template' : 'New Audit Template'}</h2>
              <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Audit Category *</label>
                <div className="grid grid-cols-2 gap-3">
                  {['Internal', 'External'].filter((cat) => {
                    if (!isAuditManager) return true;
                    if (auditScope === 'internal') return cat === 'Internal';
                    if (auditScope === 'external') return cat === 'External';
                    return true;
                  }).map((cat) => (
                    <button key={cat} type="button" onClick={() => setForm((prev) => ({ ...prev, auditCategory: cat }))}
                      className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${form.auditCategory === cat ? 'border-[#1B6B6B] bg-[#E8F5F5] text-[#1B6B6B]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {cat === 'Internal' ? '🏢 Internal' : '🌐 External'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Template type *</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: TEMPLATE_TYPES.CHECKLIST, label: 'Checklist', sub: 'Pass / Fail per question' },
                    { value: TEMPLATE_TYPES.RECORD, label: 'Records', sub: 'Row-by-row data review' },
                  ].map((t) => (
                    <button key={t.value} type="button" onClick={() => setForm((prev) => ({ ...prev, templateType: t.value }))}
                      className={`py-3 px-4 rounded-xl border-2 text-sm transition-all text-left ${form.templateType === t.value ? 'border-[#1B6B6B] bg-[#E8F5F5]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      <p className={`font-medium ${form.templateType === t.value ? 'text-[#0F6E56]' : ''}`}>{t.label}</p>
                      <p className="text-xs font-normal mt-0.5 text-gray-400">{t.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Template Name *</label>
                <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Cash Handling Audit"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20" />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Description (optional)</label>
                <input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Brief description..."
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20" />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {AUDIT_COLORS.map((color) => (
                    <button key={color} type="button" onClick={() => setForm((prev) => ({ ...prev, color }))}
                      className={`w-8 h-8 rounded-full transition-all ${form.color === color ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'}`}
                      style={{ background: color }} />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Risk Level</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'Low', icon: '🟢', cls: 'border-green-200 text-green-700', active: 'bg-green-500 border-green-500 text-white' },
                    { value: 'Medium', icon: '🟡', cls: 'border-amber-200 text-amber-700', active: 'bg-amber-500 border-amber-500 text-white' },
                    { value: 'High', icon: '🟠', cls: 'border-orange-200 text-orange-700', active: 'bg-orange-500 border-orange-500 text-white' },
                    { value: 'Critical', icon: '🔴', cls: 'border-red-200 text-red-700', active: 'bg-red-500 border-red-500 text-white' },
                  ].map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setForm((prev) => ({ ...prev, riskLevel: opt.value }))}
                      className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${form.riskLevel === opt.value ? opt.active : `bg-white ${opt.cls} hover:opacity-80`}`}>
                      {opt.icon} {opt.value}
                    </button>
                  ))}
                </div>
              </div>

              {form.templateType === TEMPLATE_TYPES.RECORD ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sections &amp; columns</label>
                    <span className="text-xs text-gray-400">{recordSections.reduce((n, s) => n + s.columns.length, 0)} columns total</span>
                  </div>

                  {recordSections.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-xl mb-3">
                      <p className="text-xs text-gray-400">No sections yet — add one to define your record structure</p>
                    </div>
                  )}

                  {recordSections.map((sec) => (
                    <div key={sec.id} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                      <div className="bg-gray-50 px-3 py-2.5 flex items-center gap-2 border-b border-gray-100">
                        <input value={sec.name} onChange={(e) => updateRecordSectionName(sec.id, e.target.value)}
                          className="flex-1 text-sm font-medium bg-transparent focus:outline-none min-w-0"
                          placeholder="Section name" />
                        {recordSections.length > 1 && (
                          <button type="button" onClick={() => removeRecordSection(sec.id)} className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">Remove</button>
                        )}
                      </div>

                      {sec.columns.map((col) => (
                        <div key={col.id} className="px-3 py-3 border-b border-gray-50 last:border-b-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <input value={col.label} onChange={(e) => updateRecordColumn(sec.id, col.id, { label: e.target.value })}
                              placeholder="Column name"
                              className="flex-1 min-w-[100px] text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#1B6B6B]" />
                            <select value={col.type} onChange={(e) => {
                              const t = e.target.value;
                              const patch = { type: t };
                              if (t === COLUMN_TYPES.AUDITOR_DROPDOWN && !col.options) patch.options = [{ label: '', color: '#639922', isPass: true }];
                              if (t !== COLUMN_TYPES.AUDITOR_DROPDOWN) { patch.options = undefined; patch.isPrimary = false; }
                              updateRecordColumn(sec.id, col.id, patch);
                            }}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#1B6B6B] flex-shrink-0">
                              {COLUMN_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <button type="button" onClick={() => removeRecordColumn(sec.id, col.id)} className="text-gray-300 hover:text-red-500 text-sm flex-shrink-0">✕</button>
                          </div>

                          {col.type === COLUMN_TYPES.AUDITOR_DROPDOWN && (
                            <div className="ml-0 mt-2 bg-gray-50 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                                <span className="text-xs text-gray-400">Options &nbsp;·&nbsp; ★ = counts as pass for scoring</span>
                                <button type="button" onClick={() => updateRecordColumn(sec.id, col.id, { isPrimary: !col.isPrimary })}
                                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors flex-shrink-0 ${col.isPrimary ? 'bg-amber-50 text-amber-700 border-amber-300' : 'border-gray-200 text-gray-400 hover:border-amber-300 hover:text-amber-600'}`}>
                                  ★ {col.isPrimary ? 'Scoring column' : 'Set as scoring'}
                                </button>
                              </div>
                              {(col.options || []).map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-2 mb-2">
                                  <div className="flex gap-1 flex-shrink-0">
                                    {OPTION_COLORS.map((clr) => (
                                      <button key={clr} type="button" onClick={() => updateDropdownOption(sec.id, col.id, idx, { color: clr })}
                                        className={`w-4 h-4 rounded-full flex-shrink-0 transition-all ${opt.color === clr ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-110'}`}
                                        style={{ background: clr }} />
                                    ))}
                                  </div>
                                  <input value={opt.label} onChange={(e) => updateDropdownOption(sec.id, col.id, idx, { label: e.target.value })}
                                    placeholder="Option label"
                                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#1B6B6B] min-w-0 bg-white" />
                                  <button type="button" onClick={() => updateDropdownOption(sec.id, col.id, idx, { isPass: !opt.isPass })}
                                    title="Mark as passing option"
                                    className={`text-base flex-shrink-0 transition-colors ${opt.isPass ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'}`}>★</button>
                                  {(col.options || []).length > 1 && (
                                    <button type="button" onClick={() => removeDropdownOption(sec.id, col.id, idx)} className="text-gray-300 hover:text-red-500 text-sm flex-shrink-0">✕</button>
                                  )}
                                </div>
                              ))}
                              <button type="button" onClick={() => addDropdownOption(sec.id, col.id)}
                                className="text-xs text-[#1B6B6B] hover:underline mt-1">+ Add option</button>
                            </div>
                          )}
                        </div>
                      ))}

                      <div className="px-3 py-2 bg-white">
                        <select defaultValue="" onChange={(e) => { if (e.target.value) { addRecordColumn(sec.id, e.target.value); e.target.value = ''; } }}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#1B6B6B] w-full text-gray-500">
                          <option value="" disabled>+ Add column…</option>
                          {COLUMN_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={addRecordSection}
                    className="w-full py-2.5 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors">
                    + Add section
                  </button>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist</label>
                    <span className="text-xs text-gray-400">{checklistItems.length} items</span>
                  </div>

                {sections.map((section) => (
                  <div key={section} className="mb-5">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
                      {editingSection === section ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input value={editSectionName} onChange={(e) => setEditSectionName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editSectionName.trim()) {
                                const newName = editSectionName.trim();
                                setSections((prev) => prev.map((s) => (s === section ? newName : s)));
                                setChecklistItems((prev) => prev.map((i) => (i.section === section ? { ...i, section: newName } : i)));
                                setEditingSection(null);
                              }
                              if (e.key === 'Escape') setEditingSection(null);
                            }}
                            autoFocus
                            className="min-w-0 flex-1 rounded-xl border border-[#1B6B6B] px-2 py-0.5 text-sm font-semibold focus:outline-none" />
                          <button type="button" onClick={() => {
                            const newName = editSectionName.trim();
                            if (!newName) return;
                            setSections((prev) => prev.map((s) => (s === section ? newName : s)));
                            setChecklistItems((prev) => prev.map((i) => (i.section === section ? { ...i, section: newName } : i)));
                            setEditingSection(null);
                          }} className="text-xs text-[#1B6B6B] shrink-0">✓</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <h4 className="text-sm font-semibold text-gray-700 truncate">{section}</h4>
                          <button type="button" onClick={() => { setEditingSection(section); setEditSectionName(section); }} className="text-gray-300 hover:text-gray-500 text-xs shrink-0" aria-label="Rename section">✏️</button>
                        </div>
                      )}
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <button type="button" onClick={() => addItem(section)} className="text-xs text-[#1B6B6B] hover:underline">+ Add item</button>
                        {sections.length > 1 && (
                          <button type="button" onClick={() => { setSections((prev) => prev.filter((s) => s !== section)); setChecklistItems((prev) => prev.filter((i) => i.section !== section)); if (editingSection === section) setEditingSection(null); }} className="text-xs text-red-400 hover:text-red-600 hover:underline">Remove section</button>
                        )}
                      </div>
                    </div>

                    {checklistItems.filter((i) => i.section === section).map((item) => (
                      <div key={item.id} className="flex gap-2 mb-2 p-3 bg-gray-50 rounded-xl items-start">
                        <div className="flex-1 space-y-2">
                          <input value={item.question} onChange={(e) => updateItem(item.id, 'question', e.target.value)} placeholder="Checklist item..."
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none" />
                          <select value={item.riskLevel || 'Medium'} onChange={(e) => updateItem(item.id, 'riskLevel', e.target.value)}
                            className={`rounded-xl border px-2 py-1.5 text-xs font-medium ${item.riskLevel === 'Critical' ? 'bg-red-50 border-red-200 text-red-700' : item.riskLevel === 'High' ? 'bg-orange-50 border-orange-200 text-orange-700' : item.riskLevel === 'Medium' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                            <option value="Low">🟢 Low</option>
                            <option value="Medium">🟡 Medium</option>
                            <option value="High">🟠 High</option>
                            <option value="Critical">🔴 Critical</option>
                          </select>
                        </div>
                        <button type="button" onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 mt-2 flex-shrink-0">✕</button>
                      </div>
                    ))}

                    {checklistItems.filter((i) => i.section === section).length === 0 && (
                      <button type="button" onClick={() => addItem(section)} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors">+ Add first item</button>
                    )}
                  </div>
                ))}

                <div className="flex gap-2">
                  <input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="New section name..."
                    onKeyDown={(e) => { if (e.key === 'Enter' && newSection.trim()) { setSections((prev) => [...prev, newSection.trim()]); setNewSection(''); } }}
                    className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                  <button type="button" onClick={() => { if (!newSection.trim()) return; setSections((prev) => [...prev, newSection.trim()]); setNewSection(''); }} className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm">+ Section</button>
                </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t flex-shrink-0 flex gap-3">
              <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50">
                {saving ? 'Saving...' : editingType ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
