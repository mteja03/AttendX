import { logEvent as firebaseLogEvent } from 'firebase/analytics';
import { analytics } from '../firebase/config';

/**
 * Safe analytics event logger — never throws.
 */
const track = (eventName, params = {}) => {
  try {
    if (!analytics) return;
    firebaseLogEvent(analytics, eventName, {
      ...params,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // ignore
  }
};

// ─── Page Views ───────────────────────────

export const trackPageView = (pageName) => {
  track('page_view', {
    page_title: pageName,
    page_location: typeof window !== 'undefined' ? window.location.href : '',
  });
};

// ─── Employee Events ──────────────────────

export const trackEmployeeAdded = () => {
  track('employee_added');
};

export const trackEmployeeDeleted = () => {
  track('employee_deleted');
};

export const trackPhotoUploaded = () => {
  track('employee_photo_uploaded');
};

// ─── Leave Events ─────────────────────────

export const trackLeaveAdded = (leaveType) => {
  track('leave_added', { leave_type: leaveType });
};

export const trackLeaveApproved = () => {
  track('leave_approved');
};

export const trackLeaveRejected = () => {
  track('leave_rejected');
};

// ─── Offboarding Events ───────────────────

export const trackResignationRecorded = () => {
  track('resignation_recorded');
};

export const trackOffboardingCompleted = () => {
  track('offboarding_completed');
};

export const trackResignationWithdrawn = () => {
  track('resignation_withdrawn');
};

// ─── Onboarding Events ───────────────────

export const trackOnboardingStarted = () => {
  track('onboarding_started');
};

export const trackOnboardingCompleted = () => {
  track('onboarding_completed');
};

// ─── Asset Events ─────────────────────────

export const trackAssetAdded = (assetType) => {
  track('asset_added', { asset_type: assetType });
};

export const trackAssetAssigned = () => {
  track('asset_assigned');
};

// ─── Document Events ─────────────────────

export const trackDocumentUploaded = (docType) => {
  track('document_uploaded', { doc_type: docType });
};

// ─── Feature Usage ────────────────────────

export const trackReportViewed = (reportType) => {
  track('report_viewed', { report_type: reportType });
};

export const trackFilterUsed = (page) => {
  track('filter_used', { page });
};

export const trackExcelDownloaded = (page) => {
  track('excel_downloaded', { page });
};

export const trackPrintUsed = (page) => {
  track('print_used', { page });
};

// ─── Auth Events ──────────────────────────

export const trackLogin = () => {
  track('login', { method: 'google' });
};

export const trackLogout = () => {
  track('logout');
};

export const trackSessionTimeout = () => {
  track('session_timeout');
};

// ─── Settings Events ─────────────────────

export const trackSettingsChanged = (settingType) => {
  track('settings_changed', { setting_type: settingType });
};
