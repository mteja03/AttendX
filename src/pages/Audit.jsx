import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocs,
  runTransaction,
  increment,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { trackPageView } from '../utils/analytics';

/** Human-readable ref, e.g. AUD-2026-001 (counter resets each calendar year). */
async function generateAuditId(companyId) {
  const counterRef = doc(db, 'companies', companyId, 'settings', 'auditCounter');
  const year = new Date().getFullYear();
  const padded = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    let num;
    if (!snap.exists()) {
      num = 1;
      transaction.set(counterRef, { count: 1, year });
    } else {
      const data = snap.data() || {};
      if (data.year !== year) {
        num = 1;
        transaction.set(counterRef, { count: 1, year });
      } else {
        num = (data.count || 0) + 1;
        transaction.update(counterRef, { count: increment(1) });
      }
    }
    return String(num).padStart(3, '0');
  });
  return `AUD-${year}-${padded}`;
}

const AUDIT_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'audits', label: 'Audits', icon: '🔍' },
];

const STATUS_COLORS = {
  Assigned: 'bg-purple-100 text-purple-700',
  'In Progress': 'bg-blue-100 text-blue-700',
  Submitted: 'bg-orange-100 text-orange-700',
  'Under Review': 'bg-pink-100 text-pink-700',
  Closed: 'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700',
};

const AUDIT_COLORS = [
  '#8B5CF6',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#1B6B6B',
  '#6366F1',
  '#14B8A6',
];

function itemFullyAnswered(item) {
  const yn = item.yesNoResponse;
  const hasYn = yn === 'Yes' || yn === 'No' || yn === 'N/A';
  const hasRating = typeof item.rating === 'number' && item.rating >= 1 && item.rating <= 5;
  return hasYn && hasRating;
}

function normalizeChecklistItem(item) {
  const next = { ...item };
  delete next.riskLevel;
  if (next.yesNoResponse == null && ['Yes', 'No', 'N/A'].includes(next.response)) {
    next.yesNoResponse = next.response;
  }
  if (next.rating == null && typeof next.response === 'number' && next.response >= 1 && next.response <= 5) {
    next.rating = next.response;
  }
  return next;
}

