import { useState } from 'react';
import { addDoc, updateDoc, collection, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { AUDIT_COLORS, SECTION_TYPES, QA_QUESTION_TYPES, COLUMN_TYPES } from './auditHelpers';

function uid() { return '_' + Math.random().toString(36).slice(2, 9); }
function stripUndefined(obj) { return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v))); }

const RISK_LEVELS = [
  { value: 'Low',      color: '#639922' },
  { value: 'Medium',   color: '#EF9F27' },
  { value: 'High',     color: '#E8750A' },
  { value: 'Critical', color: '#E24B4A' },
];

const SECTION_META = {
  [SECTION_TYPES.CHECKLIST]: { label: 'Checklist', color: '#0F6E56', bg: '#E1F5EE' },
  [SECTION_TYPES.RECORDS]:   { label: 'Records',   color: '#185FA5', bg: '#E6F1FB' },
  [SECTION_TYPES.QA]:        { label: 'Q&A',       color: '#3C3489', bg: '#EEEDFE' },
};

const COL_TYPE_OPTS = [
  { value: COLUMN_TYPES.PREFILLED_TEXT,   label: 'Pre-filled · Text' },
  { value: COLUMN_TYPES.PREFILLED_NUMBER, label: 'Pre-filled · Number' },
  { value: COLUMN_TYPES.PREFILLED_DATE,   label: 'Pre-filled · Date' },
  { value: COLUMN_TYPES.AUDITOR_DROPDOWN, label: 'Auditor · Dropdown' },
  { value: COLUMN_TYPES.AUDITOR_TEXT,     label: 'Auditor · Text' },
  { value: COLUMN_TYPES.AUDITOR_NUMBER,   label: 'Auditor · Number' },
];

const DEFAULT_RESPONSE_OPTIONS = [
  { label: 'Pass', isPass: true,  color: '#639922' },
  { label: 'Fail', isPass: false, color: '#E24B4A' },
  { label: 'NA',   isPass: false, color: '#888780' },
];

