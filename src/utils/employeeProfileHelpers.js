import { Timestamp } from 'firebase/firestore';
import { toDisplayDate, toJSDate } from './index';

export async function getCroppedBlob(imageSrc, pixelCrop) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Crop failed'));
      },
      'image/jpeg',
      0.9,
    );
  });
}

function isFirestoreFieldValue(val) {
  return val != null && typeof val === 'object' && typeof val._methodName === 'string';
}

/** Recursively replace undefined with null and strip undefined keys — Firestore rejects undefined. Preserves Timestamp and FieldValue sentinels. */
export function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (isFirestoreFieldValue(obj)) return obj;
  if (obj instanceof Timestamp) return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForFirestore(item));
  }
  if (typeof obj === 'object') {
    const cleaned = {};
    Object.keys(obj).forEach((key) => {
      const val = sanitizeForFirestore(obj[key]);
      if (val !== undefined) {
        cleaned[key] = val;
      }
    });
    return cleaned;
  }
  return obj;
}

export const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal', 'Other'];
export const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
export const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
export const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
export const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];

export function sanitizeCustomBenefitsForSave(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b, i) => {
      const nameResolved =
        b?.name === '__custom__' ? (b.customName || '').trim() : (b?.name || '').trim();
      return {
        id: (b?.id && String(b.id).trim()) || `benefit_${Date.now()}_${i}`,
        name: nameResolved,
        value: (b.value || '').trim(),
        notes: (b.notes || '').trim(),
      };
    })
    .filter((b) => b.name || b.value || b.notes);
}

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu & Kashmir',
  'Ladakh',
  'Puducherry',
  'Chandigarh',
  'Andaman & Nicobar Islands',
  'Dadra & Nagar Haveli',
  'Lakshadweep',
];

export const LEAVE_TYPE_STYLE = {
  CL: 'bg-[#C5E8E8] text-[#0F4444]',
  SL: 'bg-red-100 text-red-800',
  EL: 'bg-green-100 text-green-800',
  ML: 'bg-pink-100 text-pink-800',
  PL: 'bg-indigo-100 text-indigo-800',
  BL: 'bg-gray-200 text-gray-800',
  CO: 'bg-amber-100 text-amber-800',
  MAR: 'bg-rose-100 text-rose-800',
  STL: 'bg-slate-100 text-slate-700',
  UL: 'bg-slate-100 text-slate-600',
};

export const DEFAULT_PROFILE_LEAVE_TYPE_OBJECTS = [
  { name: 'Casual Leave', shortCode: 'CL', isPaid: true },
  { name: 'Sick Leave', shortCode: 'SL', isPaid: true },
  { name: 'Earned Leave', shortCode: 'EL', isPaid: true },
  { name: 'Maternity Leave', shortCode: 'ML', isPaid: true },
  { name: 'Paternity Leave', shortCode: 'PL', isPaid: true },
  { name: 'Bereavement Leave', shortCode: 'BL', isPaid: true },
  { name: 'Compensatory Leave', shortCode: 'CO', isPaid: true },
  { name: 'Marriage Leave', shortCode: 'MAR', isPaid: true },
  { name: 'Study Leave', shortCode: 'STL', isPaid: false },
  { name: 'Unpaid Leave', shortCode: 'UL', isPaid: false },
];

export function abbrevProfileLeaveName(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

export function normalizeProfileLeaveTypeList(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_PROFILE_LEAVE_TYPE_OBJECTS.map((t) => ({ ...t }));
  }
  return raw.map((t) => {
    if (typeof t === 'string') {
      const name = t.trim();
      return { name, shortCode: abbrevProfileLeaveName(name), isPaid: true };
    }
    const name = (t.name || '').trim() || 'Leave';
    const shortCode = (t.shortCode || abbrevProfileLeaveName(name)).toUpperCase().slice(0, 8);
    return { name, shortCode, isPaid: t.isPaid !== false };
  });
}

