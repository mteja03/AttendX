import { useState, useEffect } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { AUDIT_STATUSES, effStatus, formatDate, getAuditScore, isAuditOverdue, statusMeta, isRecordType, getRecordFillProgress, getRecordAuditScore } from './auditHelpers';
import { whatsappUrl } from '../../utils/whatsappUrl';

export default function AuditTableRow({
  audit, companyId, userRole, currentUser, employees,
  onOpen, onDelete, showSuccess, showError, canManage, isAuditor,
}) {
  const isAdmin = userRole === 'admin';
  const [status, setStatus] = useState(audit.status);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const overdueAudit = isAuditOverdue({ ...audit, status: effStatus(audit?.status) });
  const openFindings = (audit.findings || []).filter((f) => f.status !== 'Resolved').length;
  const isRecord = isRecordType(audit);
  const score = isRecord ? getRecordAuditScore(audit) : getAuditScore(audit);
  const recordProgress = isRecord ? getRecordFillProgress(audit) : null;

  useEffect(() => {
     
    setStatus(audit.status);
  }, [audit.id, audit.status]);

  const eff = effStatus(status);
  const statusCfg = AUDIT_STATUSES.find((s) => s.key === eff) || AUDIT_STATUSES[0];

  const saveStatus = async (newStatus) => {
    const effCur = effStatus(status);
    if (newStatus === 'Closed' && effCur === 'Submitted') { showError('Start Review first'); return; }
    if (newStatus === 'Closed') {
      const checklist = audit.checklistReview || [];
      if (checklist.length > 0) {
        const unfilled = checklist.filter((i) => !i.result);
        if (unfilled.length > 0) { showError(`Cannot close — ${unfilled.length} checklist item${unfilled.length !== 1 ? 's' : ''} not reviewed`); return; }
      }
      const openF = (audit.findings || []).filter((f) => { const fs = f.status || 'Open'; return fs === 'Open' || fs === 'In Progress'; });
      if (openF.length > 0) { showError(`Cannot close — ${openF.length} finding${openF.length !== 1 ? 's' : ''} still open`); return; }
    }
    try {
      setSaving(true);
      const payload = { status: newStatus, updatedAt: new Date(), ...(newStatus === 'Closed' && !audit.closedAt && { closedAt: new Date() }) };
      if (newStatus === 'Under Review' && effCur === 'Submitted') {
        payload.reviewStartedAt = new Date();
        payload.reviewStartedBy = currentUser?.email || '';
      }
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), payload);
      setStatus(newStatus);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (newStatus === 'Under Review') showSuccess?.('Review started');
    } catch { showError('Failed to save'); setStatus(audit.status); } finally { setSaving(false); }
  };

  const renderWhatsAppLink = () => {
    if (isAuditor) return null;
    const emp = employees?.find((e) => (e.email || '').toLowerCase() === (audit.auditorEmail || '').toLowerCase());
    const phone = emp?.mobile || emp?.phone || emp?.mobileNumber || '';
    if (!phone) return null;
    const stLabel = effStatus(status);
    const messages = {
      Assigned:
        `Dear ${audit.auditorName} Garu,\n\n🔔 *Audit Reminder*\n\n*${audit.auditRefId}*\n📋 *Audit:* ${audit.auditTypeName}\n🏷️ *Category:* ${audit.auditCategory || 'Internal'}\n` +
        (audit.branch ? `🏢 *Branch:* ${audit.branch}\n` : '') + (audit.location ? `📍 *Location:* ${audit.location}\n` : '') +
        (audit.department ? `🏬 *Department:* ${audit.department}\n` : '') +
        ((audit.teamMembers?.length || 0) > 0 ? `👥 *Team:* ${[audit.auditorName + ' (Lead)', ...audit.teamMembers.map((m) => m.fullName)].join(', ')}\n` : '') +
        (audit.startDate ? `📅 *Start:* ${formatDate(audit.startDate)}\n` : '') +
        `📅 *Due:* ${audit.endDate ? formatDate(audit.endDate) : '—'}\n\nThis audit is assigned to you. Please log in to AttendX to begin.\n\nThank you,\nAudit Team`,
      'In Progress':
        `Dear ${audit.auditorName} Garu,\n\n⏳ *Audit In Progress — Reminder*\n\n*${audit.auditRefId}*\n📋 *Audit:* ${audit.auditTypeName}\n🏷️ *Category:* ${audit.auditCategory || 'Internal'}\n` +
        (audit.branch ? `🏢 *Branch:* ${audit.branch}\n` : '') + (audit.location ? `📍 *Location:* ${audit.location}\n` : '') +
        (audit.department ? `🏬 *Department:* ${audit.department}\n` : '') +
        ((audit.teamMembers?.length || 0) > 0 ? `👥 *Team:* ${[audit.auditorName + ' (Lead)', ...audit.teamMembers.map((m) => m.fullName)].join(', ')}\n` : '') +
        (audit.startDate ? `📅 *Start:* ${formatDate(audit.startDate)}\n` : '') +
        `📅 *Due:* ${audit.endDate ? formatDate(audit.endDate) : '—'}\n\nYour audit is in progress. Please complete and submit at the earliest.\n\nThank you,\nAudit Team`,
      'Sent Back':
        `Dear ${audit.auditorName} Garu,\n\n↩ *Audit Sent Back for Corrections*\n\n*${audit.auditRefId}*\n📋 *Audit:* ${audit.auditTypeName}\n` +
        (audit.branch ? `🏢 *Branch:* ${audit.branch}\n` : '') +
        `📅 *Due:* ${audit.endDate ? formatDate(audit.endDate) : '—'}\n\n*Reason:* ${audit.sentBackReason || 'See AttendX for details'}\n\nPlease make the corrections and resubmit.\n\nThank you,\nAudit Team`,
    };
    const msg = messages[stLabel];
    if (!msg) return null;
    const url = whatsappUrl(phone, msg);
    if (!url) return null;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`WhatsApp ${audit.auditorName}`}
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[#25D366] opacity-0 transition-colors hover:bg-[#25D366]/10 group-hover:opacity-100">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    );
  };

  const gridStyle = { gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 140px 80px 88px' };
  const isSentBack = eff === 'Sent Back';

  const statusCell = (
    <div onClick={(e) => e.stopPropagation()} className="min-w-0">
      {isAuditor && (
        <span className={`inline-flex w-full items-center justify-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium ${statusCfg.badge} border-gray-200`}>
          {`${statusCfg.icon} ${eff}`}
        </span>
      )}
      {!isAuditor && canManage && eff === 'Submitted' && (
        <button type="button" disabled={saving} onClick={async (e) => { e.stopPropagation(); await saveStatus('Under Review'); }}
          className="w-full rounded-xl bg-[#1B6B6B] py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#155858] disabled:opacity-50">
          {saving ? '...' : '👀 Start Review'}
        </button>
      )}
      {!isAuditor && canManage && eff === 'Under Review' && (
        <select value={eff} disabled={saving} onChange={(e) => { e.stopPropagation(); saveStatus(e.target.value); }}
          className="w-full cursor-pointer rounded-xl border border-purple-200 bg-purple-50 px-2 py-1.5 text-xs font-medium text-purple-800 focus:border-purple-300 focus:outline-none">
          <option value="Under Review">👀 Under Review</option>
          <option value="Closed">✅ Close Audit</option>
        </select>
      )}
      {!isAuditor && (!canManage || (eff !== 'Submitted' && eff !== 'Under Review')) && (
        <span className={`inline-flex w-full items-center justify-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium ${statusCfg.badge} border-gray-200`}>
          {`${statusCfg.icon} ${eff}`}
        </span>
      )}
      {saved && <p className="text-xs text-green-500 mt-1">✓ Saved</p>}
    </div>
  );

  return (
    <div>
      <div
        className={`relative hidden cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors group md:grid ${overdueAudit ? 'bg-red-50/30 hover:bg-red-50/40' : isSentBack ? 'bg-red-50/30 hover:bg-red-50/40' : 'hover:bg-[#E8F5F5]/30'}`}
        style={gridStyle} onClick={onOpen}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-0.5 h-10 rounded-full flex-shrink-0" style={{ background: overdueAudit ? '#E24B4A' : statusCfg.topBar || audit.auditTypeColor || '#B4B2A9' }} />
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: overdueAudit ? '#EF4444' : audit.auditTypeColor || '#8B5CF6' }}>
            {audit.auditTypeName?.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-xs font-mono text-gray-400">{audit.auditRefId}</span>
                      {isRecord && <span className="text-xs bg-[#E8F5F5] text-[#0F6E56] px-1.5 py-0.5 rounded-full font-medium">Records</span>}
                      {overdueAudit && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">Overdue</span>}
                    </div>
            <p className="text-sm font-semibold text-gray-800 truncate">{audit.auditTypeName}</p>
            {isSentBack && isAuditor && audit.sentBackReason && (
              <p className="mt-1.5 flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                <span>↩</span><span className="line-clamp-1">{audit.sentBackReason}</span>
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {effStatus(audit.status) === 'Closed' && audit.auditRating > 0 && <span className="text-xs text-amber-500 font-medium">{'⭐'.repeat(audit.auditRating)}</span>}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${audit.auditCategory === 'External' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                {audit.auditCategory === 'External' ? '🌐' : '🏢'} {audit.auditCategory || 'Internal'}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${audit.riskLevel === 'Critical' ? 'bg-red-100 text-red-600' : audit.riskLevel === 'High' ? 'bg-orange-100 text-orange-600' : audit.riskLevel === 'Medium' ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                {audit.riskLevel || 'Medium'}
              </span>
              {audit.category && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">🏷️ {audit.category}</span>}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          {audit.branch ? (
            <><p className="text-sm text-gray-700 truncate">{audit.branch}</p><p className="text-xs text-gray-400 truncate mt-0.5">{[audit.location, audit.department].filter(Boolean).join(' · ')}</p></>
          ) : <span className="text-sm text-gray-300">—</span>}
        </div>

        <div className="min-w-0">
          {audit.auditorName ? (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{audit.auditorName.charAt(0)}</div>
                <p className="text-sm text-gray-700 truncate">{audit.auditorName}</p>
              </div>
              {(audit.teamMembers?.length || 0) > 0 && <p className="text-xs text-gray-400 mt-0.5 ml-7">+{audit.teamMembers.length} member{audit.teamMembers.length !== 1 ? 's' : ''}</p>}
            </>
          ) : <span className="text-sm text-gray-300">—</span>}
        </div>

        <div className="min-w-0">
          {audit.startDate && <p className="text-xs text-gray-500">{formatDate(audit.startDate)}</p>}
          {audit.endDate && <p className={`text-xs font-medium ${overdueAudit ? 'text-red-600' : 'text-gray-500'}`}>→ {formatDate(audit.endDate)}</p>}
          {!audit.startDate && !audit.endDate && <p className="text-sm text-gray-300">—</p>}
          {openFindings > 0 && <p className="text-xs text-red-500 font-medium mt-1">{openFindings} finding{openFindings !== 1 ? 's' : ''} open</p>}
        </div>

        {statusCell}

        <div className="text-center">
          {isRecord ? (
            recordProgress && recordProgress.total > 0 ? (
              <>
                <p className="text-xs font-medium text-gray-600">{recordProgress.filled}/{recordProgress.total}</p>
                <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden mx-auto mt-1">
                  <div className="h-full rounded-full bg-[#1B6B6B]" style={{ width: `${Math.round((recordProgress.filled / recordProgress.total) * 100)}%` }} />
                </div>
                {score !== null && (
                  <p className={`text-xs font-bold mt-0.5 ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{score}%</p>
                )}
              </>
            ) : <span className="text-xs text-gray-300">—</span>
          ) : score !== null ? (
            <>
              <p className={`text-sm font-bold ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{score}%</p>
              <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden mx-auto mt-1">
                <div className={`h-full rounded-full ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${score}%` }} />
              </div>
            </>
          ) : <span className="text-sm text-gray-300">—</span>}
        </div>

        <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-1">
          {renderWhatsAppLink()}
          <div className="w-6 h-6 flex items-center justify-center text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
          </div>
          {isAdmin && (
            <button type="button" onClick={onDelete} title="Delete audit"
              className="flex h-7 w-7 items-center justify-center rounded-xl text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
              🗑️
            </button>
          )}
        </div>
      </div>

      <div
        className={`group border-b border-gray-100 p-4 transition-colors last:border-b-0 md:hidden ${overdueAudit ? 'bg-red-50/30' : isSentBack ? 'bg-red-50/30' : 'hover:bg-[#E8F5F5]/30'}`}
        onClick={onOpen}
      >
        <div className="h-0.5 rounded-full mb-3 -mx-4" style={{ background: overdueAudit ? '#E24B4A' : statusCfg.topBar || audit.auditTypeColor || '#B4B2A9' }} />
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-sm font-bold" style={{ background: overdueAudit ? '#EF4444' : audit.auditTypeColor || '#8B5CF6' }}>
            {audit.auditTypeName?.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-xs font-mono text-gray-400">{audit.auditRefId}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusMeta(status).badge}`}>{eff}</span>
            </div>
            <p className="text-sm font-semibold text-gray-800">{audit.auditTypeName}</p>
            {isSentBack && isAuditor && audit.sentBackReason && (
              <p className="mt-1.5 flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                <span>↩</span><span className="line-clamp-2">{audit.sentBackReason}</span>
              </p>
            )}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {audit.category && <span className="text-xs text-gray-500">🏷️ {audit.category}</span>}
              {audit.branch && <span className="text-xs text-gray-500">🏢 {audit.branch}</span>}
              {audit.auditorName && <span className="text-xs text-gray-500">👤 {audit.auditorName}</span>}
              {audit.endDate && <span className={`text-xs ${overdueAudit ? 'text-red-600 font-medium' : 'text-gray-400'}`}>📅 {formatDate(audit.endDate)}</span>}
              {score !== null && <span className={`text-xs font-bold ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{score}%</span>}
            </div>
          </div>
        </div>
        {eff === 'Submitted' && canManage && !isAuditor && (
          <button type="button" disabled={saving} onClick={async (e) => { e.stopPropagation(); await saveStatus('Under Review'); }}
            className="mt-3 w-full py-2 bg-[#1B6B6B] text-white rounded-xl text-xs font-medium disabled:opacity-50">
            {saving ? '...' : '👀 Start Review'}
          </button>
        )}
      </div>
    </div>
  );
}
