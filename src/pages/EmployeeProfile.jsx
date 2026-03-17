import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  DOCUMENT_CHECKLIST,
  DOCUMENT_CATEGORIES,
  getDocById,
  acceptsFile,
} from '../utils/documentTypes';
import { uploadEmployeeDocument, deleteFileFromDrive } from '../utils/googleDrive';
import { toDisplayDate, toJSDate, toDateString } from '../utils';

const DEPT_COLOR = {
  Engineering: '#378ADD',
  HR: '#1D9E75',
  Sales: '#D97706',
  Finance: '#0D9488',
  Operations: '#534AB7',
};
const DEFAULT_DEPT_COLOR = '#64748b';

const DEFAULT_DEPARTMENTS = ['Engineering', 'Sales', 'HR', 'Finance', 'Operations', 'Marketing', 'Design', 'Legal', 'Other'];
const DEFAULT_DESIGNATIONS = ['Director', 'General Manager', 'Manager', 'Assistant Manager', 'Team Lead', 'Senior Executive', 'Executive', 'Junior Executive', 'Intern', 'Other'];
const DEFAULT_EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Probation', 'Consultant'];
const DEFAULT_BRANCHES = ['Head Office', 'Branch 1'];
const DEFAULT_QUALIFICATIONS = ['10th Pass', '12th Pass', 'Diploma', 'Graduate (B.A./B.Com/B.Sc)', 'Graduate (B.E./B.Tech)', 'Post Graduate (M.A./M.Com/M.Sc)', 'Post Graduate (M.E./M.Tech/MBA)', 'Doctorate (PhD)', 'Other'];
const DEFAULT_CATEGORIES = ['Permanent', 'Trainee', 'Contractual', 'Part-time', 'Probationary', 'Seasonal', 'Other'];

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

const LEAVE_TYPE_STYLE = { CL: 'bg-blue-100 text-blue-800', SL: 'bg-red-100 text-red-800', EL: 'bg-green-100 text-green-800' };
const STATUS_STYLE = { Pending: 'bg-amber-100 text-amber-800', Approved: 'bg-green-100 text-green-800', Rejected: 'bg-red-100 text-red-800' };

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