export function getMaxLeaveForProfileType(lt, leavePolicy) {
  const lp = leavePolicy || {};
  let n = lp[lt.shortCode] ?? lp[lt.name];
  if (n === undefined) {
    if (lt.shortCode === 'CL') n = lp.cl;
    else if (lt.shortCode === 'SL') n = lp.sl;
    else if (lt.shortCode === 'EL') n = lp.el;
  }
  if (n === undefined || Number.isNaN(Number(n))) n = 12;
  return Number(n);
}

export const DEFAULT_ONBOARDING_TEMPLATE = {
  tasks: [
    { id: 'task_001', title: 'Send offer letter', description: '', category: 'Pre-joining', assignedTo: 'hr', daysFromJoining: -7, isRequired: true, order: 1 },
    { id: 'task_002', title: 'Send welcome email', description: 'Send welcome email with company handbook and first day details', category: 'Pre-joining', assignedTo: 'hr', daysFromJoining: -3, isRequired: true, order: 2 },
    { id: 'task_003', title: 'Collect documents list sent', description: '', category: 'Pre-joining', assignedTo: 'hr', daysFromJoining: -3, isRequired: true, order: 3 },
    { id: 'task_004', title: 'IT setup request raised (laptop/email/access)', description: '', category: 'Pre-joining', assignedTo: 'it', daysFromJoining: -2, isRequired: true, order: 4 },
    { id: 'task_005', title: 'Workspace/desk arranged', description: '', category: 'Pre-joining', assignedTo: 'admin', daysFromJoining: -1, isRequired: true, order: 5 },
    { id: 'task_006', title: 'ID card issued', description: '', category: 'Day 1', assignedTo: 'admin', daysFromJoining: 0, isRequired: true, order: 6 },
    { id: 'task_007', title: 'Office tour completed', description: '', category: 'Day 1', assignedTo: 'hr', daysFromJoining: 0, isRequired: false, order: 7 },
    { id: 'task_008', title: 'Introduction to team', description: '', category: 'Day 1', assignedTo: 'manager', daysFromJoining: 0, isRequired: true, order: 8 },
    { id: 'task_009', title: 'HR documentation completed (forms, policies signed)', description: '', category: 'Day 1', assignedTo: 'hr', daysFromJoining: 0, isRequired: true, order: 9 },
    { id: 'task_010', title: 'System access provided (email, tools)', description: '', category: 'Day 1', assignedTo: 'it', daysFromJoining: 0, isRequired: true, order: 10 },
    { id: 'task_011', title: 'Employee added to payroll', description: '', category: 'Week 1', assignedTo: 'admin', daysFromJoining: 3, isRequired: true, order: 11 },
    { id: 'task_012', title: 'PF/ESIC registration done', description: '', category: 'Week 1', assignedTo: 'admin', daysFromJoining: 3, isRequired: false, order: 12 },
    { id: 'task_013', title: 'Bank account details collected', description: '', category: 'Week 1', assignedTo: 'hr', daysFromJoining: 3, isRequired: true, order: 13 },
    { id: 'task_014', title: 'Emergency contact collected', description: '', category: 'Week 1', assignedTo: 'hr', daysFromJoining: 5, isRequired: true, order: 14 },
    { id: 'task_015', title: 'Reporting manager introduced', description: '', category: 'Week 1', assignedTo: 'manager', daysFromJoining: 1, isRequired: true, order: 15 },
    { id: 'task_016', title: '30-day check-in meeting done', description: '', category: 'Month 1', assignedTo: 'manager', daysFromJoining: 30, isRequired: true, order: 16 },
    { id: 'task_017', title: 'Access card issued', description: '', category: 'Month 1', assignedTo: 'admin', daysFromJoining: 7, isRequired: false, order: 17 },
    { id: 'task_018', title: 'Company policies acknowledged', description: '', category: 'Month 1', assignedTo: 'employee', daysFromJoining: 7, isRequired: true, order: 18 },
    { id: 'task_019', title: 'Probation goals set', description: '', category: 'Month 1', assignedTo: 'manager', daysFromJoining: 14, isRequired: true, order: 19 },
    { id: 'task_020', title: 'All documents collected and verified', description: '', category: 'Month 1', assignedTo: 'hr', daysFromJoining: 30, isRequired: true, order: 20 },
  ],
};

