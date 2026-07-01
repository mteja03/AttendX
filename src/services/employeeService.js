/**
 * employeeService.js
 * Data access layer for the employees subcollection:
 *   companies/{companyId}/employees
 *
 * All functions throw on error — callers are responsible for handling.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getCountFromServer,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { withRetry } from '../utils/firestoreWithRetry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the Firestore CollectionReference for a company's employees.
 * @param {string} companyId
 */
function empCollRef(companyId) {
  return collection(db, 'companies', companyId, 'employees');
}

/**
 * Returns the Firestore DocumentReference for a single employee.
 * @param {string} companyId
 * @param {string} empId
 */
function empDocRef(companyId, empId) {
  return doc(db, 'companies', companyId, 'employees', empId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a single page of employees with optional filters and cursor-based pagination.
 *
 * @param {string} companyId
 * @param {object} options
 * @param {number}  [options.pageSize=500]   Number of docs to fetch per page.
 * @param {object}  [options.cursor]         Firestore DocumentSnapshot to start after (for page 2+).
 * @param {object}  [options.filters]        Filter object with optional keys:
 *                                            department, branch, location, employmentType, status, search
 * @returns {Promise<{ employees: Array, lastDoc: object|null, total: number }>}
 */
export async function fetchEmployeePage(companyId, { pageSize = 500, cursor = null, filters = {} } = {}) {
  const collRef = empCollRef(companyId);
  const constraints = [];

  // Status filter (maps to Firestore `status` field)
  if (filters.status) {
    constraints.push(where('status', '==', filters.status));
  }

  // Field-equality filters
  if (filters.department) {
    constraints.push(where('department', '==', filters.department.trim()));
  }
  if (filters.branch) {
    constraints.push(where('branch', '==', filters.branch.trim()));
  }
  if (filters.location) {
    constraints.push(where('location', '==', filters.location.trim()));
  }
  if (filters.employmentType) {
    constraints.push(where('employmentType', '==', filters.employmentType.trim()));
  }

  // Default sort
  constraints.push(orderBy('fullName', 'asc'));
  constraints.push(limit(pageSize));

  // Cursor-based pagination
  if (cursor) {
    constraints.push(startAfter(cursor));
  }

  const q = query(collRef, ...constraints);
  const [snap, countSnap] = await Promise.all([
    getDocs(q),
    getCountFromServer(collRef),
  ]);

  let employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Client-side search filter (Firestore doesn't support full-text search)
  if (filters.search) {
    const term = filters.search.toLowerCase();
    employees = employees.filter(
      (e) =>
        (e.fullName || '').toLowerCase().includes(term) ||
        (e.empId || '').toLowerCase().includes(term) ||
        (e.email || '').toLowerCase().includes(term) ||
        (e.phone || '').toLowerCase().includes(term),
    );
  }

  const lastDoc = snap.docs[snap.docs.length - 1] ?? null;
  const total = countSnap.data().count;

  return { employees, lastDoc, total };
}

/**
 * Fetch a single employee document by ID.
 *
 * @param {string} companyId
 * @param {string} empId
 * @returns {Promise<object|null>} Employee data with `id` field, or null if not found.
 */
export async function fetchEmployeeById(companyId, empId) {
  const snap = await getDoc(empDocRef(companyId, empId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Fetch all employees for a company (for dropdowns, reports, etc.).
 * Ordered by fullName ascending. Optionally filter by status.
 *
 * @param {string} companyId
 * @param {object} [options]
 * @param {string} [options.status]  e.g. 'Active' to restrict to active employees only.
 * @returns {Promise<Array>}
 */
export async function fetchAllEmployees(companyId, { status } = {}) {
  const collRef = empCollRef(companyId);
  const constraints = [];

  if (status) {
    constraints.push(where('status', '==', status));
  }

  constraints.push(orderBy('fullName', 'asc'));
  constraints.push(limit(500));

  const q = query(collRef, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to real-time updates for a single employee document.
 *
 * @param {string}   companyId
 * @param {string}   empId
 * @param {Function} onUpdate  Called with the employee data object (including `id`) on each change.
 *                             Called with `null` if the document does not exist.
 * @param {Function} [onError] Called with the Firestore error if the listener fails.
 * @returns {Function} Unsubscribe function — call it to detach the listener.
 */
export function subscribeToEmployee(companyId, empId, onUpdate, onError) {
  const ref = empDocRef(companyId, empId);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        onUpdate({ id: snap.id, ...snap.data() });
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

/**
 * Update fields on an employee document. Wraps the write in withRetry for auth resilience.
 *
 * @param {string} companyId
 * @param {string} empId
 * @param {object} data   Partial employee data to merge.
 * @returns {Promise<void>}
 */
export async function updateEmployee(companyId, empId, data) {
  const ref = empDocRef(companyId, empId);
  return withRetry(() => updateDoc(ref, { ...data, updatedAt: serverTimestamp() }));
}

/**
 * Delete an employee document. Wraps the write in withRetry for auth resilience.
 *
 * @param {string} companyId
 * @param {string} empId
 * @returns {Promise<void>}
 */
export async function deleteEmployee(companyId, empId) {
  const ref = empDocRef(companyId, empId);
  return withRetry(() => deleteDoc(ref));
}

/**
 * Add a new employee document. Wraps the write in withRetry for auth resilience.
 *
 * @param {string} companyId
 * @param {object} data  Employee data (without id).
 * @returns {Promise<import('firebase/firestore').DocumentReference>}
 */
export async function addEmployee(companyId, data) {
  const collRef = empCollRef(companyId);
  return withRetry(() =>
    addDoc(collRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
  );
}
