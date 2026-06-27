import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getBlob, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import {
  effStatus, formatDate, statusMeta,
  SECTION_TYPES, QA_QUESTION_TYPES, COLUMN_TYPES, SECTION_META,
  getSectionFillProgress, getUnifiedFillProgress, getUnifiedAuditScore,
} from './auditHelpers';

const ROWS_PER_PAGE = 100;
const SEVERITIES = [
  { v:'Low',      cls:'bg-green-50  border-green-200  text-green-700',  act:'bg-green-500  border-green-500  text-white' },
  { v:'Medium',   cls:'bg-amber-50  border-amber-200  text-amber-700',  act:'bg-amber-500  border-amber-500  text-white' },
  { v:'High',     cls:'bg-orange-50 border-orange-200 text-orange-700', act:'bg-orange-500 border-orange-500 text-white' },
  { v:'Critical', cls:'bg-red-50    border-red-200    text-red-700',    act:'bg-red-500    border-red-500    text-white' },
];

export default function UnifiedAuditDetail({
  audit, companyId, currentUser, employees,
  onClose, showSuccess, showError, isAuditor, canManage,
}) {
  const safeAudit = audit || {};
  const sections  = useMemo(() => safeAudit.sections || [], [safeAudit.sections]);

  /* ── core state ──────────────────────────────────────────────────────── */
  const [sectionResponses, setSectionResponses] = useState(() => safeAudit.sectionResponses || {});
  const [findings,   setFindings]   = useState(() => safeAudit.findings   || []);
  const [adminNotes, setAdminNotes] = useState(() => safeAudit.adminNotes || '');

  /* ── navigation ──────────────────────────────────────────────────────── */
  const [activeTab,    setActiveTab]    = useState(() => sections[0] ? `sec_${sections[0].id}` : 'findings');

  /* ── records UI state (per section) ─────────────────────────────────── */
  const [recPage,   setRecPage]   = useState({});
  const [recSearch, setRecSearch] = useState({});
  const [recFilter, setRecFilter] = useState({});

  /* ── save state ──────────────────────────────────────────────────────── */
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved,  setLastSaved]  = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* ── modals ──────────────────────────────────────────────────────────── */
  const [showSubmit,      setShowSubmit]      = useState(false);
  const [showSendBack,    setShowSendBack]    = useState(false);
  const [sendBackReason,  setSendBackReason]  = useState('');
  const [sentBackTo,      setSentBackTo]      = useState(null);
  const [showClose,       setShowClose]       = useState(false);
  const [closeFeedback,   setCloseFeedback]   = useState('');
  const [auditRating,     setAuditRating]     = useState(0);
  const [closedData,      setClosedData]      = useState(null);

  /* ── findings UI ─────────────────────────────────────────────────────── */
  const [showAddFinding, setShowAddFinding] = useState(false);
  const [newFinding, setNewFinding] = useState({ description: '', severity: 'Medium', ownerName: '', ownerId: '', ownerEmail: '', targetDate: '' });
  const [ownerSearch, setOwnerSearch] = useState('');
  const [showOwnerDrop, setShowOwnerDrop] = useState(false);
  const ownerRef = useRef(null);

  const [auditDocs,    setAuditDocs]    = useState(() => safeAudit.auditDocuments || []);
  const [docUploading, setDocUploading] = useState(false);
  const [viewingDocId, setViewingDocId] = useState(null);

  const saveTimeoutRef = useRef(null);
  const isMountedRef   = useRef(true);
  const isSavingRef    = useRef(false);
  const docFileRef     = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    const h = (e) => { if (ownerRef.current && !ownerRef.current.contains(e.target)) setShowOwnerDrop(false); };
    document.addEventListener('mousedown', h);
    return () => { isMountedRef.current = false; document.removeEventListener('mousedown', h); clearTimeout(saveTimeoutRef.current); };
  }, []);

   
  useEffect(() => { setRecPage({}); }, [recSearch, recFilter]);

  /* ── derived ─────────────────────────────────────────────────────────── */
  const st            = effStatus(safeAudit.status);
  const isClosed      = safeAudit.status === 'Closed';
  const isUnderReview = st === 'Under Review';
  const managerCanAct = canManage && isUnderReview;
  const isEditable    = isAuditor && !isClosed && ['Assigned','In Progress','Sent Back'].includes(st);

  const fillProgress = useMemo(() => getUnifiedFillProgress({ sections, sectionResponses }), [sections, sectionResponses]);
  const score        = useMemo(() => getUnifiedAuditScore({ sections, sectionResponses }), [sections, sectionResponses]);

  const findingsData    = useMemo(() => (Array.isArray(findings) ? findings : []), [findings]);
  const openFindings    = findingsData.filter((f) => f.status !== 'Resolved');
  const resolvedFindings = findingsData.filter((f) => f.status === 'Resolved');

  const auditorEmployee = useMemo(
    () => (employees || []).find((e) => (e.email || '').toLowerCase() === (safeAudit.auditorEmail || '').toLowerCase()),
    [employees, safeAudit.auditorEmail],
  );
  const auditorPhone = auditorEmployee?.mobile || auditorEmployee?.phone || auditorEmployee?.mobileNumber || '';

  /* ── audit document upload / delete ─────────────────────────────── */
  const handleDocUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = ['application/pdf','image/jpeg','image/png','image/gif','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (file.size > 20 * 1024 * 1024) { showError('Max file size is 20MB'); return; }
    if (!ALLOWED.includes(file.type))  { showError('Only PDF, image or Word files allowed'); return; }
    try {
      setDocUploading(true);
      const path = `companies/${companyId}/audits/${audit.id}/${Date.now()}_${file.name}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, file);
      const newDoc = {
        id: Date.now().toString(),
        name: file.name,
        storagePath: path,
        size: file.size,
        type: file.type,
        uploadedBy: currentUser?.email || '',
        uploadedAt: new Date().toISOString(),
      };
      const updated = [...auditDocs, newDoc];
      setAuditDocs(updated);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), { auditDocuments: updated, updatedAt: serverTimestamp() });
      showSuccess(`${file.name} uploaded`);
    } catch (err) {
      showError('Upload failed: ' + err.message);
      if (import.meta.env.DEV) console.error(err);
    } finally {
      setDocUploading(false);
      e.target.value = '';
    }
  };

  const handleDocView = async (docItem) => {
    if (!docItem?.storagePath) {
      if (docItem?.url) window.open(docItem.url, '_blank');
      return;
    }
    setViewingDocId(docItem.id || docItem.storagePath);
    try {
      const fileRef = storageRef(storage, docItem.storagePath);
      const blob = await getBlob(fileRef);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    } catch {
      showError('Failed to load document');
    }
    setViewingDocId(null);
  };

  const handleDocDelete = async (docItem) => {
    try {
      if (docItem.storagePath) {
        await deleteObject(storageRef(storage, docItem.storagePath)).catch(() => {});
      }
      const updated = auditDocs.filter((d) => d.id !== docItem.id);
      setAuditDocs(updated);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), { auditDocuments: updated, updatedAt: serverTimestamp() });
      showSuccess('Document removed');
    } catch (err) {
      showError('Remove failed: ' + err.message);
    }
  };

  /* ── auto-save ───────────────────────────────────────────────────────── */
  const autoSave = useCallback((respUpd, findUpd, notesUpd) => {
    if (isClosed) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!isMountedRef.current || isSavingRef.current) return;
      try {
        isSavingRef.current = true;
        setAutoSaving(true);
        const newStatus = effStatus(safeAudit.status) === 'Assigned' ? 'In Progress' : safeAudit.status;
        await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
          sectionResponses: respUpd, findings: findUpd, adminNotes: notesUpd,
          status: newStatus, updatedAt: serverTimestamp(), updatedBy: currentUser?.email || '',
        });
        if (!isMountedRef.current) return;
        setLastSaved(new Date());
      } catch (e) { if (import.meta.env.DEV) console.error('Auto-save failed:', e); }
      finally { isSavingRef.current = false; if (isMountedRef.current) setAutoSaving(false); }
    }, 1500);
  }, [audit.id, companyId, currentUser, isClosed, safeAudit.status]);

  /* ── section response helpers ────────────────────────────────────────── */
  const mutateSec = useCallback((secId, updater) => {
    setSectionResponses((prev) => {
      const next = { ...prev, [secId]: updater(prev[secId] || {}) };
      autoSave(next, findingsData, adminNotes);
      return next;
    });
  }, [autoSave, findingsData, adminNotes]);

  // Checklist
  const setChecklistResult = (secId, itemId, result) => mutateSec(secId, (r) => ({ ...r, items: (r.items || []).map((i) => i.id === itemId ? { ...i, result } : i) }));
  const setChecklistNote   = (secId, itemId, note)   => mutateSec(secId, (r) => ({ ...r, items: (r.items || []).map((i) => i.id === itemId ? { ...i, note  } : i) }));

  // Records
  const setRecordCell = (secId, rowId, colId, value) => mutateSec(secId, (r) => ({ ...r, records: (r.records || []).map((row) => row.id === rowId ? { ...row, data: { ...row.data, [colId]: value } } : row) }));

  // Q&A
  const setQAAnswer = (secId, qId, value) => mutateSec(secId, (r) => ({ ...r, answers: { ...(r.answers || {}), [qId]: { value, answeredAt: new Date().toISOString() } } }));

  // Manager review (checklist + records)
  const setManagerReview = useCallback((secId, idKey, id, result) => {
    setSectionResponses((prev) => {
      const secResp = prev[secId] || {};
      const next = { ...prev, [secId]: { ...secResp, managerReview: { ...(secResp.managerReview || {}), [idKey]: { ...(secResp.managerReview?.[idKey] || {}), [id]: { result } } } } };
      autoSave(next, findingsData, adminNotes);
      return next;
    });
  }, [autoSave, findingsData, adminNotes]);

  /* ── findings handlers ───────────────────────────────────────────────── */
  const addFinding = () => {
    if (!newFinding.description.trim()) { showError('Enter finding description'); return; }
    const finding = {
      id: 'finding_' + Date.now(),
      description: newFinding.description.trim(),
      severity: newFinding.severity,
      ownerName: newFinding.ownerName, ownerId: newFinding.ownerId, ownerEmail: newFinding.ownerEmail || '',
      targetDate: newFinding.targetDate, status: 'Open', resolvedAt: null,
      addedBy: (currentUser?.email || '').toLowerCase(),
      addedByRole: isAuditor ? 'auditor' : 'auditmanager',
      addedByName: currentUser?.displayName || currentUser?.email || '',
      createdAt: new Date().toISOString(),
    };
    const updated = [...findingsData, finding];
    setFindings(updated); autoSave(sectionResponses, updated, adminNotes);
    setNewFinding({ description: '', severity: 'Medium', ownerName: '', ownerId: '', ownerEmail: '', targetDate: '' });
    setOwnerSearch(''); setShowAddFinding(false);
  };

  const updateFindingStatus = (id, newStatus) => {
    setFindings((prev) => { const u = prev.map((f) => f.id === id ? { ...f, status: newStatus, ...(newStatus === 'Resolved' && { resolvedAt: new Date().toISOString() }) } : f); autoSave(sectionResponses, u, adminNotes); return u; });
  };

  const deleteFinding = (id) => {
    const finding = findingsData.find((f) => f.id === id);
    if (!finding || isClosed) return;
    const role = finding.addedByRole || 'auditor';
    const canDel = isAuditor ? (role === 'auditor' && (finding.addedBy || '').toLowerCase() === (currentUser?.email || '').toLowerCase()) : (canManage && role === 'auditmanager');
    if (!canDel) return;
    const u = findingsData.filter((f) => f.id !== id);
    setFindings(u); autoSave(sectionResponses, u, adminNotes);
  };

  /* ── submit / workflow ───────────────────────────────────────────────── */
  const handleSubmit = async () => {
    for (const sec of sections) {
      if (sec.sectionType !== SECTION_TYPES.RECORDS) continue;
      const pCol = (sec.columns || []).find((c) => c.isPrimary && c.type === COLUMN_TYPES.AUDITOR_DROPDOWN);
      if (!pCol) continue;
      const records = sectionResponses[sec.id]?.records || [];
      const unfilled = records.filter((r) => !r.data?.[pCol.id]);
      if (unfilled.length) { showError(`Fill all ${unfilled.length} row${unfilled.length !== 1 ? 's' : ''} in "${sec.name}" before submitting`); return; }
    }
    if (submitting) return;
    try {
      setSubmitting(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        sectionResponses, findings: findingsData, adminNotes,
        status: 'Submitted', submittedAt: serverTimestamp(), submittedBy: currentUser?.email || '', updatedAt: serverTimestamp(),
      });
      showSuccess('Submitted!'); setShowSubmit(false); onClose();
    } catch (e) { showError('Submit failed: ' + e.message); } finally { setSubmitting(false); }
  };

  const handleMarkUnderReview = async () => {
    try { setSaving(true); await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), { status: 'Under Review', reviewStartedAt: serverTimestamp(), reviewStartedBy: currentUser?.email || '', updatedAt: serverTimestamp() }); showSuccess('Review started — go through each section then close from Overview'); } catch { showError('Failed'); } finally { setSaving(false); }
  };

  const handleCloseAudit = async () => {
    if (openFindings.length) { showError(`Resolve all ${openFindings.length} finding${openFindings.length !== 1 ? 's' : ''} first`); return; }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), { status: 'Closed', closedAt: serverTimestamp(), closedBy: currentUser?.email || '', managerNotes: adminNotes, auditRating, closeFeedback: closeFeedback.trim(), updatedAt: serverTimestamp() });
      showSuccess('Audit closed!');
      setClosedData({ phone: auditorPhone, name: safeAudit.auditorName, refId: safeAudit.auditRefId, typeName: safeAudit.auditTypeName, branch: safeAudit.branch, rating: auditRating });
    } catch { showError('Failed to close audit'); } finally { setSaving(false); }
  };

  const handleSendBack = async () => {
    if (!sendBackReason.trim()) { showError('Add a reason'); return; }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), { status: 'Sent Back', sentBackAt: serverTimestamp(), sentBackBy: currentUser?.email || '', sentBackReason: sendBackReason.trim(), updatedAt: serverTimestamp() });
      showSuccess('Audit sent back');
      setSentBackTo({ phone: auditorPhone, name: safeAudit.auditorName, reason: sendBackReason.trim(), refId: safeAudit.auditRefId });
      setSendBackReason('');
    } catch { showError('Failed to send back'); } finally { setSaving(false); }
  };

  /* ── tab config ──────────────────────────────────────────────────────── */
  const sectionTabs = sections.map((sec) => {
    const meta = SECTION_META[sec.sectionType] || {};
    const resp = sectionResponses[sec.id];
    const prog = getSectionFillProgress(sec, resp);
    return { id: `sec_${sec.id}`, secId: sec.id, label: sec.name, meta, prog, sec };
  });
  const allTabs = [
    ...sectionTabs,
    { id: 'findings',  label: 'Findings',  count: findingsData.length },
    { id: 'documents', label: 'Documents', count: auditDocs.length },
    ...(!isEditable ? [{ id: 'overview', label: managerCanAct ? 'Overview & Close' : 'Overview' }] : []),
  ];

  const activeSec    = sectionTabs.find((t) => t.id === activeTab)?.sec || null;
  const currentIdx   = allTabs.findIndex((t) => t.id === activeTab);
  const isFirstTab   = currentIdx === 0;
  const isLastTab    = currentIdx === allTabs.length - 1;
  const goNext       = () => { if (currentIdx < allTabs.length - 1) setActiveTab(allTabs[currentIdx + 1].id); };
  const goPrev       = () => { if (currentIdx > 0) setActiveTab(allTabs[currentIdx - 1].id); };

  /* ── render helpers ──────────────────────────────────────────────────── */
  const getOptColor = (col, val) => (!val || !col.options) ? null : (col.options.find((o) => o.label === val)?.color || null);

  /* ─────────────────────────────────────────────────────────────────────
     CHECKLIST SECTION RENDERER
  ───────────────────────────────────────────────────────────────────── */
  const renderChecklist = (sec) => {
    const resp = sectionResponses[sec.id] || {};
    const items = resp.items || sec.items?.map((i) => ({ id: i.id, result: '', note: '' })) || [];
    const reviewItems = resp.managerReview?.items || {};
    const responseOptions = sec.responseOptions || [{ label:'Pass',isPass:true,color:'#639922' },{ label:'Fail',isPass:false,color:'#E24B4A' },{ label:'NA',isPass:false,color:'#888780' }];

    return (
      <div className="space-y-2">
        {(sec.items || []).map((item) => {
          const row   = items.find((i) => i.id === item.id) || { id: item.id, result: '', note: '' };
          const rv    = reviewItems[item.id];
          const rOpt  = responseOptions.find((o) => o.label.toLowerCase() === row.result);
          return (
            <div key={item.id} className={`border rounded-xl p-3 transition-all ${rv?.result === 'concern' ? 'border-amber-200 bg-amber-50/40' : rv?.result === 'approved' ? 'border-green-100 bg-green-50/20' : 'border-gray-100 bg-white'}`}>
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 mt-0.5 w-2 h-2 rounded-full ${item.riskLevel === 'Critical' ? 'bg-red-500' : item.riskLevel === 'High' ? 'bg-orange-400' : item.riskLevel === 'Medium' ? 'bg-amber-400' : 'bg-green-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-snug mb-2">{item.question}</p>
                  {isEditable ? (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {responseOptions.map((opt) => (
                        <button key={opt.label} type="button" onClick={() => setChecklistResult(sec.id, item.id, opt.label.toLowerCase())}
                          className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-all min-h-[34px] ${row.result === opt.label.toLowerCase() ? 'text-white' : 'bg-white text-gray-500 border-gray-200 hover:opacity-80'}`}
                          style={row.result === opt.label.toLowerCase() ? { background: opt.color, borderColor: opt.color } : {}}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-2">
                      {row.result ? (
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: (rOpt?.color || '#888780') + '20', color: rOpt?.color || '#888780' }}>{row.result.charAt(0).toUpperCase() + row.result.slice(1)}</span>
                      ) : (
                        <span className="text-xs text-gray-300 italic">Not answered</span>
                      )}
                    </div>
                  )}
                  {isEditable && (
                    <input value={row.note || ''} onChange={(e) => setChecklistNote(sec.id, item.id, e.target.value)} placeholder="Note (optional)…" className="w-full text-xs border border-gray-200 rounded-xl px-2.5 py-2 focus:outline-none focus:border-[#1B6B6B]" />
                  )}
                  {!isEditable && row.note && <p className="text-xs text-gray-400 italic mt-1">&quot;{row.note}&quot;</p>}
                </div>
                {managerCanAct && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button type="button" onClick={() => setManagerReview(sec.id, 'items', item.id, rv?.result === 'approved' ? null : 'approved')}
                      className={`text-xs px-2 py-1.5 rounded-lg border font-medium transition-all ${rv?.result === 'approved' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-gray-400 border-gray-200 hover:border-green-200'}`}>✓</button>
                    <button type="button" onClick={() => setManagerReview(sec.id, 'items', item.id, rv?.result === 'concern' ? null : 'concern')}
                      className={`text-xs px-2 py-1.5 rounded-lg border font-medium transition-all ${rv?.result === 'concern' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-gray-400 border-gray-200 hover:border-amber-200'}`}>⚠</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {(sec.items || []).length === 0 && <p className="text-sm text-gray-400 text-center py-8">No items in this section</p>}
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────
     RECORDS SECTION RENDERER
  ───────────────────────────────────────────────────────────────────── */
  const renderRecords = (sec) => {
    const resp     = sectionResponses[sec.id] || {};
    const allRows  = resp.records || [];
    const cols     = sec.columns || [];
    const preCols  = cols.filter((c) => c.type?.startsWith('prefilled'));
    const audCols  = cols.filter((c) => [COLUMN_TYPES.AUDITOR_DROPDOWN,COLUMN_TYPES.AUDITOR_TEXT,COLUMN_TYPES.AUDITOR_NUMBER,COLUMN_TYPES.AUDITOR_DATE].includes(c.type));
    const primaryCol = audCols.find((c) => c.isPrimary) || audCols[0];
    const reviewRows  = resp.managerReview?.rows || {};
    const search   = recSearch[sec.id] || '';
    const filter   = recFilter[sec.id] || 'all';
    const page     = recPage[sec.id]   || 1;
    const colMinW  = (col) => col.type === COLUMN_TYPES.AUDITOR_TEXT ? 160 : col.type === COLUMN_TYPES.AUDITOR_DROPDOWN ? 150 : col.type?.includes('number') ? 80 : col.type === COLUMN_TYPES.AUDITOR_DATE ? 130 : 120;

    const filtered = allRows.filter((row) => {
      if (search) { const q = search.toLowerCase(); const match = cols.some((c) => String(row.data?.[c.id] || '').toLowerCase().includes(q)); if (!match) return false; }
      if (filter !== 'all' && primaryCol) { if (filter === '__unfilled') return !row.data?.[primaryCol.id]; return row.data?.[primaryCol.id] === filter; }
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
    const safePage   = Math.min(page, totalPages);
    const paginated  = filtered.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);

    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <input value={search} onChange={(e) => setRecSearch((p) => ({ ...p, [sec.id]: e.target.value }))} placeholder="Search…" className="w-full text-xs border border-gray-200 rounded-xl pl-6 pr-2 py-2 focus:outline-none focus:border-[#1B6B6B]" />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">🔍</span>
          </div>
          <select value={filter} onChange={(e) => setRecFilter((p) => ({ ...p, [sec.id]: e.target.value }))} className="text-xs border border-gray-200 rounded-xl px-2 py-2 bg-white flex-shrink-0">
            <option value="all">All rows</option>
            <option value="__unfilled">Unfilled only</option>
            {primaryCol && (primaryCol.options || []).map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
          </select>
          <span className="text-xs text-gray-400 self-center flex-shrink-0">{filtered.length}/{allRows.length}</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table style={{ borderCollapse:'collapse', width:'100%', fontSize:12, minWidth: 44 + (managerCanAct ? 100 : 0) + preCols.reduce((n,c) => n + colMinW(c) + 20, 0) + audCols.reduce((n,c) => n + colMinW(c) + 20, 0) }}>
            <thead>
              <tr style={{ background:'#F9FAFB', position:'sticky', top:0, zIndex:2 }}>
                <th style={{ width:44, minWidth:44, padding:'7px 10px', fontSize:10, fontWeight:500, color:'#6B7280', borderBottom:'0.5px solid #E5E7EB', position:'sticky', left:0, background:'#F9FAFB', zIndex:3 }}>#</th>
                {preCols.map((col) => <th key={col.id} style={{ padding:'7px 10px', textAlign:'left', fontSize:10, fontWeight:500, color:'#6B7280', borderBottom:'0.5px solid #E5E7EB', whiteSpace:'nowrap', minWidth:colMinW(col) }}>{col.label}</th>)}
                {audCols.map((col) => <th key={col.id} style={{ padding:'7px 10px', textAlign:'left', fontSize:10, fontWeight:500, color:'#0F6E56', background:'#E8F5F5', borderBottom:'0.5px solid #9FE1CB', whiteSpace:'nowrap', minWidth:colMinW(col) }}>{col.label}{col.isPrimary ? ' ★' : ''}{col.unit ? ` (${col.unit})` : ''}</th>)}
                {managerCanAct && <th style={{ width:100, padding:'7px 6px', fontSize:10, fontWeight:500, color:'#6B7280', borderBottom:'0.5px solid #E5E7EB', textAlign:'center' }}>Review</th>}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={1 + preCols.length + audCols.length + (managerCanAct ? 1 : 0)} style={{ textAlign:'center', padding:32, color:'#9CA3AF', fontSize:13 }}>No rows match</td></tr>
              ) : paginated.map((row, ri) => {
                const rowNum  = (safePage - 1) * ROWS_PER_PAGE + ri + 1;
                const rv      = reviewRows[row.id];
                const rowBg   = rv?.result === 'concern' ? '#FAEEDA10' : rv?.result === 'approved' ? '#EAF3DE10' : 'transparent';
                return (
                  <tr key={row.id} style={{ borderBottom:'0.5px solid #F3F4F6', background:rowBg }}>
                    <td style={{ padding:'5px 10px', color:'#9CA3AF', fontSize:11, position:'sticky', left:0, background:rowBg || '#F9FAFB', zIndex:1, textAlign:'center', minWidth:44 }}>{rowNum}</td>
                    {preCols.map((col) => <td key={col.id} style={{ padding:'5px 10px', color:'#6B7280', background:'#F9FAFB', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.data?.[col.id] || '—'}</td>)}
                    {audCols.map((col) => {
                      const val    = row.data?.[col.id] || '';
                      const optClr = col.type === COLUMN_TYPES.AUDITOR_DROPDOWN ? getOptColor(col, val) : null;
                      if (col.type === COLUMN_TYPES.AUDITOR_DROPDOWN) return (
                        <td key={col.id} style={{ padding:'3px 6px', background:'#fff' }}>
                          {isEditable ? (
                            <select value={val} onChange={(e) => setRecordCell(sec.id, row.id, col.id, e.target.value)} style={{ width:'100%', fontSize:12, padding:'5px 6px', borderRadius:8, border: val ? `1.5px solid ${optClr || '#D3D1C7'}` : '0.5px solid #E5E7EB', background: val && optClr ? optClr+'15' : '#fff', color:'#111827', minHeight:40, cursor:'pointer' }}>
                              <option value="">— Select —</option>
                              {(col.options || []).map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
                            </select>
                          ) : val ? (
                            <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, fontWeight:500, background: optClr ? optClr+'20' : '#F1EFE8', color: optClr || '#5F5E5A', display:'inline-block' }}>{val}</span>
                          ) : <span style={{ fontSize:11, color:'#D1D5DB' }}>—</span>}
                        </td>
                      );
                      if (col.type === COLUMN_TYPES.AUDITOR_NUMBER) return (
                        <td key={col.id} style={{ padding:'3px 6px', background:'#fff' }}>
                          {isEditable ? (
                            <input type="number" value={val} onChange={(e) => setRecordCell(sec.id, row.id, col.id, e.target.value)} placeholder="0" style={{ width:'100%', fontSize:12, padding:'5px 6px', borderRadius:8, border:'0.5px solid #E5E7EB', background:'#fff', color:'#111827', minHeight:40 }} />
                          ) : <span style={{ fontSize:11, color:'#374151' }}>{val || '—'}</span>}
                        </td>
                      );
                      if (col.type === COLUMN_TYPES.AUDITOR_TEXT) return (
                        <td key={col.id} style={{ padding:'3px 6px', background:'#fff' }}>
                          {isEditable ? (
                            <input value={val} onChange={(e) => setRecordCell(sec.id, row.id, col.id, e.target.value)} placeholder="Note…" style={{ width:'100%', fontSize:12, padding:'5px 6px', borderRadius:8, border:'0.5px solid #E5E7EB', background:'#fff', color:'#111827', minHeight:40 }} />
                          ) : <span style={{ fontSize:11, color:'#6B7280' }}>{val || '—'}</span>}
                        </td>
                      );
                      if (col.type === COLUMN_TYPES.AUDITOR_DATE) return (
                        <td key={col.id} style={{ padding:'3px 6px', background:'#fff' }}>
                          {isEditable ? (
                            <input type="date" value={val} onChange={(e) => setRecordCell(sec.id, row.id, col.id, e.target.value)} style={{ width:'100%', fontSize:12, padding:'5px 6px', borderRadius:8, border:'0.5px solid #E5E7EB', background:'#fff', color:'#111827', minHeight:40 }} />
                          ) : <span style={{ fontSize:11, color:'#374151' }}>{val || '—'}</span>}
                        </td>
                      );
                      return <td key={col.id} style={{ padding:'5px 10px', color:'#9CA3AF' }}>—</td>;
                    })}
                    {managerCanAct && (
                      <td style={{ padding:'3px 6px', textAlign:'center' }}>
                        <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                          <button type="button" onClick={() => setManagerReview(sec.id, 'rows', row.id, rv?.result === 'approved' ? null : 'approved')} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, border:`0.5px solid ${rv?.result === 'approved' ? '#C0DD97' : '#E5E7EB'}`, background: rv?.result === 'approved' ? '#EAF3DE' : '#fff', color: rv?.result === 'approved' ? '#3B6D11' : '#9CA3AF', cursor:'pointer', fontWeight:500 }}>✓</button>
                          <button type="button" onClick={() => setManagerReview(sec.id, 'rows', row.id, rv?.result === 'concern' ? null : 'concern')} style={{ fontSize:10, padding:'3px 8px', borderRadius:6, border:`0.5px solid ${rv?.result === 'concern' ? '#FAC775' : '#E5E7EB'}`, background: rv?.result === 'concern' ? '#FAEEDA' : '#fff', color: rv?.result === 'concern' ? '#854F0B' : '#9CA3AF', cursor:'pointer', fontWeight:500 }}>⚠</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs text-gray-400">Page {safePage}/{totalPages}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setRecPage((p) => ({ ...p, [sec.id]: Math.max(1, safePage - 1) }))} disabled={safePage === 1} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40">←</button>
              <button type="button" onClick={() => setRecPage((p) => ({ ...p, [sec.id]: Math.min(totalPages, safePage + 1) }))} disabled={safePage === totalPages} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40">→</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────
     Q&A SECTION RENDERER
  ───────────────────────────────────────────────────────────────────── */
  const renderQA = (sec) => {
    const resp        = sectionResponses[sec.id] || {};
    const answers     = resp.answers || {};
    const reviewItems = resp.managerReview?.items || {};
    return (
      <div className="space-y-4">
        {(sec.questions || []).map((q) => {
          const ans = answers[q.id];
          return (
            <div key={q.id} className="bg-white border border-gray-100 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-sm font-medium text-gray-800 leading-snug">{q.question}</p>
                <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium" style={{ background: SECTION_META[SECTION_TYPES.QA].bg, color: SECTION_META[SECTION_TYPES.QA].color }}>
                  {q.type === QA_QUESTION_TYPES.NUMBER ? `Number${q.unit ? ` · ${q.unit}` : ''}` : q.type === QA_QUESTION_TYPES.DATE ? 'Date' : q.type === QA_QUESTION_TYPES.DROPDOWN ? 'Dropdown' : 'Text'}
                </span>
              </div>
              {isEditable ? (
                <>
                  {q.type === QA_QUESTION_TYPES.TEXT && <textarea value={ans?.value || ''} onChange={(e) => setQAAnswer(sec.id, q.id, e.target.value)} rows={2} placeholder="Your answer…" className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-[#7F77DD]" />}
                  {q.type === QA_QUESTION_TYPES.NUMBER && <div className="flex items-center gap-2"><input type="number" value={ans?.value || ''} onChange={(e) => setQAAnswer(sec.id, q.id, e.target.value)} placeholder="0" className="w-40 text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#7F77DD]" />{q.unit && <span className="text-sm text-gray-400">{q.unit}</span>}</div>}
                  {q.type === QA_QUESTION_TYPES.DATE && <input type="date" value={ans?.value || ''} onChange={(e) => setQAAnswer(sec.id, q.id, e.target.value)} className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#7F77DD] w-48" />}
                  {q.type === QA_QUESTION_TYPES.DROPDOWN && <select value={ans?.value || ''} onChange={(e) => setQAAnswer(sec.id, q.id, e.target.value)} className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#7F77DD] w-full bg-white"><option value="">— Select —</option>{(q.options || []).map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}</select>}
                </>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    {ans?.value != null && String(ans.value).trim() !== '' ? (
                      <p className="text-base font-semibold text-gray-800">{ans.value}{q.type === QA_QUESTION_TYPES.NUMBER && q.unit ? ` ${q.unit}` : ''}</p>
                    ) : (
                      <p className="text-sm text-gray-300 italic">Not answered</p>
                    )}
                  </div>
                  {managerCanAct && (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button type="button" onClick={() => setManagerReview(sec.id, 'items', q.id, reviewItems[q.id]?.result === 'approved' ? null : 'approved')}
                        className={`text-xs px-2 py-1.5 rounded-lg border font-medium transition-all ${reviewItems[q.id]?.result === 'approved' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-white text-gray-400 border-gray-200 hover:border-green-200'}`}>✓</button>
                      <button type="button" onClick={() => setManagerReview(sec.id, 'items', q.id, reviewItems[q.id]?.result === 'concern' ? null : 'concern')}
                        className={`text-xs px-2 py-1.5 rounded-lg border font-medium transition-all ${reviewItems[q.id]?.result === 'concern' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-white text-gray-400 border-gray-200 hover:border-amber-200'}`}>⚠</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {(sec.questions || []).length === 0 && <p className="text-sm text-gray-400 text-center py-8">No questions in this section</p>}
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────────────
     FINDINGS TAB
  ───────────────────────────────────────────────────────────────────── */
  const renderFindings = () => (
    <div className="space-y-3">
      {!isClosed && (isEditable || managerCanAct) && (
        <button type="button" onClick={() => setShowAddFinding(true)} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors">+ Add Finding</button>
      )}
      {showAddFinding && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
          <p className="text-sm font-semibold text-gray-700">New Finding</p>
          <textarea value={newFinding.description} onChange={(e) => setNewFinding((p) => ({ ...p, description: e.target.value }))} rows={2} placeholder="Describe the finding…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B] bg-white" />
          <div className="flex gap-1.5 flex-wrap">
            {SEVERITIES.map((s) => <button key={s.v} type="button" onClick={() => setNewFinding((p) => ({ ...p, severity: s.v }))} className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${newFinding.severity === s.v ? s.act : s.cls}`}>{s.v}</button>)}
          </div>
          <div ref={ownerRef} className="relative">
            <input type="text" value={newFinding.ownerName || ownerSearch} placeholder="Assign owner…" onChange={(e) => { setOwnerSearch(e.target.value); setShowOwnerDrop(true); if (!e.target.value) setNewFinding((p) => ({ ...p, ownerName:'', ownerId:'', ownerEmail:'' })); }} onFocus={() => { setOwnerSearch(''); setShowOwnerDrop(true); setNewFinding((p) => ({ ...p, ownerName:'', ownerId:'', ownerEmail:'' })); }} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] bg-white" />
            {showOwnerDrop && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-40 overflow-y-auto">
                {(employees || []).filter((e) => e.status === 'Active' && (!ownerSearch || e.fullName?.toLowerCase().includes(ownerSearch.toLowerCase()))).slice(0,6).map((emp) => (
                  <div key={emp.id} onMouseDown={(ev) => { ev.preventDefault(); setNewFinding((p) => ({ ...p, ownerName: emp.fullName, ownerId: emp.id, ownerEmail: emp.email || '' })); setOwnerSearch(''); setShowOwnerDrop(false); }} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <div className="w-6 h-6 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold">{emp.fullName?.charAt(0)}</div>
                    <p className="text-xs text-gray-800">{emp.fullName}</p>
                  </div>
                ))}
              </div>
            )}
            {newFinding.ownerName && <p className="text-xs text-green-600 mt-1">✓ {newFinding.ownerName}</p>}
          </div>
          <input type="date" value={newFinding.targetDate} onChange={(e) => setNewFinding((p) => ({ ...p, targetDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] bg-white" />
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowAddFinding(false); setNewFinding({ description:'', severity:'Medium', ownerName:'', ownerId:'', ownerEmail:'', targetDate:'' }); setOwnerSearch(''); }} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
            <button type="button" onClick={addFinding} className="flex-1 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium">Add Finding</button>
          </div>
        </div>
      )}
      {findingsData.length === 0 && !showAddFinding && (
        <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl"><p className="text-3xl mb-2">✅</p><p className="text-sm font-medium text-gray-600">No findings</p></div>
      )}
      {findingsData.map((f) => {
        const isOverdue = f.targetDate && f.status !== 'Resolved' && new Date(f.targetDate) < new Date();
        return (
          <div key={f.id} className={`border rounded-xl p-4 ${f.status === 'Resolved' ? 'bg-green-50 border-green-100' : isOverdue ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`} style={{ borderLeftWidth:3, borderLeftColor: f.severity === 'Critical' ? '#E24B4A' : f.severity === 'High' ? '#EF9F27' : f.severity === 'Medium' ? '#378ADD' : '#639922' }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-gray-800 flex-1">{f.description}</p>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.severity === 'Critical' ? 'bg-red-100 text-red-700' : f.severity === 'High' ? 'bg-orange-100 text-orange-700' : f.severity === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{f.severity}</span>
                {!isClosed && (() => { const role = f.addedByRole || 'auditor'; const canDel = isAuditor ? (role === 'auditor' && (f.addedBy || '').toLowerCase() === (currentUser?.email || '').toLowerCase()) : (canManage && role === 'auditmanager'); if (!canDel) return null; return <button type="button" onClick={() => deleteFinding(f.id)} className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500">✕</button>; })()}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${f.addedByRole === 'auditor' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'}`}>{f.addedByRole === 'auditor' ? '👷 Auditor' : '🧑‍💼 Manager'}</span>
              {f.ownerName && <span className="text-xs text-gray-500">👤 {f.ownerName}</span>}
              {f.targetDate && <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-gray-500'}`}>{isOverdue ? '⚠️ ' : '📅 '}{formatDate(f.targetDate)}</span>}
            </div>
            {!isClosed && managerCanAct && (
              <div className="flex gap-2 flex-wrap">
                {['Open','In Progress','Resolved'].map((s) => <button key={s} type="button" onClick={() => updateFindingStatus(f.id, s)} className={`rounded-xl border px-3 py-1 text-xs font-medium transition-all ${f.status === s ? (s==='Resolved'?'bg-green-500 text-white border-green-500':s==='In Progress'?'bg-blue-500 text-white border-blue-500':'bg-gray-700 text-white border-gray-700') : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{s==='Resolved'?'✅ Resolved':s==='In Progress'?'🔄 In Progress':'⭕ Open'}</button>)}
              </div>
            )}
            {(isClosed || !managerCanAct) && <span className={`text-xs px-2 py-0.5 rounded-full ${f.status==='Resolved'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{f.status}</span>}
          </div>
        );
      })}
    </div>
  );

  /* ─────────────────────────────────────────────────────────────────────
     OVERVIEW TAB
  ───────────────────────────────────────────────────────────────────── */
  const renderOverview = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="border rounded-xl p-3 text-center bg-gray-50"><p className="text-xl font-bold text-gray-800">{fillProgress.total}</p><p className="text-xs text-gray-400 mt-0.5">Total items</p></div>
        <div className="border rounded-xl p-3 text-center bg-green-50 border-green-100"><p className="text-xl font-bold text-green-700">{fillProgress.filled}</p><p className="text-xs text-green-600 mt-0.5">Filled</p></div>
        {score !== null ? (
          <div className={`border rounded-xl p-3 text-center ${score >= 80 ? 'bg-green-50 border-green-100' : score >= 60 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
            <p className={`text-xl font-bold ${score >= 80 ? 'text-green-700' : score >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{score}%</p>
            <p className={`text-xs mt-0.5 ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>Score</p>
          </div>
        ) : <div className="border rounded-xl p-3 text-center bg-gray-50"><p className="text-xl font-bold text-gray-300">—</p><p className="text-xs text-gray-400 mt-0.5">Score</p></div>}
      </div>
      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sections</p>
        {sections.map((sec) => { const meta = SECTION_META[sec.sectionType] || {}; const prog = getSectionFillProgress(sec, sectionResponses[sec.id]); return (<div key={sec.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"><div className="flex items-center gap-2"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span><span className="text-xs text-gray-700">{sec.name}</span></div><span className="text-xs text-gray-400">{prog.filled}/{prog.total}</span></div>); })}
      </div>
      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-1.5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Audit details</p>
        {[{ l:'Reference', v:safeAudit.auditRefId },{ l:'Category', v:safeAudit.auditCategory },{ l:'Risk', v:safeAudit.riskLevel },{ l:'Branch', v:safeAudit.branch },{ l:'Location', v:safeAudit.location },{ l:'Auditor', v:safeAudit.auditorName },{ l:'Due', v:safeAudit.endDate ? formatDate(safeAudit.endDate) : '' }].filter((r) => r.v).map((r) => (
          <div key={r.l} className="flex justify-between"><p className="text-xs text-gray-400">{r.l}</p><p className="text-xs font-medium text-gray-700">{r.v}</p></div>
        ))}
      </div>
      {findingsData.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Findings</p>
          <div className="grid grid-cols-3 gap-2">
            {[{ l:'Total', v:findingsData.length, c:'text-gray-700' },{ l:'Open', v:openFindings.length, c:openFindings.length>0?'text-red-600':'text-gray-700' },{ l:'Resolved', v:resolvedFindings.length, c:'text-green-600' }].map((s) => <div key={s.l} className="text-center bg-gray-50 rounded-xl p-3"><p className={`text-xl font-bold ${s.c}`}>{s.v}</p><p className="text-xs text-gray-400 mt-0.5">{s.l}</p></div>)}
          </div>
        </div>
      )}
      {safeAudit.status === 'Closed' && safeAudit.auditRating > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Manager feedback</p>
          <div className="flex items-center gap-2 mb-2">{[1,2,3,4,5].map((n) => <span key={n} className={`text-xl ${n <= safeAudit.auditRating ? 'text-amber-400' : 'text-gray-200'}`}>⭐</span>)}<span className="text-sm font-semibold text-gray-700">{['','Poor','Fair','Good','Very Good','Excellent'][safeAudit.auditRating]}</span></div>
          {safeAudit.closeFeedback && <p className="text-sm text-gray-600 italic bg-gray-50 rounded-xl px-3 py-2.5">&quot;{safeAudit.closeFeedback}&quot;</p>}
        </div>
      )}
      {canManage && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Manager notes</label>
          {/* eslint-disable-next-line react-hooks/refs */}
          <textarea value={adminNotes} disabled={isClosed} onChange={(e) => { setAdminNotes(e.target.value); autoSave(sectionResponses, findingsData, e.target.value); }} rows={3} placeholder="Internal notes…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B] disabled:bg-gray-50" />
        </div>
      )}

    </div>
  );

  /* ─────────────────────────────────────────────────────────────────────
     MAIN RENDER
  ───────────────────────────────────────────────────────────────────── */
  const smeta = statusMeta(safeAudit.status);
  const pct   = fillProgress.total > 0 ? Math.round((fillProgress.filled / fillProgress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div role="presentation" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-sm sm:mx-4 sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-4 py-2 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="rounded-xl bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold text-gray-400">{safeAudit.auditRefId}</span>
                <span className="text-sm font-semibold text-gray-800 truncate">{safeAudit.auditTypeName}</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${smeta.badge}`}>{smeta.icon} {st}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                {safeAudit.branch   && <span>🏢 {safeAudit.branch}</span>}
                {safeAudit.location && <span>📍 {safeAudit.location}</span>}
                {safeAudit.auditorName && <span>👤 {safeAudit.auditorName}</span>}
                {safeAudit.endDate  && <span>📅 Due {formatDate(safeAudit.endDate)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {score !== null && <div className="text-right"><p className={`text-lg font-bold leading-none ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{score}%</p><p className="text-[10px] text-gray-400 mt-0.5">score</p></div>}
              {autoSaving && <span className="text-xs text-gray-400">saving…</span>}
              {!autoSaving && lastSaved && !isClosed && <span className="text-xs text-gray-400">✓ saved</span>}
              <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>
          </div>

          {st === 'Sent Back' && safeAudit.sentBackReason && (
            <div className="mb-2 p-2.5 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs font-semibold text-red-700 mb-0.5">↩ Sent back for corrections</p>
              <p className="text-xs text-red-600">{safeAudit.sentBackReason}</p>
            </div>
          )}

          <div className="mb-1.5">
            <div className="flex justify-between mb-0.5"><span className="text-xs text-gray-400">{fillProgress.filled}/{fillProgress.total} filled</span><span className="text-xs text-gray-400">{pct}%</span></div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#1B6B6B] rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none flex-nowrap -mb-px">
          {allTabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors ${activeTab === t.id ? 'border-[#1B6B6B] text-[#1B6B6B]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {t.meta?.icon && <span style={{ fontSize: 11 }}>{t.meta.icon}</span>}{t.label}
              {t.prog ? (
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
        t.prog.total === 0 ? 'bg-gray-200' :
        t.prog.filled === t.prog.total ? 'bg-green-500' :
        t.prog.filled > 0 ? 'bg-amber-400' : 'bg-gray-200'
      }`} />
    ) : t.count !== undefined ? (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === t.id ? 'bg-[#E1F5EE] text-[#0F6E56]' : 'bg-gray-100 text-gray-400'}`}>{t.count}</span>
    ) : null}
            </button>
          ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab.startsWith('sec_') && activeSec && (
            <>
              {activeSec.sectionType === SECTION_TYPES.CHECKLIST && renderChecklist(activeSec)}
              {activeSec.sectionType === SECTION_TYPES.RECORDS   && renderRecords(activeSec)}
              {activeSec.sectionType === SECTION_TYPES.QA        && renderQA(activeSec)}
            </>
          )}
          {activeTab === 'findings' && (
            /* eslint-disable-next-line react-hooks/refs */
            renderFindings()
          )}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xl flex-shrink-0">📎</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Audit Documents</p>
                    <p className="text-xs text-gray-400">PDF, image or Word · max 20MB per file</p>
                  </div>
                </div>
                {(isEditable || (canManage && !isClosed)) && (
                  <button type="button" onClick={() => !docUploading && docFileRef.current?.click()} disabled={docUploading} className="flex items-center gap-1.5 px-3 py-2 bg-[#1B6B6B] text-white text-xs rounded-xl font-medium flex-shrink-0 disabled:opacity-50 min-h-[36px]">
                    {docUploading ? 'Uploading…' : '+ Upload'}
                  </button>
                )}
              </div>

              {(isEditable || (canManage && !isClosed)) && (
                <div onClick={() => !docUploading && docFileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && !docUploading && docFileRef.current?.click()} className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-[#1B6B6B] hover:bg-[#E8F5F5]/30 transition-all">
                  {docUploading ? <p className="text-sm text-gray-400">Uploading…</p> : (
                    <>
                      <p className="text-2xl mb-2">📁</p>
                      <p className="text-sm text-gray-500 font-medium">Tap to upload a document</p>
                      <p className="text-xs text-gray-400 mt-1">PDF, image (JPEG/PNG/WebP), or Word</p>
                    </>
                  )}
                </div>
              )}

              {auditDocs.length === 0 && !(isEditable || (canManage && !isClosed)) && (
                <div className="text-center py-10 border-2 border-dashed border-gray-100 rounded-2xl">
                  <p className="text-3xl mb-2">📂</p>
                  <p className="text-sm font-medium text-gray-500">No documents uploaded</p>
                  <p className="text-xs text-gray-400 mt-1">The auditor can upload physical reports here</p>
                </div>
              )}

              {auditDocs.length > 0 && (
                <div className="space-y-2">
                  {auditDocs.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
                      <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-lg flex-shrink-0">
                        {d.type?.includes('pdf') ? '📄' : d.type?.startsWith('image') ? '🖼️' : '📝'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{d.name}</p>
                        <p className="text-xs text-gray-400">{d.size ? `${(d.size / 1024 / 1024).toFixed(1)} MB` : ''}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}</p>
                      </div>
                      {(d.storagePath || d.url) && (
                        <button
                          type="button"
                          onClick={() => handleDocView(d)}
                          disabled={viewingDocId === (d.id || d.storagePath)}
                          className="text-xs text-[#1B6B6B] font-medium hover:underline flex-shrink-0 px-2 py-1 rounded-lg hover:bg-[#E8F5F5] disabled:opacity-50"
                        >
                          {viewingDocId === (d.id || d.storagePath) ? 'Loading…' : 'View'}
                        </button>
                      )}
                      {(isEditable || (canManage && !isClosed)) && (
                        <button type="button" onClick={() => handleDocDelete(d)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 flex-shrink-0 transition-colors">✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeTab === 'overview' && renderOverview()}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
          <div className="flex gap-2">
            {!isFirstTab && (
              <button type="button" onClick={goPrev} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">← Back</button>
            )}
            {isClosed ? (
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Close</button>
            ) : isEditable && activeTab === 'documents' ? (
              <button type="button" onClick={() => setShowSubmit(true)} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold">📤 Submit to Manager</button>
            ) : st === 'Submitted' && canManage && activeTab === 'overview' ? (
              <>
                <button type="button" onClick={() => { setSentBackTo(null); setShowSendBack(true); }} className="flex-1 py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium">↩ Send Back</button>
                <button type="button" onClick={handleMarkUnderReview} disabled={saving} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold disabled:opacity-50">👀 Start Review</button>
              </>
            ) : managerCanAct && activeTab === 'overview' ? (
              <>
                <button type="button" onClick={() => { setSentBackTo(null); setShowSendBack(true); }} className="flex-1 py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium">↩ Send Back</button>
                <button type="button" onClick={() => { setClosedData(null); setShowClose(true); }} disabled={openFindings.length > 0} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40">
                  {openFindings.length > 0 ? `Resolve ${openFindings.length} finding${openFindings.length !== 1 ? 's' : ''} first` : '✅ Close Audit'}
                </button>
              </>
            ) : !isLastTab ? (
              <button type="button" onClick={goNext} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold">Next →</button>
            ) : (
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Close</button>
            )}
          </div>
        </div>
      </div>

      <input ref={docFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx" className="hidden" onChange={handleDocUpload} />

      {/* Submit confirm */}
      {showSubmit && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
          <div role="presentation" className="absolute inset-0 bg-black/50" onClick={() => setShowSubmit(false)} />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 sm:mx-4">
            <div className="text-center mb-4"><div className="w-14 h-14 bg-[#E8F5F5] rounded-full flex items-center justify-center text-2xl mx-auto mb-3">📤</div><h3 className="text-base font-semibold text-gray-800 mb-1">Submit audit?</h3><p className="text-sm text-gray-500">Once submitted you cannot edit responses.</p></div>
            <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Total items</span><span className="font-medium">{fillProgress.total}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Filled</span><span className="font-medium text-green-600">{fillProgress.filled}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Findings</span><span className="font-medium">{findingsData.filter((f) => f.addedByRole === 'auditor').length}</span></div>
              {score !== null && <div className="flex justify-between text-sm"><span className="text-gray-500">Score</span><span className={`font-bold ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{score}%</span></div>}
            </div>
            <div className="flex gap-2"><button type="button" onClick={() => setShowSubmit(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button><button type="button" onClick={handleSubmit} disabled={submitting} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold disabled:opacity-50">{submitting ? 'Submitting…' : 'Confirm'}</button></div>
          </div>
        </div>
      )}

      {/* Send back */}
      {showSendBack && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
          <div role="presentation" className="absolute inset-0 bg-black/50" onClick={() => { setShowSendBack(false); setSendBackReason(''); setSentBackTo(null); }} />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 sm:mx-4">
            {sentBackTo ? (
              <><h3 className="text-base font-semibold text-gray-800 mb-2 text-center">Sent back</h3>
              {sentBackTo.phone ? <a href={`https://wa.me/${sentBackTo.phone.replace(/\D/g,'')}?text=${encodeURIComponent(`Dear ${sentBackTo.name} Garu,\n\nAudit *${sentBackTo.refId}* sent back.\n\nReason: ${sentBackTo.reason}\n\nPlease log in to AttendX and resubmit.\n\nThank you`)}`} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] text-white rounded-xl text-sm font-medium mb-3">📱 Notify on WhatsApp</a> : null}
              <button type="button" onClick={() => { setShowSendBack(false); setSentBackTo(null); onClose(); }} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Done</button></>
            ) : (
              <><h3 className="text-base font-semibold text-gray-800 mb-2">↩ Send Back</h3>
              <textarea value={sendBackReason} onChange={(e) => setSendBackReason(e.target.value)} rows={3} placeholder="Reason for sending back…" className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-red-400 mb-4" autoFocus />
              <div className="flex gap-2"><button type="button" onClick={() => { setShowSendBack(false); setSendBackReason(''); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button><button type="button" onClick={handleSendBack} disabled={!sendBackReason.trim() || saving} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? 'Sending…' : '↩ Send Back'}</button></div></>
            )}
          </div>
        </div>
      )}

      {/* Close audit */}
      {showClose && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
          <div role="presentation" className="absolute inset-0 bg-black/50" onClick={() => { setShowClose(false); setClosedData(null); setAuditRating(0); setCloseFeedback(''); }} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-6 sm:mx-4">
            {closedData ? (
              <><h3 className="text-base font-semibold text-gray-800 mb-2 text-center">Audit closed</h3>
              {closedData.phone ? <a href={`https://wa.me/${closedData.phone.replace(/\D/g,'')}?text=${encodeURIComponent(`Dear ${closedData.name} Garu,\n\nAudit *${closedData.refId}* — ${closedData.typeName}${closedData.branch?` (${closedData.branch})`:''} has been closed.\n${closedData.rating?`Rating: ${'⭐'.repeat(closedData.rating)}\n`:''}\nThank you.\n\nAudit Manager`)}`} target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 py-3 bg-[#25D366] text-white rounded-xl text-sm font-medium mb-3">📱 Notify on WhatsApp</a> : null}
              <button type="button" onClick={() => { setShowClose(false); setClosedData(null); setAuditRating(0); setCloseFeedback(''); onClose(); }} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Done</button></>
            ) : (
              <><h3 className="text-base font-semibold text-gray-800 mb-4">✅ Close Audit</h3>
              {score !== null && <div className={`p-4 rounded-xl mb-4 text-center ${score>=80?'bg-green-50 border border-green-100':score>=60?'bg-amber-50 border border-amber-100':'bg-red-50 border border-red-100'}`}><p className={`text-3xl font-bold ${score>=80?'text-green-700':score>=60?'text-amber-700':'text-red-700'}`}>{score}%</p><p className="text-xs text-gray-500 mt-1">Compliance Score</p></div>}
              <div className="mb-4"><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Rate this audit</label><div className="flex gap-2">{[1,2,3,4,5].map((n) => <button key={n} type="button" onClick={() => setAuditRating(n)} className={`flex-1 py-3 rounded-xl text-xl transition-all border-2 ${auditRating>=n?'bg-amber-50 border-amber-300':'bg-gray-50 border-gray-100 hover:border-amber-200'}`}>⭐</button>)}</div>{auditRating>0&&<p className="text-xs text-center text-amber-600 font-medium mt-1">{['','Poor','Fair','Good','Very Good','Excellent'][auditRating]}</p>}</div>
              <div className="mb-4"><label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Final comments (optional)</label><textarea value={closeFeedback} onChange={(e) => setCloseFeedback(e.target.value)} rows={3} placeholder="Observations, recommendations…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]" /></div>
              <div className="flex gap-2"><button type="button" onClick={() => { setShowClose(false); setAuditRating(0); setCloseFeedback(''); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button><button type="button" onClick={handleCloseAudit} disabled={saving} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{saving?'Closing…':'✅ Close Audit'}</button></div></>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
