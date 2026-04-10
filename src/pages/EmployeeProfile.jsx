import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  deleteField,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Cropper from 'react-easy-crop';
import { db, app } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { PLATFORM_CONFIG } from '../config/constants';
import PageLoader from '../components/PageLoader';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { DOCUMENT_CHECKLIST, getDocById } from '../utils/documentTypes';
import { uploadEmployeeDocument, deleteFileFromDrive } from '../utils/googleDrive';
import { toDisplayDate, toJSDate, toDateString, formatLakhs } from '../utils';
import { whatsappUrl } from '../utils/whatsapp';
import { createPrintDocument, escapeHtml, openPrintWindow } from '../utils/printTemplate';
import { deleteEmployeePhoto } from '../utils/photoUpload';
import { updateCompanyCounts } from '../utils/updateCompanyCounts';
import EmployeeAvatar from '../components/EmployeeAvatar';
import ErrorModal from '../components/ErrorModal';
import { withRetry } from '../utils/firestoreWithRetry';
import { ERROR_MESSAGES, getErrorMessage, logError } from '../utils/errorHandler';
import {
  trackEmployeeDeleted,
  trackOffboardingCompleted,
  trackOnboardingCompleted,
  trackOnboardingStarted,
  trackPhotoUploaded,
  trackResignationRecorded,
  trackResignationWithdrawn,
} from '../utils/analytics';

