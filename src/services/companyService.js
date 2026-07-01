/**
 * companyService.js
 * Data access layer for the top-level companies collection:
 *   companies/{companyId}
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
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { withRetry } from '../utils/firestoreWithRetry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the Firestore CollectionReference for the top-level companies collection.
 */
function companiesCollRef() {
  return collection(db, 'companies');
}

/**
 * Returns the Firestore DocumentReference for a single company.
 * @param {string} companyId
 */
function companyDocRef(companyId) {
  return doc(db, 'companies', companyId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all companies (for admin dashboards / company-switcher).
 * Ordered by createdAt descending, capped at 100 results.
 *
 * @returns {Promise<Array>}
 */
export async function fetchCompanies() {
  const q = query(companiesCollRef(), orderBy('createdAt', 'desc'), limit(100));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch a single company document.
 *
 * @param {string} companyId
 * @returns {Promise<object|null>} Company data with `id` field, or null if not found.
 */
export async function fetchCompany(companyId) {
  const snap = await getDoc(companyDocRef(companyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Add a new company document. Wraps the write in withRetry for auth resilience.
 *
 * @param {object} data  Company data (without id).
 * @returns {Promise<import('firebase/firestore').DocumentReference>}
 */
export async function addCompany(data) {
  return withRetry(() =>
    addDoc(companiesCollRef(), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
  );
}

/**
 * Update fields on a company document. Wraps the write in withRetry for auth resilience.
 *
 * @param {string} companyId
 * @param {object} data  Partial company data to merge.
 * @returns {Promise<void>}
 */
export async function updateCompany(companyId, data) {
  const ref = companyDocRef(companyId);
  return withRetry(() => updateDoc(ref, { ...data, updatedAt: serverTimestamp() }));
}
