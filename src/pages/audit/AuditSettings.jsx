import { useState, useCallback } from 'react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { AUDIT_COLORS, SECTION_TYPES, QA_QUESTION_TYPES, COLUMN_TYPES } from './auditHelpers';

function uid() { return '_' + Math.random().toString(36).slice(2, 9); }
function stripUndefined(obj) { return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v))); }

const RISK_LEVELS = ['Low', 'Medium', 'High', 'Critical'];
const AUDIT_CATEGORIES = ['Internal', 'External', 'Both'];
const DEFAULT_RESPONSE_OPTIONS = [
  { label: 'Pass', isPass: true, color: '#639922' },
  { label: 'Fail', isPass: false, color: '#E24B4A' },
  { label: 'NA',   isPass: false, color: '#888780' },
];
const SECTION_META = {
  [SECTION_TYPES.CHECKLIST]: { label: 'Checklist', color: '#0F6E56', bg: '#E1F5EE', icon: '📋', desc: 'Pass / Fail questions with scoring' },
  [SECTION_TYPES.RECORDS]:   { label: 'Records',   color: '#185FA5', bg: '#E6F1FB', icon: '📊', desc: 'Table rows — pre-filled by manager, filled by auditor' },
  [SECTION_TYPES.QA]:        { label: 'Q&A',       color: '#3C3489', bg: '#EEEDFE', icon: '❓', desc: 'Open questions — text, number, date or dropdown answers' },
};
const COL_TYPE_OPTS = [
  { value: COLUMN_TYPES.PREFILLED_TEXT,   label: 'Pre-filled · Text' },
  { value: COLUMN_TYPES.PREFILLED_NUMBER, label: 'Pre-filled · Number' },
  { value: COLUMN_TYPES.PREFILLED_DATE,   label: 'Pre-filled · Date' },
  { value: COLUMN_TYPES.AUDITOR_DROPDOWN, label: 'Auditor · Dropdown' },
  { value: COLUMN_TYPES.AUDITOR_TEXT,     label: 'Auditor · Text' },
  { value: COLUMN_TYPES.AUDITOR_NUMBER,   label: 'Auditor · Number' },
];

