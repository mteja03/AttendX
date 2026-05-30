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

/** True if the auditType/audit uses the new unified sections[] model */
export function isUnifiedTemplate(doc) {
  return Array.isArray(doc?.sections) && doc.sections.some((s) => s.sectionType);
}

/**
 * Fill progress for a single section.
 * Accepts the section definition + the responses object for that section
 * from audit.sectionResponses[sectionId].
 */
export function getSectionFillProgress(section, responses) {
  if (!section) return { filled: 0, total: 0 };
  const type = section.sectionType;

  if (type === SECTION_TYPES.CHECKLIST) {
    const items = section.items || [];
    const answered = (responses?.items || []).filter(
      (i) => i.result === 'pass' || i.result === 'fail' || i.result === 'na',
    ).length;
    return { filled: answered, total: items.length };
  }

  if (type === SECTION_TYPES.RECORDS) {
    const records = responses?.records || section.records || [];
    const primaryCol = (section.columns || []).find(
      (c) => c.isPrimary && c.type === COLUMN_TYPES.AUDITOR_DROPDOWN,
    );
    const filled = primaryCol
      ? records.filter((r) => r.data?.[primaryCol.id]).length
      : records.length;
    return { filled, total: records.length };
  }

  if (type === SECTION_TYPES.QA) {
    const questions = section.questions || [];
    const answers = responses?.answers || {};
    const filled = questions.filter(
      (q) => answers[q.id]?.value != null && String(answers[q.id].value).trim() !== '',
    ).length;
    return { filled, total: questions.length };
  }

  return { filled: 0, total: 0 };
}

/**
 * Compliance score (0-100) for a single section.
 * QA sections always return null (informational only).
 */
export function getSectionScore(section, responses) {
  if (!section) return null;
  const type = section.sectionType;

  if (type === SECTION_TYPES.CHECKLIST) {
    const items = responses?.items || [];
    const reviewed = items.filter((i) => i.result === 'pass' || i.result === 'fail');
    if (reviewed.length === 0) return null;
    const passed = items.filter((i) => i.result === 'pass').length;
    return Math.round((passed / reviewed.length) * 100);
  }

  if (type === SECTION_TYPES.RECORDS) {
    const records = responses?.records || section.records || [];
    const primaryCol = (section.columns || []).find(
      (c) => c.isPrimary && c.type === COLUMN_TYPES.AUDITOR_DROPDOWN,
    );
    if (!primaryCol || records.length === 0) return null;
    const passOption = (primaryCol.options || []).find((o) => o.isPass);
    if (!passOption) return null;
    const passed = records.filter(
      (r) => r.data?.[primaryCol.id] === passOption.label,
    ).length;
    return Math.round((passed / records.length) * 100);
  }

  return null;
}

/** Overall fill progress across all sections in a unified audit */
export function getUnifiedFillProgress(audit) {
  const sections = audit?.sections || [];
  const responses = audit?.sectionResponses || {};
  let filled = 0;
  let total = 0;
  for (const sec of sections) {
    const p = getSectionFillProgress(sec, responses[sec.id]);
    filled += p.filled;
    total += p.total;
  }
  return { filled, total };
}

/**
 * Weighted score across all scored sections (checklist + records).
 * QA sections are excluded from scoring.
 */
export function getUnifiedAuditScore(audit) {
  const sections = audit?.sections || [];
  const responses = audit?.sectionResponses || {};
  const scorable = sections.filter((s) => s.sectionType !== SECTION_TYPES.QA);
  if (scorable.length === 0) return null;
  let totalItems = 0;
  let totalPassed = 0;
  for (const sec of scorable) {
    const score = getSectionScore(sec, responses[sec.id]);
    if (score !== null) {
      const { total } = getSectionFillProgress(sec, responses[sec.id]);
      totalItems += total;
      totalPassed += Math.round((total * score) / 100);
    }
  }
  return totalItems > 0 ? Math.round((totalPassed / totalItems) * 100) : null;
}

/**
 * Backward-compat helper: get the responses object for a section.
 * Checks new sectionResponses format first, then falls back to old
 * checklistReview[] / recordSections[] formats.
 */
