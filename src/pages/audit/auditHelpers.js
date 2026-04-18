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
  const canMgr = userRole === 'admin' || userRole === 'hrmanager' || userRole === 'auditmanager';
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
