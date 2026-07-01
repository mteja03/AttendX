import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-coll-ref'),
  doc: vi.fn(() => 'mock-doc-ref'),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
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
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

import {
  fetchLeaveRequests,
  addLeaveRequest,
  updateLeaveStatus,
  subscribeToLeaveRequests,
} from '../leaveService';

const makeCollSnap = (docs) => ({
  docs: docs.map(([id, data]) => ({ id, data: () => data })),
});

beforeEach(() => {
  vi.clearAllMocks();
  serverTimestamp.mockReturnValue('SERVER_TIMESTAMP');
});

// ---------------------------------------------------------------------------

describe('fetchLeaveRequests', () => {
  it('calls getDocs and maps docs to array with id fields', async () => {
    getDocs.mockResolvedValue(
      makeCollSnap([['leave1', { employeeId: 'emp1', status: 'Pending' }]])
    );

    const result = await fetchLeaveRequests('company1');

    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: 'leave1', employeeId: 'emp1', status: 'Pending' }]);
  });

  it('returns an empty array when no leave requests exist', async () => {
    getDocs.mockResolvedValue(makeCollSnap([]));

    const result = await fetchLeaveRequests('company1');

    expect(result).toEqual([]);
  });

  it('filters client-side by status when status option is provided', async () => {
    getDocs.mockResolvedValue(
      makeCollSnap([
        ['leave1', { status: 'Pending' }],
        ['leave2', { status: 'Approved' }],
      ])
    );

    const result = await fetchLeaveRequests('company1', { status: 'Approved' });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('leave2');
  });

  it('maps multiple docs with correct id and data', async () => {
    getDocs.mockResolvedValue(
      makeCollSnap([
        ['leave1', { status: 'Pending', days: 2 }],
        ['leave2', { status: 'Approved', days: 5 }],
      ])
    );

    const result = await fetchLeaveRequests('company1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'leave1', status: 'Pending', days: 2 });
    expect(result[1]).toEqual({ id: 'leave2', status: 'Approved', days: 5 });
  });
});

// ---------------------------------------------------------------------------

describe('addLeaveRequest', () => {
  it('calls addDoc with appliedAt and createdAt set to serverTimestamp', async () => {
    addDoc.mockResolvedValue({ id: 'new-leave-id' });

    await addLeaveRequest('company1', { employeeId: 'emp1', days: 3 });

    expect(addDoc).toHaveBeenCalledTimes(1);
    const [, payload] = addDoc.mock.calls[0];
    expect(payload.employeeId).toBe('emp1');
    expect(payload.days).toBe(3);
    expect(payload.appliedAt).toBe('SERVER_TIMESTAMP');
    expect(payload.createdAt).toBe('SERVER_TIMESTAMP');
  });

  it('returns the DocumentReference from addDoc', async () => {
    addDoc.mockResolvedValue({ id: 'new-leave-id' });

    const ref = await addLeaveRequest('company1', { employeeId: 'emp1' });

    expect(ref).toEqual({ id: 'new-leave-id' });
  });
});

// ---------------------------------------------------------------------------

describe('updateLeaveStatus', () => {
  it('calls updateDoc with status and updatedAt', async () => {
    updateDoc.mockResolvedValue(undefined);

    await updateLeaveStatus('company1', 'leave1', 'Approved');

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.status).toBe('Approved');
    expect(payload.updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('adds approvedAt serverTimestamp automatically when status is Approved', async () => {
    updateDoc.mockResolvedValue(undefined);

    await updateLeaveStatus('company1', 'leave1', 'Approved');

    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.approvedAt).toBe('SERVER_TIMESTAMP');
  });

  it('includes optional meta fields when provided', async () => {
    updateDoc.mockResolvedValue(undefined);

    await updateLeaveStatus('company1', 'leave1', 'Rejected', {
      approvedBy: 'manager1',
      notes: 'Not enough notice',
    });

    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.approvedBy).toBe('manager1');
    expect(payload.notes).toBe('Not enough notice');
    expect(payload.status).toBe('Rejected');
  });
});

// ---------------------------------------------------------------------------

describe('subscribeToLeaveRequests', () => {
  it('calls onSnapshot and returns the unsubscribe function', () => {
    const unsubscribe = vi.fn();
    onSnapshot.mockReturnValue(unsubscribe);

    const onUpdate = vi.fn();
    const result = subscribeToLeaveRequests('company1', {}, onUpdate);

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(unsubscribe);
  });

  it('calls onUpdate with mapped leave docs on snapshot', () => {
    onSnapshot.mockImplementation((q, onNext) => {
      onNext({
        docs: [{ id: 'leave1', data: () => ({ status: 'Pending' }) }],
      });
      return vi.fn();
    });

    const onUpdate = vi.fn();
    subscribeToLeaveRequests('company1', {}, onUpdate);

    expect(onUpdate).toHaveBeenCalledWith([{ id: 'leave1', status: 'Pending' }]);
  });
});
