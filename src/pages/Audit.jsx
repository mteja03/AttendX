import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  where,
  getDoc,
  setDoc,
  increment,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { trackPageView } from '../utils/analytics';

/** Format YYYY-MM-DD (from inputs / Firestore) as DD/MM/YYYY */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

/** Legacy Firestore status → UI lifecycle */
function effStatus(status) {
  if (status === 'Scheduled') return 'Assigned';
  return status || '';
}

function getAllowedStatuses(currentStatus, userRole) {
  const canMgr = userRole === 'admin' || userRole === 'hrmanager' || userRole === 'auditmanager';
  if (!canMgr) return [];
  const s = effStatus(currentStatus);
  if (s === 'Submitted') return ['Under Review'];
  if (s === 'Under Review') return ['Closed', 'Sent Back'];
  if (s === 'Sent Back') return ['Under Review'];
  return [];
}

function getFindingAddedByRole(userRole) {
  if (userRole === 'auditor') return 'auditor';
  if (userRole === 'auditmanager') return 'auditmanager';
  if (userRole === 'hrmanager') return 'auditmanager';
  if (userRole === 'admin') return 'auditmanager';
  return 'auditor';
}

function getAuditScore(audit) {
  const items = audit?.checklistReview || [];
  const reviewed = items.filter((i) => i.result === 'pass' || i.result === 'fail');
  if (reviewed.length === 0) return null;
  const passed = items.filter((i) => i.result === 'pass').length;
  return Math.round((passed / reviewed.length) * 100);
}

