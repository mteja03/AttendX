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

function getAuditScore(audit) {
  const items = audit?.checklistReview || [];
  const reviewed = items.filter((i) => i.result === 'pass' || i.result === 'fail');
  if (reviewed.length === 0) return null;
  const passed = items.filter((i) => i.result === 'pass').length;
  return Math.round((passed / reviewed.length) * 100);
}

const AUDIT_STATUSES = [
  { key: 'Scheduled', color: '#8B5CF6', bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', icon: '📅' },
  { key: 'In Progress', color: '#3B82F6', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', icon: '🔄' },
  { key: 'Under Review', color: '#F97316', bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', icon: '👀' },
  { key: 'Closed', color: '#10B981', bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700', icon: '✅' },
];

const AUDIT_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#1B6B6B', '#6366F1', '#14B8A6'];

/** Used by AuditCalendar (unchanged); includes legacy keys for older documents */
const STATUS_COLORS = {
  Scheduled: 'bg-purple-100 text-purple-700',
  Assigned: 'bg-purple-100 text-purple-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Submitted: 'bg-orange-100 text-orange-700',
  'Under Review': 'bg-orange-100 text-orange-700',
  Closed: 'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700',
};

function AuditDashboard({ audits, auditTypes }) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const total = audits.length;
  const scheduled = audits.filter((a) => a.status === 'Scheduled').length;
  const inProgress = audits.filter((a) => a.status === 'In Progress').length;
  const underReview = audits.filter((a) => a.status === 'Under Review').length;
  const closed = audits.filter((a) => a.status === 'Closed').length;

  const overdue = audits.filter((a) => {
    if (a.status === 'Closed') return false;
    const end = a.endDate || a.dueDate;
    if (!end) return false;
    return new Date(end) < now;
  }).length;

  const closedAudits = audits.filter((a) => a.status === 'Closed');
  const complianceRate = (() => {
    const scores = closedAudits.map((a) => getAuditScore(a)).filter((s) => s !== null);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
  })();

  const riskCounts = {
    Critical: audits.filter((a) => a.riskLevel === 'Critical' && a.status !== 'Closed').length,
    High: audits.filter((a) => a.riskLevel === 'High' && a.status !== 'Closed').length,
    Medium: audits.filter((a) => a.riskLevel === 'Medium' && a.status !== 'Closed').length,
    Low: audits.filter((a) => a.riskLevel === 'Low' && a.status !== 'Closed').length,
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
    .filter((a) => a.status !== 'Closed')
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
    { label: 'Scheduled', count: scheduled, color: '#8B5CF6', bg: '#EDE9FE' },
    { label: 'In Progress', count: inProgress, color: '#3B82F6', bg: '#DBEAFE' },
    { label: 'Under Review', count: underReview, color: '#F97316', bg: '#FFEDD5' },
    { label: 'Closed', count: closed, color: '#10B981', bg: '#D1FAE5' },
  ];

  const maxPipeline = Math.max(...pipeline.map((p) => p.count), 1);

  const statusBadge = (audit, isOverdueAudit) => {
    if (isOverdueAudit) return 'bg-red-100 text-red-700';
    return AUDIT_STATUSES.find((s) => s.key === audit.status)?.badge || 'bg-gray-100 text-gray-700';
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
              const isOverdueAudit = audit.status !== 'Closed' && (audit.endDate || audit.dueDate) && new Date(audit.endDate || audit.dueDate) < now;
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
                    {isOverdueAudit ? 'Overdue' : audit.status}
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
                return a.dateType === 'end' && a.status !== 'Closed' && new Date(key) < t;
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
                      audit.dateType === 'end' && audit.status !== 'Closed' && new Date(getDayKey(selectedDay)) < today;
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
                                : STATUS_COLORS[audit.status] || STATUS_COLORS.Assigned
                            }`}
                          >
                            {overdueAudit ? 'Overdue' : audit.status}
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
                    { label: 'Scheduled', value: monthAudits.length, color: 'text-gray-700' },
                    { label: 'Active', value: monthAudits.filter((a) => a.status !== 'Closed').length, color: 'text-blue-600' },
                    { label: 'Closed', value: monthAudits.filter((a) => a.status === 'Closed').length, color: 'text-green-600' },
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


function AuditDetail({ audit, companyId, currentUser, employees, onClose, showSuccess, showError }) {
  if (!audit || !audit.id) return null;
  const [activeTab, setActiveTab] = useState('checklist');
  const [checklistReview, setChecklistReview] = useState(() => audit.checklistReview || []);
  const [findings, setFindings] = useState(() => audit.findings || []);
  const [adminNotes, setAdminNotes] = useState(() => audit.adminNotes || '');
  const saveTimeoutRef = useRef(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
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
  }, [audit.id]);

  const isClosed = audit.status === 'Closed';
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

  const TABS = [
    { id: 'checklist', label: 'Checklist', count: totalItems },
    { id: 'findings', label: 'Findings', count: findings.length },
    { id: 'overview', label: 'Overview' },
  ];

  const autoSave = useCallback(async (newChecklistReview, newFindings, newAdminNotes) => {
    if (isClosed) return;
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        setAutoSaving(true);
        await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
          checklistReview: newChecklistReview,
          findings: newFindings,
          adminNotes: newAdminNotes,
          updatedAt: new Date(),
          updatedBy: currentUser?.email || '',
        });
        setLastSaved(new Date());
      } catch (e) {
        console.error('Auto-save failed:', e);
      } finally {
        setAutoSaving(false);
      }
    }, 1000);
  }, [audit.id, companyId, currentUser, isClosed]);

  useEffect(() => () => clearTimeout(saveTimeoutRef.current), []);

  const updateChecklistItem = (id, result) => {
    const updated = checklistReview.map((i) => (i.id === id ? { ...i, result } : i));
    setChecklistReview(updated);
    autoSave(updated, findingsData, adminNotes);
  };

  const updateChecklistNote = (id, note) => {
    const updated = checklistReview.map((i) => (i.id === id ? { ...i, note } : i));
    setChecklistReview(updated);
    autoSave(updated, findingsData, adminNotes);
  };

  const addFinding = () => {
    if (!newFinding.description.trim()) {
      showError('Enter finding description');
      return;
    }
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
    const updated = findingsData.filter((f) => f.id !== id);
    setFindings(updated);
    autoSave(checklistReview, updated, adminNotes);
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
        <div className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-mono font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{audit.auditRefId}</span>
                <h2 className="text-base font-semibold text-gray-800">{audit.auditTypeName}</h2>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${
                    AUDIT_STATUSES.find((s) => s.key === audit.status)?.badge || 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {AUDIT_STATUSES.find((s) => s.key === audit.status)?.icon} {audit.status}
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
            <div className="flex items-center gap-2 ml-2">
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

          <div className="flex gap-1 mt-3 flex-wrap">
            {TABS.map((tab) => (
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
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'checklist' && (
            <div className="space-y-5">
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
                            className={`p-4 rounded-xl border transition-all ${
                              item.result === 'pass'
                                ? 'bg-green-50 border-green-100'
                                : item.result === 'fail'
                                  ? 'bg-red-50 border-red-100'
                                  : item.result === 'na'
                                    ? 'bg-gray-50 border-gray-100'
                                    : 'bg-white border-gray-100'
                            }`}
                          >
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
                          </div>
                        ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'findings' && (
            <div className="space-y-4">
              {!isClosed && (
                <button
                  type="button"
                  onClick={() => setShowAddFinding(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors"
                >
                  + Add Finding
                </button>
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
                            {!isClosed && (
                              <button
                                type="button"
                                onClick={() => deleteFinding(finding.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-300 hover:text-red-500"
                              >
                                ✕
                              </button>
                            )}
                          </div>
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
                        {!isClosed && (
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

          {activeTab === 'overview' && (
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

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Admin Notes</label>
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
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
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
      const checklist = audit.checklistReview || [];
      if (checklist.length > 0) {
        const unfilled = checklist.filter((i) => !i.result);
        if (unfilled.length > 0) {
          showError(
            `Cannot close — ${unfilled.length} checklist item${unfilled.length !== 1 ? 's' : ''} not reviewed. Open the audit and mark each item Pass, Fail, or N/A.`,
          );
          return;
        }
      }
      const openOrInProgress = (audit.findings || []).filter((f) => f.status === 'Open' || f.status === 'In Progress');
      if (openOrInProgress.length > 0) {
        const hasOpen = openOrInProgress.some((f) => f.status === 'Open');
        const suffix = hasOpen ? 'open' : 'in progress';
        showError(
          `Cannot close — ${openOrInProgress.length} finding${openOrInProgress.length !== 1 ? 's' : ''} still ${suffix}. Resolve all findings first.`,
        );
        return;
      }
    }
    setStatus(newStatus);
    await saveChanges(newStatus);
  };

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
        <select
          value={status}
          disabled={saving || status === 'Closed'}
          onChange={(e) => handleStatusChange(e.target.value)}
          className={`w-full text-xs font-medium border rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none transition-colors ${
            saving ? 'opacity-50 cursor-wait' : ''
          } ${status === 'Closed' ? 'cursor-not-allowed opacity-70 bg-gray-50' : ''} ${
            AUDIT_STATUSES.find((s) => s.key === status)?.badge || 'bg-gray-100 text-gray-600 border-gray-200'
          }`}
        >
          {AUDIT_STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.icon} {s.key}
            </option>
          ))}
        </select>
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
        {userRole === 'admin' && (
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

function AuditList({ audits, auditTypes, company, companyId, currentUser, userRole, employees, showSuccess, showError, setSelectedAudit }) {
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [search, setSearch] = useState('');
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
    if (audit.status === 'Closed') return false;
    const end = audit.endDate || audit.dueDate;
    if (!end) return false;
    return new Date(end) < now;
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filtered = useMemo(() => {
    return audits.filter((a) => {
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
        const eff = isOverdue(a) ? 'Overdue' : a.status;
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
  }, [audits, search, filters]);

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
        auditorEmail: assignForm.auditorEmail,
        teamMembers: assignForm.teamMembers,
        startDate: assignForm.startDate,
        endDate: assignForm.endDate,
        notes: assignForm.notes,
        status: 'Scheduled',
        checklistReview,
        findings: [],
        adminNotes: '',
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

          <button
            type="button"
            onClick={() => setShowAssignModal(true)}
            disabled={auditTypes.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50 whitespace-nowrap"
          >
            + Assign Audit
          </button>
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
                  {['Scheduled', 'In Progress', 'Under Review', 'Closed', 'Overdue'].map((s) => (
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

      {viewMode === 'list' && (
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-base font-semibold text-gray-700 mb-2">{audits.length === 0 ? 'No audits yet' : 'No audits match filters'}</p>
              <p className="text-sm text-gray-400 mb-6">
                {audits.length === 0 ? 'Assign your first audit to get started' : 'Try adjusting your filters'}
              </p>
              {audits.length === 0 && (
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
            const cols = filtered.filter((a) => a.status === status.key && !isOverdue(a));
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
                      {userRole === 'admin' && (
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
        <div className="grid grid-cols-[1fr_1fr_1fr_100px_120px_100px_80px] gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
          {['Audit', 'Branch', 'Auditor', 'End Date', 'Status', 'Score', 'Findings'].map((h) => (
            <p key={h} className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</p>
          ))}
        </div>
        <div className="divide-y divide-gray-50">
          {filteredAudits.map((audit) => {
            const score = getAuditScore(audit);
            const openF = (audit.findings || []).filter((f) => f.status !== 'Resolved').length;
            return (
              <div key={audit.id} className="grid grid-cols-[1fr_1fr_1fr_100px_120px_100px_80px] gap-3 px-5 py-3.5 items-center">
                <div className="min-w-0"><p className="text-xs font-mono text-gray-400">{audit.auditRefId}</p><p className="text-sm font-medium truncate">{audit.auditTypeName}</p></div>
                <p className="text-sm text-gray-600 truncate">{audit.branch || '—'}</p>
                <p className="text-sm text-gray-600 truncate">{audit.auditorName || '—'}</p>
                <p className="text-sm text-gray-600">{formatDate(audit.endDate)}</p>
                <p className="text-sm text-gray-600">{audit.status}</p>
                <p className="text-sm text-gray-600">{score === null ? '—' : `${score}%`}</p>
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
  const closedAudits = audits.filter((a) => a.status === 'Closed');
  const overallScores = closedAudits.map((a) => getAuditScore(a)).filter((s) => s !== null);
  const overallRate = overallScores.length > 0 ? Math.round(overallScores.reduce((sum, s) => sum + s, 0) / overallScores.length) : null;

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
          findings: 0,
          resolvedFindings: 0,
          avgScore: null,
          onTime: 0,
          late: 0,
        };
      }
      const p = map[a.auditorName];
      p.totalAssigned++;

      if (a.status === 'Closed') {
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
      if (a.status === 'In Progress') p.inProgress++;

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (a.status !== 'Closed' && a.endDate && new Date(a.endDate) < now) p.overdue++;

      const f = a.findings || [];
      p.findings += f.length;
      p.resolvedFindings += f.filter((x) => x.status === 'Resolved').length;
    });

    return Object.values(map)
      .map((a) => ({
        ...a,
        avgScore: a.scores.length > 0 ? Math.round(a.scores.reduce((s, v) => s + v, 0) / a.scores.length) : null,
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
  const { companyId: authCompanyId, currentUser, userRole } = useAuth();
  const companyId = routeCompanyId || authCompanyId;
  const { company } = useCompany();

  const [activeTab, setActiveTab] = useState('audits');
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

  const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'audits', label: 'Audits', icon: '🔍' },
    { id: 'history', label: 'History', icon: '📅' },
    { id: 'reports', label: 'Reports', icon: '📈' },
  ];

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
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ⚙️ Settings
            </button>
          </div>
        </div>

        <div className="flex gap-1">
          {TABS.map((tab) => (
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
        {activeTab === 'dashboard' && <AuditDashboard audits={audits} auditTypes={auditTypes} />}
        {activeTab === 'audits' && (
          <AuditList
            audits={audits}
            auditTypes={auditTypes}
            company={company}
            companyId={companyId}
            currentUser={currentUser}
            userRole={userRole}
            employees={employees}
            showSuccess={showSuccess}
            showError={showError}
            setSelectedAudit={setSelectedAudit}
          />
        )}
        {activeTab === 'history' && <AuditHistory audits={audits} auditTypes={auditTypes} company={company} employees={employees} />}
        {activeTab === 'reports' && <AuditReports audits={audits} auditTypes={auditTypes} company={company} employees={employees} />}
      </div>

      {selectedAudit && (() => {
        const liveAudit = audits.find((a) => a.id === selectedAudit.id) || selectedAudit;
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
          audits={audits}
          onClose={() => setShowCalendar(false)}
          onSelectAudit={(a) => {
            setShowCalendar(false);
            setActiveTab('audits');
            const fresh = audits.find((x) => x.id === a.id);
            setSelectedAudit(fresh || a);
          }}
        />
      )}
    </div>
  );
}

