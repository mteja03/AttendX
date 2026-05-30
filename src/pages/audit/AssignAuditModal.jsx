import { useState, useMemo, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from './auditHelpers';
import { WhatsAppButton } from '../../utils/whatsapp';

export default function AssignAuditModal({
  auditTypes, company, companyId, employees, auditorEmails = new Set(),
  assignForm, setAssignForm, leadSearch, setLeadSearch, showLeadDrop, setShowLeadDrop,
  teamSearch, setTeamSearch, showTeamDrop, setShowTeamDrop,
  leadRef, teamRef, saving, onClose, onSubmit, assignedAudit, onAssignedDone,
}) {
  const localBranchesFromCompany = useMemo(() => ((company?.branches?.length ?? 0) > 0 ? company.branches : null), [company]);
  const localLocationsFromCompany = useMemo(() => ((company?.locations?.length ?? 0) > 0 ? company.locations : null), [company]);
  const localDeptsFromCompany = useMemo(() => ((company?.departments?.length ?? 0) > 0 ? company.departments : null), [company]);
  const localCategoriesFromCompany = useMemo(() => ((company?.categories?.length ?? 0) > 0 ? company.categories : null), [company]);

  const [orgListsFromFetch, setOrgListsFromFetch] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    getDoc(doc(db, 'companies', companyId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const d = snap.data();
        setOrgListsFromFetch({ branches: d.branches || [], locations: d.locations || [], departments: d.departments || [], categories: d.categories || [] });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [companyId]);

  const localBranches = useMemo(() => { if (orgListsFromFetch?.branches?.length) return orgListsFromFetch.branches; return localBranchesFromCompany || []; }, [localBranchesFromCompany, orgListsFromFetch]);
  const localLocations = useMemo(() => { if (orgListsFromFetch?.locations?.length) return orgListsFromFetch.locations; return localLocationsFromCompany || []; }, [localLocationsFromCompany, orgListsFromFetch]);
  const localDepts = useMemo(() => { if (orgListsFromFetch?.departments?.length) return orgListsFromFetch.departments; return localDeptsFromCompany || []; }, [localDeptsFromCompany, orgListsFromFetch]);
  const localCategories = useMemo(() => { if (localCategoriesFromCompany) return localCategoriesFromCompany; return orgListsFromFetch?.categories ?? []; }, [localCategoriesFromCompany, orgListsFromFetch]);

  const { userRole } = useAuth();
  const isCompanyAdmin = userRole === 'companyadmin' || userRole === 'admin';
  const todayStr = new Date().toISOString().split('T')[0];
  const minStartDate = isCompanyAdmin ? undefined : todayStr;
  const minEndDate = isCompanyAdmin ? undefined : assignForm.startDate || todayStr;

  if (assignedAudit) {
    const isBulk = assignedAudit.isBulk;
    const auditListText = isBulk
      ? (assignedAudit.audits || []).map((a, i) => `${i + 1}. *${a.refId}* — ${a.typeName}`).join('\n')
      : `*${assignedAudit.refId}* — ${assignedAudit.typeName}`;
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <div role="presentation" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 text-center shadow-sm sm:mx-4 sm:max-w-2xl sm:rounded-2xl">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center text-2xl mx-auto mb-3">✅</div>
          <p className="text-base font-semibold text-gray-800 mb-1">Audit Assigned!</p>
          <p className="text-sm text-gray-500 mb-4">
            {isBulk ? `${assignedAudit.audits?.length} audits assigned to ${assignedAudit.auditorName}` : `${assignedAudit.refId} assigned to ${assignedAudit.auditorName}`}
          </p>
          <WhatsAppButton
            phone={assignedAudit.auditorPhone}
            message={
              `Dear ${assignedAudit.auditorName} Garu,\n\n` +
              (isBulk
                ? `${assignedAudit.audits?.length} audits have been assigned to you` + (assignedAudit.branch ? ` at ${assignedAudit.branch}` : '') + `:\n\n${auditListText}\n\n`
                : `A new audit has been assigned to you.\n\n${auditListText}\n`) +
              (assignedAudit.location ? `📍 *Location:* ${assignedAudit.location}\n` : '') +
              (!isBulk && assignedAudit.department ? `🏬 *Department:* ${assignedAudit.department}\n` : '') +
              (assignedAudit.teamMembers?.length > 0 ? `👥 *Team:* ${[assignedAudit.auditorName + ' (Lead)', ...assignedAudit.teamMembers.map((m) => m.fullName)].join(', ')}\n` : '') +
              (assignedAudit.startDate ? `📅 *Start Date:* ${formatDate(assignedAudit.startDate)}\n` : '') +
              `📅 *Due Date:* ${assignedAudit.endDate ? formatDate(assignedAudit.endDate) : '—'}\n\n` +
              `Please log in to AttendX to begin.\n\nThank you,\nAudit Team`
            }
            label="Notify Auditor on WhatsApp"
            size="md"
            className="w-full justify-center"
          />
          <button type="button" onClick={onAssignedDone} className="mt-3 w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div role="presentation" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-sm sm:mx-4 sm:max-w-2xl sm:rounded-2xl">
        <div className="px-6 py-5 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#E8F5F5] rounded-xl flex items-center justify-center text-lg">🔍</div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">Assign Audit</h2>
                <p className="text-xs text-gray-400">Schedule an audit for an auditor</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="min-w-[44px] min-h-[44px] w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Audit Templates</p>
              {assignForm.auditTypeIds.length > 0 && (
                <span className="text-xs font-medium bg-[#E1F5EE] text-[#0F6E56] px-2 py-0.5 rounded-full">{assignForm.auditTypeIds.length} selected</span>
              )}
            </div>
            {auditTypes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-xl">No templates yet — create one in Settings</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {auditTypes.map((t) => {
                  const selected = assignForm.auditTypeIds.includes(t.id);
                  return (
                    <div key={t.id} onClick={() => setAssignForm((p) => { const ids = p.auditTypeIds.includes(t.id) ? p.auditTypeIds.filter((id) => id !== t.id) : [...p.auditTypeIds, t.id]; return { ...p, auditTypeIds: ids }; })}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selected ? 'border-[#1B6B6B] bg-[#E1F5EE]' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}>
                      <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ background: t.color || '#8B5CF6' }}>{t.name?.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${selected ? 'text-[#0F6E56]' : 'text-gray-800'}`}>{t.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${t.auditCategory === 'External' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>{t.auditCategory || 'Internal'}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${t.riskLevel === 'Critical' ? 'bg-red-100 text-red-600' : t.riskLevel === 'High' ? 'bg-orange-100 text-orange-600' : t.riskLevel === 'Medium' ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>{t.riskLevel || 'Medium'}</span>
                          <span className="text-xs text-gray-400">{(t.checklistItems || []).length} items</span>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${selected ? 'bg-[#1B6B6B]' : 'border-2 border-gray-300'}`}>
                        {selected && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5 3.5-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Location</p>
            <div className="space-y-3">
              <select value={assignForm.category} onChange={(e) => setAssignForm((p) => ({ ...p, category: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20">
                <option value="">Select category...</option>
                {localCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={assignForm.location} onChange={(e) => setAssignForm((p) => ({ ...p, location: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20">
                <option value="">Select location...</option>
                {localLocations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={assignForm.branch} onChange={(e) => setAssignForm((p) => ({ ...p, branch: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20">
                  <option value="">Select branch...</option>
                  {localBranches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <select value={assignForm.department} onChange={(e) => setAssignForm((p) => ({ ...p, department: e.target.value }))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20">
                  <option value="">Select dept...</option>
                  {localDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Audit Team</p>
            <div className="space-y-3">
              <div ref={leadRef} className="relative">
                <label className="text-xs text-gray-500 block mb-1.5">Lead Auditor *</label>
                <input type="text"
                  value={assignForm.auditorId ? assignForm.auditorName : leadSearch}
                  placeholder="Type name to search all employees..."
                  onChange={(e) => { setLeadSearch(e.target.value); setShowLeadDrop(true); if (!e.target.value) setAssignForm((p) => ({ ...p, auditorId: '', auditorName: '', auditorEmail: '' })); }}
                  onFocus={() => { setLeadSearch(''); setShowLeadDrop(true); setAssignForm((p) => ({ ...p, auditorId: '', auditorName: '', auditorEmail: '' })); }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20" />
                {showLeadDrop && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto">
                    {employees.filter((e) => e.status === 'Active' && (auditorEmails.size === 0 || auditorEmails.has(e.email?.toLowerCase())) && !assignForm.teamMembers.some((m) => m.id === e.id) && (!leadSearch || e.fullName?.toLowerCase().includes(leadSearch.toLowerCase())))
                      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '')).slice(0, 20)
                      .map((emp) => (
                        <div key={emp.id} onMouseDown={(e) => { e.preventDefault(); setAssignForm((p) => ({ ...p, auditorId: emp.id, auditorName: emp.fullName, auditorEmail: emp.email || '', teamMembers: p.teamMembers.filter((m) => m.id !== emp.id) })); setLeadSearch(''); setShowLeadDrop(false); }}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer border-b border-gray-50 last:border-0">
                          <div className="w-8 h-8 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{emp.fullName?.charAt(0)}</div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{emp.fullName}</p>
                            <p className="text-xs text-gray-400 truncate">{emp.designation || emp.department || '—'}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {assignForm.auditorId && (
                  <div className="mt-2 flex items-center gap-2 p-2.5 bg-[#E8F5F5] rounded-xl">
                    <div className="w-6 h-6 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{assignForm.auditorName?.charAt(0)}</div>
                    <p className="text-xs text-[#1B6B6B] font-medium flex-1">{assignForm.auditorName} — Lead Auditor</p>
                    <button type="button" onClick={() => setAssignForm((p) => ({ ...p, auditorId: '', auditorName: '', auditorEmail: '' }))} className="text-[#1B6B6B]/40 hover:text-[#1B6B6B]">✕</button>
                  </div>
                )}
              </div>

              <div ref={teamRef} className="relative">
                <label className="text-xs text-gray-500 block mb-1.5">Team Members (optional)</label>
                <input type="text" value={teamSearch} placeholder="Add team members..."
                  onChange={(e) => { setTeamSearch(e.target.value); setShowTeamDrop(true); }}
                  onFocus={() => setShowTeamDrop(true)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20" />
                {showTeamDrop && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto">
                    {employees.filter((e) => e.status === 'Active' && e.id !== assignForm.auditorId && !assignForm.teamMembers.some((m) => m.id === e.id) && (!teamSearch || e.fullName?.toLowerCase().includes(teamSearch.toLowerCase())))
                      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '')).slice(0, 20)
                      .map((emp) => (
                        <div key={emp.id} onMouseDown={(e) => { e.preventDefault(); setAssignForm((p) => ({ ...p, teamMembers: [...p.teamMembers, { id: emp.id, fullName: emp.fullName, email: emp.email || '', designation: emp.designation || emp.department || '' }] })); setTeamSearch(''); setShowTeamDrop(false); }}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer border-b border-gray-50 last:border-0">
                          <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{emp.fullName?.charAt(0)}</div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-800 truncate">{emp.fullName}</p>
                            <p className="text-xs text-gray-400 truncate">{emp.designation || emp.department || '—'}</p>
                          </div>
                          <span className="text-xs text-[#1B6B6B]">+ Add</span>
                        </div>
                      ))}
                  </div>
                )}
                {assignForm.teamMembers.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {assignForm.teamMembers.map((m) => (
                      <div key={m.id} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-100 rounded-xl">
                        <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{m.fullName?.charAt(0)}</div>
                        <p className="text-xs font-medium text-gray-700 flex-1 truncate">{m.fullName}</p>
                        <span className="text-xs text-gray-400">Member</span>
                        <button type="button" onClick={() => setAssignForm((p) => ({ ...p, teamMembers: p.teamMembers.filter((x) => x.id !== m.id) }))} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-300 hover:text-red-500">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {(assignForm.auditorId || assignForm.teamMembers.length > 0) && (
                  <div className="mt-2 p-2.5 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500">👥 Team of <strong>{1 + assignForm.teamMembers.length}</strong> — {assignForm.auditorName}{assignForm.teamMembers.length > 0 && ` + ${assignForm.teamMembers.map((m) => m.fullName.split(' ')[0]).join(', ')}`}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Schedule</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Start Date</label>
                <input type="date" value={assignForm.startDate} min={minStartDate}
                  onChange={(e) => { const val = e.target.value; setAssignForm((p) => ({ ...p, startDate: val, endDate: p.endDate && p.endDate < val ? '' : p.endDate })); }}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">End Date *</label>
                <input type="date" value={assignForm.endDate} min={minEndDate}
                  onChange={(e) => setAssignForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Notes for Auditor (optional)</label>
            <textarea value={assignForm.notes} onChange={(e) => setAssignForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Special instructions..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]" />
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50/50 flex-shrink-0">
          {assignForm.auditTypeIds.length > 0 && assignForm.auditorId && (
            <div className="mb-3 p-3 bg-[#E8F5F5] rounded-xl">
              <p className="text-xs text-[#0F6E56] font-medium mb-1">
                {assignForm.auditTypeIds.length === 1 ? `📋 ${auditTypes.find((t) => t.id === assignForm.auditTypeIds[0])?.name}` : `📋 ${assignForm.auditTypeIds.length} audits`} → {assignForm.auditorName}{assignForm.branch && ` · ${assignForm.branch}`}{assignForm.endDate && ` · Ends ${formatDate(assignForm.endDate)}`}
              </p>
              {assignForm.auditTypeIds.length > 1 && (
                <div className="space-y-0.5">
                  {assignForm.auditTypeIds.map((id, i) => { const t = auditTypes.find((x) => x.id === id); return <p key={id} className="text-xs text-[#0F6E56]/70">{i + 1}. {t?.name}</p>; })}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={onSubmit} disabled={saving || assignForm.auditTypeIds.length === 0 || !assignForm.auditorId || !assignForm.endDate}
              className="flex-[2] min-w-0 px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-40">
              {saving ? 'Assigning...' : assignForm.auditTypeIds.length > 1 ? `+ Assign ${assignForm.auditTypeIds.length} Audits` : '+ Assign Audit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
