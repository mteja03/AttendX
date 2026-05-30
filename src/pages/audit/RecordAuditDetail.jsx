import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  effStatus, formatDate, statusMeta,
  getRecordAuditScore, getRecordFillProgress, getRecordStatusCounts, COLUMN_TYPES,
} from './auditHelpers';
import { WhatsAppButton } from '../../utils/whatsapp';

const ROWS_PER_PAGE = 100;

export default function RecordAuditDetail({
  audit, companyId, currentUser, employees,
  onClose, showSuccess, showError, isAuditor, canManage,
}) {
  const safeAudit = audit || {};

  // ── core state ──────────────────────────────────────────────────────────────
  const [recordSections, setRecordSections] = useState(() => safeAudit.recordSections || []);
  const [findings, setFindings] = useState(() => safeAudit.findings || []);
  const [adminNotes, setAdminNotes] = useState(() => safeAudit.adminNotes || '');

  // ── navigation ───────────────────────────────────────────────────────────────
  const [auditorStep, setAuditorStep] = useState('records');   // 'records' | 'findings'
  const [activeTab, setActiveTab] = useState('records');        // 'records' | 'findings' | 'overview'

  // ── records table ────────────────────────────────────────────────────────────
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // ── findings ─────────────────────────────────────────────────────────────────
  const [showAddFinding, setShowAddFinding] = useState(false);
  const [newFinding, setNewFinding] = useState({ description: '', severity: 'Medium', ownerName: '', ownerId: '', ownerEmail: '', targetDate: '' });
  const [ownerSearch, setOwnerSearch] = useState('');
  const [showOwnerDrop, setShowOwnerDrop] = useState(false);
  const ownerRef = useRef(null);

  // ── save / submit state ───────────────────────────────────────────────────────
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [sentBackTo, setSentBackTo] = useState(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeFeedback, setCloseFeedback] = useState('');
  const [auditRating, setAuditRating] = useState(0);
  const [closedAuditData, setClosedAuditData] = useState(null);

  const saveTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);
  const isSavingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    const h = (e) => { if (ownerRef.current && !ownerRef.current.contains(e.target)) setShowOwnerDrop(false); };
    document.addEventListener('mousedown', h);
    return () => { isMountedRef.current = false; document.removeEventListener('mousedown', h); if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- reset page when filters/section change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, activeSectionIdx]);

  // ── derived audit state ───────────────────────────────────────────────────────
  const st = effStatus(safeAudit.status);
  const isClosed = safeAudit.status === 'Closed';
  const isUnderReview = st === 'Under Review';
  const managerCanAct = canManage && isUnderReview;
  const isEditable = isAuditor && !isClosed && (st === 'Assigned' || st === 'In Progress' || st === 'Sent Back');
  const isAuditorMode = isEditable;

  const auditorEmployee = useMemo(
    () => (employees || []).find((e) => (e.email || '').toLowerCase() === (safeAudit.auditorEmail || '').toLowerCase()),
    [employees, safeAudit.auditorEmail],
  );
  const auditorPhone = auditorEmployee?.mobile || auditorEmployee?.phone || auditorEmployee?.mobileNumber || '';

  // ── records computed ──────────────────────────────────────────────────────────
  const activeSection = recordSections[activeSectionIdx] || recordSections[0] || null;
  const allColumns = useMemo(() => activeSection?.columns || [], [activeSection]);
  const prefilledCols = useMemo(() => allColumns.filter((c) => c.type?.startsWith('prefilled')), [allColumns]);
  const auditorCols = useMemo(() => allColumns.filter((c) => c.type === COLUMN_TYPES.AUDITOR_DROPDOWN || c.type === COLUMN_TYPES.AUDITOR_TEXT), [allColumns]);
  const primaryCol = useMemo(() => auditorCols.find((c) => c.isPrimary) || auditorCols[0] || null, [auditorCols]);

  const fillProgress = useMemo(() => getRecordFillProgress({ recordSections }), [recordSections]);
  const score = useMemo(() => getRecordAuditScore({ recordSections }), [recordSections]);
  const statusCounts = useMemo(() => getRecordStatusCounts({ recordSections }), [recordSections]);
  const unfilledCount = statusCounts.__unfilled || 0;

  const filteredRows = useMemo(() => {
    const rows = activeSection?.records || [];
    return rows.filter((row) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match = prefilledCols.some((col) => String(row.data?.[col.id] || '').toLowerCase().includes(q)) ||
          auditorCols.some((col) => String(row.data?.[col.id] || '').toLowerCase().includes(q));
        if (!match) return false;
      }
      if (statusFilter !== 'all' && primaryCol) {
        const val = row.data?.[primaryCol.id] || '';
        if (statusFilter === '__unfilled') return !val;
        return val === statusFilter;
      }
      return true;
    });
  }, [activeSection, searchQuery, statusFilter, prefilledCols, auditorCols, primaryCol]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = filteredRows.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);

  // ── findings computed ─────────────────────────────────────────────────────────
  const findingsData = useMemo(() => (Array.isArray(findings) ? findings : []), [findings]);
  const openFindings = findingsData.filter((f) => f.status !== 'Resolved');
  const resolvedFindings = findingsData.filter((f) => f.status === 'Resolved');
  const canAddFinding = (isAuditor && isEditable) || (canManage && !isClosed);
  const canManageFindings = canManage && isUnderReview;

  // ── auto-save ─────────────────────────────────────────────────────────────────
  const autoSave = useCallback(
    (updatedSections, updatedFindings, updatedNotes) => {
      if (isClosed) return;
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current || isSavingRef.current) return;
        try {
          isSavingRef.current = true;
          setAutoSaving(true);
          const newStatus = effStatus(safeAudit.status) === 'Assigned' ? 'In Progress' : safeAudit.status;
          await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
            recordSections: updatedSections,
            findings: updatedFindings,
            adminNotes: updatedNotes,
            status: newStatus,
            updatedAt: new Date(),
            updatedBy: currentUser?.email || '',
          });
          if (!isMountedRef.current) return;
          setLastSaved(new Date());
        } catch (e) {
          if (import.meta.env.DEV) console.error('Auto-save failed:', e);
        } finally {
          isSavingRef.current = false;
          if (isMountedRef.current) setAutoSaving(false);
        }
      }, 1500);
    },
    [audit.id, companyId, currentUser, isClosed, safeAudit.status],
  );

  // ── records handlers ──────────────────────────────────────────────────────────
  const updateRowCell = useCallback(
    (rowId, colId, value) => {
      if (!isEditable) return;
      setRecordSections((prev) => {
        const updated = prev.map((sec, idx) =>
          idx !== activeSectionIdx ? sec : {
            ...sec,
            records: (sec.records || []).map((row) =>
              row.id === rowId ? { ...row, data: { ...row.data, [colId]: value } } : row,
            ),
          },
        );
        autoSave(updated, findingsData, adminNotes);
        return updated;
      });
    },
    [activeSectionIdx, autoSave, findingsData, adminNotes, isEditable],
  );

  // ── findings handlers ─────────────────────────────────────────────────────────
  const addFinding = () => {
    if (!newFinding.description.trim()) { showError('Enter finding description'); return; }
    const addedByRole = isAuditorMode ? 'auditor' : 'auditmanager';
    const finding = {
      id: 'finding_' + Date.now(),
      description: newFinding.description.trim(),
      severity: newFinding.severity,
      ownerName: newFinding.ownerName,
      ownerId: newFinding.ownerId,
      ownerEmail: newFinding.ownerEmail || '',
      targetDate: newFinding.targetDate,
      status: 'Open',
      resolvedAt: null,
      addedBy: (currentUser?.email || '').toLowerCase(),
      addedByRole,
      addedByName: currentUser?.displayName || currentUser?.email || (addedByRole === 'auditor' ? 'Auditor' : 'Audit Manager'),
      createdAt: new Date().toISOString(),
    };
    const updated = [...findingsData, finding];
    setFindings(updated);
    autoSave(recordSections, updated, adminNotes);
    setNewFinding({ description: '', severity: 'Medium', ownerName: '', ownerId: '', ownerEmail: '', targetDate: '' });
    setOwnerSearch('');
    setShowAddFinding(false);
  };

  const updateFindingStatus = useCallback(
    (id, newStatus) => {
      setFindings((prev) => {
        const updated = prev.map((f) => f.id === id ? { ...f, status: newStatus, ...(newStatus === 'Resolved' && { resolvedAt: new Date().toISOString() }) } : f);
        autoSave(recordSections, updated, adminNotes);
        return updated;
      });
    },
    [autoSave, recordSections, adminNotes],
  );

  const deleteFinding = (id) => {
    const finding = findingsData.find((f) => f.id === id);
    if (!finding || isClosed) return;
    const role = finding.addedByRole || 'auditor';
    const canDel = isAuditorMode
      ? role === 'auditor' && (finding.addedBy || '').toLowerCase() === (currentUser?.email || '').toLowerCase()
      : canManage && role === 'auditmanager';
    if (!canDel) return;
    const updated = findingsData.filter((f) => f.id !== id);
    setFindings(updated);
    autoSave(recordSections, updated, adminNotes);
  };

  // ── submit / workflow handlers ────────────────────────────────────────────────
  const handleDetailClose = useCallback(() => onClose(), [onClose]);

  const handleSubmit = async () => {
    if (submitting) return;
    for (const sec of recordSections) {
      const pCol = (sec.columns || []).find((c) => c.isPrimary && c.type === COLUMN_TYPES.AUDITOR_DROPDOWN);
      if (!pCol) continue;
      const unfilled = (sec.records || []).filter((r) => !r.data?.[pCol.id]);
      if (unfilled.length > 0) {
        showError(`Fill all ${unfilled.length} row${unfilled.length !== 1 ? 's' : ''} in "${sec.name}" before submitting`);
        return;
      }
    }
    try {
      setSubmitting(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        recordSections, findings: findingsData, adminNotes,
        status: 'Submitted',
        submittedAt: new Date(),
        submittedBy: currentUser?.email || '',
        updatedAt: new Date(),
        updatedBy: currentUser?.email || '',
      });
      showSuccess('Submitted!');
      setShowSubmitConfirm(false);
      handleDetailClose();
    } catch (e) { showError('Submit failed: ' + e.message); } finally { setSubmitting(false); }
  };

  const handleMarkUnderReview = async () => {
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), { status: 'Under Review', reviewStartedAt: new Date(), reviewStartedBy: currentUser?.email || '', updatedAt: new Date() });
      showSuccess('Audit under review');
      handleDetailClose();
    } catch { showError('Failed to update status'); } finally { setSaving(false); }
  };

  const handleCloseAudit = async () => {
    if (openFindings.length > 0) { showError(`Resolve all ${openFindings.length} finding${openFindings.length !== 1 ? 's' : ''} first`); return; }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), { status: 'Closed', closedAt: new Date(), closedBy: currentUser?.email || '', managerNotes: adminNotes, auditRating, closeFeedback: closeFeedback.trim(), updatedAt: new Date() });
      showSuccess('Audit closed!');
      setClosedAuditData({ phone: auditorPhone, name: audit.auditorName, refId: audit.auditRefId, typeName: audit.auditTypeName, branch: audit.branch, rating: auditRating });
    } catch { showError('Failed to close audit'); } finally { setSaving(false); }
  };

  const handleSendBack = async () => {
    if (!sendBackReason.trim()) { showError('Add a reason for sending back'); return; }
    try {
      setSaving(true);
      const reason = sendBackReason.trim();
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), { status: 'Sent Back', sentBackAt: new Date(), sentBackBy: currentUser?.email || '', sentBackReason: reason, updatedAt: new Date() });
      showSuccess('Audit sent back to auditor');
      setSentBackTo({ phone: auditorPhone, name: audit.auditorName, reason, refId: audit.auditRefId });
      setSendBackReason('');
    } catch { showError('Failed to send back'); } finally { setSaving(false); }
  };

  const getOptionColor = (col, value) => (!value || !col.options) ? null : (col.options.find((o) => o.label === value)?.color || null);
  const colMinWidth = (col) => {
    if (col.type === COLUMN_TYPES.AUDITOR_TEXT) return 160;
    if (col.type === COLUMN_TYPES.AUDITOR_DROPDOWN) return 150;
    if (col.type === COLUMN_TYPES.PREFILLED_NUMBER) return 80;
    if (col.type === COLUMN_TYPES.PREFILLED_DATE) return 100;
    return 120;
  };

  // ── tabs for non-auditor-mode ─────────────────────────────────────────────────
  const MANAGER_TABS = [{ id: 'records', label: '1. Records' }, { id: 'findings', label: '2. Findings', count: findings.length }, { id: 'overview', label: '3. Overview & Close' }];
  const VIEW_TABS = [{ id: 'records', label: 'Records' }, { id: 'findings', label: 'Findings', count: findings.length }, { id: 'overview', label: 'Overview' }];

  const showRecords = isAuditorMode ? auditorStep === 'records' : activeTab === 'records';
  const showFindings = isAuditorMode ? auditorStep === 'findings' : activeTab === 'findings';
  const showOverview = !isAuditorMode && activeTab === 'overview';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div role="presentation" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleDetailClose} />
      <div className="relative flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-sm sm:mx-4 sm:max-h-[90vh] sm:max-w-4xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Auditor step indicator */}
        {isAuditorMode && (
          <div className="flex items-center gap-0 px-4 py-3 flex-shrink-0">
            {[{ id: 'records', label: 'Records', num: 1 }, { id: 'findings', label: 'Findings', num: 2 }].map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${auditorStep === step.id || (step.id === 'records' && auditorStep === 'findings') ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-400'}`}>{step.num}</div>
                  <span className={`text-xs font-medium hidden sm:inline ${auditorStep === step.id ? 'text-[#1B6B6B]' : 'text-gray-400'}`}>{step.label}</span>
                </div>
                {idx === 0 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
              </div>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="rounded-xl bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold text-gray-400">{audit.auditRefId}</span>
                <span className="text-sm font-semibold text-gray-800 truncate">{audit.auditTypeName}</span>
                <span className="text-xs bg-[#E8F5F5] text-[#0F6E56] px-2 py-0.5 rounded-full font-medium flex-shrink-0">Records</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusMeta(audit.status).badge}`}>{statusMeta(audit.status).icon} {st}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                {audit.branch && <span>🏢 {audit.branch}</span>}
                {audit.location && <span>📍 {audit.location}</span>}
                {audit.auditorName && <span>👤 {audit.auditorName}</span>}
                {audit.endDate && <span>📅 Due {formatDate(audit.endDate)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {score !== null && (
                <div className="text-right">
                  <p className={`text-lg font-bold leading-none ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{score}%</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">score</p>
                </div>
              )}
              {autoSaving && <span className="text-xs text-gray-400">saving…</span>}
              {!autoSaving && lastSaved && !isClosed && <span className="text-xs text-gray-400">✓ saved</span>}
              <button type="button" onClick={handleDetailClose} className="min-w-[44px] min-h-[44px] w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>
          </div>

          {st === 'Sent Back' && audit.sentBackReason && (
            <div className="mb-2 p-2.5 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs font-semibold text-red-700 mb-0.5">↩ Sent back for corrections</p>
              <p className="text-xs text-red-600">{audit.sentBackReason}</p>
            </div>
          )}

          {/* Fill progress */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{fillProgress.filled} / {fillProgress.total} records filled</span>
              <span className="text-xs text-gray-400">{fillProgress.total > 0 ? Math.round((fillProgress.filled / fillProgress.total) * 100) : 0}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-[#1B6B6B] rounded-full transition-all" style={{ width: fillProgress.total > 0 ? `${(fillProgress.filled / fillProgress.total) * 100}%` : '0%' }} />
            </div>
            {primaryCol && (
              <div className="flex gap-1.5 flex-wrap">
                {(primaryCol.options || []).map((opt) => { const count = statusCounts[opt.label] || 0; if (!count) return null; return (<span key={opt.label} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: (opt.color || '#888780') + '22', color: opt.color || '#888780' }}>{count} {opt.label}</span>); })}
                {unfilledCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">{unfilledCount} unfilled</span>}
              </div>
            )}
          </div>

          {/* Manager tabs */}
          {!isAuditorMode && (
            <div className="flex gap-1 mt-3 overflow-x-auto scrollbar-none flex-nowrap pb-1">
              {(managerCanAct ? MANAGER_TABS : VIEW_TABS).map((tab) => (
                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors flex-shrink-0 ${activeTab === tab.id ? 'bg-[#E8F5F5] text-[#1B6B6B]' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {tab.label}
                  {tab.count !== undefined && <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-500'}`}>{tab.count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── RECORDS TAB ─────────────────────────────────────────────────────── */}
        {showRecords && (
          <>
            {/* Section tabs */}
            {recordSections.length > 1 && (
              <div className="flex gap-1 overflow-x-auto scrollbar-none px-4 py-2 border-b border-gray-100 flex-shrink-0">
                {recordSections.map((sec, idx) => {
                  const sPrimary = (sec.columns || []).find((c) => c.isPrimary && c.type === COLUMN_TYPES.AUDITOR_DROPDOWN);
                  const sFilled = sPrimary ? (sec.records || []).filter((r) => r.data?.[sPrimary.id]).length : 0;
                  return (
                    <button key={sec.id} type="button" onClick={() => { setActiveSectionIdx(idx); setCurrentPage(1); setSearchQuery(''); setStatusFilter('all'); }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap flex-shrink-0 transition-colors ${activeSectionIdx === idx ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {sec.name} · {sFilled}/{(sec.records || []).length}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Filter bar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 flex-shrink-0 flex-wrap">
              <div className="relative flex-1 min-w-[140px]">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none">🔍</span>
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search records…" className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-7 pr-8 text-xs focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20" />
                {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 text-xs">✕</button>}
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-gray-200 rounded-xl px-2.5 bg-white focus:outline-none focus:border-[#1B6B6B] flex-shrink-0 min-h-[36px]">
                <option value="all">All rows</option>
                <option value="__unfilled">Unfilled only</option>
                {primaryCol && (primaryCol.options || []).map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
              </select>
              <span className="text-xs text-gray-400 flex-shrink-0">{filteredRows.length} of {(activeSection?.records || []).length}</span>
            </div>
            {/* Table */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <div className="flex-1 overflow-auto">
                {!activeSection ? (
                  <div className="flex items-center justify-center py-16 text-sm text-gray-400">No record sections in this audit</div>
                ) : (
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 48 + prefilledCols.reduce((n, c) => n + colMinWidth(c) + 20, 0) + auditorCols.reduce((n, c) => n + colMinWidth(c) + 20, 0), fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0, zIndex: 2 }}>
                        <th style={{ width: 44, minWidth: 44, padding: '8px 10px', textAlign: 'center', fontSize: 10, fontWeight: 500, color: '#6B7280', borderBottom: '0.5px solid #E5E7EB', position: 'sticky', left: 0, background: '#F9FAFB', zIndex: 3 }}>#</th>
                        {prefilledCols.map((col) => (<th key={col.id} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: '#6B7280', borderBottom: '0.5px solid #E5E7EB', whiteSpace: 'nowrap', minWidth: colMinWidth(col) }}>{col.label}</th>))}
                        {auditorCols.map((col) => (<th key={col.id} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 500, color: '#0F6E56', background: '#E8F5F5', borderBottom: '0.5px solid #9FE1CB', whiteSpace: 'nowrap', minWidth: colMinWidth(col) }}>{col.label}{col.isPrimary ? ' ★' : ''}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRows.length === 0 ? (
                        <tr><td colSpan={1 + prefilledCols.length + auditorCols.length} style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>No records match the filter</td></tr>
                      ) : paginatedRows.map((row, rowIdx) => {
                        const rowNum = (safePage - 1) * ROWS_PER_PAGE + rowIdx + 1;
                        const primaryVal = primaryCol ? (row.data?.[primaryCol.id] || '') : '';
                        const primaryColor = primaryVal ? getOptionColor(primaryCol, primaryVal) : null;
                        const rowBg = primaryColor ? primaryColor + '10' : 'transparent';
                        return (
                          <tr key={row.id} style={{ borderBottom: '0.5px solid #F3F4F6', background: rowBg }}>
                            <td style={{ padding: '6px 10px', color: '#9CA3AF', fontSize: 11, position: 'sticky', left: 0, background: primaryColor ? primaryColor + '10' : '#F9FAFB', zIndex: 1, textAlign: 'center', minWidth: 44 }}>{rowNum}</td>
                            {prefilledCols.map((col) => (<td key={col.id} style={{ padding: '6px 10px', color: '#6B7280', background: '#F9FAFB', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.data?.[col.id] || '—'}</td>))}
                            {auditorCols.map((col) => {
                              const val = row.data?.[col.id] || '';
                              const optColor = col.type === COLUMN_TYPES.AUDITOR_DROPDOWN ? getOptionColor(col, val) : null;
                              if (col.type === COLUMN_TYPES.AUDITOR_DROPDOWN) {
                                return (
                                  <td key={col.id} style={{ padding: '4px 8px', background: '#fff' }}>
                                    {isEditable ? (
                                      <select value={val} onChange={(e) => updateRowCell(row.id, col.id, e.target.value)} style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 8, border: val ? `1.5px solid ${optColor || '#D3D1C7'}` : '0.5px solid #E5E7EB', background: val && optColor ? optColor + '15' : '#fff', color: '#111827', minHeight: 44, cursor: 'pointer', appearance: 'auto' }}>
                                        <option value="">— Select —</option>
                                        {(col.options || []).map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
                                      </select>
                                    ) : val ? (
                                      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 500, background: optColor ? optColor + '20' : '#F1EFE8', color: optColor || '#5F5E5A', display: 'inline-block', whiteSpace: 'nowrap' }}>{val}</span>
                                    ) : <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>}
                                  </td>
                                );
                              }
                              if (col.type === COLUMN_TYPES.AUDITOR_TEXT) {
                                return (
                                  <td key={col.id} style={{ padding: '4px 8px', background: '#fff' }}>
                                    {isEditable ? (
                                      <input value={val} onChange={(e) => updateRowCell(row.id, col.id, e.target.value)} placeholder="Note…" style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '0.5px solid #E5E7EB', background: '#fff', color: '#111827', minHeight: 44 }} />
                                    ) : <span style={{ fontSize: 11, color: '#6B7280' }}>{val || '—'}</span>}
                                  </td>
                                );
                              }
                              return <td key={col.id} style={{ padding: '6px 10px', color: '#9CA3AF' }}>—</td>;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 flex-shrink-0 flex-wrap gap-2">
                  <span className="text-xs text-gray-400">Page {safePage} of {totalPages} · {filteredRows.length} rows</span>
                  <div className="flex gap-1 flex-wrap">
                    <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 min-h-[36px]">← Prev</button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => { const page = totalPages <= 7 ? i + 1 : safePage <= 4 ? i + 1 : safePage >= totalPages - 3 ? totalPages - 6 + i : safePage - 3 + i; return (<button key={page} type="button" onClick={() => setCurrentPage(page)} className={`px-2.5 py-1.5 text-xs border rounded-lg min-w-[36px] min-h-[36px] ${page === safePage ? 'bg-[#1B6B6B] text-white border-[#1B6B6B]' : 'border-gray-200 hover:bg-gray-50'}`}>{page}</button>); })}
                    <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 min-h-[36px]">Next →</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── FINDINGS TAB ────────────────────────────────────────────────────── */}
        {showFindings && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!isClosed && (isAuditorMode ? canAddFinding : managerCanAct) && (
              <button type="button" onClick={() => setShowAddFinding(true)} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors">+ Add Finding</button>
            )}
            {!isClosed && canManage && !isUnderReview && <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center"><p className="text-xs text-gray-400">Click &quot;Start Review&quot; to add findings and manage this audit</p></div>}

            {showAddFinding && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                <p className="text-sm font-semibold text-gray-700">New Finding</p>
                <textarea value={newFinding.description} onChange={(e) => setNewFinding((p) => ({ ...p, description: e.target.value }))} rows={2} placeholder="Describe the finding…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B] bg-white" />
                <div>
                  <label className="text-xs text-gray-400 block mb-1.5">Severity</label>
                  <div className="flex gap-2 flex-wrap">
                    {[{ v:'Low',c:'bg-green-50 border-green-200 text-green-700',a:'bg-green-500 border-green-500 text-white' },{ v:'Medium',c:'bg-amber-50 border-amber-200 text-amber-700',a:'bg-amber-500 border-amber-500 text-white' },{ v:'High',c:'bg-orange-50 border-orange-200 text-orange-700',a:'bg-orange-500 border-orange-500 text-white' },{ v:'Critical',c:'bg-red-50 border-red-200 text-red-700',a:'bg-red-500 border-red-500 text-white' }].map((opt) => (
                      <button key={opt.v} type="button" onClick={() => setNewFinding((p) => ({ ...p, severity: opt.v }))} className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${newFinding.severity === opt.v ? opt.a : `${opt.c} hover:opacity-80`}`}>{opt.v}</button>
                    ))}
                  </div>
                </div>
                <div ref={ownerRef} className="relative">
                  <label className="text-xs text-gray-400 block mb-1">Assign Owner to Fix</label>
                  <input type="text" value={newFinding.ownerName || ownerSearch} placeholder="Search employee…" onChange={(e) => { setOwnerSearch(e.target.value); setShowOwnerDrop(true); if (!e.target.value) setNewFinding((p) => ({ ...p, ownerName: '', ownerId: '', ownerEmail: '' })); }} onFocus={() => { setOwnerSearch(''); setShowOwnerDrop(true); setNewFinding((p) => ({ ...p, ownerName: '', ownerId: '', ownerEmail: '' })); }} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] bg-white" />
                  {showOwnerDrop && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-40 overflow-y-auto">
                      {(employees || []).filter((e) => e.status === 'Active' && (!ownerSearch || e.fullName?.toLowerCase().includes(ownerSearch.toLowerCase()))).slice(0, 6).map((emp) => (
                        <div key={emp.id} onMouseDown={(e) => { e.preventDefault(); setNewFinding((p) => ({ ...p, ownerName: emp.fullName, ownerId: emp.id, ownerEmail: emp.email || '' })); setOwnerSearch(''); setShowOwnerDrop(false); }} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                          <div className="w-6 h-6 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold">{emp.fullName?.charAt(0)}</div>
                          <div><p className="text-xs font-medium text-gray-800">{emp.fullName}</p>{emp.designation && <p className="text-xs text-gray-400">{emp.designation}</p>}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {newFinding.ownerName && <p className="text-xs text-green-600 mt-1">✓ {newFinding.ownerName}</p>}
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Target Fix Date</label>
                  <input type="date" value={newFinding.targetDate} onChange={(e) => setNewFinding((p) => ({ ...p, targetDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] bg-white" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowAddFinding(false); setNewFinding({ description: '', severity: 'Medium', ownerName: '', ownerId: '', ownerEmail: '', targetDate: '' }); setOwnerSearch(''); }} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
                  <button type="button" onClick={addFinding} className="flex-1 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]">Add Finding</button>
                </div>
              </div>
            )}

            {findingsData.length === 0 && !showAddFinding ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl"><p className="text-3xl mb-2">✅</p><p className="text-sm font-medium text-gray-600">No findings</p><p className="text-xs text-gray-400 mt-1">Add findings from the audit records</p></div>
            ) : (
              /* eslint-disable react-hooks/refs */
              findingsData.map((finding) => {
              const now = new Date();
              const isOverdueFinding = finding.targetDate && finding.status !== 'Resolved' && new Date(finding.targetDate) < now;
              return (
                <div key={finding.id} className={`border rounded-xl p-4 transition-all ${finding.status === 'Resolved' ? 'bg-green-50 border-green-100' : isOverdueFinding ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`} style={{ borderLeftWidth: '3px', borderLeftColor: finding.severity === 'Critical' ? '#E24B4A' : finding.severity === 'High' ? '#EF9F27' : finding.severity === 'Medium' ? '#378ADD' : '#639922' }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-gray-800 flex-1">{finding.description}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${finding.severity === 'Critical' ? 'bg-red-100 text-red-700' : finding.severity === 'High' ? 'bg-orange-100 text-orange-700' : finding.severity === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{finding.severity}</span>
                      {!isClosed && (() => { const role = finding.addedByRole || 'auditor'; const canDel = isAuditorMode ? (role === 'auditor' && (finding.addedBy || '').toLowerCase() === (currentUser?.email || '').toLowerCase()) : (canManage && role === 'auditmanager'); if (!canDel) return null; return <button type="button" onClick={() => deleteFinding(finding.id)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-300 hover:text-red-500">✕</button>; })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${finding.addedByRole === 'auditor' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'}`}>{finding.addedByRole === 'auditor' ? '👷 Auditor' : '🧑‍💼 Manager'}</span>
                    {finding.ownerName && <span className="text-xs text-gray-500">👤 {finding.ownerName}</span>}
                    {finding.targetDate && <span className={`text-xs font-medium ${isOverdueFinding ? 'text-red-600' : 'text-gray-500'}`}>{isOverdueFinding ? '⚠️ ' : '📅 '}{formatDate(finding.targetDate)}</span>}
                  </div>
                  {!isClosed && canManageFindings && (
                    <div className="flex gap-2 flex-wrap">
                      {['Open', 'In Progress', 'Resolved'].map((s) => (
                        <button key={s} type="button" onClick={() => updateFindingStatus(finding.id, s)} className={`rounded-xl border px-3 py-1 text-xs font-medium transition-all ${finding.status === s ? (s === 'Resolved' ? 'bg-green-500 text-white border-green-500' : s === 'In Progress' ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-700 text-white border-gray-700') : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                          {s === 'Resolved' ? '✅ Resolved' : s === 'In Progress' ? '🔄 In Progress' : '⭕ Open'}
                        </button>
                      ))}
                    </div>
                  )}
                  {isClosed && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${finding.status === 'Resolved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{finding.status}</span>}
                </div>
              );
            })
              /* eslint-enable react-hooks/refs */
            )}
          </div>
        )}

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
        {showOverview && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Record stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="border rounded-xl p-3 text-center bg-gray-50 border-gray-100"><p className="text-xl font-bold text-gray-800">{fillProgress.total}</p><p className="text-xs text-gray-400 mt-0.5">Total records</p></div>
              <div className="border rounded-xl p-3 text-center bg-green-50 border-green-100"><p className="text-xl font-bold text-green-700">{fillProgress.filled}</p><p className="text-xs text-green-600 mt-0.5">Filled</p></div>
              {score !== null ? (
                <div className={`border rounded-xl p-3 text-center ${score >= 80 ? 'bg-green-50 border-green-100' : score >= 60 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}><p className={`text-xl font-bold ${score >= 80 ? 'text-green-700' : score >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{score}%</p><p className={`text-xs mt-0.5 ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>Score</p></div>
              ) : (
                <div className="border rounded-xl p-3 text-center bg-gray-50 border-gray-100"><p className="text-xl font-bold text-gray-300">—</p><p className="text-xs text-gray-400 mt-0.5">Score</p></div>
              )}
            </div>

            {/* Audit details */}
            <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Audit Details</p>
              {[{ l:'Reference', v:audit.auditRefId },{ l:'Template', v:audit.auditTypeName },{ l:'Category', v:audit.auditCategory },{ l:'Risk Level', v:audit.riskLevel },{ l:'Branch', v:audit.branch },{ l:'Location', v:audit.location },{ l:'Lead Auditor', v:audit.auditorName },{ l:'End Date', v:audit.endDate ? formatDate(audit.endDate) : '' }].filter((r) => r.v).map((row) => (
                <div key={row.l} className="flex items-center justify-between gap-2"><p className="text-xs text-gray-400">{row.l}</p><p className="text-xs font-medium text-gray-700 text-right">{row.v}</p></div>
              ))}
            </div>

            {/* Findings summary */}
            {findingsData.length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Findings Summary</p>
                <div className="grid grid-cols-3 gap-2">
                  {[{ l:'Total', v:findingsData.length, c:'text-gray-700' },{ l:'Open', v:openFindings.length, c:openFindings.length > 0 ? 'text-red-600' : 'text-gray-700' },{ l:'Resolved', v:resolvedFindings.length, c:'text-green-600' }].map((s) => (
                    <div key={s.l} className="text-center bg-gray-50 rounded-xl p-3"><p className={`text-xl font-bold ${s.c}`}>{s.v}</p><p className="text-xs text-gray-400 mt-0.5">{s.l}</p></div>
                  ))}
                </div>
              </div>
            )}

            {/* Closed feedback */}
            {audit.status === 'Closed' && audit.auditRating > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Manager Feedback</p>
                <div className="flex items-center gap-2 mb-2">{[1,2,3,4,5].map((n) => <span key={n} className={`text-xl ${n <= audit.auditRating ? 'text-amber-400' : 'text-gray-200'}`}>⭐</span>)}<span className="text-sm font-semibold text-gray-700">{['','Poor','Fair','Good','Very Good','Excellent'][audit.auditRating]}</span></div>
                {audit.closeFeedback && <p className="text-sm text-gray-600 italic bg-gray-50 rounded-xl px-3 py-2.5">&quot;{audit.closeFeedback}&quot;</p>}
              </div>
            )}

            {/* Manager notes */}
            {canManage && (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Manager notes</label>
                <textarea value={adminNotes} disabled={isClosed} onChange={(e) => { setAdminNotes(e.target.value); autoSave(recordSections, findingsData, e.target.value); }} rows={3} placeholder="Internal notes about this audit…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B] disabled:bg-gray-50" />
              </div>
            )}
          </div>
        )}

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
          {isClosed ? (
            <div className="flex gap-2">
              <div className="flex-1 p-2.5 bg-green-50 border border-green-100 rounded-xl text-center"><p className="text-xs font-medium text-green-700">✅ Audit closed{audit.closedBy && ` by ${audit.closedBy}`}</p></div>
              <button type="button" onClick={handleDetailClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Close</button>
            </div>
          ) : isAuditorMode ? (
            <div className="flex gap-2">
              {auditorStep === 'records' ? (
                <>
                  <button type="button" onClick={handleDetailClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Close</button>
                  <button type="button" onClick={() => setAuditorStep('findings')} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold">Next: Findings →</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setAuditorStep('records')} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">← Back</button>
                  <button type="button" onClick={() => setShowSubmitConfirm(true)} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold">📤 Submit to Manager</button>
                </>
              )}
            </div>
          ) : st === 'Submitted' && canManage ? (
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={handleDetailClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Close</button>
              <button type="button" onClick={() => { setSentBackTo(null); setShowSendBackModal(true); }} className="flex-1 min-w-[100px] py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium">↩ Send Back</button>
              <button type="button" onClick={handleMarkUnderReview} disabled={saving} className="flex-1 min-w-[100px] py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold disabled:opacity-50">👀 Start Review</button>
            </div>
          ) : st === 'Under Review' && canManage ? (
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={handleDetailClose} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Close</button>
              <button type="button" onClick={() => { setSentBackTo(null); setShowSendBackModal(true); }} className="flex-1 min-w-[100px] py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium">↩ Send Back</button>
              {activeTab === 'records' && <button type="button" onClick={() => setActiveTab('findings')} className="flex-1 min-w-[100px] py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold">Findings →</button>}
              {activeTab === 'findings' && <button type="button" onClick={() => setActiveTab('overview')} className="flex-1 min-w-[100px] py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold">Overview →</button>}
              {activeTab === 'overview' && <button type="button" onClick={() => { setClosedAuditData(null); setShowCloseModal(true); }} disabled={openFindings.length > 0} className="flex-1 min-w-[100px] py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">✅ Close Audit</button>}
            </div>
          ) : (
            <button type="button" onClick={handleDetailClose} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Close</button>
          )}
        </div>
      </div>

      {/* Submit confirm */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
          <div role="presentation" className="absolute inset-0 bg-black/50" onClick={() => setShowSubmitConfirm(false)} />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-sm sm:mx-4">
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-[#E8F5F5] rounded-full flex items-center justify-center text-2xl mx-auto mb-3">📤</div>
              <h3 className="text-base font-semibold text-gray-800 mb-1">Submit audit?</h3>
              <p className="text-sm text-gray-500">Once submitted you cannot edit records or findings.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Total records</span><span className="font-medium">{fillProgress.total}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Filled</span><span className="font-medium text-green-600">{fillProgress.filled}</span></div>
              {unfilledCount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Unfilled</span><span className="font-medium text-amber-600">{unfilledCount}</span></div>}
              <div className="flex justify-between text-sm"><span className="text-gray-500">Findings</span><span className="font-medium">{findingsData.filter((f) => f.addedByRole === 'auditor').length}</span></div>
              {score !== null && <div className="flex justify-between text-sm"><span className="text-gray-500">Score</span><span className={`font-bold ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{score}%</span></div>}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowSubmitConfirm(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
              <button type="button" onClick={handleSubmit} disabled={submitting} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold disabled:opacity-50">{submitting ? 'Submitting…' : '📤 Confirm Submit'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Send back modal */}
      {showSendBackModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
          <div role="presentation" className="absolute inset-0 bg-black/50" onClick={() => { setShowSendBackModal(false); setSendBackReason(''); setSentBackTo(null); }} />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-6 shadow-sm sm:mx-4">
            {sentBackTo ? (
              <>
                <h3 className="text-base font-semibold text-gray-800 mb-2 text-center">Sent back</h3>
                <p className="text-sm text-gray-500 mb-4 text-center">Notify the auditor on WhatsApp if you like.</p>
                <WhatsAppButton phone={sentBackTo.phone} message={`Dear ${sentBackTo.name} Garu,\n\nYour audit *${sentBackTo.refId}* has been sent back for corrections.\n\n*Reason:* ${sentBackTo.reason}\n\nPlease log in to AttendX, make the corrections, and resubmit.\n\nThank you,\nAudit Manager`} label="Notify Auditor on WhatsApp" className="w-full justify-center" />
                <button type="button" onClick={() => { setShowSendBackModal(false); setSentBackTo(null); handleDetailClose(); }} className="mt-3 w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Done</button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-800 mb-2">↩ Send Back for Corrections</h3>
                <p className="text-sm text-gray-500 mb-4">The auditor will see this reason and must resubmit.</p>
                <textarea value={sendBackReason} onChange={(e) => setSendBackReason(e.target.value)} rows={3} placeholder="Reason for sending back…" className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-red-400 mb-4" autoFocus />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowSendBackModal(false); setSendBackReason(''); setSentBackTo(null); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
                  <button type="button" onClick={handleSendBack} disabled={!sendBackReason.trim() || saving} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? 'Sending…' : '↩ Send Back'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Close modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
          <div role="presentation" className="absolute inset-0 bg-black/50" onClick={() => { setShowCloseModal(false); setClosedAuditData(null); setAuditRating(0); setCloseFeedback(''); }} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-6 shadow-sm sm:mx-4">
            {closedAuditData ? (
              <>
                <h3 className="text-base font-semibold text-gray-800 mb-2 text-center">Audit closed</h3>
                <p className="text-sm text-gray-500 mb-4 text-center">Notify the lead auditor on WhatsApp.</p>
                <WhatsAppButton phone={closedAuditData.phone} message={`Dear ${closedAuditData.name} Garu,\n\nAudit *${closedAuditData.refId}* — ${closedAuditData.typeName}${closedAuditData.branch ? ` (${closedAuditData.branch})` : ''} has been reviewed and *Closed*.\n\n${closedAuditData.rating ? `Rating: ${'⭐'.repeat(closedAuditData.rating)}\n\n` : ''}Thank you for completing the audit.\n\nRegards,\nAudit Manager`} label="Notify Auditor on WhatsApp" className="w-full justify-center" />
                <button type="button" onClick={() => { setShowCloseModal(false); setClosedAuditData(null); setAuditRating(0); setCloseFeedback(''); handleDetailClose(); }} className="mt-3 w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Done</button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-800 mb-1">✅ Close Audit</h3>
                <p className="text-sm text-gray-500 mb-4">{audit.auditRefId} — {audit.auditTypeName}</p>
                {score !== null && <div className={`p-4 rounded-xl mb-4 text-center ${score >= 80 ? 'bg-green-50 border border-green-100' : score >= 60 ? 'bg-amber-50 border border-amber-100' : 'bg-red-50 border border-red-100'}`}><p className={`text-3xl font-bold ${score >= 80 ? 'text-green-700' : score >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{score}%</p><p className="text-xs text-gray-500 mt-1">Compliance Score</p></div>}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Rate this Audit</label>
                  <div className="flex gap-2">{[1,2,3,4,5].map((n) => (<button key={n} type="button" onClick={() => setAuditRating(n)} className={`flex-1 py-3 rounded-xl text-xl transition-all border-2 ${auditRating >= n ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-100 hover:border-amber-200'}`}>⭐</button>))}</div>
                  {auditRating > 0 && <p className="text-xs text-center text-amber-600 font-medium mt-1">{['','Poor','Fair','Good','Very Good','Excellent'][auditRating]}</p>}
                </div>
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Final Comments (optional)</label>
                  <textarea value={closeFeedback} onChange={(e) => setCloseFeedback(e.target.value)} rows={3} placeholder="Observations, recommendations…" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowCloseModal(false); setClosedAuditData(null); setAuditRating(0); setCloseFeedback(''); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">Cancel</button>
                  <button type="button" onClick={handleCloseAudit} disabled={saving} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{saving ? 'Closing…' : '✅ Close Audit'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