export function getSectionResponses(audit, sectionId, sectionType) {
  if (audit?.sectionResponses?.[sectionId]) return audit.sectionResponses[sectionId];
  if (sectionType === SECTION_TYPES.CHECKLIST && Array.isArray(audit?.checklistReview)) {
    return { type: 'checklist', items: audit.checklistReview };
  }
  if (sectionType === SECTION_TYPES.RECORDS && Array.isArray(audit?.recordSections)) {
    const sec = audit.recordSections.find((s) => s.id === sectionId);
    if (sec) return { type: 'records', records: sec.records || [] };
  }
  return null;
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

// ─── Record template type helpers ────────────────────────────────────────────

export const TEMPLATE_TYPES = { CHECKLIST: 'checklist', RECORD: 'record' };

export const COLUMN_TYPES = {
  PREFILLED_TEXT: 'prefilled_text',
  PREFILLED_NUMBER: 'prefilled_number',
  PREFILLED_DATE: 'prefilled_date',
  AUDITOR_DROPDOWN: 'auditor_dropdown',
  AUDITOR_TEXT: 'auditor_text',
  AUDITOR_NUMBER: 'auditor_number',
};

export const SECTION_TYPES = {
  CHECKLIST: 'checklist',
  RECORDS: 'records',
  QA: 'qa',
};

export const QA_QUESTION_TYPES = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date',
  DROPDOWN: 'dropdown',
};

export const COLUMN_WIDTHS = { N: 80, W: 140, XW: 220 };

export function isRecordType(auditOrTemplate) {
  return auditOrTemplate?.templateType === TEMPLATE_TYPES.RECORD;
}

export function getRecordAuditScore(audit) {
  const sections = audit?.recordSections || [];
  let total = 0;
  let passed = 0;
  for (const section of sections) {
    const primaryCol = (section.columns || []).find(
      (c) => c.isPrimary && c.type === COLUMN_TYPES.AUDITOR_DROPDOWN,
    );
    if (!primaryCol) continue;
    const passingLabel = (primaryCol.options || []).find((o) => o.isPass)?.label;
    if (!passingLabel) continue;
    for (const row of (section.records || [])) {
      total++;
      if ((row.data || {})[primaryCol.id] === passingLabel) passed++;
    }
  }
  if (total === 0) return null;
  return Math.round((passed / total) * 100);
}

export function getRecordFillProgress(audit) {
  const sections = audit?.recordSections || [];
  let total = 0;
  let filled = 0;
  for (const section of sections) {
    const primaryCol =
      (section.columns || []).find((c) => c.isPrimary && c.type === COLUMN_TYPES.AUDITOR_DROPDOWN) ||
      (section.columns || []).find((c) => c.type === COLUMN_TYPES.AUDITOR_DROPDOWN);
    if (!primaryCol) continue;
    for (const row of (section.records || [])) {
      total++;
      if ((row.data || {})[primaryCol.id]) filled++;
    }
  }
  return { total, filled };
}

export function getRecordStatusCounts(audit) {
  const sections = audit?.recordSections || [];
  const counts = {};
  for (const section of sections) {
    const primaryCol = (section.columns || []).find(
      (c) => c.isPrimary && c.type === COLUMN_TYPES.AUDITOR_DROPDOWN,
    );
    if (!primaryCol) continue;
    for (const row of (section.records || [])) {
      const val = (row.data || {})[primaryCol.id] || null;
      if (val) counts[val] = (counts[val] || 0) + 1;
      else counts.__unfilled = (counts.__unfilled || 0) + 1;
    }
  }
  return counts;
}

export function generateSampleCSV(section) {
  const cols = (section.columns || []).filter((c) => c.type?.startsWith('prefilled'));
  if (cols.length === 0) return '';
  const headers = cols.map((c) => `"${c.label}"`).join(',');
  const example = cols.map((c) => {
    if (c.type === COLUMN_TYPES.PREFILLED_NUMBER) return '12345';
    if (c.type === COLUMN_TYPES.PREFILLED_DATE) return '01/01/2026';
    return 'example text';
  }).join(',');
  return `${headers}\n${example}`;
}

export function parseCSVToRecords(csvText, section) {
  if (!csvText || !section) return [];
  const cols = (section.columns || []).filter((c) => c.type?.startsWith('prefilled'));
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const rawHeaders = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const records = [];
  const ts = Date.now();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const data = {};
    cols.forEach((col) => {
      const idx = rawHeaders.indexOf(col.label.toLowerCase());
      data[col.id] = idx >= 0 ? (values[idx] || '') : '';
    });
    records.push({
      id: `rec_${ts}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      data,
    });
  }
  return records;
}

export function makeBlankRecord(columns) {
  const data = {};
  (columns || []).forEach((col) => { data[col.id] = ''; });
  return {
    id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    data,
  };
}
