import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, limit, getDoc, setDoc, increment } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { effStatus, isAuditOverdue, normaliseAuditCategory, TEMPLATE_TYPES } from './auditHelpers';
import EmptyAuditState from './EmptyAuditState';
import AssignAuditModal from './AssignAuditModal';
import AuditTableRow from './AuditTableRow';

const STATUS_TAB_CONFIG = [
  { id: 'all', label: 'All', getCount: (list) => list.length, activeClass: 'bg-[#1B6B6B] text-white border-[#1B6B6B]', countClass: 'bg-white/20 text-white' },
  { id: 'Assigned', label: 'Assigned', getCount: (list) => list.filter((a) => effStatus(a.status) === 'Assigned').length, activeClass: 'bg-gray-50 text-gray-700 border-gray-300', countClass: 'bg-gray-200 text-gray-700' },
  { id: 'In Progress', label: 'In Progress', getCount: (list) => list.filter((a) => effStatus(a.status) === 'In Progress').length, activeClass: 'bg-blue-50 text-blue-700 border-blue-300', countClass: 'bg-blue-200 text-blue-800' },
  { id: 'Sent Back', label: 'Sent Back', getCount: (list) => list.filter((a) => effStatus(a.status) === 'Sent Back').length, activeClass: 'bg-red-50 text-red-700 border-red-300', countClass: 'bg-red-200 text-red-800' },
  { id: 'Submitted', label: 'Submitted', getCount: (list) => list.filter((a) => effStatus(a.status) === 'Submitted').length, activeClass: 'bg-amber-50 text-amber-700 border-amber-300', countClass: 'bg-amber-200 text-amber-800' },
  { id: 'Under Review', label: 'Under Review', getCount: (list) => list.filter((a) => effStatus(a.status) === 'Under Review').length, activeClass: 'bg-purple-50 text-purple-700 border-purple-300', countClass: 'bg-purple-200 text-purple-800' },
  { id: 'Closed', label: 'Closed', getCount: (list) => list.filter((a) => effStatus(a.status) === 'Closed').length, activeClass: 'bg-green-50 text-green-700 border-green-300', countClass: 'bg-green-200 text-green-800' },
  { id: 'overdue', label: '⚠ Overdue', getCount: (list) => list.filter((a) => isAuditOverdue({ ...a, status: effStatus(a.status) })).length, activeClass: 'bg-red-50 text-red-700 border-red-300', countClass: 'bg-red-200 text-red-700' },
];

