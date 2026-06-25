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
import { SkeletonTable } from '../components/SkeletonRow';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { DOCUMENT_CHECKLIST, getDocById } from '../utils/documentTypes';
import { uploadEmployeeDocument, deleteFileFromDrive } from '../utils/googleDrive';
import { toDisplayDate, toJSDate, toDateString, formatLakhs } from '../utils';
import { whatsappUrl } from '../utils/whatsappUrl';
import { createPrintDocument, escapeHtml, openPrintWindow } from '../utils/printTemplate';
import { deleteEmployeePhoto } from '../utils/photoUpload';
import { updateCompanyCounts } from '../utils/updateCompanyCounts';
import EmployeeAvatar from '../components/EmployeeAvatar';
import PersonalTab from '../components/profile/tabs/PersonalTab';
import DocumentsTab from '../components/profile/tabs/DocumentsTab';
import LeaveTab from '../components/profile/tabs/LeaveTab';
import AssetsTab from '../components/profile/tabs/AssetsTab';
import OnboardingTab from '../components/profile/tabs/OnboardingTab';
import OffboardingTab from '../components/profile/tabs/OffboardingTab';
import TimelineTab from '../components/profile/tabs/TimelineTab';
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

const HEADER_STATUS_CONFIG = {
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
  const isAdmin = userRole === 'admin';
  const isHRManager = userRole === 'hrmanager';
  const isCompanyAdmin = userRole === 'companyadmin';
  const canViewBankDetails = isAdmin || isHRManager || isCompanyAdmin;
  const canDeleteEmployee = userRole === 'admin' || userRole === 'companyadmin';
  const canEditEmployees = userRole === 'admin' || userRole === 'companyadmin' || userRole === 'hrmanager';
  const canUploadPhoto = userRole === 'admin' || userRole === 'companyadmin' || userRole === 'hrmanager';
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
  const [activeEditTab, setActiveEditTab] = useState('personal');
  const [saving, setSaving] = useState(false);
  const [errorModal, setErrorModal] = useState(null);

  const headerStatus = employee?.status || 'Active';
  const sc = HEADER_STATUS_CONFIG[headerStatus] || HEADER_STATUS_CONFIG.Active;

  const noticeDaysRemaining = useMemo(() => {
    if (!employee || employee.status !== 'Notice Period') return null;
    const last = toJSDate(employee.offboarding?.expectedLastDay);
    if (!last || Number.isNaN(last.getTime())) return null;
    const diff = Math.ceil((last.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [employee]);

  const offboardingTasksDone = useMemo(() => {
    const tasks = Array.isArray(employee?.offboarding?.tasks)
      ? employee.offboarding.tasks
      : [];
    return {
      done: tasks.filter((t) => t.completed).length,
      total: tasks.length,
    };
  }, [employee]);

  const tenure = useMemo(() => getTenure(employee?.joiningDate), [employee?.joiningDate]);

  const formattedJoiningDate = useMemo(() => {
    const d = toJSDate(employee?.joiningDate);
    if (!d || Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [employee?.joiningDate]);

  const formattedLastDay = useMemo(() => {
    const d = toJSDate(employee?.offboarding?.expectedLastDay);
    if (!d || Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [employee?.offboarding?.expectedLastDay]);

  const formattedSalary = useMemo(() => {
    const val = employee?.ctcPerAnnum ?? employee?.ctc;
    if (val == null || val === '') return '—';
    return `₹${Number(val).toLocaleString('en-IN')}/yr`;
  }, [employee?.ctcPerAnnum, employee?.ctc]);

  // Clear error modal on re-login
  useEffect(() => {
    if (!currentUser) return undefined;
    const timer = setTimeout(() => {
      setErrorModal(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [currentUser]);
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
    if (errType === 'permission_denied') return setErrorModal('permission_denied');
    if (errType === 'network_error') return setErrorModal('network_error');
    showError(ERROR_MESSAGES[errType]?.message || fallback);
  };
  const [profileAssetSearch, setProfileAssetSearch] = useState('');
  const [showAssetHistory, setShowAssetHistory] = useState(false);
  const [assignAssetForm, setAssignAssetForm] = useState({
    assetId: '',
    issueDate: '',
    expectedReturnDate: '',
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
      if (import.meta.env.DEV) console.error('EmployeeProfile refresh error:', err);
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
        if (import.meta.env.DEV) console.error('EmployeeProfile load error:', err);
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
        if (import.meta.env.DEV) console.error('Failed to fetch roles:', e);
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

  const profileCompleteness = useMemo(() => {
    if (!employee) return { pct: 0, missing: [] };
    const checks = [
      { key: 'fullName', label: 'Full name', present: !!employee.fullName },
      { key: 'email', label: 'Email', present: !!employee.email },
      { key: 'phone', label: 'Phone', present: !!employee.phone },
      { key: 'dateOfBirth', label: 'Date of birth', present: !!employee.dateOfBirth },
      { key: 'gender', label: 'Gender', present: !!employee.gender },
      { key: 'fatherName', label: "Father's name", present: !!employee.fatherName },
      { key: 'streetAddress', label: 'Address', present: !!(employee.streetAddress || employee.address) },
      { key: 'empId', label: 'Emp ID', present: !!employee.empId },
      { key: 'department', label: 'Department', present: !!employee.department },
      { key: 'designation', label: 'Designation', present: !!employee.designation },
      { key: 'joiningDate', label: 'Joining date', present: !!employee.joiningDate },
      { key: 'category', label: 'Category', present: !!employee.category },
      { key: 'ctcPerAnnum', label: 'CTC', present: !!(employee.ctcPerAnnum ?? employee.ctc) },
      { key: 'panNumber', label: 'PAN', present: !!employee.panNumber },
      { key: 'aadhaarNumber', label: 'Aadhaar', present: !!employee.aadhaarNumber },
      { key: 'emergencyContact', label: 'Emergency contact', present: !!employee.emergencyContact?.name },
    ];
    const done = checks.filter((c) => c.present).length;
    const pct = Math.round((done / checks.length) * 100);
    const missing = checks.filter((c) => !c.present).map((c) => c.label);
    return { pct, missing };
  }, [employee]);
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
      bankName: employee.bankName || '',
      accountHolderName: employee.accountHolderName || '',
      ifscCode: employee.ifscCode || '',
      accountType: employee.accountType || '',
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
        bankName: form.bankName?.trim() || null,
        accountHolderName: form.accountHolderName?.trim() || null,
        ifscCode: form.ifscCode?.trim() || null,
        accountType: form.accountType || null,
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
        if (import.meta.env.DEV) console.warn('Leave cleanup failed:', leaveErr);
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
        if (import.meta.env.DEV) console.warn('Asset cleanup failed:', assetErr);
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
        if (import.meta.env.DEV) console.warn('Drive cleanup failed:', driveErr);
      }

      try {
        await deleteEmployeePhoto(companyId, empId);
      } catch (storageErr) {
        if (import.meta.env.DEV) console.warn('Storage cleanup failed:', storageErr);
      }

      try {
        await updateCompanyCounts(companyId);
      } catch (countErr) {
        if (import.meta.env.DEV) console.warn('Count update failed:', countErr);
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
      if (import.meta.env.DEV) console.error(e);
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
        if (import.meta.env.DEV) console.warn('Count update failed:', countErr);
      }
      trackResignationWithdrawn();
      success(`${employee.fullName} is back to Active!`);
      setShowWithdrawModal(false);
      setWithdrawNotes('');
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
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
      if (import.meta.env.DEV) console.error(e);
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
        if (import.meta.env.DEV) console.warn('Count update failed:', countErr);
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
        if (import.meta.env.DEV) console.warn('Count update failed:', countErr);
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
      expectedReturnDate: '',
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
      const expectedReturnTs = assignAssetForm.expectedReturnDate
        ? Timestamp.fromDate(new Date(assignAssetForm.expectedReturnDate))
        : null;
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
        expectedReturnDate: expectedReturnTs,
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
                expectedReturnDate: expectedReturnTs,
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

    const field = (label, value) => {
      if (value == null || value === '' || value === '—') return '';
      return `<div><div class="print-field-label">${e(label)}</div><div class="print-field-value">${e(String(value))}</div></div>`;
    };

    const section = (title, rowsHtml) => {
      if (!rowsHtml || !rowsHtml.trim()) return '';
      return `<div class="print-section"><div class="print-section-title">${e(title)}</div><div class="print-grid-2">${rowsHtml}</div></div>`;
    };

    const addrParts = [
      employee.streetAddress,
      employee.city,
      employee.state,
      employee.pincode,
      employee.country,
    ].filter(Boolean);
    const fullAddress = addrParts.length > 0 ? addrParts.join(', ') : employee.address || '';

    const ctcNum = employee.ctcPerAnnum ?? employee.ctc;
    const ctcVal = ctcNum != null && ctcNum !== '' ? `₹${Number(ctcNum).toLocaleString('en-IN')}` : '';
    const basicVal =
      employee.basicSalary != null && employee.basicSalary !== ''
        ? `₹${Number(employee.basicSalary).toLocaleString('en-IN')}/month`
        : '';
    const hraVal =
      employee.hra != null && employee.hra !== ''
        ? `₹${Number(employee.hra).toLocaleString('en-IN')}/month`
        : '';
    const incNum =
      employee.incentive != null && employee.incentive !== '' && !Number.isNaN(Number(employee.incentive))
        ? Number(employee.incentive)
        : null;
    const incentiveVal =
      incNum != null
        ? `₹${incNum.toLocaleString('en-IN')}/month · ₹${(incNum * 12).toLocaleString('en-IN')} p.a.`
        : '';

    const aadhaarDisp = employee.aadhaarNumber
      ? `XXXX XXXX ${String(employee.aadhaarNumber).slice(-4)}`
      : '';
    const pfDisplay = employee.pfApplicable
      ? employee.pfNumber
        ? `Applicable · ${employee.pfNumber}`
        : 'Applicable'
      : '';
    const esicDisplay = employee.esicApplicable
      ? employee.esicNumber
        ? `Applicable · ${employee.esicNumber}`
        : 'Applicable'
      : '';

    const weddingDate =
      employee.maritalStatus === 'Married' && employee.marriageDate
        ? toDisplayDate(employee.marriageDate)
        : '';

    const joiningDisplay = employee.joiningDate
      ? tenure
        ? `${toDisplayDate(employee.joiningDate)} · ${tenure} tenure`
        : toDisplayDate(employee.joiningDate)
      : '';

    const reportsToDisplay = employee.reportingManagerName
      ? employee.reportingManagerEmpId
        ? `${employee.reportingManagerName} (${employee.reportingManagerEmpId})`
        : employee.reportingManagerName
      : '';

    const disabilityDisplay =
      employee.disability && employee.disability !== 'None' ? employee.disability : '';

    const prevDurationStr =
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
    const prevDatesStr = [
      employee.prevFromDate && toDisplayDate(employee.prevFromDate),
      employee.prevToDate && toDisplayDate(employee.prevToDate),
    ]
      .filter(Boolean)
      .join(' — ');
    const prevDatesCombined = prevDatesStr
      ? prevDurationStr
        ? `${prevDatesStr} · ${prevDurationStr}`
        : prevDatesStr
      : '';

    const customBenefitsRows = (employee.customBenefits || [])
      .filter((b) => (b?.name || '').trim())
      .map((b) => {
        const combined = [b.value, b.notes].filter(Boolean).join(' · ');
        return field(b.name, combined);
      })
      .join('');

    const status = employee.status || 'Active';
    const statusClass =
      status === 'Active'
        ? 'print-badge-green'
        : status === 'Inactive'
          ? 'print-badge-red'
          : status === 'Notice Period' || status === 'Offboarding'
            ? 'print-badge-amber'
            : 'print-badge-teal';

    const printInitials =
      (employee.fullName || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase() || '?';
    const avatarHtml = employee.photoURL
      ? `<img src="${e(employee.photoURL)}" alt="${e(employee.fullName || '')}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid #9FE1CB;flex-shrink:0;" onerror="this.outerHTML='<div style=&quot;width:64px;height:64px;border-radius:50%;background:#E1F5EE;color:#0F6E56;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;border:2px solid #9FE1CB;flex-shrink:0;&quot;>${e(printInitials)}</div>'"/>`
      : `<div style="width:64px;height:64px;border-radius:50%;background:#E1F5EE;color:#0F6E56;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;border:2px solid #9FE1CB;flex-shrink:0;">${e(printInitials)}</div>`;

    const headerCard = `<div class="print-highlight-card" style="display:flex;align-items:center;gap:16px;">
      ${avatarHtml}
      <div style="flex:1;min-width:0;">
        <div style="font-size:20px;font-weight:700;color:#1B6B6B;line-height:1.2;margin-bottom:4px;">${e(employee.fullName || '—')}</div>
        <div style="font-size:13px;color:#4b5563;margin-bottom:8px;">${e(employee.designation || '')}${employee.department ? ` · ${e(employee.department)}` : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${employee.empId ? `<span style="font-size:11px;font-family:monospace;background:#F3F4F6;color:#4b5563;padding:3px 8px;border-radius:4px;">${e(employee.empId)}</span>` : ''}
          <span class="print-badge ${statusClass}">${e(status)}</span>
          ${tenure ? `<span style="font-size:11px;background:#F3F4F6;color:#4b5563;padding:3px 8px;border-radius:4px;">${e(tenure)} tenure</span>` : ''}
        </div>
      </div>
    </div>`;

    const statParts = [];
    if (employee.department) statParts.push({ label: 'Department', value: employee.department });
    if (employee.location || employee.branch) statParts.push({ label: 'Location', value: employee.location || employee.branch });
    if (employee.joiningDate) statParts.push({ label: 'Joined', value: toDisplayDate(employee.joiningDate) });
    if (employee.reportingManagerName) statParts.push({ label: 'Reports to', value: employee.reportingManagerName });
    const statStrip =
      statParts.length > 0
        ? `<div style="display:grid;grid-template-columns:repeat(${statParts.length},1fr);gap:12px;margin-bottom:20px;padding:12px 16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;">
        ${statParts
          .map(
            (s) =>
              `<div><div style="font-size:9px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">${e(s.label)}</div><div style="font-size:12px;color:#1f2937;font-weight:500;">${e(s.value)}</div></div>`,
          )
          .join('')}
      </div>`
        : '';

    const noticePrint =
      status === 'Notice Period' && employee.offboarding
        ? section(
            'Notice period',
            field('Notice (days)', employee.offboarding.noticePeriodDays ?? '') +
              field('Expected last day', toDisplayDate(employee.offboarding.expectedLastDay) || '') +
              field('Resignation date', toDisplayDate(employee.offboarding.resignationDate) || '') +
              field('Reason', employee.offboarding.reason || ''),
          )
        : '';

    const identitySection = section(
      'Identity',
      field('Full name', employee.fullName) +
        field('Emp ID', employee.empId) +
        field("Father's name", employee.fatherName) +
        field('Gender', employee.gender) +
        field('Date of birth', toDisplayDate(employee.dateOfBirth)) +
        field('Blood group', employee.bloodGroup) +
        field('Marital status', employee.maritalStatus) +
        field('Wedding date', weddingDate) +
        field('Disability', disabilityDisplay) +
        field('Qualification', employee.qualification),
    );

    const contactRows =
      field('Email', employee.email) +
      field('Phone', employee.phone) +
      field('Alternative mobile', employee.alternativeMobile) +
      (fullAddress
        ? `<div style="grid-column:1/-1"><div class="print-field-label">Address</div><div class="print-field-value">${e(fullAddress)}</div></div>`
        : '');
    const contactSection = contactRows.trim()
      ? `<div class="print-section"><div class="print-section-title">Contact</div><div class="print-grid-2">${contactRows}</div></div>`
      : '';

    const prevExpRows =
      field('Company', employee.prevCompany) +
      field('Designation', employee.prevDesignation) +
      (prevDatesCombined
        ? `<div style="grid-column:1/-1"><div class="print-field-label">Duration</div><div class="print-field-value">${e(prevDatesCombined)}</div></div>`
        : '') +
      field('Manager', employee.prevManagerName) +
      field('Manager phone', employee.prevManagerPhone) +
      (employee.prevManagerEmail
        ? `<div style="grid-column:1/-1"><div class="print-field-label">Manager email</div><div class="print-field-value">${e(employee.prevManagerEmail)}</div></div>`
        : '');
    const prevExpSection = prevExpRows.trim()
      ? `<div class="print-section"><div class="print-section-title">Previous experience</div><div class="print-grid-2">${prevExpRows}</div></div>`
      : '';

    const employmentSection = section(
      'Employment',
      field('Department', employee.department) +
        field('Designation', employee.designation) +
        field('Branch', employee.branch) +
        field('Location', employee.location) +
        field('Employment type', employee.employmentType) +
        field('Category', employee.category) +
        field('Joining date', joiningDisplay) +
        field('Reports to', reportsToDisplay),
    );

    const compensationSection = section(
      'Compensation & benefits',
      field('Annual gross salary', ctcVal) +
        field('Basic salary', basicVal) +
        field('HRA', hraVal) +
        field('Incentive', incentiveVal) +
        field('PF', pfDisplay) +
        field('ESIC', esicDisplay) +
        customBenefitsRows,
    );

    const bankSection = section(
      'Bank details',
      field('Bank name', employee.bankName) +
        field('Account holder', employee.accountHolderName) +
        field('IFSC code', employee.ifscCode) +
        field('Account type', employee.accountType),
    );

    const statutorySection = section(
      'Statutory & identity',
      field('PAN', employee.panNumber ? String(employee.panNumber).toUpperCase() : '') +
        field('Aadhaar', aadhaarDisp) +
        field('Driving licence', employee.drivingLicenceNumber),
    );

    const emergencySection = employee.emergencyContact?.name
      ? section(
          'Emergency contact',
          field('Name', employee.emergencyContact.name) +
            field('Relationship', employee.emergencyContact.relationship) +
            field('Phone', employee.emergencyContact.phone),
        )
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

    const content = `
      ${headerCard}
      ${statStrip}
      ${noticePrint}
      ${identitySection}
      ${contactSection}
      ${prevExpSection}
      ${employmentSection}
      ${compensationSection}
      ${bankSection}
      ${statutorySection}
      ${emergencySection}
      ${assetsBlock}
    `;

    const html = createPrintDocument({
      title: `${employee.fullName || 'Employee'} — Employee profile`,
      subtitle: `${employee.designation || ''}${employee.department ? ` · ${employee.department}` : ''}`,
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
      <div className="animate-pulse">

        {/* Header skeleton */}
        <div className="bg-white border-b border-gray-100 mb-4">
          {/* Top color bar */}
          <div className="h-1.5 bg-gray-200 w-full" />

          {/* Main header body */}
          <div className="p-5">
            <div className="flex items-start gap-4">

              {/* Avatar */}
              <div className="w-16 h-16 rounded-full bg-gray-200 flex-shrink-0" />

              {/* Name + badges */}
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-5 bg-gray-200 rounded w-48" />
                <div className="h-3 bg-gray-100 rounded w-64" />
                <div className="flex gap-2 mt-2">
                  <div className="h-5 bg-gray-100 rounded-full w-20" />
                  <div className="h-5 bg-gray-100 rounded-full w-28" />
                  <div className="h-5 bg-gray-100 rounded-full w-16" />
                </div>
              </div>

              {/* Edit button */}
              <div className="h-8 bg-gray-200 rounded-xl w-24 flex-shrink-0" />
            </div>
          </div>

          {/* Stats row */}
          <div className="border-t border-gray-100 grid grid-cols-5 divide-x divide-gray-100">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-3 space-y-1.5">
                <div className="h-2.5 bg-gray-100 rounded w-16" />
                <div className="h-3.5 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 px-5 py-2 border-t border-gray-100">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded-lg w-20" />
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="px-4 sm:px-6">
          <SkeletonTable rows={6} />
        </div>

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
    <div>
      <Link
        to={`/company/${companyId}/employees`}
        className="text-sm text-slate-600 hover:text-[#1B6B6B] active:text-[#155858] mb-4 inline-flex items-center min-h-[44px]"
      >
        ← Employees
      </Link>

      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden mb-6">
        <div className="h-0.5 w-full" style={{ background: sc.topBar }} />

        <div className="p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <div className="relative group flex-shrink-0" style={{ width: 72, height: 72 }}>
                <svg
                  width="72"
                  height="72"
                  viewBox="0 0 72 72"
                  className="absolute inset-0 -rotate-90 pointer-events-none"
                  aria-hidden
                >
                  <circle cx="36" cy="36" r="34" fill="none" stroke="#F1EFE8" strokeWidth="2" />
                  <circle
                    cx="36"
                    cy="36"
                    r="34"
                    fill="none"
                    stroke={sc.topBar}
                    strokeWidth="2"
                    strokeDasharray={`${(profileCompleteness.pct / 100) * 213.63} 213.63`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-1.5">
                {employee.photoURL ? (
                  <img
                    src={employee.photoURL}
                    alt={employee.fullName || 'Employee'}
                    loading="lazy"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center text-xl font-semibold"
                    style={{ background: sc.badgeBg, color: sc.badgeColor }}
                  >
                    {(employee.fullName || '')
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase() || '?'}
                  </div>
                )}
                </div>

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
                      <p className="text-white text-base leading-none">📷</p>
                      <p className="text-white text-[10px] font-medium mt-0.5">
                        {employee.photoURL ? 'Change' : 'Add'}
                      </p>
                    </div>
                  </div>
                )}

                {uploadingPhoto && (
                  <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}

                {canUploadPhoto && employee.photoURL && !uploadingPhoto && (
                  <button
                    type="button"
                    title="Remove photo"
                    onClick={() => setShowRemovePhotoConfirm(true)}
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center shadow-md hover:bg-red-600 transition-colors border-2 border-white z-10"
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

                {employee.status === 'Active' && !uploadingPhoto && (
                  <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white pointer-events-none" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="text-lg font-semibold text-gray-800 leading-tight truncate">
                    {employee.fullName || '—'}
                  </h1>
                  {employee.rehireCount > 0 && (
                    <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                      Rehired ×{employee.rehireCount}
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-500 mb-3">
                  {employee.designation || '—'}
                  {employee.department && (
                    <>
                      <span className="text-gray-300"> · </span>
                      {employee.department}
                    </>
                  )}
                </p>

                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ background: sc.badgeBg, color: sc.badgeColor }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: sc.dotColor }}
                    />
                    {employee.status || 'Active'}
                  </span>

                  {formattedJoiningDate && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full">
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <rect
                          x="1"
                          y="1"
                          width="9"
                          height="9"
                          rx="1.5"
                          stroke="currentColor"
                          strokeWidth="1.1"
                        />
                        <path
                          d="M3.5 1v1.5M7.5 1v1.5M1 4.5h9"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                        />
                      </svg>
                      Joined {formattedJoiningDate}
                    </span>
                  )}

                  {tenure && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full">
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <circle
                          cx="5.5"
                          cy="5.5"
                          r="4"
                          stroke="currentColor"
                          strokeWidth="1.1"
                        />
                        <path
                          d="M5.5 3v2.5l1.5 1"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                        />
                      </svg>
                      {tenure}
                    </span>
                  )}

                  {employee.empId && (
                    <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full font-mono">
                      {employee.empId}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {employee.phone && (
                    <a
                      href={`tel:${employee.phone}`}
                      className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-full transition-colors"
                      title="Call"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                      </svg>
                      Call
                    </a>
                  )}
                  {employee.email && (
                    <a
                      href={`mailto:${employee.email}`}
                      className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-full transition-colors"
                      title="Send email"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      Email
                    </a>
                  )}
                  {employee.phone && whatsappUrl(employee.phone, `Dear ${employee.fullName} Garu,\n\n`) && (
                    <a
                      href={whatsappUrl(employee.phone, `Dear ${employee.fullName} Garu,\n\n`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[#27500A] bg-[#EAF3DE] hover:bg-[#C0DD97] px-2.5 py-1 rounded-full transition-colors font-medium"
                      title="Open WhatsApp"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#25D366">
                        <path d="M17.5 14.4c-.3-.2-1.8-.9-2-1-.3-.1-.5-.2-.7.2s-.8 1-1 1.2c-.2.2-.4.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 00-8.5 15.3L2 22l4.8-1.4A10 10 0 1012 2z"/>
                      </svg>
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <div className="flex items-center gap-3 pr-3 border-r border-gray-100">
                <div className="text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-1">Profile</p>
                  <p className="text-lg font-semibold leading-none" style={{ color: sc.topBar }}>
                    {profileCompleteness.pct}%
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePrintProfile}
                title="Print profile"
                className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M3 5V2h8v3"
                    stroke="#6B7280"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <rect
                    x="1"
                    y="5"
                    width="12"
                    height="6"
                    rx="1"
                    stroke="#6B7280"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M3 8h8M3 11h4"
                    stroke="#6B7280"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {canEditEmployees && !isInactive && (
                <button
                  type="button"
                  onClick={openEdit}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 9l2-.5L10 3a1 1 0 00-1.5-1.5L2.5 7.5 2 9z"
                      stroke="#fff"
                      strokeWidth="1.1"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Edit profile
                </button>
              )}

              {isInactive && canEditEmployees && (
                <button
                  type="button"
                  onClick={() => setShowRehireModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  🔄 Rehire
                </button>
              )}
            </div>
          </div>

          {profileCompleteness.pct < 100 && canEditEmployees && !isInactive && profileCompleteness.missing.length > 0 && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#854F0B" strokeWidth="2" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span className="flex-1 truncate">
                Missing: {profileCompleteness.missing.slice(0, 4).join(' · ')}
                {profileCompleteness.missing.length > 4 && ` · +${profileCompleteness.missing.length - 4} more`}
              </span>
              <button
                type="button"
                onClick={openEdit}
                className="bg-[#854F0B] hover:bg-[#633806] text-white px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 transition-colors"
              >
                Complete now
              </button>
            </div>
          )}
        </div>

        {employee.status === 'Notice Period' && (
          <div className="px-5 py-2.5 bg-amber-50 border-t border-amber-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="#854F0B" strokeWidth="1.2" />
                <path
                  d="M6.5 4v3M6.5 9v.3"
                  stroke="#854F0B"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              Resignation recorded
              {formattedLastDay && (
                <span>
                  · Last working day{' '}
                  <span className="font-medium">{formattedLastDay}</span>
                </span>
              )}
            </div>
            {noticeDaysRemaining !== null && (
              <span className="text-xs font-medium text-amber-700">
                {noticeDaysRemaining === 0
                  ? 'Last day today'
                  : `${noticeDaysRemaining} day${noticeDaysRemaining !== 1 ? 's' : ''} remaining`}
              </span>
            )}
          </div>
        )}

        {employee.status === 'Offboarding' && (
          <div className="px-5 py-2.5 bg-red-50 border-t border-red-100 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-red-700">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5" stroke="#A32D2D" strokeWidth="1.2" />
                <path
                  d="M6.5 4v3M6.5 9v.3"
                  stroke="#A32D2D"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              Exit in progress
              {formattedLastDay && (
                <span>
                  · Exit date{' '}
                  <span className="font-medium">{formattedLastDay}</span>
                </span>
              )}
            </div>
            <span className="text-xs font-medium text-red-600">
              {offboardingTasksDone.done} of {offboardingTasksDone.total} tasks done
            </span>
          </div>
        )}

        <div className="border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 sm:divide-x sm:divide-y divide-gray-100">
          {[
            {
              label: 'Department',
              value: employee.department || '—',
            },
            {
              label: 'Location',
              value: employee.location || employee.branch || '—',
            },
            {
              label: 'Reporting to',
              value: employee.reportingManagerName || '—',
            },
            {
              label:
                employee.status === 'Notice Period'
                  ? 'Notice period'
                  : employee.status === 'Offboarding'
                    ? 'Exit tasks'
                    : 'Employment type',
              value:
                employee.status === 'Notice Period'
                  ? `${employee.offboarding?.noticePeriodDays ?? '—'} days`
                  : employee.status === 'Offboarding'
                    ? `${offboardingTasksDone.done} of ${offboardingTasksDone.total} done`
                    : employee.employmentType || 'Full-time',
              valueColor:
                employee.status === 'Notice Period'
                  ? '#854F0B'
                  : employee.status === 'Offboarding'
                    ? '#A32D2D'
                    : undefined,
            },
            {
              label: 'CTC per annum',
              value: formattedSalary,
              hidden: !canViewBankDetails,
            },
          ]
            .filter((s) => !s.hidden)
            .map((s) => (
              <div key={s.label} className="px-4 py-3">
                <p className="text-xs text-gray-400 mb-0.5">{s.label}</p>
                <p
                  className="text-sm font-medium text-gray-800 truncate"
                  style={s.valueColor ? { color: s.valueColor } : undefined}
                >
                  {s.value}
                </p>
              </div>
            ))}
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
      <PersonalTab
        employee={employee}
        canEditEmployees={canEditEmployees}
        canViewBankDetails={canViewBankDetails}
        isInactive={isInactive}
        showSalary={showSalary}
        setShowSalary={setShowSalary}
        openEdit={openEdit}
        tenure={tenure}
        formatLakhs={formatLakhs}
        toDisplayDate={toDisplayDate}
        toDateString={toDateString}
        getAge={getAge}
        navigate={navigate}
        companyId={companyId}
        company={company}
        userRole={userRole}
      />
      )}
      {tab === 'documents' && (
        <DocumentsTab
          activeChecklist={activeChecklist}
          docByType={docByType}
          categoryOpen={categoryOpen}
          setCategoryOpen={setCategoryOpen}
          mandatoryUploaded={mandatoryUploaded}
          totalMandatory={totalMandatory}
          documentCompletion={documentCompletion}
          progressColor={progressColor}
          showDocManageUi={showDocManageUi}
          isDriveConnected={isDriveConnected}
          hasDriveUploadRole={hasDriveUploadRole}
          isInactive={isInactive}
          uploadingDocId={uploadingDocId}
          replacingDocId={replacingDocId}
          deletingDocId={deletingDocId}
          deleteConfirm={deleteConfirm}
          setDeleteConfirm={setDeleteConfirm}
          handleUploadChecklistDoc={handleUploadChecklistDoc}
          handleReplaceDoc={handleReplaceDoc}
          handleDeleteChecklistDoc={handleDeleteChecklistDoc}
          handleViewDoc={handleViewDoc}
          formatDocDate={formatDocDate}
          formatFileSizeDetailed={formatFileSizeDetailed}
          getFileExt={getFileExt}
          getFileIconColor={getFileIconColor}
          getValidToken={getValidToken}
          success={success}
          showError={showError}
        />
      )}

      {tab === 'leave' && (
        <LeaveTab
          leaveList={leaveList}
          leaveError={leaveError}
          profilePaidLeaveTypes={profilePaidLeaveTypes}
          leaveUsedByTypeProfile={leaveUsedByTypeProfile}
          leavePolicy={leavePolicy}
          leaveTypePillClassResolved={leaveTypePillClassResolved}
          getMaxLeaveForProfileType={getMaxLeaveForProfileType}
          toDisplayDate={toDisplayDate}
        />
      )}

      {tab === 'timeline' && (
        <TimelineTab timelineEvents={timelineEvents} toDisplayDate={toDisplayDate} />
      )}

{showEditModal && form && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-2xl sm:my-8 flex flex-col max-h-[90vh] overflow-hidden">

            {/* ── Modal header ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#E1F5EE] flex items-center justify-center text-xs font-semibold text-[#0F6E56] flex-shrink-0">
                  {(employee?.fullName || '?').charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 leading-tight truncate">
                    {employee?.fullName || 'Edit Employee'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[employee?.empId, employee?.designation, employee?.branch].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowEditModal(false); setActiveEditTab('personal'); }}
                className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* ── Tab bar ── */}
            <div className="flex border-b border-gray-100 flex-shrink-0 overflow-x-auto scrollbar-none">
              {[
                { key: 'personal',      label: 'Personal',      icon: '👤' },
                { key: 'employment',    label: 'Employment',    icon: '💼' },
                { key: 'compensation',  label: 'Compensation',  icon: '₹' },
                { key: 'documents',     label: 'Documents',     icon: '🪪' },
                { key: 'emergency',     label: 'Emergency',     icon: '🆘' },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveEditTab(t.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors ${
                    activeEditTab === t.key
                      ? 'border-[#1B6B6B] text-[#1B6B6B]'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <span style={{ fontSize: '12px' }}>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Scrollable body ── */}
            <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-5">

                {/* ══════════════ PERSONAL TAB ══════════════ */}
                {activeEditTab === 'personal' && (
                  <div className="space-y-5">
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Identity</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs text-slate-600 mb-1">Full Name</label><input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" required /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Father&apos;s Name</label><input value={form.fatherName} onChange={(e) => setForm((p) => ({ ...p, fatherName: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" placeholder="Father's full name" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Date of Birth</label><input type="date" value={form.dateOfBirth} onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Gender</label><select value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Blood Group</label><select value={form.bloodGroup} onChange={(e) => setForm((p) => ({ ...p, bloodGroup: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">Select</option>{['A+','A-','B+','B-','O+','O-','AB+','AB-'].map((bg) => <option key={bg} value={bg}>{bg}</option>)}</select></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Marital Status</label><select value={form.maritalStatus} onChange={(e) => setForm((p) => ({ ...p, maritalStatus: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option><option value="Single">Single</option><option value="Married">Married</option><option value="Divorced">Divorced</option><option value="Widowed">Widowed</option></select></div>
                        {form.maritalStatus === 'Married' && (
                          <div><label className="block text-xs text-gray-500 mb-1">Marriage / Wedding Date</label><input type="date" value={form.marriageDate} onChange={(e) => setForm((p) => ({ ...p, marriageDate: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                        )}
                        <div><label className="block text-xs text-gray-500 mb-1">Disability</label><select value={form.disability} onChange={(e) => setForm((p) => ({ ...p, disability: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">None</option><option value="Visual Impairment">Visual Impairment</option><option value="Hearing Impairment">Hearing Impairment</option><option value="Physical Disability">Physical Disability</option><option value="Intellectual Disability">Intellectual Disability</option><option value="Other">Other</option></select></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Highest Qualification</label><select value={form.qualification} onChange={(e) => setForm((p) => ({ ...p, qualification: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option>{qualifications.map((q) => <option key={q} value={q}>{q}</option>)}{!qualifications.includes('Other') && <option value="Other">Other</option>}</select></div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Contact</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs text-slate-600 mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" required /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Phone</label><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Alternative Mobile</label><input type="tel" maxLength={10} placeholder="Alternative 10-digit number" value={form.alternativeMobile} onChange={(e) => setForm((p) => ({ ...p, alternativeMobile: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" /></div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Address</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Street Address</label><input value={form.streetAddress} onChange={(e) => setForm((p) => ({ ...p, streetAddress: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" placeholder="House/Flat no, Street name" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">City</label><input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" placeholder="City" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">State</label><select value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">Select state</option>{INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Pincode</label><input value={form.pincode} onChange={(e) => setForm((p) => ({ ...p, pincode: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" maxLength={6} placeholder="6-digit pincode" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Country</label><input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" placeholder="Country" /></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══════════════ EMPLOYMENT TAB ══════════════ */}
                {activeEditTab === 'employment' && (
                  <div className="space-y-5">
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Role & placement</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs text-slate-600 mb-1">Emp ID</label><input value={form.empId} onChange={(e) => setForm((p) => ({ ...p, empId: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#1B6B6B] focus:ring-1 focus:ring-[#1B6B6B]/20" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Joining Date</label><input type="date" value={form.joiningDate} onChange={(e) => setForm((p) => ({ ...p, joiningDate: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Department</label><select value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{!departments.includes('Other') && <option value="Other">Other</option>}</select></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Branch</label><select value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option>{branches.map((b) => <option key={b} value={b}>{b}</option>)}{!branches.includes('Other') && <option value="Other">Other</option>}</select></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Employment Type</label><select value={form.employmentType} onChange={(e) => setForm((p) => ({ ...p, employmentType: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option>{employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}{!employmentTypes.includes('Other') && <option value="Other">Other</option>}</select></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Category</label><select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}{!categories.includes('Other') && <option value="Other">Other</option>}</select></div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Location</p>
                      <div className="relative" ref={locationDropdownRef}>
                        <label className="block text-xs text-slate-600 mb-1">Location</label>
                        <div role="button" tabIndex={0} onClick={() => setShowLocationDropdown(true)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') setShowLocationDropdown(true); }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px] focus:outline-none focus:border-[#1B6B6B]">
                          {form.location ? <span>{form.location}</span> : <span className="text-gray-400">Select location...</span>}
                          <span className="text-gray-400 text-xs">▾</span>
                        </div>
                        {showLocationDropdown && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[60] max-h-52 overflow-hidden">
                            <div className="p-2 border-b border-gray-100">
                              <input autoFocus placeholder="Search location..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} className="w-full text-sm border rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#1B6B6B]" onClick={(e) => e.stopPropagation()} />
                            </div>
                            <div className="overflow-y-auto max-h-40">
                              {(company?.locations || []).filter((l) => !locationSearch || l.toLowerCase().includes(locationSearch.toLowerCase())).map((loc) => (
                                <div key={loc} role="button" tabIndex={0} onClick={() => { setForm((prev) => ({ ...prev, location: loc })); setShowLocationDropdown(false); setLocationSearch(''); }} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { setForm((prev) => ({ ...prev, location: loc })); setShowLocationDropdown(false); setLocationSearch(''); } }} className="px-3 py-2.5 hover:bg-[#E8F5F5] cursor-pointer text-sm border-b last:border-0">{loc}</div>
                              ))}
                              {(company?.locations || []).length === 0 && <div className="px-3 py-4 text-center text-sm text-gray-400">No locations configured.<br />Add in Settings → Manage Lists</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Designation & reporting</p>
                      <div className="space-y-3">
                        <div className="relative" ref={editRoleDropdownRef}>
                          <label className="block text-xs text-slate-600 mb-1">Designation</label>
                          <div role="button" tabIndex={0} onClick={() => setShowEditRoleDropdown(true)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') setShowEditRoleDropdown(true); }} className={`w-full border rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px] ${showEditRoleDropdown ? 'border-[#1B6B6B]' : 'border-gray-200'}`}>
                            {selectedEditRole ? (<div className="flex items-center gap-2 min-w-0 flex-1"><div className="min-w-0 text-left"><p className="text-sm font-medium text-gray-900">{selectedEditRole.title}</p><p className="text-xs text-gray-400 mt-0.5">{selectedEditRole.reportsTo ? `Reports to ${selectedEditRole.reportsTo}` : 'Top level'}{selectedEditRole.salaryBand?.min != null && selectedEditRole.salaryBand?.min !== '' && ` · ₹${formatLakhs(selectedEditRole.salaryBand.min)}–${formatLakhs(selectedEditRole.salaryBand.max)}/mo`}</p></div></div>) : form.designation ? (<span className="text-gray-800">{form.designation}</span>) : (<span className="text-gray-400">Search or select designation…</span>)}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {(selectedEditRole || form.designation) && (<button type="button" onClick={(e) => { e.stopPropagation(); setForm((prev) => ({ ...prev, designation: '', designationRoleId: '' })); }} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>)}
                              <span className="text-gray-400 text-xs">▾</span>
                            </div>
                          </div>
                          {showEditRoleDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[60] max-h-64 overflow-hidden">
                              <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                                <input autoFocus type="text" placeholder="Search by designation or reports-to…" value={editRoleSearch} onChange={(e) => setEditRoleSearch(e.target.value)} onClick={(e) => e.stopPropagation()} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#1B6B6B]" />
                              </div>
                              <div className="overflow-y-auto max-h-52">
                                {roles.length === 0 && <div className="px-3 py-4 text-center"><p className="text-sm text-slate-400 mb-2">No designations defined yet</p><p className="text-xs text-slate-400">Go to Library → Designations to add</p></div>}
                                {roles.length > 0 && editModalActiveRoles.length === 0 && <div className="px-3 py-4 text-center text-sm text-gray-400">No active designations.</div>}
                                {roles.length > 0 && editModalActiveRoles.length > 0 && (<>
                                  <div onMouseDown={(e) => { e.preventDefault(); setForm((prev) => ({ ...prev, designation: '', designationRoleId: '' })); setShowEditRoleDropdown(false); setEditRoleSearch(''); }} className="px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 cursor-pointer border-b border-gray-50">— Clear selection</div>
                                  {editModalFilteredRoles.map((role) => (
                                    <div key={role.id} role="button" tabIndex={0} onMouseDown={(e) => { e.preventDefault(); setForm((prev) => ({ ...prev, designation: role.title || '', designationRoleId: role.id })); setShowEditRoleDropdown(false); setEditRoleSearch(''); }} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { setForm((prev) => ({ ...prev, designation: role.title || '', designationRoleId: role.id })); setShowEditRoleDropdown(false); setEditRoleSearch(''); } }} className={`px-3 py-3 hover:bg-[#E8F5F5] cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${selectedEditRole?.id === role.id ? 'bg-[#E8F5F5]' : ''}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex-1 min-w-0 text-left"><p className="text-sm font-medium text-gray-900">{role.title}</p><p className="text-xs text-gray-400 mt-0.5">{role.reportsTo ? `Reports to ${role.reportsTo}` : 'Top level'}{role.salaryBand?.min != null && role.salaryBand?.min !== '' && ` · ₹${formatLakhs(role.salaryBand.min)}–${formatLakhs(role.salaryBand.max)}/mo`}</p></div>
                                        {selectedEditRole?.id === role.id && <span className="text-[#1B6B6B] flex-shrink-0">✓</span>}
                                      </div>
                                    </div>
                                  ))}
                                  {editModalFilteredRoles.length === 0 && <div className="px-3 py-4 text-center text-sm text-gray-400">No designations found.{editRoleSearch.trim() && (<button type="button" onMouseDown={(e) => { e.preventDefault(); setForm((prev) => ({ ...prev, designation: editRoleSearch.trim(), designationRoleId: '' })); setShowEditRoleDropdown(false); setEditRoleSearch(''); }} className="block mx-auto mt-2 text-xs text-[#1B6B6B] underline">Use &quot;{editRoleSearch.trim()}&quot; as designation</button>)}</div>}
                                </>)}
                              </div>
                            </div>
                          )}
                          {selectedEditRole?.salaryBand?.min != null && selectedEditRole.salaryBand.min !== '' && (<p className="text-xs text-gray-400 mt-1">Band: ₹{formatLakhs(Number(selectedEditRole.salaryBand.min))}/mo — ₹{formatLakhs(Number(selectedEditRole.salaryBand.max))}/mo</p>)}
                        </div>

                        <div>
                          <label className="block text-xs text-slate-600 mb-1">Reporting Manager</label>
                          <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                            <div role="button" tabIndex={0} onClick={() => setShowManagerDropdown(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowManagerDropdown(true); } }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:border-[#1B6B6B] min-h-[42px]">
                              {form.reportingManagerId ? (<div className="flex items-center gap-2 min-w-0"><div className="w-6 h-6 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B]">{form.reportingManagerName?.charAt(0)}</div><span className="text-slate-800 truncate">{form.reportingManagerName}</span><span className="text-xs text-slate-400 whitespace-nowrap">{form.reportingManagerEmpId}</span></div>) : (<span className="text-slate-400">Select reporting manager</span>)}
                              <div className="flex items-center gap-1">
                                {form.reportingManagerId && (<button type="button" onClick={(e) => { e.stopPropagation(); setForm((prev) => ({ ...prev, reportingManagerId: '', reportingManagerName: '', reportingManagerEmpId: '' })); }} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>)}
                                <span className="text-slate-400 text-xs">▾</span>
                              </div>
                            </div>
                            {showManagerDropdown && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-hidden">
                                <div className="p-2 border-b border-slate-100"><input autoFocus type="text" placeholder="Search by name or ID..." value={managerSearch} onChange={(e) => setManagerSearch(e.target.value)} className="w-full text-sm px-2 py-1.5 border rounded-lg focus:outline-none focus:border-[#1B6B6B]" onClick={(e) => e.stopPropagation()} /></div>
                                <div className="overflow-y-auto max-h-36">
                                  <div onClick={() => { setForm((prev) => ({ ...prev, reportingManagerId: '', reportingManagerName: '', reportingManagerEmpId: '' })); setShowManagerDropdown(false); setManagerSearch(''); }} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"><span className="text-sm text-slate-400">— None</span></div>
                                  {managerOptions.filter((emp) => { if (!managerSearch) return true; const term = managerSearch.toLowerCase(); return emp.fullName?.toLowerCase().includes(term) || emp.empId?.toLowerCase().includes(term) || emp.designation?.toLowerCase().includes(term); }).map((emp) => (
                                    <div key={emp.id} onClick={() => { setForm((prev) => ({ ...prev, reportingManagerId: emp.id, reportingManagerName: emp.fullName || '', reportingManagerEmpId: emp.empId || '' })); setShowManagerDropdown(false); setManagerSearch(''); }} className={`flex items-center gap-3 px-3 py-2 hover:bg-[#E8F5F5] cursor-pointer ${form.reportingManagerId === emp.id ? 'bg-[#E8F5F5]' : ''}`}>
                                      <div className="w-7 h-7 rounded-full bg-[#C5E8E8] flex items-center justify-center text-xs font-medium text-[#1B6B6B] flex-shrink-0">{emp.fullName?.charAt(0)}</div>
                                      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p><p className="text-xs text-slate-400">{emp.empId} · {emp.designation || '—'}</p></div>
                                      {form.reportingManagerId === emp.id && <span className="text-[#1B6B6B] text-xs">✓</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Previous experience</p>
                      <div className="space-y-3">
                        <div><label className="block text-xs text-slate-600 mb-1">Previous Company Name</label><input placeholder="e.g. Infosys Pvt Ltd" value={form.prevCompany} onChange={(e) => setForm((p) => ({ ...p, prevCompany: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Previous Designation</label><input placeholder="e.g. Software Engineer" value={form.prevDesignation} onChange={(e) => setForm((p) => ({ ...p, prevDesignation: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs text-gray-500 mb-1">From Date</label><input type="date" value={form.prevFromDate || ''} onChange={(e) => setForm((p) => ({ ...p, prevFromDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                          <div><label className="block text-xs text-gray-500 mb-1">To Date</label><input type="date" value={form.prevToDate || ''} onChange={(e) => setForm((p) => ({ ...p, prevToDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                        </div>
                        {form.prevFromDate && form.prevToDate && (
                          <div className="px-3 py-1.5 bg-[#E8F5F5] rounded-lg">
                            <p className="text-xs text-[#1B6B6B]">📅 Duration: {(() => { const from = new Date(form.prevFromDate); const to = new Date(form.prevToDate); const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()); const years = Math.floor(months / 12); const remainingMonths = months % 12; if (years === 0) return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`; if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`; return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`; })()}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs text-slate-600 mb-1">Previous Manager Name</label><input placeholder="Manager's full name" value={form.prevManagerName} onChange={(e) => setForm((p) => ({ ...p, prevManagerName: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                          <div><label className="block text-xs text-slate-600 mb-1">Previous Manager Phone</label><input type="tel" placeholder="Manager's phone number" value={form.prevManagerPhone} onChange={(e) => setForm((p) => ({ ...p, prevManagerPhone: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                        </div>
                        <div><label className="block text-xs text-slate-600 mb-1">Previous Manager Email</label><input type="email" placeholder="Manager's email address" value={form.prevManagerEmail} onChange={(e) => setForm((p) => ({ ...p, prevManagerEmail: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══════════════ COMPENSATION TAB ══════════════ */}
                {activeEditTab === 'compensation' && (
                  <div className="space-y-5">
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Salary</p>
                      {form.designation && editRoleSalaryBand && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl mb-4">
                          <p className="text-xs text-blue-700 font-medium">💼 Salary band for <strong>{form.designation}</strong>: ₹{formatLakhs(editRoleSalaryBand.min)}/mo — ₹{formatLakhs(editRoleSalaryBand.max)}/mo (₹{formatLakhs(editRoleSalaryBand.min * 12)}—₹{formatLakhs(editRoleSalaryBand.max * 12)} p.a.)</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1.5">Basic Salary (per month) ₹</label>
                          <input type="number" placeholder="0" value={form.basicSalary || ''} onChange={(e) => { const basic = Number(e.target.value); const hra = Number(form.hra) || 0; const incentive = Number(form.incentive) || 0; const annual = (basic + hra + incentive) * 12; setForm((prev) => ({ ...prev, basicSalary: e.target.value, ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum })); }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                          {form.basicSalary ? <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.basicSalary) * 12)} per annum</p> : null}
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1.5">HRA (per month) ₹</label>
                          <input type="number" placeholder="0" value={form.hra || ''} onChange={(e) => { const hra = Number(e.target.value); const basic = Number(form.basicSalary) || 0; const incentive = Number(form.incentive) || 0; const annual = (basic + hra + incentive) * 12; setForm((prev) => ({ ...prev, hra: e.target.value, ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum })); }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                          {form.hra ? <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.hra) * 12)} per annum</p> : null}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Incentive (per month)</label>
                          <input type="number" min="0" placeholder="0" value={form.incentive} onChange={(e) => { const incentive = Number(e.target.value); const basic = Number(form.basicSalary) || 0; const hra = Number(form.hra) || 0; const annual = (basic + hra + incentive) * 12; setForm((prev) => ({ ...prev, incentive: e.target.value, ctcPerAnnum: annual > 0 ? String(annual) : prev.ctcPerAnnum })); }} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                          {form.incentive !== '' && form.incentive != null && !Number.isNaN(Number(form.incentive)) && Number(form.incentive) !== 0 && <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.incentive) * 12)} per annum</p>}
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1.5">Annual Gross ₹ <span className="text-gray-300 font-normal">(auto-calc · editable)</span></label>
                          <input type="number" placeholder="Auto-calculated" value={form.ctcPerAnnum || ''} onChange={(e) => setForm((prev) => ({ ...prev, ctcPerAnnum: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                          {form.ctcPerAnnum ? <p className="text-xs text-gray-400 mt-1">= ₹{formatLakhs(Number(form.ctcPerAnnum) / 12)} per month</p> : null}
                          {form.ctcPerAnnum && editRoleSalaryBand && (<p className={`text-xs mt-1 font-medium ${Number(form.ctcPerAnnum) >= editRoleSalaryBand.min * 12 && Number(form.ctcPerAnnum) <= editRoleSalaryBand.max * 12 ? 'text-green-600' : 'text-amber-600'}`}>{Number(form.ctcPerAnnum) >= editRoleSalaryBand.min * 12 && Number(form.ctcPerAnnum) <= editRoleSalaryBand.max * 12 ? '✓ Within salary band' : '⚠ Outside salary band'}</p>)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Statutory benefits</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <div><p className="text-sm font-medium text-gray-700">Provident Fund (PF)</p><p className="text-xs text-gray-400">Statutory benefit</p></div>
                            <button type="button" onClick={() => setForm((prev) => ({ ...prev, pfApplicable: !prev.pfApplicable, pfNumber: prev.pfApplicable ? '' : prev.pfNumber }))} className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.pfApplicable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}><div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.pfApplicable ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
                          </div>
                          {form.pfApplicable && <input placeholder="PF Account Number" value={form.pfNumber} onChange={(e) => setForm((p) => ({ ...p, pfNumber: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" />}
                        </div>
                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <div><p className="text-sm font-medium text-gray-700">ESIC</p><p className="text-xs text-gray-400">Statutory benefit</p></div>
                            <button type="button" onClick={() => setForm((prev) => ({ ...prev, esicApplicable: !prev.esicApplicable, esicNumber: prev.esicApplicable ? '' : prev.esicNumber }))} className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.esicApplicable ? 'bg-[#1B6B6B]' : 'bg-gray-200'}`}><div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.esicApplicable ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
                          </div>
                          {form.esicApplicable && <input placeholder="ESIC Number" value={form.esicNumber} onChange={(e) => setForm((p) => ({ ...p, esicNumber: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mt-1 bg-white" />}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Additional benefits</p>
                        <button type="button" onClick={() => { const newBenefit = { id: `benefit_${Date.now()}`, name: '', value: '', notes: '' }; setForm((prev) => ({ ...prev, customBenefits: [...(prev.customBenefits || []), newBenefit] })); }} className="text-xs text-[#1B6B6B] hover:underline">+ Add benefit</button>
                      </div>
                      {(form.customBenefits || []).length === 0 && (
                        <button type="button" onClick={() => { setForm((prev) => ({ ...prev, customBenefits: [{ id: `benefit_${Date.now()}`, name: '', value: '', notes: '' }] })); }} className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors">+ Add benefit (Medical Insurance, Food Allowance, etc.)</button>
                      )}
                      <div className="space-y-2">
                        {(form.customBenefits || []).map((benefit, index) => (
                          <div key={benefit.id} className="p-3 border border-gray-100 rounded-xl bg-gray-50">
                            <div className="flex gap-2 mb-2">
                              <select value={!benefit.name ? '' : benefitTemplates.some((t) => t.name === benefit.name) ? benefit.name : '__custom__'} onChange={(e) => { const v = e.target.value; setForm((prev) => { const updated = [...(prev.customBenefits || [])]; const cur = updated[index]; updated[index] = { ...cur, name: v === '__custom__' ? '__custom__' : v, customName: v === '__custom__' ? cur.customName || '' : '' }; return { ...prev, customBenefits: updated }; }); }} className="flex-1 border rounded-lg px-3 py-2 text-sm bg-white"><option value="">Select benefit...</option>{benefitTemplates.map((bt) => <option key={bt.id} value={bt.name}>{bt.name}</option>)}<option value="__custom__">Other (type below)</option></select>
                              <button type="button" onClick={() => { setForm((prev) => ({ ...prev, customBenefits: (prev.customBenefits || []).filter((_, i) => i !== index) })); }} className="text-red-400 hover:text-red-600 px-2">✕</button>
                            </div>
                            {(benefit.name === '__custom__' || (benefit.name && !benefitTemplates.some((t) => t.name === benefit.name))) && (<input placeholder="Enter benefit name" value={benefit.name === '__custom__' ? benefit.customName || '' : benefit.name || ''} onChange={(e) => { setForm((prev) => { const updated = [...(prev.customBenefits || [])]; updated[index] = { ...updated[index], name: '__custom__', customName: e.target.value }; return { ...prev, customBenefits: updated }; }); }} className="w-full border rounded-lg px-3 py-2 text-sm mt-2 bg-white" />)}
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <input placeholder="Value (e.g. ₹5,00,000)" value={benefit.value} onChange={(e) => { setForm((prev) => { const updated = [...(prev.customBenefits || [])]; updated[index] = { ...updated[index], value: e.target.value }; return { ...prev, customBenefits: updated }; }); }} className="border rounded-lg px-3 py-2 text-sm bg-white" />
                              <input placeholder="Notes (e.g. Family floater)" value={benefit.notes} onChange={(e) => { setForm((prev) => { const updated = [...(prev.customBenefits || [])]; updated[index] = { ...updated[index], notes: e.target.value }; return { ...prev, customBenefits: updated }; }); }} className="border rounded-lg px-3 py-2 text-sm bg-white" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ══════════════ DOCUMENTS TAB ══════════════ */}
                {activeEditTab === 'documents' && (
                  <div className="space-y-5">
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Government IDs</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs text-slate-600 mb-1">PAN</label><input value={form.panNumber} onChange={(e) => setForm((p) => ({ ...p, panNumber: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Aadhaar</label><input value={form.aadhaarNumber} onChange={(e) => setForm((p) => ({ ...p, aadhaarNumber: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" placeholder="12-digit number" /></div>
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Driving Licence No.</label><input value={form.drivingLicenceNumber} onChange={(e) => setForm((p) => ({ ...p, drivingLicenceNumber: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" placeholder="e.g. MH0120210012345" /></div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Bank details</p>
                      <div className="space-y-3">
                        <div><label className="text-xs text-gray-500 block mb-1.5">Bank Name</label><input value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} placeholder="e.g. State Bank of India" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                        <div><label className="text-xs text-gray-500 block mb-1.5">Account Holder Name</label><input value={form.accountHolderName} onChange={(e) => setForm((p) => ({ ...p, accountHolderName: e.target.value }))} placeholder="As per bank records" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" /></div>
                        <div><label className="text-xs text-gray-500 block mb-1.5">IFSC Code</label><input value={form.ifscCode} onChange={(e) => setForm((p) => ({ ...p, ifscCode: e.target.value.toUpperCase().trim() }))} placeholder="e.g. SBIN0001234" maxLength={11} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:border-[#1B6B6B]" /></div>
                        <div><label className="text-xs text-gray-500 block mb-1.5">Account Type</label><select value={form.accountType} onChange={(e) => setForm((p) => ({ ...p, accountType: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">Select account type...</option><option value="Savings">Savings</option><option value="Current">Current</option><option value="Salary">Salary</option></select></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══════════════ EMERGENCY TAB ══════════════ */}
                {activeEditTab === 'emergency' && (
                  <div className="space-y-5">
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Emergency contact</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs text-slate-600 mb-1">Contact Name</label><input value={form.emergencyContactName} onChange={(e) => setForm((p) => ({ ...p, emergencyContactName: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" placeholder="Full name" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Relationship</label><select value={form.emergencyRelationship} onChange={(e) => setForm((p) => ({ ...p, emergencyRelationship: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]"><option value="">—</option><option value="Father">Father</option><option value="Mother">Mother</option><option value="Spouse">Spouse</option><option value="Sibling">Sibling</option><option value="Friend">Friend</option><option value="Other">Other</option></select></div>
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Contact Phone</label><input value={form.emergencyPhone} onChange={(e) => setForm((p) => ({ ...p, emergencyPhone: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-[#1B6B6B]" maxLength={10} placeholder="10-digit mobile number" /></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Modal footer ── */}
              <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setActiveEditTab('personal');
                    setShowLocationDropdown(false);
                    setLocationSearch('');
                    setEditRoleSearch('');
                    setShowEditRoleDropdown(false);
                  }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {tab === 'assets' && (
        <AssetsTab
          isInactive={isInactive}
          employeeAssets={employeeAssets}
          employeeConsumableCards={employeeConsumableCards}
          employeeAssetHistory={employeeAssetHistory}
          assetList={assetList}
          showAssetHistory={showAssetHistory}
          setShowAssetHistory={setShowAssetHistory}
          openProfileAssignModal={openProfileAssignModal}
          handleReturnAssetFromProfile={handleReturnAssetFromProfile}
          setReturnConsumableModal={setReturnConsumableModal}
          setReturnQty={setReturnQty}
          setReturnCondition={setReturnCondition}
          setReturnNotes={setReturnNotes}
          getAssetIcon={getAssetIcon}
          toDisplayDate={toDisplayDate}
          showError={showError}
        />
      )}

      {tab === 'onboarding' && (
        <OnboardingTab
          employee={employee}
          companyId={companyId}
          isInactive={isInactive}
          canEditEmployees={canEditEmployees}
          canStartOnboarding={canStartOnboarding}
          onboarding={onboarding}
          onboardingByCategory={onboardingByCategory}
          onboardingCompleted={onboardingCompleted}
          onboardingTotal={onboardingTotal}
          onboardingPct={onboardingPct}
          onboardingEverStarted={onboardingEverStarted}
          showOnboardingTaskList={showOnboardingTaskList}
          saving={saving}
          handleStartOnboarding={handleStartOnboarding}
          setCompletingTask={setCompletingTask}
          setTaskNotes={setTaskNotes}
          unmarkTask={unmarkTask}
          navigate={navigate}
          toDisplayDate={toDisplayDate}
          isOverdue={isOverdue}
          getCategoryIcon={getCategoryIcon}
          getAssignedLabel={getAssignedLabel}
        />
      )}
      {tab === 'offboarding' && (
        <OffboardingTab
          employee={employee}
          companyId={companyId}
          canEditEmployees={canEditEmployees}
          offboarding={offboarding}
          offPhase={offPhase}
          offByCategory={offByCategory}
          offPct={offPct}
          allOffboardingTasksDone={allOffboardingTasksDone}
          showOffboardingMainFlow={showOffboardingMainFlow}
          showOffboardingReadOnlyUi={showOffboardingReadOnlyUi}
          showNoticePeriodSection={showNoticePeriodSection}
          showExitTasksSection={showExitTasksSection}
          showStarterSection={showStarterSection}
          noticePeriodMetrics={noticePeriodMetrics}
          offExitRefForUi={offExitRefForUi}
          assignedAssetsForWarning={assignedAssetsForWarning}
          onboardingCompleteForOff={onboardingCompleteForOff}
          onboardingStartedForOff={onboardingStartedForOff}
          onboardingPctForOff={onboardingPctForOff}
          setTab={setTab}
          setShowWithdrawModal={setShowWithdrawModal}
          setShowBuyoutModal={setShowBuyoutModal}
          setShowExitTasksModal={setShowExitTasksModal}
          setShowCompleteOffboardingModal={setShowCompleteOffboardingModal}
          handleRecordResignationClick={handleRecordResignationClick}
          setCompletingOffTask={setCompletingOffTask}
          setOffTaskNotes={setOffTaskNotes}
          unmarkOffboardingTask={unmarkOffboardingTask}
          toDisplayDate={toDisplayDate}
          isOverdue={isOverdue}
          getOffCategoryIcon={getOffCategoryIcon}
          getAssignedLabel={getAssignedLabel}
          navigate={navigate}
        />
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
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm max-h-[90vh] overflow-y-auto">
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
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm shadow-xl max-h-[90vh] overflow-y-auto">
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
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
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
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-md sm:my-8 max-h-[92vh] flex flex-col overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Assign asset</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {profileAssignMode === 'trackable' ? 'Assign a unique tracked item' : 'Issue from consumable stock'}
                </p>
              </div>
              <button type="button" onClick={() => { setShowProfileAssignModal(null); setShowProfileAssetDropdown(false); setProfileAssetSearch(''); setIssueConsumableAsset(null); setProfileAssignMode('trackable'); }} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 text-sm">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Employee context */}
              <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-8 h-8 rounded-full bg-[#E1F5EE] flex items-center justify-center text-[#0F6E56] text-xs font-semibold flex-shrink-0">
                  {employee.fullName?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{employee.fullName}</p>
                  <p className="text-xs text-gray-400">{employee.empId} · {employee.designation || employee.department || ''}</p>
                </div>
              </div>

              {/* Mode picker */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Asset mode</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { mode: 'trackable', label: 'Trackable', desc: 'One item, one person', icon: '💻', activeBg: '#E1F5EE', activeBorder: '#1B6B6B', activeText: '#0F6E56' },
                    { mode: 'consumable', label: 'Consumable', desc: 'Issue from stock', icon: '📦', activeBg: '#EAF3DE', activeBorder: '#639922', activeText: '#27500A' },
                  ].map(({ mode, label, desc, icon, activeBg, activeBorder, activeText }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setProfileAssignMode(mode); setAssignAssetForm((p) => ({ ...p, assetId: '' })); setIssueConsumableAsset(null); setShowProfileAssetDropdown(false); setProfileAssetSearch(''); }}
                      className="text-left p-3 rounded-xl border-2 transition-all"
                      style={{ borderColor: profileAssignMode === mode ? activeBorder : '#E5E7EB', background: profileAssignMode === mode ? activeBg : '#FAFAFA' }}
                    >
                      <span className="text-lg block mb-1">{icon}</span>
                      <p className="text-xs font-semibold" style={{ color: profileAssignMode === mode ? activeText : '#374151' }}>{label}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* TRACKABLE FLOW */}
              {profileAssignMode === 'trackable' && (
                <form onSubmit={handleSaveAssignFromProfile} id="profile-assign-form" className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Select asset</p>
                    <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowProfileAssetDropdown(true)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowProfileAssetDropdown(true); }}
                        className="w-full border-2 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between min-h-[42px] transition-colors"
                        style={{ borderColor: assignAssetForm.assetId ? '#1B6B6B' : '#E5E7EB', background: assignAssetForm.assetId ? '#E1F5EE' : 'white' }}
                      >
                        {assignAssetForm.assetId ? (
                          (() => {
                            const sel = assetList.find((x) => x.id === assignAssetForm.assetId);
                            return sel ? (
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-[#9FE1CB] text-[#1B6B6B] shrink-0">{sel.assetId}</span>
                                <span className="truncate text-[#0F6E56] font-medium">{sel.name}</span>
                                {sel.condition && <span className="text-[10px] text-[#1B6B6B] bg-white px-1.5 py-0.5 rounded-full border border-[#9FE1CB] shrink-0">{sel.condition}</span>}
                              </div>
                            ) : <span className="text-gray-400">Select asset…</span>;
                          })()
                        ) : (
                          <span className="text-gray-400 text-sm">Search or select an asset…</span>
                        )}
                        <span className="text-gray-400 text-xs shrink-0 ml-2">▾</span>
                      </div>
                      {showProfileAssetDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[60] overflow-hidden">
                          <div className="p-2 border-b border-gray-100">
                            <input
                              autoFocus
                              placeholder="Search by name or asset ID…"
                              value={profileAssetSearch}
                              onChange={(e) => setProfileAssetSearch(e.target.value)}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#1B6B6B]"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="overflow-y-auto max-h-44">
                            {assetList
                              .filter((a) => (a.mode || 'trackable') === 'trackable' && ((a.status || 'Available') === 'Available' || !a.status))
                              .filter((a) => !profileAssetSearch || (a.name || '').toLowerCase().includes(profileAssetSearch.toLowerCase()) || (a.assetId || '').toLowerCase().includes(profileAssetSearch.toLowerCase()))
                              .map((asset) => (
                                <div
                                  key={asset.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => { setAssignAssetForm((prev) => ({ ...prev, assetId: asset.id })); setShowProfileAssetDropdown(false); setProfileAssetSearch(''); }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { setAssignAssetForm((prev) => ({ ...prev, assetId: asset.id })); setShowProfileAssetDropdown(false); setProfileAssetSearch(''); }}}
                                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 hover:bg-[#E8F5F5] transition-colors ${assignAssetForm.assetId === asset.id ? 'bg-[#E1F5EE]' : ''}`}
                                >
                                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 shrink-0">{asset.assetId}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate text-gray-800">{asset.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{asset.type}{asset.brand ? ` · ${asset.brand}` : ''}{asset.condition ? ` · ${asset.condition}` : ''}</p>
                                  </div>
                                  {assignAssetForm.assetId === asset.id && <span className="text-[#1B6B6B] text-sm shrink-0">✓</span>}
                                </div>
                              ))}
                            {assetList.filter((a) => (a.mode || 'trackable') === 'trackable' && ((a.status || 'Available') === 'Available' || !a.status)).length === 0 && (
                              <p className="text-center py-4 text-sm text-gray-400">No available trackable assets</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Issue date</label>
                      <input type="date" name="issueDate" value={assignAssetForm.issueDate} onChange={handleAssignAssetChange} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Expected return <span className="text-gray-300 font-normal">optional</span></label>
                      <input type="date" name="expectedReturnDate" value={assignAssetForm.expectedReturnDate || ''} onChange={handleAssignAssetChange} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Condition at issue</label>
                    <div className="flex gap-2 flex-wrap">
                      {['New', 'Good', 'Fair', 'Poor', 'Damaged'].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setAssignAssetForm((p) => ({ ...p, condition: c }))}
                          className="text-xs px-3 py-1.5 rounded-full border transition-colors"
                          style={{
                            borderColor: assignAssetForm.condition === c ? '#1B6B6B' : '#E5E7EB',
                            background: assignAssetForm.condition === c ? '#1B6B6B' : 'transparent',
                            color: assignAssetForm.condition === c ? 'white' : '#6B7280',
                          }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes <span className="text-gray-300 font-normal">optional</span></label>
                    <textarea name="notes" value={assignAssetForm.notes} onChange={handleAssignAssetChange} rows={2} placeholder="Any special instructions…" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]" />
                  </div>
                </form>
              )}

              {/* CONSUMABLE FLOW */}
              {profileAssignMode === 'consumable' && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-gray-500">Available consumables</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {assetList.filter((a) => (a.mode || 'trackable') === 'consumable' && Number(a.availableStock) > 0).length === 0 && (
                      <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <p className="text-sm text-gray-400">No consumables available in stock</p>
                      </div>
                    )}
                    {assetList
                      .filter((a) => (a.mode || 'trackable') === 'consumable' && Number(a.availableStock) > 0)
                      .map((a) => (
                        <div
                          key={a.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => { setIssueConsumableAsset(a); setIssueConsumableForm((p) => ({ ...p, quantity: 1, issueDate: p.issueDate || new Date().toISOString().slice(0, 10), condition: 'Good', notes: '' })); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { setIssueConsumableAsset(a); } }}
                          className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all"
                          style={{ borderColor: issueConsumableAsset?.id === a.id ? '#639922' : '#E5E7EB', background: issueConsumableAsset?.id === a.id ? '#EAF3DE' : 'white' }}
                        >
                          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center text-lg flex-shrink-0">📦</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{a.name}</p>
                            <p className="text-xs text-gray-400">{a.type} · {a.availableStock} available</p>
                          </div>
                          {issueConsumableAsset?.id === a.id && <span className="text-green-700 text-sm shrink-0">✓</span>}
                        </div>
                      ))}
                  </div>

                  {issueConsumableAsset && (
                    <form onSubmit={handleIssueConsumableFromProfile} id="profile-assign-form" className="space-y-3 pt-2 border-t border-gray-100">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">Quantity</label>
                          <input type="number" min={1} max={Number(issueConsumableAsset.availableStock) || 0} value={issueConsumableForm.quantity} onChange={(e) => setIssueConsumableForm((p) => ({ ...p, quantity: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                          <p className="text-[10px] text-gray-400 mt-1">Max: {issueConsumableAsset.availableStock}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1.5">Issue date</label>
                          <input type="date" value={issueConsumableForm.issueDate} onChange={(e) => setIssueConsumableForm((p) => ({ ...p, issueDate: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1B6B6B]" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes <span className="text-gray-300 font-normal">optional</span></label>
                        <textarea value={issueConsumableForm.notes} onChange={(e) => setIssueConsumableForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Any instructions…" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]" />
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
              <button type="button" onClick={() => { setShowProfileAssignModal(null); setShowProfileAssetDropdown(false); setProfileAssetSearch(''); setIssueConsumableAsset(null); setProfileAssignMode('trackable'); }} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                type="submit"
                form="profile-assign-form"
                disabled={saving || (profileAssignMode === 'trackable' ? !assignAssetForm.assetId : !issueConsumableAsset)}
                className="flex-2 flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-medium hover:bg-[#155858] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving…' : profileAssignMode === 'trackable' ? 'Assign asset' : 'Issue consumable'}
              </button>
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
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[60] sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm text-center shadow-xl max-h-[90vh] overflow-y-auto">
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
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-[70] sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-xs text-center shadow-xl max-h-[90vh] overflow-y-auto">
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