export const DEFAULT_OFFBOARDING_TEMPLATE = {
  tasks: [
    { id: 'off_001', title: 'Resignation letter received', description: '', category: 'Resignation', assignedTo: 'hr', daysBefore: 30, isRequired: true, order: 1 },
    { id: 'off_002', title: 'Exit date confirmed with manager', description: '', category: 'Resignation', assignedTo: 'manager', daysBefore: 28, isRequired: true, order: 2 },
    { id: 'off_003', title: 'Handover plan created', description: '', category: 'Resignation', assignedTo: 'manager', daysBefore: 25, isRequired: true, order: 3 },
    { id: 'off_004', title: 'Notice Period terms confirmed', description: '', category: 'Resignation', assignedTo: 'hr', daysBefore: 28, isRequired: true, order: 4 },
    { id: 'off_005', title: 'Handover document prepared', description: '', category: 'Knowledge Transfer', assignedTo: 'employee', daysBefore: 14, isRequired: true, order: 5 },
    { id: 'off_006', title: 'Pending tasks documented', description: '', category: 'Knowledge Transfer', assignedTo: 'employee', daysBefore: 7, isRequired: true, order: 6 },
    { id: 'off_007', title: 'Knowledge transfer to team done', description: '', category: 'Knowledge Transfer', assignedTo: 'manager', daysBefore: 5, isRequired: true, order: 7 },
    { id: 'off_008', title: 'Passwords and credentials handed over', description: '', category: 'Knowledge Transfer', assignedTo: 'it', daysBefore: 1, isRequired: true, order: 8 },
    { id: 'off_009', title: 'Laptop returned', description: '', category: 'Asset Return', assignedTo: 'admin', daysBefore: 0, isRequired: true, order: 9 },
    { id: 'off_010', title: 'ID card returned', description: '', category: 'Asset Return', assignedTo: 'hr', daysBefore: 0, isRequired: true, order: 10 },
    { id: 'off_011', title: 'Access card returned', description: '', category: 'Asset Return', assignedTo: 'admin', daysBefore: 0, isRequired: true, order: 11 },
    { id: 'off_012', title: 'SIM card returned', description: '', category: 'Asset Return', assignedTo: 'admin', daysBefore: 0, isRequired: true, order: 12 },
    { id: 'off_013', title: 'Any other company assets returned', description: '', category: 'Asset Return', assignedTo: 'admin', daysBefore: 0, isRequired: true, order: 13 },
    { id: 'off_014', title: 'Email access revoked', description: '', category: 'IT & Access', assignedTo: 'it', daysBefore: 0, isRequired: true, order: 14 },
    { id: 'off_015', title: 'System access removed', description: '', category: 'IT & Access', assignedTo: 'it', daysBefore: 0, isRequired: true, order: 15 },
    { id: 'off_016', title: 'Added to alumni/ex-employee list', description: '', category: 'IT & Access', assignedTo: 'hr', daysBefore: 0, isRequired: false, order: 16 },
    { id: 'off_017', title: 'Final salary calculated', description: '', category: 'Finance & Legal', assignedTo: 'hr', daysBefore: -5, isRequired: true, order: 17 },
    { id: 'off_018', title: 'Full and final settlement processed', description: '', category: 'Finance & Legal', assignedTo: 'hr', daysBefore: -7, isRequired: true, order: 18 },
    { id: 'off_019', title: 'PF withdrawal form collected', description: '', category: 'Finance & Legal', assignedTo: 'hr', daysBefore: 0, isRequired: false, order: 19 },
    { id: 'off_020', title: 'Gratuity calculated (if applicable)', description: '', category: 'Finance & Legal', assignedTo: 'hr', daysBefore: -7, isRequired: false, order: 20 },
    { id: 'off_021', title: 'Form 16 issued', description: '', category: 'Finance & Legal', assignedTo: 'hr', daysBefore: -30, isRequired: true, order: 21 },
    { id: 'off_022', title: 'Experience letter issued', description: '', category: 'Documents', assignedTo: 'hr', daysBefore: 0, isRequired: true, order: 22 },
    { id: 'off_023', title: 'Relieving letter issued', description: '', category: 'Documents', assignedTo: 'hr', daysBefore: 0, isRequired: true, order: 23 },
    { id: 'off_024', title: 'NOC issued (if required)', description: '', category: 'Documents', assignedTo: 'hr', daysBefore: 0, isRequired: false, order: 24 },
    { id: 'off_025', title: 'Exit interview conducted', description: '', category: 'Exit Interview', assignedTo: 'hr', daysBefore: 2, isRequired: false, order: 25 },
    { id: 'off_026', title: 'Exit feedback form filled', description: '', category: 'Exit Interview', assignedTo: 'employee', daysBefore: 2, isRequired: false, order: 26 },
  ],
};