function AuditDashboard({ audits, auditTypes, company: _company }) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const total = audits.length;
  const assigned = audits.filter((a) => a.status === 'Assigned').length;
  const inProgress = audits.filter((a) => a.status === 'In Progress').length;
  const submitted = audits.filter((a) => a.status === 'Submitted').length;
  const underReview = audits.filter((a) => a.status === 'Under Review').length;
  const closed = audits.filter((a) => a.status === 'Closed').length;

  const overdue = audits.filter((a) => {
    if (a.status === 'Closed') return false;
    const end = a.endDate || a.dueDate;
    if (!end) return false;
    return new Date(end) < now;
  }).length;

  const closedAudits = audits.filter((a) => a.status === 'Closed');
  const complianceRate =
    closedAudits.length > 0
      ? Math.round(
          closedAudits.reduce((sum, a) => {
            const items = a.checklist || [];
            const compliant = items.filter((i) => i.yesNoResponse === 'Yes').length;
            return sum + (items.length > 0 ? (compliant / items.length) * 100 : 0);
          }, 0) / closedAudits.length,
        )
      : null;

  const riskCounts = {
    Critical: audits.filter((a) => a.riskLevel === 'Critical' && a.status !== 'Closed').length,
    High: audits.filter((a) => a.riskLevel === 'High' && a.status !== 'Closed').length,
    Medium: audits.filter((a) => a.riskLevel === 'Medium' && a.status !== 'Closed').length,
    Low: audits.filter((a) => a.riskLevel === 'Low' && a.status !== 'Closed').length,
  };

  const upcomingActions = audits
    .flatMap((a) =>
      (a.checklist || [])
        .filter((i) => i.yesNoResponse === 'No' && i.ownerName && !i.resolved && i.targetDate)
        .map((i) => ({
          ...i,
          auditName: a.auditTypeName || a.title,
          auditId: a.id,
          branch: a.branch || a.location,
          daysLeft: Math.ceil((new Date(i.targetDate) - now) / (1000 * 60 * 60 * 24)),
        })),
    )
    .filter((i) => i.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const overdueActions = audits
    .flatMap((a) =>
      (a.checklist || [])
        .filter(
          (i) =>
            i.yesNoResponse === 'No' &&
            i.ownerName &&
            !i.resolved &&
            i.targetDate &&
            new Date(i.targetDate) < now,
        )
        .map((i) => ({
          ...i,
          auditName: a.auditTypeName,
          branch: a.branch || a.location,
          daysOverdue: Math.ceil((now - new Date(i.targetDate)) / (1000 * 60 * 60 * 24)),
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
    { label: 'Assigned', count: assigned, color: '#8B5CF6', bg: '#EDE9FE' },
    { label: 'In Progress', count: inProgress, color: '#3B82F6', bg: '#DBEAFE' },
    { label: 'Submitted', count: submitted, color: '#F97316', bg: '#FEF3C7' },
    { label: 'Under Review', count: underReview, color: '#EC4899', bg: '#FBEAF0' },
    { label: 'Closed', count: closed, color: '#10B981', bg: '#D1FAE5' },
  ];

  const maxPipeline = Math.max(...pipeline.map((p) => p.count), 1);

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

        <div
          className={`border rounded-2xl p-5 ${overdue > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}
        >
          <div className="flex items-center justify-between mb-3">
            <p className={`text-xs ${overdue > 0 ? 'text-red-500' : 'text-gray-400'}`}>Overdue</p>
            <span className="text-xl">⚠️</span>
          </div>
          <p className={`text-3xl font-bold ${overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>{overdue}</p>
          <p className={`text-xs mt-1 ${overdue > 0 ? 'text-red-400' : 'text-gray-400'}`}>Past end date</p>
        </div>

        <div
          className={`border rounded-2xl p-5 ${
            overdueActions.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <p className={`text-xs ${overdueActions.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
              Overdue Actions
            </p>
            <span className="text-xl">🔴</span>
          </div>
          <p
            className={`text-3xl font-bold ${overdueActions.length > 0 ? 'text-amber-700' : 'text-gray-900'}`}
          >
            {overdueActions.length}
          </p>
          <p className={`text-xs mt-1 ${overdueActions.length > 0 ? 'text-amber-500' : 'text-gray-400'}`}>
            Need immediate fix
          </p>
        </div>

        {complianceRate !== null ? (
          <div
            className={`border rounded-2xl p-5 ${
              complianceRate >= 80
                ? 'bg-green-50 border-green-100'
                : complianceRate >= 60
                  ? 'bg-amber-50 border-amber-100'
                  : 'bg-red-50 border-red-100'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500">Compliance Rate</p>
              <span className="text-xl">📊</span>
            </div>
            <p
              className={`text-3xl font-bold ${
                complianceRate >= 80 ? 'text-green-700' : complianceRate >= 60 ? 'text-amber-700' : 'text-red-700'
              }`}
            >
              {complianceRate}%
            </p>
            <p className="text-xs text-gray-400 mt-1">From closed audits</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-400">Compliance Rate</p>
              <span className="text-xl">📊</span>
            </div>
            <p className="text-3xl font-bold text-gray-300">—</p>
            <p className="text-xs text-gray-400 mt-1">No closed audits yet</p>
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
              {
                label: 'Critical',
                icon: '🔴',
                color: '#EF4444',
                bg: 'bg-red-50',
                border: 'border-red-100',
                text: 'text-red-700',
              },
              {
                label: 'High',
                icon: '🟠',
                color: '#F97316',
                bg: 'bg-orange-50',
                border: 'border-orange-100',
                text: 'text-orange-700',
              },
              {
                label: 'Medium',
                icon: '🟡',
                color: '#F59E0B',
                bg: 'bg-amber-50',
                border: 'border-amber-100',
                text: 'text-amber-700',
              },
              {
                label: 'Low',
                icon: '🟢',
                color: '#10B981',
                bg: 'bg-green-50',
                border: 'border-green-100',
                text: 'text-green-700',
              },
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
          {Object.values(riskCounts).every((v) => v === 0) && (
            <p className="text-center text-xs text-gray-400 mt-2">No active audits</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center justify-between">
            🔴 Overdue Action Items
            {overdueActions.length > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                {overdueActions.length}
              </span>
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
                  <p className="text-xs font-medium text-gray-800 mb-1.5 line-clamp-2">{item.question}</p>
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
                    item.daysLeft <= 0
                      ? 'bg-red-50 border-red-100'
                      : item.daysLeft <= 2
                        ? 'bg-orange-50 border-orange-100'
                        : 'bg-amber-50 border-amber-100'
                  }`}
                >
                  <p className="text-xs font-medium text-gray-800 mb-1.5 line-clamp-2">{item.question}</p>
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
                  <div className="w-7 h-7 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 truncate">{name}</span>
                      <span className="text-xs font-bold text-gray-700 ml-2">{count}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1B6B6B] rounded-full"
                        style={{
                          width: `${Math.max((count / (workloadList[0][1] || 1)) * 100, 8)}%`,
                        }}
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
                audit.status !== 'Closed' &&
                (audit.endDate || audit.dueDate) &&
                new Date(audit.endDate || audit.dueDate) < now;
              return (
                <div
                  key={audit.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
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
                        {audit.endDate ? ` · Ends ${audit.endDate}` : ''}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ml-2 ${
                      isOverdueAudit ? 'bg-red-100 text-red-700' : STATUS_COLORS[audit.status] || STATUS_COLORS.Assigned
                    }`}
                  >
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

const AuditTemplates = forwardRef(function AuditTemplates(
  { companyId, currentUser, saving, setSaving, showSuccess, showError },
  ref,
) {
  const [showModal, setShowModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [selectedColor, setSelectedColor] = useState(AUDIT_COLORS[0]);
  const [form, setForm] = useState({
    auditCategory: '',
    name: '',
    description: '',
    color: AUDIT_COLORS[0],
    riskLevel: 'Medium',
  });
  const [checklist, setChecklist] = useState([]);
  const [newSection, setNewSection] = useState('');
  const [sections, setSections] = useState(['General']);

  const resetForm = () => {
    setForm({ auditCategory: '', name: '', description: '', color: AUDIT_COLORS[0], riskLevel: 'Medium' });
    setChecklist([]);
    setSections(['General']);
    setSelectedColor(AUDIT_COLORS[0]);
    setEditingType(null);
  };

  const openEdit = (type) => {
    setEditingType(type);
    setForm({
      auditCategory: type.auditCategory || '',
      name: type.name,
      description: type.description || '',
      color: type.color || AUDIT_COLORS[0],
      riskLevel: type.riskLevel || 'Medium',
    });
    setSelectedColor(type.color || AUDIT_COLORS[0]);
    const tpl = (type.checklistTemplate || []).map((i) => {
      const { type: _t, riskLevel: _rl, ...rest } = i;
      return {
        ...rest,
        required: i.required !== false,
      };
    });
    setChecklist(tpl);
    const uniqueSections = [...new Set(tpl.map((x) => x.section))];
    setSections(uniqueSections.length > 0 ? uniqueSections : ['General']);
    setShowModal(true);
  };

  const addChecklistItem = (section) => {
    const newItem = {
      id: `item_${Date.now()}`,
      section,
      question: '',
      required: true,
      order: checklist.length,
    };
    setChecklist((prev) => [...prev, newItem]);
  };

  const updateItem = (id, field, value) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const removeItem = (id) => {
    setChecklist((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSave = async () => {
    if (!form.auditCategory) {
      showError('Select Internal or External audit');
      return;
    }
    if (!form.name.trim()) {
      showError('Enter template name');
      return;
    }
    if (checklist.length === 0) {
      showError('Add at least one checklist item');
      return;
    }
    const emptyItems = checklist.filter((i) => !i.question.trim());
    if (emptyItems.length > 0) {
      showError('All checklist items need a question');
      return;
    }

    try {
      setSaving(true);
      const checklistTemplate = checklist.map((item, idx) => {
        const { type: _omit, response: _r, riskLevel: _rl, ...rest } = item;
        return { ...rest, order: idx };
      });
      const data = {
        auditCategory: form.auditCategory,
        name: form.name.trim(),
        description: form.description.trim(),
        color: selectedColor,
        riskLevel: form.riskLevel || 'Medium',
        checklistTemplate,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.email || '',
      };

      if (editingType) {
        await updateDoc(doc(db, 'companies', companyId, 'auditTypes', editingType.id), data);
        showSuccess('Audit template updated!');
      } else {
        await addDoc(collection(db, 'companies', companyId, 'auditTypes'), {
          ...data,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.email || '',
        });
        showSuccess('Audit template created!');
      }
      setShowModal(false);
      resetForm();
    } catch (e) {
      showError(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type) => {
    if (!window.confirm(`Delete audit template "${type.name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'companies', companyId, 'auditTypes', type.id));
      showSuccess(`"${type.name}" deleted`);
    } catch (e) {
      showError('Failed to delete');
    }
  };

  useImperativeHandle(ref, () => ({
    openNew: () => {
      resetForm();
      setShowModal(true);
    },
    openEdit,
    deleteType: handleDelete,
  }));

  return (
    <>
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">{editingType ? 'Edit Audit Template' : 'New Audit Template'}</h2>
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
              >
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
                {form.auditCategory && (
                  <p className="text-xs text-gray-400 mt-1">
                    {form.auditCategory === 'Internal'
                      ? 'Conducted by internal team members'
                      : 'Conducted by external auditors'}
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Template Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Cash Handling Audit, Compliance Audit, Safety Audit"
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
                      onClick={() => setSelectedColor(color)}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        selectedColor === color ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'
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
                    {
                      value: 'Low',
                      color: 'bg-green-50 border-green-200 text-green-700',
                      active: 'bg-green-500 border-green-500 text-white',
                      icon: '🟢',
                    },
                    {
                      value: 'Medium',
                      color: 'bg-amber-50 border-amber-200 text-amber-700',
                      active: 'bg-amber-500 border-amber-500 text-white',
                      icon: '🟡',
                    },
                    {
                      value: 'High',
                      color: 'bg-orange-50 border-orange-200 text-orange-700',
                      active: 'bg-orange-500 border-orange-500 text-white',
                      icon: '🟠',
                    },
                    {
                      value: 'Critical',
                      color: 'bg-red-50 border-red-200 text-red-700',
                      active: 'bg-red-500 border-red-500 text-white',
                      icon: '🔴',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, riskLevel: opt.value }))}
                      className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.riskLevel === opt.value ? opt.active : opt.color
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
                  <span className="text-xs text-gray-400">{checklist.length} items</span>
                </div>

                {sections.map((section) => (
                  <div key={section} className="mb-4">
                    <div className="flex items-center justify-between py-2 border-b border-gray-200 mb-2">
                      <h4 className="text-sm font-semibold text-gray-700">{section}</h4>
                      <button type="button" onClick={() => addChecklistItem(section)} className="text-xs text-[#1B6B6B] hover:underline">
                        + Add item
                      </button>
                    </div>

                    {checklist
                      .filter((i) => i.section === section)
                      .map((item) => (
                        <div key={item.id} className="flex gap-2 mb-3 p-3 bg-gray-50 rounded-xl">
                          <div className="flex-1 space-y-2">
                            <input
                              value={item.question}
                              onChange={(e) => updateItem(item.id, 'question', e.target.value)}
                              placeholder="Checklist item question..."
                              className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                            />
                            <div className="flex gap-2 items-center flex-wrap">
                              <div className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-lg">
                                <span className="text-xs text-gray-400">✅ Yes/No + ⭐ Rating 1-5</span>
                              </div>
                              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.required}
                                  onChange={(e) => updateItem(item.id, 'required', e.target.checked)}
                                  className="accent-[#1B6B6B]"
                                />
                                Required
                              </label>
                            </div>
                          </div>
                          <button type="button" onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 px-1 flex-shrink-0 self-start mt-2">
                            ✕
                          </button>
                        </div>
                      ))}

                    {checklist.filter((i) => i.section === section).length === 0 && (
                      <button
                        type="button"
                        onClick={() => addChecklistItem(section)}
                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors"
                      >
                        + Add first item
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex gap-2 mt-3">
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
              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
              >
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
    </>
  );
});

function formatAuditTimestamp(val) {
  if (val == null) return null;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toLocaleDateString('en-IN');
    } catch {
      return null;
    }
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN');
}

function AuditDetail({ audit, companyId, currentUser, employees = [], onClose, showSuccess, showError }) {
  const [checklist, setChecklist] = useState(() => (audit.checklist || []).map(normalizeChecklistItem));
  const [saving, setSaving] = useState(false);
  const [managerComment, setManagerComment] = useState(audit.managerComments || '');
  const [detailTab, setDetailTab] = useState('overview');
  const [ownerSearch, setOwnerSearch] = useState({});
  const [showOwnerDropdown, setShowOwnerDropdown] = useState({});
  const ownerRefs = useRef({});

  const isReadOnly =
    audit.status === 'Submitted' || audit.status === 'Under Review' || audit.status === 'Closed';

  useEffect(() => {
    setChecklist((audit.checklist || []).map(normalizeChecklistItem));
    setManagerComment(audit.managerComments || '');
    setDetailTab('overview');
    setOwnerSearch({});
    setShowOwnerDropdown({});
  }, [audit.id]);

  useEffect(() => {
    const handleClick = (e) => {
      Object.keys(ownerRefs.current).forEach((itemId) => {
        const node = ownerRefs.current[itemId];
        if (node && !node.contains(e.target)) {
          setShowOwnerDropdown((prev) => ({ ...prev, [itemId]: false }));
          setOwnerSearch((prev) => ({ ...prev, [itemId]: undefined }));
        }
      });
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const completedCount = useMemo(() => checklist.filter((i) => itemFullyAnswered(i)).length, [checklist]);

  const findings = useMemo(() => checklist.filter((i) => i.yesNoResponse === 'No'), [checklist]);
  const actionItems = useMemo(() => findings.filter((i) => i.ownerName), [findings]);
  const resolvedItems = useMemo(() => actionItems.filter((i) => i.resolved === true), [actionItems]);

  const updateItemResponse = (id, field, value) => {
    setChecklist((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleSaveDraft = async () => {
    try {
      setSaving(true);
      const payload = {
        checklist,
        completedItems: completedCount,
        status: audit.status === 'Assigned' ? 'In Progress' : audit.status,
        lastSavedAt: serverTimestamp(),
        lastSavedBy: currentUser?.email || '',
      };
      if (audit.status === 'Submitted' || audit.status === 'Under Review' || audit.status === 'Closed') {
        payload.managerComments = managerComment;
      }
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), payload);
      showSuccess('Draft saved!');
    } catch (e) {
      showError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    const requiredIncomplete = checklist.filter((i) => i.required && !itemFullyAnswered(i));
    if (requiredIncomplete.length > 0) {
      showError(
        `Complete all required items. ${requiredIncomplete.length} items need both Yes/No and Rating.`,
      );
      return;
    }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        checklist,
        completedItems: completedCount,
        status: 'Submitted',
        submittedAt: serverTimestamp(),
        submittedBy: currentUser?.email || '',
        auditorSignature: currentUser?.email || '',
      });
      showSuccess('Audit submitted!');
      onClose();
    } catch (e) {
      showError(`Submit failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        checklist,
        status: 'Closed',
        closedAt: serverTimestamp(),
        closedBy: currentUser?.email || '',
        managerComments: managerComment,
        resolvedCount: resolvedItems.length,
        totalActionItems: actionItems.length,
      });
      showSuccess('Audit closed successfully!');
      onClose();
    } catch (e) {
      showError(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSendBack = async () => {
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        checklist,
        status: 'In Progress',
        managerComments: managerComment,
        sentBackAt: serverTimestamp(),
        sentBackBy: currentUser?.email || '',
      });
      showSuccess('Sent back to auditor');
      onClose();
    } catch (e) {
      showError(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const sections = [...new Set(checklist.map((i) => i.section))];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-start justify-between p-6 border-b flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="text-lg font-semibold text-gray-800">{audit.title || audit.auditTypeName}</h2>
              {audit.auditRefId ? (
                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{audit.auditRefId}</span>
              ) : null}
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[audit.status] || STATUS_COLORS.Assigned}`}>
                {audit.status}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs text-gray-400">
                {audit.branch || audit.location || '—'} · End: {audit.endDate || audit.dueDate || 'Not set'} · Auditor:{' '}
                {audit.auditorName || '—'}
              </p>
              {audit.category && <span className="text-xs text-gray-400">{audit.category}</span>}
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-400 mb-1.5">Audit Team</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {audit.auditorName && (
                  <div className="flex items-center gap-1.5 bg-[#E8F5F5] px-2.5 py-1 rounded-full">
                    <div className="w-4 h-4 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold">
                      {audit.auditorName?.charAt(0)}
                    </div>
                    <span className="text-xs text-[#1B6B6B] font-medium">{audit.auditorName}</span>
                    <span className="text-xs text-[#1B6B6B]/60">Lead</span>
                  </div>
                )}
                {(audit.teamMembers || []).map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-full"
                  >
                    <div className="w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold">
                      {m.fullName?.charAt(0)}
                    </div>
                    <span className="text-xs text-gray-600">{m.fullName}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
            ✕
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-50 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-gray-500">Progress</p>
            <p className="text-xs font-medium text-gray-700">
              {completedCount} / {checklist.length} items
            </p>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1B6B6B] rounded-full transition-all"
              style={{
                width: checklist.length > 0 ? `${Math.round((completedCount / checklist.length) * 100)}%` : '0%',
              }}
            />
          </div>
        </div>

        {(audit.status === 'Submitted' || audit.status === 'Under Review' || audit.status === 'Closed') && (
          <div className="px-6 pt-4 pb-0 border-b border-gray-100 flex-shrink-0">
            <div className="flex gap-1">
              {[
                { id: 'overview', label: '📊 Overview' },
                { id: 'findings', label: `⚠️ Findings (${findings.length})` },
                { id: 'actions', label: `✅ Action Items (${actionItems.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDetailTab(tab.id)}
                  className={`px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
                    detailTab === tab.id
                      ? 'border-[#1B6B6B] text-[#1B6B6B] bg-[#E8F5F5]'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {(audit.status === 'Assigned' || audit.status === 'In Progress') && (
            <div className="space-y-6">
              {sections.map((section) => (
                <div key={section}>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 pb-2 border-b border-gray-100">{section}</h4>
                  <div className="space-y-4">
                    {checklist
                      .filter((i) => i.section === section)
                      .map((item, idx) => (
                        <div
                          key={item.id}
                          className={`p-4 rounded-xl border transition-colors ${
                            item.yesNoResponse != null &&
                            item.yesNoResponse !== '' &&
                            typeof item.rating === 'number' &&
                            item.rating >= 1 &&
                            item.rating <= 5
                              ? 'bg-green-50 border-green-100'
                              : 'bg-white border-gray-100'
                          }`}
                        >
                          <div className="flex items-start gap-2 min-w-0 mb-3">
                            <span className="text-xs font-medium text-gray-400 mt-0.5 w-5 flex-shrink-0">{idx + 1}.</span>
                            <p className="text-sm font-medium text-gray-800">
                              {item.question}
                              {item.required && <span className="text-red-400 ml-1">*</span>}
                            </p>
                          </div>

                          <div className="ml-7 space-y-3">
                            <div>
                              <p className="text-xs text-gray-400 mb-1.5 font-medium">Compliance Check</p>
                              <div className="flex gap-2">
                                {['Yes', 'No', 'N/A'].map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => updateItemResponse(item.id, 'yesNoResponse', opt)}
                                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                                      item.yesNoResponse === opt
                                        ? opt === 'Yes'
                                          ? 'bg-green-500 text-white'
                                          : opt === 'No'
                                            ? 'bg-red-500 text-white'
                                            : 'bg-gray-500 text-white'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <p className="text-xs text-gray-400 mb-1.5 font-medium">Quality Rating</p>
                              <div className="flex gap-2 items-center flex-wrap">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => updateItemResponse(item.id, 'rating', n)}
                                    className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                                      item.rating === n ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}
                                  >
                                    {n}
                                  </button>
                                ))}
                                {item.rating != null && (
                                  <span className="text-xs text-gray-400 ml-1">
                                    {item.rating === 1 && 'Poor'}
                                    {item.rating === 2 && 'Fair'}
                                    {item.rating === 3 && 'Good'}
                                    {item.rating === 4 && 'Very Good'}
                                    {item.rating === 5 && 'Excellent'}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <input
                                value={item.remarks || ''}
                                onChange={(e) => updateItemResponse(item.id, 'remarks', e.target.value)}
                                placeholder="Remarks / observations..."
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]"
                              />
                            </div>

                            {item.yesNoResponse === 'No' && (
                              <div className="p-3 bg-red-50 rounded-lg border border-red-100 space-y-2">
                                <p className="text-xs font-medium text-red-700">⚠️ Non-compliant — assign owner</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <div
                                    ref={(el) => {
                                      ownerRefs.current[item.id] = el;
                                    }}
                                    className="relative"
                                  >
                                    <label className="text-xs text-gray-400 block mb-1">Owner (responsible to fix)</label>
                                    <input
                                      type="text"
                                      value={
                                        ownerSearch[item.id] !== undefined ? ownerSearch[item.id] : item.ownerName || ''
                                      }
                                      disabled={isReadOnly}
                                      placeholder="Search employee..."
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setOwnerSearch((prev) => ({ ...prev, [item.id]: v }));
                                        setShowOwnerDropdown((prev) => ({ ...prev, [item.id]: true }));
                                        if (!v) {
                                          setChecklist((prev) =>
                                            prev.map((it) =>
                                              it.id !== item.id
                                                ? it
                                                : { ...it, ownerName: '', ownerId: '', ownerEmail: '' },
                                            ),
                                          );
                                        }
                                      }}
                                      onFocus={() => setShowOwnerDropdown((prev) => ({ ...prev, [item.id]: true }))}
                                      className="w-full border rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:border-red-300 disabled:bg-gray-50"
                                    />
                                    {showOwnerDropdown[item.id] && !isReadOnly && (
                                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-40 overflow-y-auto">
                                        {(employees || [])
                                          .filter(
                                            (e) =>
                                              e.status === 'Active' &&
                                              (!ownerSearch[item.id] ||
                                                e.fullName?.toLowerCase().includes(ownerSearch[item.id].toLowerCase())),
                                          )
                                          .slice(0, 8)
                                          .map((emp) => (
                                            <div
                                              key={emp.id}
                                              role="button"
                                              tabIndex={0}
                                              onMouseDown={(e) => {
                                                e.preventDefault();
                                                setChecklist((prev) =>
                                                  prev.map((it) =>
                                                    it.id !== item.id
                                                      ? it
                                                      : {
                                                          ...it,
                                                          ownerName: emp.fullName || '',
                                                          ownerId: emp.id,
                                                          ownerEmail: emp.email || '',
                                                        },
                                                  ),
                                                );
                                                setOwnerSearch((prev) => ({ ...prev, [item.id]: undefined }));
                                                setShowOwnerDropdown((prev) => ({ ...prev, [item.id]: false }));
                                              }}
                                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                                            >
                                              <div className="w-6 h-6 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                {emp.fullName?.charAt(0)}
                                              </div>
                                              <div className="min-w-0">
                                                <p className="text-xs font-medium text-gray-800 truncate">{emp.fullName}</p>
                                                {(emp.designation || emp.department) && (
                                                  <p className="text-xs text-gray-400 truncate">
                                                    {emp.designation || emp.department}
                                                  </p>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        {(employees || []).filter(
                                          (e) =>
                                            e.status === 'Active' &&
                                            (!ownerSearch[item.id] ||
                                              e.fullName?.toLowerCase().includes(ownerSearch[item.id].toLowerCase())),
                                        ).length === 0 && (
                                          <div className="px-3 py-3 text-center text-xs text-gray-400">No employees found</div>
                                        )}
                                      </div>
                                    )}
                                    {item.ownerName && !showOwnerDropdown[item.id] && (
                                      <div className="mt-1 flex items-center gap-1">
                                        <span className="text-xs text-green-600">✓ {item.ownerName}</span>
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <label className="text-xs text-gray-400 block mb-1">Target Fix Date</label>
                                    <input
                                      type="date"
                                      value={item.targetDate || ''}
                                      disabled={isReadOnly}
                                      onChange={(e) => updateItemResponse(item.id, 'targetDate', e.target.value)}
                                      className="w-full border rounded-lg px-2 py-2 text-xs bg-white focus:outline-none disabled:bg-gray-50"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(audit.status === 'Submitted' || audit.status === 'Under Review' || audit.status === 'Closed') && (
            <>
              {detailTab === 'overview' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-gray-800">{checklist.length}</p>
                      <p className="text-xs text-gray-400 mt-1">Total Items</p>
                    </div>
                    <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-green-700">
                        {checklist.filter((i) => i.yesNoResponse === 'Yes').length}
                      </p>
                      <p className="text-xs text-green-600 mt-1">Compliant</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-red-700">{findings.length}</p>
                      <p className="text-xs text-red-600 mt-1">Non-compliant</p>
                    </div>
                  </div>

                  {(() => {
                    const rated = checklist.filter((i) => i.rating != null && typeof i.rating === 'number');
                    const avg =
                      rated.length > 0
                        ? (rated.reduce((sum, i) => sum + i.rating, 0) / rated.length).toFixed(1)
                        : null;
                    if (!avg) return null;
                    const rounded = Math.round(Number(avg));
                    return (
                      <div className="bg-white border border-gray-100 rounded-xl p-4">
                        <p className="text-xs text-gray-400 mb-2">Average Quality Rating</p>
                        <div className="flex items-center gap-3">
                          <p className="text-3xl font-bold text-gray-800">{avg}</p>
                          <div>
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <div
                                  key={n}
                                  className={`w-6 h-6 rounded text-center text-xs leading-6 font-bold ${
                                    n <= rounded ? 'bg-[#1B6B6B] text-white' : 'bg-gray-100 text-gray-300'
                                  }`}
                                >
                                  {n}
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">out of 5.0</p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Audit Details</p>
                    {[
                      { label: 'Reference', value: audit.auditRefId || '—' },
                      { label: 'Template', value: audit.auditTypeName },
                      { label: 'Category', value: audit.auditCategory },
                      { label: 'Workforce category', value: audit.category },
                      { label: 'Risk Level', value: audit.riskLevel },
                      { label: 'Branch', value: audit.branch },
                      { label: 'Location', value: audit.location },
                      { label: 'Department', value: audit.department },
                      { label: 'Lead Auditor', value: audit.auditorName },
                      { label: 'Start Date', value: audit.startDate },
                      { label: 'End Date', value: audit.endDate || audit.dueDate },
                      { label: 'Submitted', value: formatAuditTimestamp(audit.submittedAt) },
                    ]
                      .filter((r) => r.value)
                      .map((row) => (
                        <div key={row.label} className="flex items-center justify-between">
                          <p className="text-xs text-gray-400">{row.label}</p>
                          <p className="text-xs font-medium text-gray-700">{row.value}</p>
                        </div>
                      ))}
                  </div>

                  {(audit.teamMembers?.length ?? 0) > 0 && (
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
                        {(audit.teamMembers || []).map((m) => (
                          <div key={m.id} className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-bold">
                              {m.fullName?.charAt(0)}
                            </div>
                            <p className="text-sm text-gray-700 flex-1">{m.fullName}</p>
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Member</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-2">Manager Comments</label>
                    <textarea
                      value={managerComment}
                      onChange={(e) => setManagerComment(e.target.value)}
                      disabled={audit.status === 'Closed'}
                      rows={3}
                      placeholder="Add review comments or instructions..."
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B] disabled:bg-gray-50"
                    />
                  </div>
                </div>
              )}

              {detailTab === 'findings' && (
                <div className="space-y-3">
                  {findings.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-3xl mb-2">✅</p>
                      <p className="text-sm font-medium text-gray-700">No findings</p>
                      <p className="text-xs text-gray-400">All checklist items passed</p>
                    </div>
                  ) : (
                    findings.map((item) => (
                      <div key={item.id} className="bg-red-50 border border-red-100 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <p className="text-sm font-medium text-gray-800">{item.question}</p>
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            ❌ Non-compliant
                          </span>
                        </div>
                        {item.remarks ? (
                          <div className="mb-3">
                            <p className="text-xs text-gray-400 mb-1">Auditor remarks</p>
                            <p className="text-sm text-gray-700 bg-white rounded-lg px-3 py-2 border border-red-100">{item.remarks}</p>
                          </div>
                        ) : null}
                        <div className="flex items-center gap-3 flex-wrap">
                          {item.ownerName ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">Owner:</span>
                              <span className="text-xs font-medium text-gray-700 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                                👤 {item.ownerName}
                              </span>
                            </div>
                          ) : null}
                          {item.targetDate ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">Fix by:</span>
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                                  new Date(item.targetDate) < new Date()
                                    ? 'bg-red-100 text-red-700 border-red-200'
                                    : 'bg-white text-gray-700 border-gray-200'
                                }`}
                              >
                                📅 {item.targetDate}
                              </span>
                            </div>
                          ) : null}
                          {item.rating != null ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">Rating:</span>
                              <span className="text-xs font-medium text-gray-700 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                                ⭐ {item.rating}/5
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'actions' && (
                <div className="space-y-3">
                  {actionItems.length > 0 && (
                    <div className="bg-white border border-gray-100 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500">Resolution Progress</p>
                        <p className="text-xs font-medium text-gray-700">
                          {resolvedItems.length} / {actionItems.length} resolved
                        </p>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{
                            width:
                              actionItems.length > 0
                                ? `${Math.round((resolvedItems.length / actionItems.length) * 100)}%`
                                : '0%',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {actionItems.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-3xl mb-2">📋</p>
                      <p className="text-sm font-medium text-gray-700">No action items</p>
                      <p className="text-xs text-gray-400">No non-compliant items with owners assigned</p>
                    </div>
                  ) : (
                    actionItems.map((item) => (
                      <div
                        key={item.id}
                        className={`border rounded-xl p-4 transition-all ${
                          item.resolved ? 'bg-green-50 border-green-100' : 'bg-white border-gray-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-medium text-gray-800 flex-1">{item.question}</p>
                          {audit.status !== 'Closed' ? (
                            <button
                              type="button"
                              onClick={() => updateItemResponse(item.id, 'resolved', !item.resolved)}
                              className={`text-xs px-3 py-1 rounded-full font-medium flex-shrink-0 transition-colors ${
                                item.resolved
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-700'
                              }`}
                            >
                              {item.resolved ? '✅ Resolved' : 'Mark Resolved'}
                            </button>
                          ) : (
                            <span
                              className={`text-xs px-3 py-1 rounded-full font-medium ${
                                item.resolved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {item.resolved ? '✅ Resolved' : '⏳ Pending'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400">Owner:</span>
                            <span className="text-xs font-medium text-gray-700">👤 {item.ownerName}</span>
                          </div>
                          {item.targetDate ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-400">Fix by:</span>
                              <span
                                className={`text-xs font-medium ${
                                  !item.resolved && new Date(item.targetDate) < new Date() ? 'text-red-600' : 'text-gray-700'
                                }`}
                              >
                                {!item.resolved && new Date(item.targetDate) < new Date() ? '⚠️ ' : ''}
                                {item.targetDate}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}

                  {audit.status !== 'Closed' && actionItems.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={saving}
                      className="w-full py-2.5 border border-[#1B6B6B] text-[#1B6B6B] rounded-xl text-sm font-medium hover:bg-[#E8F5F5] disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : '💾 Save Progress'}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t flex-shrink-0">
          {(audit.status === 'Assigned' || audit.status === 'In Progress') && (
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving}
                className="flex-1 py-2.5 border border-[#1B6B6B] text-[#1B6B6B] rounded-xl text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : '💾 Save Draft'}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
              >
                {saving ? 'Submitting...' : '📤 Submit'}
              </button>
            </div>
          )}

          {(audit.status === 'Submitted' || audit.status === 'Under Review') && (
            <div className="space-y-2">
              {actionItems.length > 0 && resolvedItems.length < actionItems.length && (
                <p className="text-xs text-amber-600 text-center">
                  ⚠️ {actionItems.length - resolvedItems.length} action item
                  {actionItems.length - resolvedItems.length !== 1 ? 's' : ''} pending resolution before closing
                </p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSendBack}
                  disabled={saving}
                  className="flex-1 py-2.5 border border-amber-400 text-amber-600 rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  ↩ Send Back
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={
                    saving ||
                    (actionItems.length > 0 && resolvedItems.length < actionItems.length)
                  }
                  title={
                    actionItems.length > 0 && resolvedItems.length < actionItems.length
                      ? 'Resolve all action items first'
                      : ''
                  }
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Closing...' : '✅ Close Audit'}
                </button>
              </div>
            </div>
          )}

          {audit.status === 'Closed' && (
            <div className="space-y-2">
              <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-center">
                <p className="text-xs font-medium text-green-700">
                  ✅ Audit closed by {audit.closedBy || 'manager'}
                </p>
              </div>
              <button type="button" onClick={onClose} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_ASSIGN_AUDIT_FORM = {
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

function AuditList({
  audits,
  auditTypes,
  company,
  companyId,
  currentUser,
  employees,
  saving,
  setSaving,
  showSuccess,
  showError,
  setShowSettings,
  setSelectedAudit,
  userRole,
  selectedAuditId,
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    type: '',
    branch: '',
    location: '',
    riskLevel: '',
    auditor: '',
    category: '',
  });
  const [leadSearch, setLeadSearch] = useState('');
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const leadRef = useRef(null);
  const teamRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (leadRef.current && !leadRef.current.contains(e.target)) setShowLeadDropdown(false);
      if (teamRef.current && !teamRef.current.contains(e.target)) setShowTeamDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!showCreateModal) {
      setLeadSearch('');
      setShowLeadDropdown(false);
      setTeamSearch('');
      setShowTeamDropdown(false);
    }
  }, [showCreateModal]);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const isAdmin = userRole === 'admin';

  const handleDeleteAudit = async (e, audit) => {
    e.stopPropagation();
    if (
      !window.confirm(
        `Delete "${audit.auditTypeName}" audit${audit.branch ? ` for ${audit.branch}` : ''}?\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'companies', companyId, 'audits', audit.id));
      if (selectedAuditId === audit.id) setSelectedAudit(null);
      showSuccess('Audit deleted');
    } catch (err) {
      showError(`Failed to delete: ${err.message}`);
    }
  };

  const isOverdue = (audit) => {
    if (audit.status === 'Closed') return false;
    const end = audit.endDate || audit.dueDate;
    if (!end) return false;
    return new Date(end) < now;
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filteredAudits = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const auditOverdue = (audit) => {
      if (audit.status === 'Closed') return false;
      const end = audit.endDate || audit.dueDate;
      if (!end) return false;
      return new Date(end) < today;
    };
    return audits.filter((audit) => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          audit.auditRefId?.toLowerCase().includes(q) ||
          audit.auditTypeName?.toLowerCase().includes(q) ||
          audit.branch?.toLowerCase().includes(q) ||
          audit.location?.toLowerCase().includes(q) ||
          audit.auditorName?.toLowerCase().includes(q) ||
          audit.department?.toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filters.status) {
        const effectiveStatus = auditOverdue(audit) ? 'Overdue' : audit.status;
        if (effectiveStatus !== filters.status) return false;
      }
      if (filters.type && audit.auditTypeId !== filters.type) return false;
      if (filters.branch && audit.branch !== filters.branch) return false;
      if (filters.location && audit.location !== filters.location) return false;
      if (filters.riskLevel && audit.riskLevel !== filters.riskLevel) return false;
      if (filters.auditor && audit.auditorName !== filters.auditor) return false;
      if (filters.category && audit.auditCategory !== filters.category) return false;
      return true;
    });
  }, [audits, search, filters]);

  const STATUSES = [
    {
      key: 'Overdue',
      color: '#EF4444',
      bg: 'bg-red-50',
      border: 'border-red-100',
      badge: 'bg-red-100 text-red-700',
      icon: '⚠️',
    },
    {
      key: 'Assigned',
      color: '#8B5CF6',
      bg: 'bg-purple-50',
      border: 'border-purple-100',
      badge: 'bg-purple-100 text-purple-700',
      icon: '📋',
    },
    {
      key: 'In Progress',
      color: '#3B82F6',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      badge: 'bg-blue-100 text-blue-700',
      icon: '✍️',
    },
    {
      key: 'Submitted',
      color: '#F97316',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      badge: 'bg-orange-100 text-orange-700',
      icon: '📤',
    },
    {
      key: 'Under Review',
      color: '#EC4899',
      bg: 'bg-pink-50',
      border: 'border-pink-100',
      badge: 'bg-pink-100 text-pink-700',
      icon: '👀',
    },
    {
      key: 'Closed',
      color: '#10B981',
      bg: 'bg-green-50',
      border: 'border-green-100',
      badge: 'bg-green-100 text-green-700',
      icon: '✅',
    },
  ];

  const [createForm, setCreateForm] = useState(() => ({ ...EMPTY_ASSIGN_AUDIT_FORM }));
  const [viewMode, setViewMode] = useState('list');

  const resetForm = () => {
    setCreateForm({ ...EMPTY_ASSIGN_AUDIT_FORM });
    setLeadSearch('');
    setTeamSearch('');
  };

  const handleCreate = async () => {
    if (!createForm.auditTypeId) {
      showError('Select an audit template');
      return;
    }
    if (!createForm.auditorId) {
      showError('Select a lead auditor');
      return;
    }
    if (!createForm.endDate) {
      showError('Set an end date');
      return;
    }

    try {
      setSaving(true);

      const auditRefId = await generateAuditId(companyId);
      const auditType = auditTypes.find((t) => t.id === createForm.auditTypeId);

      const checklist = (auditType?.checklistTemplate || []).map((item) => {
        const { type: _t, response: _r, riskLevel: _rl, ...rest } = item;
        return {
          ...rest,
          yesNoResponse: null,
          rating: null,
          remarks: '',
          isCompliant: null,
          ownerName: '',
          ownerId: '',
          ownerEmail: '',
          targetDate: '',
          resolved: false,
          managerComment: '',
        };
      });

      await addDoc(collection(db, 'companies', companyId, 'audits'), {
        auditRefId,
        auditTypeId: createForm.auditTypeId,
        auditTypeName: auditType?.name || '',
        auditTypeColor: auditType?.color || '#8B5CF6',
        auditCategory: auditType?.auditCategory || 'Internal',
        riskLevel: auditType?.riskLevel || 'Medium',
        title: auditType?.name || '',
        category: createForm.category,
        location: createForm.location,
        branch: createForm.branch,
        department: createForm.department,
        auditorId: createForm.auditorId,
        auditorName: createForm.auditorName.trim(),
        auditorEmail: (createForm.auditorEmail || '').trim().toLowerCase(),
        teamMembers: createForm.teamMembers,
        teamSize: 1 + createForm.teamMembers.length,
        startDate: createForm.startDate,
        endDate: createForm.endDate,
        dueDate: createForm.endDate,
        notes: createForm.notes,
        status: 'Assigned',
        checklist,
        totalItems: checklist.length,
        completedItems: 0,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.email || '',
        submittedAt: null,
        submittedBy: null,
        closedAt: null,
        closedBy: null,
        managerComments: '',
        overallScore: null,
      });

      showSuccess(
        createForm.teamMembers.length > 0
          ? `${auditRefId} assigned to ${createForm.auditorName} and team (${1 + createForm.teamMembers.length} people)!`
          : `${auditRefId} assigned to ${createForm.auditorName}!`,
      );
      setShowCreateModal(false);
      resetForm();
    } catch (e) {
      showError(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const progressRingC = 2 * Math.PI * 15.915;

  return (
    <div>
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-48 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by template, branch, auditor..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
              >
                ✕
              </button>
            ) : null}
          </div>

          <div className="flex border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-2.5 text-sm transition-colors ${
                viewMode === 'list' ? 'bg-[#1B6B6B] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              ☰ List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-2.5 text-sm transition-colors ${
                viewMode === 'kanban' ? 'bg-[#1B6B6B] text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              ⊞ Board
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl text-sm transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'border-[#1B6B6B] text-[#1B6B6B] bg-[#E8F5F5]'
                : 'border-gray-200 text-gray-600 bg-white hover:bg-gray-50'
            }`}
          >
            ⚙️ Filters
            {activeFilterCount > 0 ? (
              <span className="bg-[#1B6B6B] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            disabled={auditTypes.length === 0}
            title={auditTypes.length === 0 ? 'Create an audit template first' : ''}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50 whitespace-nowrap"
          >
            + Assign Audit
          </button>
        </div>

        {showFilters ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-700">Filter Audits</p>
              <button
                type="button"
                onClick={() => {
                  setFilters({
                    status: '',
                    type: '',
                    branch: '',
                    location: '',
                    riskLevel: '',
                    auditor: '',
                    category: '',
                  });
                }}
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
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Statuses</option>
                  {['Assigned', 'In Progress', 'Submitted', 'Under Review', 'Closed', 'Overdue'].map((s) => (
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
                  onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
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
                  onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Categories</option>
                  <option value="Internal">🏢 Internal</option>
                  <option value="External">🌐 External</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Risk Level</label>
                <select
                  value={filters.riskLevel}
                  onChange={(e) => setFilters((prev) => ({ ...prev, riskLevel: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Risk Levels</option>
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
                  onChange={(e) => setFilters((prev) => ({ ...prev, branch: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
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
                  onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
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
                <label className="text-xs text-gray-400 block mb-1">Lead Auditor</label>
                <select
                  value={filters.auditor}
                  onChange={(e) => setFilters((prev) => ({ ...prev, auditor: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                >
                  <option value="">All Auditors</option>
                  {[...new Set(audits.map((a) => a.auditorName).filter(Boolean))]
                    .sort()
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            {activeFilterCount > 0 ? (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-[#1B6B6B]">
                  {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active · {filteredAudits.length} result
                  {filteredAudits.length !== 1 ? 's' : ''}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            {filteredAudits.length} audit{filteredAudits.length !== 1 ? 's' : ''}
            {activeFilterCount > 0 || search ? ` (filtered from ${audits.length})` : ''}
          </p>
          {activeFilterCount > 0 || search ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilters({
                  status: '',
                  type: '',
                  branch: '',
                  location: '',
                  riskLevel: '',
                  auditor: '',
                  category: '',
                });
              }}
              className="text-xs text-[#1B6B6B] hover:underline"
            >
              Clear all filters
            </button>
          ) : null}
        </div>
      </div>

      {viewMode === 'list' ? (
        <div>
          {filteredAudits.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-base font-semibold text-gray-700 mb-2">
                {audits.length === 0 ? 'No audits yet' : 'No audits match filters'}
              </p>
              <p className="text-sm text-gray-400 mb-6">
                {audits.length === 0 ? 'Assign your first audit to get started' : 'Try adjusting your search or filters'}
              </p>
              {audits.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowCreateModal(true);
                  }}
                  disabled={auditTypes.length === 0}
                  className="px-5 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  + Assign First Audit
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAudits.map((audit) => {
                const overdueAudit = isOverdue(audit);
                const findings = (audit.checklist || []).filter((i) => i.yesNoResponse === 'No');
                const openActions = findings.filter((i) => i.ownerName && !i.resolved);
                const progress =
                  audit.totalItems > 0
                    ? Math.round(((audit.completedItems || 0) / audit.totalItems) * 100)
                    : 0;
                const strokeColor =
                  audit.status === 'Closed' ? '#10B981' : overdueAudit ? '#EF4444' : '#1B6B6B';
                return (
                  <div
                    key={audit.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedAudit(audit)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedAudit(audit);
                    }}
                    className={`relative bg-white rounded-2xl border cursor-pointer hover:shadow-md transition-all group overflow-hidden ${
                      overdueAudit ? 'border-red-200 hover:border-red-300' : 'border-gray-100 hover:border-[#4ECDC4]'
                    }`}
                  >
                    <div
                      className="h-1"
                      style={{ background: overdueAudit ? '#EF4444' : audit.auditTypeColor || '#8B5CF6' }}
                    />
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteAudit(e, audit)}
                        className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all flex-shrink-0 absolute top-3 right-3 z-10"
                        aria-label="Delete audit"
                      >
                        🗑️
                      </button>
                    ) : null}
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        <div
                          className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-base shadow-sm"
                          style={{ background: audit.auditTypeColor || '#8B5CF6' }}
                        >
                          {audit.auditTypeName?.charAt(0) || 'A'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-mono font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">
                              {audit.auditRefId || '—'}
                            </span>
                            <p className="text-sm font-semibold text-gray-800">{audit.auditTypeName}</p>
                            <span
                              className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                                overdueAudit
                                  ? 'bg-red-100 text-red-700'
                                  : STATUS_COLORS[audit.status] || STATUS_COLORS.Assigned
                              }`}
                            >
                              {overdueAudit ? '⚠️ Overdue' : audit.status}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                audit.riskLevel === 'Critical'
                                  ? 'bg-red-100 text-red-600'
                                  : audit.riskLevel === 'High'
                                    ? 'bg-orange-100 text-orange-600'
                                    : audit.riskLevel === 'Medium'
                                      ? 'bg-amber-100 text-amber-600'
                                      : 'bg-green-100 text-green-600'
                              }`}
                            >
                              {audit.riskLevel === 'Critical' && '🔴 '}
                              {audit.riskLevel === 'High' && '🟠 '}
                              {audit.riskLevel === 'Medium' && '🟡 '}
                              {audit.riskLevel === 'Low' && '🟢 '}
                              {audit.riskLevel || 'Medium'}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                audit.auditCategory === 'External'
                                  ? 'bg-purple-100 text-purple-600'
                                  : 'bg-blue-100 text-blue-600'
                              }`}
                            >
                              {audit.auditCategory === 'External' ? '🌐' : '🏢'} {audit.auditCategory || 'Internal'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap mt-1">
                            {audit.branch ? (
                              <span className="text-xs text-gray-500 flex items-center gap-1">🏢 {audit.branch}</span>
                            ) : null}
                            {audit.location ? (
                              <span className="text-xs text-gray-500 flex items-center gap-1">📍 {audit.location}</span>
                            ) : null}
                            {audit.department ? <span className="text-xs text-gray-500">· {audit.department}</span> : null}
                            {audit.auditorName ? (
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                👤 {audit.auditorName}
                                {(audit.teamMembers?.length || 0) > 0 ? (
                                  <span className="text-gray-400">+{audit.teamMembers.length}</span>
                                ) : null}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-3 flex-wrap mt-2">
                            {audit.startDate ? (
                              <span className="text-xs text-gray-400">📅 {audit.startDate}</span>
                            ) : null}
                            {audit.endDate ? (
                              <span
                                className={`text-xs font-medium ${overdueAudit ? 'text-red-600' : 'text-gray-400'}`}
                              >
                                {overdueAudit ? '⚠️' : '→'} {audit.endDate}
                              </span>
                            ) : null}
                            {findings.length > 0 ? (
                              <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                                {findings.length} finding{findings.length !== 1 ? 's' : ''}
                              </span>
                            ) : null}
                            {openActions.length > 0 ? (
                              <span className="text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">
                                {openActions.length} action{openActions.length !== 1 ? 's' : ''} open
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {audit.totalItems > 0 ? (
                            <>
                              <div className="relative w-12 h-12 mb-1">
                                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                                  <circle cx="18" cy="18" r="15.915" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                                  <circle
                                    cx="18"
                                    cy="18"
                                    r="15.915"
                                    fill="none"
                                    stroke={strokeColor}
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeDasharray={progressRingC}
                                    strokeDashoffset={progressRingC * (1 - progress / 100)}
                                  />
                                </svg>
                                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                                  {progress}%
                                </span>
                              </div>
                              <p className="text-xs text-gray-400">
                                {audit.completedItems || 0}/{audit.totalItems}
                              </p>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {viewMode === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUSES.map((status) => {
            const statusAudits = filteredAudits.filter((a) => {
              if (status.key === 'Overdue') return isOverdue(a);
              return a.status === status.key && !isOverdue(a);
            });
            return (
              <div key={status.key} className="flex-shrink-0 w-72">
                <div
                  className={`flex items-center justify-between p-3 rounded-xl mb-3 ${status.bg} border ${status.border}`}
                >
                  <div className="flex items-center gap-2">
                    <span>{status.icon}</span>
                    <span className="text-xs font-semibold text-gray-700">{status.key}</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status.badge}`}>{statusAudits.length}</span>
                </div>
                <div className="space-y-2">
                  {statusAudits.map((audit) => (
                    <div
                      key={audit.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedAudit(audit)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedAudit(audit);
                      }}
                      className="relative group bg-white border border-gray-100 rounded-xl p-4 cursor-pointer hover:shadow-sm hover:border-gray-200 transition-all"
                    >
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteAudit(e, audit)}
                          className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-200 hover:text-red-500 transition-all absolute top-2 right-2 z-10"
                          aria-label="Delete audit"
                        >
                          🗑️
                        </button>
                      ) : null}
                      <div className="flex items-start gap-2 mb-2">
                        <div
                          className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: audit.auditTypeColor || '#8B5CF6' }}
                        >
                          {audit.auditTypeName?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{audit.auditTypeName}</p>
                          {audit.branch ? <p className="text-xs text-gray-400 truncate">{audit.branch}</p> : null}
                          <p className="text-xs font-mono text-gray-300">{audit.auditRefId || '—'}</p>
                        </div>
                      </div>
                      {audit.auditorName ? (
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="w-4 h-4 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold">
                            {audit.auditorName.charAt(0)}
                          </div>
                          <p className="text-xs text-gray-500 truncate">{audit.auditorName}</p>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs ${isOverdue(audit) ? 'text-red-500 font-medium' : 'text-gray-400'}`}
                        >
                          {audit.endDate ? `Due ${audit.endDate}` : 'No date'}
                        </span>
                        {audit.totalItems > 0 ? (
                          <span className="text-xs text-gray-400">
                            {Math.round(((audit.completedItems || 0) / audit.totalItems) * 100)}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {statusAudits.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-300 border-2 border-dashed border-gray-100 rounded-xl">
                      No audits
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#E8F5F5] rounded-xl flex items-center justify-center text-lg">🔍</div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-800">Assign Audit</h2>
                    <p className="text-xs text-gray-400">Assign an audit to an auditor for a location</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Audit Template</p>
                {auditTypes.length === 0 ? (
                  <div className="p-4 border-2 border-dashed border-gray-200 rounded-xl text-center">
                    <p className="text-sm text-gray-400">
                      No templates yet.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateModal(false);
                          setShowSettings(true);
                        }}
                        className="text-[#1B6B6B] underline"
                      >
                        Create one in Settings
                      </button>
                    </p>
                  </div>
                ) : (
                  <>
                    <select
                      value={createForm.auditTypeId}
                      onChange={(e) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          auditTypeId: e.target.value,
                        }))
                      }
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">Select audit template...</option>
                      {auditTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {t.auditCategory || 'Internal'} · {t.riskLevel || 'Medium'} Risk
                        </option>
                      ))}
                    </select>
                    {createForm.auditTypeId &&
                      (() => {
                        const t = auditTypes.find((x) => x.id === createForm.auditTypeId);
                        if (!t) return null;
                        return (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                t.auditCategory === 'External' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {t.auditCategory === 'External' ? '🌐' : '🏢'} {t.auditCategory || 'Internal'}
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
                              {t.riskLevel === 'Critical' && '🔴 '}
                              {t.riskLevel === 'High' && '🟠 '}
                              {t.riskLevel === 'Medium' && '🟡 '}
                              {t.riskLevel === 'Low' && '🟢 '}
                              {t.riskLevel || 'Medium'}
                            </span>
                            <span className="text-xs text-gray-400">{(t.checklistTemplate || []).length} checklist items</span>
                          </div>
                        );
                      })()}
                  </>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Location</p>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Category</label>
                    <select
                      value={createForm.category}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, category: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">Select category...</option>
                      {(company?.categories || []).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">Location</label>
                    <select
                      value={createForm.location}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, location: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                    >
                      <option value="">Select location...</option>
                      {(company?.locations || []).map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Branch</label>
                      <select
                        value={createForm.branch}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, branch: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                      >
                        <option value="">Select branch...</option>
                        {(company?.branches || []).map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Department</label>
                      <select
                        value={createForm.department}
                        onChange={(e) => setCreateForm((prev) => ({ ...prev, department: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                      >
                        <option value="">Select department...</option>
                        {(company?.departments || []).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Audit Team</p>
                <div className="space-y-4">
                  <div ref={leadRef} className="relative">
                    <label className="text-xs text-gray-500 block mb-1.5">
                      Lead Auditor *
                      <span className="text-gray-400 font-normal ml-1">(responsible for submission)</span>
                    </label>
                    <input
                      type="text"
                      value={createForm.auditorId ? createForm.auditorName : leadSearch}
                      placeholder="Search auditor..."
                      onChange={(e) => {
                        setLeadSearch(e.target.value);
                        setShowLeadDropdown(true);
                        if (!e.target.value) {
                          setCreateForm((prev) => ({
                            ...prev,
                            auditorId: '',
                            auditorName: '',
                            auditorEmail: '',
                          }));
                        }
                      }}
                      onFocus={() => {
                        setLeadSearch('');
                        setShowLeadDropdown(true);
                        setCreateForm((prev) => ({
                          ...prev,
                          auditorId: '',
                          auditorName: '',
                          auditorEmail: '',
                        }));
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                    />
                    {showLeadDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto">
                        {employees
                          .filter(
                            (e) =>
                              e.status === 'Active' &&
                              !createForm.teamMembers.some((m) => m.id === e.id) &&
                              (!leadSearch ||
                                e.fullName?.toLowerCase().includes(leadSearch.toLowerCase()) ||
                                e.designation?.toLowerCase().includes(leadSearch.toLowerCase())),
                          )
                          .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', undefined, { sensitivity: 'base' }))
                          .slice(0, 8)
                          .map((emp) => (
                            <div
                              key={emp.id}
                              role="button"
                              tabIndex={0}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setCreateForm((prev) => ({
                                  ...prev,
                                  auditorId: emp.id,
                                  auditorName: emp.fullName,
                                  auditorEmail: emp.email || '',
                                  teamMembers: prev.teamMembers.filter((m) => m.id !== emp.id),
                                }));
                                setLeadSearch('');
                                setShowLeadDropdown(false);
                              }}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer border-b border-gray-50 last:border-0"
                            >
                              <div className="w-8 h-8 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {emp.fullName?.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{emp.fullName}</p>
                                <p className="text-xs text-gray-400 truncate">{emp.designation || emp.department || '—'}</p>
                              </div>
                            </div>
                          ))}
                        {employees.filter(
                          (e) =>
                            e.status === 'Active' &&
                            (!leadSearch || e.fullName?.toLowerCase().includes(leadSearch.toLowerCase())),
                        ).length === 0 && (
                          <div className="px-3 py-4 text-center text-sm text-gray-400">No employees found</div>
                        )}
                      </div>
                    )}
                    {createForm.auditorId && (
                      <div className="mt-2 flex items-center gap-2 p-2.5 bg-[#E8F5F5] rounded-xl">
                        <div className="w-6 h-6 rounded-full bg-[#1B6B6B] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {createForm.auditorName?.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-[#1B6B6B] font-medium">{createForm.auditorName}</p>
                          <p className="text-xs text-[#1B6B6B]/60">Lead Auditor</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateForm((prev) => ({
                              ...prev,
                              auditorId: '',
                              auditorName: '',
                              auditorEmail: '',
                            }));
                            setLeadSearch('');
                          }}
                          className="text-[#1B6B6B]/40 hover:text-[#1B6B6B] text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  <div ref={teamRef} className="relative">
                    <label className="text-xs text-gray-500 block mb-1.5">
                      Team Members
                      <span className="text-gray-400 font-normal ml-1">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={teamSearch}
                      placeholder="Search and add team members..."
                      onChange={(e) => {
                        setTeamSearch(e.target.value);
                        setShowTeamDropdown(true);
                      }}
                      onFocus={() => setShowTeamDropdown(true)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#1B6B6B]"
                    />
                    {showTeamDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto">
                        {employees
                          .filter(
                            (e) =>
                              e.status === 'Active' &&
                              e.id !== createForm.auditorId &&
                              !createForm.teamMembers.some((m) => m.id === e.id) &&
                              (!teamSearch ||
                                e.fullName?.toLowerCase().includes(teamSearch.toLowerCase()) ||
                                e.designation?.toLowerCase().includes(teamSearch.toLowerCase())),
                          )
                          .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', undefined, { sensitivity: 'base' }))
                          .slice(0, 8)
                          .map((emp) => (
                            <div
                              key={emp.id}
                              role="button"
                              tabIndex={0}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setCreateForm((prev) => ({
                                  ...prev,
                                  teamMembers: [
                                    ...prev.teamMembers,
                                    {
                                      id: emp.id,
                                      fullName: emp.fullName,
                                      email: emp.email || '',
                                      designation: emp.designation || emp.department || '',
                                    },
                                  ],
                                }));
                                setTeamSearch('');
                                setShowTeamDropdown(false);
                              }}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer border-b border-gray-50 last:border-0"
                            >
                              <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {emp.fullName?.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{emp.fullName}</p>
                                <p className="text-xs text-gray-400 truncate">{emp.designation || emp.department || '—'}</p>
                              </div>
                              <span className="text-xs text-[#1B6B6B]">+ Add</span>
                            </div>
                          ))}
                        {employees.filter(
                          (e) =>
                            e.status === 'Active' &&
                            e.id !== createForm.auditorId &&
                            !createForm.teamMembers.some((m) => m.id === e.id) &&
                            (!teamSearch || e.fullName?.toLowerCase().includes(teamSearch.toLowerCase())),
                        ).length === 0 && (
                          <div className="px-3 py-4 text-center text-sm text-gray-400">
                            {teamSearch ? 'No employees found' : 'All employees added'}
                          </div>
                        )}
                      </div>
                    )}
                    {createForm.teamMembers.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {createForm.teamMembers.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-100 rounded-xl"
                          >
                            <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {member.fullName?.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 truncate">{member.fullName}</p>
                            </div>
                            <span className="text-xs text-gray-400">Member</span>
                            <button
                              type="button"
                              onClick={() =>
                                setCreateForm((prev) => ({
                                  ...prev,
                                  teamMembers: prev.teamMembers.filter((m) => m.id !== member.id),
                                }))
                              }
                              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-300 hover:text-red-500 transition-colors text-sm flex-shrink-0"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {(createForm.auditorId || createForm.teamMembers.length > 0) && (
                      <div className="mt-2 p-2.5 bg-gray-50 rounded-xl">
                        <p className="text-xs text-gray-500">
                          👥 Team of <strong>{1 + createForm.teamMembers.length}</strong> — {createForm.auditorName || '—'}
                          {createForm.teamMembers.length > 0
                            ? ` + ${createForm.teamMembers.map((m) => (m.fullName || '').split(' ')[0]).join(', ')}`
                            : ''}
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
                      value={createForm.startDate}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1.5">End Date *</label>
                    <input
                      type="date"
                      value={createForm.endDate}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, endDate: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Notes for Auditor (optional)</label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any special instructions or context for the auditor..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
              {createForm.auditTypeId && createForm.auditorId && (
                <div className="mb-3 p-3 bg-[#E8F5F5] rounded-xl">
                  <p className="text-xs text-[#1B6B6B] font-medium">
                    📋 {auditTypes.find((t) => t.id === createForm.auditTypeId)?.name}
                    {' → '}
                    👥 Team of {1 + createForm.teamMembers.length}
                    {createForm.branch && ` · ${createForm.branch}`}
                    {createForm.endDate && ` · Ends ${createForm.endDate}`}
                  </p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving || !createForm.auditTypeId || !createForm.auditorId}
                  className="flex-[2] px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Assigning...' : '+ Assign Audit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Audit() {
  const { companyId } = useParams();
  const { currentUser, userRole } = useAuth();
  const { company } = useCompany();
  const auditTemplatesRef = useRef(null);

  const [activeTab, setActiveTab] = useState('audits');
  const [showSettings, setShowSettings] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [auditTypes, setAuditTypes] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState(null);
  const showSuccess = useCallback((msg) => {
    setToast({ type: 'success', msg });
    setTimeout(() => setToast(null), 3000);
  }, []);
  const showError = useCallback((msg) => {
    setToast({ type: 'error', msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

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
    if (!companyId) return undefined;
    getDocs(collection(db, 'companies', companyId, 'employees'))
      .then((snap) => {
        setEmployees(
          snap.docs
            .filter((d) => d.data().status === 'Active')
            .map((d) => ({ id: d.id, ...d.data() })),
        );
      })
      .catch(() => setEmployees([]));
    return undefined;
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
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Audit</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage audits and compliance tracking</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <div className="flex gap-1 flex-wrap">
            {AUDIT_TABS.map((tab) => (
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCalendar(true)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
              title="Audit Calendar"
            >
              📅
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              ⚙️ Settings
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'dashboard' && (
          <AuditDashboard audits={audits} auditTypes={auditTypes} company={company} />
        )}

        {activeTab === 'audits' && (
          <AuditList
            audits={audits}
            auditTypes={auditTypes}
            company={company}
            companyId={companyId}
            currentUser={currentUser}
            employees={employees}
            saving={saving}
            setSaving={setSaving}
            showSuccess={showSuccess}
            showError={showError}
            setShowSettings={setShowSettings}
            setSelectedAudit={setSelectedAudit}
            userRole={userRole}
            selectedAuditId={selectedAudit?.id}
          />
        )}
      </div>

      {showCalendar && (
        <AuditCalendar
          audits={audits}
          onClose={() => setShowCalendar(false)}
          onSelectAudit={(audit) => {
            setShowCalendar(false);
            setActiveTab('audits');
            const fresh = audits.find((a) => a.id === audit.id);
            setSelectedAudit(fresh || audit);
          }}
        />
      )}

      {selectedAudit && (
        <AuditDetail
          key={selectedAudit.id}
          audit={selectedAudit}
          companyId={companyId}
          currentUser={currentUser}
          employees={employees}
          onClose={() => setSelectedAudit(null)}
          showSuccess={showSuccess}
          showError={showError}
        />
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            role="presentation"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />
          <div className="relative bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-white flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#E8F5F5] rounded-xl flex items-center justify-center text-lg">⚙️</div>
                <div>
                  <h2 className="text-base font-semibold text-gray-800">Audit Settings</h2>
                  <p className="text-xs text-gray-400">Manage audit templates and checklist configurations</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="px-6 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Audit Templates</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {auditTypes.length} template{auditTypes.length !== 1 ? 's' : ''} configured
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  auditTemplatesRef.current?.openNew();
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#1B6B6B] text-white rounded-xl text-xs font-medium hover:bg-[#155858]"
              >
                + Add Template
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {auditTypes.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                  <p className="text-3xl mb-3">📋</p>
                  <p className="text-sm font-medium text-gray-600 mb-1">No audit templates yet</p>
                  <p className="text-xs text-gray-400 mb-4">Create your first template to start assigning audits</p>
                  <button
                    type="button"
                    onClick={() => {
                      auditTemplatesRef.current?.openNew();
                    }}
                    className="px-4 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium"
                  >
                    + Create Template
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {auditTypes.map((type) => (
                    <div
                      key={type.id}
                      className="bg-white border border-gray-100 rounded-2xl p-4 hover:border-gray-200 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div
                            className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-base"
                            style={{ background: type.color || '#8B5CF6' }}
                          >
                            {type.name?.charAt(0)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{type.name}</p>

                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  type.auditCategory === 'External' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                }`}
                              >
                                {type.auditCategory === 'External' ? '🌐' : '🏢'}{' '}
                                {type.auditCategory || 'Internal'}
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

                              <span className="text-xs text-gray-400">
                                {(type.checklistTemplate || []).length} items
                              </span>
                            </div>

                            {type.description && (
                              <p className="text-xs text-gray-400 mt-1 truncate">{type.description}</p>
                            )}

                            {[...new Set((type.checklistTemplate || []).map((i) => i.section))].length > 0 && (
                              <div className="flex gap-1 mt-2 flex-wrap">
                                {[...new Set((type.checklistTemplate || []).map((i) => i.section))].map((section) => (
                                  <span
                                    key={section}
                                    className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full"
                                  >
                                    {section} (
                                    {(type.checklistTemplate || []).filter((i) => i.section === section).length})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-1 ml-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => auditTemplatesRef.current?.openEdit(type)}
                            className="px-3 py-1.5 text-xs text-[#1B6B6B] hover:bg-[#E8F5F5] rounded-lg transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => auditTemplatesRef.current?.deleteType(type)}
                            className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <AuditTemplates
              ref={auditTemplatesRef}
              companyId={companyId}
              currentUser={currentUser}
              saving={saving}
              setSaving={setSaving}
              showSuccess={showSuccess}
              showError={showError}
            />
          </div>
        </div>
      )}
    </div>
  );
}
