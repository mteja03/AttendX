import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-coll-ref'),
  doc: vi.fn(() => 'mock-doc-ref'),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(() => 'mock-query'),
  where: vi.fn(() => 'mock-where'),
  orderBy: vi.fn(() => 'mock-orderBy'),
  limit: vi.fn(() => 'mock-limit'),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: { fromDate: vi.fn((d) => d) },
}));

vi.mock('../../firebase/config', () => ({ db: {} }));

vi.mock('../../utils/firestoreWithRetry', () => ({
  withRetry: vi.fn((fn) => fn()),
}));

import {
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

import {
  fetchCompanies,
  fetchCompany,
  addCompany,
  updateCompany,
} from '../companyService';

const makeDocSnap = (id, data, exists = true) => ({
  id,
  exists: () => exists,
  data: () => data,
});

const makeCollSnap = (docs) => ({
  docs: docs.map(([id, data]) => ({ id, data: () => data })),
});

beforeEach(() => {
  vi.clearAllMocks();
  serverTimestamp.mockReturnValue('SERVER_TIMESTAMP');
});

// ---------------------------------------------------------------------------

describe('fetchCompanies', () => {
  it('calls getDocs and maps docs to array with id fields', async () => {
    getDocs.mockResolvedValue(makeCollSnap([['co1', { name: 'Acme Corp' }]]));

    const result = await fetchCompanies();

    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: 'co1', name: 'Acme Corp' }]);
  });

  it('returns an empty array when no companies exist', async () => {
    getDocs.mockResolvedValue(makeCollSnap([]));

    const result = await fetchCompanies();

    expect(result).toEqual([]);
  });

  it('maps multiple companies correctly', async () => {
    getDocs.mockResolvedValue(
      makeCollSnap([
        ['co1', { name: 'Acme Corp' }],
        ['co2', { name: 'Globex' }],
      ])
    );

    const result = await fetchCompanies();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'co1', name: 'Acme Corp' });
    expect(result[1]).toEqual({ id: 'co2', name: 'Globex' });
  });
});

// ---------------------------------------------------------------------------

describe('fetchCompany', () => {
  it('returns null when the document does not exist', async () => {
    getDoc.mockResolvedValue(makeDocSnap('co1', {}, false));

    const result = await fetchCompany('co1');

    expect(result).toBeNull();
  });

  it('returns company object with id when document exists', async () => {
    getDoc.mockResolvedValue(makeDocSnap('co1', { name: 'Acme Corp', industry: 'Tech' }));

    const result = await fetchCompany('co1');

    expect(result).toEqual({ id: 'co1', name: 'Acme Corp', industry: 'Tech' });
  });

  it('calls getDoc exactly once', async () => {
    getDoc.mockResolvedValue(makeDocSnap('co1', { name: 'Acme Corp' }));

    await fetchCompany('co1');

    expect(getDoc).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------

describe('addCompany', () => {
  it('calls addDoc with createdAt and updatedAt set to serverTimestamp', async () => {
    addDoc.mockResolvedValue({ id: 'new-co-id' });

    await addCompany({ name: 'NewCo', industry: 'Finance' });

    expect(addDoc).toHaveBeenCalledTimes(1);
    const [, payload] = addDoc.mock.calls[0];
    expect(payload.name).toBe('NewCo');
    expect(payload.industry).toBe('Finance');
    expect(payload.createdAt).toBe('SERVER_TIMESTAMP');
    expect(payload.updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('returns the DocumentReference from addDoc', async () => {
    addDoc.mockResolvedValue({ id: 'new-co-id' });

    const ref = await addCompany({ name: 'NewCo' });

    expect(ref).toEqual({ id: 'new-co-id' });
  });
});

// ---------------------------------------------------------------------------

describe('updateCompany', () => {
  it('calls updateDoc with the provided data plus updatedAt', async () => {
    updateDoc.mockResolvedValue(undefined);

    await updateCompany('co1', { name: 'Acme Updated' });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.name).toBe('Acme Updated');
    expect(payload.updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('calls updateDoc with the correct doc reference', async () => {
    updateDoc.mockResolvedValue(undefined);

    await updateCompany('co1', { name: 'Acme Updated' });

    expect(updateDoc).toHaveBeenCalledWith('mock-doc-ref', expect.any(Object));
  });

  it('does not include fields that were not passed in the update', async () => {
    updateDoc.mockResolvedValue(undefined);

    await updateCompany('co1', { industry: 'Retail' });

    const [, payload] = updateDoc.mock.calls[0];
    expect(payload).not.toHaveProperty('name');
    expect(payload.industry).toBe('Retail');
  });
});
