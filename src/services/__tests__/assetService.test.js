import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-coll-ref'),
  doc: vi.fn(() => 'mock-doc-ref'),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
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
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

import {
  fetchAssets,
  addAsset,
  updateAsset,
  deleteAsset,
  subscribeToAssets,
} from '../assetService';

const makeCollSnap = (docs) => ({
  docs: docs.map(([id, data]) => ({ id, data: () => data })),
});

beforeEach(() => {
  vi.clearAllMocks();
  serverTimestamp.mockReturnValue('SERVER_TIMESTAMP');
});

// ---------------------------------------------------------------------------

describe('fetchAssets', () => {
  it('calls getDocs and maps docs to array with id fields', async () => {
    getDocs.mockResolvedValue(makeCollSnap([['asset1', { type: 'Laptop', status: 'Available' }]]));

    const result = await fetchAssets('company1');

    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: 'asset1', type: 'Laptop', status: 'Available' }]);
  });

  it('returns an empty array when no assets exist', async () => {
    getDocs.mockResolvedValue(makeCollSnap([]));

    const result = await fetchAssets('company1');

    expect(result).toEqual([]);
  });

  it('maps multiple docs correctly', async () => {
    getDocs.mockResolvedValue(
      makeCollSnap([
        ['asset1', { type: 'Laptop' }],
        ['asset2', { type: 'Phone' }],
      ])
    );

    const result = await fetchAssets('company1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'asset1', type: 'Laptop' });
    expect(result[1]).toEqual({ id: 'asset2', type: 'Phone' });
  });

  it('falls back to getDocs without ordering when first query throws', async () => {
    getDocs
      .mockRejectedValueOnce(new Error('index missing'))
      .mockResolvedValueOnce(makeCollSnap([['asset1', { type: 'Laptop' }]]));

    const result = await fetchAssets('company1');

    expect(getDocs).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ id: 'asset1', type: 'Laptop' }]);
  });
});

// ---------------------------------------------------------------------------

describe('addAsset', () => {
  it('calls addDoc with createdAt and updatedAt set to serverTimestamp', async () => {
    addDoc.mockResolvedValue({ id: 'new-asset-id' });

    await addAsset('company1', { type: 'Monitor', status: 'Available' });

    expect(addDoc).toHaveBeenCalledTimes(1);
    const [, payload] = addDoc.mock.calls[0];
    expect(payload.type).toBe('Monitor');
    expect(payload.createdAt).toBe('SERVER_TIMESTAMP');
    expect(payload.updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('returns the DocumentReference from addDoc', async () => {
    addDoc.mockResolvedValue({ id: 'new-asset-id' });

    const ref = await addAsset('company1', { type: 'Monitor' });

    expect(ref).toEqual({ id: 'new-asset-id' });
  });
});

// ---------------------------------------------------------------------------

describe('updateAsset', () => {
  it('calls updateDoc with the provided data plus updatedAt', async () => {
    updateDoc.mockResolvedValue(undefined);

    await updateAsset('company1', 'asset1', { status: 'Assigned' });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.status).toBe('Assigned');
    expect(payload.updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('calls updateDoc with the correct doc reference', async () => {
    updateDoc.mockResolvedValue(undefined);

    await updateAsset('company1', 'asset1', { status: 'Damaged' });

    expect(updateDoc).toHaveBeenCalledWith('mock-doc-ref', expect.any(Object));
  });
});

// ---------------------------------------------------------------------------

describe('deleteAsset', () => {
  it('calls deleteDoc with the correct doc reference', async () => {
    deleteDoc.mockResolvedValue(undefined);

    await deleteAsset('company1', 'asset1');

    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(deleteDoc).toHaveBeenCalledWith('mock-doc-ref');
  });
});

// ---------------------------------------------------------------------------

describe('subscribeToAssets', () => {
  it('calls onSnapshot and returns the unsubscribe function', () => {
    const unsubscribe = vi.fn();
    onSnapshot.mockReturnValue(unsubscribe);

    const onUpdate = vi.fn();
    const result = subscribeToAssets('company1', {}, onUpdate);

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(unsubscribe);
  });

  it('calls onUpdate with mapped asset docs on snapshot', () => {
    onSnapshot.mockImplementation((q, onNext) => {
      onNext({
        docs: [{ id: 'asset1', data: () => ({ type: 'Laptop', status: 'Available' }) }],
      });
      return vi.fn();
    });

    const onUpdate = vi.fn();
    subscribeToAssets('company1', {}, onUpdate);

    expect(onUpdate).toHaveBeenCalledWith([{ id: 'asset1', type: 'Laptop', status: 'Available' }]);
  });

  it('calls onError when snapshot listener errors', () => {
    const testError = new Error('permission denied');
    onSnapshot.mockImplementation((q, onNext, onErr) => {
      onErr(testError);
      return vi.fn();
    });

    const onUpdate = vi.fn();
    const onError = vi.fn();
    subscribeToAssets('company1', {}, onUpdate, onError);

    expect(onError).toHaveBeenCalledWith(testError);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