/* ─── Checklist section builder ─────────────────────────────────────────── */
function ChecklistBuilder({ section, onChange }) {
  const [newQ, setNewQ] = useState('');
  const [newRisk, setNewRisk] = useState('Medium');
  const items = section.items || [];
  const opts  = section.responseOptions || DEFAULT_RESPONSE_OPTIONS;

  const addItem = () => { if (!newQ.trim()) return; onChange({ ...section, items: [...items, { id: uid(), question: newQ.trim(), section: section.name, riskLevel: newRisk }] }); setNewQ(''); setNewRisk('Medium'); };
  const rmItem  = (id) => onChange({ ...section, items: items.filter((i) => i.id !== id) });
  const upItem  = (id, f, v) => onChange({ ...section, items: items.map((i) => i.id === id ? { ...i, [f]: v } : i) });
  const addOpt  = () => onChange({ ...section, responseOptions: [...opts, { label: '', isPass: false, color: '#888780' }] });
  const upOpt   = (idx, f, v) => onChange({ ...section, responseOptions: opts.map((o, i) => i === idx ? { ...o, [f]: v } : o) });
  const rmOpt   = (idx) => onChange({ ...section, responseOptions: opts.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Response options</p>
        <div className="space-y-1.5">
          {opts.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input type="color" value={opt.color || '#888780'} onChange={(e) => upOpt(idx, 'color', e.target.value)} className="w-7 h-7 rounded border border-gray-200 cursor-pointer flex-shrink-0 p-0.5" />
              <input value={opt.label} onChange={(e) => upOpt(idx, 'label', e.target.value)} placeholder="Label" className="flex-1 text-xs border border-gray-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-[#1B6B6B]" />
              <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer flex-shrink-0">
                <input type="checkbox" checked={!!opt.isPass} onChange={(e) => upOpt(idx, 'isPass', e.target.checked)} /> Pass
              </label>
              <button type="button" onClick={() => rmOpt(idx)} className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400">✕</button>
            </div>
          ))}
          <button type="button" onClick={addOpt} className="text-xs text-[#1B6B6B] hover:underline">+ Add option</button>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Items · {items.length}</p>
        <div className="space-y-1.5 mb-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded-xl">
              <input value={item.question} onChange={(e) => upItem(item.id, 'question', e.target.value)} className="flex-1 text-xs bg-transparent border-none outline-none text-gray-700 leading-relaxed min-w-0" />
              <select value={item.riskLevel || 'Medium'} onChange={(e) => upItem(item.id, 'riskLevel', e.target.value)} className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 flex-shrink-0 bg-white">
                {RISK_LEVELS.map((r) => <option key={r}>{r}</option>)}
              </select>
              <button type="button" onClick={() => rmItem(item.id)} className="w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400 flex-shrink-0">✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newQ} onChange={(e) => setNewQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} placeholder="New item…" className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#1B6B6B]" />
          <select value={newRisk} onChange={(e) => setNewRisk(e.target.value)} className="text-xs border border-gray-200 rounded-xl px-2 py-2 bg-white">
            {RISK_LEVELS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <button type="button" onClick={addItem} className="px-3 py-2 bg-[#1B6B6B] text-white text-xs rounded-xl font-medium">Add</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Records section builder ────────────────────────────────────────────── */
function RecordsBuilder({ section, onChange }) {
  const [newLabel, setNewLabel] = useState('');
  const [newType,  setNewType]  = useState(COLUMN_TYPES.PREFILLED_TEXT);
  const [newOpts,  setNewOpts]  = useState({});

  const cols = section.columns || [];
  const addCol   = () => { if (!newLabel.trim()) return; const col = { id: uid(), label: newLabel.trim(), type: newType, isPrimary: false, ...(newType === COLUMN_TYPES.AUDITOR_DROPDOWN && { options: [] }) }; onChange({ ...section, columns: [...cols, col] }); setNewLabel(''); setNewType(COLUMN_TYPES.PREFILLED_TEXT); };
  const rmCol    = (id) => onChange({ ...section, columns: cols.filter((c) => c.id !== id) });
  const upCol    = (id, f, v) => onChange({ ...section, columns: cols.map((c) => c.id === id ? { ...c, [f]: v } : c) });
  const setPrim  = (id) => onChange({ ...section, columns: cols.map((c) => ({ ...c, isPrimary: c.id === id })) });
  const addCOpt  = (colId) => { const lbl = (newOpts[colId] || '').trim(); if (!lbl) return; const col = cols.find((c) => c.id === colId); upCol(colId, 'options', [...(col?.options || []), { label: lbl, isPass: false, color: '#888780' }]); setNewOpts((p) => ({ ...p, [colId]: '' })); };
  const rmCOpt   = (colId, oi) => { const col = cols.find((c) => c.id === colId); upCol(colId, 'options', (col?.options || []).filter((_, i) => i !== oi)); };
  const upCOpt   = (colId, oi, f, v) => { const col = cols.find((c) => c.id === colId); upCol(colId, 'options', (col?.options || []).map((o, i) => i === oi ? { ...o, [f]: v } : o)); };

  const isAuditor = (t) => [COLUMN_TYPES.AUDITOR_DROPDOWN, COLUMN_TYPES.AUDITOR_TEXT, COLUMN_TYPES.AUDITOR_NUMBER].includes(t);
  const hasPrimary = cols.some((c) => c.isPrimary);
  const hasAuditorDropdown = cols.some((c) => c.type === COLUMN_TYPES.AUDITOR_DROPDOWN);

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Columns · {cols.length}</p>
      {cols.map((col) => (
        <div key={col.id} className={`border rounded-xl p-3 ${isAuditor(col.type) ? 'border-[#9FE1CB] bg-[#E1F5EE]/40' : 'border-gray-100 bg-gray-50'}`}>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <input value={col.label} onChange={(e) => upCol(col.id, 'label', e.target.value)} className="flex-1 min-w-[100px] text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#1B6B6B] bg-white" />
            <select value={col.type} onChange={(e) => { const t = e.target.value; upCol(col.id, 'type', t); if (t === COLUMN_TYPES.AUDITOR_DROPDOWN && !col.options) upCol(col.id, 'options', []); }} className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white flex-shrink-0">
              {COL_TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {col.type === COLUMN_TYPES.AUDITOR_NUMBER && (
              <input value={col.unit || ''} onChange={(e) => upCol(col.id, 'unit', e.target.value)} placeholder="unit" className="w-14 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none flex-shrink-0" />
            )}
            {isAuditor(col.type) && (
              <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer flex-shrink-0" title="Primary scoring column">
                <input type="checkbox" checked={!!col.isPrimary} onChange={() => setPrim(col.id)} /> ★ Primary
              </label>
            )}
            <button type="button" onClick={() => rmCol(col.id)} className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 flex-shrink-0">✕</button>
          </div>
          {col.type === COLUMN_TYPES.AUDITOR_DROPDOWN && (
            <div className="space-y-1.5 pl-1">
              {(col.options || []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-1.5">
                  <input type="color" value={opt.color || '#888780'} onChange={(e) => upCOpt(col.id, oi, 'color', e.target.value)} className="w-6 h-6 rounded border border-gray-200 cursor-pointer flex-shrink-0 p-0.5" />
                  <input value={opt.label} onChange={(e) => upCOpt(col.id, oi, 'label', e.target.value)} className="flex-1 text-xs border border-gray-100 rounded-lg px-2 py-1 bg-white focus:outline-none" />
                  <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer flex-shrink-0">
                    <input type="checkbox" checked={!!opt.isPass} onChange={(e) => upCOpt(col.id, oi, 'isPass', e.target.checked)} /> Pass
                  </label>
                  <button type="button" onClick={() => rmCOpt(col.id, oi)} className="w-5 h-5 text-gray-300 hover:text-red-400">✕</button>
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
      {hasAuditorDropdown && !hasPrimary && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">★ Mark one dropdown column as Primary — it drives the compliance score</p>
      )}
    </div>
  );
}

/* ─── Q&A section builder ────────────────────────────────────────────────── */
function QABuilder({ section, onChange }) {
  const [newQ,     setNewQ]    = useState('');
  const [newQType, setNewQType] = useState(QA_QUESTION_TYPES.TEXT);
  const [newOpts,  setNewOpts]  = useState({});

  const qs = section.questions || [];
  const addQ    = () => { if (!newQ.trim()) return; onChange({ ...section, questions: [...qs, { id: uid(), question: newQ.trim(), type: newQType, unit: '', options: [] }] }); setNewQ(''); setNewQType(QA_QUESTION_TYPES.TEXT); };
  const rmQ     = (id) => onChange({ ...section, questions: qs.filter((q) => q.id !== id) });
  const upQ     = (id, f, v) => onChange({ ...section, questions: qs.map((q) => q.id === id ? { ...q, [f]: v } : q) });
  const addOpt  = (qId) => { const lbl = (newOpts[qId] || '').trim(); if (!lbl) return; const q = qs.find((q) => q.id === qId); upQ(qId, 'options', [...(q?.options || []), { label: lbl }]); setNewOpts((p) => ({ ...p, [qId]: '' })); };
  const rmOpt   = (qId, oi) => { const q = qs.find((q) => q.id === qId); upQ(qId, 'options', (q?.options || []).filter((_, i) => i !== oi)); };

  const TYPE_LABELS = { [QA_QUESTION_TYPES.TEXT]: 'Text', [QA_QUESTION_TYPES.NUMBER]: 'Number', [QA_QUESTION_TYPES.DATE]: 'Date', [QA_QUESTION_TYPES.DROPDOWN]: 'Dropdown' };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Questions · {qs.length} <span className="normal-case font-normal text-gray-300">— answers are informational, not scored</span></p>
      {qs.map((q) => (
        <div key={q.id} className="border border-purple-100 bg-purple-50/20 rounded-xl p-3">
          <div className="flex items-start gap-2 mb-2 flex-wrap">
            <input value={q.question} onChange={(e) => upQ(q.id, 'question', e.target.value)} className="flex-1 min-w-[160px] text-xs border border-gray-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-[#7F77DD] bg-white" />
            <select value={q.type} onChange={(e) => upQ(q.id, 'type', e.target.value)} className="text-xs border border-gray-200 rounded-xl px-2 py-2 bg-white flex-shrink-0">
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {q.type === QA_QUESTION_TYPES.NUMBER && (
              <input value={q.unit || ''} onChange={(e) => upQ(q.id, 'unit', e.target.value)} placeholder="unit" className="w-16 text-xs border border-gray-200 rounded-xl px-2 py-2 bg-white focus:outline-none flex-shrink-0" />
            )}
            <button type="button" onClick={() => rmQ(q.id)} className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-400 flex-shrink-0">✕</button>
          </div>
          {q.type === QA_QUESTION_TYPES.DROPDOWN && (
            <div className="space-y-1.5 pl-1">
              {(q.options || []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-300 flex-shrink-0" />
                  <input value={opt.label} onChange={(e) => { const updated = (q.options || []).map((o, i) => i === oi ? { ...o, label: e.target.value } : o); upQ(q.id, 'options', updated); }} className="flex-1 text-xs border border-gray-100 rounded-lg px-2 py-1 bg-white focus:outline-none" />
                  <button type="button" onClick={() => rmOpt(q.id, oi)} className="w-5 h-5 text-gray-300 hover:text-red-400">✕</button>
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

/* ─── Main AuditSettings component ──────────────────────────────────────── */
export default function AuditSettings({ companyId, auditTypes, showSuccess, showError, onClose }) {
  const [view, setView] = useState('list');          // 'list' | 'edit'
  const [editingType, setEditingType] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSectionMenu, setShowSectionMenu] = useState(false);

  const [tmplName,     setTmplName]     = useState('');
  const [tmplColor,    setTmplColor]    = useState(AUDIT_COLORS[0]);
  const [tmplCategory, setTmplCategory] = useState('Internal');
  const [tmplRisk,     setTmplRisk]     = useState('Medium');
  const [tmplDesc,     setTmplDesc]     = useState('');
  const [sections,     setSections]     = useState([]);

  const openNew = () => {
    setEditingType(null);
    setTmplName('');
    setTmplColor(AUDIT_COLORS[Math.floor(Math.random() * AUDIT_COLORS.length)]);
    setTmplCategory('Internal');
    setTmplRisk('Medium');
    setTmplDesc('');
    setSections([]);
    setView('edit');
  };

  const openEdit = (tmpl) => {
    setEditingType(tmpl);
    setTmplName(tmpl.name || '');
    setTmplColor(tmpl.color || AUDIT_COLORS[0]);
    setTmplCategory(tmpl.auditCategory || 'Internal');
    setTmplRisk(tmpl.riskLevel || 'Medium');
    setTmplDesc(tmpl.description || '');
    // Migrate old formats to unified sections
    if (Array.isArray(tmpl.sections) && tmpl.sections.some((s) => s.sectionType)) {
      setSections(tmpl.sections);
    } else if (tmpl.templateType === 'record' && Array.isArray(tmpl.recordSections)) {
      setSections(tmpl.recordSections.map((s) => ({ ...s, sectionType: SECTION_TYPES.RECORDS })));
    } else if (Array.isArray(tmpl.checklistItems) && tmpl.checklistItems.length > 0) {
      setSections([{ id: uid(), name: tmpl.name || 'Checklist', sectionType: SECTION_TYPES.CHECKLIST, items: tmpl.checklistItems, responseOptions: DEFAULT_RESPONSE_OPTIONS }]);
    } else {
      setSections([]);
    }
    setView('edit');
  };

  const goBack = () => { setView('list'); setEditingType(null); setSections([]); setTmplName(''); };

  const addSection = (type) => {
    const meta = SECTION_META[type];
    const existing = sections.filter((s) => s.sectionType === type).length;
    setSections((prev) => [...prev, {
      id: uid(),
      name: `${meta.label}${existing > 0 ? ` ${existing + 1}` : ''}`,
      sectionType: type,
      ...(type === SECTION_TYPES.CHECKLIST && { items: [], responseOptions: [...DEFAULT_RESPONSE_OPTIONS.map((o) => ({ ...o }))] }),
      ...(type === SECTION_TYPES.RECORDS   && { columns: [] }),
      ...(type === SECTION_TYPES.QA        && { questions: [] }),
    }]);
    setShowSectionMenu(false);
  };

  const updateSection = useCallback((id, updated) => setSections((prev) => prev.map((s) => s.id === id ? updated : s)), []);
  const removeSection = (id) => setSections((prev) => prev.filter((s) => s.id !== id));

  const handleSave = async () => {
    if (!tmplName.trim()) { showError('Template name is required'); return; }
    if (sections.length === 0) { showError('Add at least one section'); return; }
    for (const sec of sections) {
      if (sec.sectionType === SECTION_TYPES.CHECKLIST && !(sec.items || []).length) { showError(`"${sec.name}" has no checklist items`); return; }
      if (sec.sectionType === SECTION_TYPES.RECORDS) {
        const auditorCols = (sec.columns || []).filter((c) => [COLUMN_TYPES.AUDITOR_DROPDOWN, COLUMN_TYPES.AUDITOR_TEXT, COLUMN_TYPES.AUDITOR_NUMBER].includes(c.type));
        if (!auditorCols.length) { showError(`Records section "${sec.name}" needs at least one auditor column`); return; }
      }
      if (sec.sectionType === SECTION_TYPES.QA && !(sec.questions || []).length) { showError(`"${sec.name}" has no questions`); return; }
    }
    try {
      setSaving(true);
      const payload = stripUndefined({ name: tmplName.trim(), color: tmplColor, auditCategory: tmplCategory, riskLevel: tmplRisk, description: tmplDesc.trim() || null, sections, updatedAt: new Date() });
      if (editingType) {
        await updateDoc(doc(db, 'companies', companyId, 'auditTypes', editingType.id), payload);
        showSuccess('Template updated');
      } else {
        const ref = doc(db, 'companies', companyId, 'auditTypes', uid());
        await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
        showSuccess('Template created');
      }
      goBack();
    } catch (e) {
      showError('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  /* ── List view ─────────────────────────────────────────────────────────── */
  if (view === 'list') {
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
                    <span className="text-gray-200 text-xs">·</span>
                    {isOld && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Legacy · will auto-migrate on edit</span>}
                    {types.map((t) => { const m = SECTION_META[t]; return m ? (<span key={t} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: m.bg, color: m.color }}>{m.label}</span>) : null; })}
                    {secs.length > 0 && <span className="text-xs text-gray-400">{secs.length} section{secs.length !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">Edit →</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Editor view ───────────────────────────────────────────────────────── */
  return (
    <div className="h-full flex flex-col" onClick={() => showSectionMenu && setShowSectionMenu(false)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button type="button" onClick={goBack} className="text-gray-400 hover:text-gray-600 text-lg leading-none min-w-[44px] min-h-[44px] flex items-center justify-center">←</button>
          <h2 className="text-sm font-semibold text-gray-800">{editingType ? 'Edit template' : 'New template'}</h2>
        </div>
        <button type="button" onClick={handleSave} disabled={saving} className="px-4 py-2 bg-[#1B6B6B] text-white text-xs rounded-xl font-medium disabled:opacity-50 min-h-[36px]">{saving ? 'Saving…' : 'Save template'}</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        {/* Meta */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-3 flex-wrap">
            <input value={tmplName} onChange={(e) => setTmplName(e.target.value)} placeholder="Template name *" className="flex-1 min-w-[180px] text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#1B6B6B]" />
            <div className="flex gap-1.5 flex-wrap pt-0.5">
              {AUDIT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setTmplColor(c)} className="w-6 h-6 rounded-full border-2 transition-all flex-shrink-0" style={{ background: c, borderColor: tmplColor === c ? '#374151' : 'transparent' }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <select value={tmplCategory} onChange={(e) => setTmplCategory(e.target.value)} className="flex-1 min-w-[120px] text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#1B6B6B] bg-white">
              {AUDIT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={tmplRisk} onChange={(e) => setTmplRisk(e.target.value)} className="flex-1 min-w-[120px] text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-[#1B6B6B] bg-white">
              {RISK_LEVELS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <textarea value={tmplDesc} onChange={(e) => setTmplDesc(e.target.value)} rows={2} placeholder="Description (optional)" className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-[#1B6B6B]" />
        </div>

        {/* Sections */}
        {sections.map((sec) => {
          const meta = SECTION_META[sec.sectionType] || {};
          return (
            <div key={sec.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                <span className="text-sm flex-shrink-0" aria-hidden="true">{meta.icon}</span>
                <input value={sec.name} onChange={(e) => updateSection(sec.id, { ...sec, name: e.target.value })} className="flex-1 text-sm font-medium border-none outline-none text-gray-800 bg-transparent min-w-0" />
                <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                <button type="button" onClick={() => removeSection(sec.id)} className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors flex-shrink-0" aria-label="Remove section">✕</button>
              </div>
              <div className="p-4">
                {sec.sectionType === SECTION_TYPES.CHECKLIST && <ChecklistBuilder section={sec} onChange={(u) => updateSection(sec.id, u)} />}
                {sec.sectionType === SECTION_TYPES.RECORDS   && <RecordsBuilder   section={sec} onChange={(u) => updateSection(sec.id, u)} />}
                {sec.sectionType === SECTION_TYPES.QA        && <QABuilder        section={sec} onChange={(u) => updateSection(sec.id, u)} />}
              </div>
            </div>
          );
        })}

        {/* Add section button + flyout */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setShowSectionMenu((v) => !v)} className="w-full py-3.5 border-2 border-dashed border-gray-200 rounded-2xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors">
            + Add section
          </button>
          {showSectionMenu && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl z-30 p-2 overflow-hidden">
              {Object.entries(SECTION_META).map(([type, meta]) => (
                <button key={type} type="button" onClick={() => addSection(type)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                  <span className="text-xl flex-shrink-0" aria-hidden="true">{meta.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{meta.label}</p>
                    <p className="text-xs text-gray-400">{meta.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
