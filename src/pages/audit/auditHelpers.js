/** Order matches board columns: lead → work → corrections → review pipeline → done */
export const AUDIT_STATUSES = [
  {
    key: 'Assigned',
    color: '#888780',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    badge: 'bg-gray-100 text-gray-600',
    dot: '#888780',
    topBar: '#B4B2A9',
    icon: '📋',
  },
  {
    key: 'In Progress',
    color: '#378ADD',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    badge: 'bg-blue-100 text-blue-800',
    dot: '#378ADD',
    topBar: '#378ADD',
    icon: '✍️',
  },
  {
    key: 'Submitted',
    color: '#EF9F27',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-800',
    dot: '#EF9F27',
    topBar: '#EF9F27',
    icon: '📤',
  },
  {
    key: 'Sent Back',
    color: '#E24B4A',
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-800',
    dot: '#E24B4A',
    topBar: '#E24B4A',
    icon: '↩',
  },
  {
    key: 'Under Review',
    color: '#7F77DD',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-800',
    dot: '#7F77DD',
    topBar: '#7F77DD',
    icon: '👀',
  },
  {
    key: 'Closed',
    color: '#639922',
    bg: 'bg-green-50',
    border: 'border-green-100',
    badge: 'bg-green-100 text-green-800',
    dot: '#639922',
    topBar: '#639922',
    icon: '✅',
  },
];

export const AUDIT_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#1B6B6B', '#6366F1', '#14B8A6'];

export const OVERALL_RESULTS = ['pass', 'fail', 'na'];

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  // Firestore Timestamp
  if (dateStr?.toDate) {
    try {
      const d = dateStr.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB') : '—';
    } catch {
      return '—';
    }
  }
  // Date object
  if (dateStr instanceof Date) {
    return !Number.isNaN(dateStr.getTime()) ? dateStr.toLocaleDateString('en-GB') : '—';
  }
  if (typeof dateStr !== 'string') return '—';
  try {
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

export function effStatus(status) {
  if (status === 'Scheduled') return 'Assigned';
  return status || '';
}

export function getAllowedStatuses(currentStatus, userRole) {
  const canMgr = userRole === 'admin' || userRole === 'hrmanager' || userRole === 'auditmanager' || userRole === 'companyadmin';
  if (!canMgr) return [];
  const s = effStatus(currentStatus);
  if (s === 'Submitted') return ['Under Review'];
  if (s === 'Under Review') return ['Closed', 'Sent Back'];
  if (s === 'Sent Back') return ['Under Review'];
  return [];
}

export function getFindingAddedByRole(userRole) {
  if (userRole === 'auditor') return 'auditor';
  if (userRole === 'auditmanager') return 'auditmanager';
  if (userRole === 'hrmanager') return 'auditmanager';
  if (userRole === 'admin') return 'auditmanager';
  if (userRole === 'companyadmin') return 'auditmanager';
  return 'auditor';
}

export function getAuditScore(audit) {
  const items = audit?.checklistReview || [];
  const reviewed = items.filter((i) => i.result === 'pass' || i.result === 'fail');
  if (reviewed.length === 0) return null;
  const passed = items.filter((i) => i.result === 'pass').length;
  return Math.round((passed / reviewed.length) * 100);
}

export function isAuditOverdue(audit) {
  if (
    audit?.status === 'Closed' ||
    audit?.status === 'Submitted' ||
    audit?.status === 'Under Review'
  ) {
    return false;
  }
  const end = audit?.endDate || audit?.dueDate;
  if (!end) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return new Date(end) < now;
}

// ─── Shared display utilities (used by multiple Audit sub-components) ────────

/** Legacy status → Tailwind class map used by AuditCalendar */
export const STATUS_COLORS = {
  Scheduled: 'bg-gray-100 text-gray-600',
  Assigned: 'bg-gray-100 text-gray-600',
  'In Progress': 'bg-blue-100 text-blue-800',
  Submitted: 'bg-amber-100 text-amber-800',
  'Sent Back': 'bg-red-100 text-red-800',
  'Under Review': 'bg-purple-100 text-purple-800',
  Closed: 'bg-green-100 text-green-800',
  Overdue: 'bg-red-100 text-red-700',
};

export function statusMeta(status) {
  const e = effStatus(status);
  return AUDIT_STATUSES.find((s) => s.key === e) || { badge: 'bg-gray-100 text-gray-600', icon: '•' };
}

export function normaliseAuditCategory(cat) {
  if (!cat) return 'Internal';
  const lower = String(cat).toLowerCase().trim();
  if (lower === 'external') return 'External';
  return 'Internal';
}

export function formatAuditDocSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileDocIconType(type) {
  if (!type) return '📎';
  const t = String(type).toLowerCase();
  if (t.includes('pdf')) return '📄';
  if (t.includes('image')) return '🖼️';
  if (t.includes('word') || t.includes('document') || t === 'application/msword') return '📝';
  return '📎';
}

export function stableStringify(value) {
  try {
    return JSON.stringify(value, (_, v) => {
      if (v && typeof v.toDate === 'function') {
        try { return v.toDate().toISOString(); } catch { return v; }
      }
      return v;
    });
  } catch {
    return String(value);
  }
}

export function auditDocViewLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('pdf')) return '👁️ View';
  if (t.includes('image')) return '🖼️ View';
  return '⬇️ Open';
}

export function isAuditDocImageType(type) {
  return String(type || '').toLowerCase().includes('image');
}
