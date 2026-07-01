import { toJSDate, toDateString } from '../utils';
import { PLATFORM_CONFIG } from '../config/constants';

export const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal', 'Other'];
export const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
export const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
export const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
export const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];

export const EMPTY_EMPLOYEE_FILTERS = {
  department: '',
  branch: '',
  location: '',
  employmentType: '',
  category: '',
  designation: '',
  gender: '',
  bloodGroup: '',
  reportingManager: '',
  joinYearFrom: '',
  joinYearTo: '',
  maritalStatus: '',
  disability: '',
  pfApplicable: '',
  esicApplicable: '',
};

export const FILTER_LABELS = {
  department: 'Department',
  branch: 'Branch',
  location: 'Location',
  employmentType: 'Employment Type',
  category: 'Category',
  designation: 'Designation',
  gender: 'Gender',
  bloodGroup: 'Blood Group',
  reportingManager: 'Reporting Manager',
  joinYearFrom: 'Joined from',
  joinYearTo: 'Joined to',
  maritalStatus: 'Marital Status',
  disability: 'Disability',
  pfApplicable: 'PF',
  esicApplicable: 'ESIC',
};

export const FETCH_PAGE_SIZE = PLATFORM_CONFIG.EMPLOYEES_PAGE_SIZE;
export const TABLE_PAGE_SIZE = 25;

export const STATUS_BORDER_COLOR = {
  'Notice Period': '#FBBF24',
  Offboarding: '#F87171',
  Inactive: '#D1D5DB',
};

export const STATUS_BADGE_CONFIG = {
  Active: { dot: '#16A34A', bg: 'bg-green-50', text: 'text-green-700' },
  'Notice Period': { dot: '#EF9F27', bg: 'bg-amber-50', text: 'text-amber-700' },
  Offboarding: { dot: '#E24B4A', bg: 'bg-red-50', text: 'text-red-600' },
  Inactive: { dot: '#9CA3AF', bg: 'bg-gray-100', text: 'text-gray-500' },
  'On Leave': { dot: '#3B82F6', bg: 'bg-blue-50', text: 'text-blue-600' },
};

export const ADD_STEPS = [
  {
    id: 0,
    label: 'Personal',
    sub: 'Name, contact, address',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M2 12c0-2.761 2.239-5 5-5s5 2.239 5 5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 1,
    label: 'Employment',
    sub: 'Role, department, salary',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="4" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5 4V3a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 2,
    label: 'Bank & ID',
    sub: 'Bank details, PAN, Aadhaar',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M1 6h12" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="4" cy="9" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 3,
    label: 'Emergency',
    sub: 'Emergency contact',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path
          d="M7 2l1.5 3 3.5.5-2.5 2.5.5 3.5L7 10l-3 1.5.5-3.5L2 5.5l3.5-.5z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

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

export const initialForm = {
  fullName: '',
  email: '',
  phone: '',
  alternativeMobile: '',
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  maritalStatus: '',
  marriageDate: '',
  disability: '',
  fatherName: '',
  streetAddress: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  qualification: '',
  empId: '',
  department: '',
  branch: '',
  location: '',
  designation: '',
  designationRoleId: '',
  employmentType: 'Full-time',
  category: '',
  joiningDate: toDateString(new Date()),
  reportingManagerId: '',
  reportingManagerName: '',
  reportingManagerEmpId: '',
  prevCompany: '',
  prevDesignation: '',
  prevFromDate: '',
  prevToDate: '',
  prevManagerName: '',
  prevManagerPhone: '',
  prevManagerEmail: '',
  ctcPerAnnum: '',
  incentive: '',
  basicSalary: '',
  hra: '',
  pfApplicable: false,
  esicApplicable: false,
  pfNumber: '',
  esicNumber: '',
  customBenefits: [],
  bankName: '',
  accountHolderName: '',
  ifscCode: '',
  accountType: '',
  panNumber: '',
  aadhaarNumber: '',
  drivingLicenceNumber: '',
  emergencyContactName: '',
  emergencyRelationship: '',
  emergencyPhone: '',
};

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
        else reject(new Error('Canvas to blob failed'));
      },
      'image/jpeg',
      0.9,
    );
  });
}

export function noticePeriodDaysRemaining(emp) {
  if ((emp.status || '') !== 'Notice Period') return '';
  const end = toJSDate(emp.offboarding?.expectedLastDay);
  if (!end || Number.isNaN(end.getTime())) return '';
  const diff = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return String(Math.max(0, diff));
}

export function countStatsFromEmployees(list) {
  const next = {
    active: 0,
    onLeave: 0,
    inactive: 0,
    noticePeriod: 0,
    offboarding: 0,
  };
  for (const e of list) {
    const s = (e.status || 'Active');
    if (s === 'Active') next.active += 1;
    else if (s === 'On Leave') next.onLeave += 1;
    else if (s === 'Inactive') next.inactive += 1;
    else if (s === 'Notice Period') next.noticePeriod += 1;
    else if (s === 'Offboarding') next.offboarding += 1;
  }
  return next;
}

export function getRowTintClass(status) {
  switch (status) {
    case 'Notice Period':
      return 'bg-amber-50/30';
    case 'Offboarding':
      return 'bg-red-50/20';
    case 'Inactive':
      return 'opacity-60';
    default:
      return '';
  }
}

export function getCardTopBorderClass(status) {
  switch (status) {
    case 'Notice Period':
      return 'border-t-[3px] border-t-amber-400';
    case 'Offboarding':
      return 'border-t-[3px] border-t-red-400';
    case 'Inactive':
      return 'border-t-[3px] border-t-gray-300';
    default:
      return 'border-t-[3px] border-t-transparent';
  }
}

export const getDeptColor = (dept) => {
  const colors = {
    Engineering: '#3B82F6',
    HR: '#10B981',
    Sales: '#F59E0B',
    Finance: '#6366F1',
    Operations: '#EC4899',
    Marketing: '#14B8A6',
    Design: '#8B5CF6',
    Legal: '#64748B',
  };
  return colors[dept] || '#9CA3AF';
};

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

export function customBenefitsExportText(emp) {
  const list = Array.isArray(emp.customBenefits) ? emp.customBenefits : [];
  return list
    .map((b) => [b?.name, b?.value, b?.notes].filter(Boolean).join(' · '))
    .filter(Boolean)
    .join('; ');
}

export function getEmployeeJoinYear(emp) {
  const d = toJSDate(emp?.joiningDate);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

export function countOverdueOffboardingTasks(emp) {
  const tasks = Array.isArray(emp.offboarding?.tasks) ? emp.offboarding.tasks : [];
  if (tasks.length === 0) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return tasks.filter((t) => {
    if (t.completed) return false;
    const due = toJSDate(t.dueDate);
    if (!due || Number.isNaN(due.getTime())) return false;
    due.setHours(0, 0, 0, 0);
    return due < today;
  }).length;
}