const AUDIT_STATUSES = [
  { key: 'Assigned', color: '#8B5CF6', bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', icon: '📋' },
  { key: 'In Progress', color: '#3B82F6', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', icon: '✍️' },
  { key: 'Submitted', color: '#F97316', bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', icon: '📤' },
  { key: 'Sent Back', color: '#EF4444', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700', icon: '↩' },
  { key: 'Under Review', color: '#EC4899', bg: 'bg-pink-50', border: 'border-pink-200', badge: 'bg-pink-100 text-pink-700', icon: '👀' },
  { key: 'Closed', color: '#10B981', bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700', icon: '✅' },
];

const AUDIT_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#1B6B6B', '#6366F1', '#14B8A6'];

/** Used by AuditCalendar; includes legacy keys for older documents */
const STATUS_COLORS = {
  Scheduled: 'bg-purple-100 text-purple-700',
  Assigned: 'bg-purple-100 text-purple-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Submitted: 'bg-orange-100 text-orange-700',
  'Sent Back': 'bg-red-100 text-red-700',
  'Under Review': 'bg-pink-100 text-pink-700',
  Closed: 'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700',
};

function statusMeta(status) {
  const e = effStatus(status);
  return AUDIT_STATUSES.find((s) => s.key === e) || { badge: 'bg-gray-100 text-gray-600', icon: '•' };
}

function AuditDashboard({ audits, auditTypes }) {
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
    { label: 'Assigned', count: assigned, color: '#8B5CF6', bg: '#EDE9FE' },
    { label: 'In Progress', count: inProgress, color: '#3B82F6', bg: '#DBEAFE' },
    { label: 'Under Review', count: underReview, color: '#EC4899', bg: '#FCE7F3' },
    { label: 'Closed', count: closed, color: '#10B981', bg: '#D1FAE5' },
  ];

  const maxPipeline = Math.max(...pipeline.map((p) => p.count), 1);

  const statusBadge = (audit, isOverdueAudit) => {
    if (isOverdueAudit) return 'bg-red-100 text-red-700';
    return statusMeta(audit.status).badge || 'bg-gray-100 text-gray-700';
  };

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
          <div
            className={`border rounded-2xl p-5 ${
              complianceRate >= 80 ? 'bg-green-50 border-green-100' : complianceRate >= 60 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'
            }`}
          >
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
          {total === 0 && <p className="text-center text-xs text-gray-400 mt-4">No audits yet</p>}
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
              {overdueActions.slice(0, 8).map((item, i) => (
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
              {upcomingActions.slice(0, 8).map((item, i) => (
                <div
                  key={i}
                  className={`p-3 border rounded-xl ${
                    item.daysLeft <= 0 ? 'bg-red-50 border-red-100' : item.daysLeft <= 2 ? 'bg-orange-50 border-orange-100' : 'bg-amber-50 border-amber-100'
                  }`}
                >
                  <p className="text-xs font-medium text-gray-800 mb-1.5 line-clamp-2">{item.description}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-medium ${
                        item.daysLeft <= 0 ? 'text-red-600' : item.daysLeft <= 2 ? 'text-orange-600' : 'text-amber-600'
                      }`}
                    >
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
                      <div
                        className="h-full bg-[#1B6B6B] rounded-full"
                        style={{ width: `${Math.max((count / (workloadList[0][1] || 1)) * 100, 8)}%` }}
                      />
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
            <div className="text-center py-8">
              <p className="text-2xl mb-2">📋</p>
              <p className="text-xs text-gray-400">No audits yet</p>
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
                      <div
                        className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: type?.color || '#8B5CF6' }}
                      >
                        {name?.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700 truncate">{name}</span>
                          <span className="text-xs font-bold text-gray-700 ml-2">{count}</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              background: type?.color || '#8B5CF6',
                              width: `${Math.max((count / maxCount) * 100, 8)}%`,
                            }}
                          />
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
          <div className="text-center py-8">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-xs text-gray-400">No audits yet. Assign your first audit to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {audits.slice(0, 5).map((audit) => {
              const isOverdueAudit =
                effStatus(audit.status) !== 'Closed' &&
                (audit.endDate || audit.dueDate) &&
                new Date(audit.endDate || audit.dueDate) < now;
              return (
                <div key={audit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: audit.auditTypeColor || '#8B5CF6' }}
                    >
                      {audit.auditTypeName?.charAt(0) || 'A'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {audit.auditTypeName}
                        {audit.branch ? ` — ${audit.branch}` : ''}
                      </p>
                      <p className="text-xs font-mono text-gray-400 truncate">{audit.auditRefId || '—'}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {audit.auditorName || '—'}
                        {audit.endDate ? ` · Ends ${formatDate(audit.endDate)}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ml-2 ${statusBadge(audit, isOverdueAudit)}`}>
                    {isOverdueAudit ? 'Overdue' : effStatus(audit.status)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AuditorDashboard({ audits, currentUser }) {
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

  const myScore = useMemo(() => {
    const closedA = myAudits.filter((a) => effStatus(a.status) === 'Closed');
    const scores = closedA.map((a) => getAuditScore(a)).filter((s) => s !== null);
    return scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null;
  }, [myAudits]);

  const completionRate = myAudits.length > 0 ? Math.round((closed.length / myAudits.length) * 100) : 0;

  const myFindings = useMemo(
    () => myAudits.reduce((sum, a) => sum + (a.findings || []).filter((f) => f.addedByRole === 'auditor').length, 0),
    [myAudits],
  );

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
          { label: 'Assigned', count: assigned.length, icon: '📋', color: 'bg-purple-50 border-purple-100', text: 'text-purple-700' },
          { label: 'In Progress', count: inProgress.length, icon: '✍️', color: 'bg-blue-50 border-blue-100', text: 'text-blue-700' },
          { label: 'Submitted', count: submitted.length, icon: '📤', color: 'bg-orange-50 border-orange-100', text: 'text-orange-700' },
          { label: 'Closed', count: closed.length, icon: '✅', color: 'bg-green-50 border-green-100', text: 'text-green-700' },
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

      {myAudits.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">📈 My Performance</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p
                className={`text-2xl font-bold ${
                  myScore !== null
                    ? myScore >= 80
                      ? 'text-green-600'
                      : myScore >= 60
                        ? 'text-amber-600'
                        : 'text-red-600'
                    : 'text-gray-300'
                }`}
              >
                {myScore !== null ? `${myScore}%` : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Avg Score</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-[#1B6B6B]">{completionRate}%</p>
              <p className="text-xs text-gray-400 mt-1">Completion Rate</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-xl">
              <p className="text-2xl font-bold text-gray-700">{myFindings}</p>
              <p className="text-xs text-gray-400 mt-1">Findings Added</p>
            </div>
          </div>

          {myScore !== null && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-400">Average Compliance Score</span>
                <span
                  className={`text-xs font-bold ${myScore >= 80 ? 'text-green-600' : myScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}
                >
                  {myScore}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${myScore >= 80 ? 'bg-green-500' : myScore >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${myScore}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {myAudits.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Audits</h3>
          <div className="space-y-2">
            {myAudits.slice(0, 5).map((audit) => (
              <div key={audit.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-400">{audit.auditRefId}</span>
                    <p className="text-sm font-medium text-gray-800">{audit.auditTypeName}</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {audit.branch || '—'} · Due {formatDate(audit.endDate)}
                  </p>
                </div>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusMeta(audit.status).badge}`}
                >
                  {effStatus(audit.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AuditCalendar({ audits, onClose, onSelectAudit }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const auditsByDate = {};
  audits.forEach((audit) => {
    if (audit.startDate) {
      const key = audit.startDate;
      if (!auditsByDate[key]) auditsByDate[key] = [];
      auditsByDate[key].push({ ...audit, dateType: 'start' });
    }
    const endKey = audit.endDate || audit.dueDate;
    if (endKey) {
      if (!auditsByDate[endKey]) auditsByDate[endKey] = [];
      if (!auditsByDate[endKey].find((a) => a.id === audit.id)) {
        auditsByDate[endKey].push({ ...audit, dateType: 'end' });
      }
    }
  });

  const getDayKey = (day) => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  const selectedDayAudits = selectedDay ? auditsByDate[getDayKey(selectedDay)] || [] : [];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1));
    setSelectedDay(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1));
    setSelectedDay(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <div className="relative bg-white w-full max-w-lg h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#E8F5F5] rounded-xl flex items-center justify-center text-lg">📅</div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Audit Calendar</h2>
              <p className="text-xs text-gray-400">{audits.length} audits scheduled</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-lg"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-5">
            <button
              type="button"
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"
            >
              ←
            </button>
            <h3 className="text-sm font-semibold text-gray-800">
              {monthNames[month]} {year}
            </h3>
            <button
              type="button"
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"
            >
              →
            </button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const key = getDayKey(day);
              const dayAudits = auditsByDate[key] || [];
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const isToday = today.getTime() === new Date(year, month, day).setHours(0, 0, 0, 0);
              const isSelected = selectedDay === day;
              const hasOverdue = dayAudits.some((a) => {
                const t = new Date();
                t.setHours(0, 0, 0, 0);
                return a.dateType === 'end' && effStatus(a.status) !== 'Closed' && new Date(key) < t;
              });

              return (
                <div
                  key={day}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedDay(selectedDay === day ? null : day);
                  }}
                  className={`relative aspect-square flex flex-col items-center justify-start pt-1.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#1B6B6B] text-white'
                      : isToday
                        ? 'bg-[#E8F5F5] text-[#1B6B6B]'
                        : 'hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`text-xs font-medium ${
                      isSelected ? 'text-white' : isToday ? 'text-[#1B6B6B]' : 'text-gray-700'
                    }`}
                  >
                    {day}
                  </span>
                  {dayAudits.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap justify-center max-w-full px-1">
                      {dayAudits.slice(0, 3).map((a, idx) => (
                        <div
                          key={idx}
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{
                            background: isSelected
                              ? 'white'
                              : hasOverdue && a.dateType === 'end'
                                ? '#EF4444'
                                : a.auditTypeColor || '#8B5CF6',
                          }}
                        />
                      ))}
                      {dayAudits.length > 3 && (
                        <span
                          className={`text-xs leading-none ${isSelected ? 'text-white/70' : 'text-gray-400'}`}
                        >
                          +{dayAudits.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#1B6B6B]" />
              <span className="text-xs text-gray-400">Start date</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#8B5CF6]" />
              <span className="text-xs text-gray-400">End date</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-xs text-gray-400">Overdue</span>
            </div>
          </div>

          {selectedDay && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                {monthNames[month]} {selectedDay}
                {selectedDayAudits.length === 0
                  ? ' — No audits'
                  : ` — ${selectedDayAudits.length} audit${selectedDayAudits.length !== 1 ? 's' : ''}`}
              </h4>
              {selectedDayAudits.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
                  <p className="text-xs text-gray-400">No audits on this date</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDayAudits.map((audit, idx) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const overdueAudit =
                      audit.dateType === 'end' &&
                      effStatus(audit.status) !== 'Closed' &&
                      new Date(getDayKey(selectedDay)) < today;
                    return (
                      <div
                        key={`${audit.id}-${audit.dateType}-${idx}`}
                        role="button"
                        tabIndex={0}
                        className={`p-3 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${
                          overdueAudit ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100 hover:border-gray-200'
                        }`}
                        onClick={() => onSelectAudit(audit)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') onSelectAudit(audit);
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div
                            className="w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                            style={{ background: audit.auditTypeColor || '#8B5CF6' }}
                          >
                            {audit.auditTypeName?.charAt(0)}
                          </div>
                          <p className="text-sm font-medium text-gray-800 flex-1 truncate">{audit.auditTypeName}</p>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              overdueAudit
                                ? 'bg-red-100 text-red-700'
                                : STATUS_COLORS[effStatus(audit.status)] || STATUS_COLORS.Assigned
                            }`}
                          >
                            {overdueAudit ? 'Overdue' : effStatus(audit.status)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap ml-8">
                          {audit.auditRefId ? (
                            <span className="text-xs font-mono text-gray-400">{audit.auditRefId}</span>
                          ) : null}
                          {audit.branch && <span className="text-xs text-gray-400">🏢 {audit.branch}</span>}
                          {audit.auditorName && <span className="text-xs text-gray-400">· 👤 {audit.auditorName}</span>}
                          <span
                            className={`text-xs font-medium ${
                              audit.dateType === 'start'
                                ? 'text-[#1B6B6B]'
                                : overdueAudit
                                  ? 'text-red-600'
                                  : 'text-gray-500'
                            }`}
                          >
                            ·{' '}
                            {audit.dateType === 'start'
                              ? '▶ Starts'
                              : overdueAudit
                                ? '⚠️ Was due'
                                : '⏹ Ends'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 pt-5 border-t border-gray-100">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">This Month</h4>
            {(() => {
              const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
              const monthAudits = audits.filter(
                (a) =>
                  (a.startDate || '').startsWith(monthKey) ||
                  (a.endDate || '').startsWith(monthKey) ||
                  (a.dueDate || '').startsWith(monthKey),
              );
              if (monthAudits.length === 0) {
                return <p className="text-xs text-gray-400 text-center py-3">No audits this month</p>;
              }
              return (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'In month', value: monthAudits.length, color: 'text-gray-700' },
                    { label: 'Active', value: monthAudits.filter((a) => effStatus(a.status) !== 'Closed').length, color: 'text-blue-600' },
                    { label: 'Closed', value: monthAudits.filter((a) => effStatus(a.status) === 'Closed').length, color: 'text-green-600' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditSettings({ auditTypes, companyId, currentUser, onClose, showSuccess, showError }) {
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    auditCategory: '',
    name: '',
    description: '',
    color: AUDIT_COLORS[0],
    riskLevel: 'Medium',
  });
  const [checklistItems, setChecklistItems] = useState([]);
  const [sections, setSections] = useState(['General']);
  const [newSection, setNewSection] = useState('');

  const resetForm = () => {
    setForm({ auditCategory: '', name: '', description: '', color: AUDIT_COLORS[0], riskLevel: 'Medium' });
    setChecklistItems([]);
    setSections(['General']);
    setNewSection('');
    setEditingType(null);
  };

  const openEdit = (type) => {
    setEditingType(type);
    setForm({
      auditCategory: type.auditCategory || '',
      name: type.name || '',
      description: type.description || '',
      color: type.color || AUDIT_COLORS[0],
      riskLevel: type.riskLevel || 'Medium',
    });
    setChecklistItems(type.checklistItems || []);
    const sects = [...new Set((type.checklistItems || []).map((i) => i.section))];
    setSections(sects.length > 0 ? sects : ['General']);
    setShowModal(true);
  };

  const addItem = (section) => {
    setChecklistItems((prev) => [
      ...prev,
      { id: 'item_' + Date.now(), section, question: '', riskLevel: 'Medium', order: prev.length },
    ]);
  };

  const updateItem = (id, field, value) => {
    setChecklistItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const removeItem = (id) => {
    setChecklistItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSave = async () => {
    if (!form.auditCategory) {
      showError('Select Internal or External');
      return;
    }
    if (!form.name.trim()) {
      showError('Enter template name');
      return;
    }
    try {
      setSaving(true);
      const data = {
        auditCategory: form.auditCategory,
        name: form.name.trim(),
        description: form.description.trim(),
        color: form.color,
        riskLevel: form.riskLevel,
        checklistItems,
        updatedAt: new Date(),
        updatedBy: currentUser?.email || '',
      };
      if (editingType) {
        await updateDoc(doc(db, 'companies', companyId, 'auditTypes', editingType.id), data);
        showSuccess('Template updated!');
      } else {
        await addDoc(collection(db, 'companies', companyId, 'auditTypes'), {
          ...data,
          createdAt: new Date(),
          createdBy: currentUser?.email || '',
        });
        showSuccess('Template created!');
      }
      setShowModal(false);
      resetForm();
    } catch (e) {
      showError('Failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type) => {
    if (!window.confirm(`Delete "${type.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'companies', companyId, 'auditTypes', type.id));
      showSuccess('Template deleted');
    } catch (e) {
      showError('Failed to delete');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <div className="relative bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#E8F5F5] rounded-xl flex items-center justify-center text-lg">⚙️</div>
            <div>
              <h2 className="text-base font-semibold text-gray-800">Audit Settings</h2>
              <p className="text-xs text-gray-400">
                {auditTypes.length} template{auditTypes.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-700">Audit Templates</p>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#1B6B6B] text-white rounded-xl text-xs font-medium hover:bg-[#155858]"
            >
              + Add Template
            </button>
          </div>

          {auditTypes.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
              <p className="text-3xl mb-3">📋</p>
              <p className="text-sm font-medium text-gray-600 mb-1">No templates yet</p>
              <p className="text-xs text-gray-400 mb-4">Create your first audit template to get started</p>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowModal(true);
                }}
                className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium"
              >
                + Create Template
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {auditTypes.map((type) => (
                <div key={type.id} className="bg-white border border-gray-100 rounded-2xl p-4 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div
                        className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-base"
                        style={{ background: type.color || '#8B5CF6' }}
                      >
                        {type.name?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{type.name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              type.auditCategory === 'External' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {type.auditCategory === 'External' ? '🌐' : '🏢'} {type.auditCategory}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              type.riskLevel === 'Critical'
                                ? 'bg-red-100 text-red-700'
                                : type.riskLevel === 'High'
                                  ? 'bg-orange-100 text-orange-700'
                                  : type.riskLevel === 'Medium'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {type.riskLevel === 'Critical' && '🔴 '}
                            {type.riskLevel === 'High' && '🟠 '}
                            {type.riskLevel === 'Medium' && '🟡 '}
                            {type.riskLevel === 'Low' && '🟢 '}
                            {type.riskLevel || 'Medium'}
                          </span>
                          <span className="text-xs text-gray-400">{(type.checklistItems || []).length} items</span>
                        </div>
                        {type.description && <p className="text-xs text-gray-400 mt-1 truncate">{type.description}</p>}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {[...new Set((type.checklistItems || []).map((i) => i.section))].map((s) => (
                            <span key={s} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                              {s} ({(type.checklistItems || []).filter((i) => i.section === s).length})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button type="button" onClick={() => openEdit(type)} className="px-3 py-1.5 text-xs text-[#1B6B6B] hover:bg-[#E8F5F5] rounded-lg">
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(type)} className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-50 rounded-lg">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowModal(false); resetForm(); }} role="presentation" />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">{editingType ? 'Edit Template' : 'New Audit Template'}</h2>
              <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Audit Category *</label>
                <div className="grid grid-cols-2 gap-3">
                  {['Internal', 'External'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, auditCategory: cat }))}
                      className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.auditCategory === cat
                          ? 'border-[#1B6B6B] bg-[#E8F5F5] text-[#1B6B6B]'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {cat === 'Internal' ? '🏢 Internal' : '🌐 External'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Template Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Cash Handling Audit"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Description (optional)</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {AUDIT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, color }))}
                      className={`w-8 h-8 rounded-full transition-all ${
                        form.color === color ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'
                      }`}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Risk Level</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'Low', icon: '🟢', cls: 'border-green-200 text-green-700', active: 'bg-green-500 border-green-500 text-white' },
                    { value: 'Medium', icon: '🟡', cls: 'border-amber-200 text-amber-700', active: 'bg-amber-500 border-amber-500 text-white' },
                    { value: 'High', icon: '🟠', cls: 'border-orange-200 text-orange-700', active: 'bg-orange-500 border-orange-500 text-white' },
                    { value: 'Critical', icon: '🔴', cls: 'border-red-200 text-red-700', active: 'bg-red-500 border-red-500 text-white' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, riskLevel: opt.value }))}
                      className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.riskLevel === opt.value ? opt.active : `bg-white ${opt.cls} hover:opacity-80`
                      }`}
                    >
                      {opt.icon} {opt.value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist</label>
                  <span className="text-xs text-gray-400">{checklistItems.length} items</span>
                </div>

                {sections.map((section) => (
                  <div key={section} className="mb-5">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-700">{section}</h4>
                      <button type="button" onClick={() => addItem(section)} className="text-xs text-[#1B6B6B] hover:underline">
                        + Add item
                      </button>
                    </div>

                    {checklistItems
                      .filter((i) => i.section === section)
                      .map((item) => (
                        <div key={item.id} className="flex gap-2 mb-2 p-3 bg-gray-50 rounded-xl items-start">
                          <div className="flex-1 space-y-2">
                            <input
                              value={item.question}
                              onChange={(e) => updateItem(item.id, 'question', e.target.value)}
                              placeholder="Checklist item..."
                              className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                            />
                            <select
                              value={item.riskLevel || 'Medium'}
                              onChange={(e) => updateItem(item.id, 'riskLevel', e.target.value)}
                              className={`text-xs border rounded-lg px-2 py-1.5 font-medium ${
                                item.riskLevel === 'Critical'
                                  ? 'bg-red-50 border-red-200 text-red-700'
                                  : item.riskLevel === 'High'
                                    ? 'bg-orange-50 border-orange-200 text-orange-700'
                                    : item.riskLevel === 'Medium'
                                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                                      : 'bg-green-50 border-green-200 text-green-700'
                              }`}
                            >
                              <option value="Low">🟢 Low</option>
                              <option value="Medium">🟡 Medium</option>
                              <option value="High">🟠 High</option>
                              <option value="Critical">🔴 Critical</option>
                            </select>
                          </div>
                          <button type="button" onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 mt-2 flex-shrink-0">
                            ✕
                          </button>
                        </div>
                      ))}

                    {checklistItems.filter((i) => i.section === section).length === 0 && (
                      <button
                        type="button"
                        onClick={() => addItem(section)}
                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors"
                      >
                        + Add first item
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex gap-2">
                  <input
                    value={newSection}
                    onChange={(e) => setNewSection(e.target.value)}
                    placeholder="New section name..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newSection.trim()) {
                        setSections((prev) => [...prev, newSection.trim()]);
                        setNewSection('');
                      }
                    }}
                    className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newSection.trim()) return;
                      setSections((prev) => [...prev, newSection.trim()]);
                      setNewSection('');
                    }}
                    className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm"
                  >
                    + Section
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t flex-shrink-0 flex gap-3">
              <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingType ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function AssignAuditModal({
  auditTypes,
  company,
  employees,
  assignForm,
  setAssignForm,
  leadSearch,
  setLeadSearch,
  showLeadDrop,
  setShowLeadDrop,
  teamSearch,
  setTeamSearch,
  showTeamDrop,
  setShowTeamDrop,
  leadRef,
  teamRef,
  saving,
  onClose,
  onSubmit,
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        <div className="px-6 py-5 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#E8F5F5] rounded-xl flex items-center justify-center text-lg">🔍</div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">Assign Audit</h2>
                <p className="text-xs text-gray-400">Schedule an audit for an auditor</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Audit Template</p>
            <select
              value={assignForm.auditTypeId}
              onChange={(e) => setAssignForm((prev) => ({ ...prev, auditTypeId: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            >
              <option value="">Select template...</option>
              {auditTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.auditCategory || 'Internal'} · {t.riskLevel || 'Medium'} Risk
                </option>
              ))}
            </select>
            {assignForm.auditTypeId &&
              (() => {
                const t = auditTypes.find((x) => x.id === assignForm.auditTypeId);
                if (!t) return null;
                return (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.auditCategory === 'External' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {t.auditCategory === 'External' ? '🌐' : '🏢'} {t.auditCategory}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.riskLevel === 'Critical'
                          ? 'bg-red-100 text-red-700'
                          : t.riskLevel === 'High'
                            ? 'bg-orange-100 text-orange-700'
                            : t.riskLevel === 'Medium'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {t.riskLevel || 'Medium'}
                    </span>
                    <span className="text-xs text-gray-400">{(t.checklistItems || []).length} checklist items</span>
                  </div>
                );
              })()}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Location</p>
            <div className="space-y-3">
              <select
                value={assignForm.category}
                onChange={(e) => setAssignForm((p) => ({ ...p, category: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
              >
                <option value="">Select category...</option>
                {(company?.categories || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={assignForm.location}
                onChange={(e) => setAssignForm((p) => ({ ...p, location: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
              >
                <option value="">Select location...</option>
                {(company?.locations || []).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={assignForm.branch}
                  onChange={(e) => setAssignForm((p) => ({ ...p, branch: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">Select branch...</option>
                  {(company?.branches || []).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                <select
                  value={assignForm.department}
                  onChange={(e) => setAssignForm((p) => ({ ...p, department: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">Select dept...</option>
                  {(company?.departments || []).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Audit Team</p>
            <div className="space-y-3">
              <div ref={leadRef} className="relative">
                <label className="text-xs text-gray-500 block mb-1.5">Lead Auditor *</label>
                <input
                  type="text"
                  value={assignForm.auditorId ? assignForm.auditorName : leadSearch}
                  placeholder="Search auditor..."
                  onChange={(e) => {
                    setLeadSearch(e.target.value);
                    setShowLeadDrop(true);
                    if (!e.target.value) {
                      setAssignForm((p) => ({ ...p, auditorId: '', auditorName: '', auditorEmail: '' }));
                    }
                  }}
                  onFocus={() => {
                    setLeadSearch('');
                    setShowLeadDrop(true);
                    setAssignForm((p) => ({ ...p, auditorId: '', auditorName: '', auditorEmail: '' }));
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
                {showLeadDrop && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto">
                    {employees
                      .filter(
                        (e) =>
                          e.status === 'Active' &&
                          !assignForm.teamMembers.some((m) => m.id === e.id) &&
                          (!leadSearch || e.fullName?.toLowerCase().includes(leadSearch.toLowerCase())),
                      )
                      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''))
                      .slice(0, 8)
                      .map((emp) => (
                        <div
                          key={emp.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setAssignForm((p) => ({
                              ...p,
                              auditorId: emp.id,
                              auditorName: emp.fullName,
                              auditorEmail: emp.email || '',
                              teamMembers: p.teamMembers.filter((m) => m.id !== emp.id),
                            }));
                            setLeadSearch('');
                            setShowLeadDrop(false);
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer border-b border-gray-50 last:border-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {emp.fullName?.charAt(0)}
                          </div>
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
                    <div className="w-6 h-6 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {assignForm.auditorName?.charAt(0)}
                    </div>
                    <p className="text-xs text-[#1B6B6B] font-medium flex-1">{assignForm.auditorName} — Lead Auditor</p>
                    <button
                      type="button"
                      onClick={() => setAssignForm((p) => ({ ...p, auditorId: '', auditorName: '', auditorEmail: '' }))}
                      className="text-[#1B6B6B]/40 hover:text-[#1B6B6B]"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              <div ref={teamRef} className="relative">
                <label className="text-xs text-gray-500 block mb-1.5">Team Members (optional)</label>
                <input
                  type="text"
                  value={teamSearch}
                  placeholder="Add team members..."
                  onChange={(e) => {
                    setTeamSearch(e.target.value);
                    setShowTeamDrop(true);
                  }}
                  onFocus={() => setShowTeamDrop(true)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
                {showTeamDrop && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto">
                    {employees
                      .filter(
                        (e) =>
                          e.status === 'Active' &&
                          e.id !== assignForm.auditorId &&
                          !assignForm.teamMembers.some((m) => m.id === e.id) &&
                          (!teamSearch || e.fullName?.toLowerCase().includes(teamSearch.toLowerCase())),
                      )
                      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''))
                      .slice(0, 8)
                      .map((emp) => (
                        <div
                          key={emp.id}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setAssignForm((p) => ({
                              ...p,
                              teamMembers: [
                                ...p.teamMembers,
                                {
                                  id: emp.id,
                                  fullName: emp.fullName,
                                  email: emp.email || '',
                                  designation: emp.designation || emp.department || '',
                                },
                              ],
                            }));
                            setTeamSearch('');
                            setShowTeamDrop(false);
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer border-b border-gray-50 last:border-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {emp.fullName?.charAt(0)}
                          </div>
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
                        <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {m.fullName?.charAt(0)}
                        </div>
                        <p className="text-xs font-medium text-gray-700 flex-1 truncate">{m.fullName}</p>
                        <span className="text-xs text-gray-400">Member</span>
                        <button
                          type="button"
                          onClick={() => setAssignForm((p) => ({ ...p, teamMembers: p.teamMembers.filter((x) => x.id !== m.id) }))}
                          className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-300 hover:text-red-500"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {(assignForm.auditorId || assignForm.teamMembers.length > 0) && (
                  <div className="mt-2 p-2.5 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-500">
                      👥 Team of <strong>{1 + assignForm.teamMembers.length}</strong> — {assignForm.auditorName}
                      {assignForm.teamMembers.length > 0 &&
                        ` + ${assignForm.teamMembers.map((m) => m.fullName.split(' ')[0]).join(', ')}`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={assignForm.startDate}
                  onChange={(e) => setAssignForm((p) => ({ ...p, startDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">End Date *</label>
                <input
                  type="date"
                  value={assignForm.endDate}
                  onChange={(e) => setAssignForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Notes for Auditor (optional)</label>
            <textarea
              value={assignForm.notes}
              onChange={(e) => setAssignForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              placeholder="Special instructions..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50/50 flex-shrink-0">
          {assignForm.auditTypeId && assignForm.auditorId && (
            <div className="mb-3 p-3 bg-[#E8F5F5] rounded-xl">
              <p className="text-xs text-[#1B6B6B] font-medium">
                📋 {auditTypes.find((t) => t.id === assignForm.auditTypeId)?.name} → {assignForm.auditorName}
                {assignForm.branch && ` · ${assignForm.branch}`}
                {assignForm.endDate && ` · Ends ${formatDate(assignForm.endDate)}`}
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving || !assignForm.auditTypeId || !assignForm.auditorId || !assignForm.endDate}
              className="flex-[2] min-w-0 px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-40"
            >
              {saving ? 'Assigning...' : '+ Assign Audit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function AuditDetail({ audit, companyId, currentUser, employees, onClose, showSuccess, showError, userRole, isAuditor, canManage }) {
  if (!audit || !audit.id) return null;
  const [activeTab, setActiveTab] = useState('checklist');
  const [auditorStep, setAuditorStep] = useState('checklist'); // checklist | findings
  const [checklistReview, setChecklistReview] = useState(() => audit.checklistReview || []);
  const [findings, setFindings] = useState(() => audit.findings || []);
  const [adminNotes, setAdminNotes] = useState(() => audit.adminNotes || '');
  const saveTimeoutRef = useRef(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeFeedback, setCloseFeedback] = useState('');
  const [auditRating, setAuditRating] = useState(0);
  const [newFinding, setNewFinding] = useState({
    description: '',
    severity: 'Medium',
    ownerName: '',
    ownerId: '',
    ownerEmail: '',
    targetDate: '',
  });
  const [showAddFinding, setShowAddFinding] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [showOwnerDrop, setShowOwnerDrop] = useState(false);
  const ownerRef = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (ownerRef.current && !ownerRef.current.contains(e.target)) setShowOwnerDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    setChecklistReview(Array.isArray(audit.checklistReview) ? audit.checklistReview : []);
    setFindings(Array.isArray(audit.findings) ? audit.findings : []);
    setAdminNotes(audit.adminNotes || '');
    setActiveTab('checklist');
    setAuditorStep('checklist');
    setShowSubmitConfirm(false);
    setShowCloseModal(false);
    setCloseFeedback('');
    setAuditRating(0);
  }, [audit.id]);

  const st = effStatus(audit.status);
  const isClosed = audit.status === 'Closed';
  const isUnderReview = st === 'Under Review';
  const managerCanAct = canManage && isUnderReview;
  const findingsData = findings || [];
  const teamMembers = audit.teamMembers || [];
  const openFindings = findingsData.filter((f) => f.status !== 'Resolved');
  const resolvedFindings = findingsData.filter((f) => f.status === 'Resolved');

  const passCount = checklistReview.filter((i) => i.result === 'pass').length;
  const failCount = checklistReview.filter((i) => i.result === 'fail').length;
  const naCount = checklistReview.filter((i) => i.result === 'na').length;
  const totalItems = checklistReview.length;
  const reviewedCount = passCount + failCount + naCount;
  const complianceScore = getAuditScore({ checklistReview });

  const checklistEditable =
    isAuditor &&
    !audit.checklistLocked &&
    !isClosed &&
    (st === 'Assigned' || st === 'In Progress' || st === 'Sent Back');

  const checklistReadOnlyDisplay = !checklistEditable;

  const isAuditorMode = checklistEditable;

  const MANAGER_TABS = [
    { id: 'checklist', label: '1. Review', count: totalItems },
    { id: 'findings', label: '2. Findings', count: findings.length },
    { id: 'overview', label: '3. Overview & Close' },
  ];

  const TABS = isAuditor
    ? [
        { id: 'checklist', label: 'Checklist', count: totalItems },
        { id: 'findings', label: 'Findings', count: findings.length },
      ]
    : canManage
      ? [
          { id: 'checklist', label: 'Review', count: totalItems },
          { id: 'findings', label: 'Findings', count: findings.length },
          { id: 'overview', label: 'Overview' },
        ]
      : [
          { id: 'checklist', label: 'Checklist', count: totalItems },
          { id: 'findings', label: 'Findings', count: findings.length },
          { id: 'overview', label: 'Overview' },
        ];

  const autoSave = useCallback(
    async (newChecklistReview, newFindings, newAdminNotes) => {
      if (isClosed) return;
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          setAutoSaving(true);
          const payload = {
            findings: newFindings,
            adminNotes: newAdminNotes,
            updatedAt: new Date(),
            updatedBy: currentUser?.email || '',
          };
          if (checklistEditable || !isAuditor) {
            payload.checklistReview = newChecklistReview;
          }
          await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), payload);
          setLastSaved(new Date());
        } catch (e) {
          console.error('Auto-save failed:', e);
        } finally {
          setAutoSaving(false);
        }
      }, 1000);
    },
    [audit.id, companyId, currentUser, isClosed, checklistEditable, isAuditor],
  );

  useEffect(() => () => clearTimeout(saveTimeoutRef.current), []);

  const updateChecklistItem = (id, result) => {
    if (!checklistEditable) return;
    const updated = checklistReview.map((i) => (i.id === id ? { ...i, result } : i));
    setChecklistReview(updated);
    if (effStatus(audit.status) === 'Assigned') {
      updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        status: 'In Progress',
        updatedAt: new Date(),
        updatedBy: currentUser?.email || '',
      }).catch(() => {});
    }
    autoSave(updated, findingsData, adminNotes);
  };

  const updateChecklistNote = (id, note) => {
    if (!checklistEditable) return;
    const updated = checklistReview.map((i) => (i.id === id ? { ...i, note } : i));
    setChecklistReview(updated);
    autoSave(updated, findingsData, adminNotes);
  };

  const addFinding = () => {
    if (!newFinding.description.trim()) {
      showError('Enter finding description');
      return;
    }
    const addedByRole = getFindingAddedByRole(userRole);
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
      resolvedNote: '',
      addedBy: (currentUser?.email || '').toLowerCase(),
      addedByRole,
      addedByName: currentUser?.displayName || currentUser?.email || (addedByRole === 'auditor' ? 'Auditor' : 'Audit Manager'),
      createdAt: new Date().toISOString(),
    };
    const newFindings = [...findingsData, finding];
    setFindings(newFindings);
    autoSave(checklistReview, newFindings, adminNotes);
    setNewFinding({ description: '', severity: 'Medium', ownerName: '', ownerId: '', ownerEmail: '', targetDate: '' });
    setOwnerSearch('');
    setShowAddFinding(false);
  };

  const updateFindingStatus = (id, newStatus) => {
    const updated = findingsData.map((f) =>
        f.id === id
          ? {
              ...f,
              status: newStatus,
              ...(newStatus === 'Resolved' && { resolvedAt: new Date().toISOString() }),
            }
          : f,
      );
    setFindings(updated);
    autoSave(checklistReview, updated, adminNotes);
  };

  const deleteFinding = (id) => {
    const finding = (findingsData || []).find((f) => f.id === id);
    if (!finding || isClosed) return;
    const canDeleteFinding = (() => {
      if (isAuditorMode) {
        return (
          finding.addedByRole === 'auditor' &&
          (finding.addedBy || '').toLowerCase() === (currentUser?.email || '').toLowerCase()
        );
      }
      if (canManage) {
        return finding.addedByRole === 'auditmanager';
      }
      return false;
    })();
    if (!canDeleteFinding) return;
    const updated = findingsData.filter((f) => f.id !== id);
    setFindings(updated);
    autoSave(checklistReview, updated, adminNotes);
  };

  const canAddFinding = (isAuditor && checklistEditable) || (canManage && !isClosed);

  const canManageFindings = canManage && isUnderReview;

  const handleSubmit = async () => {
    const unfilled = checklistReview.filter((i) => !i.result);
    if (unfilled.length > 0) {
      showError(`Fill all ${unfilled.length} checklist item${unfilled.length !== 1 ? 's' : ''} before submitting`);
      return;
    }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        checklistReview,
        findings: findingsData,
        adminNotes,
        status: 'Submitted',
        submittedAt: new Date(),
        submittedBy: currentUser?.email || '',
        checklistLocked: true,
        updatedAt: new Date(),
        updatedBy: currentUser?.email || '',
      });

      showSuccess('Audit submitted!');
      setShowSubmitConfirm(false);
      onClose();
    } catch (e) {
      showError(`Submit failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkUnderReview = async () => {
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        status: 'Under Review',
        reviewStartedAt: new Date(),
        reviewStartedBy: currentUser?.email || '',
        updatedAt: new Date(),
      });
      showSuccess('Audit under review');
      onClose();
    } catch (e) {
      showError('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseAudit = async () => {
    const openF = (findingsData || []).filter((f) => f.status !== 'Resolved');
    if (openF.length > 0) {
      showError(`Resolve all ${openF.length} finding${openF.length !== 1 ? 's' : ''} first`);
      return;
    }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        status: 'Closed',
        closedAt: new Date(),
        closedBy: currentUser?.email || '',
        managerNotes: adminNotes,
        auditRating,
        closeFeedback: closeFeedback.trim(),
        updatedAt: new Date(),
      });

      showSuccess('Audit closed!');
      setShowCloseModal(false);
      onClose();
    } catch (e) {
      showError('Failed to close audit');
    } finally {
      setSaving(false);
    }
  };

  const handleSendBack = async () => {
    if (!sendBackReason.trim()) {
      showError('Add a reason for sending back');
      return;
    }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        status: 'Sent Back',
        sentBackAt: new Date(),
        sentBackBy: currentUser?.email || '',
        sentBackReason: sendBackReason.trim(),
        checklistLocked: false,
        updatedAt: new Date(),
      });

      showSuccess('Audit sent back to auditor');
      setShowSendBackModal(false);
      setSendBackReason('');
      onClose();
    } catch (e) {
      showError('Failed to send back');
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    isAuditor &&
    (st === 'Assigned' || st === 'In Progress' || st === 'Sent Back') &&
    totalItems > 0 &&
    reviewedCount === totalItems;

  const approvedCount = checklistReview.filter((i) => i.managerApproval).length;

  const updateManagerApproval = (id, approval) => {
    if (!canManage || isAuditorMode) return;
    const updated = checklistReview.map((i) => (i.id === id ? { ...i, managerApproval: approval } : i));
    setChecklistReview(updated);
    autoSave(updated, findingsData, adminNotes);
  };

  const updateManagerNote = (id, note) => {
    if (!canManage || isAuditorMode) return;
    const updated = checklistReview.map((i) => (i.id === id ? { ...i, managerNote: note } : i));
    setChecklistReview(updated);
    autoSave(updated, findingsData, adminNotes);
  };

  const sections = [...new Set(checklistReview.map((i) => i.section))];
  const handlePrint = () => {
    const currentChecklist = checklistReview;
    const currentFindings = findings;
    const currentNotes = adminNotes;
    const score = getAuditScore({ checklistReview: currentChecklist });
    const passItems = currentChecklist.filter((i) => i.result === 'pass');
    const failItems = currentChecklist.filter((i) => i.result === 'fail');
    const naItems = currentChecklist.filter((i) => i.result === 'na');
    const sectionsForPrint = [...new Set(currentChecklist.map((i) => i.section))];
    const html = `<!DOCTYPE html><html><head><title>Audit Report — ${audit.auditRefId}</title></head><body>
    <h2>${audit.auditTypeName}</h2><p>${audit.auditRefId || '—'}</p>
    <p>${formatDate(audit.startDate)} - ${formatDate(audit.endDate)}</p>
    <p>Score: ${score !== null ? `${score}%` : '—'} | Pass: ${passItems.length} | Fail: ${failItems.length} | N/A: ${naItems.length}</p>
    ${sectionsForPrint.map((section) => `<h3>${section}</h3>${currentChecklist.filter((i) => i.section === section).map((item) => `<p>${item.question} — ${item.result || '—'} ${item.note || ''}</p>`).join('')}`).join('')}
    ${currentFindings.length > 0 ? `<h3>Findings</h3>${currentFindings.map((f) => `<p>${f.description} (${f.severity || 'Medium'}) - ${f.status || 'Open'}</p>`).join('')}` : ''}
    ${audit.auditRating ? `
      <h3>⭐ Manager Feedback</h3>
      <div style="padding: 12px; background: #fffbeb; border-radius: 8px; border: 1px solid #fde68a;">
        <div style="font-size: 20px; margin-bottom: 6px;">
          ${'⭐'.repeat(audit.auditRating)}${'☆'.repeat(5 - audit.auditRating)}
          <span style="font-size: 13px; color: #92400e; font-weight: 600; margin-left: 8px;">
            ${['','Poor','Fair','Good','Very Good','Excellent'][audit.auditRating]} (${audit.auditRating}/5)
          </span>
        </div>
        ${audit.closeFeedback ? `<p style="font-size: 12px; color: #78350f; font-style: italic;">"${audit.closeFeedback}"</p>` : ''}
        <p style="font-size: 11px; color: #92400e; margin-top: 4px;">Reviewed by ${audit.closedBy || '—'}</p>
      </div>
    ` : ''}
    ${currentNotes ? `<h3>Admin Notes</h3><p>${currentNotes}</p>` : ''}
    </body></html>`;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      showError('Popup blocked. Allow popups for this site to print.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl">
        {isAuditorMode && (
          <div className="flex items-center gap-0 mb-1 px-6 pt-4 flex-shrink-0">
            {[
              { id: 'checklist', label: 'Checklist', num: 1 },
              { id: 'findings', label: 'Findings', num: 2 },
            ].map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      auditorStep === step.id || (step.id === 'checklist' && auditorStep === 'findings')
                        ? 'bg-[#1B6B6B] text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {step.num}
                  </div>
                  <span className={`text-xs font-medium ${auditorStep === step.id ? 'text-[#1B6B6B]' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
                {idx === 0 && <div className="flex-1 h-px bg-gray-200 mx-3" />}
              </div>
            ))}
          </div>
        )}
        <div className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-mono font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{audit.auditRefId}</span>
                <h2 className="text-base font-semibold text-gray-800">{audit.auditTypeName}</h2>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusMeta(audit.status).badge}`}
                >
                  {statusMeta(audit.status).icon} {st}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                {audit.branch && <span>🏢 {audit.branch}</span>}
                {audit.location && <span>📍 {audit.location}</span>}
                {audit.auditorName && (
                  <span>
                    👤 {audit.auditorName}
                    {(teamMembers.length || 0) > 0 && ` +${teamMembers.length}`}
                  </span>
                )}
                {audit.endDate && <span>📅 Due {formatDate(audit.endDate)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-2 shrink-0">
              <div className="flex items-center gap-2">
                {autoSaving && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <span className="w-3 h-3 border border-gray-300 border-t-[#1B6B6B] rounded-full animate-spin inline-block" />
                    Saving...
                  </span>
                )}
                {!autoSaving && lastSaved && !isClosed && (
                  <span className="text-xs text-gray-400">✓ Saved</span>
                )}
              </div>
              <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 flex-shrink-0">
                ✕
              </button>
            </div>
          </div>

          {st === 'Sent Back' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-3">
              <p className="text-sm font-semibold text-red-700 mb-1">↩ Sent back for corrections</p>
              {audit.sentBackReason && (
                <p className="text-xs text-red-600">Manager note: {audit.sentBackReason}</p>
              )}
            </div>
          )}

          {totalItems > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-gray-400">Checklist review</p>
                <p className="text-xs font-medium text-gray-600">
                  {reviewedCount}/{totalItems} reviewed
                  {passCount > 0 && ` · ${passCount} pass`}
                  {failCount > 0 && ` · ${failCount} fail`}
                </p>
              </div>
              {canManage && approvedCount > 0 && (
                <p className="text-xs text-gray-400 mt-1">Manager reviewed: {approvedCount}/{totalItems} items</p>
              )}
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-green-400 transition-all" style={{ width: totalItems > 0 ? `${(passCount / totalItems) * 100}%` : '0%' }} />
                <div className="h-full bg-red-400 transition-all" style={{ width: totalItems > 0 ? `${(failCount / totalItems) * 100}%` : '0%' }} />
                <div className="h-full bg-gray-300 transition-all" style={{ width: totalItems > 0 ? `${(naCount / totalItems) * 100}%` : '0%' }} />
              </div>
              <div className="flex gap-3 mt-1 flex-wrap">
                {passCount > 0 && <span className="text-xs text-green-600">● {passCount} Pass</span>}
                {failCount > 0 && <span className="text-xs text-red-500">● {failCount} Fail</span>}
                {naCount > 0 && <span className="text-xs text-gray-400">● {naCount} N/A</span>}
              </div>
            </div>
          )}

          {!isAuditorMode && (
            <div className="flex gap-1 mt-3 flex-wrap">
              {(canManage && isUnderReview ? MANAGER_TABS : TABS).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-colors ${
                    activeTab === tab.id ? 'bg-[#E8F5F5] text-[#1B6B6B]' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span
                      className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                        activeTab === tab.id ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {((isAuditorMode && auditorStep === 'checklist') || (!isAuditorMode && activeTab === 'checklist')) && (
            <div className="space-y-5">
              {canManage && !isUnderReview && !isClosed && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
                  <span className="text-blue-500">ℹ️</span>
                  <p className="text-xs text-blue-700">
                    Checklist is read-only. Click &quot;Start Review&quot; in the Audits list to begin reviewing this audit.
                  </p>
                </div>
              )}
              {checklistReview.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm text-gray-500">No checklist items in this template</p>
                </div>
              ) : (
                sections.map((section) => (
                  <div key={section}>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">{section}</h4>
                    <div className="space-y-3">
                      {checklistReview
                        .filter((i) => i.section === section)
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`p-4 rounded-xl border ${
                              item.result === 'pass'
                                ? 'bg-green-50 border-green-100'
                                : item.result === 'fail'
                                  ? 'bg-red-50 border-red-100'
                                  : item.result === 'na'
                                    ? 'bg-gray-50 border-gray-100'
                                    : 'bg-white border-gray-100'
                            }`}
                          >
                            {checklistReadOnlyDisplay ? (
                              <div className="flex items-start gap-3">
                                <span
                                  className={`text-xs px-2 py-1 rounded-lg font-bold flex-shrink-0 mt-0.5 ${
                                    item.result === 'pass'
                                      ? 'bg-green-200 text-green-800'
                                      : item.result === 'fail'
                                        ? 'bg-red-200 text-red-800'
                                        : item.result === 'na'
                                          ? 'bg-gray-200 text-gray-600'
                                          : 'bg-gray-100 text-gray-400'
                                  }`}
                                >
                                  {item.result === 'pass'
                                    ? '✅ Pass'
                                    : item.result === 'fail'
                                      ? '❌ Fail'
                                      : item.result === 'na'
                                        ? '⏭ N/A'
                                        : '— N/R'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800">{item.question}</p>
                                  {item.note && (
                                    <p className="text-xs text-gray-500 mt-1 italic">&quot;{item.note}&quot;</p>
                                  )}
                                </div>
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                                    item.riskLevel === 'Critical'
                                      ? 'bg-red-100 text-red-600'
                                      : item.riskLevel === 'High'
                                        ? 'bg-orange-100 text-orange-600'
                                        : item.riskLevel === 'Medium'
                                          ? 'bg-amber-100 text-amber-600'
                                          : 'bg-green-100 text-green-600'
                                  }`}
                                >
                                  {item.riskLevel || 'Med'}
                                </span>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-2 mb-3">
                                  <p className="text-sm font-medium text-gray-800 flex-1">{item.question}</p>
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                      item.riskLevel === 'Critical'
                                        ? 'bg-red-100 text-red-700'
                                        : item.riskLevel === 'High'
                                          ? 'bg-orange-100 text-orange-700'
                                          : item.riskLevel === 'Medium'
                                            ? 'bg-amber-100 text-amber-700'
                                            : 'bg-green-100 text-green-700'
                                    }`}
                                  >
                                    {item.riskLevel || 'Medium'}
                                  </span>
                                </div>
                                <div className="flex gap-2 mb-2 flex-wrap">
                                  {[
                                    { val: 'pass', label: '✅ Pass', active: 'bg-green-500 text-white border-green-500', def: 'bg-white border-gray-200 text-gray-500 hover:bg-green-50 hover:border-green-200' },
                                    { val: 'fail', label: '❌ Fail', active: 'bg-red-500 text-white border-red-500', def: 'bg-white border-gray-200 text-gray-500 hover:bg-red-50 hover:border-red-200' },
                                    { val: 'na', label: '⏭ N/A', active: 'bg-gray-500 text-white border-gray-500', def: 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100' },
                                  ].map((opt) => (
                                    <button
                                      key={opt.val}
                                      type="button"
                                      disabled={isClosed}
                                      onClick={() => updateChecklistItem(item.id, item.result === opt.val ? null : opt.val)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                        item.result === opt.val ? opt.active : opt.def
                                      } ${isClosed ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                                <input
                                  value={item.note || ''}
                                  disabled={isClosed}
                                  onChange={(e) => updateChecklistNote(item.id, e.target.value)}
                                  placeholder="Note or observation (optional)..."
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#1B6B6B] disabled:bg-gray-50 bg-white/80"
                                />
                              </>
                            )}
                            {managerCanAct && (
                              <div className="mt-2 pt-2 border-t border-gray-100">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-400">Manager review:</span>
                                  <button
                                    type="button"
                                    onClick={() => updateManagerApproval(item.id, item.managerApproval === 'approved' ? null : 'approved')}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                                      item.managerApproval === 'approved'
                                        ? 'bg-green-500 text-white border-green-500'
                                        : 'bg-white text-gray-400 border-gray-200 hover:bg-green-50 hover:border-green-200 hover:text-green-700'
                                    }`}
                                  >
                                    ✅ Approved
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateManagerApproval(item.id, item.managerApproval === 'concern' ? null : 'concern')}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                                      item.managerApproval === 'concern'
                                        ? 'bg-amber-500 text-white border-amber-500'
                                        : 'bg-white text-gray-400 border-gray-200 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700'
                                    }`}
                                  >
                                    ⚠️ Concern
                                  </button>
                                </div>
                                {item.managerApproval && (
                                  <input
                                    value={item.managerNote || ''}
                                    onChange={(e) => updateManagerNote(item.id, e.target.value)}
                                    placeholder="Add note (optional)..."
                                    className="mt-2 w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#1B6B6B] bg-white"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {((isAuditorMode && auditorStep === 'findings') || (!isAuditorMode && activeTab === 'findings')) && (
            <div className="space-y-4">
              {!isClosed && (isAuditorMode ? canAddFinding : managerCanAct) && (
                <button
                  type="button"
                  onClick={() => setShowAddFinding(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors"
                >
                  + Add Finding
                </button>
              )}
              {!isClosed && canManage && !isUnderReview && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center">
                  <p className="text-xs text-gray-400">
                    Click &quot;Start Review&quot; to add findings and manage this audit
                  </p>
                </div>
              )}

              {showAddFinding && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                  <p className="text-sm font-semibold text-gray-700">New Finding</p>
                  <textarea
                    value={newFinding.description}
                    onChange={(e) => setNewFinding((p) => ({ ...p, description: e.target.value }))}
                    rows={2}
                    placeholder="Describe the finding / non-compliance..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B] bg-white"
                  />
                  <div>
                    <label className="text-xs text-gray-400 block mb-1.5">Severity</label>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { v: 'Low', c: 'bg-green-50 border-green-200 text-green-700', a: 'bg-green-500 border-green-500 text-white' },
                        { v: 'Medium', c: 'bg-amber-50 border-amber-200 text-amber-700', a: 'bg-amber-500 border-amber-500 text-white' },
                        { v: 'High', c: 'bg-orange-50 border-orange-200 text-orange-700', a: 'bg-orange-500 border-orange-500 text-white' },
                        { v: 'Critical', c: 'bg-red-50 border-red-200 text-red-700', a: 'bg-red-500 border-red-500 text-white' },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setNewFinding((p) => ({ ...p, severity: opt.v }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            newFinding.severity === opt.v ? opt.a : `${opt.c} hover:opacity-80`
                          }`}
                        >
                          {opt.v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div ref={ownerRef} className="relative">
                    <label className="text-xs text-gray-400 block mb-1">Assign Owner to Fix</label>
                    <input
                      type="text"
                      value={newFinding.ownerName || ownerSearch}
                      placeholder="Search employee..."
                      onChange={(e) => {
                        setOwnerSearch(e.target.value);
                        setShowOwnerDrop(true);
                        if (!e.target.value) {
                          setNewFinding((p) => ({ ...p, ownerName: '', ownerId: '', ownerEmail: '' }));
                        }
                      }}
                      onFocus={() => {
                        setOwnerSearch('');
                        setShowOwnerDrop(true);
                        setNewFinding((p) => ({ ...p, ownerName: '', ownerId: '', ownerEmail: '' }));
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] bg-white"
                    />
                    {showOwnerDrop && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-40 overflow-y-auto">
                        {(employees || [])
                          .filter((e) => e.status === 'Active' && (!ownerSearch || e.fullName?.toLowerCase().includes(ownerSearch.toLowerCase())))
                          .slice(0, 6)
                          .map((emp) => (
                            <div
                              key={emp.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setNewFinding((p) => ({
                                  ...p,
                                  ownerName: emp.fullName,
                                  ownerId: emp.id,
                                  ownerEmail: emp.email || '',
                                }));
                                setOwnerSearch('');
                                setShowOwnerDrop(false);
                              }}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
                            >
                              <div className="w-6 h-6 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {emp.fullName?.charAt(0)}
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-800">{emp.fullName}</p>
                                {emp.designation && <p className="text-xs text-gray-400">{emp.designation}</p>}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                    {newFinding.ownerName && <p className="text-xs text-green-600 mt-1">✓ {newFinding.ownerName}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Target Fix Date</label>
                    <input
                      type="date"
                      value={newFinding.targetDate}
                      onChange={(e) => setNewFinding((p) => ({ ...p, targetDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B] bg-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddFinding(false);
                        setNewFinding({ description: '', severity: 'Medium', ownerName: '', ownerId: '', ownerEmail: '', targetDate: '' });
                        setOwnerSearch('');
                      }}
                      className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600"
                    >
                      Cancel
                    </button>
                    <button type="button" onClick={addFinding} className="flex-1 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]">
                      Add Finding
                    </button>
                  </div>
                </div>
              )}

              {findingsData.length === 0 && !showAddFinding ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-sm font-medium text-gray-600">No findings</p>
                  <p className="text-xs text-gray-400 mt-1">Add findings from the audit report</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {findingsData.map((finding) => {
                    const now = new Date();
                    const isOverdueFinding =
                      finding.targetDate && finding.status !== 'Resolved' && new Date(finding.targetDate) < now;
                    return (
                      <div
                        key={finding.id}
                        className={`border rounded-xl p-4 transition-all ${
                          finding.status === 'Resolved'
                            ? 'bg-green-50 border-green-100'
                            : isOverdueFinding
                              ? 'bg-red-50 border-red-200'
                              : 'bg-white border-gray-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-gray-800 flex-1">{finding.description}</p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                finding.severity === 'Critical'
                                  ? 'bg-red-100 text-red-700'
                                  : finding.severity === 'High'
                                    ? 'bg-orange-100 text-orange-700'
                                    : finding.severity === 'Medium'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {finding.severity}
                            </span>
                            {!isClosed &&
                              (() => {
                                const canDeleteFinding = (() => {
                                  if (isAuditorMode) {
                                    return (
                                      finding.addedByRole === 'auditor' &&
                                      (finding.addedBy || '').toLowerCase() === (currentUser?.email || '').toLowerCase()
                                    );
                                  }
                                  if (canManage) {
                                    return finding.addedByRole === 'auditmanager';
                                  }
                                  return false;
                                })();
                                if (!canDeleteFinding) return null;
                                return (
                              <button
                                type="button"
                                onClick={() => deleteFinding(finding.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-300 hover:text-red-500"
                              >
                                ✕
                              </button>
                                );
                              })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              finding.addedByRole === 'auditor'
                                ? 'bg-teal-100 text-teal-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {finding.addedByRole === 'auditor' ? '👷 Auditor' : '🧑‍💼 Audit Manager'}
                          </span>
                          <span className="text-xs text-gray-400">{finding.addedByName || '—'}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap mb-3">
                          {finding.ownerName && <span className="text-xs text-gray-500">👤 {finding.ownerName}</span>}
                          {finding.targetDate && (
                            <span className={`text-xs font-medium ${isOverdueFinding ? 'text-red-600' : 'text-gray-500'}`}>
                              {isOverdueFinding ? '⚠️ ' : '📅 '}
                              {formatDate(finding.targetDate)}
                            </span>
                          )}
                        </div>
                        {!isClosed && canManageFindings && (
                          <div className="flex gap-2 flex-wrap">
                            {['Open', 'In Progress', 'Resolved'].map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => updateFindingStatus(finding.id, s)}
                                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                                  finding.status === s
                                    ? s === 'Resolved'
                                      ? 'bg-green-500 text-white border-green-500'
                                      : s === 'In Progress'
                                        ? 'bg-blue-500 text-white border-blue-500'
                                        : 'bg-gray-700 text-white border-gray-700'
                                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                                }`}
                              >
                                {s === 'Resolved' ? '✅ Resolved' : s === 'In Progress' ? '🔄 In Progress' : '⭕ Open'}
                              </button>
                            ))}
                          </div>
                        )}
                        {isClosed && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              finding.status === 'Resolved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {finding.status}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!isAuditorMode && activeTab === 'overview' && (
            <div className="space-y-4">
              {totalItems > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Pass', count: passCount, color: 'bg-green-50 border-green-100', text: 'text-green-700', icon: '✅' },
                    { label: 'Fail', count: failCount, color: 'bg-red-50 border-red-100', text: 'text-red-700', icon: '❌' },
                    { label: 'N/A', count: naCount, color: 'bg-gray-50 border-gray-100', text: 'text-gray-600', icon: '⏭' },
                  ].map((s) => (
                    <div key={s.label} className={`border rounded-xl p-4 text-center ${s.color}`}>
                      <p className="text-xl mb-1">{s.icon}</p>
                      <p className={`text-2xl font-bold ${s.text}`}>{s.count}</p>
                      <p className={`text-xs mt-0.5 ${s.text}`}>{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
              {complianceScore !== null && (
                <div className={`p-4 border rounded-xl text-center ${
                  complianceScore >= 80 ? 'bg-green-50 border-green-100' : complianceScore >= 60 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'
                }`}>
                  <p className={`text-4xl font-bold ${complianceScore >= 80 ? 'text-green-600' : complianceScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{complianceScore}%</p>
                  <p className="text-xs text-gray-400 mt-1">Compliance Score</p>
                </div>
              )}

              <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Audit Details</p>
                {[
                  { l: 'Reference', v: audit.auditRefId },
                  { l: 'Template', v: audit.auditTypeName },
                  { l: 'Category', v: audit.auditCategory },
                  { l: 'Risk Level', v: audit.riskLevel },
                  { l: 'Branch', v: audit.branch },
                  { l: 'Location', v: audit.location },
                  { l: 'Department', v: audit.department },
                  { l: 'Lead Auditor', v: audit.auditorName },
                  { l: 'Start Date', v: audit.startDate ? formatDate(audit.startDate) : '' },
                  { l: 'End Date', v: audit.endDate ? formatDate(audit.endDate) : '' },
                ]
                  .filter((r) => r.v)
                  .map((row) => (
                    <div key={row.l} className="flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-400">{row.l}</p>
                      <p className="text-xs font-medium text-gray-700 text-right">{row.v}</p>
                    </div>
                  ))}
              </div>

              {(teamMembers.length > 0) && (
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Audit Team</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold">
                        {audit.auditorName?.charAt(0)}
                      </div>
                      <p className="text-sm text-gray-700 flex-1">{audit.auditorName}</p>
                      <span className="text-xs bg-[#E8F5F5] text-[#1B6B6B] px-2 py-0.5 rounded-full font-medium">Lead</span>
                    </div>
                    {teamMembers.map((m) => (
                      <div key={m.id} className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-bold">{m.fullName?.charAt(0)}</div>
                        <p className="text-sm text-gray-700 flex-1">{m.fullName}</p>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Member</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {findingsData.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Findings Summary</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: 'Total', v: findingsData.length, c: 'text-gray-700' },
                      { l: 'Open', v: openFindings.length, c: openFindings.length > 0 ? 'text-red-600' : 'text-gray-700' },
                      { l: 'Resolved', v: resolvedFindings.length, c: 'text-green-600' },
                    ].map((s) => (
                      <div key={s.l} className="text-center bg-gray-50 rounded-xl p-3">
                        <p className={`text-xl font-bold ${s.c}`}>{s.v}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{s.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {audit.status === 'Closed' && audit.auditRating && (
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Manager Feedback</p>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`text-xl ${n <= audit.auditRating ? 'text-amber-400' : 'text-gray-200'}`}>
                          ⭐
                        </span>
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][audit.auditRating]}
                    </span>
                    <span className="text-xs text-gray-400">({audit.auditRating}/5)</span>
                  </div>
                  {audit.closeFeedback && (
                    <p className="text-sm text-gray-600 italic bg-gray-50 rounded-xl px-3 py-2.5">
                      &quot;{audit.closeFeedback}&quot;
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Reviewed by {audit.closedBy || '—'} ·{' '}
                    {audit.closedAt?.toDate
                      ? audit.closedAt.toDate().toLocaleDateString('en-GB')
                      : audit.closedAt
                        ? new Date(audit.closedAt).toLocaleDateString('en-GB')
                        : ''}
                  </p>
                </div>
              )}

              {canManage && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Manager notes</label>
                  <textarea
                    value={adminNotes}
                    disabled={isClosed}
                    onChange={(e) => {
                      setAdminNotes(e.target.value);
                      autoSave(checklistReview, findingsData, e.target.value);
                    }}
                    rows={3}
                    placeholder="Internal notes about this audit..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B] disabled:bg-gray-50"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex-shrink-0">
          {isClosed ? (
            <div className="space-y-2">
              <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-center">
                <p className="text-xs font-medium text-green-700">
                  ✅ Audit closed{audit.closedBy && ` by ${audit.closedBy}`}
                </p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">
                  Close
                </button>
                <button type="button" onClick={handlePrint} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858]">
                  🖨️ Print Report
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {isAuditorMode && (
                <div className="flex gap-3">
                  {auditorStep === 'checklist' ? (
                    <>
                      <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const unfilled = checklistReview.filter((i) => !i.result);
                          if (unfilled.length > 0) {
                            showError(`Fill all ${unfilled.length} items before continuing`);
                            return;
                          }
                          setAuditorStep('findings');
                        }}
                        className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold"
                      >
                        Next: Findings →
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setAuditorStep('checklist')}
                        className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600"
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSubmitConfirm(true)}
                        className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold"
                      >
                        📤 Submit to Manager
                      </button>
                    </>
                  )}
                </div>
              )}
              {st === 'Submitted' && canManage && (
                <div className="flex gap-3 flex-wrap">
                  <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSendBackModal(true)}
                    className="flex-1 min-w-[120px] py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50"
                  >
                    ↩ Send Back
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkUnderReview}
                    disabled={saving}
                    className="flex-1 min-w-[120px] py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
                  >
                    👀 Start Review
                  </button>
                </div>
              )}
              {st === 'Under Review' && canManage && (
                <div className="space-y-2">
                  {activeTab !== 'overview' && (
                    <div className="flex gap-3 flex-wrap">
                      <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSendBackModal(true)}
                        className="flex-1 py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium"
                      >
                        ↩ Send Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('overview')}
                        className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold"
                      >
                        Overview →
                      </button>
                    </div>
                  )}

                  {activeTab === 'overview' && (
                    <div className="space-y-2">
                      {openFindings.length > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                          <p className="text-xs text-amber-700">
                            ⚠️ {openFindings.length} finding{openFindings.length !== 1 ? 's' : ''} still open — resolve before closing
                          </p>
                        </div>
                      )}
                      <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">
                          Close
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSendBackModal(true)}
                          className="flex-1 py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium"
                        >
                          ↩ Send Back
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (openFindings.length > 0) {
                              showError('Resolve all findings first');
                              return;
                            }
                            setShowCloseModal(true);
                          }}
                          disabled={openFindings.length > 0}
                          className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
                        >
                          ✅ Close Audit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!(st === 'Submitted' && canManage) && !(st === 'Under Review' && canManage) && !isAuditorMode && (
                <div className="flex gap-3">
                  <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                    Close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-[#E8F5F5] rounded-full flex items-center justify-center text-3xl mx-auto mb-3">📤</div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Submit Audit?</h3>
              <p className="text-sm text-gray-500">
                Once submitted, you cannot edit the checklist or findings. The audit will be sent to your manager for review.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Checklist items</span>
                <span className="font-medium">{checklistReview.length} reviewed</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">✅ Pass</span>
                <span className="font-medium text-green-600">{checklistReview.filter((i) => i.result === 'pass').length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">❌ Fail</span>
                <span className="font-medium text-red-600">{checklistReview.filter((i) => i.result === 'fail').length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Findings added</span>
                <span className="font-medium">{findings.filter((f) => f.addedByRole === 'auditor').length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Score</span>
                <span
                  className={`font-bold ${(getAuditScore({ checklistReview }) || 0) >= 80 ? 'text-green-600' : 'text-amber-600'}`}
                >
                  {getAuditScore({ checklistReview }) !== null ? `${getAuditScore({ checklistReview })}%` : '—'}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
              >
                {saving ? 'Submitting...' : '📤 Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseModal && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">✅ Close Audit</h3>
            <p className="text-sm text-gray-500 mb-5">
              {audit.auditRefId} — {audit.auditTypeName}
            </p>

            {getAuditScore({ checklistReview }) !== null && (
              <div
                className={`p-4 rounded-xl mb-5 text-center ${
                  (getAuditScore({ checklistReview }) || 0) >= 80
                    ? 'bg-green-50 border border-green-100'
                    : (getAuditScore({ checklistReview }) || 0) >= 60
                      ? 'bg-amber-50 border border-amber-100'
                      : 'bg-red-50 border border-red-100'
                }`}
              >
                <p
                  className={`text-3xl font-bold ${
                    (getAuditScore({ checklistReview }) || 0) >= 80
                      ? 'text-green-700'
                      : (getAuditScore({ checklistReview }) || 0) >= 60
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }`}
                >
                  {getAuditScore({ checklistReview })}%
                </p>
                <p className="text-xs text-gray-500 mt-1">Compliance Score</p>
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Rate this Audit</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAuditRating(n)}
                    className={`flex-1 py-3 rounded-xl text-xl transition-all border-2 ${
                      auditRating >= n ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-100 hover:border-amber-200'
                    }`}
                  >
                    ⭐
                  </button>
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-400">Poor</span>
                <span className="text-xs text-gray-400">Excellent</span>
              </div>
              {auditRating > 0 && (
                <p className="text-xs text-center text-amber-600 font-medium mt-1">
                  {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][auditRating]}
                </p>
              )}
            </div>

            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                Final Comments (optional)
              </label>
              <textarea
                value={closeFeedback}
                onChange={(e) => setCloseFeedback(e.target.value)}
                rows={3}
                placeholder="Overall observations, recommendations, or notes for this audit..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCloseModal(false);
                  setAuditRating(0);
                  setCloseFeedback('');
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseAudit}
                disabled={saving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Closing...' : '✅ Close Audit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSendBackModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-gray-800 mb-2">↩ Send Back for Corrections</h3>
            <p className="text-sm text-gray-500 mb-4">The auditor will see this reason and must resubmit after corrections.</p>
            <textarea
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              rows={3}
              placeholder="Reason for sending back..."
              className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-red-400 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSendBackModal(false);
                  setSendBackReason('');
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendBack}
                disabled={!sendBackReason.trim() || saving}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Sending…' : '↩ Send Back'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditTableRow({
  audit,
  overdueAudit,
  openFindings,
  totalFindings,
  companyId,
  userRole,
  isAuditor,
  canManage,
  isAdmin,
  currentUser,
  showSuccess,
  onOpen,
  onDelete,
  showError,
}) {
  const [status, setStatus] = useState(audit.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(audit.status);
  }, [audit.id, audit.status]);

  const saveChanges = async (newStatus) => {
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        status: newStatus,
        updatedAt: new Date(),
        ...(newStatus === 'Closed' &&
          !audit.closedAt && {
            closedAt: new Date(),
          }),
      });
    } catch (e) {
      showError('Failed to save');
      setStatus(audit.status);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (newStatus === 'Closed') {
      const openF = (audit.findings || []).filter((f) => f.status !== 'Resolved');
      if (openF.length > 0) {
        showError(`Resolve all ${openF.length} finding${openF.length !== 1 ? 's' : ''} first`);
        return;
      }
    }
    setStatus(newStatus);
    await saveChanges(newStatus);
  };

  const eff = effStatus(status);

  return (
    <div
      onClick={onOpen}
      className={`grid grid-cols-[2fr_1fr_1fr_1fr_160px_80px_80px_40px] gap-3 px-4 py-3.5 items-center hover:bg-gray-50/80 transition-colors group cursor-pointer ${
        overdueAudit ? 'bg-red-50/30 hover:bg-red-50/60' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-2 h-8 rounded-full flex-shrink-0"
          style={{
            background: overdueAudit ? '#EF4444' : audit.auditTypeColor || '#8B5CF6',
          }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-mono text-gray-400 flex-shrink-0">{audit.auditRefId}</span>
            {overdueAudit && (
              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex-shrink-0">Overdue</span>
            )}
          </div>
          <p className="text-sm font-semibold text-gray-800 truncate">{audit.auditTypeName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {effStatus(audit.status) === 'Closed' && audit.auditRating && (
              <span className="text-xs text-amber-500 font-medium">{'⭐'.repeat(audit.auditRating)}</span>
            )}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                audit.auditCategory === 'External' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
              }`}
            >
              {audit.auditCategory === 'External' ? '🌐' : '🏢'} {audit.auditCategory || 'Internal'}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                audit.riskLevel === 'Critical'
                  ? 'bg-red-100 text-red-600'
                  : audit.riskLevel === 'High'
                    ? 'bg-orange-100 text-orange-600'
                    : audit.riskLevel === 'Medium'
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-green-100 text-green-600'
              }`}
            >
              {audit.riskLevel || 'Medium'}
            </span>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        {audit.branch && <p className="text-sm text-gray-700 truncate">{audit.branch}</p>}
        {audit.location && <p className="text-xs text-gray-400 truncate mt-0.5">{audit.location}</p>}
        {audit.department && <p className="text-xs text-gray-400 truncate">{audit.department}</p>}
        {!audit.branch && !audit.location && !audit.department && <p className="text-sm text-gray-300">—</p>}
      </div>

      <div className="min-w-0">
        {audit.auditorName ? (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {audit.auditorName?.charAt(0)}
              </div>
              <p className="text-sm text-gray-700 truncate">{audit.auditorName}</p>
            </div>
            {(audit.teamMembers?.length || 0) > 0 && (
              <p className="text-xs text-gray-400 mt-0.5 ml-8">
                +{audit.teamMembers.length} member{audit.teamMembers.length !== 1 ? 's' : ''}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-300">—</p>
        )}
      </div>

      <div className="min-w-0">
        {audit.startDate && <p className="text-xs text-gray-500">{formatDate(audit.startDate)}</p>}
        {audit.endDate && (
          <p className={`text-xs font-medium ${overdueAudit ? 'text-red-600' : 'text-gray-500'}`}>→ {formatDate(audit.endDate)}</p>
        )}
        {!audit.startDate && !audit.endDate && <p className="text-sm text-gray-300">—</p>}
      </div>

      <div onClick={(e) => e.stopPropagation()}>
        {isAuditor ? (
          <span
            className={`inline-flex w-full justify-center text-xs font-medium border rounded-lg px-2 py-1.5 ${
              statusMeta(status).badge
            } border-gray-200`}
          >
            {statusMeta(status).icon} {eff}
          </span>
        ) : (
          (() => {
            if (!canManage) {
              return (
                <span className={`inline-flex w-full justify-center text-xs font-medium border rounded-lg px-2 py-1.5 ${statusMeta(status).badge} border-gray-200`}>
                  {statusMeta(status).icon} {eff}
                </span>
              );
            }

            if (eff === 'Submitted') {
              return (
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    try {
                      setSaving(true);
                      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
                        status: 'Under Review',
                        reviewStartedAt: new Date(),
                        reviewStartedBy: currentUser?.email || '',
                        updatedAt: new Date(),
                      });
                      setStatus('Under Review');
                      showSuccess?.('Review started');
                    } catch {
                      showError('Failed');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="w-full py-1.5 bg-[#1B6B6B] text-white rounded-lg text-xs font-medium hover:bg-[#155858] transition-colors disabled:opacity-50"
                >
                  👀 Start Review
                </button>
              );
            }

            if (eff === 'Under Review') {
              return (
                <select
                  value={eff}
                  disabled={saving}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className={`w-full text-xs font-medium border rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none transition-colors ${
                    saving ? 'opacity-50 cursor-wait' : ''
                  } ${statusMeta(status).badge} border-gray-200`}
                >
                  <option value="Under Review">👀 Under Review</option>
                  <option value="Closed">✅ Closed</option>
                </select>
              );
            }

            return (
              <span className={`inline-flex w-full justify-center text-xs font-medium border rounded-lg px-2 py-1.5 ${statusMeta(status).badge} border-gray-200`}>
                {statusMeta(status).icon} {eff}
              </span>
            );
          })()
        )}
      </div>

      <div className="text-center">
        {(() => {
          const score = getAuditScore(audit);
          if (score === null) return <p className="text-xs text-gray-300 text-center">—</p>;
          return (
            <div className="text-center">
              <div className={`text-sm font-bold ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                {score}%
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                <div
                  className={`h-full rounded-full ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${score}%` }}
                />
              </div>
            </div>
          );
        })()}
      </div>

      <div className="text-center">
        {totalFindings > 0 ? (
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              openFindings > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}
          >
            {openFindings > 0 ? `${openFindings} open` : '✅ done'}
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>

      <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
        {isAdmin && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete audit"
            className="w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all text-sm"
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}

function AuditList({
  audits,
  auditTypes,
  company,
  companyId,
  currentUser,
  userRole,
  employees,
  showSuccess,
  showError,
  setSelectedAudit,
  isAuditor,
  canManage,
}) {
  const isAdmin = userRole === 'admin';
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [search, setSearch] = useState('');
  const [activeStatusTab, setActiveStatusTab] = useState('all'); // all | overdue | status
  const [auditorFilter, setAuditorFilter] = useState('active'); // active | all | closed
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    type: '',
    branch: '',
    location: '',
    riskLevel: '',
    auditor: '',
    category: '',
    dateFrom: '',
    dateTo: '',
  });
  const [leadSearch, setLeadSearch] = useState('');
  const [showLeadDrop, setShowLeadDrop] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [showTeamDrop, setShowTeamDrop] = useState(false);
  const leadRef = useRef(null);
  const teamRef = useRef(null);

  const [assignForm, setAssignForm] = useState({
    auditTypeId: '',
    category: '',
    location: '',
    branch: '',
    department: '',
    auditorId: '',
    auditorName: '',
    auditorEmail: '',
    teamMembers: [],
    startDate: '',
    endDate: '',
    notes: '',
  });

  useEffect(() => {
    const handleClick = (e) => {
      if (leadRef.current && !leadRef.current.contains(e.target)) setShowLeadDrop(false);
      if (teamRef.current && !teamRef.current.contains(e.target)) setShowTeamDrop(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const isOverdue = (audit) => {
    if (effStatus(audit.status) === 'Closed') return false;
    const end = audit.endDate || audit.dueDate;
    if (!end) return false;
    return new Date(end) < now;
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filtered = useMemo(() => {
    return audits.filter((a) => {
      // Sub-tabs filter (status/overdue)
      if (activeStatusTab === 'overdue') {
        if (!isOverdue(a)) return false;
      } else if (activeStatusTab !== 'all') {
        if (isOverdue(a)) return false;
        if (effStatus(a.status) !== activeStatusTab) return false;
      }

      // Auditor quick filter (active/closed/all)
      if (isAuditor) {
        if (auditorFilter === 'active' && effStatus(a.status) === 'Closed') return false;
        if (auditorFilter === 'closed' && effStatus(a.status) !== 'Closed') return false;
      }

      if (search) {
        const q = search.toLowerCase();
        if (
          !(
            a.auditRefId?.toLowerCase().includes(q) ||
            a.auditTypeName?.toLowerCase().includes(q) ||
            a.branch?.toLowerCase().includes(q) ||
            a.auditorName?.toLowerCase().includes(q) ||
            a.location?.toLowerCase().includes(q)
          )
        )
          return false;
      }
      if (filters.status) {
        const eff = isOverdue(a) ? 'Overdue' : effStatus(a.status);
        if (eff !== filters.status) return false;
      }
      if (filters.type && a.auditTypeId !== filters.type) return false;
      if (filters.branch && a.branch !== filters.branch) return false;
      if (filters.location && a.location !== filters.location) return false;
      if (filters.riskLevel && a.riskLevel !== filters.riskLevel) return false;
      if (filters.auditor && a.auditorName !== filters.auditor) return false;
      if (filters.category && a.auditCategory !== filters.category) return false;
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        const end = new Date(a.endDate || a.dueDate || '9999-12-31');
        if (end < from) return false;
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        const end = new Date(a.endDate || a.dueDate || '0000-01-01');
        if (end > to) return false;
      }
      return true;
    });
  }, [audits, search, filters, activeStatusTab, auditorFilter, isAuditor]);

  const generateAuditId = async () => {
    const counterRef = doc(db, 'companies', companyId, 'settings', 'auditCounter');
    const snap = await getDoc(counterRef);
    let next = 1;
    if (snap.exists()) {
      next = (snap.data().count || 0) + 1;
      await updateDoc(counterRef, { count: increment(1) });
    } else {
      await setDoc(counterRef, { count: 1 });
    }
    const yr = new Date().getFullYear();
    return `AUD-${yr}-${String(next).padStart(3, '0')}`;
  };

  const resetAssignForm = () => {
    setAssignForm({
      auditTypeId: '',
      category: '',
      location: '',
      branch: '',
      department: '',
      auditorId: '',
      auditorName: '',
      auditorEmail: '',
      teamMembers: [],
      startDate: '',
      endDate: '',
      notes: '',
    });
    setLeadSearch('');
    setTeamSearch('');
  };

  const handleAssign = async () => {
    if (!assignForm.auditTypeId) {
      showError('Select an audit template');
      return;
    }
    if (!assignForm.auditorId) {
      showError('Select a lead auditor');
      return;
    }
    if (!assignForm.endDate) {
      showError('Set an end date');
      return;
    }
    try {
      setSaving(true);
      const type = auditTypes.find((t) => t.id === assignForm.auditTypeId);
      const refId = await generateAuditId();
      const checklistReview = (type?.checklistItems || []).map((item) => ({
        ...item,
        result: null,
        note: '',
      }));
      const teamMembersNorm = (assignForm.teamMembers || []).map((m) => ({
        ...m,
        email: (m.email || '').toLowerCase(),
      }));
      await addDoc(collection(db, 'companies', companyId, 'audits'), {
        auditRefId: refId,
        auditTypeId: assignForm.auditTypeId,
        auditTypeName: type?.name || '',
        auditTypeColor: type?.color || '#8B5CF6',
        auditCategory: type?.auditCategory || 'Internal',
        riskLevel: type?.riskLevel || 'Medium',
        category: assignForm.category,
        location: assignForm.location,
        branch: assignForm.branch,
        department: assignForm.department,
        auditorId: assignForm.auditorId,
        auditorName: assignForm.auditorName,
        auditorEmail: (assignForm.auditorEmail || '').toLowerCase(),
        teamMembers: teamMembersNorm,
        startDate: assignForm.startDate,
        endDate: assignForm.endDate,
        notes: assignForm.notes,
        status: 'Assigned',
        checklistReview,
        findings: [],
        adminNotes: '',
        checklistLocked: false,
        createdAt: new Date(),
        createdBy: currentUser?.email || '',
      });
      showSuccess(`${refId} assigned to ${assignForm.auditorName}!`);
      setShowAssignModal(false);
      resetAssignForm();
    } catch (e) {
      showError('Failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e, audit) => {
    e.stopPropagation();
    if (userRole !== 'admin') {
      showError('Only admins can delete audits');
      return;
    }
    if (!window.confirm(`Delete ${audit.auditRefId}?`)) return;
    try {
      await deleteDoc(doc(db, 'companies', companyId, 'audits', audit.id));
      showSuccess('Audit deleted');
    } catch (err) {
      showError('Failed to delete');
    }
  };

  const emptyAssign = {
    auditTypeId: '',
    category: '',
    location: '',
    branch: '',
    department: '',
    auditorId: '',
    auditorName: '',
    auditorEmail: '',
    teamMembers: [],
    startDate: '',
    endDate: '',
    notes: '',
  };

  return (
    <div>
      {!isAuditor && (
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-48 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, template, branch, auditor..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                ✕
              </button>
            )}
          </div>

          <div className="flex border border-gray-200 rounded-xl overflow-hidden">
            {[
              { id: 'list', icon: '☰' },
              { id: 'kanban', icon: '⊞' },
            ].map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewMode(v.id)}
                className={`px-3 py-2.5 text-sm transition-colors ${viewMode === v.id ? 'bg-[#1B6B6B] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                {v.icon}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl text-sm transition-colors ${
              showFilters || activeFilterCount > 0 ? 'border-[#1B6B6B] text-[#1B6B6B] bg-[#E8F5F5]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            ⚙️ Filters
            {activeFilterCount > 0 && (
              <span className="bg-[#1B6B6B] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">{activeFilterCount}</span>
            )}
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setShowAssignModal(true)}
              disabled={auditTypes.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50 whitespace-nowrap"
            >
              + Assign Audit
            </button>
          )}
        </div>

        {showFilters && (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-700">Filter Audits</p>
              <button
                type="button"
                onClick={() => setFilters({ status: '', type: '', branch: '', location: '', riskLevel: '', auditor: '', category: '', dateFrom: '', dateTo: '' })}
                className="text-xs text-[#1B6B6B] hover:underline"
              >
                Clear all
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Statuses</option>
                  {['Assigned', 'In Progress', 'Submitted', 'Sent Back', 'Under Review', 'Closed', 'Overdue'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Template</label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Templates</option>
                  {auditTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  <option value="Internal">🏢 Internal</option>
                  <option value="External">🌐 External</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Risk Level</label>
                <select
                  value={filters.riskLevel}
                  onChange={(e) => setFilters((p) => ({ ...p, riskLevel: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All</option>
                  <option value="Critical">🔴 Critical</option>
                  <option value="High">🟠 High</option>
                  <option value="Medium">🟡 Medium</option>
                  <option value="Low">🟢 Low</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Branch</label>
                <select
                  value={filters.branch}
                  onChange={(e) => setFilters((p) => ({ ...p, branch: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Branches</option>
                  {(company?.branches || []).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Location</label>
                <select
                  value={filters.location}
                  onChange={(e) => setFilters((p) => ({ ...p, location: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Locations</option>
                  {(company?.locations || []).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Auditor</label>
                <select
                  value={filters.auditor}
                  onChange={(e) => setFilters((p) => ({ ...p, auditor: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Auditors</option>
                  {[...new Set(audits.map((a) => a.auditorName).filter(Boolean))]
                    .sort()
                    .map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">End Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">End Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>
            </div>
            {activeFilterCount > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-[#1B6B6B]">
                  {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active · {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            {filtered.length} audit{filtered.length !== 1 ? 's' : ''}
            {(activeFilterCount > 0 || search) && ` of ${audits.length}`}
          </p>
          {(activeFilterCount > 0 || search) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilters({ status: '', type: '', branch: '', location: '', riskLevel: '', auditor: '', category: '', dateFrom: '', dateTo: '' });
              }}
              className="text-xs text-[#1B6B6B] hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      </div>
      )}

      {/* Status sub-tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 flex-nowrap mb-4">
        <button
          type="button"
          onClick={() => setActiveStatusTab('all')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
            activeStatusTab === 'all'
              ? 'bg-[#1B6B6B] text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          All
          <span
            className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
              activeStatusTab === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {audits.length}
          </span>
        </button>

        {AUDIT_STATUSES.map((status) => {
          const count = audits.filter((a) => effStatus(a.status) === status.key && !isOverdue(a)).length;
          if (count === 0) return null;
          return (
            <button
              key={status.key}
              type="button"
              onClick={() => setActiveStatusTab(status.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                activeStatusTab === status.key ? 'text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
              style={activeStatusTab === status.key ? { background: status.color } : {}}
            >
              {status.icon} {status.key}
              <span
                className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  activeStatusTab === status.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}

        {(() => {
          const overdueCount = audits.filter((a) => isOverdue(a)).length;
          if (overdueCount === 0) return null;
          return (
            <button
              type="button"
              onClick={() => setActiveStatusTab('overdue')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                activeStatusTab === 'overdue'
                  ? 'bg-red-500 text-white'
                  : 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
              }`}
            >
              ⚠️ Overdue
              <span
                className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  activeStatusTab === 'overdue' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-500'
                }`}
              >
                {overdueCount}
              </span>
            </button>
          );
        })()}
      </div>

      {isAuditor && (
        <div className="flex gap-2 mb-4">
          {[
            { id: 'active', label: 'Active', count: audits.filter((a) => effStatus(a.status) !== 'Closed').length },
            { id: 'all', label: 'All', count: audits.length },
            { id: 'closed', label: 'Closed', count: audits.filter((a) => effStatus(a.status) === 'Closed').length },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAuditorFilter(f.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                auditorFilter === f.id ? 'bg-[#1B6B6B] text-white' : 'bg-white border border-gray-200 text-gray-600'
              }`}
            >
              {f.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  auditorFilter === f.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {isAuditor ? (
        <div className="space-y-3">
          {filtered.map((audit) => {
            const es = effStatus(audit.status);
            const canFillNow = es === 'Assigned' || es === 'In Progress' || es === 'Sent Back';
            const totalItems = (audit.checklistReview || []).length;
            const filledItems = (audit.checklistReview || []).filter((i) => i.result).length;
            const progress = totalItems > 0 ? Math.round((filledItems / totalItems) * 100) : 0;
            return (
              <div
                key={audit.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedAudit(audit)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setSelectedAudit(audit);
                }}
                className={`bg-white border rounded-2xl p-5 cursor-pointer hover:shadow-md transition-all ${
                  es === 'Sent Back' ? 'border-red-200 hover:border-red-300' : 'border-gray-100 hover:border-[#4ECDC4]'
                }`}
              >
                <div
                  className="h-1 -mx-5 -mt-5 mb-4 rounded-t-2xl"
                  style={{
                    background: es === 'Sent Back' ? '#EF4444' : audit.auditTypeColor || '#8B5CF6',
                  }}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-mono text-gray-400">{audit.auditRefId}</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusMeta(audit.status).badge}`}>
                        {es}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-gray-800 mb-1">{audit.auditTypeName}</p>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-gray-400">
                      {audit.branch && <span>🏢 {audit.branch}</span>}
                      {audit.location && <span>📍 {audit.location}</span>}
                      <span>📅 Due {formatDate(audit.endDate)}</span>
                    </div>
                    {es === 'Sent Back' && audit.sentBackReason && (
                      <div className="mt-2 p-2.5 bg-red-50 border border-red-100 rounded-xl">
                        <p className="text-xs text-red-600 font-medium">↩ Manager note:</p>
                        <p className="text-xs text-red-500 italic mt-0.5">&quot;{audit.sentBackReason}&quot;</p>
                      </div>
                    )}
                  </div>
                  {totalItems > 0 && (
                    <div className="flex-shrink-0 text-right">
                      <div
                        className={`w-14 h-14 mx-auto rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                          es === 'Closed' ? 'border-green-200 bg-green-50 text-green-700' : 'border-[#E8F5F5] bg-[#F8FCFC] text-[#1B6B6B]'
                        }`}
                      >
                        {progress}%
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {filledItems}/{totalItems}
                      </p>
                    </div>
                  )}
                </div>
                {canFillNow && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div
                      className={`w-full py-2 rounded-xl text-sm font-medium text-center ${
                        es === 'Sent Back'
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : 'bg-[#E8F5F5] text-[#1B6B6B]'
                      }`}
                    >
                      {es === 'Sent Back' ? '↩ Fix & Resubmit' : es === 'In Progress' ? '✍️ Continue Filling' : '▶ Start Audit'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
              <p className="text-5xl mb-4">✅</p>
              <p className="text-base font-semibold text-gray-700">No audits assigned to you</p>
            </div>
          )}
        </div>
      ) : (
      <>
      {viewMode === 'list' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-base font-semibold text-gray-700 mb-2">{audits.length === 0 ? 'No audits yet' : 'No audits match filters'}</p>
              <p className="text-sm text-gray-400 mb-6">
                {audits.length === 0 ? 'Assign your first audit to get started' : 'Try adjusting your filters'}
              </p>
              {audits.length === 0 && canManage && (
                <button
                  type="button"
                  onClick={() => setShowAssignModal(true)}
                  disabled={auditTypes.length === 0}
                  className="px-5 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  + Assign First Audit
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_160px_80px_80px_40px] gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                {['Audit', 'Location', 'Auditor', 'Dates', 'Status', 'Score', 'Findings', ''].map((h) => (
                  <p key={h || 'actions'} className="text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">
                    {h}
                  </p>
                ))}
              </div>
              <div className="divide-y divide-gray-50">
                {filtered.map((audit) => {
                  const overdueAudit = isOverdue(audit);
                  const openFindings = (audit.findings || []).filter((f) => f.status !== 'Resolved').length;
                  const totalFindings = (audit.findings || []).length;
                  return (
                    <AuditTableRow
                      key={audit.id}
                      audit={audit}
                      overdueAudit={overdueAudit}
                      openFindings={openFindings}
                      totalFindings={totalFindings}
                      companyId={companyId}
                      userRole={userRole}
                      isAuditor={false}
                      canManage={canManage}
                      isAdmin={isAdmin}
                      currentUser={currentUser}
                      showSuccess={showSuccess}
                      onOpen={() => setSelectedAudit(audit)}
                      onDelete={(e) => handleDelete(e, audit)}
                      showError={showError}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {viewMode === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {AUDIT_STATUSES.map((status) => {
            const cols = filtered.filter((a) => effStatus(a.status) === status.key && !isOverdue(a));
            return (
              <div key={status.key} className="flex-shrink-0 w-72">
                <div className={`flex items-center justify-between p-3 rounded-xl mb-3 ${status.bg} border ${status.border}`}>
                  <div className="flex items-center gap-2">
                    <span>{status.icon}</span>
                    <span className="text-xs font-semibold text-gray-700">{status.key}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status.badge}`}>{cols.length}</span>
                </div>
                <div className="space-y-2">
                  {cols.map((audit) => (
                    <div
                      key={audit.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedAudit(audit)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedAudit(audit);
                      }}
                      className="bg-white border border-gray-100 rounded-xl p-4 cursor-pointer hover:shadow-sm hover:border-gray-200 transition-all relative group"
                    >
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, audit)}
                          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-200 hover:text-red-500 transition-all"
                        >
                          🗑️
                        </button>
                      )}
                      <div className="flex items-start gap-2 mb-2">
                        <div
                          className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: audit.auditTypeColor || '#8B5CF6' }}
                        >
                          {audit.auditTypeName?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-gray-400 mb-0.5">{audit.auditRefId}</p>
                          <p className="text-xs font-semibold text-gray-800 truncate">{audit.auditTypeName}</p>
                          {audit.branch && <p className="text-xs text-gray-400 truncate">{audit.branch}</p>}
                        </div>
                      </div>
                      {(() => {
                        const score = getAuditScore(audit);
                        if (score === null) return null;
                        return (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold ${score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                              {score}%
                            </span>
                          </div>
                        );
                      })()}
                      <div className="flex items-center justify-between mt-2">
                        {audit.auditorName && (
                          <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold">
                              {audit.auditorName?.charAt(0)}
                            </div>
                            <p className="text-xs text-gray-500 truncate max-w-24">{audit.auditorName}</p>
                          </div>
                        )}
                        {audit.endDate && <span className="text-xs text-gray-400">{formatDate(audit.endDate)}</span>}
                      </div>
                    </div>
                  ))}
                  {cols.length === 0 && (
                    <div className="text-center py-6 text-xs text-gray-300 border-2 border-dashed border-gray-100 rounded-xl">No audits</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {showAssignModal && (
        <AssignAuditModal
          auditTypes={auditTypes}
          company={company}
          employees={employees}
          assignForm={assignForm}
          setAssignForm={setAssignForm}
          leadSearch={leadSearch}
          setLeadSearch={setLeadSearch}
          showLeadDrop={showLeadDrop}
          setShowLeadDrop={setShowLeadDrop}
          teamSearch={teamSearch}
          setTeamSearch={setTeamSearch}
          showTeamDrop={showTeamDrop}
          setShowTeamDrop={setShowTeamDrop}
          leadRef={leadRef}
          teamRef={teamRef}
          saving={saving}
          onClose={() => {
            setShowAssignModal(false);
            setAssignForm(emptyAssign);
            setLeadSearch('');
            setTeamSearch('');
          }}
          onSubmit={handleAssign}
        />
      )}

    </div>
  );
}

function AuditHistory({ audits, company }) {
  const [selectedBranch, setSelectedBranch] = useState('');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

  const filteredAudits = useMemo(() => {
    return audits
      .filter((a) => {
        if (selectedBranch && a.branch !== selectedBranch) return false;
        const end = a.endDate || a.dueDate;
        if (!end) return false;
        if (dateFrom && new Date(end) < new Date(dateFrom)) return false;
        if (dateTo && new Date(end) > new Date(dateTo)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.endDate || b.dueDate || 0) - new Date(a.endDate || a.dueDate || 0));
  }, [audits, selectedBranch, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center gap-2 flex-wrap">
        <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
          <option value="">All Branches</option>
          {(company?.branches || []).map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr_100px_120px_100px_80px_80px] gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
          {['Audit', 'Branch', 'Auditor', 'End Date', 'Status', 'Score', 'Rating', 'Findings'].map((h) => (
            <p key={h} className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</p>
          ))}
        </div>
        <div className="divide-y divide-gray-50">
          {filteredAudits.map((audit) => {
            const score = getAuditScore(audit);
            const openF = (audit.findings || []).filter((f) => f.status !== 'Resolved').length;
            return (
              <div key={audit.id} className="grid grid-cols-[1fr_1fr_1fr_100px_120px_100px_80px_80px] gap-3 px-5 py-3.5 items-center">
                <div className="min-w-0"><p className="text-xs font-mono text-gray-400">{audit.auditRefId}</p><p className="text-sm font-medium truncate">{audit.auditTypeName}</p></div>
                <p className="text-sm text-gray-600 truncate">{audit.branch || '—'}</p>
                <p className="text-sm text-gray-600 truncate">{audit.auditorName || '—'}</p>
                <p className="text-sm text-gray-600">{formatDate(audit.endDate)}</p>
                <p className="text-sm text-gray-600">{effStatus(audit.status)}</p>
                <p className="text-sm text-gray-600">{score === null ? '—' : `${score}%`}</p>
                <div>
                  {audit.auditRating ? (
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-amber-400">{'⭐'.repeat(audit.auditRating)}</span>
                      <span className="text-xs text-gray-400">{audit.auditRating}/5</span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-300">—</p>
                  )}
                </div>
                <p className="text-sm text-gray-600">{openF || '—'}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AuditReports({ audits, employees }) {
  const closedAudits = audits.filter((a) => effStatus(a.status) === 'Closed');
  const overallScores = closedAudits.map((a) => getAuditScore(a)).filter((s) => s !== null);
  const overallRate = overallScores.length > 0 ? Math.round(overallScores.reduce((sum, s) => sum + s, 0) / overallScores.length) : null;
  const ratedAudits = audits.filter((a) => a.auditRating);
  const avgRating =
    ratedAudits.length > 0
      ? (ratedAudits.reduce((sum, a) => sum + a.auditRating, 0) / ratedAudits.length).toFixed(1)
      : null;

  const findingsTotal = audits.reduce((sum, a) => sum + (a.findings || []).length, 0);
  const findingsResolved = audits.reduce((sum, a) => sum + (a.findings || []).filter((f) => f.status === 'Resolved').length, 0);
  const findingsOpen = findingsTotal - findingsResolved;

  const auditorPerf = useMemo(() => {
    const map = {};
    audits.forEach((a) => {
      if (!a.auditorName) return;
      if (!map[a.auditorName]) {
        map[a.auditorName] = {
          name: a.auditorName,
          email: a.auditorEmail || '',
          totalAssigned: 0,
          closed: 0,
          inProgress: 0,
          overdue: 0,
          scores: [],
          ratings: [],
          findings: 0,
          resolvedFindings: 0,
          avgScore: null,
          avgRating: null,
          onTime: 0,
          late: 0,
        };
      }
      const p = map[a.auditorName];
      p.totalAssigned++;

      if (effStatus(a.status) === 'Closed') {
        p.closed++;
        const score = getAuditScore(a);
        if (score !== null) p.scores.push(score);
        if (a.endDate && a.closedAt) {
          const endDate = new Date(a.endDate);
          const closedDate = a.closedAt?.toDate ? a.closedAt.toDate() : new Date(a.closedAt);
          if (closedDate <= endDate) p.onTime++;
          else p.late++;
        }
      }
      if (effStatus(a.status) === 'In Progress') p.inProgress++;
      if (a.auditRating) p.ratings.push(a.auditRating);

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (effStatus(a.status) !== 'Closed' && a.endDate && new Date(a.endDate) < now) p.overdue++;

      const f = a.findings || [];
      p.findings += f.length;
      p.resolvedFindings += f.filter((x) => x.status === 'Resolved').length;
    });

    return Object.values(map)
      .map((a) => ({
        ...a,
        avgScore: a.scores.length > 0 ? Math.round(a.scores.reduce((s, v) => s + v, 0) / a.scores.length) : null,
        avgRating: a.ratings.length > 0 ? (a.ratings.reduce((s, v) => s + v, 0) / a.ratings.length).toFixed(1) : null,
        closedRate: a.totalAssigned > 0 ? Math.round((a.closed / a.totalAssigned) * 100) : 0,
      }))
      .sort((a, b) => b.totalAssigned - a.totalAssigned);
  }, [audits]);

  if (audits.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
        <p className="text-5xl mb-4">📈</p>
        <p className="text-base font-semibold text-gray-700 mb-2">No audits yet</p>
        <p className="text-sm text-gray-400">Reports appear when audits are available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <p className="text-xs text-gray-500 mb-2">Overall Compliance</p>
          <p className="text-4xl font-bold">{overallRate !== null ? `${overallRate}%` : '—'}</p>
          <p className="text-xs text-gray-400 mt-1">From {closedAudits.length} closed audits</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <p className="text-xs text-blue-600 mb-2">Total Audits</p>
          <p className="text-4xl font-bold text-blue-700">{audits.length}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
          <p className="text-xs text-green-600 mb-2">Closed Audits</p>
          <p className="text-4xl font-bold text-green-700">{closedAudits.length}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <p className="text-xs text-amber-600 mb-2">Open Findings</p>
          <p className="text-4xl font-bold text-amber-700">{findingsOpen}</p>
        </div>
        {avgRating && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
            <p className="text-xs text-amber-600 mb-2">⭐ Avg Audit Rating</p>
            <p className="text-4xl font-bold text-amber-700">
              {avgRating}
              <span className="text-lg">/5</span>
            </p>
            <p className="text-xs text-amber-400 mt-1">From {ratedAudits.length} rated audits</p>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">👤 Auditor Performance</h3>
        {auditorPerf.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No data</p>
        ) : (
          <div className="space-y-4">
            {auditorPerf.map((ap) => (
              <div key={ap.name} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {ap.name?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{ap.name}</p>
                      <p className="text-xs text-gray-400">{ap.totalAssigned} total audits assigned</p>
                    </div>
                  </div>
                  {ap.avgScore !== null && (
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${ap.avgScore >= 80 ? 'text-green-600' : ap.avgScore >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{ap.avgScore}%</p>
                      <p className="text-xs text-gray-400">avg score</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[
                    { label: 'Closed', value: ap.closed, color: 'bg-green-50 text-green-700' },
                    { label: 'In Progress', value: ap.inProgress, color: 'bg-blue-50 text-blue-700' },
                    { label: 'Overdue', value: ap.overdue, color: ap.overdue > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-500' },
                    { label: 'Findings', value: ap.findings, color: ap.findings > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-500' },
                  ].map((s) => (
                    <div key={s.label} className={`rounded-lg p-2.5 text-center ${s.color}`}>
                      <p className="text-lg font-bold">{s.value}</p>
                      <p className="text-xs mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Completion Rate</span>
                      <span className="text-xs font-medium text-gray-600">{ap.closedRate}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${ap.closedRate >= 80 ? 'bg-green-500' : ap.closedRate >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${ap.closedRate}%` }} />
                    </div>
                  </div>

                  {ap.findings > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">Finding Resolution</span>
                        <span className="text-xs font-medium text-gray-600">{ap.resolvedFindings}/{ap.findings}</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1B6B6B] rounded-full" style={{ width: `${Math.round((ap.resolvedFindings / ap.findings) * 100)}%` }} />
                      </div>
                    </div>
                  )}
                  {ap.avgRating && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-400">Manager Rating</span>
                      <div className="flex items-center gap-1">
                        <span className="text-amber-400">⭐</span>
                        <span className="text-sm font-bold text-amber-600">{ap.avgRating}/5</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Audit() {
  const { companyId: routeCompanyId } = useParams();
  const { companyId: authCompanyId, currentUser, userRole, auditScope } = useAuth();
  const companyId = routeCompanyId || authCompanyId;
  const { company } = useCompany();

  const isAdmin = userRole === 'admin';
  const isAuditManager = userRole === 'auditmanager';
  const isAuditor = userRole === 'auditor';
  const isHRManager = userRole === 'hrmanager';
  const canManage = isAdmin || isAuditManager || isHRManager;

  const [activeTab, setActiveTab] = useState('audits');
  const auditorDefaulted = useRef(false);
  const [auditTypes, setAuditTypes] = useState([]);
  const [audits, setAudits] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [toast, setToast] = useState(null);

  const showSuccess = (msg) => {
    setToast({ type: 'success', msg });
    setTimeout(() => setToast(null), 3000);
  };
  const showError = (msg) => {
    setToast({ type: 'error', msg });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    trackPageView('Audit');
  }, []);

  useEffect(() => {
    if (isAuditor && !auditorDefaulted.current) {
      auditorDefaulted.current = true;
      setActiveTab('dashboard');
    }
  }, [isAuditor]);

  const visibleAudits = useMemo(() => {
    if (isAdmin || isHRManager) return audits;
    if (isAuditManager) {
      if (!auditScope || auditScope === 'both') return audits;
      if (auditScope === 'internal') return audits.filter((a) => a.auditCategory === 'Internal');
      if (auditScope === 'external') return audits.filter((a) => a.auditCategory === 'External');
      return audits;
    }
    if (isAuditor) {
      const email = currentUser?.email?.toLowerCase();
      return audits.filter(
        (a) =>
          (a.auditorEmail || '').toLowerCase() === email ||
          (a.teamMembers || []).some((m) => (m.email || '').toLowerCase() === email),
      );
    }
    return audits;
  }, [audits, isAdmin, isHRManager, isAuditManager, isAuditor, auditScope, currentUser]);

  const mainTabs = useMemo(() => {
    const base = [
      { id: 'dashboard', label: 'Dashboard', icon: '📊' },
      { id: 'audits', label: 'Audits', icon: '🔍' },
    ];
    const extra =
      canManage
        ? [
            { id: 'history', label: 'History', icon: '📅' },
            { id: 'reports', label: 'Reports', icon: '📈' },
          ]
        : [];
    return [...base, ...extra];
  }, [canManage]);

  useEffect(() => {
    if (!companyId) return undefined;
    const unsub = onSnapshot(
      query(collection(db, 'companies', companyId, 'auditTypes'), orderBy('createdAt', 'asc')),
      (snap) => {
        setAuditTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return undefined;
    const unsub = onSnapshot(
      query(collection(db, 'companies', companyId, 'audits'), orderBy('createdAt', 'desc')),
      (snap) => {
        setAudits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );
    return unsub;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    getDocs(query(collection(db, 'companies', companyId, 'employees'), where('status', '==', 'Active')))
      .then((snap) => {
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => setEmployees([]));
  }, [companyId]);

  if (!companyId) {
    return <p className="p-6 text-sm text-gray-500">Missing company.</p>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading audit…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">Audit</h1>
            <p className="text-sm text-gray-400 mt-0.5">Schedule, track and close audits</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCalendar(true)}
              className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors"
              title="Audit Calendar"
            >
              📅
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ⚙️ Settings
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-[#E8F5F5] text-[#1B6B6B]' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'dashboard' &&
          (isAuditor ? (
            <AuditorDashboard audits={visibleAudits} currentUser={currentUser} />
          ) : (
            <AuditDashboard audits={visibleAudits} auditTypes={auditTypes} />
          ))}
        {activeTab === 'audits' && (
          <AuditList
            audits={visibleAudits}
            auditTypes={auditTypes}
            company={company}
            companyId={companyId}
            currentUser={currentUser}
            userRole={userRole}
            employees={employees}
            showSuccess={showSuccess}
            showError={showError}
            setSelectedAudit={setSelectedAudit}
            isAuditor={isAuditor}
            canManage={canManage}
          />
        )}
        {activeTab === 'history' && (
          <AuditHistory audits={visibleAudits} auditTypes={auditTypes} company={company} employees={employees} />
        )}
        {activeTab === 'reports' && (
          <AuditReports audits={visibleAudits} auditTypes={auditTypes} company={company} employees={employees} />
        )}
      </div>

      {selectedAudit && (() => {
        const liveAudit = visibleAudits.find((a) => a.id === selectedAudit.id) || audits.find((a) => a.id === selectedAudit.id) || selectedAudit;
        return (
          <AuditDetail
            key={liveAudit.id + liveAudit.status}
            audit={liveAudit}
            companyId={companyId}
            currentUser={currentUser}
            employees={employees}
            onClose={() => setSelectedAudit(null)}
            showSuccess={showSuccess}
            showError={showError}
            userRole={userRole}
            isAuditor={isAuditor}
            canManage={canManage}
          />
        );
      })()}

      {showSettings && (
        <AuditSettings
          auditTypes={auditTypes}
          companyId={companyId}
          currentUser={currentUser}
          onClose={() => setShowSettings(false)}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {showCalendar && (
        <AuditCalendar
          audits={visibleAudits}
          onClose={() => setShowCalendar(false)}
          onSelectAudit={(a) => {
            setShowCalendar(false);
            setActiveTab('audits');
            const fresh = visibleAudits.find((x) => x.id === a.id) || audits.find((x) => x.id === a.id);
            setSelectedAudit(fresh || a);
          }}
        />
      )}
    </div>
  );
}

