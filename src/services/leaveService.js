/**
 * leaveService.js
 * Data access layer for the leave subcollection:
 *   companies/{companyId}/leave
 *
 * All functions throw on error — callers are responsible for handling.
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { withRetry } from '../utils/firestoreWithRetry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the Firestore CollectionReference for a company's leave requests.
 * @param {string} companyId
 */
function leaveCollRef(companyId) {
  return collection(db, 'companies', companyId, 'leave');
}

/**
 * Returns the Firestore DocumentReference for a single leave request.
 * @param {string} companyId
 * @param {string} leaveId
 */
function leaveDocRef(companyId, leaveId) {
  return doc(db, 'companies', companyId, 'leave', leaveId);
}

/**
 * Build Firestore Timestamp boundaries for a calendar year.
 * @param {number} year  e.g. 2024
 * @returns {{ yearStart: Timestamp, yearEnd: Timestamp }}
 */
function yearBounds(year) {
  const yearStart = Timestamp.fromDate(new Date(`${year}-01-01T00:00:00`));
  const yearEnd = Timestamp.fromDate(new Date(`${year}-12-31T23:59:59`));
  return { yearStart, yearEnd };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch leave requests with optional filters.
 *
 * @param {string} companyId
 * @param {object} [options]
 * @param {string} [options.status]      e.g. 'Pending' | 'Approved' | 'Rejected'
 * @param {string} [options.employeeId]  Filter to a specific employee.
 * @param {number} [options.year]        Restrict to leave records whose startDate falls in this year.
 * @param {number} [options.limit]       Max number of docs to return (default 500).
 * @returns {Promise<Array>}
 */
export async function fetchLeaveRequests(companyId, { status, employeeId, year, limit: limitCount = 500 } = {}) {
  const collRef = leaveCollRef(companyId);
  const constraints = [];

  if (year) {
    const { yearStart, yearEnd } = yearBounds(year);
    constraints.push(where('startDate', '>=', yearStart));
    constraints.push(where('startDate', '<=', yearEnd));
    constraints.push(orderBy('startDate', 'desc'));
  } else {
    constraints.push(orderBy('appliedAt', 'desc'));
  }

  if (status) {
    // Note: combining inequality (startDate range) with equality on a different field
    // may require a composite index in Firestore. Status filter is applied client-side
    // when a year filter is also active to avoid index requirements.
  }

  if (employeeId) {
    constraints.push(where('employeeId', '==', employeeId));
  }

  constraints.push(limit(limitCount));

  const q = query(collRef, ...constraints);
  const snap = await getDocs(q);
  let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Client-side status filter (avoids composite index requirement when combined with range query)
  if (status) {
    results = results.filter((r) => r.status === status);
  }

  return results;
}

/**
 * Subscribe to real-time leave request updates for a company, with optional filters.
 *
 * @param {string}   companyId
 * @param {object}   [filters]
 * @param {string}   [filters.employeeId]  Restrict to a specific employee.
 * @param {number}   [filters.year]        Restrict to a calendar year.
 * @param {Function} onUpdate              Called with the full array of leave docs on each change.
 * @param {Function} [onError]             Called with the Firestore error if the listener fails.
 * @returns {Function} Unsubscribe function.
 */
export function subscribeToLeaveRequests(companyId, filters = {}, onUpdate, onError) {
  const collRef = leaveCollRef(companyId);
  const constraints = [];

  if (filters.year) {
    const { yearStart, yearEnd } = yearBounds(filters.year);
    constraints.push(where('startDate', '>=', yearStart));
    constraints.push(where('startDate', '<=', yearEnd));
    constraints.push(orderBy('startDate', 'desc'));
  } else {
    constraints.push(orderBy('appliedAt', 'desc'));
  }

  if (filters.employeeId) {
    constraints.push(where('employeeId', '==', filters.employeeId));
  }

  constraints.push(limit(500));

  const q = query(collRef, ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onUpdate(results);
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

/**
 * Update the status of a leave request (approve / reject / cancel).
 * Wraps the write in withRetry for auth resilience.
 *
 * @param {string} companyId
 * @param {string} leaveId
 * @param {string} status            New status value, e.g. 'Approved' | 'Rejected' | 'Cancelled'.
 * @param {object} [meta]
 * @param {string} [meta.approvedBy]  UID or name of the approver.
 * @param {*}      [meta.approvedAt]  Timestamp of approval (defaults to serverTimestamp()).
 * @param {string} [meta.notes]       Optional notes from the approver/rejector.
 * @returns {Promise<void>}
 */
export async function updateLeaveStatus(companyId, leaveId, status, { approvedBy, approvedAt, notes } = {}) {
  const ref = leaveDocRef(companyId, leaveId);
  const update = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (approvedBy !== undefined) update.approvedBy = approvedBy;
  if (approvedAt !== undefined) update.approvedAt = approvedAt;
  else if (status === 'Approved') update.approvedAt = serverTimestamp();
  if (notes !== undefined) update.notes = notes;

  return withRetry(() => updateDoc(ref, update));
}

/**
 * Submit a new leave request. Wraps the write in withRetry for auth resilience.
 *
 * @param {string} companyId
 * @param {object} data  Leave request data (without id).
 * @returns {Promise<import('firebase/firestore').DocumentReference>}
 */
export async function addLeaveRequest(companyId, data) {
  const collRef = leaveCollRef(companyId);
  return withRetry(() =>
    addDoc(collRef, { ...data, appliedAt: serverTimestamp(), createdAt: serverTimestamp() }),
  );
}
