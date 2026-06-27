import { useState, useEffect, useCallback, useRef } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getBlob, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase/config';
import {
  effStatus, formatDate, getAuditScore, statusMeta,
  stableStringify, formatAuditDocSize, fileDocIconType, auditDocViewLabel, isAuditDocImageType,
} from './auditHelpers';
import { WhatsAppButton } from '../../utils/whatsapp';

export default function AuditDetail({ audit, company, companyId, currentUser, employees, onClose, showSuccess, showError, isAuditor, canManage }) {
  const safeAudit = audit || {};
  const auditIdForSession = safeAudit.id || audit?.id || '';
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof sessionStorage === 'undefined' || !auditIdForSession) return 'checklist';
    try {
      return (
        sessionStorage.getItem(`tab_${auditIdForSession}`) ||
        sessionStorage.getItem(`auditTab_${auditIdForSession}`) ||
        'checklist'
      );
    } catch {
      return 'checklist';
    }
  });
  const [auditorStep, setAuditorStep] = useState(() => {
    if (typeof sessionStorage === 'undefined' || !auditIdForSession) return 'checklist';
    try {
      return (
        sessionStorage.getItem(`step_${auditIdForSession}`) ||
        sessionStorage.getItem(`auditorStep_${auditIdForSession}`) ||
        'checklist'
      );
    } catch {
      return 'checklist';
    }
  });
  const [checklistReview, setChecklistReview] = useState(() => safeAudit.checklistReview || []);
  const [findings, setFindings] = useState(() => safeAudit.findings || []);
  const [adminNotes, setAdminNotes] = useState(() => safeAudit.adminNotes || '');
  const saveTimeoutRef = useRef(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [sentBackTo, setSentBackTo] = useState(null);
  const [closedAuditData, setClosedAuditData] = useState(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeFeedback, setCloseFeedback] = useState('');
  const [auditRating, setAuditRating] = useState(0);
  const [collapsedSections, setCollapsedSections] = useState(() => new Set());
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
  const isMountedRef = useRef(true);
  const lastSavedRef = useRef(null);
  const isSavingRef = useRef(false);
  const [auditDocs, setAuditDocs] = useState(() => (Array.isArray(safeAudit.auditDocuments) ? safeAudit.auditDocuments : []));
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleDetailClose = useCallback(() => {
    const id = safeAudit.id;
    if (id && typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(`tab_${id}`);
        sessionStorage.removeItem(`step_${id}`);
        sessionStorage.removeItem(`auditTab_${id}`);
        sessionStorage.removeItem(`auditorStep_${id}`);
      } catch {
        /* ignore */
      }
    }
    onClose();
  }, [safeAudit.id, onClose]);

  useEffect(() => {
    isMountedRef.current = true;
    const h = (e) => {
      if (ownerRef.current && !ownerRef.current.contains(e.target)) setShowOwnerDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => {
      isMountedRef.current = false;
      document.removeEventListener('mousedown', h);
    };
  }, []);


  useEffect(() => {
    if (!safeAudit.id) return;
    try {
      sessionStorage.setItem(`tab_${safeAudit.id}`, activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab, safeAudit.id]);

  useEffect(() => {
    if (!safeAudit.id) return;
    try {
      sessionStorage.setItem(`step_${safeAudit.id}`, auditorStep);
    } catch {
      /* ignore */
    }
  }, [auditorStep, safeAudit.id]);

  const st = effStatus(safeAudit.status);
  const isClosed = safeAudit.status === 'Closed';
  const isUnderReview = st === 'Under Review';
  const managerCanAct = canManage && isUnderReview;
  const checklistItems = Array.isArray(checklistReview) ? checklistReview : [];
  const findingsData = Array.isArray(findings) ? findings : [];
  const teamMembers = (Array.isArray(safeAudit.teamMembers) ? safeAudit.teamMembers : []).filter((m) => {
    const emp = (employees || []).find((e) => e.id === m.id);
    // Keep if employee found + active, or if employee not in list yet (don't break old data)
    return !emp || emp.status === 'Active';
  });
  const auditorEmployee = (employees || []).find(
    (e) => (e.email || '').toLowerCase() === (safeAudit.auditorEmail || '').toLowerCase(),
  );
  const auditorPhone = auditorEmployee?.mobile || auditorEmployee?.phone || auditorEmployee?.mobileNumber || '';
  const openFindings = findingsData.filter((f) => f.status !== 'Resolved');
  const resolvedFindings = findingsData.filter((f) => f.status === 'Resolved');

  const passCount = checklistItems.filter((i) => i.result === 'pass').length;
  const failCount = checklistItems.filter((i) => i.result === 'fail').length;
  const naCount = checklistItems.filter((i) => i.result === 'na').length;
  const totalItems = checklistItems.length;
  const reviewedCount = passCount + failCount + naCount;
  const complianceScore = getAuditScore({ checklistReview: checklistItems });

  const checklistEditable =
    isAuditor &&
    !safeAudit.checklistLocked &&
    !isClosed &&
    (st === 'Assigned' || st === 'In Progress' || st === 'Sent Back');

  const checklistReadOnlyDisplay = !checklistEditable;

  const isAuditorMode = checklistEditable;

  useEffect(() => {
    if (!isAuditorMode && isAuditor && (auditorStep === 'checklist' || auditorStep === 'findings')) {
       
      setActiveTab(auditorStep);
    }
  }, [isAuditorMode, isAuditor, auditorStep]);

  const MANAGER_TABS = [
    { id: 'checklist', label: '1. Review', count: totalItems },
    { id: 'findings', label: '2. Findings', count: findings.length },
    { id: 'overview', label: '3. Overview & Close' },
  ];

  const TABS = isAuditor
    ? [
        { id: 'checklist', label: 'Checklist', count: totalItems },
        { id: 'findings', label: 'Findings', count: findings.length },
      ]
    : canManage
      ? [
          { id: 'checklist', label: 'Review', count: totalItems },
          { id: 'findings', label: 'Findings', count: findings.length },
          { id: 'overview', label: 'Overview' },
        ]
      : [
          { id: 'checklist', label: 'Checklist', count: totalItems },
          { id: 'findings', label: 'Findings', count: findings.length },
          { id: 'overview', label: 'Overview' },
        ];

  const autoSave = useCallback(
    (newChecklistReview, newFindings, newAdminNotes, newAuditDocs) => {
      if (isClosed) return;
      const docs = newAuditDocs !== undefined && newAuditDocs !== null ? newAuditDocs : auditDocs;
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return;
        if (isSavingRef.current) return;
        const prev = lastSavedRef.current;
        if (!prev) return;
        const changed =
          stableStringify(newChecklistReview) !== stableStringify(prev.checklistReview) ||
          stableStringify(newFindings) !== stableStringify(prev.findings) ||
          (newAdminNotes || '') !== (prev.adminNotes || '') ||
          stableStringify(docs || []) !== stableStringify(prev.auditDocuments || []);
        if (!changed) return;
        try {
          if (!isMountedRef.current) return;
          isSavingRef.current = true;
          setAutoSaving(true);
          const payload = {
            findings: newFindings,
            adminNotes: newAdminNotes,
            auditDocuments: docs || [],
            updatedAt: new Date(),
            updatedBy: currentUser?.email || '',
          };
          if (checklistEditable || !isAuditor) {
            payload.checklistReview = newChecklistReview;
          }
          await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), payload);
          if (!isMountedRef.current) return;
          lastSavedRef.current = {
            checklistReview: newChecklistReview,
            findings: newFindings,
            adminNotes: newAdminNotes,
            auditDocuments: docs || [],
          };
          setLastSaved(new Date());
        } catch (e) {
          if (import.meta.env.DEV) console.error('Auto-save failed:', e);
        } finally {
          isSavingRef.current = false;
          if (isMountedRef.current) setAutoSaving(false);
        }
      }, 1500);
    },
    [audit.id, companyId, currentUser, isClosed, checklistEditable, isAuditor, auditDocs],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const updateChecklistItem = (id, result) => {
    if (!checklistEditable) return;
    const updated = checklistReview.map((i) => (i.id === id ? { ...i, result } : i));
    setChecklistReview(updated);
    if (effStatus(audit.status) === 'Assigned') {
      updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        status: 'In Progress',
        updatedAt: new Date(),
        updatedBy: currentUser?.email || '',
      }).catch(() => {});
    }
    autoSave(updated, findingsData, adminNotes, auditDocs);
  };

  const updateChecklistNote = (id, note) => {
    if (!checklistEditable) return;
    const updated = checklistReview.map((i) => (i.id === id ? { ...i, note } : i));
    setChecklistReview(updated);
    autoSave(updated, findingsData, adminNotes, auditDocs);
  };

  const addFinding = () => {
    if (!newFinding.description.trim()) {
      showError('Enter finding description');
      return;
    }
    const addedByRole = isAuditorMode ? 'auditor' : 'auditmanager';
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
      addedBy: (currentUser?.email || '').toLowerCase(),
      addedByRole,
      addedByName: currentUser?.displayName || currentUser?.email || (addedByRole === 'auditor' ? 'Auditor' : 'Audit Manager'),
      createdAt: new Date().toISOString(),
    };
    const newFindings = [...findingsData, finding];
    setFindings(newFindings);
    autoSave(checklistReview, newFindings, adminNotes, auditDocs);
    setNewFinding({ description: '', severity: 'Medium', ownerName: '', ownerId: '', ownerEmail: '', targetDate: '' });
    setOwnerSearch('');
    setShowAddFinding(false);
  };

  const updateFindingStatus = useCallback(
    (id, newStatus) => {
      setFindings((prev) => {
        const updated = prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: newStatus,
                ...(newStatus === 'Resolved' && { resolvedAt: new Date().toISOString() }),
              }
            : f,
        );
        autoSave(checklistReview, updated, adminNotes, auditDocs);
        return updated;
      });
    },
    [autoSave, checklistReview, adminNotes, auditDocs],
  );

  const deleteFinding = (id) => {
    const finding = (findingsData || []).find((f) => f.id === id);
    if (!finding || isClosed) return;
    const role = finding.addedByRole || 'auditor';
    const canDeleteFinding = (() => {
      if (isAuditorMode) {
        return role === 'auditor' && (finding.addedBy || '').toLowerCase() === (currentUser?.email || '').toLowerCase();
      }
      if (canManage) {
        return role === 'auditmanager';
      }
      return false;
    })();
    if (!canDeleteFinding) return;
    const updated = findingsData.filter((f) => f.id !== id);
    setFindings(updated);
    autoSave(checklistReview, updated, adminNotes, auditDocs);
  };

  const canAddFinding = (isAuditor && checklistEditable) || (canManage && !isClosed);

  const canManageFindings = canManage && isUnderReview;

  const handleSubmit = async () => {
    if (submitting) return;
    const unfilled = checklistReview.filter((i) => !i.result);
    if (unfilled.length > 0) {
      showError('Fill all items first');
      return;
    }
    try {
      setSubmitting(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        checklistReview,
        findings: findingsData,
        adminNotes,
        status: 'Submitted',
        submittedAt: new Date(),
        submittedBy: currentUser?.email || '',
        checklistLocked: true,
        updatedAt: new Date(),
        updatedBy: currentUser?.email || '',
      });

      showSuccess('Submitted!');
      setShowSubmitConfirm(false);
      handleDetailClose();
    } catch (e) {
      showError('Submit failed: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkUnderReview = async () => {
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        status: 'Under Review',
        reviewStartedAt: new Date(),
        reviewStartedBy: currentUser?.email || '',
        updatedAt: new Date(),
      });
      showSuccess('Audit under review');
      handleDetailClose();
    } catch {
      showError('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseAudit = async () => {
    const openF = (findingsData || []).filter((f) => f.status !== 'Resolved');
    if (openF.length > 0) {
      showError(`Resolve all ${openF.length} finding${openF.length !== 1 ? 's' : ''} first`);
      return;
    }
    try {
      setSaving(true);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        status: 'Closed',
        closedAt: new Date(),
        closedBy: currentUser?.email || '',
        managerNotes: adminNotes,
        auditRating,
        closeFeedback: closeFeedback.trim(),
        updatedAt: new Date(),
      });

      showSuccess('Audit closed!');
      setClosedAuditData({
        phone: auditorPhone,
        name: audit.auditorName,
        refId: audit.auditRefId,
        typeName: audit.auditTypeName,
        branch: audit.branch,
        rating: auditRating,
      });
    } catch {
      showError('Failed to close audit');
    } finally {
      setSaving(false);
    }
  };

  const handleSendBack = async () => {
    if (!sendBackReason.trim()) {
      showError('Add a reason for sending back');
      return;
    }
    try {
      setSaving(true);
      const reason = sendBackReason.trim();
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), {
        status: 'Sent Back',
        sentBackAt: new Date(),
        sentBackBy: currentUser?.email || '',
        sentBackReason: reason,
        checklistLocked: false,
        updatedAt: new Date(),
      });

      showSuccess('Audit sent back to auditor');
      setSentBackTo({
        phone: auditorPhone,
        name: audit.auditorName,
        reason,
        refId: audit.auditRefId,
      });
      setSendBackReason('');
    } catch {
      showError('Failed to send back');
    } finally {
      setSaving(false);
    }
  };

  const approvedCount = checklistReview.filter((i) => i.managerApproval).length;

  const updateManagerApproval = (id, approval) => {
    if (!canManage || isAuditorMode) return;
    const updated = checklistReview.map((i) => (i.id === id ? { ...i, managerApproval: approval } : i));
    setChecklistReview(updated);
    autoSave(updated, findingsData, adminNotes, auditDocs);
  };

  const updateManagerNote = (id, note) => {
    if (!canManage || isAuditorMode) return;
    const updated = checklistReview.map((i) => (i.id === id ? { ...i, managerNote: note } : i));
    setChecklistReview(updated);
    autoSave(updated, findingsData, adminNotes, auditDocs);
  };

  const sections = [...new Set(checklistItems.map((i) => i.section))];

  const canUploadAuditDoc =
    isAuditorMode && !isClosed && (st === 'Assigned' || st === 'In Progress' || st === 'Sent Back');
  const docsLockedAfterSubmit = isAuditor && (st === 'Submitted' || st === 'Under Review');

  const canDeleteAuditorDoc = (docRecord) => {
    if (isClosed) return false;
    if (canManage) return false;
    if (!isAuditorMode) return false;
    const editableStatuses = ['Assigned', 'In Progress', 'Sent Back'];
    if (!editableStatuses.includes(st)) return false;
    return (docRecord.uploadedBy || '').toLowerCase() === (currentUser?.email || '').toLowerCase();
  };

  const handleDocUpload = async (file) => {
    if (!file) return;
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      showError('File too large. Max 20MB.');
      return;
    }
    const ALLOWED_TYPES = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!ALLOWED_TYPES.includes(file.type)) {
      showError('Only PDF, images and Word docs allowed');
      return;
    }
    try {
      setUploading(true);
      setUploadProgress(0);
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filename = `${timestamp}_${safeName}`;
      const storagePath = `audits/${companyId}/${audit.id}/${filename}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);
      await new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            setUploadProgress(progress);
          },
          reject,
          resolve,
        );
      });
      const uploadedByRole = 'auditor';
      const docRecord = {
        id: `doc_${timestamp}`,
        name: file.name,
        storagePath,
        size: file.size,
        type: file.type,
        uploadedBy: (currentUser?.email || '').toLowerCase(),
        uploadedByName: currentUser?.displayName || currentUser?.email || 'User',
        uploadedByRole,
        uploadedAt: new Date().toISOString(),
      };
      const updatedDocs = [...auditDocs, docRecord];
      setAuditDocs(updatedDocs);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), { auditDocuments: updatedDocs });
      if (lastSavedRef.current) {
        lastSavedRef.current = {
          ...lastSavedRef.current,
          auditDocuments: updatedDocs,
        };
      }
      showSuccess(`${file.name} uploaded!`);
    } catch (e) {
      showError('Upload failed: ' + (e?.message || String(e)));
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDocDelete = async (docRecord) => {
    if (!window.confirm(`Delete "${docRecord.name}"?`)) return;
    try {
      const storageRef = ref(storage, docRecord.storagePath);
      await deleteObject(storageRef).catch(() => {});
      const updatedDocs = auditDocs.filter((d) => d.id !== docRecord.id);
      setAuditDocs(updatedDocs);
      await updateDoc(doc(db, 'companies', companyId, 'audits', audit.id), { auditDocuments: updatedDocs });
      if (lastSavedRef.current) {
        lastSavedRef.current = {
          ...lastSavedRef.current,
          auditDocuments: updatedDocs,
        };
      }
      showSuccess('Document deleted');
    } catch (e) {
      showError('Delete failed: ' + (e?.message || String(e)));
    }
  };

  const handlePrint = () => {
    if (!audit) {
      showError('No audit data to print');
      return;
    }
    const esc = (s) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const fmtDate = (d) => {
      if (!d) return '—';
      if (d?.toDate) {
        try {
          const dt = d.toDate();
          return dt instanceof Date && !Number.isNaN(dt.getTime()) ? dt.toLocaleDateString('en-GB') : '—';
        } catch {
          return '—';
        }
      }
      if (d instanceof Date) return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
      if (typeof d === 'string') {
        const [y, m, day] = d.split('-');
        if (y && m && day) return `${day}/${m}/${y}`;
        const parsed = new Date(d);
        return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('en-GB');
      }
      return '—';
    };

    const currentChecklist = Array.isArray(checklistItems) ? checklistItems : [];
    const currentFindings = Array.isArray(findingsData) ? findingsData : [];
    const currentNotes = adminNotes || '';
    const currentDocs = Array.isArray(auditDocs) ? auditDocs : [];

    const passCount = currentChecklist.filter((i) => i.result === 'pass').length;
    const failCount = currentChecklist.filter((i) => i.result === 'fail').length;
    const naCount = currentChecklist.filter((i) => i.result === 'na').length;
    const totalItems = currentChecklist.length;
    const reviewed = passCount + failCount;
    const score = reviewed > 0 ? Math.round((passCount / reviewed) * 100) : null;

    const STATUS_HEX = {
      Assigned: '#888780',
      'In Progress': '#378ADD',
      Submitted: '#EF9F27',
      'Sent Back': '#E24B4A',
      'Under Review': '#7F77DD',
      Closed: '#639922',
    };
    const statusColor = STATUS_HEX[effStatus(audit.status)] || '#888780';

    const SEV = {
      critical: { bg: '#FCEBEB', text: '#791F1F', bar: '#A32D2D' },
      high:     { bg: '#FAEEDA', text: '#854F0B', bar: '#BA7517' },
      medium:   { bg: '#E6F1FB', text: '#0C447C', bar: '#185FA5' },
      low:      { bg: '#EAF3DE', text: '#3B6D11', bar: '#639922' },
    };
    const RES = {
      pass: { bg: '#EAF3DE', text: '#3B6D11', label: 'PASS' },
      fail: { bg: '#FCEBEB', text: '#791F1F', label: 'FAIL' },
      na:   { bg: '#F1EFE8', text: '#5F5E5A', label: 'N/A' },
    };

    const companyName = company?.name || 'Company';
    const companyInitials = company?.initials || companyName.charAt(0) || 'C';
    const companyColor = company?.color || '#1B6B6B';

    const sectionsForPrint = [...new Set(currentChecklist.map((i) => i.section || 'General'))];
    const sectionsHtml = sectionsForPrint.map((section) => {
      const rows = currentChecklist
        .filter((i) => (i.section || 'General') === section)
        .map((item) => {
          const rs = RES[item.result] || { bg: '#F1EFE8', text: '#5F5E5A', label: '—' };
          return `
            <div class="cl-row">
              <div class="cl-badge" style="background:${rs.bg};color:${rs.text};">${rs.label}</div>
              <div class="cl-body">
                <div class="cl-q">${esc(item.question)}</div>
                ${item.note ? `<div class="cl-note">${esc(item.note)}</div>` : ''}
              </div>
            </div>`;
        })
        .join('');
      return `
        <div class="section-card">
          <div class="section-head">${esc(section)}</div>
          ${rows}
        </div>`;
    }).join('');

    const findingsHtml = currentFindings.length === 0 ? '' : `
      <div class="block">
        <div class="block-label">Findings (${currentFindings.length})</div>
        ${currentFindings.map((f) => {
          const sev = SEV[String(f.severity || 'low').toLowerCase()] || SEV.low;
          const fStatus = f.status || 'Open';
          const statusBg = fStatus === 'Resolved' ? '#EAF3DE' : fStatus === 'In Progress' ? '#E6F1FB' : '#F1EFE8';
          const statusText = fStatus === 'Resolved' ? '#3B6D11' : fStatus === 'In Progress' ? '#0C447C' : '#5F5E5A';
          return `
            <div class="finding" style="border-left-color:${sev.bar};">
              <div class="finding-head">
                <span class="sev-pill" style="background:${sev.bg};color:${sev.text};">${esc(String(f.severity || 'Low').toUpperCase())}</span>
                <span class="finding-status" style="background:${statusBg};color:${statusText};">${esc(fStatus)}</span>
              </div>
              <div class="finding-desc">${esc(f.description)}</div>
              <div class="finding-meta">
                ${f.ownerName ? `<span><strong>Owner:</strong> ${esc(f.ownerName)}</span>` : ''}
                ${f.targetDate ? `<span><strong>Target:</strong> ${fmtDate(f.targetDate)}</span>` : ''}
                ${f.addedByName ? `<span><strong>Added by:</strong> ${esc(f.addedByName)}</span>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;

    const docsHtml = currentDocs.length === 0 ? '' : `
      <div class="block">
        <div class="block-label">Attached documents (${currentDocs.length})</div>
        ${currentDocs.map((d) => {
          const icon = d.type?.includes('pdf') ? '📄' : d.type?.includes('image') ? '🖼️' : '📝';
          return `
            <div class="doc-row">
              <div class="doc-icon">${icon}</div>
              <div class="doc-body">
                <div class="doc-name">${esc(d.name)}</div>
                <div class="doc-meta">${formatAuditDocSize(d.size)} · ${esc(d.uploadedByName || '')}${d.uploadedAt ? ` · ${fmtDate(d.uploadedAt)}` : ''}</div>
              </div>
              ${d.url ? `<a class="doc-link" href="${esc(d.url)}">View</a>` : ''}
            </div>`;
        }).join('')}
      </div>`;

    const feedbackHtml = !audit.auditRating && !audit.closeFeedback ? '' : `
      <div class="block">
        <div class="block-label">Manager feedback</div>
        <div class="feedback-box">
          ${audit.auditRating ? `
            <div class="rating-row">
              <span class="stars">${'★'.repeat(audit.auditRating)}${'☆'.repeat(5 - audit.auditRating)}</span>
              <span class="rating-text">${['','Poor','Fair','Good','Very Good','Excellent'][audit.auditRating]} (${audit.auditRating}/5)</span>
            </div>` : ''}
          ${audit.closeFeedback ? `<div class="feedback-text">"${esc(audit.closeFeedback)}"</div>` : ''}
          ${audit.closedBy ? `<div class="feedback-by">Reviewed by ${esc(audit.closedBy)}${audit.closedAt ? ` · ${fmtDate(audit.closedAt)}` : ''}</div>` : ''}
        </div>
      </div>`;

    const sentBackHtml = !audit.sentBackReason ? '' : `
      <div class="block">
        <div class="block-label">Sent back reason</div>
        <div class="sentback-box">${esc(audit.sentBackReason)}</div>
      </div>`;

    const notesHtml = !currentNotes ? '' : `
      <div class="block">
        <div class="block-label">Admin notes</div>
        <div class="admin-notes">${esc(currentNotes)}</div>
      </div>`;

    const scoreColor = score === null ? '#888780' : score >= 80 ? '#639922' : score >= 50 ? '#BA7517' : '#A32D2D';

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Audit Report — ${esc(audit.auditRefId || '')}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; color: #1f2937;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 12px; line-height: 1.5; }
  .page { max-width: 800px; margin: 0 auto; }
  .report-wrap { border: 1px solid #f3f4f6; border-radius: 8px; overflow: hidden; }
  .header { background: #1B6B6B; color: #fff; padding: 18px 24px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .brand-row { display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-logo { width: 34px; height: 34px; border-radius: 7px;
    background: rgba(255,255,255,0.18); display: flex; align-items: center;
    justify-content: center; font-weight: 600; font-size: 12px; }
  .brand-title { font-size: 14px; font-weight: 600; line-height: 1; }
  .brand-sub { font-size: 10px; opacity: 0.75; margin-top: 3px; }
  .divider { width: 1px; height: 32px; background: rgba(255,255,255,0.22); }
  .company-block { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .company-logo { width: 30px; height: 30px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; font-size: 11px; color: #fff;
    border: 1px solid rgba(255,255,255,0.25); }
  .company-name { font-size: 13px; font-weight: 500; line-height: 1; }
  .company-sub { font-size: 10px; opacity: 0.75; margin-top: 3px; }
  .status-pill { background: ${statusColor}; padding: 5px 14px;
    border-radius: 999px; font-size: 10px; font-weight: 600;
    letter-spacing: 0.6px; white-space: nowrap; flex-shrink: 0; }
  .title-block { padding: 20px 24px 14px; border-bottom: 1px solid #f3f4f6;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .ref-pill { display: inline-block; background: #E1F5EE; color: #0F6E56;
    font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 4px;
    letter-spacing: 0.4px; margin-bottom: 6px; font-family: monospace; }
  .audit-title { font-size: 20px; font-weight: 600; margin: 0 0 6px; color: #111827; }
  .audit-meta { font-size: 11px; color: #6b7280; }
  .score-block { text-align: right; flex-shrink: 0; }
  .score-num { font-size: 36px; font-weight: 700; line-height: 1; color: ${scoreColor}; }
  .score-label { font-size: 10px; color: #6b7280; margin-top: 3px; }
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
    padding: 0 24px 16px; }
  .stat { background: #F9FAFB; padding: 10px 12px; border-radius: 6px; }
  .stat-label { font-size: 9px; color: #6b7280; text-transform: uppercase;
    letter-spacing: 0.4px; }
  .stat-value { font-size: 18px; font-weight: 600; margin-top: 2px; }
  .stat.pass .stat-value { color: #3B6D11; }
  .stat.fail .stat-value { color: #A32D2D; }
  .stat.na .stat-value { color: #6b7280; }
  .stat.total .stat-value { color: #111827; }
  .meta-grid { padding: 14px 24px; border-top: 1px solid #f3f4f6;
    border-bottom: 1px solid #f3f4f6;
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; font-size: 11px; }
  .meta-row { display: flex; gap: 10px; }
  .meta-row .k { color: #9ca3af; min-width: 90px; flex-shrink: 0; }
  .meta-row .v { color: #111827; }
  .block { padding: 18px 24px; border-bottom: 1px solid #f3f4f6; }
  .block:last-child { border-bottom: none; }
  .block-label { font-size: 10px; font-weight: 600; color: #6b7280;
    text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .section-card { border: 1px solid #f3f4f6; border-radius: 8px;
    overflow: hidden; margin-bottom: 10px; page-break-inside: avoid; }
  .section-head { background: #F9FAFB; padding: 8px 14px; font-size: 11px;
    font-weight: 600; color: #374151; border-bottom: 1px solid #f3f4f6; }
  .cl-row { padding: 9px 14px; display: flex; align-items: flex-start;
    gap: 12px; border-bottom: 1px solid #f9fafb; }
  .cl-row:last-child { border-bottom: none; }
  .cl-badge { font-size: 9px; font-weight: 600; padding: 3px 7px;
    border-radius: 3px; min-width: 36px; text-align: center; margin-top: 1px;
    flex-shrink: 0; letter-spacing: 0.4px; }
  .cl-body { flex: 1; min-width: 0; }
  .cl-q { font-size: 11px; color: #111827; font-weight: 500; }
  .cl-note { font-size: 10px; color: #6b7280; margin-top: 3px; font-style: italic; }
  .finding { background: #fff; border: 1px solid #f3f4f6; border-left: 3px solid;
    border-radius: 6px; padding: 11px 13px; margin-bottom: 8px;
    page-break-inside: avoid; }
  .finding-head { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .sev-pill { font-size: 9px; font-weight: 600; padding: 2px 7px;
    border-radius: 3px; letter-spacing: 0.4px; }
  .finding-status { font-size: 9px; font-weight: 600; padding: 2px 7px;
    border-radius: 3px; letter-spacing: 0.3px; }
  .finding-desc { font-size: 11px; color: #111827; margin-bottom: 7px; line-height: 1.5; }
  .finding-meta { font-size: 10px; color: #6b7280; display: flex;
    gap: 14px; flex-wrap: wrap; }
  .finding-meta strong { color: #374151; font-weight: 600; }
  .doc-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px;
    border: 1px solid #f3f4f6; border-radius: 6px; margin-bottom: 6px; }
  .doc-icon { font-size: 16px; flex-shrink: 0; }
  .doc-body { flex: 1; min-width: 0; }
  .doc-name { font-size: 11px; color: #111827; font-weight: 500;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .doc-meta { font-size: 10px; color: #9ca3af; margin-top: 2px; }
  .doc-link { font-size: 10px; color: #0F6E56; text-decoration: none;
    font-weight: 500; flex-shrink: 0; }
  .feedback-box { background: #FAEEDA; border-left: 3px solid #EF9F27;
    border-radius: 6px; padding: 13px 15px; page-break-inside: avoid; }
  .rating-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .stars { color: #EF9F27; font-size: 15px; letter-spacing: 2px; line-height: 1; }
  .rating-text { font-size: 11px; color: #633806; font-weight: 600; }
  .feedback-text { font-size: 12px; color: #412402; font-style: italic;
    margin-top: 6px; line-height: 1.5; }
  .feedback-by { font-size: 10px; color: #854F0B; margin-top: 8px; }
  .admin-notes { background: #F9FAFB; border-radius: 6px; padding: 11px 13px;
    font-size: 11px; color: #374151; line-height: 1.6; white-space: pre-wrap; }
  .sentback-box { background: #FCEBEB; border-left: 3px solid #E24B4A;
    border-radius: 6px; padding: 11px 13px; font-size: 11px; color: #791F1F;
    white-space: pre-wrap; line-height: 1.5; }
  .footer { padding: 11px 24px; font-size: 9px; color: #9ca3af;
    display: flex; justify-content: space-between;
    border-top: 1px solid #f3f4f6; background: #F9FAFB; }
  @media print {
    .report-wrap { border: none; border-radius: 0; }
    .block { page-break-inside: avoid; }
    .section-card, .finding, .feedback-box { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="report-wrap">
    <div class="header">
      <div class="brand-row">
        <div class="brand">
          <div class="brand-logo">AX</div>
          <div>
            <div class="brand-title">AttendX</div>
            <div class="brand-sub">Audit Report</div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="company-block">
          <div class="company-logo" style="background:${esc(companyColor)};">${esc(companyInitials)}</div>
          <div>
            <div class="company-name">${esc(companyName)}</div>
            <div class="company-sub">Generated ${fmtDate(new Date())}</div>
          </div>
        </div>
      </div>
      <div class="status-pill">${esc(String(effStatus(audit.status) || '').toUpperCase())}</div>
    </div>

    <div class="title-block">
      <div style="flex:1;min-width:0;">
        <div class="ref-pill">${esc(audit.auditRefId || '—')}</div>
        <h1 class="audit-title">${esc(audit.auditTypeName || 'Audit')}</h1>
        <div class="audit-meta">
          ${fmtDate(audit.startDate)} — ${fmtDate(audit.endDate)}
          ${audit.riskLevel ? ` · Risk: <strong>${esc(audit.riskLevel)}</strong>` : ''}
          ${audit.auditCategory ? ` · ${esc(audit.auditCategory)}` : ''}
        </div>
      </div>
      ${score !== null ? `
        <div class="score-block">
          <div class="score-num">${score}%</div>
          <div class="score-label">Compliance score</div>
        </div>
      ` : ''}
    </div>

    ${totalItems > 0 ? `
      <div class="stats-grid">
        <div class="stat pass"><div class="stat-label">Pass</div><div class="stat-value">${passCount}</div></div>
        <div class="stat fail"><div class="stat-label">Fail</div><div class="stat-value">${failCount}</div></div>
        <div class="stat na"><div class="stat-label">N/A</div><div class="stat-value">${naCount}</div></div>
        <div class="stat total"><div class="stat-label">Total</div><div class="stat-value">${totalItems}</div></div>
      </div>
    ` : ''}

    <div class="meta-grid">
      ${audit.auditorName ? `<div class="meta-row"><span class="k">Auditor</span><span class="v">${esc(audit.auditorName)}</span></div>` : ''}
      ${audit.branch ? `<div class="meta-row"><span class="k">Branch</span><span class="v">${esc(audit.branch)}</span></div>` : ''}
      ${audit.location ? `<div class="meta-row"><span class="k">Location</span><span class="v">${esc(audit.location)}</span></div>` : ''}
      ${audit.department ? `<div class="meta-row"><span class="k">Department</span><span class="v">${esc(audit.department)}</span></div>` : ''}
      ${audit.closedBy ? `<div class="meta-row"><span class="k">Closed by</span><span class="v">${esc(audit.closedBy)}</span></div>` : ''}
      ${audit.closedAt ? `<div class="meta-row"><span class="k">Closed on</span><span class="v">${fmtDate(audit.closedAt)}</span></div>` : ''}
    </div>

    ${sentBackHtml}

    ${totalItems > 0 ? `
      <div class="block">
        <div class="block-label">Checklist review</div>
        ${sectionsHtml}
      </div>
    ` : ''}

    ${findingsHtml}
    ${docsHtml}
    ${feedbackHtml}
    ${notesHtml}

    <div class="footer">
      <span>AttendX · attendx-1cccb.web.app</span>
      <span>Confidential · ${esc(audit.auditRefId || '')}</span>
    </div>
  </div>
</div>
<script>
  window.addEventListener('load', function() {
    setTimeout(function() { window.print(); }, 400);
  });
</script>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      showError('Popup blocked. Allow popups for this site to print.');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        role="presentation"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleDetailClose}
      />
      <div
        className="relative flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-sm sm:mx-4 sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isAuditorMode && (
          <div className="flex items-center gap-0 px-4 py-3 flex-shrink-0">
            {[
              { id: 'checklist', label: '1. Checklist', num: 1 },
              { id: 'findings', label: '2. Findings', num: 2 },
            ].map((step, idx) => (
              <div key={step.id} className="flex items-center flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      auditorStep === step.id || (step.id === 'checklist' && auditorStep === 'findings')
                        ? 'bg-[#1B6B6B] text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {step.num}
                  </div>
                  <span
                    className={`text-xs font-medium hidden sm:inline ${auditorStep === step.id ? 'text-[#1B6B6B]' : 'text-gray-400'}`}
                  >
                    {step.label.replace(/^\d+\.\s*/, '')}
                  </span>
                </div>
                {idx === 0 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
              </div>
            ))}
          </div>
        )}
        <div className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="rounded-xl bg-gray-100 px-2 py-0.5 font-mono text-xs font-bold text-gray-400">{audit.auditRefId}</span>
                <h2 className="text-base font-semibold text-gray-800">{audit.auditTypeName}</h2>
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${statusMeta(audit.status).badge}`}
                >
                  {statusMeta(audit.status).icon} {st}
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
            <div className="flex items-center gap-2 ml-2 shrink-0">
              {complianceScore !== null && (
                <div className="flex flex-col items-center" title={`Compliance score: ${complianceScore}%`}>
                  <svg width="54" height="34" viewBox="0 0 54 34" aria-label={`Compliance score ${complianceScore}%`}>
                    <path d="M5 30 A22 22 0 0 1 49 30" fill="none" stroke="#F3F4F6" strokeWidth="6" strokeLinecap="round" />
                    <path
                      d="M5 30 A22 22 0 0 1 49 30"
                      fill="none"
                      stroke={complianceScore >= 80 ? '#639922' : complianceScore >= 60 ? '#EF9F27' : '#E24B4A'}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="69.1"
                      strokeDashoffset={69.1 * (1 - complianceScore / 100)}
                    />
                    <text
                      x="27"
                      y="28"
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill={complianceScore >= 80 ? '#639922' : complianceScore >= 60 ? '#EF9F27' : '#E24B4A'}
                    >
                      {complianceScore}%
                    </text>
                  </svg>
                </div>
              )}
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
              <button
                type="button"
                onClick={handleDetailClose}
                className="min-w-[44px] min-h-[44px] w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 flex-shrink-0"
              >
                ✕
              </button>
            </div>
          </div>

          {st === 'Sent Back' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-3">
              <p className="text-sm font-semibold text-red-700 mb-1">↩ Sent back for corrections</p>
              {audit.sentBackReason && (
                <p className="text-xs text-red-600">Manager note: {audit.sentBackReason}</p>
              )}
            </div>
          )}

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
              {canManage && approvedCount > 0 && (
                <p className="text-xs text-gray-400 mt-1">Manager reviewed: {approvedCount}/{totalItems} items</p>
              )}
              {(() => {
                const STATUS_ORDER = ['Assigned', 'In Progress', 'Submitted', 'Under Review', 'Closed'];
                const curSt = effStatus(audit.status);
                const curIdx = STATUS_ORDER.indexOf(curSt === 'Sent Back' ? 'Submitted' : curSt);
                const isClosed = curSt === 'Closed';
                const stepDate = (step) => {
                  if (step === 'In Progress' && audit.startDate) return audit.startDate.slice(0, 10).split('-').reverse().join('/');
                  if (step === 'Closed' && audit.closedAt) {
                    try {
                      const d = audit.closedAt?.toDate ? audit.closedAt.toDate() : new Date(audit.closedAt);
                      return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB') : null;
                    } catch { return null; }
                  }
                  return null;
                };
                return (
                  <div className="relative flex items-start justify-between pt-3 pb-1 mb-2">
                    <div className="absolute top-[28px] left-3 right-3 h-0.5 bg-gray-100" />
                    <div
                      className="absolute top-[28px] left-3 h-0.5 transition-all duration-500"
                      style={{
                        background: '#1B6B6B',
                        width: curIdx <= 0 ? '0%' : `calc(${(curIdx / (STATUS_ORDER.length - 1)) * 100}% - 6px)`,
                      }}
                    />
                    {STATUS_ORDER.map((step, idx) => {
                      const isDone = isClosed || idx < curIdx;
                      const isCur = !isClosed && idx === curIdx;
                      const date = stepDate(step);
                      return (
                        <div key={step} className="flex flex-col items-center gap-1 z-10 flex-1 min-w-0">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                            style={{ background: isDone || isCur ? '#1B6B6B' : '#F3F4F6' }}
                          >
                            {isDone && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                                <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {isCur && !isDone && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          <div className="text-center px-0.5 w-full">
                            <p
                              className="text-[10px] font-medium leading-tight truncate"
                              style={{ color: isDone || isCur ? '#1B6B6B' : '#9CA3AF' }}
                            >
                              {step}
                            </p>
                            {date && <p className="text-[10px] text-gray-400 mt-0.5">{date}</p>}
                            {curSt === 'Sent Back' && step === 'Submitted' && (
                              <p className="text-[10px] mt-0.5" style={{ color: '#E24B4A' }}>Sent back</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-700">
                  {passCount + failCount + naCount} of {totalItems} reviewed
                </span>
                <span className="text-xs text-gray-400">
                  {totalItems - passCount - failCount - naCount > 0
                    ? `${totalItems - passCount - failCount - naCount} pending`
                    : '✓ Complete'}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full transition-all" style={{ width: totalItems > 0 ? `${(passCount / totalItems) * 100}%` : '0%', background: '#639922' }} />
                <div className="h-full transition-all" style={{ width: totalItems > 0 ? `${(failCount / totalItems) * 100}%` : '0%', background: '#E24B4A' }} />
                <div className="h-full transition-all" style={{ width: totalItems > 0 ? `${(naCount / totalItems) * 100}%` : '0%', background: '#B4B2A9' }} />
              </div>
              <div className="flex gap-3 mt-1.5 flex-wrap">
                {passCount > 0 && (
                  <span className="text-xs flex items-center gap-1" style={{ color: '#3B6D11' }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#639922' }} />
                    {passCount} pass
                  </span>
                )}
                {failCount > 0 && (
                  <span className="text-xs flex items-center gap-1" style={{ color: '#A32D2D' }}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#E24B4A' }} />
                    {failCount} fail
                  </span>
                )}
                {naCount > 0 && (
                  <span className="text-xs flex items-center gap-1 text-gray-400">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-300" />
                    {naCount} N/A
                  </span>
                )}
                {(totalItems - passCount - failCount - naCount) > 0 && (
                  <span className="text-xs flex items-center gap-1 text-gray-300">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-gray-200" />
                    {totalItems - passCount - failCount - naCount} pending
                  </span>
                )}
              </div>
            </div>
          )}

          {!isAuditorMode && (
            <div className="flex gap-1 mt-3 overflow-x-auto scrollbar-none flex-nowrap pb-1">
              {(canManage && isUnderReview ? MANAGER_TABS : TABS).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (isAuditor && (tab.id === 'checklist' || tab.id === 'findings')) {
                      setAuditorStep(tab.id);
                    }
                  }}
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
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {((isAuditorMode && auditorStep === 'checklist') || (!isAuditorMode && activeTab === 'checklist')) && (
            <div className="space-y-5">
              {canManage && !isUnderReview && !isClosed && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
                  <span className="text-blue-500">ℹ️</span>
                  <p className="text-xs text-blue-700">
                    Checklist is read-only. Click &quot;Start Review&quot; in the Audits list to begin reviewing this audit.
                  </p>
                </div>
              )}
              {checklistReview.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm text-gray-500">No checklist items in this template</p>
                </div>
              ) : (
                sections.map((section) => (
                  <div key={section}>
                    <button
                      type="button"
                      onClick={() => setCollapsedSections((prev) => {
                        const n = new Set(prev);
                        if (n.has(section)) n.delete(section); else n.add(section);
                        return n;
                      })}
                      className="w-full flex items-center justify-between mb-3 pb-2 border-b border-gray-100 hover:opacity-75 transition-opacity"
                    >
                      <div className="flex items-center gap-2">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsedSections.has(section) ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} aria-hidden="true">
                          <path d="M2 3l3 3 3-3"/>
                        </svg>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{section}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          {checklistReview.filter((i) => i.section === section && (i.result === 'pass' || i.result === 'fail' || i.result === 'na')).length}/{checklistReview.filter((i) => i.section === section).length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {checklistReview.filter((i) => i.section === section && i.result === 'pass').length > 0 && (
                          <span style={{ color: '#3B6D11' }}>{checklistReview.filter((i) => i.section === section && i.result === 'pass').length} pass</span>
                        )}
                        {checklistReview.filter((i) => i.section === section && i.result === 'fail').length > 0 && (
                          <span style={{ color: '#A32D2D' }}>{checklistReview.filter((i) => i.section === section && i.result === 'fail').length} fail</span>
                        )}
                      </div>
                    </button>
                    <div className={`space-y-3 ${collapsedSections.has(section) ? 'hidden' : ''}`}>
                      {checklistReview
                        .filter((i) => i.section === section)
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`p-4 rounded-xl border ${
                              item.result === 'pass'
                                ? 'bg-green-50 border-green-100'
                                : item.result === 'fail'
                                  ? 'bg-red-50 border-red-100'
                                  : item.result === 'na'
                                    ? 'bg-gray-50 border-gray-100'
                                    : 'bg-white border-gray-100'
                            }`}
                          >
                            {checklistReadOnlyDisplay ? (
                              <div className="flex items-start gap-3">
                                <span
                                  className={`mt-0.5 flex-shrink-0 rounded-xl px-2 py-1 text-xs font-bold ${
                                    item.result === 'pass'
                                      ? 'bg-green-200 text-green-800'
                                      : item.result === 'fail'
                                        ? 'bg-red-200 text-red-800'
                                        : item.result === 'na'
                                          ? 'bg-gray-200 text-gray-600'
                                          : 'bg-gray-100 text-gray-400'
                                  }`}
                                >
                                  {item.result === 'pass'
                                    ? '✅ Pass'
                                    : item.result === 'fail'
                                      ? '❌ Fail'
                                      : item.result === 'na'
                                        ? '⏭ N/A'
                                        : '— N/R'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800">{item.question}</p>
                                  {item.note && (
                                    <p className="text-xs text-gray-500 mt-1 italic">&quot;{item.note}&quot;</p>
                                  )}
                                </div>
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                                    item.riskLevel === 'Critical'
                                      ? 'bg-red-100 text-red-600'
                                      : item.riskLevel === 'High'
                                        ? 'bg-orange-100 text-orange-600'
                                        : item.riskLevel === 'Medium'
                                          ? 'bg-amber-100 text-amber-600'
                                          : 'bg-green-100 text-green-600'
                                  }`}
                                >
                                  {item.riskLevel || 'Med'}
                                </span>
                              </div>
                            ) : (
                              <>
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
                                {/* eslint-disable react-hooks/refs */}
                                <div className="flex gap-2 mb-2 flex-wrap sm:flex-nowrap">
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
                                      className={`min-h-[44px] flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-all sm:flex-none ${
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
                                  className="w-full rounded-xl border border-gray-200 bg-white/80 px-3 py-2 text-xs focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20 disabled:bg-gray-50"
                                />
                                {/* eslint-enable react-hooks/refs */}
                              </>
                            )}
                            {managerCanAct && (
                              <div className="mt-2 pt-2 border-t border-gray-100">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-400">Manager review:</span>
                                  <button
                                    type="button"
                                    onClick={() => updateManagerApproval(item.id, item.managerApproval === 'approved' ? null : 'approved')}
                                    className={`rounded-xl border px-3 py-1 text-xs font-medium transition-all ${
                                      item.managerApproval === 'approved'
                                        ? 'bg-green-500 text-white border-green-500'
                                        : 'bg-white text-gray-400 border-gray-200 hover:bg-green-50 hover:border-green-200 hover:text-green-700'
                                    }`}
                                  >
                                    ✅ Approved
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateManagerApproval(item.id, item.managerApproval === 'concern' ? null : 'concern')}
                                    className={`rounded-xl border px-3 py-1 text-xs font-medium transition-all ${
                                      item.managerApproval === 'concern'
                                        ? 'bg-amber-500 text-white border-amber-500'
                                        : 'bg-white text-gray-400 border-gray-200 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700'
                                    }`}
                                  >
                                    ⚠️ Concern
                                  </button>
                                </div>
                                {item.managerApproval && (
                                  <input
                                    value={item.managerNote || ''}
                                    onChange={(e) => updateManagerNote(item.id, e.target.value)}
                                    placeholder="Add note (optional)..."
                                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs focus:border-[#1B6B6B] focus:outline-none focus:ring-1 focus:ring-[#1B6B6B]/20"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {((isAuditorMode && auditorStep === 'findings') || (!isAuditorMode && activeTab === 'findings')) && (
            <div className="space-y-4">
              {!isClosed && (isAuditorMode ? canAddFinding : managerCanAct) && (
                <button
                  type="button"
                  onClick={() => setShowAddFinding(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] transition-colors"
                >
                  + Add Finding
                </button>
              )}
              {!isClosed && canManage && !isUnderReview && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center">
                  <p className="text-xs text-gray-400">
                    Click &quot;Start Review&quot; to add findings and manage this audit
                  </p>
                </div>
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
                          className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
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
                  {/* eslint-disable react-hooks/refs */}
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
                        style={{
                          borderLeftWidth: '3px',
                          borderLeftColor:
                            finding.severity === 'Critical' ? '#E24B4A'
                            : finding.severity === 'High' ? '#EF9F27'
                            : finding.severity === 'Medium' ? '#378ADD'
                            : '#639922',
                        }}
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
                            {!isClosed &&
                              (() => {
                                const role = finding.addedByRole || 'auditor';
                                const canDeleteFinding = (() => {
                                  if (isAuditorMode) {
                                    return (
                                      role === 'auditor' &&
                                      (finding.addedBy || '').toLowerCase() === (currentUser?.email || '').toLowerCase()
                                    );
                                  }
                                  if (canManage) {
                                    return role === 'auditmanager';
                                  }
                                  return false;
                                })();
                                if (!canDeleteFinding) return null;
                                return (
                              <button
                                type="button"
                                onClick={() => deleteFinding(finding.id)}
                                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 text-gray-300 hover:text-red-500"
                              >
                                ✕
                              </button>
                                );
                              })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              finding.addedByRole === 'auditor'
                                ? 'bg-teal-100 text-teal-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {finding.addedByRole === 'auditor' ? '👷 Auditor' : '🧑‍💼 Audit Manager'}
                          </span>
                          <span className="text-xs text-gray-400">{finding.addedByName || '—'}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap mb-3">
                          {finding.ownerName && (
                            <span className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                              👤 {finding.ownerName}
                              {(() => {
                                const ownerEmp = (employees || []).find(
                                  (e) => e.id === finding.ownerId || e.fullName === finding.ownerName,
                                );
                                const phone = ownerEmp?.mobile || ownerEmp?.phone || ownerEmp?.mobileNumber || '';
                                if (!phone) return null;
                                return (
                                  <WhatsAppButton
                                    phone={phone}
                                    message={
                                      `Dear ${finding.ownerName} Garu,\n\n` +
                                      `An audit finding has been assigned to you for resolution.\n\n` +
                                      `*Audit:* ${audit.auditRefId} — ${audit.auditTypeName}\n` +
                                      (audit.branch ? `*Branch:* ${audit.branch}\n` : '') +
                                      `*Finding:* ${finding.description}\n` +
                                      `*Severity:* ${finding.severity}\n` +
                                      (finding.targetDate ? `*Fix by:* ${formatDate(finding.targetDate)}\n` : '') +
                                      `\nPlease take necessary action and update the status.\n\n` +
                                      `Thank you,\nAudit Team`
                                    }
                                    size="xs"
                                    label="Notify Owner"
                                  />
                                );
                              })()}
                            </span>
                          )}
                          {finding.targetDate && (
                            <span className={`text-xs font-medium ${isOverdueFinding ? 'text-red-600' : 'text-gray-500'}`}>
                              {isOverdueFinding ? '⚠️ ' : '📅 '}
                              {formatDate(finding.targetDate)}
                            </span>
                          )}
                        </div>
                        {!isClosed && canManageFindings && (
                          <div className="flex gap-2 flex-wrap">
                            {['Open', 'In Progress', 'Resolved'].map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => updateFindingStatus(finding.id, s)}
                                className={`rounded-xl border px-3 py-1 text-xs font-medium transition-all ${
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
                  {/* eslint-enable react-hooks/refs */}
                </div>
              )}

              {isAuditor && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h4 className="text-sm font-semibold text-gray-700">📎 Audit Documents</h4>
                    <span className="text-xs text-gray-400">
                      {auditDocs.length} file{auditDocs.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {docsLockedAfterSubmit && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3">
                      🔒 Documents locked after submission. Cannot upload or remove.
                    </p>
                  )}

                  <p className="text-xs text-gray-400 mb-3">
                    Upload physical audit reports, photos, or supporting documents. Max 20MB per file. PDF, image or Word.
                  </p>

                  {canUploadAuditDoc && (
                    <div className="mb-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleDocUpload(file);
                        }}
                        className="hidden"
                        id="audit-doc-upload"
                      />
                      {uploading ? (
                        <div className="border-2 border-[#1B6B6B] border-solid rounded-xl p-4 bg-[#E8F5F5]">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 border-2 border-[#1B6B6B] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#1B6B6B] truncate">Uploading...</p>
                              <p className="text-xs text-[#1B6B6B]/80">Please wait, do not close this window</p>
                            </div>
                            <span className="text-sm font-bold text-[#1B6B6B] flex-shrink-0">{uploadProgress}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-[#1B6B6B]/20">
                            <div
                              className="h-full bg-[#1B6B6B] rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <label
                          htmlFor="audit-doc-upload"
                          className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-[#1B6B6B] hover:text-[#1B6B6B] hover:bg-[#E8F5F5]/50 transition-all cursor-pointer"
                        >
                          <span className="text-xl">📎</span>
                          <span>Upload PDF, image or Word doc</span>
                          <span className="text-xs text-gray-300">· Max 20MB</span>
                        </label>
                      )}
                    </div>
                  )}

                  {auditDocs.length > 0 ? (
                    <div className="space-y-2">
                      {auditDocs.map((docRecord) => (
                        <div
                          key={docRecord.id}
                          className="p-3 bg-gray-50 border border-gray-100 rounded-xl hover:border-gray-200 transition-all"
                        >
                          {isAuditDocImageType(docRecord.type) && docRecord.url && (
                            <div className="mb-2">
                              <button
                                type="button"
                                className="w-full p-0 border-0 bg-transparent rounded-xl overflow-hidden cursor-zoom-in"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  (async () => {
                                    try {
                                      const fileRef = ref(storage, docRecord.storagePath || docRecord.url);
                                      const blob = await getBlob(fileRef);
                                      const blobUrl = URL.createObjectURL(blob);
                                      window.open(blobUrl, '_blank');
                                      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
                                    } catch { /* ignore */ }
                                  })();
                                }}
                              >
                                <img
                                  src={docRecord.url}
                                  alt={docRecord.name}
                                  loading="lazy"
                                  className="w-full max-h-32 object-cover rounded-xl border border-gray-100"
                                />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                              {fileDocIconType(docRecord.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{docRecord.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs text-gray-400">{formatAuditDocSize(docRecord.size)}</span>
                                <span className="text-xs text-gray-300">·</span>
                                <span className="text-xs text-gray-400">{docRecord.uploadedByName}</span>
                                <span className="text-xs text-gray-300">·</span>
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                                    docRecord.uploadedByRole === 'auditor' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'
                                  }`}
                                >
                                  {docRecord.uploadedByRole === 'auditor' ? '👷 Auditor' : '🧑‍💼 Manager'}
                                </span>
                                <span className="text-xs text-gray-300">·</span>
                                <span className="text-xs text-gray-400">
                                  {docRecord.uploadedAt ? new Date(docRecord.uploadedAt).toLocaleDateString('en-GB') : '—'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <a
                                href={docRecord.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 rounded-xl bg-[#E8F5F5] px-2.5 py-1.5 text-xs font-medium text-[#1B6B6B] transition-colors hover:bg-[#1B6B6B] hover:text-white"
                                title="View document"
                              >
                                {auditDocViewLabel(docRecord.type)}
                              </a>
                              <a
                                href={docRecord.url}
                                download={docRecord.name}
                                onClick={(e) => e.stopPropagation()}
                                className="flex h-8 w-8 items-center justify-center rounded-xl text-[#1B6B6B] hover:bg-gray-200 text-xs"
                                title="Download"
                              >
                                ⬇️
                              </a>
                              {canDeleteAuditorDoc(docRecord) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDocDelete(docRecord);
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {canManage && !isAuditor && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-700 mb-3">
                    📎 Audit Documents
                    <span className="text-xs font-normal text-gray-400 ml-2">
                      ({auditDocs.length} file{auditDocs.length !== 1 ? 's' : ''})
                    </span>
                  </h4>

                  {auditDocs.length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-xl">
                      <p className="text-xs text-gray-400">No documents uploaded by auditor</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {auditDocs.map((docRecord) => (
                        <div key={docRecord.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                          {isAuditDocImageType(docRecord.type) && docRecord.url && (
                            <div className="mb-2">
                              <button
                                type="button"
                                className="w-full p-0 border-0 bg-transparent rounded-xl overflow-hidden cursor-zoom-in"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  (async () => {
                                    try {
                                      const fileRef = ref(storage, docRecord.storagePath || docRecord.url);
                                      const blob = await getBlob(fileRef);
                                      const blobUrl = URL.createObjectURL(blob);
                                      window.open(blobUrl, '_blank');
                                      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
                                    } catch { /* ignore */ }
                                  })();
                                }}
                              >
                                <img
                                  src={docRecord.url}
                                  alt={docRecord.name}
                                  loading="lazy"
                                  className="w-full max-h-32 object-cover rounded-xl border border-gray-100"
                                />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                              {fileDocIconType(docRecord.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{docRecord.name}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs text-gray-400">{formatAuditDocSize(docRecord.size)}</span>
                                <span className="text-xs text-gray-300">·</span>
                                <span className="text-xs text-gray-400">{docRecord.uploadedByName}</span>
                                <span className="text-xs text-gray-300">·</span>
                                <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">👷 Auditor</span>
                                <span className="text-xs text-gray-300">·</span>
                                <span className="text-xs text-gray-400">
                                  {docRecord.uploadedAt ? new Date(docRecord.uploadedAt).toLocaleDateString('en-GB') : '—'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <a
                                href={docRecord.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 rounded-xl bg-[#E8F5F5] px-2.5 py-1.5 text-xs font-medium text-[#1B6B6B] transition-colors hover:bg-[#1B6B6B] hover:text-white"
                                title="View document"
                              >
                                {auditDocViewLabel(docRecord.type)}
                              </a>
                              <a
                                href={docRecord.url}
                                download={docRecord.name}
                                onClick={(e) => e.stopPropagation()}
                                className="flex h-8 w-8 items-center justify-center rounded-xl text-[#1B6B6B] hover:bg-gray-200 text-xs"
                                title="Download"
                              >
                                ⬇️
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isAuditorMode && activeTab === 'overview' && (
            <div className="space-y-4">
              {totalItems > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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

              {auditDocs.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    📎 Documents ({auditDocs.length})
                  </p>
                  <div className="space-y-2">
                    {auditDocs.map((docRecord) => (
                      <div key={docRecord.id} className="p-2.5 bg-gray-50 rounded-xl hover:bg-[#E8F5F5] transition-colors group">
                        {isAuditDocImageType(docRecord.type) && docRecord.url && (
                          <div className="mb-2">
                            <button
                              type="button"
                              className="w-full p-0 border-0 bg-transparent rounded-xl overflow-hidden cursor-zoom-in"
                              onClick={(e) => {
                                e.stopPropagation();
                                (async () => {
                                  try {
                                    const fileRef = ref(storage, docRecord.storagePath || docRecord.url);
                                    const blob = await getBlob(fileRef);
                                    const blobUrl = URL.createObjectURL(blob);
                                    window.open(blobUrl, '_blank');
                                    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
                                  } catch { /* ignore */ }
                                })();
                              }}
                            >
                              <img
                                src={docRecord.url}
                                alt={docRecord.name}
                                loading="lazy"
                                className="w-full max-h-32 object-cover rounded-xl border border-gray-100"
                              />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{fileDocIconType(docRecord.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#1B6B6B] group-hover:underline truncate">{docRecord.name}</p>
                            <p className="text-xs text-gray-400">
                              {formatAuditDocSize(docRecord.size)} · {docRecord.uploadedByName}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <a
                              href={docRecord.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 rounded-xl bg-[#E8F5F5] px-2.5 py-1.5 text-xs font-medium text-[#1B6B6B] transition-colors hover:bg-[#1B6B6B] hover:text-white"
                              title="View document"
                            >
                              {auditDocViewLabel(docRecord.type)}
                            </a>
                            <a
                              href={docRecord.url}
                              download={docRecord.name}
                              onClick={(e) => e.stopPropagation()}
                              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#1B6B6B] hover:bg-gray-200 text-xs"
                              title="Download"
                            >
                              ⬇️
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {audit.status === 'Closed' && audit.auditRating > 0 && (
                <div className="bg-white border border-gray-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Manager Feedback</p>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`text-xl ${n <= audit.auditRating ? 'text-amber-400' : 'text-gray-200'}`}>
                          ⭐
                        </span>
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-gray-700">
                      {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][audit.auditRating]}
                    </span>
                    <span className="text-xs text-gray-400">({audit.auditRating}/5)</span>
                  </div>
                  {audit.closeFeedback && (
                    <p className="text-sm text-gray-600 italic bg-gray-50 rounded-xl px-3 py-2.5">
                      &quot;{audit.closeFeedback}&quot;
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Reviewed by {audit.closedBy || '—'} ·{' '}
                    {audit.closedAt?.toDate
                      ? audit.closedAt.toDate().toLocaleDateString('en-GB')
                      : audit.closedAt
                        ? new Date(audit.closedAt).toLocaleDateString('en-GB')
                        : ''}
                  </p>
                </div>
              )}

              {canManage && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Manager notes</label>
                  <textarea
                    value={adminNotes}
                    disabled={isClosed}
                    onChange={(e) => {
                      setAdminNotes(e.target.value);
                      autoSave(checklistReview, findingsData, e.target.value, auditDocs);
                    }}
                    rows={3}
                    placeholder="Internal notes about this audit..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B] disabled:bg-gray-50"
                  />
                </div>
              )}
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
                <button type="button" onClick={handleDetailClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600">
                  Close
                </button>
                <button type="button" onClick={handlePrint} className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858]">
                  🖨️ Print Report
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {isAuditorMode && (
                <div className="flex gap-3">
                  {auditorStep === 'checklist' ? (
                    <>
                      <button type="button" onClick={handleDetailClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600">
                        Close
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const unfilled = checklistReview.filter((i) => !i.result);
                          if (unfilled.length > 0) {
                            showError(`Fill all ${unfilled.length} items before continuing`);
                            return;
                          }
                          setAuditorStep('findings');
                          setActiveTab('findings');
                        }}
                        className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold"
                      >
                        Next: Findings →
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setAuditorStep('checklist');
                          setActiveTab('checklist');
                        }}
                        className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600"
                      >
                        ← Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSubmitConfirm(true)}
                        className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold"
                      >
                        📤 Submit to Manager
                      </button>
                    </>
                  )}
                </div>
              )}
              {st === 'Submitted' && canManage && (
                <div className="flex gap-3 flex-wrap">
                  <button type="button" onClick={handleDetailClose} className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSentBackTo(null);
                      setShowSendBackModal(true);
                    }}
                    className="flex-1 min-w-[120px] py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50"
                  >
                    ↩ Send Back
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkUnderReview}
                    disabled={saving}
                    className="flex-1 min-w-[120px] py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
                  >
                    👀 Start Review
                  </button>
                </div>
              )}
              {st === 'Under Review' && canManage && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleDetailClose}
                    className="py-2.5 px-4 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSentBackTo(null);
                      setShowSendBackModal(true);
                    }}
                    className="flex-1 py-2.5 border border-red-300 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50"
                  >
                    ↩ Send Back
                  </button>

                  {activeTab === 'checklist' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('findings')}
                      className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858]"
                    >
                      Findings →
                    </button>
                  )}

                  {activeTab === 'findings' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('overview')}
                      className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858]"
                    >
                      Overview →
                    </button>
                  )}

                  {activeTab === 'overview' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (openFindings.length > 0) {
                          showError(`Resolve all ${openFindings.length} findings first`);
                          return;
                        }
                        setClosedAuditData(null);
                        setShowCloseModal(true);
                      }}
                      disabled={openFindings.length > 0}
                      className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ✅ Close Audit
                    </button>
                  )}
                </div>
              )}
              {!(st === 'Submitted' && canManage) && !(st === 'Under Review' && canManage) && !isAuditorMode && (
                <div className="flex gap-3">
                  <button type="button" onClick={handleDetailClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                    Close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
          <div
            role="presentation"
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowSubmitConfirm(false)}
          />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-6 shadow-sm sm:mx-4">
            <div className="text-center mb-5">
              <div className="w-16 h-16 bg-[#E8F5F5] rounded-full flex items-center justify-center text-3xl mx-auto mb-3">📤</div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Submit Audit?</h3>
              <p className="text-sm text-gray-500">
                Once submitted, you cannot edit the checklist or findings. The audit will be sent to your manager for review.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Checklist items</span>
                <span className="font-medium">{checklistReview.length} reviewed</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">✅ Pass</span>
                <span className="font-medium text-green-600">{checklistReview.filter((i) => i.result === 'pass').length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">❌ Fail</span>
                <span className="font-medium text-red-600">{checklistReview.filter((i) => i.result === 'fail').length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Findings added</span>
                <span className="font-medium">{findings.filter((f) => f.addedByRole === 'auditor').length}</span>
              </div>
              {(() => {
                const sc = getAuditScore({ checklistReview });
                if (sc === null) return (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Score</span>
                    <span className="font-medium text-gray-400">—</span>
                  </div>
                );
                const color = sc >= 80 ? '#639922' : sc >= 60 ? '#EF9F27' : '#E24B4A';
                const labelBg = sc >= 80 ? '#EAF3DE' : sc >= 60 ? '#FAEEDA' : '#FCEBEB';
                const labelTxt = sc >= 80 ? '#3B6D11' : sc >= 60 ? '#633806' : '#791F1F';
                const lbl = sc >= 80 ? 'Excellent' : sc >= 60 ? 'Needs attention' : 'Critical';
                const arc = 113.1;
                const offset = arc * (1 - sc / 100);
                return (
                  <div className="flex flex-col items-center py-1">
                    <svg width="90" height="52" viewBox="0 0 90 52" aria-label={`Compliance score ${sc}%`}>
                      <path d="M9 48 A36 36 0 0 1 81 48" fill="none" stroke="#F3F4F6" strokeWidth="8" strokeLinecap="round" />
                      <path d="M9 48 A36 36 0 0 1 81 48" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={arc} strokeDashoffset={offset} />
                      <text x="45" y="44" textAnchor="middle" fontSize="15" fontWeight="600" fill={color}>{sc}%</text>
                    </svg>
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full" style={{ background: labelBg, color: labelTxt }}>{lbl}</span>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 py-2.5 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
              >
                {saving ? 'Submitting...' : '📤 Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseModal && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
          <div
            role="presentation"
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowCloseModal(false);
              setClosedAuditData(null);
              setAuditRating(0);
              setCloseFeedback('');
            }}
          />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-6 shadow-sm sm:mx-4">
            {closedAuditData ? (
              <>
                <h3 className="text-lg font-semibold text-gray-800 mb-2 text-center">Audit closed</h3>
                <p className="text-sm text-gray-500 mb-4 text-center">You can notify the lead auditor on WhatsApp.</p>
                <WhatsAppButton
                  phone={closedAuditData.phone}
                  message={
                    `Dear ${closedAuditData.name} Garu,\n\n` +
                    `Audit *${closedAuditData.refId}* — ${closedAuditData.typeName}` +
                    (closedAuditData.branch ? ` (${closedAuditData.branch})` : '') +
                    ` has been reviewed and *Closed*.\n\n` +
                    (closedAuditData.rating
                      ? `Rating: ${'⭐'.repeat(closedAuditData.rating)}\n\n`
                      : '') +
                    `Thank you for completing the audit.\n\n` +
                    `Regards,\nAudit Manager`
                  }
                  label="Notify Auditor on WhatsApp"
                  className="w-full justify-center"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowCloseModal(false);
                    setClosedAuditData(null);
                    setAuditRating(0);
                    setCloseFeedback('');
                    handleDetailClose();
                  }}
                  className="mt-3 w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">✅ Close Audit</h3>
                <p className="text-sm text-gray-500 mb-5">
                  {audit.auditRefId} — {audit.auditTypeName}
                </p>

                {getAuditScore({ checklistReview }) !== null && (
                  <div
                    className={`p-4 rounded-xl mb-5 text-center ${
                      (getAuditScore({ checklistReview }) || 0) >= 80
                        ? 'bg-green-50 border border-green-100'
                        : (getAuditScore({ checklistReview }) || 0) >= 60
                          ? 'bg-amber-50 border border-amber-100'
                          : 'bg-red-50 border border-red-100'
                    }`}
                  >
                    <p
                      className={`text-3xl font-bold ${
                        (getAuditScore({ checklistReview }) || 0) >= 80
                          ? 'text-green-700'
                          : (getAuditScore({ checklistReview }) || 0) >= 60
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {getAuditScore({ checklistReview })}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Compliance Score</p>
                  </div>
                )}

                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">Rate this Audit</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAuditRating(n)}
                        className={`flex-1 py-3 rounded-xl text-xl transition-all border-2 ${
                          auditRating >= n ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-100 hover:border-amber-200'
                        }`}
                      >
                        ⭐
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-400">Poor</span>
                    <span className="text-xs text-gray-400">Excellent</span>
                  </div>
                  {auditRating > 0 && (
                    <p className="text-xs text-center text-amber-600 font-medium mt-1">
                      {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][auditRating]}
                    </p>
                  )}
                </div>

                <div className="mb-5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                    Final Comments (optional)
                  </label>
                  <textarea
                    value={closeFeedback}
                    onChange={(e) => setCloseFeedback(e.target.value)}
                    rows={3}
                    placeholder="Overall observations, recommendations, or notes for this audit..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1B6B6B]"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCloseModal(false);
                      setClosedAuditData(null);
                      setAuditRating(0);
                      setCloseFeedback('');
                    }}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseAudit}
                    disabled={saving}
                    className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? 'Closing...' : '✅ Close Audit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showSendBackModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
          <div
            role="presentation"
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowSendBackModal(false);
              setSendBackReason('');
              setSentBackTo(null);
            }}
          />
          <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-6 shadow-sm sm:mx-4">
            {sentBackTo ? (
              <>
                <h3 className="text-base font-semibold text-gray-800 mb-2 text-center">Sent back</h3>
                <p className="text-sm text-gray-500 mb-4 text-center">Notify the auditor on WhatsApp if you like.</p>
                <WhatsAppButton
                  phone={sentBackTo.phone}
                  message={
                    `Dear ${sentBackTo.name} Garu,\n\n` +
                    `Your audit *${sentBackTo.refId}* has been sent back for corrections.\n\n` +
                    `*Reason:* ${sentBackTo.reason}\n\n` +
                    `Please log in to AttendX, make the corrections, and resubmit.\n\n` +
                    `Thank you,\nAudit Manager`
                  }
                  label="Notify Auditor on WhatsApp"
                  className="w-full justify-center"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowSendBackModal(false);
                    setSentBackTo(null);
                    handleDetailClose();
                  }}
                  className="mt-3 w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-800 mb-2">↩ Send Back for Corrections</h3>
                <p className="text-sm text-gray-500 mb-4">The auditor will see this reason and must resubmit after corrections.</p>
                <textarea
                  value={sendBackReason}
                  onChange={(e) => setSendBackReason(e.target.value)}
                  rows={3}
                  placeholder="Reason for sending back..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-red-400 mb-4"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSendBackModal(false);
                      setSendBackReason('');
                      setSentBackTo(null);
                    }}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSendBack}
                    disabled={!sendBackReason.trim() || saving}
                    className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Sending…' : '↩ Send Back'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
