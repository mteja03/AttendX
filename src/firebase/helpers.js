import { collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from './config';

/**
 * Generic helper to get a document by ID
 */
export async function getDocument(collectionName, docId) {
  const docRef = doc(db, collectionName, docId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

/**
 * Generic helper to get all documents in a collection
 */
export async function getCollection(collectionName, options = {}) {
  const colRef = collection(db, collectionName);
  let q = colRef;
  if (options.where) {
    q = query(colRef, where(options.where.field, options.where.op, options.where.value));
  }
  if (options.orderBy) {
    q = query(q, orderBy(options.orderBy.field, options.orderBy.direction || 'asc'));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Generic helper to add a document
 */
export async function addDocument(collectionName, data) {
  const colRef = collection(db, collectionName);
  const docRef = await addDoc(colRef, { ...data, createdAt: new Date().toISOString() });
  return docRef.id;
}

/**
 * Generic helper to update a document
 */
export async function updateDocument(collectionName, docId, data) {
  const docRef = doc(db, collectionName, docId);
  await updateDoc(docRef, { ...data, updatedAt: new Date().toISOString() });
}

/**
 * Generic helper to delete a document
 */
export async function deleteDocument(collectionName, docId) {
  const docRef = doc(db, collectionName, docId);
  await deleteDoc(docRef);
}