async function getCroppedBlob(imageSrc, pixelCrop) {
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
function sanitizeForFirestore(obj) {
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

const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal', 'Other'];
const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];

function sanitizeCustomBenefitsForSave(raw) {
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

const INDIAN_STATES = [
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

const LEAVE_TYPE_STYLE = {
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

const DEFAULT_PROFILE_LEAVE_TYPE_OBJECTS = [
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

function abbrevProfileLeaveName(name) {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

function normalizeProfileLeaveTypeList(raw) {
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

function getMaxLeaveForProfileType(lt, leavePolicy) {
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
const STATUS_STYLE = { Pending: 'bg-amber-100 text-amber-800', Approved: 'bg-green-100 text-green-800', Rejected: 'bg-red-100 text-red-800' };

const DEFAULT_ONBOARDING_TEMPLATE = {
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

const DEFAULT_OFFBOARDING_TEMPLATE = {
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

function getAge(v) {
  const d = toJSDate(v);
  if (!d || Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

function getTenure(joiningDate) {
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

const TIMELINE_COLORS = {
  green: {
    dot: 'bg-green-500',
    bg: 'bg-green-50',
    border: 'border-green-100',
    text: 'text-green-700',
  },
  blue: {
    dot: 'bg-blue-500',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    text: 'text-blue-700',
  },
  purple: {
    dot: 'bg-purple-500',
    bg: 'bg-purple-50',
    border: 'border-purple-100',
    text: 'text-purple-700',
  },
  amber: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    text: 'text-amber-700',
  },
  orange: {
    dot: 'bg-orange-500',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
    text: 'text-orange-700',
  },
  teal: {
    dot: 'bg-[#1B6B6B]',
    bg: 'bg-[#E8F5F5]',
    border: 'border-[#4ECDC4]/30',
    text: 'text-[#1B6B6B]',
  },
  red: {
    dot: 'bg-red-500',
    bg: 'bg-red-50',
    border: 'border-red-100',
    text: 'text-red-700',
  },
  gray: {
    dot: 'bg-gray-400',
    bg: 'bg-gray-50',
    border: 'border-gray-100',
    text: 'text-gray-500',
  },
};

function buildProfileTimeline(emp, leaveRows, assets, employeeDocId) {
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

export default function EmployeeProfile() {
  const { companyId, empId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, getValidToken, isTokenValid, role: authRole, signOut } = useAuth();
  const userRole = authRole;
  const canDeleteEmployee = userRole === 'admin';
  const canEditEmployees = userRole === 'admin' || userRole === 'hrmanager';
  const canUploadPhoto = userRole === 'admin' || userRole === 'hrmanager';
  const hasDriveUploadRole = PLATFORM_CONFIG.DRIVE_UPLOAD_ROLES.includes(userRole);
  const { success, error: showError } = useToast();
  const [employee, setEmployee] = useState(null);
  const isInactive = employee?.status === 'Inactive';
  const isDriveConnected = hasDriveUploadRole && isTokenValid();
  const showDocManageUi = hasDriveUploadRole && !isInactive;
  const { company } = useCompany();
  const [allEmployees, setAllEmployees] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [leaveError, setLeaveError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('personal');
  const [showSalary, setShowSalary] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorModal, setErrorModal] = useState(null);
  const [form, setForm] = useState(null);
  const [roles, setRoles] = useState([]);
  const [categoryOpen, setCategoryOpen] = useState({});
  const [uploadingDocId, setUploadingDocId] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [replacingDocId, setReplacingDocId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const leaveFetchedRef = useRef(false);
  const assetsFetchedRef = useRef(false);
  const [managerSearch, setManagerSearch] = useState('');
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const locationDropdownRef = useRef(null);
  const [editRoleSearch, setEditRoleSearch] = useState('');
  const [showEditRoleDropdown, setShowEditRoleDropdown] = useState(false);
  const editRoleDropdownRef = useRef(null);
  const [assetList, setAssetList] = useState([]);
  const [showAssignAssetModal, setShowAssignAssetModal] = useState(false);
  const [showProfileAssignModal, setShowProfileAssignModal] = useState(null); // trackable assign or consumable issue
  const [profileAssignMode, setProfileAssignMode] = useState('trackable'); // 'trackable' | 'consumable'
  const [showProfileAssetDropdown, setShowProfileAssetDropdown] = useState(false);

  const handleSmartError = async (error, context, fallback = 'Failed to save. Please try again.') => {
    await logError(error, { companyId, employeeId: empId, ...context });
    const errType = getErrorMessage(error);
    if (error?._needsReauth || errType === 'auth_expired') return setErrorModal('auth_expired');
    if (errType === 'network_error') return setErrorModal('network_error');
    showError(ERROR_MESSAGES[errType]?.message || fallback);
  };
  const [profileAssetSearch, setProfileAssetSearch] = useState('');
  const [showAssetHistory, setShowAssetHistory] = useState(false);
  const [assignAssetForm, setAssignAssetForm] = useState({
    assetId: '',
    issueDate: '',
    condition: 'Good',
    notes: '',
  });
  const [issueConsumableAsset, setIssueConsumableAsset] = useState(null);
  const [issueConsumableForm, setIssueConsumableForm] = useState({
    quantity: 1,
    issueDate: '',
    condition: 'Good',
    notes: '',
  });
  const [returnAsset, setReturnAsset] = useState(null);
  const [returnAssetForm, setReturnAssetForm] = useState({
    date: '',
    condition: 'Good',
    notes: '',
  });
  const [returnConsumableModal, setReturnConsumableModal] = useState(null); // { asset, assignment }
  const [returnQty, setReturnQty] = useState(1);
  const [returnCondition, setReturnCondition] = useState('Good');
  const [returnNotes, setReturnNotes] = useState('');
  const [completingTask, setCompletingTask] = useState(null);
  const [taskNotes, setTaskNotes] = useState('');
  const [offboardingExitDate, setOffboardingExitDate] = useState('');
  const [offboardingExitReason, setOffboardingExitReason] = useState('');
  const [completingOffTask, setCompletingOffTask] = useState(null);
  const [offTaskNotes, setOffTaskNotes] = useState('');
  const [showResignationModal, setShowResignationModal] = useState(false);
  const [showOnboardingWarningModal, setShowOnboardingWarningModal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showRemovePhotoConfirm, setShowRemovePhotoConfirm] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [resignForm, setResignForm] = useState({
    resignationDate: '',
    noticePeriodDays: 30,
    reason: '',
    notes: '',
  });
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawNotes, setWithdrawNotes] = useState('');
  const [showBuyoutModal, setShowBuyoutModal] = useState(false);
  const [buyoutForm, setBuyoutForm] = useState({ actualLastDay: '', buyoutDays: 0, notes: '' });
  const [showExitTasksModal, setShowExitTasksModal] = useState(false);
  const [showCompleteOffboardingModal, setShowCompleteOffboardingModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [showRehireModal, setShowRehireModal] = useState(false);
  const [rehireForm, setRehireForm] = useState({
    newJoiningDate: '',
    notes: '',
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (showResignationModal) {
      setResignForm({ resignationDate: '', noticePeriodDays: 30, reason: '', notes: '' });
    }
  }, [showResignationModal]);

  useEffect(() => {
    if (showExitTasksModal && employee?.offboarding?.expectedLastDay) {
      setOffboardingExitDate(toDateString(employee.offboarding.expectedLastDay));
      setOffboardingExitReason(
        (employee.offboarding.reason || employee.offboarding.exitReason || '').trim(),
      );
    }
  }, [showExitTasksModal, employee?.offboarding]);

  useEffect(() => {
    if (showBuyoutModal) {
      setBuyoutForm({ actualLastDay: '', buyoutDays: 0, notes: '' });
    }
  }, [showBuyoutModal]);

  useEffect(() => {
    const handleClickOutside = () => {
      if (showManagerDropdown) {
        setShowManagerDropdown(false);
        setManagerSearch('');
      }
    };
    if (showManagerDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showManagerDropdown]);

  useEffect(() => {
    if (!showLocationDropdown) return undefined;
    const onDown = (e) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target)) {
        setShowLocationDropdown(false);
        setLocationSearch('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showLocationDropdown]);

  useEffect(() => {
    if (!showEditRoleDropdown) return undefined;
    const onDown = (e) => {
      if (editRoleDropdownRef.current && !editRoleDropdownRef.current.contains(e.target)) {
        setShowEditRoleDropdown(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showEditRoleDropdown]);

  const departments = company?.departments?.length ? company.departments : DEFAULT_DEPARTMENTS;
  const employmentTypes = company?.employmentTypes?.length ? company.employmentTypes : DEFAULT_EMPLOYMENT_TYPES;
  const branches = company?.branches?.length ? company.branches : DEFAULT_BRANCHES;
  const qualifications = company?.qualifications?.length ? company.qualifications : DEFAULT_QUALIFICATIONS;
  const categories = company?.categories?.length ? company.categories : DEFAULT_CATEGORIES;

  const empRef = companyId && empId ? doc(db, 'companies', companyId, 'employees', empId) : null;

  const fetchEmployee = useCallback(async () => {
    if (!companyId || !empId) return;
    try {
      const empSnap = await getDoc(doc(db, 'companies', companyId, 'employees', empId));
      if (empSnap.exists()) setEmployee({ id: empSnap.id, ...empSnap.data() });
      else setEmployee(null);
    } catch (err) {
      console.error('EmployeeProfile refresh error:', err);
      showError('Failed to refresh employee');
    }
  }, [companyId, empId, showError]);

  useEffect(() => {
    if (!companyId || !empId) return;
    leaveFetchedRef.current = false;
    assetsFetchedRef.current = false;
    setLeaveList([]);
    setAssetList([]);
    const load = async () => {
      setLoading(true);
      try {
        const empSnap = await getDoc(doc(db, 'companies', companyId, 'employees', empId));
        if (empSnap.exists()) setEmployee({ id: empSnap.id, ...empSnap.data() });
        else setEmployee(null);
      } catch (err) {
        console.error('EmployeeProfile load error:', err);
        showError('Failed to load profile');
      }
      setLoading(false);
    };
    load();
  }, [companyId, empId, showError]);

  const benefitTemplates = useMemo(
    () => (company?.benefits || []).map((b) => ({ id: b, name: b })),
    [company?.benefits],
  );

  useEffect(() => {
    if (!companyId || !empId) return;
    if (tab !== 'leave' && tab !== 'timeline') return;
    if (leaveFetchedRef.current) return;
    leaveFetchedRef.current = true;
    let cancelled = false;
    const loadLeave = async () => {
      setLeaveError(null);
      try {
        const leaveQuery = query(
          collection(db, 'companies', companyId, 'leave'),
          where('employeeId', '==', empId),
        );
        const leaveSnap = await getDocs(leaveQuery);
        if (cancelled) return;
        const list = leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => {
          const ta = a.appliedAt?.toMillis?.() ?? (a.appliedAt ? new Date(a.appliedAt).getTime() : 0);
          const tb = b.appliedAt?.toMillis?.() ?? (b.appliedAt ? new Date(b.appliedAt).getTime() : 0);
          return tb - ta;
        });
        setLeaveList(list);
      } catch (error) {
        if (!cancelled) {
          setLeaveError(error?.message || 'Failed to load leave');
          setLeaveList([]);
        }
      }
    };
    loadLeave();
    return () => {
      cancelled = true;
    };
  }, [companyId, empId, tab]);

  useEffect(() => {
    const close = () => {
      setShowProfileAssetDropdown(false);
      setProfileAssetSearch('');
    };
    if (showProfileAssetDropdown) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showProfileAssetDropdown]);

  // Load assets when Assets / Timeline tab or asset modals need them (once per employee)
  useEffect(() => {
    if (!companyId) return;
    const needAssets =
      tab === 'assets' ||
      tab === 'timeline' ||
      showAssignAssetModal ||
      showProfileAssignModal != null ||
      returnConsumableModal != null ||
      showAssetHistory;
    if (!needAssets) return;
    if (assetsFetchedRef.current) return;
    assetsFetchedRef.current = true;
    const loadAssets = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'assets'));
        setAssetList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        setAssetList([]);
      }
    };
    loadAssets();
  }, [companyId, tab, showAssignAssetModal, showProfileAssignModal, returnConsumableModal, showAssetHistory]);

  useEffect(() => {
    if (!showEditModal || !companyId) return;
    let cancelled = false;
    const fetchEmployeesForManager = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'employees'));
        if (!cancelled) setAllEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        if (!cancelled) setAllEmployees([]);
      }
    };
    fetchEmployeesForManager();
    return () => {
      cancelled = true;
    };
  }, [showEditModal, companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'roles'));
        if (!cancelled) setRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('Failed to fetch roles:', e);
        if (!cancelled) setRoles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const editRoleSalaryBand = useMemo(() => {
    if (!form?.designation) return null;
    const role = roles.find((r) => r.title === form.designation);
    if (!role?.salaryBand || role.salaryBand.min === '' || role.salaryBand.min == null) return null;
    return {
      min: Number(role.salaryBand.min),
      max: Number(role.salaryBand.max),
    };
  }, [form?.designation, roles]);

  const selectedEditRole = useMemo(() => {
    if (!form?.designation) return null;
    if (form.designationRoleId) {
      const byId = roles.find((r) => r.id === form.designationRoleId);
      if (byId) return byId;
    }
    return roles.find((r) => r.title === form.designation) || null;
  }, [form?.designation, form?.designationRoleId, roles]);

  const editModalActiveRoles = useMemo(
    () => roles.filter((r) => r.isActive !== false),
    [roles],
  );

  const editModalFilteredRoles = useMemo(() => {
    const q = (editRoleSearch || '').trim().toLowerCase();
    return editModalActiveRoles.filter((r) => {
      if (!q) return true;
      return (
        (r.title || '').toLowerCase().includes(q) ||
        (r.reportsTo || '').toLowerCase().includes(q)
      );
    });
  }, [editModalActiveRoles, editRoleSearch]);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (!tabFromUrl) return;
    const tabMap = {
      personal: 'personal',
      documents: 'documents',
      leave: 'leave',
      assets: 'assets',
      onboarding: 'onboarding',
      offboarding: 'offboarding',
      timeline: 'timeline',
    };
    const mappedTab = tabMap[tabFromUrl];
    if (mappedTab) setTab(mappedTab);
  }, [searchParams]);

  useEffect(() => {
    if (isInactive) {
      setCompletingTask(null);
      setTaskNotes('');
    }
  }, [isInactive]);

  const leavePolicy = company?.leavePolicy || { cl: 12, sl: 12, el: 15 };
  const profileLeaveTypes = useMemo(() => normalizeProfileLeaveTypeList(company?.leaveTypes), [company?.leaveTypes]);
  const profilePaidLeaveTypes = useMemo(() => profileLeaveTypes.filter((lt) => lt.isPaid), [profileLeaveTypes]);

  const leaveUsedByTypeProfile = useMemo(() => {
    const acc = {};
    profileLeaveTypes.forEach((lt) => {
      acc[lt.name] = 0;
    });
    leaveList
      .filter((l) => l.status === 'Approved')
      .forEach((l) => {
        const raw = (l.leaveType || '').trim();
        const lt = profileLeaveTypes.find(
          (x) =>
            x.name === raw ||
            x.shortCode === raw ||
            (x.shortCode === 'CL' && raw === 'CL') ||
            (x.shortCode === 'SL' && raw === 'SL') ||
            (x.shortCode === 'EL' && raw === 'EL'),
        );
        if (lt) acc[lt.name] = (acc[lt.name] || 0) + (l.days || 0);
      });
    return acc;
  }, [leaveList, profileLeaveTypes]);

  const leaveTypePillClassResolved = useMemo(
    () => (raw) => {
      const r = (raw || '').trim();
      const lt = profileLeaveTypes.find((x) => x.name === r || x.shortCode === r);
      const code = lt?.shortCode || r;
      return LEAVE_TYPE_STYLE[code] || 'bg-slate-100 text-slate-700';
    },
    [profileLeaveTypes],
  );

  const timelineEvents = useMemo(
    () => buildProfileTimeline(employee, leaveList, assetList, empId),
    [employee, leaveList, assetList, empId],
  );

  const employeeAssets = useMemo(
    () =>
      assetList.filter(
        (a) => a.assignedToId === empId && (a.status || 'Assigned') === 'Assigned',
      ),
    [assetList, empId],
  );

  const employeeConsumableCards = useMemo(() => {
    return assetList
      .filter((a) => (a.mode || 'trackable') === 'consumable')
      .flatMap((asset) => {
        const assignments = Array.isArray(asset.assignments) ? asset.assignments : [];
        return assignments
          .filter((as) => as.employeeId === empId && !as.returned)
          .map((as) => ({
            kind: 'consumable',
            id: `${asset.id}_${as.employeeId}_${as.issueDate?.seconds || 0}`,
            assetDocId: asset.id,
            type: asset.type,
            name: asset.name,
            assetId: asset.assetId,
            issueDate: as.issueDate,
            quantity: as.quantity,
            condition: as.condition,
            unit: asset.unit,
            serialNumber: null,
            brand: null,
            model: null,
            assignment: as,
          }));
      });
  }, [assetList, empId]);

  const employeeAssetHistory = useMemo(
    () =>
      assetList
        .filter((a) => Array.isArray(a.history) && a.history.some((h) => h.employeeId === empId))
        .map((asset) => ({
          ...asset,
          relevantHistory: asset.history.filter((h) => h.employeeId === empId),
        })),
    [assetList, empId],
  );

  const activeChecklist = useMemo(() => {
    if (company?.documentTypes && company.documentTypes.length > 0) {
      return company.documentTypes;
    }
    return DOCUMENT_CHECKLIST;
  }, [company]);

  const findDocCategory = (docId, checklist) => {
    for (const cat of checklist || []) {
      const found = (cat.documents || []).find((d) => d.id === docId);
      if (found) return cat.category;
    }
    return null;
  };

  const totalMandatory = useMemo(
    () =>
      activeChecklist
        .flatMap((cat) => cat.documents)
        .filter((d) => d.mandatory).length,
    [activeChecklist],
  );

  const checklistIds = useMemo(() => {
    const set = new Set();
    activeChecklist.forEach((cat) => {
      (cat.documents || []).forEach((d) => {
        if (d?.id) set.add(d.id);
      });
    });
    return set;
  }, [activeChecklist]);

  const docByType = useMemo(() => {
    const map = {};
    const list = employee?.documents || [];
    list.forEach((d) => {
      if (d?.id && checklistIds.has(d.id)) map[d.id] = d;
    });
    return map;
  }, [employee?.documents, checklistIds]);

  const mandatoryUploaded = useMemo(() => {
    let n = 0;
    activeChecklist.forEach((cat) => {
      cat.documents.filter((d) => d.mandatory).forEach((d) => {
        if (docByType[d.id]) n++;
      });
    });
    return n;
  }, [docByType, activeChecklist]);

  const documentCompletion = useMemo(() => {
    if (!employee) return 0;
    const mandatoryDocs = activeChecklist
      .flatMap((cat) => cat.documents)
      .filter((d) => d.mandatory);
    const uploadedMandatory = mandatoryDocs.filter((md) =>
      (employee.documents || []).some((ud) => ud.id === md.id),
    );
    return mandatoryDocs.length > 0
      ? Math.round((uploadedMandatory.length / mandatoryDocs.length) * 100)
      : 100;
  }, [employee, activeChecklist]);
  const progressColor = documentCompletion <= 40 ? 'bg-red-500' : documentCompletion < 80 ? 'bg-amber-500' : 'bg-green-500';

  const refreshEmployee = async () => {
    if (!empRef) return;
    const snap = await getDoc(empRef);
    if (!snap.exists()) return;
    const data = snap.data();
    setEmployee({ id: snap.id, ...data });
  };

  const openEdit = () => {
    if (!employee) return;
    setForm({
      fullName: employee.fullName || '',
      email: employee.email || '',
      phone: employee.phone || '',
      alternativeMobile: employee.alternativeMobile || '',
      dateOfBirth: toDateString(employee.dateOfBirth),
      gender: employee.gender || '',
      bloodGroup: employee.bloodGroup || '',
      maritalStatus: employee.maritalStatus || '',
      marriageDate: toDateString(employee.marriageDate),
      disability: employee.disability || '',
      fatherName: employee.fatherName || '',
      streetAddress: employee.streetAddress || '',
      city: employee.city || '',
      state: employee.state || '',
      pincode: employee.pincode || '',
      country: employee.country || 'India',
      qualification: employee.qualification || '',
      empId: employee.empId || '',
      department: employee.department || '',
      branch: employee.branch || '',
      location: employee.location || '',
      designation: employee.designation || '',
      designationRoleId: employee.designationRoleId || '',
      employmentType: employee.employmentType || 'Full-time',
      category: employee.category || '',
      joiningDate: toDateString(employee.joiningDate),
      reportingManagerId: employee.reportingManagerId || '',
      reportingManagerName: employee.reportingManagerName || '',
      reportingManagerEmpId: employee.reportingManagerEmpId || '',
      prevCompany: employee.prevCompany || '',
      prevDesignation: employee.prevDesignation || '',
      prevFromDate: toDateString(employee.prevFromDate),
      prevToDate: toDateString(employee.prevToDate),
      prevManagerName: employee.prevManagerName || '',
      prevManagerPhone: employee.prevManagerPhone || '',
      prevManagerEmail: employee.prevManagerEmail || '',
      ctcPerAnnum: employee.ctcPerAnnum ?? employee.ctc ?? '',
      incentive: employee.incentive != null && employee.incentive !== '' ? String(employee.incentive) : '',
      basicSalary: employee.basicSalary ?? '',
      hra: employee.hra ?? '',
      pfApplicable: employee.pfApplicable ?? !!String(employee.pfNumber || '').trim(),
      esicApplicable: employee.esicApplicable ?? !!String(employee.esicNumber || '').trim(),
      pfNumber: employee.pfNumber || '',
      esicNumber: employee.esicNumber || '',
      customBenefits: Array.isArray(employee.customBenefits)
        ? employee.customBenefits.map((b) => ({
            id: b.id || `benefit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            name: b.name || '',
            value: b.value || '',
            notes: b.notes || '',
          }))
        : [],
      panNumber: employee.panNumber || '',
      aadhaarNumber: employee.aadhaarNumber || '',
      drivingLicenceNumber: employee.drivingLicenceNumber || '',
      emergencyContactName: employee.emergencyContact?.name || '',
      emergencyRelationship: employee.emergencyContact?.relationship || '',
      emergencyPhone: employee.emergencyContact?.phone || '',
    });
    setLocationSearch('');
    setShowLocationDropdown(false);
    setEditRoleSearch('');
    setShowEditRoleDropdown(false);
    setShowEditModal(true);
  };

  const checkEmpIdExists = async (empIdToCheck, currentDocId) => {
    const v = (empIdToCheck || '').trim();
    if (!v) return false;
    const q = query(
      collection(db, 'companies', companyId, 'employees'),
      where('empId', '==', v),
    );
    const snap = await getDocs(q);
    const others = snap.docs.filter((d) => d.id !== currentDocId);
    return others.length > 0;
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!employee || !form) return;
    setSaving(true);
    try {
      if (form.empId?.trim()) {
        const exists = await checkEmpIdExists(form.empId, empId);
        if (exists) {
          showError(`Emp ID ${form.empId} is already taken. Please use a different ID.`);
          setSaving(false);
          return;
        }
      }
      const changes = [];
      if ((form.fullName || '').trim() !== (employee.fullName || '').trim()) changes.push('Name updated');
      if ((form.designation || '').trim() !== (employee.designation || '').trim()) {
        changes.push(`Designation: ${(form.designation || '').trim()}`);
      }
      if ((form.department || '').trim() !== (employee.department || '').trim()) {
        changes.push(`Department: ${(form.department || '').trim()}`);
      }
      const prevCtc = employee.ctcPerAnnum ?? employee.ctc ?? '';
      const nextCtc = form.ctcPerAnnum === '' || form.ctcPerAnnum == null ? '' : Number(form.ctcPerAnnum);
      if (String(prevCtc) !== String(nextCtc)) changes.push('Salary updated');
      const prevInc = employee.incentive != null && employee.incentive !== '' ? Number(employee.incentive) : null;
      const nextInc =
        form.incentive === '' || form.incentive == null ? null : Number(form.incentive);
      if (prevInc !== nextInc) changes.push('Incentive updated');
      if ((form.branch || '').trim() !== (employee.branch || '').trim()) {
        changes.push(`Branch: ${(form.branch || '').trim()}`);
      }
      if ((form.location || '').trim() !== (employee.location || '').trim()) {
        changes.push(`Location: ${(form.location || '').trim()}`);
      }

      const payload = {
        fullName: form.fullName?.trim(),
        email: form.email?.trim(),
        phone: form.phone?.trim(),
        alternativeMobile: form.alternativeMobile?.trim() || null,
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        bloodGroup: form.bloodGroup || null,
        maritalStatus: form.maritalStatus || null,
        marriageDate: form.maritalStatus === 'Married' && form.marriageDate ? form.marriageDate : null,
        disability: form.disability?.trim() || null,
        fatherName: form.fatherName?.trim() || null,
        streetAddress: form.streetAddress?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state || null,
        pincode: form.pincode?.trim() || null,
        country: form.country?.trim() || 'India',
        empId: form.empId || null,
        department: form.department || null,
        branch: form.branch || null,
        location: form.location?.trim() || null,
        designation: form.designation || null,
        designationRoleId: form.designationRoleId || null,
        employmentType: form.employmentType || 'Full-time',
        category: form.category || null,
        qualification: form.qualification || null,
        joiningDate: form.joiningDate || null,
        reportingManagerId: form.reportingManagerId || null,
        reportingManagerName: form.reportingManagerName || null,
        reportingManagerEmpId: form.reportingManagerEmpId || null,
        prevCompany: form.prevCompany?.trim() || null,
        prevDesignation: form.prevDesignation?.trim() || null,
        prevFromDate: form.prevFromDate ? Timestamp.fromDate(new Date(form.prevFromDate)) : null,
        prevToDate: form.prevToDate ? Timestamp.fromDate(new Date(form.prevToDate)) : null,
        prevManagerName: form.prevManagerName?.trim() || null,
        prevManagerPhone: form.prevManagerPhone?.trim() || null,
        prevManagerEmail: form.prevManagerEmail?.trim() || null,
        ctcPerAnnum: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        ctc: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        incentive: form.incentive !== '' && form.incentive != null ? Number(form.incentive) : null,
        basicSalary: form.basicSalary ? Number(form.basicSalary) : null,
        hra: form.hra ? Number(form.hra) : null,
        pfApplicable: !!form.pfApplicable,
        esicApplicable: !!form.esicApplicable,
        pfNumber: form.pfApplicable ? form.pfNumber?.trim() || null : null,
        esicNumber: form.esicApplicable ? form.esicNumber?.trim() || null : null,
        customBenefits: sanitizeCustomBenefitsForSave(form.customBenefits),
        panNumber: form.panNumber?.replace(/\s/g, '') || null,
        aadhaarNumber: form.aadhaarNumber?.replace(/\s/g, '') || null,
        drivingLicenceNumber: form.drivingLicenceNumber?.trim() || null,
        emergencyContact: {
          name: form.emergencyContactName?.trim() || '',
          relationship: form.emergencyRelationship || '',
          phone: form.emergencyPhone?.trim() || '',
        },
        updatedAt: serverTimestamp(),
      };
      const savePayload = { ...payload };
      if (changes.length > 0) {
        savePayload.editHistory = arrayUnion({
          timestamp: Timestamp.now(),
          by: currentUser?.email || '',
          changes,
        });
      }
      await withRetry(
        () => updateDoc(doc(db, 'companies', companyId, 'employees', empId), savePayload),
        { companyId, action: 'updateEmployee' },
      );
      setEmployee((prev) => (prev ? { ...prev, ...savePayload } : null));
      setShowEditModal(false);
      setShowManagerDropdown(false);
      setManagerSearch('');
      setShowLocationDropdown(false);
      setLocationSearch('');
      setEditRoleSearch('');
      setShowEditRoleDropdown(false);
      success('Employee updated');
    } catch (error) {
      await handleSmartError(error, { action: 'updateEmployee' }, 'Failed to update');
    }
    setSaving(false);
  };

  const getCompanyName = () => company?.name || 'Company';

  const handleDeleteEmployee = async () => {
    if (deleteConfirmName !== employee?.fullName) return;
    if (!companyId || !empId || !employee || !empRef) return;

    try {
      setDeleting(true);

      await withRetry(() => deleteDoc(empRef), { companyId, action: 'deleteEmployee' });

      try {
        const leavesRef = collection(db, 'companies', companyId, 'leave');
        const leavesQuery = query(leavesRef, where('employeeId', '==', empId));
        const leavesSnap = await getDocs(leavesQuery);
        await Promise.all(leavesSnap.docs.map((d) => deleteDoc(d.ref)));
      } catch (leaveErr) {
        console.warn('Leave cleanup failed:', leaveErr);
      }

      try {
        const assetsRef = collection(db, 'companies', companyId, 'assets');
        const assetsQuery = query(assetsRef, where('assignedToId', '==', empId));
        const assetsSnap = await getDocs(assetsQuery);
        await Promise.all(
          assetsSnap.docs.map((d) =>
            updateDoc(d.ref, {
              assignedToId: null,
              assignedToName: null,
              assignedToEmpId: null,
              status: 'Available',
              unassignedAt: serverTimestamp(),
              unassignedReason: 'Employee deleted',
            }),
          ),
        );
      } catch (assetErr) {
        console.warn('Asset cleanup failed:', assetErr);
      }

      try {
        const token = await getValidToken();
        if (token) {
          const { findAndDeleteFolder } = await import('../utils/googleDrive');
          await findAndDeleteFolder(
            token,
            `${employee.empId} - ${employee.fullName}`,
            getCompanyName(),
          );
        }
      } catch (driveErr) {
        console.warn('Drive cleanup failed:', driveErr);
      }

      try {
        const { deleteEmployeePhoto } = await import('../utils/photoUpload');
        await deleteEmployeePhoto(companyId, empId);
      } catch (storageErr) {
        console.warn('Storage cleanup failed:', storageErr);
      }

      try {
        await updateCompanyCounts(companyId);
      } catch (countErr) {
        console.warn('Count update failed:', countErr);
      }

      trackEmployeeDeleted();
      success(`${employee.fullName} deleted permanently.`);
      setShowDeleteModal(false);
      setDeleteConfirmName('');
      navigate(`/company/${companyId}/employees`);
    } catch (error) {
      await handleSmartError(error, { action: 'deleteEmployee' }, `Delete failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  const driveAccessError = (err) => {
    const msg = err?.message || 'Upload failed';
    showError(msg);
  };

  const validateFile = (file, docType) => {
    const accepts = Array.isArray(docType?.accepts)
      ? docType.accepts
      : ['.pdf', '.jpg', '.jpeg', '.png'];
    const maxSizeMB = docType?.maxSizeMB || 10;
    const maxBytes = maxSizeMB * 1024 * 1024;
    const ext = '.' + String(file?.name || '').split('.').pop().toLowerCase();

    if (!accepts.includes(ext)) {
      const formatted = accepts.map((e) => e.replace('.', '').toUpperCase()).join(', ');
      throw new Error(`Invalid format. Only accepts: ${formatted}`);
    }

    if (file.size > maxBytes) {
      throw new Error(
        `File too large. Max size is ${maxSizeMB}MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB`,
      );
    }
  };

  const findChecklistDoc = (docId) => {
    for (const cat of activeChecklist) {
      const d = cat.documents?.find((x) => x.id === docId);
      if (d) return { ...d, category: cat.category };
    }
    return null;
  };

  const handleUploadChecklistDoc = async (file, docId, docName) => {
    if (!employee) return;
    const token = await getValidToken();
    if (!token) {
      showError('Please sign in again to upload documents');
      return;
    }
    const docType =
      activeChecklist
        .flatMap((c) => c.documents || [])
        .find((d) => d.id === docId) || findChecklistDoc(docId) || getDocById(docId);
    const effectiveDocType =
      docType || {
        id: docId,
        name: docName || docId,
        mandatory: false,
        accepts: ['.pdf', '.jpg', '.jpeg', '.png'],
        maxSizeMB: 10,
      };
    try {
      validateFile(file, effectiveDocType);
    } catch (error) {
      showError(error.message);
      return;
    }
    setUploadingDocId(docId);
    try {
      const categoryFromChecklist = findDocCategory(docId, activeChecklist);
      const finalCategoryName = categoryFromChecklist || activeChecklist[0]?.category || 'Documents';
      const result = await uploadEmployeeDocument(
        token,
        file,
        getCompanyName(),
        employee.empId,
        employee.fullName,
        finalCategoryName,
      );
      const entry = {
        id: effectiveDocType.id,
        name: effectiveDocType.name,
        category: finalCategoryName,
        fileName: file.name,
        fileId: result.fileId,
        webViewLink: result.webViewLink,
        uploadedAt: new Date(),
        uploadedBy: currentUser?.email || null,
        fileSize: result.fileSize,
      };
      if (empRef) {
        await updateDoc(empRef, {
          documents: arrayUnion(entry),
          updatedAt: serverTimestamp(),
        });
        await refreshEmployee();
      }
      success(`${docName} uploaded successfully`);
    } catch (err) {
      driveAccessError(err);
    }
    setUploadingDocId(null);
  };

  const handleReplaceDoc = async (file, docId) => {
    const docEntry = docByType[docId];
    if (!docEntry?.fileId) return;
    const token = await getValidToken();
    if (!token) {
      showError('Please sign in again to upload documents');
      return;
    }
    const docType =
      activeChecklist
        .flatMap((c) => c.documents || [])
        .find((d) => d.id === docId) || findChecklistDoc(docId) || getDocById(docId);
    const effectiveDocType =
      docType || {
        id: docId,
        name: docEntry.name || docId,
        mandatory: false,
        accepts: ['.pdf', '.jpg', '.jpeg', '.png'],
        maxSizeMB: 10,
      };
    try {
      validateFile(file, effectiveDocType);
    } catch (error) {
      showError(error.message);
      return;
    }
    setUploadingDocId(docId);
    setReplacingDocId(docEntry.fileId);
    try {
      try {
        await deleteFileFromDrive(token, docEntry.fileId);
      } catch {
        // ignore Drive delete failure
      }
      const result = await uploadEmployeeDocument(
        token,
        file,
        getCompanyName(),
        employee.empId,
        employee.fullName,
        docEntry.category,
      );
      const newEntry = {
        ...docEntry,
        id: effectiveDocType.id,
        name: effectiveDocType.name,
        fileName: file.name,
        fileId: result.fileId,
        webViewLink: result.webViewLink,
        uploadedAt: new Date(),
        uploadedBy: currentUser?.email || null,
        fileSize: result.fileSize,
      };
      if (empRef) {
        await updateDoc(empRef, {
          documents: arrayRemove(docEntry),
        });
        await updateDoc(empRef, {
          documents: arrayUnion(newEntry),
          updatedAt: serverTimestamp(),
        });
        await refreshEmployee();
      }
      success(`${docEntry.name} replaced successfully`);
    } catch (err) {
      driveAccessError(err);
    }
    setUploadingDocId(null);
    setReplacingDocId(null);
  };

  const handleDeleteChecklistDoc = async (docEntry) => {
    if (!docEntry?.fileId) return;
    const token = await getValidToken();
    if (!token) {
      showError('Please sign in again to upload documents');
      return;
    }
    let driveFailed = false;
    setDeletingDocId(docEntry.fileId);
    try {
      try {
        await deleteFileFromDrive(token, docEntry.fileId);
      } catch {
        driveFailed = true;
      }
      if (empRef) {
        await updateDoc(empRef, {
          documents: arrayRemove(docEntry),
          updatedAt: serverTimestamp(),
        });
        await refreshEmployee();
      }
      if (driveFailed) {
        showError('File removed from records (may have already been deleted from Drive)');
      } else {
        success('Document deleted');
      }
    } catch (err) {
      driveAccessError(err);
    }
    setDeletingDocId(null);
    setDeleteConfirm(null);
  };

  const handleViewDoc = (docEntry) => {
    if (docEntry?.webViewLink) window.open(docEntry.webViewLink, '_blank');
  };

  const formatDocDate = (v) => toDisplayDate(v);
  const formatFileSizeDetailed = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getFileExt = (fileName) =>
    fileName?.split('.').pop()?.toUpperCase()?.slice(0, 4) || 'FILE';

  const getFileIconColor = (fileName) => {
    const ext = fileName?.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'bg-red-500';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'bg-[#4ECDC4]';
    if (['xls', 'xlsx'].includes(ext)) return 'bg-green-600';
    if (['doc', 'docx'].includes(ext)) return 'bg-[#155858]';
    return 'bg-gray-500';
  };

  const getAssetIcon = (type) => {
    const icons = {
      Laptop: '💻',
      Desktop: '🖥️',
      'Mobile Phone': '📱',
      'SIM Card': '📶',
      Tablet: '📟',
      'ID Card': '🪪',
      'Access Card': '💳',
      Uniform: '👔',
      Headset: '🎧',
      Charger: '🔌',
      Vehicle: '🚗',
      Tools: '🔧',
      Furniture: '🪑',
    };
    return icons[type] || '📦';
  };

  const getCategoryIcon = (category) => {
    if (category === 'Pre-joining') return '📋';
    if (category === 'Day 1') return '🎉';
    if (category === 'Week 1') return '📅';
    if (category === 'Month 1') return '🏆';
    return '✅';
  };

  const isOverdue = (dueDate) => {
    const due = toJSDate(dueDate);
    if (!due) return false;
    return due < new Date();
  };

  const getAssignedLabel = (assignedTo) => {
    const map = {
      hr: 'HR Team',
      manager: 'Manager',
      it: 'IT Team',
      admin: 'Admin',
      employee: 'Employee',
    };
    return map[assignedTo] || assignedTo || '—';
  };

  const getOffCategoryIcon = (category) => {
    if (category === 'Resignation') return '📝';
    if (category === 'Knowledge Transfer') return '🧠';
    if (category === 'Asset Return') return '📦';
    if (category === 'IT & Access') return '💻';
    if (category === 'Finance & Legal') return '💰';
    if (category === 'Documents') return '📄';
    if (category === 'Exit Interview') return '🤝';
    return '✅';
  };

  const calculateOffboardingDueDate = (exitDate, daysBefore) => {
    try {
      const exit = toJSDate(exitDate) || new Date();
      const due = new Date(exit);
      // positive daysBefore = before exit (subtract)
      // negative daysBefore = after exit (subtracting negative adds)
      due.setDate(due.getDate() - Number(daysBefore || 0));
      return Timestamp.fromDate(due);
    } catch {
      return Timestamp.fromDate(new Date());
    }
  };

  const offboarding = employee?.offboarding || null;
  const managerOptions = useMemo(
    () => allEmployees.filter((emp) => emp.status !== 'Inactive' && emp.id !== empId),
    [allEmployees, empId],
  );
  const offTasks = useMemo(
    () => (Array.isArray(employee?.offboarding?.tasks) ? employee.offboarding.tasks : []),
    [employee?.offboarding],
  );
  const offCompleted = offTasks.filter((t) => t.completed).length;
  const offTotal = offTasks.length;
  const offPct = offTotal ? Math.round((offCompleted / offTotal) * 100) : (offboarding?.completionPct || 0);

  const allOffboardingTasksDone = useMemo(() => {
    const tasks = employee?.offboarding?.tasks || [];
    if (tasks.length === 0) return false;
    const requiredTasks = tasks.filter((t) => t.isRequired !== false);
    if (requiredTasks.length === 0) return false;
    return requiredTasks.every((t) => t.completed);
  }, [employee?.offboarding?.tasks]);

  const offByCategory = useMemo(() => {
    const categories = ['Resignation', 'Knowledge Transfer', 'Asset Return', 'IT & Access', 'Finance & Legal', 'Documents', 'Exit Interview'];
    const tasks = offTasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    return categories.map((cat) => ({
      category: cat,
      tasks: tasks.filter((t) => (t.category || 'Resignation') === cat),
    }));
  }, [offTasks]);

  const expectedResignationLastDay = useMemo(() => {
    if (!resignForm.resignationDate || resignForm.noticePeriodDays == null) return '';
    const date = new Date(`${resignForm.resignationDate}T12:00:00`);
    date.setDate(date.getDate() + Number(resignForm.noticePeriodDays));
    return date.toISOString().split('T')[0];
  }, [resignForm.resignationDate, resignForm.noticePeriodDays]);

  const offPhase = useMemo(() => {
    const o = employee?.offboarding;
    if (!o) return null;
    if (o.status === 'completed' || o.phase === 'completed') return 'completed';
    if (o.phase === 'notice_period') return 'notice_period';
    if (o.phase === 'exit_tasks') return 'exit_tasks';
    if (o.phase === 'withdrawn') return 'withdrawn';
    if (o.status === 'in_progress' && Array.isArray(o.tasks) && o.tasks.length > 0) return 'exit_tasks';
    return null;
  }, [employee?.offboarding]);

  const offboardingPhase = employee?.offboarding?.phase;
  const canRecordResignation =
    employee?.status === 'Active' && (!offboardingPhase || offboardingPhase === 'withdrawn');
  const offboardingAllowedStatuses = ['Active', 'Notice Period', 'Offboarding'];
  const showOffboardingMainFlow = employee && offboardingAllowedStatuses.includes(employee.status || '');
  const showOffboardingReadOnlyUi = employee?.status === 'Inactive' || offPhase === 'completed';
  const showNoticePeriodSection = employee?.status === 'Notice Period' && offPhase === 'notice_period';
  const showExitTasksSection = employee?.status === 'Offboarding' && offPhase === 'exit_tasks';
  const showStarterSection = employee?.status === 'Active' && (!offPhase || offPhase === 'withdrawn');

  const buyoutDaysPreview = useMemo(() => {
    if (!buyoutForm.actualLastDay || !employee?.offboarding?.expectedLastDay) return null;
    const expectedEnd = toJSDate(employee.offboarding.expectedLastDay);
    const actualEnd = new Date(`${buyoutForm.actualLastDay}T12:00:00`);
    if (!expectedEnd || Number.isNaN(expectedEnd.getTime())) return null;
    return Math.max(0, Math.ceil((expectedEnd.getTime() - actualEnd.getTime()) / (1000 * 60 * 60 * 24)));
  }, [buyoutForm.actualLastDay, employee?.offboarding?.expectedLastDay]);

  const noticePeriodMetrics = useMemo(() => {
    if (offPhase !== 'notice_period' || !employee?.offboarding) return null;
    const resignationDate = toJSDate(employee.offboarding.resignationDate);
    const lastDay = toJSDate(employee.offboarding.expectedLastDay);
    const totalDays = Math.max(1, Number(employee.offboarding.noticePeriodDays) || 1);
    if (!resignationDate || !lastDay) {
      return { daysElapsed: 0, daysRemaining: 0, progressPct: 0 };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const resD = new Date(resignationDate);
    resD.setHours(0, 0, 0, 0);
    const endD = new Date(lastDay);
    endD.setHours(0, 0, 0, 0);
    const daysElapsed = Math.max(0, Math.ceil((today - resD) / (1000 * 60 * 60 * 24)));
    const daysRemaining = Math.max(0, Math.ceil((endD - today) / (1000 * 60 * 60 * 24)));
    const progressPct = Math.min(100, Math.round((daysElapsed / totalDays) * 100));
    return { daysElapsed, daysRemaining, progressPct };
  }, [offPhase, employee?.offboarding]);

  const offExitRefForUi = useMemo(() => {
    const o = employee?.offboarding;
    if (!o) return null;
    return o.exitDate || o.actualLastDay || o.expectedLastDay;
  }, [employee?.offboarding]);

  const assignedAssetsForWarning = useMemo(() => {
    const trackables = assetList.filter((a) => (a.mode || 'trackable') === 'trackable' && a.assignedToId === empId && a.status === 'Assigned');
    const consumables = assetList
      .filter((a) => (a.mode || 'trackable') === 'consumable')
      .flatMap((asset) =>
        (asset.assignments || [])
          .filter((as) => as.employeeId === empId && !as.returned)
          .map((as) => ({ ...asset, _qty: as.quantity })),
      );
    return { trackables, consumables };
  }, [assetList, empId]);

  const buildExitOffboardingTasks = async (exitDateTs) => {
    let templateTasks = DEFAULT_OFFBOARDING_TEMPLATE.tasks;
    try {
      const templateDoc = await getDoc(doc(db, 'companies', companyId, 'settings', 'offboardingTemplate'));
      if (templateDoc.exists() && Array.isArray(templateDoc.data()?.tasks) && templateDoc.data().tasks.length > 0) {
        templateTasks = templateDoc.data().tasks;
      }
    } catch {
      /* default template */
    }

    const assetsSnap = await getDocs(collection(db, 'companies', companyId, 'assets'));
    const latestAssets = assetsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setAssetList(latestAssets);

    const sanitized = templateTasks
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((t, idx) => ({
        id: t.id || `off_${Date.now()}_${idx}`,
        title: t.title || '',
        description: t.description || '',
        category: t.category || 'Resignation',
        assignedTo: t.assignedTo || 'hr',
        daysBefore: Number(t.daysBefore) || 0,
        isRequired: Boolean(t.isRequired),
        order: Number(t.order) || idx,
        completed: false,
        completedAt: null,
        completedBy: null,
        notes: '',
        dueDate: calculateOffboardingDueDate(exitDateTs, t.daysBefore),
      }))
      .map((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)));

    const modeOf = (a) => a.mode || 'trackable';
    const assetRows = [];
    latestAssets.forEach((a) => {
      if (modeOf(a) === 'trackable' && a.assignedToId === empId && a.status === 'Assigned') {
        assetRows.push({ asset: a, mode: 'trackable' });
      }
      if (modeOf(a) === 'consumable' && Array.isArray(a.assignments)) {
        a.assignments.forEach((asgn, idx) => {
          if (asgn.employeeId === empId && !asgn.returned) {
            assetRows.push({ asset: a, mode: 'consumable', assignmentIndex: idx, asgn });
          }
        });
      }
    });

    const maxOrder = sanitized.reduce((m, t) => Math.max(m, Number(t.order) || 0), 0);
    const assetTasks = assetRows.map((row, i) => {
      const a = row.asset;
      const descParts = [`Asset ID: ${a.assetId || a.id}`];
      if (a.serialNumber) descParts.push(`SN: ${a.serialNumber}`);
      if (row.mode === 'consumable') {
        descParts.push(`Quantity issued: ${row.asgn?.quantity ?? 1}`);
      }
      return {
        id: `asset_return_${a.id}_${row.mode}_${row.assignmentIndex ?? 't'}_${i}`,
        title: `Return ${a.name || a.assetId || 'asset'}`,
        description: descParts.join(' · '),
        category: 'Asset Return',
        assignedTo: 'admin',
        daysBefore: 0,
        isRequired: a.isReturnable !== false,
        order: maxOrder + 1 + i,
        assetId: a.id,
        assetMode: row.mode,
        consumableAssignmentIndex: row.mode === 'consumable' ? row.assignmentIndex ?? null : null,
        consumableIssueSeconds: row.asgn?.issueDate?.seconds ?? row.asgn?.issueDate?._seconds ?? null,
        isAssetTask: true,
        completed: false,
        completedAt: null,
        completedBy: null,
        notes: '',
        dueDate: calculateOffboardingDueDate(exitDateTs, 0),
      };
    });

    return sanitizeForFirestore([...sanitized, ...assetTasks]);
  };

  const handleRecordResignation = async () => {
    if (!companyId || !empId || !employee || !currentUser) return;
    if (!resignForm.resignationDate) {
      showError('Please enter resignation date');
      return;
    }
    if (!expectedResignationLastDay) {
      showError('Please set Notice Period');
      return;
    }
    setSaving(true);
    try {
      const resignationTs = Timestamp.fromDate(new Date(`${resignForm.resignationDate}T12:00:00`));
      const expectedTs = Timestamp.fromDate(new Date(`${expectedResignationLastDay}T12:00:00`));
      const now = Timestamp.now();
      const offboardingData = {
        phase: 'notice_period',
        resignationDate: resignationTs,
        noticePeriodDays: Number(resignForm.noticePeriodDays),
        expectedLastDay: expectedTs,
        reason: resignForm.reason || '',
        notes: resignForm.notes || '',
        recordedAt: now,
        recordedBy: currentUser.email || '',
        history: [
          {
            event: 'resignation_recorded',
            date: now,
            by: currentUser.email || '',
            notes: `Notice period: ${resignForm.noticePeriodDays} days. Expected last day: ${toDisplayDate(expectedTs)}`,
          },
        ],
      };
      await withRetry(() => updateDoc(doc(db, 'companies', companyId, 'employees', empId), {
        status: 'Notice Period',
        offboarding: sanitizeForFirestore(offboardingData),
        updatedAt: serverTimestamp(),
      }), { companyId, action: 'recordResignation' });
      await refreshEmployee();
      trackResignationRecorded();
      success(`Resignation recorded. Last day: ${toDisplayDate(expectedTs)}`);
      setShowResignationModal(false);
    } catch (e) {
      console.error(e);
      await handleSmartError(e, { action: 'recordResignation' }, 'Failed to record resignation');
    }
    setSaving(false);
  };

  const handleWithdrawResignation = async () => {
    if (!companyId || !empId || !employee || !currentUser) return;
    setSaving(true);
    try {
      const now = Timestamp.now();
      const updatedHistory = [
        ...(employee.offboarding?.history || []),
        {
          event: 'resignation_withdrawn',
          date: now,
          by: currentUser.email || '',
          notes: withdrawNotes.trim() || 'Resignation withdrawn',
        },
      ];
      await withRetry(() => updateDoc(doc(db, 'companies', companyId, 'employees', empId), {
        status: 'Active',
        offboarding: sanitizeForFirestore({
          ...employee.offboarding,
          phase: 'withdrawn',
          withdrawnOn: now,
          withdrawnBy: currentUser.email || '',
          withdrawNotes: withdrawNotes.trim() || null,
          history: updatedHistory,
        }),
        updatedAt: serverTimestamp(),
      }), { companyId, action: 'withdrawResignation' });
      await refreshEmployee();
      try {
        await updateCompanyCounts(companyId);
      } catch (countErr) {
        console.warn('Count update failed:', countErr);
      }
      trackResignationWithdrawn();
      success(`${employee.fullName} is back to Active!`);
      setShowWithdrawModal(false);
      setWithdrawNotes('');
    } catch (e) {
      console.error(e);
      await handleSmartError(e, { action: 'withdrawResignation' }, 'Failed to withdraw resignation');
    }
    setSaving(false);
  };

  const handleNoticeBuyout = async () => {
    if (!companyId || !empId || !employee || !currentUser) return;
    if (!buyoutForm.actualLastDay) {
      showError('Please enter actual last day');
      return;
    }
    setSaving(true);
    try {
      const expectedEnd = toJSDate(employee.offboarding?.expectedLastDay);
      const actualEnd = new Date(`${buyoutForm.actualLastDay}T12:00:00`);
      if (!expectedEnd || Number.isNaN(expectedEnd.getTime())) {
        showError('Missing expected last day on record');
        setSaving(false);
        return;
      }
      const buyoutDays = Math.max(
        0,
        Math.ceil((expectedEnd.getTime() - actualEnd.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const exitDateTs = Timestamp.fromDate(actualEnd);
      const now = Timestamp.now();
      const allTasks = await buildExitOffboardingTasks(exitDateTs);
      const updatedHistory = [
        ...(employee.offboarding?.history || []),
        {
          event: 'notice_buyout',
          date: now,
          by: currentUser.email || '',
          notes: `Buyout of ${buyoutDays} days. Actual last day: ${toDisplayDate(buyoutForm.actualLastDay)}`,
        },
      ];
      const exitReason = employee.offboarding?.reason || employee.offboarding?.exitReason || 'Resignation';
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), {
        status: 'Offboarding',
        offboarding: sanitizeForFirestore({
          ...employee.offboarding,
          phase: 'exit_tasks',
          status: 'in_progress',
          exitDate: exitDateTs,
          actualLastDay: buyoutForm.actualLastDay,
          exitReason,
          buyoutDays,
          buyoutNotes: buyoutForm.notes || '',
          startedAt: now,
          startedBy: currentUser.email || '',
          completedAt: null,
          completionPct: 0,
          tasks: allTasks,
          history: updatedHistory,
        }),
        updatedAt: serverTimestamp(),
      });
      await refreshEmployee();
      success(`Buyout confirmed. Last day: ${toDisplayDate(buyoutForm.actualLastDay)}`);
      setShowBuyoutModal(false);
      setBuyoutForm({ actualLastDay: '', buyoutDays: 0, notes: '' });
    } catch (e) {
      console.error(e);
      showError('Failed to process buyout');
    }
    setSaving(false);
  };

  const handleStartExitTasks = async () => {
    if (!companyId || !empId || !employee || !currentUser) return;
    if (!offboardingExitDate) {
      showError('Please select last working day');
      return;
    }
    if (!offboardingExitReason) {
      showError('Please select exit reason');
      return;
    }
    setSaving(true);
    try {
      const exitDateTs = Timestamp.fromDate(new Date(`${offboardingExitDate}T12:00:00`));
      const now = Timestamp.now();
      const allTasks = await buildExitOffboardingTasks(exitDateTs);
      const updatedHistory = [
        ...(employee.offboarding?.history || []),
        {
          event: 'exit_tasks_started',
          date: now,
          by: currentUser.email || '',
          notes: `Exit date: ${toDisplayDate(exitDateTs)}`,
        },
      ];
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), {
        status: 'Offboarding',
        offboarding: sanitizeForFirestore({
          ...employee.offboarding,
          phase: 'exit_tasks',
          status: 'in_progress',
          exitDate: exitDateTs,
          actualLastDay: offboardingExitDate,
          exitReason: offboardingExitReason,
          startedAt: now,
          startedBy: currentUser.email || '',
          completedAt: null,
          completionPct: 0,
          tasks: allTasks,
          history: updatedHistory,
        }),
        updatedAt: serverTimestamp(),
      });
      await refreshEmployee();
      success(`Exit tasks started for ${employee.fullName}. Last day: ${toDisplayDate(exitDateTs)}`);
      setShowExitTasksModal(false);
    } catch (error) {
      showError(`Failed to start exit tasks: ${error?.message || 'Unknown error'}`);
    }
    setSaving(false);
  };

  const returnAssetForCompletedOffTask = async (taskMetaParam) => {
    let assetAutoReturned = false;
    if (!taskMetaParam?.isAssetTask || !taskMetaParam?.assetId) return false;
    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', taskMetaParam.assetId);
      const assetSnap = await getDoc(assetRef);
      if (assetSnap.exists()) {
        const ad = assetSnap.data();
        const mode = taskMetaParam.assetMode || ad.mode || 'trackable';
        if (mode === 'trackable' && ad.assignedToId === empId && ad.status === 'Assigned') {
          const returnTs = Timestamp.now();
          const historyEntry = {
            action: 'returned',
            employeeId: empId,
            employeeName: employee.fullName || '',
            date: returnTs,
            condition: ad.condition || 'Good',
            notes: 'Returned during offboarding',
            performedBy: currentUser.email || '',
          };
          await updateDoc(assetRef, {
            status: 'Available',
            assignedToId: null,
            assignedToName: null,
            assignedToEmpId: null,
            returnDate: returnTs,
            history: [...(Array.isArray(ad.history) ? ad.history : []), historyEntry],
          });
          assetAutoReturned = true;
        } else if (mode === 'consumable' && taskMetaParam.consumableAssignmentIndex != null) {
          const assignments = Array.isArray(ad.assignments) ? [...ad.assignments] : [];
          const idx = taskMetaParam.consumableAssignmentIndex;
          const asgn = assignments[idx];
          if (asgn && asgn.employeeId === empId && !asgn.returned) {
            const qty = Number(asgn.quantity) || 1;
            const returnTs = Timestamp.now();
            const nextAssignments = assignments.map((x, j) =>
              j === idx ? { ...x, quantity: 0, returned: true, returnDate: returnTs } : x,
            );
            await updateDoc(assetRef, {
              assignments: nextAssignments,
              availableStock: (Number(ad.availableStock) || 0) + qty,
              issuedCount: Math.max(0, (Number(ad.issuedCount) || 0) - qty),
              history: [
                ...(Array.isArray(ad.history) ? ad.history : []),
                {
                  action: 'returned',
                  employeeId: empId,
                  employeeName: employee.fullName || '',
                  quantity: qty,
                  date: returnTs,
                  notes: 'Returned during offboarding',
                  performedBy: currentUser.email || '',
                },
              ],
            });
            assetAutoReturned = true;
          }
        }
      }
    } catch {
      /* ignore auto-return errors */
    }
    if (assetAutoReturned) {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'assets'));
        setAssetList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch {
        /* ignore */
      }
    }
    return assetAutoReturned;
  };

  const markOffboardingTaskComplete = async (taskId, notes) => {
    if (!companyId || !empId || !employee || !currentUser || !offboarding) return;
    try {
      const taskMeta = offTasks.find((t) => t.id === taskId);
      const now = Timestamp.now();
      const nextTasks = offTasks.map((t) =>
        t.id === taskId
          ? { ...t, completed: true, completedAt: now, completedBy: currentUser.email || '', notes: notes || '' }
          : t,
      );
      const done = nextTasks.filter((t) => t.completed).length;
      const total = nextTasks.length || 1;

      const pct = Math.round((done / total) * 100);
      const offboardingPayload = {
        ...(offboarding || {}),
        phase: 'exit_tasks',
        status: 'in_progress',
        completionPct: pct,
        tasks: nextTasks,
        completedAt: offboarding.completedAt || null,
        completedBy: offboarding.completedBy || null,
        history: offboarding.history || [],
      };

      const payload = {
        offboarding: sanitizeForFirestore(offboardingPayload),
        status: employee.status || 'Offboarding',
        updatedAt: serverTimestamp(),
      };

      await withRetry(
        () => updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload),
        { companyId, action: 'markOffboardingTaskComplete' },
      );

      const assetAutoReturned = await returnAssetForCompletedOffTask(taskMeta);
      setEmployee((prev) =>
        prev
          ? {
              ...prev,
              offboarding: payload.offboarding,
              status: payload.status,
            }
          : null,
      );
      if (assetAutoReturned) success(`✓ ${taskMeta?.title || 'Task'} marked complete and asset returned in inventory`);
      else success('Task marked complete');
    } catch (error) {
      await handleSmartError(error, { action: 'markOffboardingTaskComplete', taskId }, 'Failed to update task');
    }
  };

  const unmarkOffboardingTask = async (taskId) => {
    if (!companyId || !empId || !employee || !currentUser || !offboarding) return;
    const nextTasks = offTasks.map((t) =>
      t.id === taskId ? { ...t, completed: false, completedAt: null, completedBy: null, notes: '' } : t,
    );
    const done = nextTasks.filter((t) => t.completed).length;
    const total = nextTasks.length || 1;
    const pct = Math.round((done / total) * 100);
    const payload = {
      offboarding: sanitizeForFirestore({
        ...(offboarding || {}),
        phase: 'exit_tasks',
        status: 'in_progress',
        completionPct: pct,
        tasks: nextTasks,
        completedAt: offboarding.completedAt || null,
        completedBy: offboarding.completedBy || null,
      }),
      status: 'Offboarding',
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
    setEmployee((prev) =>
      prev
        ? {
            ...prev,
            offboarding: payload.offboarding,
            status: payload.status,
          }
        : null,
    );
    success('Task updated');
  };

  const handleCompleteOffboarding = async () => {
    if (!companyId || !empId || !employee || !currentUser) return;
    try {
      setSaving(true);
      const now = Timestamp.now();
      const notesText = completionNotes.trim() || 'Offboarding completed by HR';
      const historyEntry = {
        event: 'offboarding_completed',
        date: now,
        by: currentUser.email || '',
        notes: notesText,
      };
      await withRetry(() => updateDoc(
        doc(db, 'companies', companyId, 'employees', empId),
        sanitizeForFirestore({
          status: 'Inactive',
          offboarding: {
            ...(employee.offboarding || {}),
            phase: 'completed',
            status: 'completed',
            completedAt: now,
            completedBy: currentUser.email || '',
            completionNotes: completionNotes.trim() || '',
            completionPct: 100,
            history: [...(employee.offboarding?.history || []), historyEntry],
          },
          deactivatedAt: now,
          deactivatedBy: currentUser.email || '',
          deactivationReason: 'Offboarding completed',
          updatedAt: serverTimestamp(),
        }),
      ), { companyId, action: 'completeOffboarding' });
      setShowCompleteOffboardingModal(false);
      setCompletionNotes('');
      await refreshEmployee();
      try {
        await updateCompanyCounts(companyId);
      } catch (countErr) {
        console.warn('Count update failed:', countErr);
      }
      trackOffboardingCompleted();
      success(`✅ ${employee.fullName} offboarding complete. Marked as Inactive.`);
    } catch (e) {
      await handleSmartError(e, { action: 'completeOffboarding' }, `Failed to complete offboarding: ${e?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRehireEmployee = async () => {
    if (!rehireForm.newJoiningDate) {
      showError('Please enter new joining date');
      return;
    }
    if (!companyId || !empId || !employee || !currentUser || !empRef) return;

    try {
      setSaving(true);
      const newJoinTs = Timestamp.fromDate(new Date(`${rehireForm.newJoiningDate}T12:00:00`));
      const exitDateRaw = employee.deactivatedAt || employee.offboarding?.completedAt || Timestamp.now();

      const previousEmployment = sanitizeForFirestore({
        tenure: (employee.employmentHistory?.length || 0) + 1,
        empId: employee.empId,
        joiningDate: employee.joiningDate ?? null,
        exitDate: exitDateRaw,
        designation: employee.designation || '',
        department: employee.department || '',
        ctc: employee.ctcPerAnnum || employee.ctc || '',
        exitReason: employee.offboarding?.reason || '',
      });

      const timelineEntry = sanitizeForFirestore({
        event: 'rehired',
        date: Timestamp.now(),
        timestamp: Timestamp.now(),
        by: currentUser.email || '',
        notes:
          rehireForm.notes.trim() ||
          `Rehired. New joining: ${toDisplayDate(newJoinTs)}`,
      });

      await withRetry(() => updateDoc(empRef, {
        status: 'Active',
        joiningDate: newJoinTs,
        employmentHistory: [...(employee.employmentHistory || []), previousEmployment],
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
        offboarding: null,
        onboarding: null,
        editHistory: [...(employee.editHistory || []), timelineEntry],
        rehireCount: (employee.rehireCount || 0) + 1,
        rehiredAt: Timestamp.now(),
        rehiredBy: currentUser.email || '',
        updatedAt: serverTimestamp(),
      }), { companyId, action: 'rehireEmployee' });

      success(`✅ ${employee.fullName} rehired! Please update their profile details.`);
      setShowRehireModal(false);
      setRehireForm({ newJoiningDate: '', notes: '' });
      await refreshEmployee();
      try {
        await updateCompanyCounts(companyId);
      } catch (countErr) {
        console.warn('Count update failed:', countErr);
      }
    } catch (e) {
      await handleSmartError(e, { action: 'rehireEmployee' }, `Failed to rehire: ${e?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const calculateDueDate = (joiningDate, daysFromJoining) => {
    try {
      let joining;
      if (joiningDate?.toDate) {
        joining = joiningDate.toDate();
      } else if (joiningDate instanceof Date) {
        joining = joiningDate;
      } else if (typeof joiningDate === 'string') {
        joining = new Date(joiningDate);
      } else if (joiningDate?.seconds) {
        joining = new Date(joiningDate.seconds * 1000);
      } else {
        joining = new Date();
      }

      const due = new Date(joining);
      due.setDate(due.getDate() + (Number(daysFromJoining) || 0));
      return Timestamp.fromDate(due);
    } catch {
      return Timestamp.fromDate(new Date());
    }
  };

  const onboarding = employee?.onboarding || null;
  const onboardingTasks = useMemo(
    () => (Array.isArray(employee?.onboarding?.tasks) ? employee.onboarding.tasks : []),
    [employee?.onboarding],
  );
  const onboardingCompleted = onboardingTasks.filter((t) => t.completed).length;
  const onboardingTotal = onboardingTasks.length;
  const onboardingPct =
    onboardingTotal > 0 ? Math.round((onboardingCompleted / onboardingTotal) * 100) : 0;

  const canStartOnboarding = employee?.status === 'Active';
  const onboardingEverStarted = !!(
    onboarding?.startedAt ||
    onboarding?.status === 'in_progress' ||
    onboarding?.status === 'completed'
  );
  const showOnboardingTaskList =
    onboardingTasks.length > 0 ||
    onboarding?.status === 'in_progress' ||
    onboarding?.status === 'completed';

  const onboardingStatusForOff = employee?.onboarding?.status;
  const onboardingPctForOff =
    employee?.onboarding?.completionPct != null && employee?.onboarding?.completionPct !== ''
      ? Number(employee.onboarding.completionPct)
      : onboardingPct;
  const onboardingCompleteForOff =
    onboardingStatusForOff === 'completed' || onboardingPctForOff === 100;
  const onboardingStartedForOff = !!employee?.onboarding?.startedAt;

  const handleRecordResignationClick = () => {
    if (!onboardingCompleteForOff) {
      setShowOnboardingWarningModal(true);
    } else {
      setShowResignationModal(true);
    }
  };

  const onboardingByCategory = useMemo(() => {
    const categories = ['Pre-joining', 'Day 1', 'Week 1', 'Month 1'];
    const tasks = onboardingTasks.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    return categories.map((cat) => ({
      category: cat,
      tasks: tasks.filter((t) => (t.category || 'Day 1') === cat),
    }));
  }, [onboardingTasks]);

  const handleStartOnboarding = async () => {
    if (!companyId || !empId || !employee || !currentUser) return;
    if (employee.status !== 'Active') return;
    try {
      setSaving(true);
      let templateTasks = DEFAULT_ONBOARDING_TEMPLATE.tasks;
      try {
        const templateDoc = await getDoc(doc(db, 'companies', companyId, 'settings', 'onboardingTemplate'));
        if (templateDoc.exists() && Array.isArray(templateDoc.data()?.tasks) && templateDoc.data().tasks.length > 0) {
          templateTasks = templateDoc.data().tasks;
        }
      } catch {
        /* use default template */
      }

      const now = Timestamp.now();
      const sanitizedTasks = templateTasks
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((t) => ({
          id: t.id || `task_${Date.now()}`,
          title: t.title || '',
          description: t.description || '',
          category: t.category || 'Day 1',
          assignedTo: t.assignedTo || 'hr',
          daysFromJoining: t.daysFromJoining || 0,
          isRequired: t.isRequired || false,
          order: t.order || 0,
          linkedPolicyId: t.linkedPolicyId || '',
          completed: false,
          completedAt: null,
          completedBy: null,
          notes: '',
          dueDate: calculateDueDate(employee.joiningDate, t.daysFromJoining),
        }))
        .map((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)));

      const payload = {
        onboarding: sanitizeForFirestore({
          status: 'in_progress',
          startedAt: now,
          completedAt: null,
          completionPct: 0,
          tasks: sanitizedTasks,
        }),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
      setEmployee((prev) => (prev ? { ...prev, ...payload } : prev));
      trackOnboardingStarted();
      success('Onboarding started');
    } catch (error) {
      showError(`Failed to start: ${error?.message || 'Unknown error'}`);
    }
    setSaving(false);
  };

  const markTaskComplete = async (taskId, notes) => {
    if (!companyId || !empId || !employee || !currentUser || !onboarding) return;
    try {
      const now = Timestamp.now();
      const nextTasks = onboardingTasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              completed: true,
              completedAt: now,
              completedBy: currentUser.email || '',
              notes: notes || '',
            }
          : t,
      );
      const done = nextTasks.filter((t) => t.completed).length;
      const total = nextTasks.length || 1;
      const pct = Math.round((done / total) * 100);
      const requiredDone = nextTasks.filter((t) => t.isRequired).every((t) => t.completed);
      const status = requiredDone && done === nextTasks.length ? 'completed' : 'in_progress';

      const payload = {
        onboarding: sanitizeForFirestore({
          ...(onboarding || {}),
          status,
          completionPct: pct,
          tasks: nextTasks,
          completedAt: status === 'completed' ? now : onboarding.completedAt || null,
        }),
        updatedAt: serverTimestamp(),
      };

      await withRetry(
        () => updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload),
        { companyId, action: 'markOnboardingTaskComplete' },
      );
      setEmployee((prev) => (prev ? { ...prev, onboarding: payload.onboarding } : prev));
      if (status === 'completed') {
        trackOnboardingCompleted();
        success('🎉 Onboarding completed!');
      } else success('Task marked complete');
    } catch (error) {
      await handleSmartError(error, { action: 'markOnboardingTaskComplete', taskId }, 'Failed to update task');
    }
  };

  const unmarkTask = async (taskId) => {
    if (!companyId || !empId || !employee || !currentUser || !onboarding) return;
    const nextTasks = onboardingTasks.map((t) =>
      t.id === taskId
        ? { ...t, completed: false, completedAt: null, completedBy: null, notes: '' }
        : t,
    );
    const done = nextTasks.filter((t) => t.completed).length;
    const total = nextTasks.length || 1;
    const pct = Math.round((done / total) * 100);

    const payload = {
      onboarding: sanitizeForFirestore({
        ...(onboarding || {}),
        status: done === 0 ? 'not_started' : 'in_progress',
        completionPct: pct,
        completedAt: null,
        tasks: nextTasks,
      }),
      updatedAt: serverTimestamp(),
    };

    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
    setEmployee((prev) => (prev ? { ...prev, onboarding: payload.onboarding } : prev));
    success('Task updated');
  };

  const handleAssignAssetChange = (e) => {
    const { name, value } = e.target;
    setAssignAssetForm((prev) => ({ ...prev, [name]: value }));
  };

  const openProfileAssignModal = () => {
    if (employee?.status === 'Inactive') return;
    const today = new Date().toISOString().slice(0, 10);
    setAssignAssetForm({
      assetId: '',
      issueDate: today,
      condition: 'Good',
      notes: '',
    });
    setIssueConsumableAsset(null);
    setIssueConsumableForm({
      quantity: 1,
      issueDate: today,
      condition: 'Good',
      notes: '',
    });
    setProfileAssignMode('trackable');
    setShowProfileAssetDropdown(false);
    setProfileAssetSearch('');
    setShowProfileAssignModal(true);
  };

  const handleSaveAssignFromProfile = async (e) => {
    e.preventDefault();
    if (!companyId || !empId || !employee || !assignAssetForm.assetId || !currentUser) return;
    setSaving(true);
    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', assignAssetForm.assetId);
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) {
        showError('Asset not found');
        setSaving(false);
        return;
      }
      const asset = { id: assetSnap.id, ...assetSnap.data() };
      const issueTs = assignAssetForm.issueDate
        ? Timestamp.fromDate(new Date(assignAssetForm.issueDate))
        : Timestamp.now();
      const historyEntry = {
        action: 'assigned',
        employeeId: empId,
        employeeName: employee.fullName || '',
        date: issueTs,
        condition: assignAssetForm.condition || 'Good',
        notes: assignAssetForm.notes?.trim() || '',
        performedBy: currentUser.email || '',
      };
      const existingHistory = Array.isArray(asset.history) ? asset.history : [];

      await updateDoc(assetRef, {
        status: 'Assigned',
        assignedToId: empId,
        assignedToName: employee.fullName || '',
        assignedToEmpId: employee.empId || '',
        issueDate: issueTs,
        condition: assignAssetForm.condition || asset.condition || 'Good',
        history: [...existingHistory, historyEntry],
      });

      setAssetList((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                ...asset,
                status: 'Assigned',
                assignedToId: empId,
                assignedToName: employee.fullName || '',
                assignedToEmpId: employee.empId || '',
                issueDate: issueTs,
                condition: assignAssetForm.condition || asset.condition || 'Good',
                history: [...existingHistory, historyEntry],
              }
            : a,
        ),
      );
      success('Asset assigned');
      setShowAssignAssetModal(false);
      setShowProfileAssignModal(null);
      setShowProfileAssetDropdown(false);
      setProfileAssetSearch('');
      setIssueConsumableAsset(null);
      setProfileAssignMode('trackable');
    } catch {
      showError('Failed to assign asset');
    }
    setSaving(false);
  };

  const handleIssueConsumableFromProfile = async (e) => {
    e.preventDefault();
    if (!companyId || !empId || !employee || !issueConsumableAsset || !currentUser) return;

    const qty = Number(issueConsumableForm.quantity);
    if (!qty || qty <= 0) return;

    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', issueConsumableAsset.id);
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) {
        showError('Asset not found');
        return;
      }

      const asset = { id: assetSnap.id, ...assetSnap.data() };
      const available = Number(asset.availableStock) || 0;
      if (qty > available) {
        showError(`Only ${available} available`);
        return;
      }

      const issueTs = issueConsumableForm.issueDate
        ? Timestamp.fromDate(new Date(issueConsumableForm.issueDate))
        : Timestamp.now();

      const assignment = {
        employeeId: empId,
        employeeName: employee.fullName || '',
        empId: employee.empId || '',
        quantity: qty,
        issueDate: issueTs,
        condition: issueConsumableForm.condition || 'Good',
        returnDate: null,
        returned: false,
        notes: issueConsumableForm.notes?.trim() || '',
      };

      const existingAssignments = Array.isArray(asset.assignments) ? asset.assignments : [];
      const existingHistory = Array.isArray(asset.history) ? asset.history : [];

      await updateDoc(assetRef, {
        assignments: [...existingAssignments, assignment],
        availableStock: available - qty,
        issuedCount: (Number(asset.issuedCount) || 0) + qty,
        history: [
          ...existingHistory,
          {
            action: 'issued',
            employeeId: empId,
            employeeName: employee.fullName || '',
            quantity: qty,
            date: issueTs,
            condition: issueConsumableForm.condition || 'Good',
            notes: issueConsumableForm.notes?.trim() || '',
            performedBy: currentUser.email || '',
          },
        ],
      });

      success(`${qty} ${asset.name} issued to ${employee.fullName}`);

      // Refresh local asset list
      const assetsSnap = await getDocs(collection(db, 'companies', companyId, 'assets'));
      setAssetList(assetsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      setShowProfileAssignModal(null);
      setIssueConsumableAsset(null);
      setProfileAssignMode('trackable');
    } catch {
      showError('Failed to issue consumable');
    }
  };

  const handleReturnAssetFromProfile = (asset) => {
    const today = new Date().toISOString().slice(0, 10);
    setReturnAsset(asset);
    setReturnAssetForm({
      date: today,
      condition: 'Good',
      notes: '',
    });
  };

  const handleReturnAssetChange = (e) => {
    const { name, value } = e.target;
    setReturnAssetForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveReturnFromProfile = async (e) => {
    e.preventDefault();
    if (!companyId || !returnAsset || !currentUser) return;
    setSaving(true);
    try {
      const assetRef = doc(db, 'companies', companyId, 'assets', returnAsset.id);
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) {
        showError('Asset not found');
        setSaving(false);
        return;
      }
      const asset = { id: assetSnap.id, ...assetSnap.data() };
      const returnTs = returnAssetForm.date
        ? Timestamp.fromDate(new Date(returnAssetForm.date))
        : Timestamp.now();
      const isDamaged = returnAssetForm.condition === 'Damaged';
      const newStatus = isDamaged ? 'Damaged' : 'Available';
      const historyEntry = {
        action: 'returned',
        employeeId: empId,
        employeeName: employee.fullName || '',
        date: returnTs,
        condition: returnAssetForm.condition || 'Good',
        notes: returnAssetForm.notes?.trim() || '',
        performedBy: currentUser.email || '',
      };
      const existingHistory = Array.isArray(asset.history) ? asset.history : [];

      await updateDoc(assetRef, {
        status: newStatus,
        assignedToId: null,
        assignedToName: null,
        assignedToEmpId: null,
        returnDate: returnTs,
        condition: returnAssetForm.condition || asset.condition || 'Good',
        history: [...existingHistory, historyEntry],
      });

      setAssetList((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                ...asset,
                status: newStatus,
                assignedToId: null,
                assignedToName: null,
                assignedToEmpId: null,
                returnDate: returnTs,
                condition: returnAssetForm.condition || asset.condition || 'Good',
                history: [...existingHistory, historyEntry],
              }
            : a,
        ),
      );
      success('Asset returned');
      setReturnAsset(null);
    } catch {
      showError('Failed to return asset');
    }
    setSaving(false);
  };

  const handleReturnConsumableFromProfile = async () => {
    try {
      if (!returnConsumableModal || !companyId || !empId || !employee || !currentUser) return;

      const { asset, assignment } = returnConsumableModal;
      if (!asset || !assignment) return;

      const assetRef = doc(db, 'companies', companyId, 'assets', asset.id);

      const qty = Math.min(Number(returnQty) || 0, Number(assignment.quantity) || 0);
      if (!qty || qty <= 0) {
        showError('Invalid return quantity');
        return;
      }

      const assignmentIssueSeconds = assignment.issueDate?.seconds ?? 0;

      // Refresh asset to avoid stale stock counts
      const assetSnap = await getDoc(assetRef);
      if (!assetSnap.exists()) {
        showError('Asset not found');
        return;
      }

      const assetData = { id: assetSnap.id, ...assetSnap.data() };
      const existingAssignments = Array.isArray(assetData.assignments) ? assetData.assignments : [];
      const existingHistory = Array.isArray(assetData.history) ? assetData.history : [];

      const updatedAssignments = existingAssignments.map((a) => {
        const aIssueSeconds = a.issueDate?.seconds ?? 0;
        const matchesThisEmployeeAssignment =
          a.employeeId === empId && !a.returned && aIssueSeconds === assignmentIssueSeconds;

        if (!matchesThisEmployeeAssignment) return a;

        const remaining = Number(a.quantity) - qty;
        if (remaining <= 0) {
          return {
            ...a,
            returned: true,
            returnDate: Timestamp.fromDate(new Date()),
            quantity: 0,
          };
        }

        return {
          ...a,
          quantity: remaining,
        };
      });

      const newHistory = [
        ...existingHistory,
        {
          action: 'returned',
          employeeId: empId,
          employeeName: employee.fullName,
          quantity: qty,
          date: Timestamp.fromDate(new Date()),
          condition: returnCondition,
          notes: returnNotes?.trim() || '',
          performedBy: currentUser.email,
        },
      ];

      await updateDoc(assetRef, {
        assignments: updatedAssignments,
        issuedCount: Math.max(0, Number(assetData.issuedCount || 0) - qty),
        availableStock: Number(assetData.availableStock || 0) + qty,
        history: newHistory,
      });

      success(`${qty} ${assetData.name} returned successfully`);

      // Refresh local asset list
      const assetsSnap = await getDocs(collection(db, 'companies', companyId, 'assets'));
      setAssetList(assetsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      setReturnConsumableModal(null);
      setReturnQty(1);
      setReturnCondition('Good');
      setReturnNotes('');
    } catch (error) {
      showError(`Return failed: ${error?.message || 'Unknown error'}`);
    }
  };

  const handlePrintProfile = () => {
    if (!employee) return;
    const e = escapeHtml;
    const companyName = getCompanyName() || '';
    const addrRaw =
      [employee.streetAddress, employee.city, employee.state, employee.pincode, employee.country].filter(Boolean).join(', ') ||
      employee.address ||
      '';
    const addr = addrRaw ? e(addrRaw) : '—';
    const ctcVal =
      employee.ctcPerAnnum != null || employee.ctc != null
        ? `₹${(employee.ctcPerAnnum ?? employee.ctc).toLocaleString('en-IN')}`
        : '—';
    const basicVal =
      employee.basicSalary != null ? `₹${employee.basicSalary.toLocaleString('en-IN')}/month` : '—';
    const hraVal =
      employee.hra != null ? `₹${employee.hra.toLocaleString('en-IN')}/month` : '—';
    const incNum =
      employee.incentive != null && employee.incentive !== '' && !Number.isNaN(Number(employee.incentive))
        ? Number(employee.incentive)
        : null;
    const incentiveVal =
      incNum != null
        ? `₹${incNum.toLocaleString('en-IN')}/month · ₹${(incNum * 12).toLocaleString('en-IN')} p.a.`
        : '—';
    const aadhaarDisp = employee.aadhaarNumber ? e(`XXXX XXXX ${String(employee.aadhaarNumber).slice(-4)}`) : '—';
    const pfOn = employee.pfApplicable ?? !!String(employee.pfNumber || '').trim();
    const esicOn = employee.esicApplicable ?? !!String(employee.esicNumber || '').trim();
    const pfPrint = `${employee.pfApplicable ? 'Yes' : 'No'}${employee.pfNumber ? ` · ${e(employee.pfNumber)}` : ''}`;
    const esicPrint = `${employee.esicApplicable ? 'Yes' : 'No'}${employee.esicNumber ? ` · ${e(employee.esicNumber)}` : ''}`;
    const maritalPrint = e(employee.maritalStatus || '—');
    const weddingDatePrint =
      employee.maritalStatus === 'Married' && employee.marriageDate
        ? e(toDisplayDate(employee.marriageDate) || '—')
        : null;

    const prevDurationPrint =
      employee.prevFromDate && employee.prevToDate
        ? (() => {
            const from = new Date(toDateString(employee.prevFromDate));
            const to = new Date(toDateString(employee.prevToDate));
            if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '';
            const months =
              (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
            const years = Math.floor(months / 12);
            const rem = months % 12;
            let dur = '';
            if (years > 0) dur += `${years}y `;
            if (rem > 0) dur += `${rem}m`;
            return dur.trim();
          })()
        : '';
    const prevExpBlock =
      employee.prevCompany ||
      employee.prevDesignation ||
      employee.prevFromDate ||
      employee.prevToDate ||
      employee.prevManagerName
        ? `<div class="print-section">
        <div class="print-section-title">Previous experience</div>
        <div class="print-grid-2">
          <div><div class="print-field-label">Previous company</div><div class="print-field-value">${e(employee.prevCompany || '—')}</div></div>
          <div><div class="print-field-label">Previous designation</div><div class="print-field-value">${e(employee.prevDesignation || '—')}</div></div>
          <div><div class="print-field-label">From / To</div><div class="print-field-value">${e(
            [employee.prevFromDate && toDisplayDate(employee.prevFromDate), employee.prevToDate && toDisplayDate(employee.prevToDate)]
              .filter(Boolean)
              .join(' — ') || '—',
          )}${prevDurationPrint ? ` · ${e(prevDurationPrint)}` : ''}</div></div>
          <div><div class="print-field-label">Previous manager</div><div class="print-field-value">${e(employee.prevManagerName || '—')}</div></div>
          <div><div class="print-field-label">Manager phone</div><div class="print-field-value">${e(employee.prevManagerPhone || '—')}</div></div>
          <div style="grid-column:1/-1"><div class="print-field-label">Manager email</div><div class="print-field-value">${e(employee.prevManagerEmail || '—')}</div></div>
        </div>
      </div>`
        : '';

    const customBenefitsPrintRows = (employee.customBenefits || [])
      .filter((b) => (b?.name || '').trim())
      .map(
        (b) =>
          `<div><div class="print-field-label">${e(b.name)}</div><div class="print-field-value">${e(
            [b.value, b.notes].filter(Boolean).join(' · ') || '—',
          )}</div></div>`,
      )
      .join('');
    const benefitsBlock =
      pfOn || esicOn || customBenefitsPrintRows
        ? `<div class="print-section">
        <div class="print-section-title">Benefits</div>
        <div class="print-grid-2">
          <div><div class="print-field-label">PF</div><div class="print-field-value">${pfPrint}</div></div>
          <div><div class="print-field-label">ESIC</div><div class="print-field-value">${esicPrint}</div></div>
          ${customBenefitsPrintRows}
        </div>
      </div>`
        : '';

    const emergencyBlock = employee.emergencyContact?.name
      ? `<div class="print-section">
        <div class="print-section-title">Emergency contact</div>
        <div class="print-grid-2">
          <div><div class="print-field-label">Name</div><div class="print-field-value">${e(employee.emergencyContact.name)}</div></div>
          <div><div class="print-field-label">Relationship</div><div class="print-field-value">${e(employee.emergencyContact.relationship || '—')}</div></div>
          <div><div class="print-field-label">Phone</div><div class="print-field-value">${e(employee.emergencyContact.phone || '—')}</div></div>
        </div>
      </div>`
      : '';

    const assetsBlock =
      employeeAssets.length > 0
        ? `<div class="print-section">
        <div class="print-section-title">Assigned assets (${employeeAssets.length})</div>
        <table class="print-table">
          <thead><tr><th>Asset ID</th><th>Name</th><th>Serial</th></tr></thead>
          <tbody>
            ${employeeAssets
              .map(
                (a) =>
                  `<tr><td>${e(a.assetId || '—')}</td><td>${e(a.name || '—')}</td><td>${e(a.serialNumber || '—')}</td></tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`
        : '';

    const status = employee.status || 'Active';
    const statusClass =
      status === 'Active' ? 'print-badge-green' : status === 'Inactive' ? 'print-badge-red' : 'print-badge-amber';

    const printInitials =
      (employee.fullName || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase() || '?';

    const initialsSection = `<div style="display:flex;align-items:center;gap:20px;margin-bottom:28px;padding-bottom:24px;border-bottom:2px solid #E8F5F5;">
    <div style="width:80px;height:80px;border-radius:50%;background:#1B6B6B;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:white;flex-shrink:0;">
      ${e(printInitials)}
    </div>
    <div>
      <h2 style="font-size:24px;font-weight:700;color:#1B6B6B;margin:0 0 6px 0;">${e(employee.fullName || '—')}</h2>
      <p style="font-size:14px;color:#6b7280;margin:0 0 4px 0;">${e(employee.designation || '')}${
        employee.department ? ` · ${e(employee.department)}` : ''
      }</p>
      <p style="font-size:13px;color:#9ca3af;margin:0;">${e(employee.empId || '')}${
        status ? ` · ${e(status)}` : ''
      }</p>
    </div>
  </div>`;

    const noticePrint =
      status === 'Notice Period' && employee.offboarding
        ? `<div class="print-section">
        <div class="print-section-title">Notice Period</div>
        <div class="print-grid-2">
          <div><div class="print-field-label">Notice (days)</div><div class="print-field-value">${e(String(employee.offboarding.noticePeriodDays ?? '—'))}</div></div>
          <div><div class="print-field-label">Expected last day</div><div class="print-field-value">${e(toDisplayDate(employee.offboarding.expectedLastDay) || '—')}</div></div>
          <div><div class="print-field-label">Resignation date</div><div class="print-field-value">${e(toDisplayDate(employee.offboarding.resignationDate) || '—')}</div></div>
          <div><div class="print-field-label">Reason</div><div class="print-field-value">${e(employee.offboarding.reason || '—')}</div></div>
        </div>
      </div>`
        : '';

    const content = `
      ${initialsSection}

      <div class="print-highlight-card" style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <div class="print-field-label">Employee</div>
          <div class="print-field-value" style="font-size:18px">${e(employee.fullName || '—')}</div>
          <p class="print-meta" style="margin-top:6px">${e(employee.designation || '—')} · ${e(employee.department || '—')}</p>
          <p class="print-meta">${e(companyName)} · ${e(employee.empId || '—')}</p>
        </div>
        <span class="print-badge ${statusClass}">${e(status)}</span>
      </div>

      ${noticePrint}

      <div class="print-section">
        <div class="print-section-title">Personal information</div>
        <div class="print-grid-2">
          <div><div class="print-field-label">Full name</div><div class="print-field-value">${e(employee.fullName || '—')}</div></div>
          <div><div class="print-field-label">Father's name</div><div class="print-field-value">${e(employee.fatherName || '—')}</div></div>
          <div><div class="print-field-label">Email</div><div class="print-field-value">${e(employee.email || '—')}</div></div>
          <div><div class="print-field-label">Phone</div><div class="print-field-value">${e(employee.phone || '—')}</div></div>
          <div><div class="print-field-label">Alternative mobile</div><div class="print-field-value">${e(employee.alternativeMobile || '—')}</div></div>
          <div><div class="print-field-label">Date of birth</div><div class="print-field-value">${e(toDisplayDate(employee.dateOfBirth) || '—')}</div></div>
          <div><div class="print-field-label">Gender</div><div class="print-field-value">${e(employee.gender || '—')}</div></div>
          <div><div class="print-field-label">Blood group</div><div class="print-field-value">${e(employee.bloodGroup || '—')}</div></div>
          <div><div class="print-field-label">Marital status</div><div class="print-field-value">${maritalPrint}</div></div>
          ${
            weddingDatePrint
              ? `<div><div class="print-field-label">Marriage date</div><div class="print-field-value">${weddingDatePrint}</div></div>`
              : ''
          }
          <div><div class="print-field-label">Disability</div><div class="print-field-value">${e(employee.disability || '—')}</div></div>
          <div style="grid-column:1/-1"><div class="print-field-label">Address</div><div class="print-field-value">${addr}</div></div>
          <div><div class="print-field-label">Qualification</div><div class="print-field-value">${e(employee.qualification || '—')}</div></div>
        </div>
      </div>

      ${prevExpBlock}

      <div class="print-section">
        <div class="print-section-title">Employment details</div>
        <div class="print-grid-2">
          <div><div class="print-field-label">Emp ID</div><div class="print-field-value">${e(employee.empId || '—')}</div></div>
          <div><div class="print-field-label">Department</div><div class="print-field-value">${e(employee.department || '—')}</div></div>
          <div><div class="print-field-label">Designation</div><div class="print-field-value">${e(employee.designation || '—')}</div></div>
          <div><div class="print-field-label">Branch</div><div class="print-field-value">${e(employee.branch || '—')}</div></div>
          <div><div class="print-field-label">Location</div><div class="print-field-value">${e(employee.location || '—')}</div></div>
          <div><div class="print-field-label">Employment type</div><div class="print-field-value">${e(employee.employmentType || '—')}</div></div>
          <div><div class="print-field-label">Category</div><div class="print-field-value">${e(employee.category || '—')}</div></div>
          <div><div class="print-field-label">Joining Date</div><div class="print-field-value">${e(toDisplayDate(employee.joiningDate) || '—')}</div></div>
          <div><div class="print-field-label">Reporting manager</div><div class="print-field-value">${e(employee.reportingManagerName || '—')}</div></div>
        </div>
      </div>

      <div class="print-section">
        <div class="print-section-title">Compensation</div>
        <div class="print-grid-2">
          <div><div class="print-field-label">Annual Gross Salary</div><div class="print-field-value">${e(ctcVal)}</div></div>
          <div><div class="print-field-label">Incentive (per month)</div><div class="print-field-value">${e(incentiveVal)}</div></div>
          <div><div class="print-field-label">Basic salary</div><div class="print-field-value">${e(basicVal)}</div></div>
          <div><div class="print-field-label">HRA</div><div class="print-field-value">${e(hraVal)}</div></div>
        </div>
      </div>

      ${benefitsBlock}

      <div class="print-section">
        <div class="print-section-title">Statutory</div>
        <div class="print-grid-2">
          <div><div class="print-field-label">PAN</div><div class="print-field-value">${e(employee.panNumber || '—')}</div></div>
          <div><div class="print-field-label">Aadhaar</div><div class="print-field-value">${aadhaarDisp}</div></div>
          <div><div class="print-field-label">Driving licence</div><div class="print-field-value">${e(employee.drivingLicenceNumber || '—')}</div></div>
        </div>
      </div>
      ${emergencyBlock}
      ${assetsBlock}
    `;

    const html = createPrintDocument({
      title: `${employee.fullName || 'Employee'} — Employee profile`,
      subtitle: `${employee.designation || ''} · ${employee.department || ''}`,
      companyName,
      generatedBy: currentUser?.email || '',
      content,
    });
    openPrintWindow(html);
  };

  const allTabs = useMemo(
    () => [
      { id: 'personal', label: 'Personal Info' },
      { id: 'documents', label: 'Documents' },
      { id: 'leave', label: 'Leave History' },
      { id: 'assets', label: 'Assets' },
      { id: 'onboarding', label: 'Onboarding' },
      { id: 'offboarding', label: 'Offboarding' },
      { id: 'timeline', label: 'Timeline' },
    ],
    [],
  );

  const visibleTabs = useMemo(() => {
    if (userRole === 'itmanager') {
      return allTabs.filter((t) => ['personal', 'assets', 'timeline'].includes(t.id));
    }
    return allTabs;
  }, [userRole, allTabs]);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0]?.id || 'personal');
    }
  }, [visibleTabs, tab]);

  if (loading) {
    return (
      <div className="p-8">
        <PageLoader />
      </div>
    );
  }
  if (!employee) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Employee not found.</p>
        <Link to={`/company/${companyId}/employees`} className="text-[#1B6B6B] text-sm mt-2 inline-block">← Employees</Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <Link
        to={`/company/${companyId}/employees`}
        className="text-sm text-slate-600 hover:text-[#1B6B6B] active:text-[#155858] mb-4 inline-flex items-center min-h-[44px]"
      >
        ← Employees
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative group flex-shrink-0">
              <EmployeeAvatar employee={employee} size="huge" className="ring-4 ring-white shadow-lg" />

              {canUploadPhoto && !uploadingPhoto && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => document.getElementById('emp-photo-input')?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      document.getElementById('emp-photo-input')?.click();
                    }
                  }}
                  className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center cursor-pointer"
                >
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity text-center pointer-events-none">
                    <p className="text-white text-lg">📷</p>
                    <p className="text-white text-xs font-medium mt-0.5">
                      {employee.photoURL ? 'Change' : 'Add Photo'}
                    </p>
                  </div>
                </div>
              )}

              {uploadingPhoto && (
                <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {canUploadPhoto && employee.photoURL && !uploadingPhoto && (
                <button
                  type="button"
                  title="Remove photo"
                  onClick={() => setShowRemovePhotoConfirm(true)}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-red-500 text-white text-sm flex items-center justify-center shadow-md hover:bg-red-600 transition-colors border-2 border-white z-10"
                >
                  ✕
                </button>
              )}

              {canUploadPhoto && (
                <input
                  id="emp-photo-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/jpg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    e.target.value = '';

                    if (!file.type.startsWith('image/')) {
                      showError('Please select an image file');
                      return;
                    }
                    if (file.size > 10 * 1024 * 1024) {
                      showError('Image must be under 10MB');
                      return;
                    }

                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      setRawImageSrc(ev.target?.result || null);
                      setCrop({ x: 0, y: 0 });
                      setZoom(1);
                      setCroppedAreaPixels(null);
                      setCropModalOpen(true);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800">{employee.fullName || '—'}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{employee.designation || '—'}</span>
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{employee.department || '—'}</span>
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{employee.employmentType || 'Full-time'}</span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  employee.status === 'Active'
                    ? 'bg-green-100 text-green-700'
                    : employee.status === 'Notice Period'
                      ? 'bg-amber-100 text-amber-700'
                      : employee.status === 'On Leave'
                        ? 'bg-blue-100 text-blue-700'
                        : employee.status === 'Offboarding'
                          ? 'bg-orange-100 text-orange-700'
                          : employee.status === 'Inactive'
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-slate-100 text-slate-600'
                }`}
              >
                {employee.status || 'Active'}
              </span>
              {employee.rehireCount > 0 && (
                <span className="inline-flex rounded-full px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium">
                  🔄 Rehired ({employee.rehireCount}x)
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Joined {toDisplayDate(employee.joiningDate)}
              <span className="mx-2 text-gray-300">·</span>
              <span className="text-[#1B6B6B] font-medium">
                {getTenure(employee.joiningDate)}
              </span>
            </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {canEditEmployees && employee.status !== 'Inactive' && (
              <button
                type="button"
                onClick={openEdit}
                className="rounded-lg min-h-[44px] px-4 inline-flex items-center justify-center bg-[#1B6B6B] hover:bg-[#155858] active:bg-[#0f4444] text-white text-sm font-medium"
              >
                Edit
              </button>
            )}
            {employee.status === 'Inactive' && (
              <span className="inline-flex items-center justify-center min-h-[44px] px-4 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed">
                🔒 Locked
              </span>
            )}
            {employee.status === 'Inactive' && canEditEmployees && (
              <button
                type="button"
                onClick={() => setShowRehireModal(true)}
                className="flex items-center gap-2 min-h-[44px] px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"
              >
                🔄 Rehire Employee
              </button>
            )}
            <button
              type="button"
              onClick={handlePrintProfile}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 min-h-[44px]"
            >
              🖨️ Print
            </button>
          </div>
        </div>
      </div>

      <div className="flex overflow-x-auto scrollbar-none border-b border-gray-100 mb-6 -mx-4 px-4 lg:mx-0 lg:px-0">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-4 py-2 min-h-[44px] text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors active:bg-slate-100 ${
              tab === t.id ? 'bg-white border border-slate-200 border-b-white -mb-px text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'personal' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p><span className="text-slate-500 text-sm">Full Name</span><br />{employee.fullName || '—'}</p>
              <p><span className="text-slate-500 text-sm">Father&apos;s Name</span><br />{employee.fatherName || '—'}</p>
              <p><span className="text-slate-500 text-sm">Email</span><br />{employee.email || '—'}</p>
              <p className="flex items-center gap-2 flex-wrap">
                <span>
                  <span className="text-slate-500 text-sm">Phone</span>
                  <br />
                  {employee.phone || employee.mobile || employee.mobileNumber || '—'}
                </span>
                {(employee.phone || employee.mobile || employee.mobileNumber) &&
                  whatsappUrl(employee.phone || employee.mobile || employee.mobileNumber, `Dear ${employee.fullName} Garu,\n\n`) && (
                  <a
                    href={whatsappUrl(employee.phone || employee.mobile || employee.mobileNumber, `Dear ${employee.fullName} Garu,\n\n`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open WhatsApp"
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors flex-shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </a>
                )}
              </p>
              {employee.alternativeMobile && (
                <div>
                  <p className="text-xs text-gray-400">Alternative Mobile</p>
                  <p className="text-sm font-medium">{employee.alternativeMobile}</p>
                </div>
              )}
              <p><span className="text-slate-500 text-sm">Date of Birth</span><br />{employee.dateOfBirth ? `${toDisplayDate(employee.dateOfBirth)}${getAge(employee.dateOfBirth) != null ? ` (${getAge(employee.dateOfBirth)} years old)` : ''}` : '—'}</p>
              <p><span className="text-slate-500 text-sm">Gender</span><br />{employee.gender || '—'}</p>
              {employee.bloodGroup && (
                <div>
                  <p className="text-xs text-gray-400">Blood Group</p>
                  <p className="text-sm font-medium">{employee.bloodGroup}</p>
                </div>
              )}
              {employee.maritalStatus && (
                <div>
                  <p className="text-xs text-gray-400">Marital Status</p>
                  <p className="text-sm font-medium">{employee.maritalStatus}</p>
                </div>
              )}
              {employee.maritalStatus === 'Married' && employee.marriageDate && (
                <div>
                  <p className="text-xs text-gray-400">Wedding Date</p>
                  <p className="text-sm font-medium">{toDisplayDate(employee.marriageDate)}</p>
                </div>
              )}
              {employee.disability && employee.disability !== 'None' && (
                <div>
                  <p className="text-xs text-gray-400">Disability</p>
                  <p className="text-sm font-medium">{employee.disability}</p>
                </div>
              )}
              <p><span className="text-slate-500 text-sm">Highest Qualification</span><br />{employee.qualification || '—'}</p>
              <div>
                <span className="text-slate-500 text-sm">Address</span>
                {employee.streetAddress || employee.city || employee.state || employee.pincode || employee.country ? (
                  <div className="mt-1">
                    {employee.streetAddress && <p className="text-sm text-gray-800">{employee.streetAddress}</p>}
                    {(employee.city || employee.state || employee.pincode) && (
                      <p className="text-sm text-gray-800">
                        {[employee.city, employee.state, employee.pincode].filter(Boolean).join(', ')}
                      </p>
                    )}
                    <p className="text-sm text-gray-800">
                      {employee.country || 'India'}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-800 mt-1">
                    {employee.address || '—'}
                  </p>
                )}
              </div>
              {(employee.prevCompany ||
                employee.prevDesignation ||
                employee.prevFromDate ||
                employee.prevToDate) && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Previous Experience</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {employee.prevCompany && (
                      <div>
                        <p className="text-xs text-gray-400">Previous Company</p>
                        <p className="text-sm font-medium">{employee.prevCompany}</p>
                      </div>
                    )}
                    {employee.prevDesignation && (
                      <div>
                        <p className="text-xs text-gray-400">Previous Designation</p>
                        <p className="text-sm font-medium">{employee.prevDesignation}</p>
                      </div>
                    )}
                    {(employee.prevFromDate || employee.prevToDate) && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-gray-400">Duration</p>
                        <p className="text-sm font-medium">
                          {employee.prevFromDate && toDisplayDate(employee.prevFromDate)}
                          {employee.prevFromDate && employee.prevToDate && ' — '}
                          {employee.prevToDate && toDisplayDate(employee.prevToDate)}
                          {employee.prevFromDate &&
                            employee.prevToDate &&
                            (() => {
                              const from = new Date(toDateString(employee.prevFromDate));
                              const to = new Date(toDateString(employee.prevToDate));
                              if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '';
                              const months =
                                (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
                              const years = Math.floor(months / 12);
                              const rem = months % 12;
                              let dur = '';
                              if (years > 0) dur += `${years}y `;
                              if (rem > 0) dur += `${rem}m`;
                              return dur ? ` · ${dur.trim()}` : '';
                            })()}
                        </p>
                      </div>
                    )}
                    {employee.prevManagerName && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-gray-400">Previous Manager</p>
                        <p className="text-sm font-medium">{employee.prevManagerName}</p>
                        {employee.prevManagerPhone && <p className="text-xs text-gray-400">{employee.prevManagerPhone}</p>}
                        {employee.prevManagerEmail && <p className="text-xs text-gray-400">{employee.prevManagerEmail}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <p><span className="text-slate-500 text-sm">Emp ID</span><br />{employee.empId || '—'}</p>
              <p><span className="text-slate-500 text-sm">Department</span><br />{employee.department || '—'}</p>
              <p><span className="text-slate-500 text-sm">Branch</span><br />{employee.branch || '—'}</p>
              {employee.location && (
                <p>
                  <span className="text-slate-500 text-sm">Location</span>
                  <br />
                  {employee.location}
                </p>
              )}
              <p><span className="text-slate-500 text-sm">Designation</span><br />{employee.designation || '—'}</p>
              <p><span className="text-slate-500 text-sm">Employment Type</span><br />{employee.employmentType || '—'}</p>
              <p><span className="text-slate-500 text-sm">Category</span><br />{employee.category || '—'}</p>
              <div>
                <span className="text-slate-500 text-sm">Reporting Manager</span>
                <br />
                {employee.reportingManagerId ? (
                  <div
                    onClick={() => navigate(`/company/${companyId}/employees/${employee.reportingManagerId}`)}
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 group mt-1"
                  >
                    <div className="w-7 h-7 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B] group-hover:bg-[#9DD8D8] transition-colors">
                      {employee.reportingManagerName?.charAt(0)}
                    </div>
                    <div>
                      <span className="text-sm text-[#1B6B6B] font-medium group-hover:underline">
                        {employee.reportingManagerName}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">
                        ({employee.reportingManagerEmpId})
                      </span>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-[#4ECDC4] group-hover:text-[#1B6B6B]">
                      <path d="M2 10L10 2M10 2H4M10 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
              <p><span className="text-slate-500 text-sm">Joining Date</span><br />{toDisplayDate(employee.joiningDate)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-medium text-slate-800 mb-3">Compensation</h3>
            {!showSalary ? (
              <div className="flex items-center gap-3">
                <span className="text-slate-400 select-none">₹ ••••••••</span>
                <button type="button" onClick={() => setShowSalary(true)} className="text-sm text-[#1B6B6B] hover:underline">Show</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {employee.basicSalary != null && employee.basicSalary !== '' && (
                  <div>
                    <p className="text-xs text-gray-400">Basic Salary (Monthly)</p>
                    <p className="text-sm font-medium">₹{formatLakhs(Number(employee.basicSalary))}</p>
                  </div>
                )}
                {employee.hra != null && employee.hra !== '' && (
                  <div>
                    <p className="text-xs text-gray-400">HRA (Monthly)</p>
                    <p className="text-sm font-medium">₹{formatLakhs(Number(employee.hra))}</p>
                  </div>
                )}
                {employee.incentive != null && employee.incentive !== '' && (
                  <div>
                    <p className="text-xs text-gray-400">Incentive (Monthly)</p>
                    <p className="text-sm font-medium">
                      ₹{formatLakhs(Number(employee.incentive))}
                      <span className="text-gray-500 text-xs font-normal">
                        {' '}
                        · ₹{formatLakhs(Number(employee.incentive) * 12)} p.a.
                      </span>
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-400">Annual Gross Salary</p>
                  <p className="text-sm font-medium">
                    ₹{(employee.ctcPerAnnum ?? employee.ctc ?? 0).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            )}
          </div>
          {(employee.pfApplicable ||
            employee.esicApplicable ||
            employee.pfNumber ||
            employee.esicNumber ||
            (employee.customBenefits || []).length > 0) && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-medium text-slate-800 mb-3">Benefits</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">PF</p>
                  <p className="text-sm font-medium">
                    {(employee.pfApplicable ?? !!String(employee.pfNumber || '').trim())
                      ? employee.pfNumber || 'Applicable'
                      : 'Not applicable'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">ESIC</p>
                  <p className="text-sm font-medium">
                    {(employee.esicApplicable ?? !!String(employee.esicNumber || '').trim())
                      ? employee.esicNumber || 'Applicable'
                      : 'Not applicable'}
                  </p>
                </div>
              </div>
              {(employee.customBenefits || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Additional Benefits</p>
                  <div className="space-y-2">
                    {employee.customBenefits.map((b) => (
                      <div key={b.id} className="flex items-start justify-between p-2.5 bg-gray-50 rounded-lg gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">{b.name}</p>
                          {b.notes && <p className="text-xs text-gray-400">{b.notes}</p>}
                        </div>
                        {b.value && (
                          <span className="text-sm font-medium text-[#1B6B6B] ml-3 flex-shrink-0">{b.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-medium text-slate-800 mb-3">Statutory</h3>
            <p className="text-sm">PAN: {employee.panNumber || '—'}</p>
            <p className="text-sm">Aadhaar: {employee.aadhaarNumber ? `XXXX XXXX ${employee.aadhaarNumber.slice(-4)}` : '—'}</p>
            <div className="mt-3">
              <p className="text-xs text-gray-400">
                Driving Licence No.
              </p>
              <p className="text-sm text-gray-800">
                {employee.drivingLicenceNumber || '—'}
              </p>
            </div>
          </div>

          {(employee.employmentHistory || []).length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Previous Employment at {company?.name || 'Company'}
              </h4>
              <div className="space-y-3">
                {employee.employmentHistory.map((tenure, i) => (
                  <div
                    key={`${tenure.tenure ?? i}_${tenure.empId ?? ''}_${i}`}
                    className="p-3 bg-gray-50 rounded-xl border border-gray-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Tenure {tenure.tenure ?? i + 1}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {tenure.designation || '—'}
                          {tenure.department ? ` · ${tenure.department}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-500">
                          {toDisplayDate(tenure.joiningDate)}
                          {' → '}
                          {toDisplayDate(tenure.exitDate)}
                        </p>
                        {tenure.exitReason && (
                          <p className="text-xs text-gray-400 mt-0.5">{tenure.exitReason}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border rounded-xl p-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Emergency Contact</h3>
            {employee.emergencyContact?.name ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400">Name</p>
                  <p className="text-sm text-gray-800 font-medium">
                    {employee.emergencyContact.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Relationship</p>
                  <p className="text-sm text-gray-800">
                    {employee.emergencyContact.relationship}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Phone</p>
                  <p className="text-sm text-gray-800">
                    {employee.emergencyContact.phone}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No emergency contact added</p>
            )}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-6">
          {!hasDriveUploadRole && (
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100 mb-4">
              <span className="text-2xl shrink-0">📂</span>
              <div>
                <p className="text-sm font-medium text-gray-700">Document viewing only</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Only HR Managers can upload or manage documents
                </p>
              </div>
            </div>
          )}
          {isInactive && (
            <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl mb-4">
              <span className="text-xl shrink-0">🔒</span>
              <div>
                <p className="text-sm font-semibold text-gray-600">Read-only</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  This employee is inactive. Documents can be viewed but not modified.
                </p>
              </div>
            </div>
          )}
          {hasDriveUploadRole && !isInactive && !isTokenValid() && (
            <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl shrink-0">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Drive session expired</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Upload buttons are disabled. Refresh to continue uploading.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const token = await getValidToken();
                  if (token) {
                    success('✓ Drive reconnected!');
                  } else {
                    showError('Please sign out and sign in again');
                  }
                }}
                className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 whitespace-nowrap flex-shrink-0"
              >
                🔄 Refresh Session
              </button>
            </div>
          )}

          {uploadingDocId && (
            <div className="rounded-xl border border-[#4ECDC4] bg-[#4ECDC4]/10 p-3 text-sm text-[#1B6B6B] font-medium flex items-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#4ECDC4] border-t-transparent" />
              Uploading to Google Drive...
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Document Completion</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full ${progressColor} transition-all`} style={{ width: `${documentCompletion}%` }} />
              </div>
              <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
                {mandatoryUploaded} of {totalMandatory} mandatory documents uploaded
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-1">
              {totalMandatory - mandatoryUploaded === 0
                ? 'All mandatory documents uploaded'
                : `${totalMandatory - mandatoryUploaded} mandatory document${totalMandatory - mandatoryUploaded !== 1 ? 's' : ''} missing`}
            </p>
          </div>

          {activeChecklist.map((cat) => {
            const open = categoryOpen[cat.category] !== false;
            const uploadedInCat = cat.documents.filter((d) => docByType[d.id]).length;
            return (
              <div key={cat.category} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCategoryOpen((p) => ({ ...p, [cat.category]: !open }))}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
                >
                  <span className="font-medium text-slate-800">{cat.category}</span>
                  <span className="text-slate-500 text-sm">{uploadedInCat} of {cat.documents.length} uploaded</span>
                  <span className="text-slate-400">{open ? '▼' : '▶'}</span>
                </button>
                {open && (
                  <ul className="divide-y divide-slate-100">
                    {cat.documents.map((doc) => {
                      const uploaded = docByType[doc.id];
                      const uploading = uploadingDocId === doc.id;
                      const isReplacing = uploaded?.fileId && replacingDocId === uploaded.fileId;
                      const isDeleting = uploaded?.fileId && deletingDocId === uploaded.fileId;
                      const rowBusy = uploading || isReplacing || isDeleting;
                      const acceptList = Array.isArray(doc.accepts) ? doc.accepts : ['.pdf', '.jpg', '.jpeg', '.png'];
                      const acceptAttr = acceptList.join(',');
                      const hint = `${acceptList.map((e) => e.replace('.', '').toUpperCase()).join(', ')} · Max ${doc.maxSizeMB || 5}MB`;
                      return (
                        <li key={doc.id} className="px-4" title={hint}>
                          {uploaded ? (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3 w-full">
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${getFileIconColor(uploaded.fileName || doc.name)}`}
                              >
                                {getFileExt(uploaded.fileName || doc.name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {uploaded.fileName || doc.name}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {formatFileSizeDetailed(uploaded.fileSize)} · Uploaded {formatDocDate(uploaded.uploadedAt)}
                                </p>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                {uploaded.webViewLink && (
                                  <button
                                    type="button"
                                    onClick={() => handleViewDoc(uploaded)}
                                    disabled={rowBusy}
                                    className="px-2.5 py-1 text-xs font-medium text-[#1B6B6B] bg-[#E8F5F5] rounded-lg hover:bg-[#C5E8E8] transition-colors disabled:opacity-50"
                                  >
                                    View
                                  </button>
                                )}
                                {showDocManageUi && (
                                  <label
                                    title={
                                      !isDriveConnected ? 'Refresh Drive session to upload' : 'Replace document'
                                    }
                                    className={`${rowBusy || !isDriveConnected ? 'pointer-events-none opacity-50' : ''}`}
                                  >
                                    <span className="px-2.5 py-1 text-xs font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors inline-block cursor-pointer">
                                      Replace
                                    </span>
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept={acceptAttr}
                                      disabled={rowBusy || !isDriveConnected}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleReplaceDoc(f, doc.id);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                )}
                                {showDocManageUi && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirm({ type: 'checklist', doc: uploaded })}
                                    disabled={rowBusy || !isDriveConnected}
                                    title={
                                      !isDriveConnected ? 'Refresh Drive session to upload' : 'Delete document'
                                    }
                                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                                      isDriveConnected
                                        ? 'text-red-500 bg-red-50 hover:bg-red-100'
                                        : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                    }`}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 px-1 sm:px-0 border-b last:border-0 gap-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 border-gray-300" />
                                <div>
                                  <p className="text-sm font-medium text-gray-800">
                                    {doc.name}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {doc.mandatory ? (
                                      <span className="text-red-500">Mandatory</span>
                                    ) : (
                                      'Optional'
                                    )}
                                    {' · '}
                                    {acceptList.map((e) => e.replace('.', '').toUpperCase()).join(', ')}
                                    {' · '}Max {doc.maxSizeMB || 5}MB
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-stretch sm:items-center gap-2 w-full sm:w-auto">
                                {showDocManageUi ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const input = document.getElementById(`doc-upload-${doc.id}`);
                                        if (input) input.click();
                                      }}
                                      disabled={uploadingDocId === doc.id || !isDriveConnected}
                                      title={
                                        !isDriveConnected ? 'Refresh Drive session to upload' : 'Upload document'
                                      }
                                      className={`w-full sm:w-auto min-h-[44px] px-4 inline-flex items-center justify-center text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                                        isDriveConnected
                                          ? 'bg-[#1B6B6B] text-white hover:bg-[#155858] active:bg-[#0f4444] disabled:opacity-50'
                                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                      }`}
                                    >
                                      {uploadingDocId === doc.id ? 'Uploading...' : 'Upload'}
                                    </button>
                                    <input
                                      id={`doc-upload-${doc.id}`}
                                      type="file"
                                      className="hidden"
                                      accept={acceptAttr}
                                      disabled={!!uploadingDocId || !isDriveConnected}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleUploadChecklistDoc(f, doc.id, doc.name);
                                        e.target.value = '';
                                      }}
                                    />
                                  </>
                                ) : (
                                  <span className="text-xs text-gray-400 italic">View only</span>
                                )}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
              <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-2">Delete {deleteConfirm.doc.name}?</h3>
                <p className="text-sm text-slate-600 mb-4">File will be removed from Google Drive.</p>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setDeleteConfirm(null)} className="text-slate-500 text-sm">Cancel</button>
                    <button
                      type="button"
                      onClick={() => handleDeleteChecklistDoc(deleteConfirm.doc)}
                      className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                      disabled={!!deletingDocId}
                    >
                      {deletingDocId ? 'Deleting…' : 'Delete'}
                    </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'leave' && (
        <div className="space-y-6">
          {leaveError && (
            <p className="text-red-500 text-sm text-center py-4">Error loading leave: {leaveError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profilePaidLeaveTypes.map((lt) => (
              <div key={lt.shortCode} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-slate-500 text-sm truncate" title={lt.name}>
                  {lt.name}
                  <span className="block text-xs font-mono text-[#1B6B6B] mt-0.5">{lt.shortCode}</span>
                </p>
                <p className="font-semibold text-slate-800">
                  {leaveUsedByTypeProfile[lt.name] ?? 0} / {getMaxLeaveForProfileType(lt, leavePolicy)}
                </p>
              </div>
            ))}
          </div>
          {Array.isArray(leaveList) && leaveList.length > 0 ? (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Start</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">End</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Days</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Reason</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveList.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${leaveTypePillClassResolved(l.leaveType)}`}
                        >
                          {l.leaveType || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2">{l.startDate ? toDisplayDate(l.startDate) : '—'}</td>
                      <td className="px-4 py-2">{l.endDate ? toDisplayDate(l.endDate) : '—'}</td>
                      <td className="px-4 py-2">{l.days ?? '—'}</td>
                      <td className="px-4 py-2">{l.reason || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] || 'bg-slate-100'}`}>
                          {l.status || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-gray-400 text-sm">No leave records found</p>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <div>
          {timelineEvents.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm">No timeline events yet</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100" aria-hidden />
              <div className="space-y-3">
                {timelineEvents.map((event) => {
                  const colors = TIMELINE_COLORS[event.color] || TIMELINE_COLORS.gray;
                  return (
                    <div key={event.id} className="relative flex gap-4">
                      <div
                        className={`relative z-10 w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm ${colors.bg} border-2 ${colors.border}`}
                      >
                        <span className="text-base leading-none">{event.icon}</span>
                      </div>
                      <div className={`flex-1 p-3 rounded-xl border mb-1 ${colors.bg} ${colors.border}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{event.title}</p>
                            {event.description ? (
                              <p className="text-xs text-gray-500 mt-0.5 break-words">{event.description}</p>
                            ) : null}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-gray-400">
                              {event.date instanceof Date && !Number.isNaN(event.date.getTime())
                                ? toDisplayDate(event.date)
                                : '—'}
                            </p>
                            {event.by ? (
                              <p className="text-xs text-gray-300 mt-0.5">
                                by {(event.by || '').split('@')[0]}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showEditModal && form && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit Employee</h2>
                    <form onSubmit={handleSaveEdit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs text-slate-600 mb-1">Full Name</label><input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" required /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" required /></div>
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Father&apos;s Name</label><input value={form.fatherName} onChange={(e) => setForm((p) => ({ ...p, fatherName: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Father's full name" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Phone</label><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Alternative Mobile</label>
                          <input
                            type="tel"
                            maxLength={10}
                            placeholder="Alternative 10-digit number"
                            value={form.alternativeMobile}
                            onChange={(e) => setForm((p) => ({ ...p, alternativeMobile: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          />
                        </div>
                        <div><label className="block text-xs text-slate-600 mb-1">DOB</label><input type="date" value={form.dateOfBirth} onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Gender</label><select value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Blood Group</label>
                          <select
                            value={form.bloodGroup}
                            onChange={(e) => setForm((p) => ({ ...p, bloodGroup: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">Select blood group</option>
                            {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((bg) => (
                              <option key={bg} value={bg}>{bg}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Marital Status</label>
                          <select
                            value={form.maritalStatus}
                            onChange={(e) => setForm((p) => ({ ...p, maritalStatus: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">Select status</option>
                            <option value="Single">Single</option>
                            <option value="Married">Married</option>
                            <option value="Divorced">Divorced</option>
                            <option value="Widowed">Widowed</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Disability</label>
                          <select
                            value={form.disability}
                            onChange={(e) => setForm((p) => ({ ...p, disability: e.target.value }))}
                            className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B]"
                          >
                            <option value="">None</option>
                            <option value="Visual Impairment">Visual Impairment</option>
                            <option value="Hearing Impairment">Hearing Impairment</option>
                            <option value="Physical Disability">Physical Disability</option>
                            <option value="Intellectual Disability">Intellectual Disability</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        {form.maritalStatus === 'Married' && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Marriage Date / Wedding Date</label>
                            <input
                              type="date"
                              value={form.marriageDate}
                              onChange={(e) => setForm((p) => ({ ...p, marriageDate: e.target.value }))}
                              className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B]"
                            />
                          </div>
                        )}
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Street Address</label><input value={form.streetAddress} onChange={(e) => setForm((p) => ({ ...p, streetAddress: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="House/Flat no, Street name" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">City</label><input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="City" /></div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">State</label>
                          <select
                            value={form.state}
                            onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">Select state</option>
                            {INDIAN_STATES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div><label className="block text-xs text-slate-600 mb-1">Pincode</label><input value={form.pincode} onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" maxLength={6} placeholder="6-digit pincode" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Country</label><input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Country" /></div>
                        <div className="col-span-2">
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 border-b border-gray-100 pb-2">Previous Experience</h4>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-slate-600 mb-1">Previous Company Name</label>
                          <input
                            placeholder="e.g. Infosys Pvt Ltd"
                            value={form.prevCompany}
                            onChange={(e) => setForm((p) => ({ ...p, prevCompany: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-slate-600 mb-1">Previous Designation</label>
                          <input
                            placeholder="e.g. Software Engineer"
                            value={form.prevDesignation}
                            onChange={(e) => setForm((p) => ({ ...p, prevDesignation: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="col-span-2 grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">From Date</label>
                            <input
                              type="date"
                              value={form.prevFromDate || ''}
                              onChange={(e) => setForm((p) => ({ ...p, prevFromDate: e.target.value }))}
                              className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">To Date</label>
                            <input
                              type="date"
                              value={form.prevToDate || ''}
                              onChange={(e) => setForm((p) => ({ ...p, prevToDate: e.target.value }))}
                              className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B]"
                            />
                          </div>
                        </div>
                        {form.prevFromDate && form.prevToDate && (
                          <div className="col-span-2 mt-1.5 px-3 py-1.5 bg-[#E8F5F5] rounded-lg">
                            <p className="text-xs text-[#1B6B6B]">
                              📅 Duration:{' '}
                              {(() => {
                                const from = new Date(form.prevFromDate);
                                const to = new Date(form.prevToDate);
                                const months =
                                  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
                                const years = Math.floor(months / 12);
                                const remainingMonths = months % 12;
                                if (years === 0) {
                                  return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
                                }
                                if (remainingMonths === 0) {
                                  return `${years} year${years !== 1 ? 's' : ''}`;
                                }
                                return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${
                                  remainingMonths !== 1 ? 's' : ''
                                }`;
                              })()}
                            </p>
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Previous Manager Name</label>
                          <input
                            placeholder="Manager's full name"
                            value={form.prevManagerName}
                            onChange={(e) => setForm((p) => ({ ...p, prevManagerName: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Previous Manager Phone</label>
                          <input
                            type="tel"
                            placeholder="Manager's phone number"
                            value={form.prevManagerPhone}
                            onChange={(e) => setForm((p) => ({ ...p, prevManagerPhone: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-slate-600 mb-1">Previous Manager Email</label>
                          <input
                            type="email"
                            placeholder="Manager's email address"
                            value={form.prevManagerEmail}
                            onChange={(e) => setForm((p) => ({ ...p, prevManagerEmail: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          />
                        </div>
                <div><label className="block text-xs text-slate-600 mb-1">Emp ID</label><input value={form.empId} onChange={(e) => setForm((p) => ({ ...p, empId: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Department</label><select value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{!departments.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Branch</label><select value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{branches.map((b) => <option key={b} value={b}>{b}</option>)}{!branches.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div className="col-span-2 relative" ref={locationDropdownRef}>
                  <label className="block text-xs text-slate-600 mb-1">Location</label>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowLocationDropdown(true)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') setShowLocationDropdown(true);
                    }}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px]"
                  >
                    {form.location ? <span>{form.location}</span> : <span className="text-gray-400">Select location...</span>}
                    <span className="text-gray-400 text-xs">▾</span>
                  </div>
                  {showLocationDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[60] max-h-52 overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <input
                          autoFocus
                          placeholder="Search location..."
                          value={locationSearch}
                          onChange={(e) => setLocationSearch(e.target.value)}
                          className="w-full text-sm border rounded-lg px-2 py-1.5"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="overflow-y-auto max-h-40">
                        {(company?.locations || [])
                          .filter((l) => !locationSearch || l.toLowerCase().includes(locationSearch.toLowerCase()))
                          .map((loc) => (
                            <div
                              key={loc}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setForm((prev) => ({ ...prev, location: loc }));
                                setShowLocationDropdown(false);
                                setLocationSearch('');
                              }}
                              onKeyDown={(ev) => {
                                if (ev.key === 'Enter' || ev.key === ' ') {
                                  setForm((prev) => ({ ...prev, location: loc }));
                                  setShowLocationDropdown(false);
                                  setLocationSearch('');
                                }
                              }}
                              className="px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer text-sm border-b last:border-0"
                            >
                              {loc}
                            </div>
                          ))}
                        {(company?.locations || []).length === 0 && (
                          <div className="px-3 py-4 text-center text-sm text-gray-400">
                            No locations configured.
                            <br />
                            Add in Settings → Manage Lists
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="col-span-2 relative" ref={editRoleDropdownRef}>
                  <label className="block text-xs text-slate-600 mb-1">Designation</label>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowEditRoleDropdown(true)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') setShowEditRoleDropdown(true);
                    }}
                    className={`w-full border rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px] ${
                      showEditRoleDropdown ? 'border-[#1B6B6B]' : 'border-gray-200'
                    }`}
                  >
                    {selectedEditRole ? (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="min-w-0 text-left">
                          <p className="text-sm font-medium text-gray-900">{selectedEditRole.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {selectedEditRole.reportsTo
                              ? `Reports to ${selectedEditRole.reportsTo}`
                              : 'Top level designation'}
                            {selectedEditRole.salaryBand?.min != null &&
                              selectedEditRole.salaryBand?.min !== '' &&
                              ` · ₹${formatLakhs(selectedEditRole.salaryBand.min)}–${formatLakhs(selectedEditRole.salaryBand.max)}/mo`}
                          </p>
                        </div>
                      </div>
                    ) : form.designation ? (
                      <span className="text-gray-800">{form.designation}</span>
                    ) : (
                      <span className="text-gray-400">Search or select designation…</span>
                    )}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {(selectedEditRole || form.designation) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setForm((prev) => ({ ...prev, designation: '', designationRoleId: '' }));
                          }}
                          className="text-slate-400 hover:text-slate-600 text-xs"
                        >
                          ✕
                        </button>
                      )}
                      <span className="text-gray-400 text-xs">▾</span>
                    </div>
                  </div>
                  {showEditRoleDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[60] max-h-64 overflow-hidden">
                      <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search by designation or reports-to…"
                          value={editRoleSearch}
                          onChange={(e) => setEditRoleSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#1B6B6B]"
                        />
                      </div>
                      <div className="overflow-y-auto max-h-52">
                        {roles.length === 0 && (
                          <div className="px-3 py-4 text-center">
                            <p className="text-sm text-slate-400 mb-2">No designations defined yet</p>
                            <p className="text-xs text-slate-400">Go to Library → Designations to add</p>
                          </div>
                        )}
                        {roles.length > 0 && editModalActiveRoles.length === 0 && (
                          <div className="px-3 py-4 text-center text-sm text-gray-400">No active designations.</div>
                        )}
                        {roles.length > 0 && editModalActiveRoles.length > 0 && (
                          <>
                            <div
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setForm((prev) => ({ ...prev, designation: '', designationRoleId: '' }));
                                setShowEditRoleDropdown(false);
                                setEditRoleSearch('');
                              }}
                              className="px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 cursor-pointer border-b border-gray-50"
                            >
                              — Clear selection
                            </div>
                            {editModalFilteredRoles.map((role) => (
                              <div
                                key={role.id}
                                role="button"
                                tabIndex={0}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setForm((prev) => ({
                                    ...prev,
                                    designation: role.title || '',
                                    designationRoleId: role.id,
                                  }));
                                  setShowEditRoleDropdown(false);
                                  setEditRoleSearch('');
                                }}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter' || ev.key === ' ') {
                                    setForm((prev) => ({
                                      ...prev,
                                      designation: role.title || '',
                                      designationRoleId: role.id,
                                    }));
                                    setShowEditRoleDropdown(false);
                                    setEditRoleSearch('');
                                  }
                                }}
                                className={`px-3 py-3 hover:bg-[#E8F5F5] cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${
                                  selectedEditRole?.id === role.id ? 'bg-[#E8F5F5]' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex-1 min-w-0 text-left">
                                    <p className="text-sm font-medium text-gray-900">{role.title}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {role.reportsTo ? `Reports to ${role.reportsTo}` : 'Top level designation'}
                                      {role.salaryBand?.min != null &&
                                        role.salaryBand?.min !== '' &&
                                        ` · ₹${formatLakhs(role.salaryBand.min)}–${formatLakhs(role.salaryBand.max)}/mo (₹${formatLakhs(Number(role.salaryBand.min) * 12)}–${formatLakhs(Number(role.salaryBand.max) * 12)} pa)`}
                                    </p>
                                  </div>
                                  {selectedEditRole?.id === role.id && (
                                    <span className="text-[#1B6B6B] flex-shrink-0">✓</span>
                                  )}
                                </div>
                              </div>
                            ))}
                            {editModalFilteredRoles.length === 0 && (
                              <div className="px-3 py-4 text-center text-sm text-gray-400">
                                No designations found.
                                {editRoleSearch.trim() && (
                                  <button
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setForm((prev) => ({
                                        ...prev,
                                        designation: editRoleSearch.trim(),
                                        designationRoleId: '',
                                      }));
                                      setShowEditRoleDropdown(false);
                                      setEditRoleSearch('');
                                    }}
                                    className="block mx-auto mt-2 text-xs text-[#1B6B6B] underline"
                                  >
                                    Use &quot;{editRoleSearch.trim()}&quot; as designation
                                  </button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedEditRole?.salaryBand?.min != null && selectedEditRole.salaryBand.min !== '' && (
                    <p className="text-xs text-gray-400 mt-1">
                      Band: ₹{formatLakhs(Number(selectedEditRole.salaryBand.min))}/mo — ₹
                      {formatLakhs(Number(selectedEditRole.salaryBand.max))}/mo
                    </p>
                  )}
                </div>
                <div><label className="block text-xs text-slate-600 mb-1">Employment Type</label><select value={form.employmentType} onChange={(e) => setForm((p) => ({ ...p, employmentType: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}{!employmentTypes.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Category</label><select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}{!categories.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Highest Qualification</label><select value={form.qualification} onChange={(e) => setForm((p) => ({ ...p, qualification: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{qualifications.map((q) => <option key={q} value={q}>{q}</option>)}{!qualifications.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Joining Date</label><input type="date" value={form.joiningDate} onChange={(e) => setForm((p) => ({ ...p, joiningDate: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                        <div className="col-span-2">
                  <label className="block text-xs text-slate-600 mb-1">Reporting Manager</label>
                  <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setShowManagerDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setShowManagerDropdown(true);
                        }
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:border-[#4ECDC4]"
                    >
                      {form.reportingManagerId ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B]">
                            {form.reportingManagerName?.charAt(0)}
                          </div>
                          <span className="text-slate-800 truncate">{form.reportingManagerName}</span>
                          <span className="text-xs text-slate-400 whitespace-nowrap">{form.reportingManagerEmpId}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Select reporting manager</span>
                      )}
                      <div className="flex items-center gap-1">
                        {form.reportingManagerId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setForm((prev) => ({
                                ...prev,
                                reportingManagerId: '',
                                reportingManagerName: '',
                                reportingManagerEmpId: '',
                              }));
                            }}
                            className="text-slate-400 hover:text-slate-600 text-xs"
                          >
                            ✕
                          </button>
                        )}
                        <span className="text-slate-400 text-xs">▾</span>
                      </div>
                    </div>

                    {showManagerDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-hidden">
                        <div className="p-2 border-b border-slate-100">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search by name or ID..."
                            value={managerSearch}
                            onChange={(e) => setManagerSearch(e.target.value)}
                            className="w-full text-sm px-2 py-1.5 border rounded focus:outline-none focus:border-[#4ECDC4]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <div className="overflow-y-auto max-h-36">
                          <div
                            onClick={() => {
                              setForm((prev) => ({
                                ...prev,
                                reportingManagerId: '',
                                reportingManagerName: '',
                                reportingManagerEmpId: '',
                              }));
                              setShowManagerDropdown(false);
                              setManagerSearch('');
                            }}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                          >
                            <span className="text-sm text-slate-400">— None</span>
                          </div>

                          {managerOptions
                            .filter((emp) => {
                              if (!managerSearch) return true;
                              const term = managerSearch.toLowerCase();
                              return (
                                emp.fullName?.toLowerCase().includes(term) ||
                                emp.empId?.toLowerCase().includes(term) ||
                                emp.designation?.toLowerCase().includes(term)
                              );
                            })
                            .map((emp) => (
                              <div
                                key={emp.id}
                                onClick={() => {
                                  setForm((prev) => ({
                                    ...prev,
                                    reportingManagerId: emp.id,
                                    reportingManagerName: emp.fullName || '',
                                    reportingManagerEmpId: emp.empId || '',
                                  }));
                                  setShowManagerDropdown(false);
                                  setManagerSearch('');
                                }}
                                className={`flex items-center gap-3 px-3 py-2 hover:bg-[#E8F5F5] cursor-pointer ${
                                  form.reportingManagerId === emp.id ? 'bg-[#E8F5F5]' : ''
                                }`}
                              >
                                <div className="w-7 h-7 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B] flex-shrink-0">
                                  {emp.fullName?.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p>
                                  <p className="text-xs text-slate-400">{emp.empId} · {emp.designation || '—'}</p>
                                </div>
                                {form.reportingManagerId === emp.id && (
                                  <span className="text-[#1B6B6B] text-xs">✓</span>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 border-b border-gray-100 pb-2">
                    Compensation
                  </h4>
                  {form.designation && editRoleSalaryBand && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4">
                      <p className="text-xs text-blue-700 font-medium">
                        💼 Salary band for <strong>{form.designation}</strong>: ₹{formatLakhs(editRoleSalaryBand.min)}/mo — ₹
                        {formatLakhs(editRoleSalaryBand.max)}/mo (₹{formatLakhs(editRoleSalaryBand.min * 12)}—₹
                        {formatLakhs(editRoleSalaryBand.max * 12)} p.a.)
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">Basic Salary (per month) ₹</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={form.basicSalary || ''}
                        onChange={(e) => {
                          const basic = Number(e.target.value);
                          const hra = Number(form.hra) || 0;
                          const incentive = Number(form.incentive) || 0;
                          const annual = (basic + hra + incentive) * 12;
                          setForm((prev) => ({
                            ...prev,
                            basicSalary: e.target.value,
                            ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum,
                          }));
                        }}
                        className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] border-slate-300"
                      />
                      {form.basicSalary ? (
                        <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.basicSalary) * 12)} per annum</p>
                      ) : null}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1.5">HRA (per month) ₹</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={form.hra || ''}
                        onChange={(e) => {
                          const hra = Number(e.target.value);
                          const basic = Number(form.basicSalary) || 0;
                          const incentive = Number(form.incentive) || 0;
                          const annual = (basic + hra + incentive) * 12;
                          setForm((prev) => ({
                            ...prev,
                            hra: e.target.value,
                            ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum,
                          }));
                        }}
                        className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] border-slate-300"
                      />
                      {form.hra ? (
                        <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.hra) * 12)} per annum</p>
                      ) : null}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Incentive (per month)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={form.incentive}
                        onChange={(e) => {
                          const incentive = Number(e.target.value);
                          const basic = Number(form.basicSalary) || 0;
                          const hra = Number(form.hra) || 0;
                          const annual = (basic + hra + incentive) * 12;
                          setForm((prev) => ({
                            ...prev,
                            incentive: e.target.value,
                            ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum,
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-1 focus:ring-[#4ECDC4]"
                      />
                      {form.incentive !== '' && form.incentive != null && !Number.isNaN(Number(form.incentive)) && Number(form.incentive) !== 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          = ₹{formatLakhs(Number(form.incentive))} per month · ₹{formatLakhs(Number(form.incentive) * 12)} per annum
                        </p>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-gray-500 block mb-1.5">
                        Annual Gross Salary ₹
                        <span className="text-gray-300 ml-1 font-normal">(auto-calculated · editable)</span>
                      </label>
                      <input
                        type="number"
                        placeholder="Auto-calculated from above"
                        value={form.ctcPerAnnum || ''}
                        onChange={(e) => setForm((prev) => ({ ...prev, ctcPerAnnum: e.target.value }))}
                        className="w-full border rounded-xl px-3 py-2.5 text-sm hover:border-[#1B6B6B] border-slate-300"
                      />
                      {form.ctcPerAnnum ? (
                        <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.ctcPerAnnum) / 12)} per month</p>
                      ) : null}
                      {form.ctcPerAnnum && editRoleSalaryBand && (
                        <p
                          className={`text-xs mt-1 font-medium ${
                            Number(form.ctcPerAnnum) >= editRoleSalaryBand.min * 12 &&
                            Number(form.ctcPerAnnum) <= editRoleSalaryBand.max * 12
                              ? 'text-green-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {Number(form.ctcPerAnnum) >= editRoleSalaryBand.min * 12 &&
                          Number(form.ctcPerAnnum) <= editRoleSalaryBand.max * 12
                            ? '✓ Within salary band'
                            : '⚠ Outside salary band for this designation'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-span-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2 border-b border-gray-100 pb-2">
                    <span>🏥</span> Benefits
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-700">Provident Fund (PF)</p>
                          <p className="text-xs text-gray-400">Statutory benefit</p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              pfApplicable: !prev.pfApplicable,
                              pfNumber: prev.pfApplicable ? '' : prev.pfNumber,
                            }))
                          }
                          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.pfApplicable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              form.pfApplicable ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                      {form.pfApplicable && (
                        <input
                          placeholder="PF Account Number"
                          value={form.pfNumber}
                          onChange={(e) => setForm((p) => ({ ...p, pfNumber: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white"
                        />
                      )}
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <div>
                          <p className="text-sm font-medium text-gray-700">ESIC</p>
                          <p className="text-xs text-gray-400">Statutory benefit</p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              esicApplicable: !prev.esicApplicable,
                              esicNumber: prev.esicApplicable ? '' : prev.esicNumber,
                            }))
                          }
                          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.esicApplicable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              form.esicApplicable ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                      {form.esicApplicable && (
                        <input
                          placeholder="ESIC Number"
                          value={form.esicNumber}
                          onChange={(e) => setForm((p) => ({ ...p, esicNumber: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white"
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-700">Additional Benefits</p>
                      <button
                        type="button"
                        onClick={() => {
                          const newBenefit = { id: `benefit_${Date.now()}`, name: '', value: '', notes: '' };
                          setForm((prev) => ({
                            ...prev,
                            customBenefits: [...(prev.customBenefits || []), newBenefit],
                          }));
                        }}
                        className="text-xs text-[#1B6B6B] hover:underline flex items-center gap-1"
                      >
                        + Add Benefit
                      </button>
                    </div>
                    {(form.customBenefits || []).length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            customBenefits: [{ id: `benefit_${Date.now()}`, name: '', value: '', notes: '' }],
                          }));
                        }}
                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors"
                      >
                        + Add benefit (Medical Insurance, Food Allowance, etc.)
                      </button>
                    )}
                    <div className="space-y-2">
                      {(form.customBenefits || []).map((benefit, index) => (
                        <div key={benefit.id} className="p-3 border border-gray-100 rounded-xl bg-gray-50">
                          <div className="flex gap-2 mb-2">
                            <select
                              value={
                                !benefit.name
                                  ? ''
                                  : benefitTemplates.some((t) => t.name === benefit.name)
                                    ? benefit.name
                                    : '__custom__'
                              }
                              onChange={(e) => {
                                const v = e.target.value;
                                setForm((prev) => {
                                  const updated = [...(prev.customBenefits || [])];
                                  const cur = updated[index];
                                  updated[index] = {
                                    ...cur,
                                    name: v === '__custom__' ? '__custom__' : v,
                                    customName: v === '__custom__' ? cur.customName || '' : '',
                                  };
                                  return { ...prev, customBenefits: updated };
                                });
                              }}
                              className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"
                            >
                              <option value="">Select benefit...</option>
                              {benefitTemplates.map((bt) => (
                                <option key={bt.id} value={bt.name}>
                                  {bt.name}
                                </option>
                              ))}
                              <option value="__custom__">Other (type below)</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                setForm((prev) => ({
                                  ...prev,
                                  customBenefits: (prev.customBenefits || []).filter((_, i) => i !== index),
                                }));
                              }}
                              className="text-red-400 hover:text-red-600 px-2"
                            >
                              ✕
                            </button>
                          </div>
                          {(benefit.name === '__custom__' ||
                            (benefit.name && !benefitTemplates.some((t) => t.name === benefit.name))) && (
                            <input
                              placeholder="Enter benefit name"
                              value={
                                benefit.name === '__custom__'
                                  ? benefit.customName || ''
                                  : benefit.name || ''
                              }
                              onChange={(e) => {
                                setForm((prev) => {
                                  const updated = [...(prev.customBenefits || [])];
                                  updated[index] = {
                                    ...updated[index],
                                    name: '__custom__',
                                    customName: e.target.value,
                                  };
                                  return { ...prev, customBenefits: updated };
                                });
                              }}
                              className="w-full border rounded-lg px-3 py-2 text-sm mt-2 bg-white"
                            />
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              placeholder="Value (e.g. ₹5,00,000 or 2,500/month)"
                              value={benefit.value}
                              onChange={(e) => {
                                setForm((prev) => {
                                  const updated = [...(prev.customBenefits || [])];
                                  updated[index] = { ...updated[index], value: e.target.value };
                                  return { ...prev, customBenefits: updated };
                                });
                              }}
                              className="border rounded-lg px-3 py-2 text-sm bg-white"
                            />
                            <input
                              placeholder="Notes (e.g. Family floater)"
                              value={benefit.notes}
                              onChange={(e) => {
                                setForm((prev) => {
                                  const updated = [...(prev.customBenefits || [])];
                                  updated[index] = { ...updated[index], notes: e.target.value };
                                  return { ...prev, customBenefits: updated };
                                });
                              }}
                              className="border rounded-lg px-3 py-2 text-sm bg-white"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div><label className="block text-xs text-slate-600 mb-1">PAN</label><input value={form.panNumber} onChange={(e) => setForm((p) => ({ ...p, panNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Aadhaar</label><input value={form.aadhaarNumber} onChange={(e) => setForm((p) => ({ ...p, aadhaarNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="12-digit number" /></div>
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Driving Licence No.</label><input value={form.drivingLicenceNumber} onChange={(e) => setForm((p) => ({ ...p, drivingLicenceNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="e.g. MH0120210012345" /></div>
                        <div className="col-span-2 mt-2">
                          <h4 className="text-xs font-semibold text-slate-700 mb-2">Emergency Contact</h4>
                        </div>
                        <div><label className="block text-xs text-slate-600 mb-1">Contact Name</label><input value={form.emergencyContactName} onChange={(e) => setForm((p) => ({ ...p, emergencyContactName: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Full name" /></div>
                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Relationship</label>
                          <select
                            value={form.emergencyRelationship}
                            onChange={(e) => setForm((p) => ({ ...p, emergencyRelationship: e.target.value }))}
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                          >
                            <option value="">—</option>
                            <option value="Father">Father</option>
                            <option value="Mother">Mother</option>
                            <option value="Spouse">Spouse</option>
                            <option value="Sibling">Sibling</option>
                            <option value="Friend">Friend</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div><label className="block text-xs text-slate-600 mb-1">Contact Phone</label><input value={form.emergencyPhone} onChange={(e) => setForm((p) => ({ ...p, emergencyPhone: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" maxLength={10} placeholder="10-digit mobile number" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setShowLocationDropdown(false);
                    setLocationSearch('');
                    setEditRoleSearch('');
                    setShowEditRoleDropdown(false);
                  }}
                  className="text-slate-500 text-sm"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="rounded-lg bg-[#1B6B6B] text-white text-sm font-medium px-4 py-2 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {tab === 'assets' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-[#E8F5F5] rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-[#1B6B6B]">
                {employeeAssets.length + employeeConsumableCards.length}
              </p>
              <p className="text-xs text-[#1B6B6B]">Currently Assigned</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-gray-700">
                {employeeAssetHistory.length}
              </p>
              <p className="text-xs text-gray-500">Total Assets Received</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-xl font-semibold text-green-700">
                {Math.max(employeeAssetHistory.length - (employeeAssets.length + employeeConsumableCards.length), 0)}
              </p>
              <p className="text-xs text-green-600">Returned</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-700">Currently Assigned</h3>
              {!isInactive && (
                <button
                  type="button"
                  onClick={openProfileAssignModal}
                  className="text-xs text-[#1B6B6B] hover:underline"
                >
                  + Assign Asset
                </button>
              )}
            </div>

            {isInactive && (
              <div className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl mb-4">
                <span className="text-gray-400">🔒</span>
                <p className="text-sm text-gray-400">Cannot assign assets to inactive employees</p>
              </div>
            )}

            {employeeAssets.length === 0 && employeeConsumableCards.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <p className="text-2xl mb-2">📦</p>
                <p className="text-sm text-gray-500">No assets currently assigned</p>
                {!isInactive && (
                  <button
                    type="button"
                    onClick={openProfileAssignModal}
                    className="mt-3 text-sm text-[#1B6B6B] hover:underline"
                  >
                    Assign an asset
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {[...employeeAssets.map((a) => ({ ...a, kind: 'trackable' })), ...employeeConsumableCards].map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#E8F5F5] flex items-center justify-center text-xl flex-shrink-0">
                      {getAssetIcon(asset.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {asset.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {asset.assetId}
                        {asset.type && ` · ${asset.type}`}
                        {asset.serialNumber && ` · SN: ${asset.serialNumber}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Issued: {asset.issueDate ? toDisplayDate(asset.issueDate) : '—'}
                        {' · '}
                        Condition: {asset.condition || '—'}
                        {asset.brand && ` · ${asset.brand}`}
                        {asset.model && ` ${asset.model}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {asset.kind === 'trackable' ? (
                        <>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[#C5E8E8] text-[#1B6B6B] font-medium">
                            Trackable
                          </span>
                          <button
                            type="button"
                            onClick={() => handleReturnAssetFromProfile(asset)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Return
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            Consumable · Qty {asset.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const assetDoc = assetList.find((x) => x.id === asset.assetDocId);
                                if (!assetDoc) {
                                  showError('Asset not found');
                                  return;
                                }
                              setReturnConsumableModal({
                                asset: assetDoc || asset,
                                assignment: asset.assignment,
                              });
                              setReturnQty(1);
                              setReturnCondition('Good');
                              setReturnNotes('');
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Return
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAssetHistory((s) => !s)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3 w-full"
            >
              <span>Asset History</span>
              <span className="text-xs text-gray-400 font-normal">
                ({employeeAssetHistory.length} assets)
              </span>
              <span className="ml-auto text-gray-400">
                {showAssetHistory ? '▲' : '▼'}
              </span>
            </button>

            {showAssetHistory && (
              <div className="space-y-2">
                {employeeAssetHistory.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No asset history found
                  </p>
                )}
                {employeeAssetHistory.map((asset) =>
                  asset.relevantHistory
                    .slice()
                    .sort((a, b) => {
                      const da = a.date?.toDate?.() || new Date(a.date);
                      const db2 = b.date?.toDate?.() || new Date(b.date);
                      return db2 - da;
                    })
                    .map((h, i) => (
                      <div
                        key={`${asset.id}-${i}`}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100"
                      >
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-base flex-shrink-0 border">
                          {getAssetIcon(asset.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {asset.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {asset.assetId}
                            {' · '}
                            {h.date ? toDisplayDate(h.date) : '—'}
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            h.action === 'assigned'
                              ? 'bg-green-100 text-green-700'
                              : h.action === 'issued'
                              ? 'bg-green-100 text-green-700'
                              : h.action === 'returned'
                              ? 'bg-[#C5E8E8] text-[#1B6B6B]'
                              : h.action === 'stock_adjusted'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {h.action.charAt(0).toUpperCase() + h.action.slice(1)}
                        </span>
                      </div>
                    )),
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'onboarding' && (
        <div className="space-y-6">
          {isInactive && (
            <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-xl mb-4">
              <span className="text-xl shrink-0">🔒</span>
              <div>
                <p className="text-sm font-semibold text-gray-600">Read-only — Employee is Inactive</p>
                <p className="text-xs text-gray-400 mt-0.5">Onboarding history is preserved for records.</p>
              </div>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      onboarding?.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : onboarding?.status === 'in_progress'
                        ? 'bg-[#C5E8E8] text-[#1B6B6B]'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {onboarding?.status === 'completed'
                      ? 'Completed'
                      : onboarding?.status === 'in_progress'
                      ? 'In Progress'
                      : 'Not Started'}
                  </span>
                  <span className="text-xs text-gray-500">
                    Joining: {employee.joiningDate ? toDisplayDate(employee.joiningDate) : '—'}
                  </span>
                </div>

                <p className="text-sm text-gray-700 font-medium">
                  {onboardingCompleted} of {onboardingTotal} tasks completed
                </p>
                <p className="text-xs text-gray-400 mt-1">{onboardingPct}% Complete</p>
                <div className="mt-3 w-full max-w-md bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-[#4ECDC4] h-2 rounded-full"
                    style={{ width: `${Math.min(onboardingPct, 100)}%` }}
                  />
                </div>
              </div>

              {canStartOnboarding && !isInactive && (!onboarding || onboarding.status === 'not_started') && (
                <button
                  type="button"
                  onClick={handleStartOnboarding}
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
                >
                  {saving ? 'Starting…' : 'Start Onboarding'}
                </button>
              )}
            </div>
          </div>

          {!canStartOnboarding && !onboardingEverStarted && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Onboarding not available</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Onboarding can only be started for Active employees. Current status: {employee.status || '—'}
                </p>
              </div>
            </div>
          )}

          {showOnboardingTaskList ? (
            <div className="space-y-6">
              {onboardingByCategory.map((g) => {
                const totalInCategory = g.tasks.length;
                const completedInCategory = g.tasks.filter((t) => t.completed).length;
                return (
                  <div key={g.category}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        {getCategoryIcon(g.category)} {g.category}
                      </h3>
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {completedInCategory}/{totalInCategory}
                      </span>
                    </div>

                    {g.tasks.map((task) => (
                      <div
                        key={task.id}
                        role={!task.completed && canEditEmployees && !isInactive ? 'button' : undefined}
                        tabIndex={!task.completed && canEditEmployees && !isInactive ? 0 : undefined}
                        onClick={() => {
                          if (task.completed || isInactive || !canEditEmployees) return;
                          setCompletingTask(task);
                          setTaskNotes('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !task.completed && !isInactive && canEditEmployees) {
                            setCompletingTask(task);
                            setTaskNotes('');
                          }
                        }}
                        className={`flex items-start gap-3 p-3 rounded-xl border mb-2 transition-all ${
                          !task.completed && canEditEmployees && !isInactive ? 'cursor-pointer' : 'cursor-default'
                        } ${
                          task.completed
                            ? 'bg-green-50 border-green-100'
                            : isOverdue(task.dueDate)
                            ? 'bg-red-50 border-red-100'
                            : 'bg-white border-gray-200'
                        } ${
                          !task.completed && canEditEmployees && !isInactive
                            ? 'hover:border-[#C5E8E8] hover:bg-[#E8F5F5]'
                            : ''
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                            task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                          }`}
                        >
                          {task.completed && (
                            <svg width="10" height="10" viewBox="0 0 10 10">
                              <path
                                d="M2 5l2.5 2.5L8 3"
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                fill="none"
                              />
                            </svg>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={`text-sm font-medium ${
                                task.completed ? 'line-through text-gray-400' : 'text-gray-800'
                              }`}
                            >
                              {task.title}
                            </p>
                            {task.isRequired && !task.completed && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                                Required
                              </span>
                            )}
                            {isOverdue(task.dueDate) && !task.completed && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                                Overdue
                              </span>
                            )}
                          </div>

                          {task.description && (
                            <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>
                          )}

                          {task.linkedPolicyId && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/company/${companyId}/policies?policy=${task.linkedPolicyId}`);
                              }}
                              className="text-xs text-[#1B6B6B] hover:underline flex items-center gap-1 mt-1 text-left"
                            >
                              📋 View linked policy →
                            </button>
                          )}

                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            <span className="text-xs text-gray-400 flex items-center gap-1">
                              Due: {task.dueDate ? toDisplayDate(task.dueDate) : '—'}
                            </span>
                            <span className="text-xs text-gray-400">· {getAssignedLabel(task.assignedTo)}</span>
                            {task.completed && (
                              <span className="text-xs text-green-600">
                                ✓ Done by {task.completedBy} on {toDisplayDate(task.completedAt)}
                              </span>
                            )}
                          </div>

                          {task.completed && task.notes && (
                            <p className="text-xs text-gray-500 mt-1 italic">"{task.notes}"</p>
                          )}
                        </div>

                        {task.completed && !isInactive && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              unmarkTask(task.id);
                            }}
                            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 flex-shrink-0"
                          >
                            Undo
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : !canStartOnboarding && !onboardingEverStarted ? null : (
            <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              <p className="text-4xl mb-3">🎯</p>
              <p className="text-base font-medium text-gray-700 mb-1">Onboarding not started</p>
              <p className="text-sm text-gray-400 mb-4">
                Start the onboarding process to track tasks for {employee.fullName}
              </p>
              {canStartOnboarding && !isInactive && (
                <button
                  type="button"
                  onClick={handleStartOnboarding}
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
                >
                  {saving ? 'Starting…' : 'Start Onboarding'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'offboarding' && (
        <div className="space-y-6">
          {showOffboardingReadOnlyUi ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">{employee.status === 'Inactive' ? '🔴' : '✅'}</div>
              <h3 className="text-base font-semibold text-gray-700 mb-2">
                {employee.status === 'Inactive' ? 'Employee is Inactive' : 'Offboarding completed'}
              </h3>
              <p className="text-sm text-gray-400 max-w-xs mx-auto mb-6">
                {employee.status === 'Inactive'
                  ? 'This employee has completed offboarding. Profile is read-only.'
                  : 'This employee has finished exit processing. Profile is read-only.'}
              </p>

              {employee.offboarding?.completedAt && (
                <div className="inline-flex flex-col items-center gap-1 px-6 py-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <p className="text-xs text-gray-400">Offboarding completed on</p>
                  <p className="text-sm font-semibold text-gray-700">
                    {toDisplayDate(employee.offboarding.completedAt)}
                  </p>
                  {(employee.offboarding.reason || employee.offboarding.exitReason) && (
                    <p className="text-xs text-gray-400 mt-1">
                      Reason: {employee.offboarding.reason || employee.offboarding.exitReason}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : !showOffboardingMainFlow ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">
                Offboarding not available for {employee.status || 'this'} employees.
              </p>
            </div>
          ) : (
            <>
              {showNoticePeriodSection && noticePeriodMetrics && offboarding && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">⏰</span>
                          <h3 className="text-base font-semibold text-amber-800">Notice Period Running</h3>
                        </div>
                        <p className="text-sm text-amber-600">
                          {noticePeriodMetrics.daysRemaining > 0
                            ? `${noticePeriodMetrics.daysRemaining} days remaining`
                            : 'Notice Period completed'}
                        </p>
                      </div>
                      <span className="text-2xl font-bold text-amber-600">{noticePeriodMetrics.progressPct}%</span>
                    </div>
                    <div className="w-full bg-amber-200 rounded-full h-2 mb-4">
                      <div
                        className="bg-amber-500 h-2 rounded-full transition-all"
                        style={{ width: `${noticePeriodMetrics.progressPct}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                      <div className="bg-white rounded-xl p-3 border border-amber-100">
                        <p className="text-xs text-amber-500 mb-1">Resigned On</p>
                        <p className="text-sm font-semibold text-gray-800">
                          {toDisplayDate(offboarding.resignationDate)}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-amber-100">
                        <p className="text-xs text-amber-500 mb-1">Notice Period</p>
                        <p className="text-sm font-semibold text-gray-800">{offboarding.noticePeriodDays} days</p>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-amber-100">
                        <p className="text-xs text-amber-500 mb-1">Expected Last Day</p>
                        <p className="text-sm font-semibold text-gray-800">
                          {toDisplayDate(offboarding.expectedLastDay)}
                        </p>
                      </div>
                    </div>
                    {offboarding.reason && (
                      <div className="mt-3 pt-3 border-t border-amber-200">
                        <p className="text-xs text-amber-500">Reason</p>
                        <p className="text-sm text-gray-700 mt-0.5">{offboarding.reason}</p>
                      </div>
                    )}
                  </div>
                  {canEditEmployees && offPhase === 'notice_period' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setShowWithdrawModal(true)}
                        className="flex flex-col items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-2xl hover:bg-green-100 transition-colors text-center"
                      >
                        <span className="text-2xl">🔄</span>
                        <div>
                          <p className="text-xs font-semibold text-green-700">Withdraw</p>
                          <p className="text-xs font-semibold text-green-700">Resignation</p>
                          <p className="text-xs text-green-500 mt-0.5">Employee stays</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowBuyoutModal(true)}
                        className="flex flex-col items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-2xl hover:bg-blue-100 transition-colors text-center"
                      >
                        <span className="text-2xl">💰</span>
                        <div>
                          <p className="text-xs font-semibold text-blue-700">Notice</p>
                          <p className="text-xs font-semibold text-blue-700">Buyout</p>
                          <p className="text-xs text-blue-500 mt-0.5">Early exit</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowExitTasksModal(true)}
                        className="flex flex-col items-center gap-2 p-4 bg-orange-50 border border-orange-200 rounded-2xl hover:bg-orange-100 transition-colors text-center"
                      >
                        <span className="text-2xl">✅</span>
                        <div>
                          <p className="text-xs font-semibold text-orange-700">Start Exit</p>
                          <p className="text-xs font-semibold text-orange-700">Tasks</p>
                          <p className="text-xs text-orange-500 mt-0.5">Begin F&amp;F</p>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {showExitTasksSection && offboarding && (
                <div>
                  <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-orange-800">Exit Processing</p>
                        <p className="text-xs text-orange-600">
                          Last day:{' '}
                          {toDisplayDate(offboarding.actualLastDay || offboarding.expectedLastDay || offboarding.exitDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-orange-600">{offboarding.completionPct ?? offPct}%</p>
                        <p className="text-xs text-orange-500">complete</p>
                      </div>
                    </div>
                  </div>

                  <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        offPct === 100 ? 'bg-green-500' : offPct > 50 ? 'bg-[#4ECDC4]' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(offPct, 100)}%` }}
                    />
                  </div>

                  {(() => {
                    const exit = toJSDate(offExitRefForUi);
                    const daysUntilExit = exit ? Math.ceil((exit - new Date()) / (1000 * 60 * 60 * 24)) : null;
                    if (daysUntilExit == null) return null;
                    if (daysUntilExit > 0) {
                      return (
                        <div className="text-center mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
                          <p className="text-2xl font-bold text-amber-700">{daysUntilExit}</p>
                          <p className="text-xs text-amber-600">days until exit</p>
                        </div>
                      );
                    }
                    if (daysUntilExit === 0) {
                      return (
                        <div className="text-center mb-4 p-3 bg-red-50 rounded-xl border border-red-100">
                          <p className="text-sm font-bold text-red-700">🚨 Today is the last working day!</p>
                        </div>
                      );
                    }
                    return (
                      <div className="text-center mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <p className="text-sm text-gray-500">
                          Employee has exited {Math.abs(daysUntilExit)} days ago
                        </p>
                      </div>
                    );
                  })()}

                  <div className="space-y-6">
                    {offByCategory.map((g) => {
                      const totalInCategory = g.tasks.length;
                      const completedInCategory = g.tasks.filter((t) => t.completed).length;
                      return (
                        <div key={g.category}>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                              {getOffCategoryIcon(g.category)} {g.category}
                            </h3>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              {completedInCategory}/{totalInCategory}
                            </span>
                          </div>

                          {g.tasks.map((task) => (
                            <div
                              key={task.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (task.completed) return;
                                setCompletingOffTask(task);
                                setOffTaskNotes('');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !task.completed) {
                                  setCompletingOffTask(task);
                                  setOffTaskNotes('');
                                }
                              }}
                              className={`flex items-start gap-3 p-3 rounded-xl border mb-2 transition-all cursor-pointer ${
                                task.completed
                                  ? 'bg-green-50 border-green-100'
                                  : isOverdue(task.dueDate)
                                    ? 'bg-red-50 border-red-100'
                                    : 'bg-white border-gray-200 hover:border-amber-200 hover:bg-amber-50'
                              }`}
                            >
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                                  task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                                }`}
                              >
                                {task.completed && (
                                  <svg width="10" height="10" viewBox="0 0 10 10">
                                    <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                                  </svg>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className={`text-sm font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                                    {task.title}
                                  </p>
                                  {task.isRequired !== false && !task.completed && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">Required</span>
                                  )}
                                  {isOverdue(task.dueDate) && !task.completed && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600">Overdue</span>
                                  )}
                                </div>
                                {task.description && <p className="text-xs text-gray-400 mt-0.5">{task.description}</p>}
                                {task.isAssetTask && (
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">📦 Asset Return</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/company/${companyId}/assets`);
                                      }}
                                      className="text-xs text-[#1B6B6B] hover:underline"
                                    >
                                      View in Assets →
                                    </button>
                                  </div>
                                )}
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                  <span className="text-xs text-gray-400">Due: {task.dueDate ? toDisplayDate(task.dueDate) : '—'}</span>
                                  <span className="text-xs text-gray-400">· {getAssignedLabel(task.assignedTo)}</span>
                                  {task.completed && (
                                    <span className="text-xs text-green-600">
                                      ✓ Done by {task.completedBy} on {toDisplayDate(task.completedAt)}
                                    </span>
                                  )}
                                </div>
                                {task.completed && task.notes && (
                                  <p className="text-xs text-gray-500 mt-1 italic">&quot;{task.notes}&quot;</p>
                                )}
                              </div>

                              {task.completed && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    unmarkOffboardingTask(task.id);
                                  }}
                                  className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 flex-shrink-0"
                                >
                                  Undo
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>

                  {canEditEmployees && allOffboardingTasksDone && (
                    <div className="mt-6 p-5 bg-green-50 border-2 border-green-300 rounded-2xl text-center">
                      <div className="text-4xl mb-3">🎉</div>
                      <h3 className="text-base font-semibold text-green-800 mb-1">All Tasks Completed!</h3>
                      <p className="text-sm text-green-600 mb-4">
                        Review everything and click below to officially close this employee&apos;s offboarding.
                      </p>
                      <div className="text-left bg-white rounded-xl p-4 mb-4 border border-green-200">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Final Checklist</p>
                        {[
                          'All assets returned to inventory',
                          'F&F settlement processed',
                          'Experience & relieving letter issued',
                          'PF & ESIC details settled',
                          'Knowledge transfer completed',
                          'Access revoked from all systems',
                        ].map((item) => (
                          <div
                            key={item}
                            className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0"
                          >
                            <span className="text-green-500 text-sm">✓</span>
                            <span className="text-sm text-gray-600">{item}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCompleteOffboardingModal(true)}
                        className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors"
                      >
                        ✅ Complete Offboarding &amp; Mark as Inactive
                      </button>
                    </div>
                  )}

                  {canEditEmployees && !allOffboardingTasksDone && offPhase === 'exit_tasks' && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => setShowCompleteOffboardingModal(true)}
                        className="w-full py-2.5 border-2 border-dashed border-gray-300 text-gray-400 rounded-xl text-sm hover:border-amber-400 hover:text-amber-600 transition-colors"
                      >
                        Complete Offboarding Early
                      </button>
                      <p className="text-xs text-center text-gray-400 mt-1.5">
                        {employee.offboarding?.tasks?.filter((t) => t.isRequired !== false && !t.completed).length || 0}{' '}
                        required tasks still pending
                      </p>
                    </div>
                  )}
                </div>
              )}

              {showStarterSection && (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">📋</div>
                  <h3 className="text-base font-semibold text-gray-700 mb-2">No resignation recorded</h3>
                  <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
                    When an employee resigns, record it here to start tracking their Notice Period.
                  </p>
                  {offPhase === 'withdrawn' && employee.offboarding?.withdrawnOn && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl max-w-lg mx-auto">
                      <p className="text-xs text-green-700">
                        ✓ Previous resignation was withdrawn on {toDisplayDate(employee.offboarding.withdrawnOn)}. Employee is
                        Active again.
                      </p>
                    </div>
                  )}
                  {!onboardingCompleteForOff && (
                    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl max-w-lg mx-auto text-left">
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0">⚠️</span>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-amber-800">Onboarding incomplete</p>
                          <p className="text-xs text-amber-600 mt-0.5">
                            {!onboardingStartedForOff
                              ? 'Onboarding has not been started yet.'
                              : `Onboarding is ${onboardingPctForOff}% complete.`}{' '}
                            HR can still proceed with offboarding if required.
                          </p>
                          <button
                            type="button"
                            onClick={() => setTab('onboarding')}
                            className="text-xs text-amber-700 font-medium underline mt-1.5"
                          >
                            Go to Onboarding tab →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {canEditEmployees && canRecordResignation && (
                    <button
                      type="button"
                      onClick={handleRecordResignationClick}
                      className="px-6 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600"
                    >
                      {offPhase === 'withdrawn' ? '📝 Record New Resignation' : '📝 Record Resignation'}
                    </button>
                  )}
                  {(assignedAssetsForWarning.trackables.length > 0 || assignedAssetsForWarning.consumables.length > 0) && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-8 max-w-lg mx-auto text-left">
                      <p className="text-sm font-medium text-amber-800 mb-2">⚠️ Assets to be returned</p>
                      {assignedAssetsForWarning.trackables.map((a) => (
                        <p key={a.id} className="text-xs text-amber-700">
                          • {a.name} ({a.assetId})
                        </p>
                      ))}
                      {assignedAssetsForWarning.consumables.map((a) => (
                        <p key={`${a.id}_${a.assetId}`} className="text-xs text-amber-700">
                          • {a.name} ({a.assetId}) · Qty: {a._qty}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {showOffboardingMainFlow &&
                !showOffboardingReadOnlyUi &&
                !showNoticePeriodSection &&
                !showExitTasksSection &&
                !showStarterSection && (
                  <div className="text-center py-12 text-gray-400">
                    <p className="text-sm">
                      Offboarding state could not be displayed. Status: {employee.status || '—'} · Phase:{' '}
                      {offboardingPhase || '—'}
                    </p>
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {canDeleteEmployee && (
        <div className="mt-8 pt-6 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Danger Zone</p>
              <p className="text-xs text-gray-400">Permanently delete this employee and all their data</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmName('');
                setShowDeleteModal(true);
              }}
              className="px-4 py-2 border border-red-200 text-red-500 rounded-xl text-sm hover:bg-red-50 transition-colors"
            >
              🗑️ Delete Employee
            </button>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="text-center mb-5">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">🗑️</span>
              </div>
              <h3 className="text-base font-semibold text-gray-800 mb-1">Delete Employee Permanently?</h3>
              <p className="text-sm text-gray-500">
                This will permanently delete <strong>{employee.fullName}</strong> and ALL their data including documents,
                leave history, assets, and onboarding records.
              </p>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
              <p className="text-xs text-red-600 font-medium">
                ⚠️ This action cannot be undone. Only delete incorrect or duplicate records. This action is permanent.
              </p>
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1.5">
                Type <strong>{employee.fullName}</strong> to confirm
              </label>
              <input
                placeholder={employee.fullName}
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 border-red-200"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmName('');
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirmName !== employee.fullName || deleting}
                onClick={handleDeleteEmployee}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompleteOffboardingModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">🏁</div>
              <h3 className="text-base font-semibold text-gray-800 mb-1">Complete Offboarding?</h3>
              <p className="text-sm text-gray-500">
                {employee.fullName} will be marked as Inactive. This cannot be undone.
              </p>
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-500 block mb-1.5">Final Notes (optional)</label>
              <textarea
                placeholder="e.g. All clearances done, F&F paid on 30/03/2026..."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCompleteOffboardingModal(false);
                  setCompletionNotes('');
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteOffboarding}
                disabled={saving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Confirm & Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRehireModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
            <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Rehire Employee</h2>
                <p className="text-sm text-gray-400 mt-0.5">{employee.fullName} will be reactivated</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRehireModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-sm font-semibold text-green-800 mb-1">Previous employment preserved</p>
                <p className="text-xs text-green-600">
                  All documents, leave history, and records from previous employment will be kept. A new tenure will begin.
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">New Joining Date *</label>
                <input
                  type="date"
                  value={rehireForm.newJoiningDate}
                  onChange={(e) => setRehireForm((prev) => ({ ...prev, newJoiningDate: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <p className="text-xs text-blue-700">
                  💡 All other details (designation, department, salary etc.) can be updated by editing the employee
                  profile after rehiring.
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Notes (optional)</label>
                <textarea
                  placeholder="e.g. Rehired as Senior Developer after 6 months gap"
                  value={rehireForm.notes}
                  onChange={(e) => setRehireForm((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]"
                />
              </div>
            </div>

            <div className="p-6 border-t flex-shrink-0 flex gap-3">
              <button
                type="button"
                onClick={() => setShowRehireModal(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRehireEmployee}
                disabled={!rehireForm.newJoiningDate || saving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Rehiring…' : '✓ Confirm Rehire'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignAssetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Assign Asset</h2>
            <form onSubmit={handleSaveAssignFromProfile} className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Employee</p>
                <p className="text-sm font-medium text-slate-800">
                  {employee.fullName} ({employee.empId})
                </p>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Asset</label>
                <select
                  name="assetId"
                  value={assignAssetForm.assetId}
                  onChange={handleAssignAssetChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select asset</option>
                  {assetList
                    .filter((a) => (a.status || 'Available') === 'Available')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.assetId} · {a.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Issue Date</label>
                  <input
                    type="date"
                    name="issueDate"
                    value={assignAssetForm.issueDate}
                    onChange={handleAssignAssetChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Condition at Issue</label>
                  <select
                    name="condition"
                    value={assignAssetForm.condition}
                    onChange={handleAssignAssetChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={assignAssetForm.notes}
                  onChange={handleAssignAssetChange}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Any special instructions or comments"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssignAssetModal(false)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Assigning…' : 'Assign Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showProfileAssignModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-3xl sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Assign / Issue Asset</h2>

            <div className="mb-5">
              <p className="text-sm text-slate-600">Employee</p>
              <p className="text-sm font-medium text-slate-800">
                {employee.fullName} ({employee.empId})
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Trackable assignment */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-700">Trackable (Assign)</h3>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Available Trackable Assets</label>
                  <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setShowProfileAssetDropdown(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setShowProfileAssetDropdown(true);
                      }}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between min-h-[38px] hover:border-[#4ECDC4]"
                    >
                      {assignAssetForm.assetId ? (
                        (() => {
                          const sel = assetList.find((x) => x.id === assignAssetForm.assetId);
                          return sel ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded shrink-0">{sel.assetId}</span>
                              <span className="truncate">{sel.name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">Select asset...</span>
                          );
                        })()
                      ) : (
                        <span className="text-gray-400">Select asset...</span>
                      )}
                      <span className="text-gray-400 text-xs shrink-0">▾</span>
                    </div>
                    {showProfileAssetDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[60] max-h-52 overflow-hidden">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            autoFocus
                            placeholder="Search by name or ID..."
                            value={profileAssetSearch}
                            onChange={(e) => setProfileAssetSearch(e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="overflow-y-auto max-h-40">
                          {assetList
                            .filter((a) => (a.mode || 'trackable') === 'trackable')
                            .filter((a) => (a.status || 'Available') === 'Available' || !a.status)
                            .filter(
                              (a) =>
                                !profileAssetSearch ||
                                (a.name || '').toLowerCase().includes(profileAssetSearch.toLowerCase()) ||
                                (a.assetId || '').toLowerCase().includes(profileAssetSearch.toLowerCase()),
                            )
                            .map((asset) => (
                              <div
                                key={asset.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setAssignAssetForm((prev) => ({ ...prev, assetId: asset.id }));
                                  setProfileAssignMode('trackable');
                                  setShowProfileAssetDropdown(false);
                                  setProfileAssetSearch('');
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    setAssignAssetForm((prev) => ({ ...prev, assetId: asset.id }));
                                    setProfileAssignMode('trackable');
                                    setShowProfileAssetDropdown(false);
                                    setProfileAssetSearch('');
                                  }
                                }}
                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer border-b border-gray-100 last:border-0"
                              >
                                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 shrink-0">
                                  {asset.assetId}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{asset.name}</p>
                                  <p className="text-xs text-gray-400 truncate">
                                    {asset.type} · {asset.brand || '—'}
                                    {asset.condition ? ` · ${asset.condition}` : ''}
                                  </p>
                                </div>
                              </div>
                            ))}
                          {assetList.filter(
                            (a) =>
                              (a.mode || 'trackable') === 'trackable' &&
                              ((a.status || 'Available') === 'Available' || !a.status),
                          ).length === 0 && (
                            <p className="text-center py-4 text-sm text-gray-400">No available trackable assets</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Issue Date</label>
                  <input
                    type="date"
                    name="issueDate"
                    value={assignAssetForm.issueDate}
                    onChange={(e) => {
                      handleAssignAssetChange(e);
                      setProfileAssignMode('trackable');
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Condition at Issue</label>
                  <select
                    name="condition"
                    value={assignAssetForm.condition}
                    onChange={(e) => {
                      handleAssignAssetChange(e);
                      setProfileAssignMode('trackable');
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-600 mb-1">Notes</label>
                  <textarea
                    name="notes"
                    value={assignAssetForm.notes}
                    onChange={(e) => {
                      handleAssignAssetChange(e);
                      setProfileAssignMode('trackable');
                    }}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Any special instructions or comments"
                  />
                </div>
              </div>

              {/* Consumable issuance */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-700">Consumable (Issue)</h3>

                <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                  {assetList
                    .filter((a) => (a.mode || 'trackable') === 'consumable')
                    .filter((a) => Number(a.availableStock) > 0)
                    .length === 0 ? (
                      <p className="text-xs text-slate-500">No consumables available</p>
                    ) : (
                      assetList
                        .filter((a) => (a.mode || 'trackable') === 'consumable')
                        .filter((a) => Number(a.availableStock) > 0)
                        .map((a) => (
                          <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{a.name}</p>
                              <p className="text-xs text-slate-500">
                                {a.type} · {a.availableStock} available
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIssueConsumableAsset(a);
                                setProfileAssignMode('consumable');
                                setIssueConsumableForm((p) => ({
                                  ...p,
                                  quantity: 1,
                                  issueDate: p.issueDate || new Date().toISOString().slice(0, 10),
                                  condition: 'Good',
                                  notes: '',
                                }));
                              }}
                              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                            >
                              Issue
                            </button>
                          </div>
                        ))
                    )}
                </div>

                {profileAssignMode === 'consumable' && issueConsumableAsset && (
                  <form onSubmit={handleIssueConsumableFromProfile} className="space-y-4">
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Issue Quantity</p>
                      <input
                        type="number"
                        min={1}
                        max={Number(issueConsumableAsset.availableStock) || 0}
                        value={issueConsumableForm.quantity}
                        onChange={(e) => setIssueConsumableForm((p) => ({ ...p, quantity: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Available: {Number(issueConsumableAsset.availableStock) || 0}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Issue Date</label>
                      <input
                        type="date"
                        value={issueConsumableForm.issueDate}
                        onChange={(e) => setIssueConsumableForm((p) => ({ ...p, issueDate: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Condition</label>
                      <select
                        value={issueConsumableForm.condition}
                        onChange={(e) => setIssueConsumableForm((p) => ({ ...p, condition: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="New">New</option>
                        <option value="Good">Good</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Notes</label>
                      <textarea
                        value={issueConsumableForm.notes}
                        onChange={(e) => setIssueConsumableForm((p) => ({ ...p, notes: e.target.value }))}
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Optional notes"
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileAssignModal(null);
                          setShowProfileAssetDropdown(false);
                          setProfileAssetSearch('');
                          setIssueConsumableAsset(null);
                          setProfileAssignMode('trackable');
                        }}
                        className="text-sm text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2"
                      >
                        Issue Consumable
                      </button>
                    </div>
                  </form>
                )}

                {profileAssignMode === 'trackable' && (
                  <form onSubmit={handleSaveAssignFromProfile} className="space-y-4">
                    <div className="hidden" aria-hidden="true" />
                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfileAssignModal(null);
                          setShowProfileAssetDropdown(false);
                          setProfileAssetSearch('');
                          setIssueConsumableAsset(null);
                          setProfileAssignMode('trackable');
                        }}
                        className="text-sm text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!assignAssetForm.assetId}
                        className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                      >
                        Assign Asset
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {returnAsset && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Return Asset</h2>
            <form onSubmit={handleSaveReturnFromProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500">Asset</p>
                  <p className="text-sm font-medium text-slate-800">
                    {returnAsset.assetId} · {returnAsset.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Employee</p>
                  <p className="text-sm text-slate-800">
                    {employee.fullName} ({employee.empId})
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Return Date</label>
                  <input
                    type="date"
                    name="date"
                    value={returnAssetForm.date}
                    onChange={handleReturnAssetChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Condition on Return</label>
                  <select
                    name="condition"
                    value={returnAssetForm.condition}
                    onChange={handleReturnAssetChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="New">New</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                    <option value="Damaged">Damaged</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={returnAssetForm.notes}
                  onChange={handleReturnAssetChange}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Any damage or notes on return"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnAsset(null)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#1B6B6B] hover:bg-[#155858] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {returnConsumableModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-gray-900 mb-1">
              Return {returnConsumableModal.asset?.name}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Issued to {employee.fullName} · Qty: {returnConsumableModal.assignment?.quantity}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Quantity to Return</label>
                <input
                  type="number"
                  min="1"
                  max={returnConsumableModal.assignment?.quantity}
                  value={returnQty}
                  onChange={(e) => setReturnQty(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Max: {returnConsumableModal.assignment?.quantity}
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Condition on Return</label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option>Good</option>
                  <option>Fair</option>
                  <option>Poor</option>
                  <option>Damaged</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Notes (optional)</label>
                <textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Any damage or notes..."
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setReturnConsumableModal(null);
                  setReturnQty(1);
                  setReturnCondition('Good');
                  setReturnNotes('');
                }}
                className="flex-1 py-2 border rounded-xl text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleReturnConsumableFromProfile}
                className="flex-1 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858]"
              >
                Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}

      {completingTask && !isInactive && canEditEmployees && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="font-medium mb-3">
              Complete: {completingTask.title}
            </h3>
            <textarea
              placeholder="Add notes (optional)..."
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompletingTask(null)}
                className="flex-1 py-2 border rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await markTaskComplete(completingTask.id, taskNotes);
                    setCompletingTask(null);
                    setTaskNotes('');
                  } catch {
                    showError('Failed to update task');
                  }
                }}
                className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium"
              >
                Mark Complete ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {completingOffTask && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
            <h3 className="font-medium mb-3">
              Complete: {completingOffTask.title}
            </h3>
            <textarea
              placeholder="Add notes (optional)..."
              value={offTaskNotes}
              onChange={(e) => setOffTaskNotes(e.target.value)}
              rows={3}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCompletingOffTask(null)}
                className="flex-1 py-2 border rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await markOffboardingTaskComplete(completingOffTask.id, offTaskNotes);
                    setCompletingOffTask(null);
                    setOffTaskNotes('');
                  } catch {
                    showError('Failed to update task');
                  }
                }}
                className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium"
              >
                Mark Complete ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {showOnboardingWarningModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-xl">
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="text-base font-semibold text-gray-800 mb-2">Onboarding Not Complete</h3>
            <p className="text-sm text-gray-500 mb-2">
              {!onboardingStartedForOff
                ? 'Onboarding has not been started for this employee.'
                : `Onboarding is only ${onboardingPctForOff}% complete.`}
            </p>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to start the offboarding process?</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowOnboardingWarningModal(false);
                  setShowResignationModal(true);
                }}
                className="w-full py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600"
              >
                Yes, Continue with Offboarding
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOnboardingWarningModal(false);
                  setTab('onboarding');
                }}
                className="w-full py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50"
              >
                Go to Onboarding First
              </button>
            </div>
          </div>
        </div>
      )}

      {showResignationModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Record Resignation</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Resignation Date</label>
                <input
                  type="date"
                  value={resignForm.resignationDate}
                  onChange={(e) => setResignForm((f) => ({ ...f, resignationDate: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notice Period</label>
                <select
                  value={resignForm.noticePeriodDays}
                  onChange={(e) => setResignForm((f) => ({ ...f, noticePeriodDays: Number(e.target.value) }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                >
                  <option value={15}>15 days</option>
                  <option value={30}>30 days</option>
                  <option value={45}>45 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-xs text-amber-500">Expected Last Day (auto-calculated)</p>
                <p className="text-base font-bold text-amber-800 mt-1">
                  {expectedResignationLastDay ? toDisplayDate(expectedResignationLastDay) : '— select dates above'}
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Reason</label>
                <select
                  value={resignForm.reason}
                  onChange={(e) => setResignForm((f) => ({ ...f, reason: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                >
                  <option value="">Select reason</option>
                  <option value="Better Opportunity">Better Opportunity</option>
                  <option value="Higher Studies">Higher Studies</option>
                  <option value="Personal Reasons">Personal Reasons</option>
                  <option value="Relocation">Relocation</option>
                  <option value="Health Reasons">Health Reasons</option>
                  <option value="Entrepreneurship">Entrepreneurship</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                <textarea
                  value={resignForm.notes}
                  onChange={(e) => setResignForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowResignationModal(false)}
                className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordResignation}
                disabled={saving}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Record Resignation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Withdraw Resignation</h2>
            <div className="text-center py-4">
              <div className="text-5xl mb-4">🔄</div>
              <h3 className="text-base font-semibold text-gray-800 mb-2">
                Withdraw {employee.fullName}&apos;s Resignation?
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Employee will return to Active status. All offboarding data will be preserved in history for audit
                trail.
              </p>
              <textarea
                placeholder="Notes (e.g. Employee retained with salary revision)"
                value={withdrawNotes}
                onChange={(e) => setWithdrawNotes(e.target.value)}
                rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none text-left"
              />
            </div>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowWithdrawModal(false);
                  setWithdrawNotes('');
                }}
                className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWithdrawResignation}
                disabled={saving}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Yes, Withdraw Resignation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBuyoutModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Notice Period Buyout</h2>
            <p className="text-sm text-gray-500 mb-4">
              Company is buying out the remaining Notice Period. Employee will exit earlier than planned.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Actual Last Day</label>
                <input
                  type="date"
                  value={buyoutForm.actualLastDay}
                  onChange={(e) => setBuyoutForm((f) => ({ ...f, actualLastDay: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              {buyoutDaysPreview != null && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <p className="text-xs text-blue-500">Days being bought out</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{buyoutDaysPreview} days</p>
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                <textarea
                  value={buyoutForm.notes}
                  onChange={(e) => setBuyoutForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowBuyoutModal(false)}
                className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNoticeBuyout}
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Confirm Buyout'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cropModalOpen && rawImageSrc && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Adjust Photo</h3>
                <p className="text-xs text-gray-400 mt-0.5">Pinch or scroll to zoom · Drag to reposition</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCropModalOpen(false);
                  setRawImageSrc(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
              >
                ✕
              </button>
            </div>

            <div className="relative bg-gray-900" style={{ height: '320px' }}>
              <Cropper
                image={rawImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                style={{
                  containerStyle: { borderRadius: '0' },
                  cropAreaStyle: {
                    border: '3px solid #4ECDC4',
                    boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
                  },
                }}
              />
            </div>

            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-4">🔍</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(ev) => setZoom(Number(ev.target.value))}
                  className="flex-1 accent-[#1B6B6B]"
                />
                <span className="text-xs text-gray-400 w-4">🔎</span>
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setCropModalOpen(false);
                  setRawImageSrc(null);
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={async () => {
                  if (!croppedAreaPixels) {
                    showError('Please adjust the crop area');
                    return;
                  }
                  try {
                    setUploadingPhoto(true);
                    setCropModalOpen(false);

                    const blob = await getCroppedBlob(rawImageSrc, croppedAreaPixels);

                    const storage = getStorage(app);
                    const photoRef = ref(storage, `companies/${companyId}/employees/${empId}/profile.jpg`);

                    const snapshot = await uploadBytes(photoRef, blob, {
                      contentType: 'image/jpeg',
                      customMetadata: {
                        empId: String(empId),
                        companyId: String(companyId),
                        uploadedAt: new Date().toISOString(),
                      },
                    });

                    const url = await getDownloadURL(snapshot.ref);

                    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), { photoURL: url });

                    setRawImageSrc(null);
                    trackPhotoUploaded();
                    success('✓ Photo updated!');
                    await fetchEmployee();
                  } catch (err) {
                    showError(`Upload failed: ${err?.message || 'Unknown error'}`);
                  } finally {
                    setUploadingPhoto(false);
                  }
                }}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-50"
              >
                {uploadingPhoto ? 'Uploading...' : '✓ Save Photo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExitTasksModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Start Exit Tasks</h2>
            <p className="text-sm text-gray-500 mb-4">
              Confirm last working day and exit reason. Exit Tasks will be generated, including asset returns.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Last Working Day</label>
                <input
                  type="date"
                  value={offboardingExitDate}
                  onChange={(e) => setOffboardingExitDate(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Exit Reason</label>
                <select
                  value={offboardingExitReason}
                  onChange={(e) => setOffboardingExitReason(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm"
                >
                  <option value="">Select reason</option>
                  <option value="Resignation">Resignation</option>
                  <option value="Termination">Termination</option>
                  <option value="Retirement">Retirement</option>
                  <option value="Contract End">Contract End</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowExitTasksModal(false)}
                className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartExitTasks}
                disabled={saving}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? 'Starting…' : 'Start Exit Tasks'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemovePhotoConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs text-center shadow-xl">
            <div className="text-3xl mb-3">🗑️</div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Remove Photo?</h3>
            <p className="text-xs text-gray-400 mb-4">
              The employee&apos;s photo will be removed and replaced with initials.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRemovePhotoConfirm(false)}
                className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowRemovePhotoConfirm(false);
                  try {
                    setUploadingPhoto(true);
                    await deleteEmployeePhoto(companyId, empId);
                    await updateDoc(doc(db, 'companies', companyId, 'employees', empId), {
                      photoURL: deleteField(),
                    });
                    success('Photo removed');
                    await fetchEmployee();
                  } catch {
                    showError('Failed to remove photo');
                  } finally {
                    setUploadingPhoto(false);
                  }
                }}
                className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
      {errorModal && (
        <ErrorModal
          errorType={errorModal}
          onRetry={() => setErrorModal(null)}
          onDismiss={() => setErrorModal(null)}
          onSignOut={async () => {
            setErrorModal(null);
            await signOut();
          }}
        />
      )}

    </div>
  );
}
