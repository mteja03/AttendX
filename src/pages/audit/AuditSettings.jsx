import { useState } from 'react';
import { addDoc, updateDoc, deleteDoc, getDocs, query, where, limit, collection, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { AUDIT_COLORS, SECTION_TYPES, QA_QUESTION_TYPES, COLUMN_TYPES, SECTION_META, RISK_LEVELS, moveArr } from './auditHelpers';

function uid() { return '_' + Math.random().toString(36).slice(2, 9); }
function stripUndefined(obj) { return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v))); }

const COL_TYPE_OPTS = [
  { value: COLUMN_TYPES.PREFILLED_TEXT,   label: 'Pre-filled · Text' },
  { value: COLUMN_TYPES.PREFILLED_NUMBER, label: 'Pre-filled · Number' },
  { value: COLUMN_TYPES.PREFILLED_DATE,   label: 'Pre-filled · Date' },
  { value: COLUMN_TYPES.AUDITOR_DROPDOWN, label: 'Auditor · Dropdown' },
  { value: COLUMN_TYPES.AUDITOR_TEXT,     label: 'Auditor · Text' },
  { value: COLUMN_TYPES.AUDITOR_NUMBER,   label: 'Auditor · Number' },
  { value: COLUMN_TYPES.AUDITOR_DATE,     label: 'Auditor · Date' },
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
  const addCOpt = (colId) => {
    const lbl = (newOpts[colId] || '').trim(); if (!lbl) return;
    const col = cols.find((c) => c.id === colId);
    upCol(colId, 'options', [...(col?.options || []), { label: lbl, isPass: false, color: '#888780' }]);
    setNewOpts((p) => ({ ...p, [colId]: '' }));
  };
  const rmCOpt  = (colId, oi) => { const col = cols.find((c) => c.id === colId); upCol(colId, 'options', (col?.options || []).filter((_, i) => i !== oi)); };
  const upCOpt  = (colId, oi, f, v) => { const col = cols.find((c) => c.id === colId); upCol(colId, 'options', (col?.options || []).map((o, i) => i === oi ? { ...o, [f]: v } : o)); };
  const isAud = (t) => [COLUMN_TYPES.AUDITOR_DROPDOWN, COLUMN_TYPES.AUDITOR_TEXT, COLUMN_TYPES.AUDITOR_NUMBER, COLUMN_TYPES.AUDITOR_DATE].includes(t);

  return (
    <div className="space-y-2">
      {cols.map((col) => (
        <div key={col.id} className={`border rounded-xl p-3 ${isAud(col.type) ? 'border-[#9FE1CB] bg-[#E1F5EE]/40' : 'border-gray-100 bg-gray-50'}`}>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <input value={col.label} onChange={(e) => upCol(col.id, 'label', e.target.value)} className="flex-1 min-w-[100px] text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-[#1B6B6B] bg-white" />
            <select value={col.type} onChange={(e) => { const t = e.target.value; upCol(col.id, 'type', t); if (t === COLUMN_TYPES.AUDITOR_DROPDOWN && !col.options) upCol(col.id, 'options', []); }} className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white">
              {COL_TYPE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {col.type === COLUMN_TYPES.AUDITOR_NUMBER && (
              <>
                <input list={`ul-${col.id}`} value={col.unit || ''} onChange={(e) => upCol(col.id, 'unit', e.target.value)} placeholder="unit" title="Unit shown next to the number — pick or type" className="w-20 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none" />
                <datalist id={`ul-${col.id}`}>
                  {['count','pcs','nos','kg','g','ton','L','ml','₹','$','hrs','min','days','months','km','m','%','sq.ft','acres'].map((u) => <option key={u} value={u} />)}
                </datalist>
              </>
            )}
            <button type="button" onClick={() => rmCol(col.id)} className="text-gray-300 hover:text-red-400">✕</button>
          </div>
          {col.type === COLUMN_TYPES.AUDITOR_DROPDOWN && (
            <div className="space-y-1.5 pl-1">
              {(col.options || []).map((opt, oi) => (
                <div key={oi} className="flex items-center gap-1.5">
                  <input type="color" value={opt.color || '#888780'} onChange={(e) => upCOpt(col.id, oi, 'color', e.target.value)} className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5" />
                  <input value={opt.label} onChange={(e) => upCOpt(col.id, oi, 'label', e.target.value)} className="flex-1 text-xs border border-gray-100 rounded-lg px-2 py-1 bg-white focus:outline-none" />
                  <label className="flex items-center gap-1 text-xs text-green-700 cursor-pointer" title="Mark this option as compliant — used for scoring"><input type="checkbox" checked={!!opt.isPass} onChange={(e) => upCOpt(col.id, oi, 'isPass', e.target.checked)} /> ✓ Compliant</label>
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
      {qs.map((q, qi) => (
        <div key={q.id} className="border border-purple-100 bg-purple-50/20 rounded-xl p-3">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <input value={q.question} onChange={(e) => upQ(q.id, 'question', e.target.value)} className="flex-1 min-w-[160px] text-xs border border-gray-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-[#7F77DD] bg-white" />
            <select value={q.type} onChange={(e) => upQ(q.id, 'type', e.target.value)} className="text-xs border border-gray-200 rounded-xl px-2 py-2 bg-white">
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {q.type === QA_QUESTION_TYPES.NUMBER && (
              <>
                <input list={`qa-ul-${q.id}`} value={q.unit || ''} onChange={(e) => upQ(q.id, 'unit', e.target.value)} placeholder="unit" title="Unit shown next to the number" className="w-20 text-xs border border-gray-200 rounded-xl px-2 py-2 bg-white focus:outline-none" />
                <datalist id={`qa-ul-${q.id}`}>
                  {['count','pcs','nos','kg','g','ton','L','ml','₹','$','hrs','min','days','months','km','m','%','sq.ft','acres'].map((u) => <option key={u} value={u} />)}
                </datalist>
              </>
            )}
            <button type="button" disabled={qi === 0} onClick={() => onChange({ ...section, questions: moveArr(qs, qi, -1) })} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs">↑</button>
            <button type="button" disabled={qi === qs.length - 1} onClick={() => onChange({ ...section, questions: moveArr(qs, qi, 1) })} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs">↓</button>
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
export default function AuditSettings({ companyId, auditTypes, userRole, showSuccess, showError, onClose }) {
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

  /* mixed state */
  const [mixedSections,    setMixedSections]    = useState([]);
  const [mixedAddingFor,   setMixedAddingFor]   = useState(null);
  const [mixedNewItem,     setMixedNewItem]      = useState('');
  const [mixedNewItemRisk, setMixedNewItemRisk]  = useState('Medium');
  const [mixedEditSecId,   setMixedEditSecId]    = useState(null);
  const [mixedEditSecVal,  setMixedEditSecVal]   = useState('');

  const resetForm = () => {
    setAuditCategory('Internal'); setTemplateType(SECTION_TYPES.CHECKLIST); setName(''); setDescription('');
    setColor(AUDIT_COLORS[Math.floor(Math.random() * AUDIT_COLORS.length)]); setRiskLevel('Medium');
    setClSections(['General']); setClItems([]); setNewSecName(''); setEditSecId(null); setAddingFor(null); setNewItemText('');
    setRecSections([{ id: uid(), name: 'Section 1', sectionType: SECTION_TYPES.RECORDS, columns: [] }]);
    setQASections([{ id: uid(), name: 'Questions', sectionType: SECTION_TYPES.QA, questions: [] }]);
    setMixedSections([]); setMixedAddingFor(null); setMixedNewItem(''); setMixedEditSecId(null);
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
      const distinctTypes = [...new Set(tmpl.sections.map((s) => s.sectionType).filter(Boolean))];
      if (distinctTypes.length > 1) {
        setTemplateType('mixed');
        setMixedSections(tmpl.sections);
      } else {
        const firstType = distinctTypes[0] || SECTION_TYPES.CHECKLIST;
        setTemplateType(firstType);
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

  /* ── mixed section helpers ──────────────────────────────────────── */
  const addMixedSection = (type) => {
    const count = mixedSections.filter((s) => s.sectionType === type).length + 1;
    const names = { [SECTION_TYPES.CHECKLIST]: `Checklist ${count}`, [SECTION_TYPES.RECORDS]: `Records ${count}`, [SECTION_TYPES.QA]: `Q&A ${count}` };
    setMixedSections((p) => [...p, {
      id: uid(), name: names[type] || `Section ${count}`, sectionType: type,
      ...(type === SECTION_TYPES.CHECKLIST ? { items: [], responseOptions: [...DEFAULT_RESPONSE_OPTIONS] } : {}),
      ...(type === SECTION_TYPES.RECORDS   ? { columns: [] } : {}),
      ...(type === SECTION_TYPES.QA        ? { questions: [] } : {}),
    }]);
  };
  const updateMixedSection = (id, updater) => setMixedSections((p) => p.map((s) => s.id === id ? updater(s) : s));
  const removeMixedSection = (id) => setMixedSections((p) => p.filter((s) => s.id !== id));
  const addMixedItem = (secId) => {
    if (!mixedNewItem.trim()) return;
    updateMixedSection(secId, (s) => ({ ...s, items: [...(s.items || []), { id: uid(), question: mixedNewItem.trim(), section: s.name, riskLevel: mixedNewItemRisk }] }));
    setMixedNewItem(''); setMixedNewItemRisk('Medium'); setMixedAddingFor(null);
  };

  /* ── reorder helpers ─────────────────────────────────────────────── */
  const moveClSection = (idx, dir) => setClSections((p) => moveArr(p, idx, dir));
  const moveClItem = (sec, idx, dir) => setClItems((p) => {
    const secItems = p.filter((i) => i.section === sec);
    const others   = p.filter((i) => i.section !== sec);
    return [...others, ...moveArr(secItems, idx, dir)];
  });
  const moveRecSection = (idx, dir) => setRecSections((p) => moveArr(p, idx, dir));
  const moveQASection  = (idx, dir) => setQASections((p)  => moveArr(p, idx, dir));
  const moveMixedSection = (idx, dir) => setMixedSections((p) => moveArr(p, idx, dir));
  const moveMixedItem = (secId, idx, dir) => updateMixedSection(secId, (s) => ({ ...s, items: moveArr(s.items || [], idx, dir) }));

  const canDelete = userRole === 'admin' || userRole === 'companyadmin' || userRole === 'hrmanager' || userRole === 'auditmanager';

  const handleDeleteTemplate = async (tmpl, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${tmpl.name}"? This cannot be undone.`)) return;
    try {
      const activeSnap = await getDocs(
        query(collection(db, 'companies', companyId, 'audits'), where('auditTypeId', '==', tmpl.id), limit(20)),
      );
      const active = activeSnap.docs.filter((d) => d.data().status !== 'Closed');
      if (active.length > 0) {
        showError(`${active.length} active audit${active.length > 1 ? 's' : ''} use this template — close them first.`);
        return;
      }
      await deleteDoc(doc(db, 'companies', companyId, 'auditTypes', tmpl.id));
      showSuccess(`"${tmpl.name}" deleted.`);
    } catch {
      showError('Failed to delete template.');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { showError('Enter a template name'); return; }
    let sections = [];
    if (templateType === SECTION_TYPES.RECORDS && recSections.length === 0) { showError('Add at least one section'); return; }
    if (templateType === SECTION_TYPES.QA && qaSections.length === 0) { showError('Add at least one section'); return; }
    if (templateType === 'mixed') {
      if (mixedSections.length === 0) { showError('Add at least one section'); return; }
      for (const sec of mixedSections) {
        if (sec.sectionType === SECTION_TYPES.CHECKLIST && !(sec.items || []).length) { showError(`"${sec.name}" has no items`); return; }
        if (sec.sectionType === SECTION_TYPES.RECORDS) {
          const audCols = (sec.columns || []).filter((c) => [COLUMN_TYPES.AUDITOR_DROPDOWN, COLUMN_TYPES.AUDITOR_TEXT, COLUMN_TYPES.AUDITOR_NUMBER, COLUMN_TYPES.AUDITOR_DATE].includes(c.type));
          if (!audCols.length) { showError(`"${sec.name}" needs at least one auditor column`); return; }
        }
        if (sec.sectionType === SECTION_TYPES.QA && !(sec.questions || []).length) { showError(`"${sec.name}" has no questions`); return; }
      }
      sections = mixedSections.map((sec) => {
        if (sec.sectionType !== SECTION_TYPES.RECORDS) return sec;
        const cols = sec.columns || [];
        if (cols.some((c) => c.isPrimary && c.type === COLUMN_TYPES.AUDITOR_DROPDOWN)) return sec;
        const fi = cols.findIndex((c) => c.type === COLUMN_TYPES.AUDITOR_DROPDOWN);
        if (fi === -1) return sec;
        return { ...sec, columns: cols.map((c, i) => ({ ...c, isPrimary: i === fi })) };
      });
    } else if (templateType === SECTION_TYPES.CHECKLIST) {
      for (const sec of clSections) {
        const items = clItems.filter((i) => i.section === sec);
        if (!items.length) { showError(`Section "${sec}" has no items`); return; }
        sections.push({ id: uid(), name: sec, sectionType: SECTION_TYPES.CHECKLIST, items, responseOptions: [...DEFAULT_RESPONSE_OPTIONS] });
      }
    } else if (templateType === SECTION_TYPES.RECORDS) {
      sections = recSections.map((sec) => {
        const cols = sec.columns || [];
        if (cols.some((c) => c.isPrimary && c.type === COLUMN_TYPES.AUDITOR_DROPDOWN)) return sec;
        const fi = cols.findIndex((c) => c.type === COLUMN_TYPES.AUDITOR_DROPDOWN);
        if (fi === -1) return sec;
        return { ...sec, columns: cols.map((c, i) => ({ ...c, isPrimary: i === fi })) };
      });
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
            <div key={tmpl.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors cursor-pointer group" onClick={() => openEdit(tmpl)}>
              <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ background: tmpl.color || '#1B6B6B' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{tmpl.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-400">{tmpl.auditCategory || 'Internal'}</span>
                  {types.map((t) => { const m = SECTION_META[t]; return m ? (<span key={t} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: m.bg, color: m.color }}>{m.label}</span>) : null; })}
                  {isOld && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">Legacy</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {canDelete && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteTemplate(tmpl, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500"
                    title="Delete template"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 3.5h10M5.5 3.5V2.5h3v1M6 6v4M8 6v4M3 3.5l.7 7.5h6.6l.7-7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
                <span className="text-xs text-gray-400">Edit →</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MODAL ────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto py-8 px-4">
          <div role="presentation" className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-auto mb-8" onClick={(e) => e.stopPropagation()}>

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
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { v: SECTION_TYPES.CHECKLIST, label: 'Checklist', sub: 'Pass/Fail per item' },
                    { v: SECTION_TYPES.RECORDS,   label: 'Records',   sub: 'Row-by-row table'  },
                    { v: SECTION_TYPES.QA,        label: 'Q&A',       sub: 'Open questions'     },
                    { v: 'mixed',                  label: 'Mixed',     sub: 'Any combination'   },
                  ].map(({ v, label, sub }) => (
                    <button key={v} type="button" onClick={() => setTemplateType(v)}
                      className={`py-2.5 px-1 rounded-xl border text-center transition-all ${templateType === v ? 'border-[#1B6B6B] bg-[#E8F5F5]' : 'border-gray-200 hover:border-gray-300'}`}>
                      <p className={`text-xs font-medium ${templateType === v ? 'text-[#0F6E56]' : 'text-gray-700'}`}>{label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
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

                  {clSections.map((sec, si) => {
                    const items = clItems.filter((i) => i.section === sec);
                    return (
                      <div key={sec} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100" style={{ background: '#E1F5EE' }}>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: '#E1F5EE', color: '#0F6E56', border: '1px solid #9FE1CB' }}>Checklist</span>
                          {editSecId === sec ? (
                            <input value={editSecVal} onChange={(e) => setEditSecVal(e.target.value)}
                              onBlur={() => { if (editSecVal.trim() && editSecVal !== sec) renameSection(sec, editSecVal.trim()); setEditSecId(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { if (editSecVal.trim() && editSecVal !== sec) renameSection(sec, editSecVal.trim()); setEditSecId(null); } if (e.key === 'Escape') setEditSecId(null); }}
                              className="flex-1 text-sm font-semibold text-gray-800 border-b border-[#1B6B6B] bg-transparent focus:outline-none" autoFocus />
                          ) : (
                            <>
                              <span className="flex-1 text-sm font-semibold text-gray-800">{sec}</span>
                              <button type="button" onClick={() => { setEditSecId(sec); setEditSecVal(sec); }} className="text-gray-300 hover:text-gray-500">✏️</button>
                            </>
                          )}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button type="button" onClick={() => { setAddingFor(sec); setNewItemText(''); setNewItemRisk('Medium'); }} className="text-xs text-[#1B6B6B] font-medium hover:underline mr-1">+ Add item</button>
                            <button type="button" onClick={() => moveClSection(si, -1)} disabled={si === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-0.5">↑</button>
                            <button type="button" onClick={() => moveClSection(si, 1)} disabled={si === clSections.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-0.5">↓</button>
                            {clSections.length > 1 && <button type="button" onClick={() => rmClSection(sec)} className="text-xs text-red-400 hover:text-red-600 ml-1">Remove</button>}
                          </div>
                        </div>

                        <div className="m-3 border-2 border-dashed border-gray-200 rounded-xl overflow-hidden">
                          {items.map((item, idx) => (
                            <div key={item.id} className={`flex items-center gap-2 px-3 py-2.5 ${idx < items.length - 1 || addingFor === sec ? 'border-b border-gray-100' : ''}`}>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: RISK_LEVELS.find((r) => r.value === item.riskLevel)?.color || '#888780' }} />
                              <input value={item.question} onChange={(e) => upClItem(item.id, 'question', e.target.value)}
                                className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none" />
                              <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded flex-shrink-0">{item.riskLevel}</span>
                              <button type="button" onClick={() => moveClItem(sec, idx, -1)} disabled={idx === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs">↑</button>
                              <button type="button" onClick={() => moveClItem(sec, idx, 1)} disabled={idx === items.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs">↓</button>
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
                  {recSections.map((sec, si) => (
                    <div key={sec.id} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-blue-100" style={{ background: '#E6F1FB' }}>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: '#E6F1FB', color: '#185FA5', border: '1px solid #B5D4F4' }}>Records</span>
                        <input value={sec.name} onChange={(e) => setRecSections((p) => p.map((s) => s.id === sec.id ? { ...s, name: e.target.value } : s))}
                          className="flex-1 text-sm font-semibold text-gray-800 bg-transparent focus:outline-none" placeholder="Section name" />
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button type="button" onClick={() => moveRecSection(si, -1)} disabled={si === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-0.5">↑</button>
                          <button type="button" onClick={() => moveRecSection(si, 1)} disabled={si === recSections.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-0.5">↓</button>
                          {recSections.length > 1 && <button type="button" onClick={() => setRecSections((p) => p.filter((s) => s.id !== sec.id))} className="text-xs text-red-400 hover:text-red-600 ml-1">Remove</button>}
                        </div>
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
                  {qaSections.map((sec, si) => (
                    <div key={sec.id} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-purple-100" style={{ background: '#EEEDFE' }}>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: '#EEEDFE', color: '#3C3489', border: '1px solid #CECBF6' }}>Q&A</span>
                        <input value={sec.name} onChange={(e) => setQASections((p) => p.map((s) => s.id === sec.id ? { ...s, name: e.target.value } : s))}
                          className="flex-1 text-sm font-semibold text-gray-800 bg-transparent focus:outline-none" placeholder="Section name" />
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button type="button" onClick={() => moveQASection(si, -1)} disabled={si === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-0.5">↑</button>
                          <button type="button" onClick={() => moveQASection(si, 1)} disabled={si === qaSections.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-0.5">↓</button>
                          {qaSections.length > 1 && <button type="button" onClick={() => setQASections((p) => p.filter((s) => s.id !== sec.id))} className="text-xs text-red-400 hover:text-red-600 ml-1">Remove</button>}
                        </div>
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

              {/* ── MIXED BUILDER ──────────────────────────────────── */}
              {templateType === 'mixed' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sections</span>
                    <span className="text-xs text-gray-400">{mixedSections.length} section{mixedSections.length !== 1 ? 's' : ''}</span>
                  </div>

                  {mixedSections.length === 0 && (
                    <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-xl mb-3">
                      <p className="text-sm text-gray-400">Add sections using the buttons below</p>
                    </div>
                  )}

                  {mixedSections.map((sec) => {
                    const meta = SECTION_META[sec.sectionType] || SECTION_META[SECTION_TYPES.CHECKLIST];
                    return (
                      <div key={sec.id} className="border border-gray-200 rounded-xl overflow-hidden mb-3">
                        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100" style={{ background: meta.bg }}>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}>{meta.label}</span>
                          {mixedEditSecId === sec.id ? (
                            <input value={mixedEditSecVal} onChange={(e) => setMixedEditSecVal(e.target.value)}
                              onBlur={() => { updateMixedSection(sec.id, (s) => ({ ...s, name: mixedEditSecVal.trim() || s.name })); setMixedEditSecId(null); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { updateMixedSection(sec.id, (s) => ({ ...s, name: mixedEditSecVal.trim() || s.name })); setMixedEditSecId(null); } if (e.key === 'Escape') setMixedEditSecId(null); }}
                              className="flex-1 text-sm font-semibold text-gray-800 border-b border-[#1B6B6B] bg-transparent focus:outline-none" autoFocus />
                          ) : (
                            <>
                              <span className="flex-1 text-sm font-semibold text-gray-800">{sec.name}</span>
                              <button type="button" onClick={() => { setMixedEditSecId(sec.id); setMixedEditSecVal(sec.name); }} className="text-gray-300 hover:text-gray-500">✏️</button>
                            </>
                          )}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button type="button" onClick={() => moveMixedSection(mixedSections.findIndex((s) => s.id === sec.id), -1)} disabled={mixedSections.findIndex((s) => s.id === sec.id) === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-0.5">↑</button>
                            <button type="button" onClick={() => moveMixedSection(mixedSections.findIndex((s) => s.id === sec.id), 1)} disabled={mixedSections.findIndex((s) => s.id === sec.id) === mixedSections.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs px-0.5">↓</button>
                            {mixedSections.length > 1 && (
                              <button type="button" onClick={() => removeMixedSection(sec.id)} className="text-xs text-red-400 hover:text-red-600 ml-1">Remove</button>
                            )}
                          </div>
                        </div>

                        <div className="p-3">
                          {sec.sectionType === SECTION_TYPES.CHECKLIST && (
                            <div className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden">
                              {(sec.items || []).map((item, idx) => (
                                <div key={item.id} className={`flex items-center gap-2 px-3 py-2 ${idx < (sec.items || []).length - 1 || mixedAddingFor === sec.id ? 'border-b border-gray-100' : ''}`}>
                                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: RISK_LEVELS.find((r) => r.value === item.riskLevel)?.color || '#888780' }} />
                                  <input value={item.question} onChange={(e) => updateMixedSection(sec.id, (s) => ({ ...s, items: (s.items || []).map((i) => i.id === item.id ? { ...i, question: e.target.value } : i) }))}
                                    className="flex-1 text-sm text-gray-700 bg-transparent focus:outline-none" />
                                  <button type="button" onClick={() => moveMixedItem(sec.id, idx, -1)} disabled={idx === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs">↑</button>
                                  <button type="button" onClick={() => moveMixedItem(sec.id, idx, 1)} disabled={idx === (sec.items || []).length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs">↓</button>
                                  <button type="button" onClick={() => updateMixedSection(sec.id, (s) => ({ ...s, items: (s.items || []).filter((i) => i.id !== item.id) }))} className="text-gray-300 hover:text-red-400">✕</button>
                                </div>
                              ))}
                              {mixedAddingFor === sec.id ? (
                                <div className="flex items-center gap-2 px-3 py-2">
                                  <input value={mixedNewItem} onChange={(e) => setMixedNewItem(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') addMixedItem(sec.id); if (e.key === 'Escape') setMixedAddingFor(null); }}
                                    placeholder="Item text…" autoFocus className="flex-1 text-sm bg-transparent focus:outline-none" />
                                  <select value={mixedNewItemRisk} onChange={(e) => setMixedNewItemRisk(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white">
                                    {RISK_LEVELS.map((r) => <option key={r.value}>{r.value}</option>)}
                                  </select>
                                  <button type="button" onClick={() => addMixedItem(sec.id)} className="text-xs text-white bg-[#1B6B6B] font-medium px-2.5 py-1 rounded-lg">Add</button>
                                  <button type="button" onClick={() => setMixedAddingFor(null)} className="text-xs text-gray-400">✕</button>
                                </div>
                              ) : (sec.items || []).length === 0 ? (
                                <button type="button" onClick={() => { setMixedAddingFor(sec.id); setMixedNewItem(''); }} className="w-full py-4 text-sm text-gray-400 hover:text-gray-600 transition-colors">+ Add first item</button>
                              ) : (
                                <button type="button" onClick={() => { setMixedAddingFor(sec.id); setMixedNewItem(''); }} className="w-full py-2 text-xs text-[#1B6B6B] font-medium hover:underline">+ Add item</button>
                              )}
                            </div>
                          )}
                          {sec.sectionType === SECTION_TYPES.RECORDS && (
                            <RecordsColBuilder section={sec} onChange={(updated) => setMixedSections((p) => p.map((s) => s.id === sec.id ? updated : s))} />
                          )}
                          {sec.sectionType === SECTION_TYPES.QA && (
                            <QAQBuilder section={sec} onChange={(updated) => setMixedSections((p) => p.map((s) => s.id === sec.id ? updated : s))} />
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => addMixedSection(SECTION_TYPES.CHECKLIST)} className="py-2.5 border border-[#9FE1CB] bg-[#E1F5EE] text-[#0F6E56] text-xs rounded-xl font-medium hover:opacity-80 transition-opacity">+ Checklist</button>
                    <button type="button" onClick={() => addMixedSection(SECTION_TYPES.RECORDS)} className="py-2.5 border border-[#B5D4F4] bg-[#E6F1FB] text-[#185FA5] text-xs rounded-xl font-medium hover:opacity-80 transition-opacity">+ Records</button>
                    <button type="button" onClick={() => addMixedSection(SECTION_TYPES.QA)} className="py-2.5 border border-[#CECBF6] bg-[#EEEDFE] text-[#3C3489] text-xs rounded-xl font-medium hover:opacity-80 transition-opacity">+ Q&A</button>
                  </div>
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
