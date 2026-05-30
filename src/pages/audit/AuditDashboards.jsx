import { AUDIT_STATUSES, effStatus, formatDate, getAuditScore, statusMeta } from './auditHelpers';

export function AuditDashboard({ audits, auditTypes }) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const total = audits.length;
  const assigned = audits.filter((a) => effStatus(a.status) === 'Assigned').length;
  const inProgress = audits.filter((a) => effStatus(a.status) === 'In Progress').length;
  const underReview = audits.filter((a) => effStatus(a.status) === 'Under Review').length;
  const closed = audits.filter((a) => effStatus(a.status) === 'Closed').length;

  const overdue = audits.filter((a) => {
    if (effStatus(a.status) === 'Closed') return false;
    const end = a.endDate || a.dueDate;
    if (!end) return false;
    return new Date(end) < now;
  }).length;

  const closedAudits = audits.filter((a) => effStatus(a.status) === 'Closed');
  const complianceRate = (() => {
    const scores = closedAudits.map((a) => getAuditScore(a)).filter((s) => s !== null);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
  })();

  const riskCounts = {
    Critical: audits.filter((a) => a.riskLevel === 'Critical' && effStatus(a.status) !== 'Closed').length,
    High: audits.filter((a) => a.riskLevel === 'High' && effStatus(a.status) !== 'Closed').length,
    Medium: audits.filter((a) => a.riskLevel === 'Medium' && effStatus(a.status) !== 'Closed').length,
    Low: audits.filter((a) => a.riskLevel === 'Low' && effStatus(a.status) !== 'Closed').length,
  };

  const upcomingActions = audits
    .flatMap((a) =>
      (a.findings || [])
        .filter(
          (f) =>
            f.status !== 'Resolved' &&
            f.targetDate &&
            f.ownerName &&
            new Date(f.targetDate) >= now &&
            Math.ceil((new Date(f.targetDate) - now) / (1000 * 60 * 60 * 24)) <= 7,
        )
        .map((f) => ({
          ...f,
          auditName: a.auditTypeName || a.title,
          auditId: a.id,
          branch: a.branch || a.location,
          daysLeft: Math.ceil((new Date(f.targetDate) - now) / (1000 * 60 * 60 * 24)),
        })),
    )
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const overdueActions = audits
    .flatMap((a) =>
      (a.findings || [])
        .filter(
          (f) => f.status !== 'Resolved' && f.ownerName && f.targetDate && new Date(f.targetDate) < now,
        )
        .map((f) => ({
          ...f,
          auditName: a.auditTypeName,
          branch: a.branch || a.location,
          daysOverdue: Math.ceil((now - new Date(f.targetDate)) / (1000 * 60 * 60 * 24)),
        })),
    )
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const auditorWorkload = {};
  audits
    .filter((a) => effStatus(a.status) !== 'Closed')
    .forEach((a) => {
      if (a.auditorName) {
        auditorWorkload[a.auditorName] = (auditorWorkload[a.auditorName] || 0) + 1;
      }
    });
  const workloadList = Object.entries(auditorWorkload)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const byType = {};
  audits.forEach((a) => {
    const name = a.auditTypeName || 'Unknown';
    byType[name] = (byType[name] || 0) + 1;
  });

  const pipeline = [
    { label: 'Assigned', count: assigned, color: '#888780', bg: '#F1EFE8' },
    { label: 'In Progress', count: inProgress, color: '#378ADD', bg: '#E6F1FB' },
    { label: 'Under Review', count: underReview, color: '#7F77DD', bg: '#EEEDFE' },
    { label: 'Closed', count: closed, color: '#639922', bg: '#EAF3DE' },
  ];

  const maxPipeline = Math.max(...pipeline.map((p) => p.count), 1);

  const statusBadge = (audit) =>
    statusMeta(audit.status).badge || 'bg-gray-100 text-gray-700';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400">Total Audits</p>
            <span className="text-xl">🔍</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{total}</p>
          <p className="text-xs text-gray-400 mt-1">
            {closed} closed · {total - closed} active
          </p>
        </div>

        <div className={`border rounded-2xl p-5 ${overdue > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className={`text-xs ${overdue > 0 ? 'text-red-500' : 'text-gray-400'}`}>Overdue</p>
            <span className="text-xl">⚠️</span>
          </div>
          <p className={`text-3xl font-bold ${overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>{overdue}</p>
          <p className={`text-xs mt-1 ${overdue > 0 ? 'text-red-400' : 'text-gray-400'}`}>Past end date</p>
        </div>

        <div className={`border rounded-2xl p-5 ${overdueActions.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <p className={`text-xs ${overdueActions.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Overdue Actions</p>
            <span className="text-xl">🔴</span>
          </div>
          <p className={`text-3xl font-bold ${overdueActions.length > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{overdueActions.length}</p>
          <p className={`text-xs mt-1 ${overdueActions.length > 0 ? 'text-amber-500' : 'text-gray-400'}`}>Findings past target date</p>
        </div>

        {complianceRate !== null ? (
          <div className={`border rounded-2xl p-5 ${complianceRate >= 80 ? 'bg-green-50 border-green-100' : complianceRate >= 60 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500">Pass rate (closed)</p>
              <span className="text-xl">📊</span>
            </div>
            <p className={`text-3xl font-bold ${complianceRate >= 80 ? 'text-green-700' : complianceRate >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
              {complianceRate}%
            </p>
            <p className="text-xs text-gray-400 mt-1">Audits with overall Pass</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-400">Pass rate (closed)</p>
              <span className="text-xl">📊</span>
            </div>
            <p className="text-3xl font-bold text-gray-300">—</p>
            <p className="text-xs text-gray-400 mt-1">Set overall result on closed audits</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">📊 Audit Pipeline</h3>
          <div className="space-y-3">
            {pipeline.map((stage) => (
              <div key={stage.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />
                    <span className="text-xs text-gray-600">{stage.label}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-700">{stage.count}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      background: stage.color,
                      width: stage.count > 0 ? `${Math.max((stage.count / maxPipeline) * 100, 4)}%` : '0%',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {total === 0 && (
            <p className="text-center text-xs text-gray-400 mt-4 py-4">No audits yet — assign one to get started</p>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            🎯 Risk Distribution
            <span className="text-xs font-normal text-gray-400 ml-1">(active audits)</span>
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Critical', icon: '🔴', color: '#EF4444', bg: 'bg-red-50', border: 'border-red-100', text: 'text-red-700' },
              { label: 'High', icon: '🟠', color: '#F97316', bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-700' },
              { label: 'Medium', icon: '🟡', color: '#F59E0B', bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700' },
              { label: 'Low', icon: '🟢', color: '#10B981', bg: 'bg-green-50', border: 'border-green-100', text: 'text-green-700' },
            ].map((risk) => {
              const count = riskCounts[risk.label] || 0;
              const totalActive = Object.values(riskCounts).reduce((a, b) => a + b, 0);
              const pct = totalActive > 0 ? Math.round((count / totalActive) * 100) : 0;
              return (
                <div key={risk.label} className={`flex items-center gap-3 p-3 rounded-xl border ${risk.bg} ${risk.border}`}>
                  <span className="text-lg flex-shrink-0">{risk.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${risk.text}`}>{risk.label}</span>
                      <span className={`text-xs font-bold ${risk.text}`}>{count} audits</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ background: risk.color, width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {Object.values(riskCounts).every((v) => v === 0) && <p className="text-center text-xs text-gray-400 mt-2">No active audits</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center justify-between">
            🔴 Overdue Action Items
            {overdueActions.length > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{overdueActions.length}</span>
            )}
          </h3>
          {overdueActions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-xs text-gray-400">No overdue action items</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {overdueActions.slice(0, 20).map((item, i) => (
                <div key={i} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-xs font-medium text-gray-800 mb-1.5 line-clamp-2">{item.description}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-red-600 font-medium">⚠️ {item.daysOverdue}d overdue</span>
                    <span className="text-xs text-gray-500">· 👤 {item.ownerName}</span>
                    {item.branch ? <span className="text-xs text-gray-400">· {item.branch}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center justify-between">
            ⏰ Upcoming Action Items
            <span className="text-xs text-gray-400 font-normal">Due in 7 days</span>
          </h3>
          {upcomingActions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">🎯</p>
              <p className="text-xs text-gray-400">No upcoming action items</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {upcomingActions.slice(0, 20).map((item, i) => (
                <div key={i} className={`p-3 border rounded-xl ${item.daysLeft <= 0 ? 'bg-red-50 border-red-100' : item.daysLeft <= 2 ? 'bg-orange-50 border-orange-100' : 'bg-amber-50 border-amber-100'}`}>
                  <p className="text-xs font-medium text-gray-800 mb-1.5 line-clamp-2">{item.description}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium ${item.daysLeft <= 0 ? 'text-red-600' : item.daysLeft <= 2 ? 'text-orange-600' : 'text-amber-600'}`}>
                      {item.daysLeft <= 0 ? 'Due today' : `${item.daysLeft}d left`}
                    </span>
                    <span className="text-xs text-gray-500">· 👤 {item.ownerName}</span>
                    {item.branch ? <span className="text-xs text-gray-400">· {item.branch}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            👥 Auditor Workload
            <span className="text-xs font-normal text-gray-400 ml-1">(active audits)</span>
          </h3>
          {workloadList.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">👥</p>
              <p className="text-xs text-gray-400">No active audits assigned</p>
            </div>
          ) : (
            <div className="space-y-3">
              {workloadList.map(([name, count]) => (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{name?.charAt(0)}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 truncate">{name}</span>
                      <span className="text-xs font-bold text-gray-700 ml-2">{count}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#1B6B6B] rounded-full" style={{ width: `${Math.max((count / (workloadList[0][1] || 1)) * 100, 8)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">📋 Audits by Template</h3>
          {Object.keys(byType).length === 0 ? (
            <div className="text-center py-6 px-4">
              <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mx-auto mb-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="12" height="11" rx="2" stroke="#D3D1C7" strokeWidth="1.2" />
                  <path d="M5 7h6M5 10h4" stroke="#D3D1C7" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-xs text-gray-300">No audits here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(byType)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => {
                  const type = (auditTypes || []).find((t) => t.name === name);
                  const maxCount = Math.max(...Object.values(byType), 1);
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: type?.color || '#8B5CF6' }}>
                        {name?.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700 truncate">{name}</span>
                          <span className="text-xs font-bold text-gray-700 ml-2">{count}</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ background: type?.color || '#8B5CF6', width: `${Math.max((count / maxCount) * 100, 8)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">🕐 Recent Audits</h3>
        {audits.slice(0, 5).length === 0 ? (
          <div className="text-center py-6 px-4">
            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mx-auto mb-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="11" rx="2" stroke="#D3D1C7" strokeWidth="1.2" />
                <path d="M5 7h6M5 10h4" stroke="#D3D1C7" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-xs text-gray-300">No audits yet — assign one to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {audits.slice(0, 5).map((audit) => (
              <div key={audit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: audit.auditTypeColor || '#8B5CF6' }}>
                    {audit.auditTypeName?.charAt(0) || 'A'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {audit.auditTypeName}{audit.branch ? ` — ${audit.branch}` : ''}
                    </p>
                    <p className="text-xs font-mono text-gray-400 truncate">{audit.auditRefId || '—'}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {audit.auditorName || '—'}{audit.endDate ? ` · Ends ${formatDate(audit.endDate)}` : ''}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ml-2 ${statusBadge(audit)}`}>
                  {effStatus(audit.status)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AuditorDashboard({ audits, currentUser }) {
  const email = currentUser?.email?.toLowerCase();
  const myAudits = audits.filter(
    (a) =>
      (a.auditorEmail || '').toLowerCase() === email ||
      (a.teamMembers || []).some((m) => (m.email || '').toLowerCase() === email),
  );

  const assigned = myAudits.filter((a) => effStatus(a.status) === 'Assigned');
  const inProgress = myAudits.filter((a) => effStatus(a.status) === 'In Progress');
  const sentBack = myAudits.filter((a) => effStatus(a.status) === 'Sent Back');
  const submitted = myAudits.filter((a) => {
    const s = effStatus(a.status);
    return s === 'Submitted' || s === 'Under Review';
  });
  const closed = myAudits.filter((a) => effStatus(a.status) === 'Closed');

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const overdue = myAudits.filter((a) => {
    const s = effStatus(a.status);
    if (s === 'Closed' || s === 'Submitted' || s === 'Under Review') return false;
    const end = a.endDate || a.dueDate;
    if (!end) return false;
    return new Date(end) < now;
  });

  const activeCount = myAudits.filter((a) => effStatus(a.status) !== 'Closed').length;
  const closedA = myAudits.filter((a) => effStatus(a.status) === 'Closed');
  const scoreList = closedA.map((a) => getAuditScore(a)).filter((s) => s !== null);
  const myScore = scoreList.length > 0 ? Math.round(scoreList.reduce((sum, s) => sum + s, 0) / scoreList.length) : null;
  const completionRate = myAudits.length > 0 ? Math.round((closed.length / myAudits.length) * 100) : 0;
  const myFindings = myAudits.reduce((sum, a) => sum + (a.findings || []).filter((f) => f.addedByRole === 'auditor').length, 0);

  const upcomingAudits = myAudits
    .filter((a) => {
      const s = effStatus(a.status);
      return s !== 'Closed' && s !== 'Submitted' && s !== 'Under Review' && a.endDate;
    })
    .map((a) => ({ ...a, daysLeft: Math.ceil((new Date(a.endDate) - now) / (1000 * 60 * 60 * 24)) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-[#1B6B6B] to-[#2D8A8A] rounded-2xl p-6 text-white">
        <h2 className="text-lg font-bold mb-1">My Audits</h2>
        <p className="text-sm opacity-80">
          {activeCount} active audit{activeCount !== 1 ? 's' : ''} assigned to you
        </p>
      </div>

      {(sentBack.length > 0 || overdue.length > 0) && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">⚠️ Needs Your Attention</h3>
          {sentBack.map((audit) => (
            <div key={audit.id} className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">{audit.auditRefId}</span>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">↩ Sent Back</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">{audit.auditTypeName}</p>
                  {audit.branch && <p className="text-xs text-gray-500 mt-0.5">🏢 {audit.branch}</p>}
                  {audit.sentBackReason && (
                    <p className="text-xs text-red-600 mt-1 italic">&quot;{audit.sentBackReason}&quot;</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {overdue.map((audit) => (
            <div key={audit.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-mono text-gray-400">{audit.auditRefId}</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⚠️ Overdue</span>
              </div>
              <p className="text-sm font-semibold text-gray-800">{audit.auditTypeName}</p>
              {audit.branch && <p className="text-xs text-gray-500 mt-0.5">🏢 {audit.branch}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Assigned', count: assigned.length, icon: '📋', color: 'bg-gray-50 border-gray-200', text: 'text-gray-700' },
          { label: 'In Progress', count: inProgress.length, icon: '✍️', color: 'bg-blue-50 border-blue-100', text: 'text-blue-800' },
          { label: 'Submitted', count: submitted.length, icon: '📤', color: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
          { label: 'Closed', count: closed.length, icon: '✅', color: 'bg-green-50 border-green-100', text: 'text-green-800' },
        ].map((s) => (
          <div key={s.label} className={`border rounded-2xl p-4 ${s.color}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg">{s.icon}</span>
              <p className={`text-2xl font-bold ${s.text}`}>{s.count}</p>
            </div>
            <p className={`text-xs font-medium ${s.text}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {upcomingAudits.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">📅 Upcoming Deadlines</h3>
            <div className="flex items-center gap-2">
              {upcomingAudits.filter((a) => a.daysLeft < 0).length > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  {upcomingAudits.filter((a) => a.daysLeft < 0).length} overdue
                </span>
              )}
              {upcomingAudits.filter((a) => a.daysLeft >= 0 && a.daysLeft <= 7).length > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {upcomingAudits.filter((a) => a.daysLeft >= 0 && a.daysLeft <= 7).length} this week
                </span>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {upcomingAudits.map((audit) => {
              const isOverdue = audit.daysLeft < 0;
              const isDueToday = audit.daysLeft === 0;
              const isDueSoon = audit.daysLeft > 0 && audit.daysLeft <= 3;
              const isDueThisWeek = audit.daysLeft > 3 && audit.daysLeft <= 7;
              const cardCls = isOverdue || isDueToday ? 'bg-red-50 border-red-200' : isDueSoon ? 'bg-amber-50 border-amber-200' : isDueThisWeek ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100';
              const dateLabel = isOverdue ? `⚠️ ${Math.abs(audit.daysLeft)}d overdue` : isDueToday ? '🔴 Due today' : isDueSoon ? `⏰ Due in ${audit.daysLeft}d` : isDueThisWeek ? `📅 Due in ${audit.daysLeft}d` : `📅 ${formatDate(audit.endDate)}`;
              const dateCls = isOverdue || isDueToday ? 'text-red-600 font-bold' : isDueSoon ? 'text-amber-700 font-bold' : isDueThisWeek ? 'text-blue-700' : 'text-gray-400';
              const eff = effStatus(audit.status);
              const sCfg = AUDIT_STATUSES.find((s) => s.key === eff) || AUDIT_STATUSES[0];
              return (
                <div key={audit.id} className={`border rounded-xl p-3.5 ${cardCls}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-mono text-gray-400">{audit.auditRefId}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sCfg.badge}`}>{sCfg.icon} {eff}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 truncate">{audit.auditTypeName}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {audit.branch && <span className="text-xs text-gray-500">🏢 {audit.branch}</span>}
                        {audit.location && <span className="text-xs text-gray-400">📍 {audit.location}</span>}
                      </div>
                    </div>
                    <span className={`text-xs flex-shrink-0 mt-0.5 ${dateCls}`}>{dateLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {myAudits.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">📈 My Performance</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p className={`text-2xl font-bold ${myScore !== null ? myScore >= 80 ? 'text-green-600' : myScore >= 60 ? 'text-amber-600' : 'text-red-600' : 'text-gray-300'}`}>
                {myScore !== null ? `${myScore}%` : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Avg Score</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-[#1B6B6B]">{completionRate}%</p>
              <p className="text-xs text-gray-400 mt-1">Completed</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-700">{myFindings}</p>
              <p className="text-xs text-gray-400 mt-1">Findings</p>
            </div>
          </div>
          {myScore !== null && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-400">Compliance Score</span>
                <span className={`text-xs font-bold ${myScore >= 80 ? 'text-green-600' : myScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{myScore}%</span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${myScore >= 80 ? 'bg-green-500' : myScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${myScore}%` }} />
              </div>
            </div>
          )}
        </div>
      )}

      {myAudits.filter((a) => effStatus(a.status) !== 'Closed').length > 0 && (
        <div className="bg-[#E8F5F5] border border-[#4ECDC4]/30 rounded-2xl p-4">
          <p className="text-sm font-medium text-[#1B6B6B] mb-1">💡 How to submit an audit</p>
          <p className="text-xs text-[#1B6B6B]/70 leading-relaxed">
            Go to the <strong>Audits tab</strong> → click your assigned audit → fill the <strong>checklist</strong> → go to{' '}
            <strong>Findings</strong> → click <strong>Submit</strong>
          </p>
        </div>
      )}
    </div>
  );
}