/* ── Records column sub-builder ───────────────────────────────────────── */
function RecordsColBuilder({ section, onChange }) {
  const [newLabel, setNewLabel] = useState('');
  const [newType,  setNewType]  = useState(COLUMN_TYPES.PREFILLED_TEXT);
  const [newOpts,  setNewOpts]  = useState({});
  const cols = section.columns || [];

  const addCol = () => {
    if (!newLabel.trim()) return;
    const col = { id: uid(), label: newLabel.trim(), type: newType, isPrimary: false, ...(newType === COLUMN_TYPES.AUDITOR_DROPDOWN ? { options: [] } : {}) };
    onChange({ ...section, columns: [...cols, col] });
    setNewLabel(''); setNewType(COLUMN_TYPES.PREFILLED_TEXT);
  };
  const rmCol = (id) => onChange({ ...section, columns: cols.filter((c) => c.id !== id) });
  const upCol = (id, f, v) => onChange({ ...section, columns: cols.map((c) => c.id === id ? { ...c, [f]: v } : c) });
  const setPrim = (id) => onChange({ ...section, columns: cols.map((c) => ({ ...c, isPrimary: c.id === id })) });
  const addCOpt = (colId) => {
    const lbl = (newOpts[colId] || '').trim(); if (!lbl) return;
    const col = cols.find((c) => c.id === colId);
    upCol(colId, 'options', [...(col?.options || []), { label: lbl, isPass: false, color: '#888780' }]);
    setNewOpts((p) => ({ ...p, [colId]: '' }));
  };
  const rmCOpt  = (colId, oi) => { const col = cols.find((c) => c.id === colId); upCol(colId, 'options', (col?.options || []).filter((_, i) => i !== oi)); };
  const upCOpt  = (colId, oi, f, v) => { const col = cols.find((c) => c.id === colId); upCol(colId, 'options', (col?.options || []).map((o, i) => i === oi ? { ...o, [f]: v } : o)); };
  const isAud = (t) => [COLUMN_TYPES.AUDITOR_DROPDOWN, COLUMN_TYPES.AUDITOR_TEXT, COLUMN_TYPES.AUDITOR_NUMBER].includes(t);

  return (
    <div className="space-y-2">
      {cols.map((col) => (
        <div key={col.id} className={`border rounded-xl p-3 ${isAud(col.type) ? 'border-[#9FE1CB] bg-[#E1F5EE]/40' : 'border-gray-100 bg-gray-50'}`}>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <input value={col.label} onChange={(e) => upCol(col.id, 'label', e.target.value)} className="flex-1 min-w-[100px] text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#1B6B6B] bg-white" />
            <select value={col.type} onChange={(e) => { const t = e.target.value; upCol(col.id, 'type', t); if (t === COLUMN_TYPES.AUDITOR_DROPDOWN && !col.options) upCol(col.id, 'options', []); }} className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white">
              {COL_TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {col.type === COLUMN_TYPES.AUDITOR_NUMBER && <input value={col.unit || ''} onChange={(e) => upCol(col.id, 'unit', e.target.value)} placeholder="unit" className="w-14 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none" />}
            {isAud(col.type) && <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer"><input type="checkbox" checked={!!col.isPrimary} onChange={() => setPrim(col.id)} /> ★</label>}
            <button type="button" onClick={() => rmCol(col.id)} className="text-gray-300 hover:text-red-400">✕</button>
          </div>
          {col.type === COLUMN_TYPES.AUDITOR_DROPDOWN && (
            <div className="space-y-1.5 pl-1">
              {(col.options || []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-1.5">
                  <input type="color" value={opt.color || '#888780'} onChange={(e) => upCOpt(col.id, oi, 'color', e.target.value)} className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5" />
                  <input value={opt.label} onChange={(e) => upCOpt(col.id, oi, 'label', e.target.value)} className="flex-1 text-xs border border-gray-100 rounded-lg px-2 py-1 bg-white focus:outline-none" />
                  <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer"><input type="checkbox" checked={!!opt.isPass} onChange={(e) => upCOpt(col.id, oi, 'isPass', e.target.checked)} /> Pass</label>
                  <button type="button" onClick={() => rmCOpt(col.id, oi)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <input value={newOpts[col.id] || ''} onChange={(e) => setNewOpts((p) => ({ ...p, [col.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addCOpt(col.id)} placeholder="Option…" className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none" />
                <button type="button" onClick={() => addCOpt(col.id)} className="px-2 py-1 bg-[#1B6B6B] text-white text-xs rounded-lg">Add</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2 flex-wrap">
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCol()} placeholder="Column label…" className="flex-1 min-w-[120px] text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#1B6B6B]" />
        <select value={newType} onChange={(e) => setNewType(e.target.value)} className="text-xs border border-gray-200 rounded-xl px-2 py-2 bg-white">
          {COL_TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" onClick={addCol} className="px-3 py-2 bg-[#1B6B6B] text-white text-xs rounded-xl font-medium">Add</button>
      </div>
      {cols.some((c) => c.type === COLUMN_TYPES.AUDITOR_DROPDOWN) && !cols.some((c) => c.isPrimary) && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">★ Mark one dropdown column as Primary — it drives the compliance score</p>
      )}
    </div>
  );
}

/* ── QA question sub-builder ──────────────────────────────────────────── */
function QAQBuilder({ section, onChange }) {
  const [newQ,     setNewQ]    = useState('');
  const [newQType, setNewQType] = useState(QA_QUESTION_TYPES.TEXT);
  const [newOpts,  setNewOpts]  = useState({});
  const qs = section.questions || [];
  const addQ   = () => { if (!newQ.trim()) return; onChange({ ...section, questions: [...qs, { id: uid(), question: newQ.trim(), type: newQType, unit: '', options: [] }] }); setNewQ(''); setNewQType(QA_QUESTION_TYPES.TEXT); };
  const rmQ    = (id) => onChange({ ...section, questions: qs.filter((q) => q.id !== id) });
  const upQ    = (id, f, v) => onChange({ ...section, questions: qs.map((q) => q.id === id ? { ...q, [f]: v } : q) });
  const addOpt = (qId) => { const lbl = (newOpts[qId] || '').trim(); if (!lbl) return; const q = qs.find((q) => q.id === qId); upQ(qId, 'options', [...(q?.options || []), { label: lbl }]); setNewOpts((p) => ({ ...p, [qId]: '' })); };
  const rmOpt  = (qId, oi) => { const q = qs.find((q) => q.id === qId); upQ(qId, 'options', (q?.options || []).filter((_, i) => i !== oi)); };
  const TYPE_LABELS = { [QA_QUESTION_TYPES.TEXT]: 'Text', [QA_QUESTION_TYPES.NUMBER]: 'Number', [QA_QUESTION_TYPES.DATE]: 'Date', [QA_QUESTION_TYPES.DROPDOWN]: 'Dropdown' };

  return (
    <div className="space-y-2">
      {qs.map((q) => (
        <div key={q.id} className="border border-purple-100 bg-purple-50/20 rounded-xl p-3">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <input value={q.question} onChange={(e) => upQ(q.id, 'question', e.target.value)} className="flex-1 min-w-[160px] text-xs border border-gray-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-[#7F77DD] bg-white" />
            <select value={q.type} onChange={(e) => upQ(q.id, 'type', e.target.value)} className="text-xs border border-gray-200 rounded-xl px-2 py-2 bg-white">
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {q.type === QA_QUESTION_TYPES.NUMBER && <input value={q.unit || ''} onChange={(e) => upQ(q.id, 'unit', e.target.value)} placeholder="unit" className="w-14 text-xs border border-gray-200 rounded-xl px-2 py-2 bg-white focus:outline-none" />}
            <button type="button" onClick={() => rmQ(q.id)} className="text-gray-300 hover:text-red-400">✕</button>
          </div>
          {q.type === QA_QUESTION_TYPES.DROPDOWN && (
            <div className="space-y-1 pl-1 mt-1">
              {(q.options || []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-1.5">
                  <input value={opt.label} onChange={(e) => { const updated = (q.options || []).map((o, i) => i === oi ? { ...o, label: e.target.value } : o); upQ(q.id, 'options', updated); }} className="flex-1 text-xs border border-gray-100 rounded-lg px-2 py-1 bg-white focus:outline-none" />
                  <button type="button" onClick={() => rmOpt(q.id, oi)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <input value={newOpts[q.id] || ''} onChange={(e) => setNewOpts((p) => ({ ...p, [q.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addOpt(q.id)} placeholder="Option…" className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none" />
                <button type="button" onClick={() => addOpt(q.id)} className="px-2 py-1 bg-purple-500 text-white text-xs rounded-lg">Add</button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2 flex-wrap">
        <input value={newQ} onChange={(e) => setNewQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addQ()} placeholder="Question…" className="flex-1 min-w-[160px] text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#7F77DD]" />
        <select value={newQType} onChange={(e) => setNewQType(e.target.value)} className="text-xs border border-gray-200 rounded-xl px-2 py-2 bg-white">
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" onClick={addQ} className="px-3 py-2 bg-purple-500 text-white text-xs rounded-xl font-medium">Add</button>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */
export default function AuditSettings({ companyId, auditTypes, showSuccess, showError, onClose }) {
  const [showModal,    setShowModal]    = useState(false);
  const [editingType,  setEditingType]  = useState(null);
  const [saving,       setSaving]       = useState(false);

  /* form meta */
  const [auditCategory, setAuditCategory] = useState('Internal');
  const [templateType,  setTemplateType]  = useState(SECTION_TYPES.CHECKLIST);
  const [name,          setName]          = useState('');
  const [description,   setDescription]   = useState('');
  const [color,         setColor]         = useState(AUDIT_COLORS[0]);
  const [riskLevel,     setRiskLevel]     = useState('Medium');

  /* checklist state */
  const [clSections,    setClSections]    = useState(['General']);
  const [clItems,       setClItems]       = useState([]);
  const [newSecName,    setNewSecName]     = useState('');
  const [editSecId,     setEditSecId]      = useState(null);
  const [editSecVal,    setEditSecVal]     = useState('');
  const [addingFor,     setAddingFor]      = useState(null);
  const [newItemText,   setNewItemText]    = useState('');
  const [newItemRisk,   setNewItemRisk]    = useState('Medium');

  /* records state */
  const [recSections,   setRecSections]   = useState([{ id: uid(), name: 'Section 1', sectionType: SECTION_TYPES.RECORDS, columns: [] }]);

  /* qa state */
  const [qaSections,    setQASections]    = useState([{ id: uid(), name: 'Questions', sectionType: SECTION_TYPES.QA, questions: [] }]);

  const resetForm = () => {
    setAuditCategory('Internal'); setTemplateType(SECTION_TYPES.CHECKLIST); setName(''); setDescription('');
    setColor(AUDIT_COLORS[Math.floor(Math.random() * AUDIT_COLORS.length)]); setRiskLevel('Medium');
    setClSections(['General']); setClItems([]); setNewSecName(''); setEditSecId(null); setAddingFor(null); setNewItemText('');
    setRecSections([{ id: uid(), name: 'Section 1', sectionType: SECTION_TYPES.RECORDS, columns: [] }]);
    setQASections([{ id: uid(), name: 'Questions', sectionType: SECTION_TYPES.QA, questions: [] }]);
  };

  const openNew = () => { setEditingType(null); resetForm(); setShowModal(true); };

  const openEdit = (tmpl) => {
    setEditingType(tmpl);
    setAuditCategory(tmpl.auditCategory || 'Internal');
    setName(tmpl.name || '');
    setDescription(tmpl.description || '');
    setColor(tmpl.color || AUDIT_COLORS[0]);
    setRiskLevel(tmpl.riskLevel || 'Medium');

    if (Array.isArray(tmpl.sections) && tmpl.sections.length > 0) {
      const firstType = tmpl.sections[0]?.sectionType;
      setTemplateType(firstType || SECTION_TYPES.CHECKLIST);
      if (firstType === SECTION_TYPES.RECORDS) {
        setRecSections(tmpl.sections);
      } else if (firstType === SECTION_TYPES.QA) {
        setQASections(tmpl.sections);
      } else {
        /* unified checklist */
        const allItems = [];
        const secs = [];
        for (const sec of tmpl.sections) {
          secs.push(sec.name || 'General');
          for (const item of (sec.items || [])) allItems.push({ ...item, section: sec.name || 'General' });
        }
        setClSections(secs.length ? secs : ['General']);
        setClItems(allItems);
      }
    } else if (tmpl.templateType === 'record') {
      setTemplateType(SECTION_TYPES.RECORDS);
      setRecSections((tmpl.recordSections || []).map((s) => ({ ...s, sectionType: SECTION_TYPES.RECORDS })));
    } else {
      setTemplateType(SECTION_TYPES.CHECKLIST);
      const items = tmpl.checklistItems || [];
      const secs = [...new Set(items.map((i) => i.section || 'General'))];
      setClSections(secs.length ? secs : ['General']);
      setClItems(items);
    }
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingType(null); setAddingFor(null); setNewItemText(''); setEditSecId(null); };

  /* checklist helpers */
  const addClItem = (sec) => {
    if (!newItemText.trim()) return;
    setClItems((p) => [...p, { id: uid(), question: newItemText.trim(), section: sec, riskLevel: newItemRisk }]);
    setNewItemText(''); setNewItemRisk('Medium'); setAddingFor(null);
  };
  const rmClItem = (id) => setClItems((p) => p.filter((i) => i.id !== id));
  const upClItem = (id, field, val) => setClItems((p) => p.map((i) => i.id === id ? { ...i, [field]: val } : i));
  const addClSection = () => { if (!newSecName.trim()) return; setClSections((p) => [...p, newSecName.trim()]); setNewSecName(''); };
  const rmClSection = (sec) => { setClSections((p) => p.filter((s) => s !== sec)); setClItems((p) => p.filter((i) => i.section !== sec)); };
  const renameSection = (oldName, newName) => {
    setClSections((p) => p.map((s) => s === oldName ? newName : s));
    setClItems((p) => p.map((i) => i.section === oldName ? { ...i, section: newName } : i));
  };

  const handleSave = async () => {
    if (!name.trim()) { showError('Enter a template name'); return; }
    let sections = [];
    if (templateType === SECTION_TYPES.CHECKLIST) {
      for (const sec of clSections) {
        const items = clItems.filter((i) => i.section === sec);
        if (!items.length) { showError(`Section "${sec}" has no items`); return; }
        sections.push({ id: uid(), name: sec, sectionType: SECTION_TYPES.CHECKLIST, items, responseOptions: [...DEFAULT_RESPONSE_OPTIONS] });
      }
    } else if (templateType === SECTION_TYPES.RECORDS) {
      sections = recSections;
      for (const sec of sections) {
        const audCols = (sec.columns || []).filter((c) => [COLUMN_TYPES.AUDITOR_DROPDOWN, COLUMN_TYPES.AUDITOR_TEXT, COLUMN_TYPES.AUDITOR_NUMBER].includes(c.type));
        if (!audCols.length) { showError(`Records section "${sec.name}" needs at least one auditor column`); return; }
      }
    } else {
      sections = qaSections;
      for (const sec of sections) {
        if (!(sec.questions || []).length) { showError(`Q&A section "${sec.name}" has no questions`); return; }
      }
    }
    try {
      setSaving(true);
      const payload = stripUndefined({ name: name.trim(), color, auditCategory, riskLevel, description: description.trim() || null, sections, updatedAt: new Date() });
      if (editingType) {
        await updateDoc(doc(db, 'companies', companyId, 'auditTypes', editingType.id), payload);
        showSuccess('Template updated');
      } else {
        await addDoc(collection(db, 'companies', companyId, 'auditTypes'), { ...payload, createdAt: new Date() });
        showSuccess('Template created!');
      }
      closeModal();
    } catch (e) { showError('Save failed: ' + e.message); } finally { setSaving(false); }
  };

  /* ── sidebar list ──────────────────────────────────────────────────── */
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-800">Audit Templates</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={openNew} className="px-3 py-2 bg-[#1B6B6B] text-white text-xs rounded-xl font-medium min-h-[36px]">+ New template</button>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {(auditTypes || []).length === 0 && (
          <div className="text-center py-16">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-sm font-medium text-gray-600">No templates yet</p>
            <p className="text-xs text-gray-400 mt-1">Create your first audit template above</p>
          </div>
        )}
        {(auditTypes || []).map((tmpl) => {
          const secs = tmpl.sections || [];
          const types = [...new Set(secs.map((s) => s.sectionType).filter(Boolean))];
          const isOld = !secs.some((s) => s.sectionType);
          return (
            <div key={tmpl.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors cursor-pointer" onClick={() => openEdit(tmpl)}>
              <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ background: tmpl.color || '#1B6B6B' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{tmpl.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400">{tmpl.auditCategory || 'Internal'}</span>
                  {types.map((t) => { const m = SECTION_META[t]; return m ? (<span key={t} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: m.bg, color: m.color }}>{m.label}</span>) : null; })}
                  {isOld && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">Legacy</span>}
                </div>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">Edit →</span>
            </div>
          );
        })}
      </div>

      {/* ── MODAL ────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-8 px-4">
          <div role="presentation" className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-auto mb-8" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800">{editingType ? 'Edit Audit Template' : 'New Audit Template'}</h3>
              <button type="button" onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>

            {/* Body */}
            <div className="px-5 py-5 space-y-5">

              {/* Audit Category */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Audit Category *</label>
                <div className="grid grid-cols-2 gap-3">
                  {[{ v: 'Internal', icon: '🏢' }, { v: 'External', icon: '🌐' }].map(({ v, icon }) => (
                    <button key={v} type="button" onClick={() => setAuditCategory(v)}
                      className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2 ${auditCategory === v ? 'border-[#1B6B6B] bg-[#E8F5F5] text-[#0F6E56]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      <span>{icon}</span>{v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Type */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Template type *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: SECTION_TYPES.CHECKLIST, label: 'Checklist', sub: 'Pass/Fail per item' },
                    { v: SECTION_TYPES.RECORDS,   label: 'Records',   sub: 'Row-by-row table'  },
                    { v: SECTION_TYPES.QA,        label: 'Q&A',       sub: 'Open questions'     },
                  ].map(({ v, label, sub }) => (
                    <button key={v} type="button" onClick={() => setTemplateType(v)}
                      className={`py-3 px-2 rounded-xl border text-center transition-all ${templateType === v ? 'border-[#1B6B6B] bg-[#E8F5F5]' : 'border-gray-200 hover:border-gray-300'}`}>
                      <p className={`text-sm font-medium ${templateType === v ? 'text-[#0F6E56]' : 'text-gray-700'}`}>{label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Template Name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cash Handling Audit"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Description (optional)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description..."
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
              </div>

              {/* Color + Risk Level side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Color</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {AUDIT_COLORS.map((c) => (
                      <button key={c} type="button" onClick={() => setColor(c)}
                        className={`w-6 h-6 rounded-full transition-all flex-shrink-0 ${color === c ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'hover:scale-105'}`}
                        style={{ background: c }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Risk Level</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {RISK_LEVELS.map((r) => (
                      <button key={r.value} type="button" onClick={() => setRiskLevel(r.value)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${riskLevel === r.value ? 'border-[#1B6B6B] bg-[#E8F5F5] text-[#0F6E56]' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                        {r.value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── CHECKLIST BUILDER ──────────────────────────────── */}
              {templateType === SECTION_TYPES.CHECKLIST && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Checklist</span>
                    <span className="text-xs text-gray-400">{clItems.length} item{clItems.length !== 1 ? 's' : ''}</span>
                  </div>

                  {clSections.map((sec) => {
                    const items = clItems.filter((i) => i.section === sec);
                    return (
                      <div key={sec} className="mb-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            {editSecId === sec ? (
                              <input value={editSecVal} onChange={(e) => setEditSecVal(e.target.value)}
                                onBlur={() => { if (editSecVal.trim() && editSecVal !== sec) renameSection(sec, editSecVal.trim()); setEditSecId(null); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { if (editSecVal.trim() && editSecVal !== sec) renameSection(sec, editSecVal.trim()); setEditSecId(null); } if (e.key === 'Escape') setEditSecId(null); }}
                                className="text-sm font-semibold text-gray-800 border-b border-[#1B6B6B] bg-transparent focus:outline-none w-32" autoFocus />
                            ) : (
                              <>
                                <span className="text-sm font-semibold text-gray-800">{sec}</span>
                                <button type="button" onClick={() => { setEditSecId(sec); setEditSecVal(sec); }} className="text-gray-300 hover:text-gray-500 text-sm">✏️</button>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => { setAddingFor(sec); setNewItemText(''); setNewItemRisk('Medium'); }} className="text-xs text-[#1B6B6B] font-medium hover:underline">+ Add item</button>
                            {clSections.length > 1 && <button type="button" onClick={() => rmClSection(sec)} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
                          </div>
                        </div>

                        <div className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden">
                          {items.map((item, idx) => (
                            <div key={item.id} className={`flex items-center gap-2 px-3 py-2.5 ${idx < items.length - 1 || addingFor === sec ? 'border-b border-gray-100' : ''}`}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: RISK_LEVELS.find((r) => r.value === item.riskLevel)?.color || '#888780' }} />
                              <input value={item.question} onChange={(e) => upClItem(item.id, 'question', e.target.value)}
                                className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none" />
                              <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded flex-shrink-0">{item.riskLevel}</span>
                              <button type="button" onClick={() => rmClItem(item.id)} className="text-gray-300 hover:text-red-400 flex-shrink-0">✕</button>
                            </div>
                          ))}

                          {addingFor === sec ? (
                            <div className="flex items-center gap-2 px-3 py-2.5">
                              <input value={newItemText} onChange={(e) => setNewItemText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') addClItem(sec); if (e.key === 'Escape') setAddingFor(null); }}
                                placeholder="Checklist item..." autoFocus
                                className="flex-1 text-sm bg-transparent focus:outline-none" />
                              <select value={newItemRisk} onChange={(e) => setNewItemRisk(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white flex-shrink-0">
                                {RISK_LEVELS.map((r) => <option key={r.value}>{r.value}</option>)}
                              </select>
                              <button type="button" onClick={() => addClItem(sec)} className="text-xs text-white bg-[#1B6B6B] font-medium px-2.5 py-1 rounded-lg flex-shrink-0">Add</button>
                              <button type="button" onClick={() => setAddingFor(null)} className="text-xs text-gray-400 flex-shrink-0">✕</button>
                            </div>
                          ) : items.length === 0 ? (
                            <button type="button" onClick={() => { setAddingFor(sec); setNewItemText(''); }} className="w-full py-4 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                              + Add first item
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex gap-2">
                    <input value={newSecName} onChange={(e) => setNewSecName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addClSection()}
                      placeholder="New section name..."
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                    <button type="button" onClick={addClSection} className="px-4 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium">+ Section</button>
                  </div>
                </div>
              )}

              {/* ── RECORDS BUILDER ────────────────────────────────── */}
              {templateType === SECTION_TYPES.RECORDS && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sections &amp; Columns</span>
                    <span className="text-xs text-gray-400">{recSections.reduce((n, s) => n + (s.columns || []).length, 0)} columns total</span>
                  </div>
                  {recSections.map((sec) => (
                    <div key={sec.id} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                      <div className="bg-gray-50 px-3 py-2.5 flex items-center gap-2 border-b border-gray-100">
                        <input value={sec.name} onChange={(e) => setRecSections((p) => p.map((s) => s.id === sec.id ? { ...s, name: e.target.value } : s))}
                          className="flex-1 text-sm font-medium bg-transparent focus:outline-none" placeholder="Section name" />
                        {recSections.length > 1 && <button type="button" onClick={() => setRecSections((p) => p.filter((s) => s.id !== sec.id))} className="text-xs text-red-400 hover:text-red-600">Remove</button>}
                      </div>
                      <div className="p-3">
                        <RecordsColBuilder section={sec} onChange={(updated) => setRecSections((p) => p.map((s) => s.id === sec.id ? updated : s))} />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setRecSections((p) => [...p, { id: uid(), name: `Section ${p.length + 1}`, sectionType: SECTION_TYPES.RECORDS, columns: [] }])}
                    className="w-full py-2.5 border border-dashed border-gray-200 rounded-xl text-xs text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors">
                    + Add section
                  </button>
                </div>
              )}

              {/* ── Q&A BUILDER ────────────────────────────────────── */}
              {templateType === SECTION_TYPES.QA && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Questions</span>
                    <span className="text-xs text-gray-400">{qaSections.reduce((n, s) => n + (s.questions || []).length, 0)} total</span>
                  </div>
                  {qaSections.map((sec) => (
                    <div key={sec.id} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                      <div className="bg-purple-50/50 px-3 py-2.5 flex items-center gap-2 border-b border-purple-100">
                        <input value={sec.name} onChange={(e) => setQASections((p) => p.map((s) => s.id === sec.id ? { ...s, name: e.target.value } : s))}
                          className="flex-1 text-sm font-medium bg-transparent focus:outline-none" placeholder="Section name" />
                        {qaSections.length > 1 && <button type="button" onClick={() => setQASections((p) => p.filter((s) => s.id !== sec.id))} className="text-xs text-red-400">Remove</button>}
                      </div>
                      <div className="p-3">
                        <QAQBuilder section={sec} onChange={(updated) => setQASections((p) => p.map((s) => s.id === sec.id ? updated : s))} />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setQASections((p) => [...p, { id: uid(), name: `Section ${p.length + 1}`, sectionType: SECTION_TYPES.QA, questions: [] }])}
                    className="w-full py-2.5 border border-dashed border-purple-200 rounded-xl text-xs text-purple-400 hover:border-purple-400 transition-colors">
                    + Add section
                  </button>
                  <p className="text-xs text-gray-400 mt-2">Q&amp;A answers are informational — not scored.</p>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
              <button type="button" onClick={closeModal} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving} className="flex-1 py-3 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50">
                {saving ? 'Saving…' : editingType ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
