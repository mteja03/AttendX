/**
 * assetService.js
 * Data access layer for the assets subcollection:
 *   companies/{companyId}/assets
 *
 * All functions throw on error — callers are responsible for handling.
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
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
 * Returns the Firestore CollectionReference for a company's assets.
 * @param {string} companyId
 */
function assetCollRef(companyId) {
  return collection(db, 'companies', companyId, 'assets');
}

/**
 * Returns the Firestore DocumentReference for a single asset.
 * @param {string} companyId
 * @param {string} assetId
 */
function assetDocRef(companyId, assetId) {
  return doc(db, 'companies', companyId, 'assets', assetId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all assets for a company, with optional filters.
 *
 * @param {string} companyId
 * @param {object} [options]
 * @param {string} [options.status]      e.g. 'Available' | 'Assigned' | 'Damaged' | 'Lost' | 'In Repair' | 'Retired'
 * @param {string} [options.category]    Asset type/category string, e.g. 'Laptop'.
 * @param {string} [options.assignedTo]  Employee ID to filter assets assigned to a specific employee.
 * @returns {Promise<Array>}
 */
export async function fetchAssets(companyId, { status, category, assignedTo } = {}) {
  const collRef = assetCollRef(companyId);
  const constraints = [];

  // Prefer ordering by createdAt descending when available; fall back to unordered.
  // Both queries are kept to mirror the pattern in Assets.jsx which tries ordered first.
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(500));

  // Apply any Firestore-native equality filters before orderBy if no range query conflicts.
  if (status && status !== 'All') {
    constraints.push(where('status', '==', status));
  }
  if (category) {
    constraints.push(where('type', '==', category));
  }
  if (assignedTo) {
    constraints.push(where('assignedTo', '==', assignedTo));
  }

  let snap;
  try {
    snap = await getDocs(query(collRef, ...constraints));
  } catch {
    // Fallback if composite index is missing: fetch without ordering.
    const fallbackConstraints = [limit(500)];
    if (status && status !== 'All') fallbackConstraints.push(where('status', '==', status));
    if (category) fallbackConstraints.push(where('type', '==', category));
    if (assignedTo) fallbackConstraints.push(where('assignedTo', '==', assignedTo));
    snap = await getDocs(query(collRef, ...fallbackConstraints));
  }

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Subscribe to real-time asset updates for a company, with optional filters.
 *
 * @param {string}   companyId
 * @param {object}   [filters]
 * @param {string}   [filters.status]      Filter by asset status.
 * @param {string}   [filters.category]    Filter by asset type.
 * @param {string}   [filters.assignedTo]  Filter by assigned employee ID.
 * @param {Function} onUpdate              Called with the full array of asset docs on each change.
 * @param {Function} [onError]             Called with the Firestore error if the listener fails.
 * @returns {Function} Unsubscribe function.
 */
export function subscribeToAssets(companyId, filters = {}, onUpdate, onError) {
  const collRef = assetCollRef(companyId);
  const constraints = [orderBy('createdAt', 'desc'), limit(500)];

  if (filters.status && filters.status !== 'All') {
    constraints.push(where('status', '==', filters.status));
  }
  if (filters.category) {
    constraints.push(where('type', '==', filters.category));
  }
  if (filters.assignedTo) {
    constraints.push(where('assignedTo', '==', filters.assignedTo));
  }

  const q = query(collRef, ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

/**
 * Update fields on an asset document. Wraps the write in withRetry for auth resilience.
 *
 * @param {string} companyId
 * @param {string} assetId
 * @param {object} data  Partial asset data to merge.
 * @returns {Promise<void>}
 */
export async function updateAsset(companyId, assetId, data) {
  const ref = assetDocRef(companyId, assetId);
  return withRetry(() => updateDoc(ref, { ...data, updatedAt: serverTimestamp() }));
}

/**
 * Add a new asset document. Wraps the write in withRetry for auth resilience.
 *
 * @param {string} companyId
 * @param {object} data  Asset data (without id).
 * @returns {Promise<import('firebase/firestore').DocumentReference>}
 */
export async function addAsset(companyId, data) {
  const collRef = assetCollRef(companyId);
  return withRetry(() =>
    addDoc(collRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
  );
}

/**
 * Delete an asset document. Wraps the write in withRetry for auth resilience.
 *
 * @param {string} companyId
 * @param {string} assetId
 * @returns {Promise<void>}
 */
export async function deleteAsset(companyId, assetId) {
  const ref = assetDocRef(companyId, assetId);
  return withRetry(() => deleteDoc(ref));
}