export function getAge(v) {
  const d = toJSDate(v);
  if (!d || Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

export function getTenure(joiningDate) {
  const joined = toJSDate(joiningDate);
  if (!joined) return '';

  const now = new Date();
  const years = Math.floor((now - joined) / (365.25 * 24 * 60 * 60 * 1000));
  const months = Math.floor((now - joined) / (30.44 * 24 * 60 * 60 * 1000));
  const days = Math.floor((now - joined) / (24 * 60 * 60 * 1000));

  if (years >= 1) {
    const remainingMonths = Math.floor(months - years * 12);
    if (remainingMonths > 0) {
      return `${years}y ${remainingMonths}m`;
    }
    return `${years} year${years > 1 ? 's' : ''}`;
  }
  if (months >= 1) {
    return `${months} month${months > 1 ? 's' : ''}`;
  }
  return `${days} day${days > 1 ? 's' : ''}`;
}

export const HEADER_STATUS_CONFIG = {
  Active: {
    topBar: '#1B6B6B',
    badgeBg: '#EAF3DE',
    badgeColor: '#3B6D11',
    dotColor: '#3B6D11',
  },
  'Notice Period': {
    topBar: '#EF9F27',
    badgeBg: '#FAEEDA',
    badgeColor: '#854F0B',
    dotColor: '#EF9F27',
  },
  Offboarding: {
    topBar: '#E24B4A',
    badgeBg: '#FCEBEB',
    badgeColor: '#A32D2D',
    dotColor: '#E24B4A',
  },
  Inactive: {
    topBar: '#B4B2A9',
    badgeBg: '#F1EFE8',
    badgeColor: '#5F5E5A',
    dotColor: '#9CA3AF',
  },
  'On Leave': {
    topBar: '#378ADD',
    badgeBg: '#E6F1FB',
    badgeColor: '#185FA5',
    dotColor: '#378ADD',
  },
};

export function buildProfileTimeline(emp, leaveRows, assets, employeeDocId) {
  const events = [];
  if (!emp) return events;

  if (emp.joiningDate) {
    const jd = toJSDate(emp.joiningDate);
    if (jd) {
      events.push({
        id: 'joined',
        type: 'joined',
        icon: '🎉',
        color: 'green',
        title: 'Joined Company',
        description: [emp.designation, emp.department].filter(Boolean).join(' · '),
        date: jd,
        by: emp.createdBy || 'HR',
      });
    }
  }

  if (Array.isArray(emp.editHistory)) {
    emp.editHistory.forEach((edit, idx) => {
      if (edit.event === 'rehired') {
        const d = toJSDate(edit.date) || toJSDate(edit.timestamp);
        if (!d) return;
        events.push({
          id: `rehire_${edit.date?.seconds ?? edit.timestamp?.seconds ?? idx}_${idx}`,
          type: 'rehire',
          icon: '🔄',
          color: 'green',
          title: 'Rehired',
          description: edit.notes || 'Employee reactivated',
          date: d,
          by: edit.by || 'HR',
        });
        return;
      }
      const d = toJSDate(edit.timestamp);
      if (!d) return;
      const desc =
        Array.isArray(edit.changes) && edit.changes.length > 0 ? edit.changes.join(', ') : 'Details updated';
      events.push({
        id: `edit_${edit.timestamp?.seconds ?? idx}_${idx}`,
        type: 'edit',
        icon: '✏️',
        color: 'blue',
        title: 'Profile Updated',
        description: desc,
        date: d,
        by: edit.by || 'HR',
      });
    });
  }

  (leaveRows || []).forEach((leave) => {
    if (leave.status !== 'Approved') return;
    const d = toJSDate(leave.appliedAt) || toJSDate(leave.startDate);
    if (!d) return;
    const days = leave.days ?? '';
    const dayWord = Number(leave.days) === 1 ? 'day' : 'days';
    events.push({
      id: `leave_${leave.id}`,
      type: 'leave',
      icon: '🏖️',
      color: 'blue',
      title: `${leave.leaveType || 'Leave'} — ${days} ${dayWord}`,
      description: `${leave.startDate ? toDisplayDate(leave.startDate) : '—'} to ${leave.endDate ? toDisplayDate(leave.endDate) : '—'}${leave.reason ? ` · ${leave.reason}` : ''}`,
      date: d,
      by: leave.approvedBy || 'HR',
    });
  });

  const docs = emp.documents;
  if (Array.isArray(docs)) {
    docs.forEach((docItem, idx) => {
      if (!docItem?.uploadedAt) return;
      const d = toJSDate(docItem.uploadedAt);
      if (!d) return;
      events.push({
        id: `doc_${docItem.id || idx}`,
        type: 'document',
        icon: '📄',
        color: 'gray',
        title: 'Document Uploaded',
        description: docItem.name || docItem.id || `Document ${idx + 1}`,
        date: d,
        by: docItem.uploadedBy || 'HR',
      });
    });
  }

  (assets || []).forEach((asset) => {
    const hist = Array.isArray(asset.history) ? asset.history : [];
    hist
      .filter((h) => h.employeeId === employeeDocId)
      .forEach((h, hi) => {
        const d = toJSDate(h.date);
        if (!d) return;
        const isAssign = h.action === 'assigned';
        events.push({
          id: `asset_${asset.id}_${h.action}_${hi}`,
          type: 'asset',
          icon: isAssign ? '📦' : '📤',
          color: isAssign ? 'teal' : 'gray',
          title: isAssign ? `Asset Assigned: ${asset.name || 'Asset'}` : `Asset Returned: ${asset.name || 'Asset'}`,
          description: [asset.assetId, h.notes].filter(Boolean).join(' · ') || '',
          date: d,
          by: h.performedBy || 'HR',
        });
      });
    if ((asset.mode || 'trackable') === 'consumable') {
      (asset.assignments || [])
        .filter((as) => as.employeeId === employeeDocId && as.issueDate)
        .forEach((as, ai) => {
          const d = toJSDate(as.issueDate);
          if (!d) return;
          events.push({
            id: `asset_issue_${asset.id}_${ai}`,
            type: 'asset',
            icon: '📦',
            color: 'teal',
            title: `Asset Issued: ${asset.name || 'Consumable'}`,
            description: `${asset.assetId || ''} · Qty ${as.quantity || 1}`.trim(),
            date: d,
            by: 'HR',
          });
        });
    }
  });

  const obOn = emp.onboarding;
  if (obOn) {
    if (obOn.startedAt) {
      const d = toJSDate(obOn.startedAt);
      if (d) {
        events.push({
          id: 'onboarding_started',
          type: 'onboarding',
          icon: '🎯',
          color: 'purple',
          title: 'Onboarding Started',
          description: `${obOn.tasks?.length || 0} tasks assigned`,
          date: d,
          by: obOn.startedBy || 'HR',
        });
      }
    }
    (obOn.tasks || [])
      .filter((t) => t.completed && t.completedAt)
      .forEach((task) => {
        const d = toJSDate(task.completedAt);
        if (!d) return;
        events.push({
          id: `onboard_task_${task.id}`,
          type: 'onboarding_task',
          icon: '✅',
          color: 'green',
          title: `Onboarding: ${task.title || 'Task'}`,
          description: task.notes || '',
          date: d,
          by: task.completedBy || 'HR',
        });
      });
    if (obOn.completedAt) {
      const d = toJSDate(obOn.completedAt);
      if (d) {
        events.push({
          id: 'onboarding_completed',
          type: 'onboarding',
          icon: '🎊',
          color: 'green',
          title: 'Onboarding Completed',
          description: '100% tasks done',
          date: d,
          by: obOn.completedBy || 'HR',
        });
      }
    }
  }

  const offb = emp.offboarding;
  if (offb) {
    const hasRecordedAt = !!offb.recordedAt;
    if (hasRecordedAt) {
      const d = toJSDate(offb.recordedAt);
      if (d) {
        events.push({
          id: 'resignation',
          type: 'offboarding',
          icon: '📝',
          color: 'amber',
          title: 'Resignation Recorded',
          description: `Notice period: ${offb.noticePeriodDays ?? '—'} days · Last day: ${toDisplayDate(offb.expectedLastDay) || '—'}${offb.reason ? ` · ${offb.reason}` : ''}`,
          date: d,
          by: offb.recordedBy || 'HR',
        });
      }
    }
    const eventConfigMap = {
      resignation_recorded: { icon: '📝', color: 'amber', title: 'Resignation Recorded' },
      resignation_withdrawn: { icon: '🔄', color: 'green', title: 'Resignation Withdrawn' },
      notice_buyout: { icon: '💰', color: 'blue', title: 'Notice Period Buyout' },
      exit_tasks_started: { icon: '🚪', color: 'orange', title: 'Exit Processing Started' },
      employee_marked_inactive: { icon: '🏁', color: 'gray', title: 'Exit Finalized' },
    };
    (offb.history || []).forEach((event, i) => {
      if (hasRecordedAt && event.event === 'resignation_recorded') return;
      const d = toJSDate(event.date);
      if (!d) return;
      const cfg =
        eventConfigMap[event.event] || {
          icon: '📋',
          color: 'gray',
          title: (event.event || 'event').replace(/_/g, ' '),
        };
      events.push({
        id: `offboard_history_${i}_${event.event}`,
        type: 'offboarding',
        icon: cfg.icon,
        color: cfg.color,
        title: cfg.title,
        description: event.notes || '',
        date: d,
        by: event.by || 'HR',
      });
    });
    (offb.tasks || [])
      .filter((t) => t.completed && t.completedAt)
      .forEach((task) => {
        const d = toJSDate(task.completedAt);
        if (!d) return;
        events.push({
          id: `offboard_task_${task.id}`,
          type: 'offboarding_task',
          icon: '☑️',
          color: 'orange',
          title: `Exit Task: ${task.title || 'Task'}`,
          description: task.notes || '',
          date: d,
          by: task.completedBy || 'HR',
        });
      });
    if (offb.completedAt) {
      const d = toJSDate(offb.completedAt);
      if (d) {
        events.push({
          id: 'offboarding_done',
          type: 'offboarding',
          icon: '🏁',
          color: 'gray',
          title: 'Offboarding Completed',
          description: 'Employee marked Inactive',
          date: d,
          by: offb.completedBy || 'HR',
        });
      }
    }
  }

  if (emp.deactivatedAt) {
    const d = toJSDate(emp.deactivatedAt);
    if (d) {
      events.push({
        id: 'deactivated',
        type: 'status',
        icon: '🔴',
        color: 'red',
        title: 'Employee Inactive',
        description: emp.deactivationReason || '',
        date: d,
        by: emp.deactivatedBy || 'HR',
      });
    }
  }

  return events
    .filter((e) => e.date instanceof Date && !Number.isNaN(e.date.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}