export default function AuditList({
  audits, auditTypes, company, companyId, currentUser, userRole, employees,
  showSuccess, showError, setSelectedAudit, isAuditor, canManage,
}) {
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignedAudit, setAssignedAudit] = useState(null);
  const [auditorEmails, setAuditorEmails] = useState(new Set());

  useEffect(() => {
    if (!showAssignModal || !companyId) return;
    getDocs(query(collection(db, 'companies', companyId, 'teamMembers'), where('role', 'in', ['auditor', 'auditmanager']), limit(200)))
      .then((snap) => { setAuditorEmails(new Set(snap.docs.map((d) => d.data().email?.toLowerCase()).filter(Boolean))); })
      .catch(() => {});
  }, [showAssignModal, companyId]);

  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeStatusTab, setActiveStatusTab] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ status: '', type: '', branch: '', location: '', riskLevel: '', auditor: '', category: '', dateFrom: '', dateTo: '' });
  const [viewMode, setViewMode] = useState('location');
  const [locationDrill, setLocationDrill] = useState(null);
  const [branchDrill, setBranchDrill] = useState(null);
  const [leadSearch, setLeadSearch] = useState('');
  const [showLeadDrop, setShowLeadDrop] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [showTeamDrop, setShowTeamDrop] = useState(false);
  const leadRef = useRef(null);
  const teamRef = useRef(null);

  const [assignForm, setAssignForm] = useState({ auditTypeIds: [], category: '', location: '', branch: '', department: '', auditorId: '', auditorName: '', auditorEmail: '', teamMembers: [], startDate: '', endDate: '', notes: '', recordData: {} });

  useEffect(() => {
    const handleClick = (e) => {
      if (leadRef.current && !leadRef.current.contains(e.target)) setShowLeadDrop(false);
      if (teamRef.current && !teamRef.current.contains(e.target)) setShowTeamDrop(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset drill-down when filters change
    setLocationDrill(null);
    setBranchDrill(null);
  }, [activeStatusTab, search, filters]);

  const isOverdue = useCallback((audit) => isAuditOverdue({ ...audit, status: effStatus(audit?.status) }), []);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filtered = useMemo(() => {
    return audits.filter((a) => {
      if (activeStatusTab === 'overdue') { if (!isOverdue(a)) return false; }
      else if (activeStatusTab !== 'all') { if (effStatus(a.status) !== activeStatusTab) return false; }
      if (search) {
        const q = search.toLowerCase();
        if (!(a.auditRefId?.toLowerCase().includes(q) || a.auditTypeName?.toLowerCase().includes(q) || a.branch?.toLowerCase().includes(q) || a.auditorName?.toLowerCase().includes(q) || a.location?.toLowerCase().includes(q) || a.category?.toLowerCase().includes(q))) return false;
      }
      if (filters.status && effStatus(a.status) !== filters.status) return false;
      if (filters.type && a.auditTypeId !== filters.type) return false;
      if (filters.branch && a.branch !== filters.branch) return false;
      if (filters.location && a.location !== filters.location) return false;
      if (filters.riskLevel && a.riskLevel !== filters.riskLevel) return false;
      if (filters.auditor && a.auditorName !== filters.auditor) return false;
      if (filters.category && a.auditCategory !== filters.category) return false;
      if (filters.dateFrom && new Date(a.endDate || a.dueDate || '9999-12-31') < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(a.endDate || a.dueDate || '0000-01-01') > new Date(filters.dateTo)) return false;
      return true;
    });
  }, [audits, search, filters, activeStatusTab, isOverdue]);

  const drillStats = (list) => {
    const total = list.length;
    const closed = list.filter((a) => effStatus(a.status) === 'Closed').length;
    const overdueCount = list.filter((a) => isAuditOverdue({ ...a, status: effStatus(a.status) })).length;
    const inProgressCount = list.filter((a) => effStatus(a.status) === 'In Progress').length;
    const submittedCount = list.filter((a) => effStatus(a.status) === 'Submitted' || effStatus(a.status) === 'Under Review').length;
    const barPct = total > 0 ? Math.round((closed / total) * 100) : 0;
    const barColor = overdueCount > 0 ? '#E24B4A' : barPct >= 60 ? '#639922' : '#EF9F27';
    return { total, closed, overdueCount, inProgressCount, submittedCount, barPct, barColor };
  };

  const generateAuditId = async () => {
    const counterRef = doc(db, 'companies', companyId, 'settings', 'auditCounter');
    const snap = await getDoc(counterRef);
    let next = 1;
    if (snap.exists()) { next = (snap.data().count || 0) + 1; await updateDoc(counterRef, { count: increment(1) }); }
    else { await setDoc(counterRef, { count: 1 }); }
    return `AUD-${new Date().getFullYear()}-${String(next).padStart(3, '0')}`;
  };

  const resetAssignForm = () => {
    setAssignForm({ auditTypeIds: [], category: '', location: '', branch: '', department: '', auditorId: '', auditorName: '', auditorEmail: '', teamMembers: [], startDate: '', endDate: '', notes: '', recordData: {} });
    setLeadSearch('');
    setTeamSearch('');
  };

  const handleAssign = async () => {
    if (!assignForm.auditTypeIds || assignForm.auditTypeIds.length === 0) { showError('Select at least one audit template'); return; }
    if (!assignForm.auditorId) { showError('Select a lead auditor'); return; }
    if (!assignForm.endDate) { showError('Set an end date'); return; }
    for (const typeId of assignForm.auditTypeIds) {
      const t = auditTypes.find((x) => x.id === typeId);
      if (t?.templateType === TEMPLATE_TYPES.RECORD) {
        const hasRecords = (t.recordSections || []).some((sec) => (assignForm.recordData?.[typeId]?.[sec.id] || []).length > 0);
        if (!hasRecords) { showError(`Add at least one record for "${t.name}" before assigning`); return; }
      }
    }
    try {
      setSaving(true);
      const leadEmp = employees.find((e) => e.id === assignForm.auditorId);
      const auditorPhone = leadEmp?.mobile || leadEmp?.phone || leadEmp?.mobileNumber || '';
      const teamMembersNorm = (assignForm.teamMembers || []).filter((m) => { const emp = employees.find((e) => e.id === m.id); return emp && emp.status === 'Active'; }).map((m) => ({ ...m, email: (m.email || '').toLowerCase() }));
      const teamMemberEmails = [...(assignForm.auditorEmail ? [(assignForm.auditorEmail || '').toLowerCase()] : []), ...teamMembersNorm.map((m) => m.email).filter(Boolean)].filter(Boolean);

      const createdAudits = [];
      for (const typeId of assignForm.auditTypeIds) {
        const type = auditTypes.find((t) => t.id === typeId);
        if (!type) continue;
        const refId = await generateAuditId();
        const checklistReview = type?.templateType === TEMPLATE_TYPES.RECORD
          ? []
          : (type?.checklistItems || []).map((item) => ({ ...item, result: null, note: '' }));
        const resolvedCategory = normaliseAuditCategory(type?.auditCategory || assignForm.category);
        const isRecord = type?.templateType === TEMPLATE_TYPES.RECORD;
        const auditRecordSections = isRecord
          ? (type?.recordSections || []).map((sec) => ({ ...sec, records: assignForm.recordData?.[typeId]?.[sec.id] || [] }))
          : [];
        await addDoc(collection(db, 'companies', companyId, 'audits'), {
          auditRefId: refId, auditTypeId: typeId, auditTypeName: type?.name || '', auditTypeColor: type?.color || '#8B5CF6',
          auditCategory: resolvedCategory, riskLevel: type?.riskLevel || 'Medium', category: assignForm.category,
          location: assignForm.location, branch: assignForm.branch, department: assignForm.department,
          auditorId: assignForm.auditorId, auditorName: assignForm.auditorName, auditorEmail: (assignForm.auditorEmail || '').toLowerCase(),
          teamMembers: teamMembersNorm, teamMemberEmails, startDate: assignForm.startDate, endDate: assignForm.endDate, notes: assignForm.notes,
          templateType: type?.templateType || TEMPLATE_TYPES.CHECKLIST,
          status: 'Assigned', checklistReview, findings: [], adminNotes: '', checklistLocked: false,
          recordSections: auditRecordSections,
          createdAt: new Date(), createdBy: currentUser?.email || '',
        });
        createdAudits.push({ refId, typeName: type?.name || '', category: resolvedCategory });
      }

      const isBulk = createdAudits.length > 1;
      showSuccess(isBulk ? `${createdAudits.length} audits assigned to ${assignForm.auditorName}!` : `${createdAudits[0]?.refId} assigned to ${assignForm.auditorName}!`);
      setAssignedAudit({
        refId: isBulk ? null : createdAudits[0]?.refId, audits: createdAudits, isBulk,
        auditorName: assignForm.auditorName, auditorPhone, typeName: isBulk ? `${createdAudits.length} audits` : createdAudits[0]?.typeName,
        category: createdAudits[0]?.category, location: assignForm.location, branch: assignForm.branch,
        department: assignForm.department, teamMembers: assignForm.teamMembers, startDate: assignForm.startDate, endDate: assignForm.endDate,
      });
    } catch (e) { showError('Failed: ' + e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (e, audit) => {
    e.stopPropagation();
    if (userRole !== 'admin') { showError('Only admins can delete audits'); return; }
    if (!window.confirm(`Delete ${audit.auditRefId}?`)) return;
    try { await deleteDoc(doc(db, 'companies', companyId, 'audits', audit.id)); showSuccess('Audit deleted'); }
    catch { showError('Failed to delete'); }
  };

  const emptyAssign = { auditTypeIds: [], category: '', location: '', branch: '', department: '', auditorId: '', auditorName: '', auditorEmail: '', teamMembers: [], startDate: '', endDate: '', notes: '', recordData: {} };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0 sm:min-w-48 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID, template, branch, auditor, category..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20" />
            {search && <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">✕</button>}
          </div>
          <button type="button" onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl text-sm transition-colors ${showFilters || activeFilterCount > 0 ? 'border-[#1B6B6B] text-[#1B6B6B] bg-[#E8F5F5]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            ⚙️ Filters
            {activeFilterCount > 0 && <span className="bg-[#1B6B6B] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{activeFilterCount}</span>}
          </button>
          {canManage && (
            <button type="button" onClick={() => setShowAssignModal(true)} disabled={auditTypes.length === 0}
              className="flex items-center justify-center gap-2 w-11 h-11 sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50 whitespace-nowrap"
              title="Assign Audit">
              <span className="sm:hidden text-lg leading-none">+</span>
              <span className="hidden sm:inline">+ Assign Audit</span>
            </button>
          )}
          <div className="flex border border-gray-200 rounded-xl overflow-hidden flex-shrink-0">
            <button type="button" onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-[#1B6B6B] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              List
            </button>
            <button type="button" onClick={() => { setViewMode('location'); setLocationDrill(null); setBranchDrill(null); }}
              className={`px-3 py-2 text-xs font-medium transition-colors border-l border-gray-200 ${viewMode === 'location' ? 'bg-[#1B6B6B] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              Location
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-700">Filter Audits</p>
              <button type="button" onClick={() => setFilters({ status: '', type: '', branch: '', location: '', riskLevel: '', auditor: '', category: '', dateFrom: '', dateTo: '' })} className="text-xs text-[#1B6B6B] hover:underline">Clear all</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Status', key: 'status', options: ['Assigned','In Progress','Sent Back','Submitted','Under Review','Closed','Overdue'] },
              ].map(({ label, key, options }) => (
                <div key={key}>
                  <label className="text-xs text-gray-400 block mb-1">{label}</label>
                  <select value={filters[key]} onChange={(e) => setFilters((p) => ({ ...p, [key]: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none">
                    <option value="">All {label}s</option>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-400 block mb-1">Template</label>
                <select value={filters.type} onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none">
                  <option value="">All Templates</option>
                  {auditTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Category</label>
                <select value={filters.category} onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none">
                  <option value="">All</option>
                  <option value="Internal">🏢 Internal</option>
                  <option value="External">🌐 External</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Risk Level</label>
                <select value={filters.riskLevel} onChange={(e) => setFilters((p) => ({ ...p, riskLevel: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none">
                  <option value="">All</option>
                  <option value="Critical">🔴 Critical</option>
                  <option value="High">🟠 High</option>
                  <option value="Medium">🟡 Medium</option>
                  <option value="Low">🟢 Low</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Branch</label>
                <select value={filters.branch} onChange={(e) => setFilters((p) => ({ ...p, branch: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none">
                  <option value="">All Branches</option>
                  {(company?.branches || []).map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Location</label>
                <select value={filters.location} onChange={(e) => setFilters((p) => ({ ...p, location: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none">
                  <option value="">All Locations</option>
                  {(company?.locations || []).map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Auditor</label>
                <select value={filters.auditor} onChange={(e) => setFilters((p) => ({ ...p, auditor: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none">
                  <option value="">All Auditors</option>
                  {[...new Set(audits.map((a) => a.auditorName).filter(Boolean))].sort().map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">End Date From</label>
                <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">End Date To</label>
                <input type="date" value={filters.dateTo} onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#1B6B6B] focus:outline-none" />
              </div>
            </div>
            {activeFilterCount > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-[#1B6B6B]">{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active · {filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">{filtered.length} audit{filtered.length !== 1 ? 's' : ''}{(activeFilterCount > 0 || search) && ` of ${audits.length}`}</p>
          {(activeFilterCount > 0 || search) && (
            <button type="button" onClick={() => { setSearch(''); setFilters({ status: '', type: '', branch: '', location: '', riskLevel: '', auditor: '', category: '', dateFrom: '', dateTo: '' }); }} className="text-xs text-[#1B6B6B] hover:underline">Clear all</button>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 gap-1.5 overflow-x-auto overflow-y-visible pb-1 scrollbar-none">
        {STATUS_TAB_CONFIG.map((tab) => {
          const count = tab.getCount(audits);
          const isActive = activeStatusTab === tab.id;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveStatusTab(tab.id)}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all ${isActive ? tab.activeClass : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'}`}>
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold leading-none ${isActive ? tab.countClass : 'bg-gray-100 text-gray-500'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div>
        {viewMode === 'location' ? (
          (() => {
            const locMap = {};
            filtered.forEach((a) => {
              const loc = a.location || '—';
              if (!locMap[loc]) locMap[loc] = [];
              locMap[loc].push(a);
            });
            const locations = Object.entries(locMap).sort((a, b) => a[0].localeCompare(b[0]));

            if (locationDrill) {
              const locAudits = filtered.filter((a) => (a.location || '—') === locationDrill);

              if (branchDrill) {
                const branchAudits = locAudits.filter((a) => (a.branch || '—') === branchDrill);
                return (
                  <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 text-xs">
                      <button type="button" onClick={() => { setLocationDrill(null); setBranchDrill(null); }} className="text-[#1B6B6B] font-medium hover:underline">All locations</button>
                      <span className="text-gray-300">›</span>
                      <button type="button" onClick={() => setBranchDrill(null)} className="text-[#1B6B6B] font-medium hover:underline">{locationDrill}</button>
                      <span className="text-gray-300">›</span>
                      <span className="text-gray-700 font-medium">{branchDrill}</span>
                      <span className="ml-auto text-gray-400">{branchAudits.length} audit{branchAudits.length !== 1 ? 's' : ''}</span>
                    </div>
                    {branchAudits.length === 0 ? (
                      <p className="text-center text-sm text-gray-400 py-10">No audits match current filters</p>
                    ) : (
                      <>
                        <div className="hidden md:grid gap-3 px-5 py-3 bg-gray-50/80 border-b border-gray-100" style={{ gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 140px 80px 88px' }}>
                          {['Audit', 'Location', 'Auditor', 'Dates', 'Status', 'Score', ''].map((h, i) => (
                            <div key={i} className="text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">{h}</div>
                          ))}
                        </div>
                        <div className="divide-y divide-gray-50">
                          {branchAudits.map((audit) => (
                            <AuditTableRow key={audit.id} audit={audit} companyId={companyId} userRole={userRole} currentUser={currentUser} employees={employees}
                              onOpen={() => setSelectedAudit(audit)} onDelete={(e) => handleDelete(e, audit)}
                              showSuccess={showSuccess} showError={showError} canManage={canManage} isAuditor={isAuditor} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              }

              const branchMap = {};
              locAudits.forEach((a) => {
                const br = a.branch || '—';
                if (!branchMap[br]) branchMap[br] = [];
                branchMap[br].push(a);
              });
              const branches = Object.entries(branchMap).sort((a, b) => a[0].localeCompare(b[0]));
              return (
                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 text-xs">
                    <button type="button" onClick={() => { setLocationDrill(null); setBranchDrill(null); }} className="text-[#1B6B6B] font-medium hover:underline">All locations</button>
                    <span className="text-gray-300">›</span>
                    <span className="text-gray-700 font-medium">{locationDrill}</span>
                    <span className="ml-auto text-gray-400">{branches.length} branch{branches.length !== 1 ? 'es' : ''}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {branches.map(([br, brAudits]) => {
                      const st = drillStats(brAudits);
                      return (
                        <div key={br} className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-[#E8F5F5]/40 transition-colors" onClick={() => setBranchDrill(br)}>
                          <div className="w-8 h-8 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5F5E5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{br}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{st.total} audit{st.total !== 1 ? 's' : ''}</p>
                            <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden mt-1.5">
                              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(st.barPct, st.total > 0 ? 4 : 0)}%`, background: st.barColor }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                            {st.overdueCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-600">{st.overdueCount} overdue</span>}
                            {st.inProgressCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">{st.inProgressCount} in progress</span>}
                            {st.closed > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">{st.closed} closed</span>}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D3D1C7" strokeWidth="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            if (locations.length === 0) {
              return <EmptyAuditState total={audits.length} onAssign={() => setShowAssignModal(true)} auditTypesEmpty={auditTypes.length === 0} canManage={canManage} search={search} onClearSearch={() => setSearch('')} />;
            }

            return (
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {locations.map(([loc, locAudits]) => {
                    const st = drillStats(locAudits);
                    const branchCount = new Set(locAudits.map((a) => a.branch).filter(Boolean)).size;
                    return (
                      <div key={loc} className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-[#E8F5F5]/40 transition-colors" onClick={() => setLocationDrill(loc)}>
                        <div className="w-8 h-8 bg-[#E8F5F5] rounded-xl flex items-center justify-center flex-shrink-0">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B6B6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{loc}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {branchCount > 0 ? `${branchCount} branch${branchCount !== 1 ? 'es' : ''} · ` : ''}{st.total} audit{st.total !== 1 ? 's' : ''}
                          </p>
                          <div className="w-20 h-1 bg-gray-100 rounded-full overflow-hidden mt-1.5">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(st.barPct, st.total > 0 ? 4 : 0)}%`, background: st.barColor }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                          {st.overdueCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-600">{st.overdueCount} overdue</span>}
                          {st.submittedCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">{st.submittedCount} submitted</span>}
                          {st.closed > 0 && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">{st.closed} closed</span>}
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D3D1C7" strokeWidth="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        ) : (
          filtered.length === 0 ? (
            <EmptyAuditState total={audits.length} onAssign={() => setShowAssignModal(true)} auditTypesEmpty={auditTypes.length === 0} canManage={canManage} search={search} onClearSearch={() => setSearch('')} />
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="hidden md:grid gap-3 px-5 py-3 bg-gray-50/80 border-b border-gray-100" style={{ gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 140px 80px 88px' }}>
                {['Audit', 'Location', 'Auditor', 'Dates', 'Status', 'Score', ''].map((h, i) => (
                  <div key={i} className="text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">{h}</div>
                ))}
              </div>
              <div className="divide-y divide-gray-50">
                {filtered.map((audit) => (
                  <AuditTableRow key={audit.id} audit={audit} companyId={companyId} userRole={userRole} currentUser={currentUser} employees={employees}
                    onOpen={() => setSelectedAudit(audit)} onDelete={(e) => handleDelete(e, audit)}
                    showSuccess={showSuccess} showError={showError} canManage={canManage} isAuditor={isAuditor} />
                ))}
              </div>
            </div>
          )
        )}
      </div>

      {showAssignModal && (
        <AssignAuditModal
          auditTypes={auditTypes} company={company} companyId={companyId} employees={employees} auditorEmails={auditorEmails}
          assignForm={assignForm} setAssignForm={setAssignForm} leadSearch={leadSearch} setLeadSearch={setLeadSearch}
          showLeadDrop={showLeadDrop} setShowLeadDrop={setShowLeadDrop} teamSearch={teamSearch} setTeamSearch={setTeamSearch}
          showTeamDrop={showTeamDrop} setShowTeamDrop={setShowTeamDrop} leadRef={leadRef} teamRef={teamRef}
          saving={saving} assignedAudit={assignedAudit}
          onAssignedDone={() => { setShowAssignModal(false); setAssignedAudit(null); resetAssignForm(); }}
          onClose={() => { setShowAssignModal(false); setAssignedAudit(null); setAssignForm(emptyAssign); setLeadSearch(''); setTeamSearch(''); }}
          onSubmit={handleAssign}
        />
      )}
    </div>
  );
}