export default function EmployeeProfile() {
  const { companyId, empId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser, googleAccessToken, signOut } = useAuth();
  const { success, error: showError } = useToast();
  const [employee, setEmployee] = useState(null);
  const [company, setCompany] = useState(null);
  const [allEmployees, setAllEmployees] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('personal');
  const [showSalary, setShowSalary] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [categoryOpen, setCategoryOpen] = useState({});
  const [uploadingDocId, setUploadingDocId] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [replacingDocId, setReplacingDocId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [additionalDocName, setAdditionalDocName] = useState('');
  const [additionalDocCategory, setAdditionalDocCategory] = useState(DOCUMENT_CATEGORIES[0]);
  const [additionalDocFile, setAdditionalDocFile] = useState(null);
  const additionalFileInputRef = useRef(null);
  const [managerSearch, setManagerSearch] = useState('');
  const [showManagerDropdown, setShowManagerDropdown] = useState(false);

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

  const deptColor = employee ? (DEPT_COLOR[employee.department] || DEFAULT_DEPT_COLOR) : DEFAULT_DEPT_COLOR;
  const departments = company?.departments?.length ? company.departments : DEFAULT_DEPARTMENTS;
  const designations = company?.designations?.length ? company.designations : DEFAULT_DESIGNATIONS;
  const employmentTypes = company?.employmentTypes?.length ? company.employmentTypes : DEFAULT_EMPLOYMENT_TYPES;
  const branches = company?.branches?.length ? company.branches : DEFAULT_BRANCHES;
  const qualifications = company?.qualifications?.length ? company.qualifications : DEFAULT_QUALIFICATIONS;
  const categories = company?.categories?.length ? company.categories : DEFAULT_CATEGORIES;

  const empRef = companyId && empId ? doc(db, 'companies', companyId, 'employees', empId) : null;

  useEffect(() => {
    if (!companyId || !empId) return;
    const load = async () => {
      setLoading(true);
      try {
        const empSnap = await getDoc(doc(db, 'companies', companyId, 'employees', empId));
        if (empSnap.exists()) setEmployee({ id: empSnap.id, ...empSnap.data() });
        else setEmployee(null);
        try {
          const leaveSnap = await getDocs(
            query(collection(db, 'companies', companyId, 'leave'), where('employeeId', '==', empId)),
          );
          const list = leaveSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) => {
            const ta = a.appliedAt?.toMillis?.() ?? (a.appliedAt ? new Date(a.appliedAt).getTime() : 0);
            const tb = b.appliedAt?.toMillis?.() ?? (b.appliedAt ? new Date(b.appliedAt).getTime() : 0);
            return tb - ta;
          });
          setLeaveList(list);
        } catch (leaveErr) {
          console.warn('Leave history could not be loaded:', leaveErr);
          setLeaveList([]);
        }
      } catch (err) {
        console.error('EmployeeProfile load error:', err);
        showError('Failed to load profile');
      }
      setLoading(false);
    };
    load();
  }, [companyId, empId, showError]);

  useEffect(() => {
    if (!companyId) return;
    const fetchEmployees = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'employees'));
        setAllEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.warn('Could not load employees list:', e);
        setAllEmployees([]);
      }
    };
    fetchEmployees();
  }, [companyId]);

  // Real-time company listener for documentTypes and other fields
  useEffect(() => {
    if (!companyId) return;
    const unsub = onSnapshot(doc(db, 'companies', companyId), (snap) => {
      if (snap.exists()) {
        setCompany({ id: snap.id, ...snap.data() });
      }
    });
    return () => unsub();
  }, [companyId]);

  useEffect(() => {
    if (searchParams.get('tab') === 'documents') setTab('documents');
  }, [searchParams]);

  const leavePolicy = company?.leavePolicy || { cl: 12, sl: 12, el: 15 };
  const clUsed = leaveList.filter((l) => l.status === 'Approved' && (l.leaveType || '') === 'CL').reduce((s, l) => s + (l.days || 0), 0);
  const slUsed = leaveList.filter((l) => l.status === 'Approved' && (l.leaveType || '') === 'SL').reduce((s, l) => s + (l.days || 0), 0);
  const elUsed = leaveList.filter((l) => l.status === 'Approved' && (l.leaveType || '') === 'EL').reduce((s, l) => s + (l.days || 0), 0);

  const timeline = useMemo(() => {
    if (!employee) return [];
    const events = [];
    if (employee.joiningDate) {
      events.push({ date: employee.joiningDate, type: 'joined', text: 'Joined the company' });
    }
    leaveList.forEach((l) => {
      const typeLabel = l.leaveType === 'CL' ? 'Casual Leave' : l.leaveType === 'SL' ? 'Sick Leave' : 'Earned Leave';
      const days = l.days || 0;
      if (l.status === 'Approved') events.push({ date: l.decidedAt || l.appliedAt, type: 'leave_approved', text: `Leave approved — ${typeLabel} ${days} day(s)` });
      if (l.status === 'Rejected') events.push({ date: l.decidedAt || l.appliedAt, type: 'leave_rejected', text: `Leave rejected — ${typeLabel} ${days} day(s)` });
    });
    events.sort((a, b) => {
      const ta = a.date?.toMillis?.() ?? (typeof a.date === 'string' ? new Date(a.date).getTime() : 0);
      const tb = b.date?.toMillis?.() ?? (typeof b.date === 'string' ? new Date(b.date).getTime() : 0);
      return tb - ta;
    });
    return events;
  }, [employee, leaveList]);

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

  const isChecklistDoc = (uploadedDoc) =>
    activeChecklist.some((cat) => (cat.documents || []).some((d) => d.id === uploadedDoc?.id));

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

  const additionalDocs = useMemo(() => {
    const docs = employee?.documents || [];
    // Only show docs that are truly not part of the current checklist
    return docs.filter((d) => !isChecklistDoc(d));
  }, [employee?.documents, activeChecklist]);
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
      dateOfBirth: toDateString(employee.dateOfBirth),
      gender: employee.gender || '',
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
      designation: employee.designation || '',
      employmentType: employee.employmentType || 'Full-time',
      category: employee.category || '',
      joiningDate: toDateString(employee.joiningDate),
      reportingManagerId: employee.reportingManagerId || '',
      reportingManagerName: employee.reportingManagerName || '',
      reportingManagerEmpId: employee.reportingManagerEmpId || '',
      ctcPerAnnum: employee.ctcPerAnnum ?? employee.ctc ?? '',
      basicSalary: employee.basicSalary ?? '',
      hra: employee.hra ?? '',
      pfNumber: employee.pfNumber || '',
      esicNumber: employee.esicNumber || '',
      panNumber: employee.panNumber || '',
      aadhaarNumber: employee.aadhaarNumber || '',
      drivingLicenceNumber: employee.drivingLicenceNumber || '',
      emergencyContactName: employee.emergencyContact?.name || '',
      emergencyRelationship: employee.emergencyContact?.relationship || '',
      emergencyPhone: employee.emergencyContact?.phone || '',
      emergencyEmail: employee.emergencyContact?.email || '',
      emergencyAddress: employee.emergencyContact?.address || '',
    });
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
      const payload = {
        fullName: form.fullName?.trim(),
        email: form.email?.trim(),
        phone: form.phone?.trim(),
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        fatherName: form.fatherName?.trim() || null,
        streetAddress: form.streetAddress?.trim() || null,
        city: form.city?.trim() || null,
        state: form.state || null,
        pincode: form.pincode?.trim() || null,
        country: form.country?.trim() || 'India',
        empId: form.empId || null,
        department: form.department || null,
        branch: form.branch || null,
        designation: form.designation || null,
        employmentType: form.employmentType || 'Full-time',
        category: form.category || null,
        qualification: form.qualification || null,
        joiningDate: form.joiningDate || null,
        reportingManagerId: form.reportingManagerId || null,
        reportingManagerName: form.reportingManagerName || null,
        reportingManagerEmpId: form.reportingManagerEmpId || null,
        ctcPerAnnum: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        ctc: form.ctcPerAnnum ? Number(form.ctcPerAnnum) : null,
        basicSalary: form.basicSalary ? Number(form.basicSalary) : null,
        hra: form.hra ? Number(form.hra) : null,
        pfNumber: form.pfNumber || null,
        esicNumber: form.esicNumber || null,
        panNumber: form.panNumber?.replace(/\s/g, '') || null,
        aadhaarNumber: form.aadhaarNumber?.replace(/\s/g, '') || null,
        drivingLicenceNumber: form.drivingLicenceNumber?.trim() || null,
        emergencyContact: {
          name: form.emergencyContactName?.trim() || '',
          relationship: form.emergencyRelationship || '',
          phone: form.emergencyPhone?.trim() || '',
          email: form.emergencyEmail?.trim() || '',
          address: form.emergencyAddress?.trim() || '',
        },
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), payload);
      setEmployee((prev) => (prev ? { ...prev, ...payload } : null));
      setShowEditModal(false);
      setShowManagerDropdown(false);
      setManagerSearch('');
      success('Employee updated');
    } catch (err) {
      showError('Failed to update');
    }
    setSaving(false);
  };

  const handleDeactivate = async () => {
    if (!employee) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), { status: 'Inactive', updatedAt: serverTimestamp() });
      setEmployee((prev) => (prev ? { ...prev, status: 'Inactive' } : null));
      setDeactivateConfirm(false);
      success('Employee deactivated');
    } catch (err) {
      showError('Failed to deactivate');
    }
    setSaving(false);
  };

  const getCompanyName = () => company?.name || 'Company';

  const driveAccessError = (err) => {
    const msg = err?.message || 'Upload failed';
    showError(msg);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate('/login');
    }
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

  const handleUploadChecklistDoc = async (file, docId, docName, categoryName) => {
    if (!employee) return;
    if (!googleAccessToken) {
      showError('Please sign out and sign back in to enable Google Drive uploads');
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
      const finalCategoryName = categoryFromChecklist || 'Additional Documents';
      const result = await uploadEmployeeDocument(
        googleAccessToken,
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
    if (!googleAccessToken) {
      showError('Please sign out and sign back in to enable Google Drive uploads');
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
        await deleteFileFromDrive(googleAccessToken, docEntry.fileId);
      } catch (_) {
        // ignore Drive delete failure
      }
      const result = await uploadEmployeeDocument(
        googleAccessToken,
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
    if (!googleAccessToken) {
      showError('Please sign out and sign back in to manage documents');
      return;
    }
    let driveFailed = false;
    setDeletingDocId(docEntry.fileId);
    try {
      try {
        await deleteFileFromDrive(googleAccessToken, docEntry.fileId);
      } catch (_) {
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

  const handleUploadAdditionalDoc = async () => {
    if (!additionalDocName.trim() || !additionalDocFile) {
      showError('Name and file required');
      return;
    }
    if (!googleAccessToken) {
      showError('Please sign out and sign back in to enable Google Drive uploads');
      return;
    }
    try {
      validateFile(additionalDocFile, {
        name: additionalDocName.trim(),
        accepts: ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx'],
        maxSizeMB: 25,
      });
    } catch (error) {
      showError(error.message);
      return;
    }
    setUploadingDocId('additional');
    try {
      const result = await uploadEmployeeDocument(
        googleAccessToken,
        additionalDocFile,
        getCompanyName(),
        employee.empId,
        employee.fullName,
        additionalDocCategory,
      );
      const entry = {
        id: `additional_${Date.now()}`,
        name: additionalDocName.trim(),
        category: additionalDocCategory,
        fileName: result.fileName,
        fileId: result.fileId,
        webViewLink: result.webViewLink,
        uploadedAt: new Date(),
        uploadedBy: currentUser?.email || null,
        fileSize: result.fileSize,
      };
      const nextDocs = [...(employee.documents || []), entry];
      await updateDoc(doc(db, 'companies', companyId, 'employees', empId), { documents: nextDocs, updatedAt: serverTimestamp() });
      setEmployee((prev) => (prev ? { ...prev, documents: nextDocs } : null));
      success('Document uploaded');
      setAdditionalDocName('');
      setAdditionalDocCategory(DOCUMENT_CATEGORIES[0]);
      setAdditionalDocFile(null);
      if (additionalFileInputRef.current) additionalFileInputRef.current.value = '';
    } catch (err) {
      driveAccessError(err);
    }
    setUploadingDocId(null);
  };

  const handleDeleteAdditionalDoc = async (index) => {
    const docEntry = additionalDocs[index];
    if (!docEntry?.fileId) return;
    if (!googleAccessToken) {
      showError('Please sign out and sign back in to manage documents');
      return;
    }
    setDeletingDocId(docEntry.fileId);
    try {
      try {
        await deleteFileFromDrive(googleAccessToken, docEntry.fileId);
      } catch (_) {
        // ignore Drive delete error
      }
      if (empRef) {
        await updateDoc(empRef, {
          documents: arrayRemove(docEntry),
          updatedAt: serverTimestamp(),
        });
        await refreshEmployee();
      }
      success('Document deleted');
    } catch (err) {
      driveAccessError(err);
    }
    setDeletingDocId(null);
    setDeleteConfirm(null);
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
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'bg-blue-500';
    if (['xls', 'xlsx'].includes(ext)) return 'bg-green-600';
    if (['doc', 'docx'].includes(ext)) return 'bg-blue-700';
    return 'bg-gray-500';
  };

  const handlePrintProfile = () => {
    const companyName = getCompanyName() || '';
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Employee Profile - ${employee.fullName || ''}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 40px; color: #1f2937; }
        .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb; }
        .avatar { width: 64px; height: 64px; border-radius: 50%; background: #3B82F6; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; font-weight: bold; }
        .name { font-size: 24px; font-weight: bold; }
        .subtitle { color: #6B7280; font-size: 14px; margin-top: 4px; }
        .company { font-size: 13px; color: #374151; margin-top: 2px; }
        .section { margin-bottom: 24px; }
        .section-title { font-size: 13px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .field-label { font-size: 11px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.05em; }
        .field-value { font-size: 13px; color: #1f2937; margin-top: 2px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
        .badge-active { background: #D1FAE5; color: #065F46; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9CA3AF; display: flex; justify-content: space-between; }
        @media print { body { padding: 20px; } .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="avatar">
          ${(employee.fullName || 'E').charAt(0)}
        </div>
        <div>
          <div class="name">
            ${employee.fullName || ''}
          </div>
          <div class="subtitle">
            ${employee.designation || ''} · ${employee.department || ''}
          </div>
          <div class="company">
            ${companyName} · ${employee.empId || ''}
          </div>
        </div>
        <div style="margin-left: auto;">
          <span class="badge badge-active">
            ${employee.status || 'Active'}
          </span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Personal Information</div>
        <div class="grid">
          <div>
            <div class="field-label">Full Name</div>
            <div class="field-value">${employee.fullName || '—'}</div>
          </div>
          <div>
            <div class="field-label">Father's Name</div>
            <div class="field-value">${employee.fatherName || '—'}</div>
          </div>
          <div>
            <div class="field-label">Email</div>
            <div class="field-value">${employee.email || '—'}</div>
          </div>
          <div>
            <div class="field-label">Phone</div>
            <div class="field-value">${employee.phone || '—'}</div>
          </div>
          <div>
            <div class="field-label">Date of Birth</div>
            <div class="field-value">${toDisplayDate(employee.dateOfBirth) || '—'}</div>
          </div>
          <div>
            <div class="field-label">Gender</div>
            <div class="field-value">${employee.gender || '—'}</div>
          </div>
          <div>
            <div class="field-label">Address</div>
            <div class="field-value">
              ${
                [
                  employee.streetAddress,
                  employee.city,
                  employee.state,
                  employee.pincode,
                  employee.country,
                ]
                  .filter(Boolean)
                  .join(', ') || employee.address || '—'
              }
            </div>
          </div>
          <div>
            <div class="field-label">Qualification</div>
            <div class="field-value">${employee.qualification || '—'}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Employment Details</div>
        <div class="grid">
          <div>
            <div class="field-label">Emp ID</div>
            <div class="field-value">${employee.empId || '—'}</div>
          </div>
          <div>
            <div class="field-label">Department</div>
            <div class="field-value">${employee.department || '—'}</div>
          </div>
          <div>
            <div class="field-label">Designation</div>
            <div class="field-value">${employee.designation || '—'}</div>
          </div>
          <div>
            <div class="field-label">Branch</div>
            <div class="field-value">${employee.branch || '—'}</div>
          </div>
          <div>
            <div class="field-label">Employment Type</div>
            <div class="field-value">${employee.employmentType || '—'}</div>
          </div>
          <div>
            <div class="field-label">Category</div>
            <div class="field-value">${employee.category || '—'}</div>
          </div>
          <div>
            <div class="field-label">Joining Date</div>
            <div class="field-value">${toDisplayDate(employee.joiningDate) || '—'}</div>
          </div>
          <div>
            <div class="field-label">Reporting Manager</div>
            <div class="field-value">${employee.reportingManagerName || '—'}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Compensation</div>
        <div class="grid">
          <div>
            <div class="field-label">CTC per Annum</div>
            <div class="field-value">
              ${
                employee.ctcPerAnnum != null || employee.ctc != null
                  ? `₹${(employee.ctcPerAnnum ?? employee.ctc).toLocaleString('en-IN')}`
                  : '—'
              }
            </div>
          </div>
          <div>
            <div class="field-label">Basic Salary</div>
            <div class="field-value">
              ${
                employee.basicSalary != null
                  ? `₹${employee.basicSalary.toLocaleString('en-IN')}/month`
                  : '—'
              }
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Statutory</div>
        <div class="grid">
          <div>
            <div class="field-label">PAN Number</div>
            <div class="field-value">${employee.panNumber || '—'}</div>
          </div>
          <div>
            <div class="field-label">PF Number</div>
            <div class="field-value">${employee.pfNumber || '—'}</div>
          </div>
          <div>
            <div class="field-label">ESIC Number</div>
            <div class="field-value">${employee.esicNumber || '—'}</div>
          </div>
          <div>
            <div class="field-label">Aadhaar</div>
            <div class="field-value">
              ${
                employee.aadhaarNumber
                  ? `XXXX XXXX ${employee.aadhaarNumber.slice(-4)}`
                  : '—'
              }
            </div>
          </div>
          <div>
            <div class="field-label">Driving Licence</div>
            <div class="field-value">${employee.drivingLicenceNumber || '—'}</div>
          </div>
        </div>
      </div>

      ${
        employee.emergencyContact?.name
          ? `
      <div class="section">
        <div class="section-title">Emergency Contact</div>
        <div class="grid">
          <div>
            <div class="field-label">Name</div>
            <div class="field-value">${employee.emergencyContact.name}</div>
          </div>
          <div>
            <div class="field-label">Relationship</div>
            <div class="field-value">${employee.emergencyContact.relationship || '—'}</div>
          </div>
          <div>
            <div class="field-label">Phone</div>
            <div class="field-value">${employee.emergencyContact.phone}</div>
          </div>
          <div>
            <div class="field-label">Email</div>
            <div class="field-value">${employee.emergencyContact.email || '—'}</div>
          </div>
        </div>
      </div>`
          : ''
      }

      <div class="footer">
        <span>Generated by AttendX HR Platform</span>
        <span>${new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}</span>
      </div>
    </body>
    </html>
    `;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#378ADD] border-t-transparent" />
      </div>
    );
  }
  if (!employee) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Employee not found.</p>
        <Link to={`/company/${companyId}/employees`} className="text-[#378ADD] text-sm mt-2 inline-block">← Employees</Link>
      </div>
    );
  }

  const tabs = [
    { id: 'personal', label: 'Personal Info' },
    { id: 'documents', label: 'Documents' },
    { id: 'leave', label: 'Leave History' },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className="p-8">
      <Link to={`/company/${companyId}/employees`} className="text-sm text-slate-600 hover:text-[#378ADD] mb-4 inline-block">← Employees</Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex flex-wrap items-start gap-6">
          <div className="h-14 w-14 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0" style={{ backgroundColor: deptColor }}>
            {(employee.fullName || '?').slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800">{employee.fullName || '—'}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{employee.designation || '—'}</span>
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{employee.department || '—'}</span>
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">{employee.employmentType || 'Full-time'}</span>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  employee.status === 'Active' ? 'bg-green-100 text-green-800' : employee.status === 'On Leave' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {employee.status || 'Active'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Joined {toDisplayDate(employee.joiningDate)}
              <span className="mx-2 text-gray-300">·</span>
              <span className="text-blue-600 font-medium">
                {getTenure(employee.joiningDate)}
              </span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openEdit}
              className="rounded-lg bg-[#378ADD] hover:bg-[#2a7bc7] text-white text-sm font-medium px-4 py-2"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handlePrintProfile}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 10H1.5A1.5 1.5 0 0 1 0 8.5v-3A1.5 1.5 0 0 1 1.5 4H3M11 10h1.5A1.5 1.5 0 0 0 14 8.5v-3A1.5 1.5 0 0 0 12.5 4H11M3 4V1.5A1.5 1.5 0 0 1 4.5 0h5A1.5 1.5 0 0 1 11 1.5V4M3 10v2.5A1.5 1.5 0 0 0 4.5 14h5a1.5 1.5 0 0 0 1.5-1.5V10M3 10h8"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              Print
            </button>
            {(employee.status || 'Active') === 'Active' && (
              <button
                type="button"
                onClick={() => setDeactivateConfirm(true)}
                className="rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium px-4 py-2"
              >
                Deactivate
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 mb-6">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium rounded-t-lg ${tab === t.id ? 'bg-white border border-slate-200 border-b-white -mb-px text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'personal' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p><span className="text-slate-500 text-sm">Full Name</span><br />{employee.fullName || '—'}</p>
              <p><span className="text-slate-500 text-sm">Father&apos;s Name</span><br />{employee.fatherName || '—'}</p>
              <p><span className="text-slate-500 text-sm">Email</span><br />{employee.email || '—'}</p>
              <p><span className="text-slate-500 text-sm">Phone</span><br />{employee.phone || '—'}</p>
              <p><span className="text-slate-500 text-sm">Date of Birth</span><br />{employee.dateOfBirth ? `${toDisplayDate(employee.dateOfBirth)}${getAge(employee.dateOfBirth) != null ? ` (${getAge(employee.dateOfBirth)} years old)` : ''}` : '—'}</p>
              <p><span className="text-slate-500 text-sm">Gender</span><br />{employee.gender || '—'}</p>
              <p><span className="text-slate-500 text-sm">Highest Qualification</span><br />{employee.qualification || '—'}</p>
              <p>
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
                  <><br />{employee.address || '—'}</>
                )}
              </p>
            </div>
            <div className="space-y-3">
              <p><span className="text-slate-500 text-sm">Emp ID</span><br />{employee.empId || '—'}</p>
              <p><span className="text-slate-500 text-sm">Department</span><br />{employee.department || '—'}</p>
              <p><span className="text-slate-500 text-sm">Branch</span><br />{employee.branch || '—'}</p>
              <p><span className="text-slate-500 text-sm">Designation</span><br />{employee.designation || '—'}</p>
              <p><span className="text-slate-500 text-sm">Employment Type</span><br />{employee.employmentType || '—'}</p>
              <p><span className="text-slate-500 text-sm">Category</span><br />{employee.category || '—'}</p>
              <p>
                <span className="text-slate-500 text-sm">Reporting Manager</span>
                <br />
                {employee.reportingManagerId ? (
                  <div
                    onClick={() => navigate(`/company/${companyId}/employees/${employee.reportingManagerId}`)}
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 group mt-1"
                  >
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 group-hover:bg-blue-200 transition-colors">
                      {employee.reportingManagerName?.charAt(0)}
                    </div>
                    <div>
                      <span className="text-sm text-blue-600 font-medium group-hover:underline">
                        {employee.reportingManagerName}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">
                        ({employee.reportingManagerEmpId})
                      </span>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-blue-400 group-hover:text-blue-600">
                      <path d="M2 10L10 2M10 2H4M10 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </p>
              <p><span className="text-slate-500 text-sm">Joining Date</span><br />{toDisplayDate(employee.joiningDate)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-medium text-slate-800 mb-3">Compensation</h3>
            {!showSalary ? (
              <div className="flex items-center gap-3">
                <span className="text-slate-400 select-none">₹ ••••••••</span>
                <button type="button" onClick={() => setShowSalary(true)} className="text-sm text-[#378ADD] hover:underline">Show</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <p>CTC per annum: ₹{(employee.ctcPerAnnum ?? employee.ctc ?? 0).toLocaleString('en-IN')}</p>
                <p>Basic Salary: ₹{(employee.basicSalary ?? 0).toLocaleString('en-IN')}/month</p>
                <p>HRA: ₹{(employee.hra ?? 0).toLocaleString('en-IN')}/month</p>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="font-medium text-slate-800 mb-3">Statutory</h3>
            <p className="text-sm">PAN: {employee.panNumber || '—'}</p>
            <p className="text-sm">Aadhaar: {employee.aadhaarNumber ? `XXXX XXXX ${employee.aadhaarNumber.slice(-4)}` : '—'}</p>
            <p className="text-sm">PF Number: {employee.pfNumber || '—'}</p>
            <p className="text-sm">ESIC Number: {employee.esicNumber || '—'}</p>
            <div className="mt-3">
              <p className="text-xs text-gray-400">
                Driving Licence No.
              </p>
              <p className="text-sm text-gray-800">
                {employee.drivingLicenceNumber || '—'}
              </p>
            </div>
          </div>
          <div className="bg-white border rounded-xl p-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Emergency Contact</h3>
            {employee.emergencyContact?.name ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div>
                  <p className="text-xs text-gray-400">Email</p>
                  <p className="text-sm text-gray-800">
                    {employee.emergencyContact.email || '—'}
                  </p>
                </div>
                {employee.emergencyContact.address && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-400">Address</p>
                    <p className="text-sm text-gray-800">
                      {employee.emergencyContact.address}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No emergency contact added</p>
            )}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-6">
          {!googleAccessToken && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <span className="text-amber-600 text-sm">
                Google Drive session expired. Please sign out and sign back in to upload documents.
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 whitespace-nowrap"
              >
                Sign out &amp; back in
              </button>
            </div>
          )}

          {uploadingDocId && (
            <div className="rounded-xl border border-[#378ADD] bg-[#378ADD]/10 p-3 text-sm text-[#378ADD] font-medium flex items-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#378ADD] border-t-transparent" />
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
                        <li key={doc.id} className="px-4">
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
                                    className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                                  >
                                    View
                                  </button>
                                )}
                                <label className={`${rowBusy ? 'pointer-events-none opacity-50' : ''}`}>
                                  <span className="px-2.5 py-1 text-xs font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors inline-block cursor-pointer">
                                    Replace
                                  </span>
                                  <input
                                    type="file"
                                    className="hidden"
                                    accept={acceptAttr}
                                    disabled={rowBusy}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleReplaceDoc(f, doc.id);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirm({ type: 'checklist', doc: uploaded })}
                                  disabled={rowBusy}
                                  className="px-2.5 py-1 text-xs font-medium text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between py-3 border-b last:border-0">
                              <div className="flex items-center gap-3">
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
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const input = document.getElementById(`doc-upload-${doc.id}`);
                                    if (input) input.click();
                                  }}
                                  disabled={uploadingDocId === doc.id}
                                  className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                  {uploadingDocId === doc.id ? 'Uploading...' : 'Upload'}
                                </button>
                                <input
                                  id={`doc-upload-${doc.id}`}
                                  type="file"
                                  className="hidden"
                                  accept={acceptAttr}
                                  disabled={!!uploadingDocId}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadChecklistDoc(f, doc.id, doc.name, cat.category);
                                    e.target.value = '';
                                  }}
                                />
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

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <h3 className="px-4 py-3 bg-slate-50 font-medium text-slate-800">Additional Documents</h3>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <input
                  type="text"
                  value={additionalDocName}
                  onChange={(e) => setAdditionalDocName(e.target.value)}
                  placeholder="Document name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48"
                />
                <select value={additionalDocCategory} onChange={(e) => setAdditionalDocCategory(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  ref={additionalFileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => setAdditionalDocFile(e.target.files?.[0] || null)}
                />
                <button type="button" onClick={() => additionalFileInputRef.current?.click()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                  {additionalDocFile ? additionalDocFile.name : 'Choose file'}
                </button>
                <button
                  type="button"
                  onClick={handleUploadAdditionalDoc}
                  disabled={uploadingDocId === 'additional' || !additionalDocName.trim() || !additionalDocFile}
                  className="rounded-lg bg-[#378ADD] text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
                >
                  {uploadingDocId === 'additional' ? 'Uploading…' : 'Upload Additional Document'}
                </button>
              </div>
              {additionalDocs.length === 0 ? (
                <p className="text-slate-500 text-sm">No additional documents</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {additionalDocs.map((doc, i) => (
                    <li key={doc.fileId || i} className="flex items-center justify-between py-2">
                      <span className="text-sm">{doc.name} — {formatDocDate(doc.uploadedAt)}</span>
                      <div className="flex gap-2">
                        {doc.webViewLink && <a href={doc.webViewLink} target="_blank" rel="noopener noreferrer" className="text-[#378ADD] text-xs">View</a>}
                        <button type="button" onClick={() => setDeleteConfirm({ type: 'additional', index: i })} className="text-red-600 text-xs">Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  Delete {deleteConfirm.type === 'checklist' ? deleteConfirm.doc.name : 'document'}?
                </h3>
                <p className="text-sm text-slate-600 mb-4">File will be removed from Google Drive.</p>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setDeleteConfirm(null)} className="text-slate-500 text-sm">Cancel</button>
                    <button
                      type="button"
                      onClick={() => deleteConfirm.type === 'checklist' ? handleDeleteChecklistDoc(deleteConfirm.doc) : handleDeleteAdditionalDoc(deleteConfirm.index)}
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
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-slate-500 text-sm">CL</p>
              <p className="font-semibold text-slate-800">{clUsed} / {leavePolicy.cl ?? 12}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-slate-500 text-sm">SL</p>
              <p className="font-semibold text-slate-800">{slUsed} / {leavePolicy.sl ?? 12}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-slate-500 text-sm">EL</p>
              <p className="font-semibold text-slate-800">{elUsed} / {leavePolicy.el ?? 15}</p>
            </div>
          </div>
          {leaveList.length === 0 ? (
            <p className="text-slate-500 py-8 text-center">No leave records found.</p>
          ) : (
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
                      <td className="px-4 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LEAVE_TYPE_STYLE[l.leaveType] || 'bg-slate-100'}`}>{l.leaveType}</span></td>
                      <td className="px-4 py-2">{l.startDate}</td>
                      <td className="px-4 py-2">{l.endDate}</td>
                      <td className="px-4 py-2">{l.days}</td>
                      <td className="px-4 py-2">{l.reason || '—'}</td>
                      <td className="px-4 py-2"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] || 'bg-slate-100'}`}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="space-y-3">
          {timeline.length === 0 ? (
            <p className="text-slate-500">No timeline events yet.</p>
          ) : (
            timeline.map((ev, i) => (
              <div key={i} className="flex gap-3 items-start">
                <span className="text-slate-400 text-sm shrink-0">{toDisplayDate(ev.date)}</span>
                <span className="text-slate-700">{ev.text}</span>
              </div>
            ))
          )}
        </div>
      )}

      {showEditModal && form && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Edit Employee</h2>
                    <form onSubmit={handleSaveEdit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs text-slate-600 mb-1">Full Name</label><input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" required /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" required /></div>
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Father&apos;s Name</label><input value={form.fatherName} onChange={(e) => setForm((p) => ({ ...p, fatherName: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Father's full name" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Phone</label><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">DOB</label><input type="date" value={form.dateOfBirth} onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Gender</label><select value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
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
                <div><label className="block text-xs text-slate-600 mb-1">Emp ID</label><input value={form.empId} onChange={(e) => setForm((p) => ({ ...p, empId: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Department</label><select value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}{!departments.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Branch</label><select value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{branches.map((b) => <option key={b} value={b}>{b}</option>)}{!branches.includes('Other') && <option value="Other">Other</option>}</select></div>
                <div><label className="block text-xs text-slate-600 mb-1">Designation</label><select value={form.designation} onChange={(e) => setForm((p) => ({ ...p, designation: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm"><option value="">—</option>{designations.map((d) => <option key={d} value={d}>{d}</option>)}{!designations.includes('Other') && <option value="Other">Other</option>}</select></div>
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
                      className="w-full border rounded-lg px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:border-[#378ADD]"
                    >
                      {form.reportingManagerId ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
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
                            className="w-full text-sm px-2 py-1.5 border rounded focus:outline-none focus:border-[#378ADD]"
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

                          {allEmployees
                            .filter((emp) => {
                              if (employee?.empId && emp.empId === employee.empId) return false;
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
                                className={`flex items-center gap-3 px-3 py-2 hover:bg-blue-50 cursor-pointer ${
                                  form.reportingManagerId === emp.id ? 'bg-blue-50' : ''
                                }`}
                              >
                                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 flex-shrink-0">
                                  {emp.fullName?.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">{emp.fullName}</p>
                                  <p className="text-xs text-slate-400">{emp.empId} · {emp.designation || '—'}</p>
                                </div>
                                {form.reportingManagerId === emp.id && (
                                  <span className="text-[#378ADD] text-xs">✓</span>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div><label className="block text-xs text-slate-600 mb-1">CTC</label><input type="number" value={form.ctcPerAnnum} onChange={(e) => setForm((p) => ({ ...p, ctcPerAnnum: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">Basic Salary</label><input type="number" value={form.basicSalary} onChange={(e) => setForm((p) => ({ ...p, basicSalary: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">HRA</label><input type="number" value={form.hra} onChange={(e) => setForm((p) => ({ ...p, hra: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">PAN</label><input value={form.panNumber} onChange={(e) => setForm((p) => ({ ...p, panNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Aadhaar</label><input value={form.aadhaarNumber} onChange={(e) => setForm((p) => ({ ...p, aadhaarNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="12-digit number" /></div>
                        <div><label className="block text-xs text-slate-600 mb-1">Driving Licence No.</label><input value={form.drivingLicenceNumber} onChange={(e) => setForm((p) => ({ ...p, drivingLicenceNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="e.g. MH0120210012345" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">PF Number</label><input value={form.pfNumber} onChange={(e) => setForm((p) => ({ ...p, pfNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs text-slate-600 mb-1">ESIC Number</label><input value={form.esicNumber} onChange={(e) => setForm((p) => ({ ...p, esicNumber: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" /></div>
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
                        <div><label className="block text-xs text-slate-600 mb-1">Contact Email</label><input value={form.emergencyEmail} onChange={(e) => setForm((p) => ({ ...p, emergencyEmail: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Email address" /></div>
                        <div className="col-span-2"><label className="block text-xs text-slate-600 mb-1">Contact Address</label><input value={form.emergencyAddress} onChange={(e) => setForm((p) => ({ ...p, emergencyAddress: e.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Contact's address" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowEditModal(false)} className="text-slate-500 text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-[#378ADD] text-white text-sm font-medium px-4 py-2 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deactivateConfirm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Deactivate {employee?.fullName}?</h3>
            <p className="text-sm text-slate-600 mb-4">They will be marked as Inactive.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setDeactivateConfirm(false)} className="text-slate-500 text-sm">Cancel</button>
              <button type="button" onClick={handleDeactivate} disabled={saving} className="rounded-lg bg-red-600 text-white text-sm font-medium px-4 py-2 disabled:opacity-50">Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
