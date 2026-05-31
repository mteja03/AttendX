import { useState, useRef, useMemo, useCallback } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  SECTION_TYPES, isUnifiedTemplate,
  generateSampleCSV, parseCSVToRecords, makeBlankRecord,
} from './auditHelpers';

function stripUndefined(obj) { return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v))); }

const SECTION_META = {
  [SECTION_TYPES.CHECKLIST]: { label: 'Checklist', color: '#0F6E56', bg: '#E1F5EE' },
  [SECTION_TYPES.RECORDS]:   { label: 'Records',   color: '#185FA5', bg: '#E6F1FB' },
  [SECTION_TYPES.QA]:        { label: 'Q&A',       color: '#3C3489', bg: '#EEEDFE' },
};

export default function AssignAuditModal({
  companyId, auditTypes, employees, branches, locations, departments,
  currentUser, onClose, onAssigned, showSuccess, showError,
}) {
  const csvFileRef = useRef(null);
  const csvTargetRef = useRef(null);

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [auditorId,    setAuditorId]    = useState('');
  const [auditorName,  setAuditorName]  = useState('');
  const [auditorEmail, setAuditorEmail] = useState('');
  const [auditorPhone, setAuditorPhone] = useState('');
  const [startDate,    setStartDate]    = useState('');
  const [endDate,      setEndDate]      = useState('');
  const [location,     setLocation]     = useState('');
  const [branch,       setBranch]       = useState('');
  const [department,   setDepartment]   = useState('');
  const [recordData,   setRecordData]   = useState({});   // { [tmplId]: { [sectionId]: Row[] } }
  const [assigning,    setAssigning]    = useState(false);
  const [assignedAudits, setAssignedAudits] = useState(null);
  const [auditRefCounter, setAuditRefCounter] = useState(1);

  const selectedTemplates = useMemo(
    () => auditTypes.filter((t) => selectedIds.includes(t.id)),
    [auditTypes, selectedIds],
  );

  const filteredTypes = useMemo(() => {
    const q = search.toLowerCase();
    return auditTypes.filter((t) => !q || t.name?.toLowerCase().includes(q) || t.auditCategory?.toLowerCase().includes(q));
  }, [auditTypes, search]);

  const toggleTemplate = (id) => setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  // ── row editing helpers ────────────────────────────────────────────────────
  const handleUpdateRow = useCallback((tmplId, secId, rowId, colId, value) => {
    setRecordData((prev) => {
      const rows = prev?.[tmplId]?.[secId] || [];
      return { ...prev, [tmplId]: { ...(prev?.[tmplId] || {}), [secId]: rows.map((r) => r.id === rowId ? { ...r, data: { ...r.data, [colId]: value } } : r) } };
    });
  }, []);

  const handleDeleteRow = useCallback((tmplId, secId, rowId) => {
    setRecordData((prev) => {
      const rows = prev?.[tmplId]?.[secId] || [];
      return { ...prev, [tmplId]: { ...(prev?.[tmplId] || {}), [secId]: rows.filter((r) => r.id !== rowId) } };
    });
  }, []);

  const handleAddManualRow = (tmplId, section) => {
    const blank = makeBlankRecord(section.columns);
    setRecordData((prev) => {
      const rows = prev?.[tmplId]?.[section.id] || [];
      return { ...prev, [tmplId]: { ...(prev?.[tmplId] || {}), [section.id]: [...rows, blank] } };
    });
  };

  const handleSampleCSVDownload = (section) => {
    const csv = generateSampleCSV(section);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${section.name || 'records'}_sample.csv` });
    a.click();
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !csvTargetRef.current) return;
    const { templateId, sectionId, section } = csvTargetRef.current;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const rows = parseCSVToRecords(ev.target.result, section);
        setRecordData((prev) => ({ ...prev, [templateId]: { ...(prev?.[templateId] || {}), [sectionId]: rows } }));
        showSuccess(`${rows.length} records loaded`);
      } catch (err) {
        showError('CSV parse failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
    csvTargetRef.current = null;
  };

  // ── validate & assign ──────────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!selectedIds.length)  { showError('Select at least one template'); return; }
    if (!auditorId)            { showError('Select a lead auditor'); return; }
    if (!endDate)              { showError('End date is required'); return; }
    if (!location && !branch)  { showError('Select a location or branch'); return; }

    // Records section validation
    for (const tmpl of selectedTemplates) {
      const recordSecs = (tmpl.sections || []).filter((s) => s.sectionType === SECTION_TYPES.RECORDS);
      for (const sec of recordSecs) {
        const rows = recordData?.[tmpl.id]?.[sec.id] || [];
        if (rows.length === 0) { showError(`Upload records for "${sec.name}" in "${tmpl.name}"`); return; }
      }
    }

    try {
      setAssigning(true);
      const year = new Date().getFullYear();
      const created = [];

      for (let i = 0; i < selectedTemplates.length; i++) {
        const tmpl = selectedTemplates[i];
        const refId = `AUD-${year}-${String(auditRefCounter + i).padStart(3, '0')}`;
        const isUnified = isUnifiedTemplate(tmpl);

        // Build sectionResponses for unified templates
        let sectionResponses = null;
        if (isUnified) {
          sectionResponses = {};
          for (const sec of tmpl.sections || []) {
            if (sec.sectionType === SECTION_TYPES.CHECKLIST) {
              sectionResponses[sec.id] = {
                type: SECTION_TYPES.CHECKLIST,
                items: (sec.items || []).map((item) => ({ id: item.id, result: '', note: '' })),
              };
            } else if (sec.sectionType === SECTION_TYPES.RECORDS) {
              sectionResponses[sec.id] = {
                type: SECTION_TYPES.RECORDS,
                records: recordData?.[tmpl.id]?.[sec.id] || [],
              };
            } else if (sec.sectionType === SECTION_TYPES.QA) {
              sectionResponses[sec.id] = { type: SECTION_TYPES.QA, answers: {} };
            }
          }
        }

        const auditDoc = stripUndefined({
          auditRefId: refId,
          auditTypeId: tmpl.id,
          auditTypeName: tmpl.name,
          auditTypeColor: tmpl.color || '#1B6B6B',
          auditCategory: tmpl.auditCategory || 'Internal',
          riskLevel: tmpl.riskLevel || 'Medium',
          branch: branch || null,
          location: location || null,
          department: department || null,
          auditorId,
          auditorName,
          auditorEmail,
          teamMembers: [],
          startDate: startDate || null,
          endDate,
          status: 'Assigned',
          // unified format
          ...(isUnified && {
            sections: tmpl.sections,
            sectionResponses,
          }),
          // legacy backward compat (checklist only)
          ...(!isUnified && tmpl.templateType !== 'record' && {
            templateType: 'checklist',
            checklistReview: (tmpl.checklistItems || []).map((item) => ({
              id: item.id, question: item.question, section: item.section, riskLevel: item.riskLevel, result: '', note: '',
            })),
          }),
          findings: [],
          adminNotes: '',
          createdAt: serverTimestamp(),
          createdBy: currentUser?.email || '',
          updatedAt: new Date(),
        });

        const ref = doc(db, 'companies', companyId, 'audits', `${refId}_${Date.now()}_${i}`);
        await setDoc(ref, auditDoc);
        created.push({ id: ref.id, ...auditDoc, phone: auditorPhone, name: auditorName });
      }

      setAuditRefCounter((p) => p + selectedTemplates.length);
      setAssignedAudits(created);
      onAssigned?.();
    } catch (e) {
      showError('Assign failed: ' + e.message);
      if (import.meta.env.DEV) console.error(e);
    } finally {
      setAssigning(false);
    }
  };

  // ── WhatsApp confirmation view ─────────────────────────────────────────────
  if (assignedAudits) {
    const first = assignedAudits[0];
    const msg = assignedAudits.length === 1
      ? `Dear ${first.name} Garu,\n\nYou have been assigned a new audit:\n\n*Audit:* ${first.auditTypeName}\n*Reference:* ${first.auditRefId}\n*Branch:* ${first.branch || '—'}\n*Due date:* ${first.endDate || '—'}\n\nPlease log in to AttendX to fill the audit.\n\nThank you,\n${currentUser?.displayName || 'Audit Manager'}`
      : `Dear ${first.name} Garu,\n\nYou have been assigned ${assignedAudits.length} audits.\n\nReferences: ${assignedAudits.map((a) => a.auditRefId).join(', ')}\n*Branch:* ${first.branch || '—'}\n*Due date:* ${first.endDate || '—'}\n\nPlease log in to AttendX to fill the audits.\n\nThank you,\n${currentUser?.displayName || 'Audit Manager'}`;

    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <div role="presentation" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-sm sm:mx-4">
          <div className="text-center mb-4">
            <div className="w-14 h-14 bg-[#E1F5EE] rounded-full flex items-center justify-center text-2xl mx-auto mb-3">✅</div>
            <h3 className="text-base font-semibold text-gray-800 mb-1">{assignedAudits.length === 1 ? 'Audit assigned' : `${assignedAudits.length} audits assigned`}</h3>
            <p className="text-sm text-gray-500">Notify the auditor on WhatsApp</p>
          </div>
          {first.phone ? (
            <a href={`https://wa.me/${first.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] text-white rounded-xl text-sm font-medium mb-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.133.557 4.133 1.528 5.87L.057 23.428l5.733-1.5A11.938 11.938 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.371l-.358-.213-3.712.972.992-3.61-.234-.372A9.818 9.818 0 012.182 12C2.182 6.578 6.578 2.182 12 2.182S21.818 6.578 21.818 12 17.422 21.818 12 21.818z"/></svg>
              Notify on WhatsApp
            </a>
          ) : (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-center"><p className="text-xs text-amber-700">No phone number on record for {first.name}</p></div>
          )}
          <button type="button" onClick={onClose} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Done</button>
        </div>
      </div>
    );
  }

  // ── main modal ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div role="presentation" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-sm sm:mx-4 sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">Assign Audit</h2>
          <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* ── Template selection ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Select template(s)</p>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2.5 mb-2 focus:outline-none focus:border-[#1B6B6B]" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
              {filteredTypes.map((tmpl) => {
                const isSelected = selectedIds.includes(tmpl.id);
                const types = [...new Set((tmpl.sections || []).map((s) => s.sectionType).filter(Boolean))];
                return (
                  <button key={tmpl.id} type="button" onClick={() => toggleTemplate(tmpl.id)}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${isSelected ? 'border-[#1B6B6B] bg-[#E1F5EE]/40' : 'border-gray-100 hover:border-gray-200 bg-white'}`}>
                    <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ background: tmpl.color || '#1B6B6B' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{tmpl.name}</p>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400">{tmpl.auditCategory || 'Internal'}</span>
                        {types.map((t) => { const m = SECTION_META[t]; return m ? <span key={t} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: m.bg, color: m.color }}>{m.label}</span> : null; })}
                      </div>
                    </div>
                    {isSelected && <span className="text-[#1B6B6B] text-sm flex-shrink-0">✓</span>}
                  </button>
                );
              })}
            </div>
            {selectedIds.length > 0 && <p className="text-xs text-[#1B6B6B] mt-1.5 font-medium">{selectedIds.length} template{selectedIds.length !== 1 ? 's' : ''} selected</p>}
          </div>

          {/* ── Lead auditor ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Lead auditor</p>
            <div className="max-h-44 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
              {(employees || []).filter((e) => e.status === 'Active').slice(0, 30).map((emp) => (
                <label key={emp.id} className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${auditorId === emp.id ? 'bg-[#E1F5EE]/40' : ''}`}>
                  <input type="radio" name="lead-auditor" checked={auditorId === emp.id} onChange={() => { setAuditorId(emp.id); setAuditorName(emp.fullName); setAuditorEmail(emp.email || ''); setAuditorPhone(emp.mobile || emp.phone || emp.mobileNumber || ''); }} className="flex-shrink-0 accent-[#1B6B6B]" />
                  <div className="w-7 h-7 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{emp.fullName?.charAt(0)}</div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{emp.fullName}</p>
                    <p className="text-xs text-gray-400 truncate">{emp.designation || emp.email}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* ── Schedule ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Schedule</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs text-gray-400 block mb-1">Start date</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#1B6B6B]" /></div>
              <div><label className="text-xs text-gray-400 block mb-1">End date *</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#1B6B6B]" /></div>
            </div>
          </div>

          {/* ── Location ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select value={location} onChange={(e) => setLocation(e.target.value)} className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#1B6B6B]">
                <option value="">Location</option>
                {(locations || []).map((l) => <option key={l.id || l}>{l.name || l}</option>)}
              </select>
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#1B6B6B]">
                <option value="">Branch</option>
                {(branches || []).map((b) => <option key={b.id || b}>{b.name || b}</option>)}
              </select>
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className="text-xs border border-gray-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:border-[#1B6B6B]">
                <option value="">Department</option>
                {(departments || []).map((d) => <option key={d.id || d}>{d.name || d}</option>)}
              </select>
            </div>
          </div>

          {/* ── Records pre-fill (per Records section in each selected template) ── */}
          {selectedTemplates.some((tmpl) => (tmpl.sections || []).some((s) => s.sectionType === SECTION_TYPES.RECORDS)) && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Records data</p>
              <p className="text-xs text-gray-400 mb-3">Pre-fill the rows that the auditor will fill in during the audit.</p>
              {selectedTemplates.map((tmpl) => {
                const recordSecs = (tmpl.sections || []).filter((s) => s.sectionType === SECTION_TYPES.RECORDS);
                if (!recordSecs.length) return null;
                return (
                  <div key={tmpl.id} className="mb-4">
                    {selectedTemplates.length > 1 && (
                      <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: tmpl.color || '#1B6B6B' }} />{tmpl.name}
                      </p>
                    )}
                    {recordSecs.map((sec) => {
                      const rows = recordData?.[tmpl.id]?.[sec.id] || [];
                      const prefilledCols = (sec.columns || []).filter((c) => c.type?.startsWith('prefilled'));
                      return (
                        <div key={sec.id} className="border border-blue-100 bg-blue-50/20 rounded-xl p-3 mb-2">
                          <p className="text-xs font-medium text-blue-800 mb-2">{sec.name}</p>
                          <div className="flex gap-2 flex-wrap mb-2">
                            {prefilledCols.length > 0 && (
                              <button type="button" onClick={() => handleSampleCSVDownload(sec)} className="flex items-center gap-1.5 text-xs border border-[#1B6B6B] text-[#1B6B6B] px-3 py-2 rounded-xl hover:bg-[#E1F5EE] transition-colors min-h-[36px]">↓ Sample CSV</button>
                            )}
                            {prefilledCols.length > 0 && (
                              <button type="button" onClick={() => { csvTargetRef.current = { templateId: tmpl.id, sectionId: sec.id, section: sec }; csvFileRef.current?.click(); }} className="flex items-center gap-1.5 text-xs bg-[#1B6B6B] text-white px-3 py-2 rounded-xl hover:bg-[#155858] transition-colors min-h-[36px]">↑ Upload CSV</button>
                            )}
                            <button type="button" onClick={() => handleAddManualRow(tmpl.id, sec)} className="flex items-center gap-1.5 text-xs border border-gray-200 text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors min-h-[36px]">+ Add row</button>
                          </div>
                          {rows.length > 0 && (
                            <>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium bg-[#E8F5F5] text-[#0F6E56] px-2.5 py-1 rounded-full">✓ {rows.length} record{rows.length !== 1 ? 's' : ''}</span>
                                <button type="button" onClick={() => setRecordData((p) => ({ ...p, [tmpl.id]: { ...(p?.[tmpl.id] || {}), [sec.id]: [] } }))} className="text-xs text-red-400 hover:underline">Clear all</button>
                                {rows.length > 20 && <span className="text-xs text-gray-400">· Re-upload CSV to edit all rows</span>}
                              </div>
                              {prefilledCols.length > 0 && (
                                <div className="overflow-x-auto rounded-xl border border-gray-100">
                                  <table style={{ fontSize: 11, width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr style={{ background: '#F9FAFB' }}>
                                        {prefilledCols.map((col) => <th key={col.id} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, fontWeight: 500, color: '#6B7280', borderBottom: '0.5px solid #F3F4F6', whiteSpace: 'nowrap' }}>{col.label}</th>)}
                                        {rows.length <= 20 && <th style={{ width: 28 }} />}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(rows.length <= 20 ? rows : rows.slice(0, 3)).map((row) => (
                                        <tr key={row.id} style={{ borderBottom: '0.5px solid #F9FAFB' }}>
                                          {prefilledCols.map((col) => (
                                            <td key={col.id} style={{ padding: '3px 6px' }}>
                                              {rows.length <= 20 ? (
                                                <input value={row.data?.[col.id] || ''} onChange={(e) => handleUpdateRow(tmpl.id, sec.id, row.id, col.id, e.target.value)} placeholder={col.label} style={{ width: '100%', fontSize: 11, padding: '4px 6px', border: '0.5px solid #E5E7EB', borderRadius: 6, background: '#fff', minHeight: 30 }} />
                                              ) : (
                                                <span style={{ fontSize: 11, color: '#374151', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{row.data?.[col.id] || '—'}</span>
                                              )}
                                            </td>
                                          ))}
                                          {rows.length <= 20 && <td style={{ padding: '3px 4px', textAlign: 'center' }}><button type="button" onClick={() => handleDeleteRow(tmpl.id, sec.id, row.id)} style={{ fontSize: 12, color: '#D1D5DB', cursor: 'pointer', background: 'none', border: 'none' }}>✕</button></td>}
                                        </tr>
                                      ))}
                                      {rows.length > 20 && <tr><td colSpan={prefilledCols.length} style={{ padding: '5px 10px', fontSize: 10, color: '#9CA3AF', textAlign: 'center' }}>… {rows.length - 3} more rows</td></tr>}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0 flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
          <button type="button" onClick={handleAssign} disabled={assigning || !selectedIds.length || !auditorId || !endDate} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
            {assigning ? 'Assigning…' : `Assign${selectedIds.length > 1 ? ` ${selectedIds.length} audits` : ' audit'}`}
          </button>
        </div>
      </div>

      <input ref={csvFileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
    </div>
  );
}
