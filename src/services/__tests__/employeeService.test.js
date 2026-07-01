import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'mock-coll-ref'),
  doc: vi.fn(() => 'mock-doc-ref'),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(() => 'mock-query'),
  where: vi.fn(() => 'mock-where'),
  orderBy: vi.fn(() => 'mock-orderBy'),
  limit: vi.fn(() => 'mock-limit'),
  startAfter: vi.fn(() => 'mock-startAfter'),
  getCountFromServer: vi.fn(),
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
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

import {
  fetchAllEmployees,
  fetchEmployeeById,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  subscribeToEmployee,
} from '../employeeService';

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

describe('fetchAllEmployees', () => {
  it('calls getDocs and maps docs to objects with id', async () => {
    getDocs.mockResolvedValue(makeCollSnap([['emp1', { fullName: 'Alice' }]]));

    const result = await fetchAllEmployees('company1');

    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ id: 'emp1', fullName: 'Alice' }]);
  });

  it('returns an empty array when collection is empty', async () => {
    getDocs.mockResolvedValue(makeCollSnap([]));

    const result = await fetchAllEmployees('company1');

    expect(result).toEqual([]);
  });

  it('maps multiple docs correctly', async () => {
    getDocs.mockResolvedValue(
      makeCollSnap([
        ['emp1', { fullName: 'Alice' }],
        ['emp2', { fullName: 'Bob' }],
      ])
    );

    const result = await fetchAllEmployees('company1');

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'emp1', fullName: 'Alice' });
    expect(result[1]).toEqual({ id: 'emp2', fullName: 'Bob' });
  });
});

// ---------------------------------------------------------------------------

describe('fetchEmployeeById', () => {
  it('returns null when document does not exist', async () => {
    getDoc.mockResolvedValue(makeDocSnap('emp1', {}, false));

    const result = await fetchEmployeeById('company1', 'emp1');

    expect(result).toBeNull();
  });

  it('returns the employee object with id when document exists', async () => {
    getDoc.mockResolvedValue(makeDocSnap('emp1', { fullName: 'Alice', department: 'Eng' }));

    const result = await fetchEmployeeById('company1', 'emp1');

    expect(result).toEqual({ id: 'emp1', fullName: 'Alice', department: 'Eng' });
  });

  it('calls getDoc once', async () => {
    getDoc.mockResolvedValue(makeDocSnap('emp1', { fullName: 'Alice' }));

    await fetchEmployeeById('company1', 'emp1');

    expect(getDoc).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------

describe('addEmployee', () => {
  it('calls addDoc with createdAt and updatedAt set to serverTimestamp', async () => {
    addDoc.mockResolvedValue({ id: 'new-emp-id' });

    await addEmployee('company1', { fullName: 'Charlie' });

    expect(addDoc).toHaveBeenCalledTimes(1);
    const [, payload] = addDoc.mock.calls[0];
    expect(payload.fullName).toBe('Charlie');
    expect(payload.createdAt).toBe('SERVER_TIMESTAMP');
    expect(payload.updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('returns the DocumentReference from addDoc', async () => {
    addDoc.mockResolvedValue({ id: 'new-emp-id' });

    const ref = await addEmployee('company1', { fullName: 'Charlie' });

    expect(ref).toEqual({ id: 'new-emp-id' });
  });
});

// ---------------------------------------------------------------------------

describe('updateEmployee', () => {
  it('calls updateDoc with the provided data plus updatedAt', async () => {
    updateDoc.mockResolvedValue(undefined);

    await updateEmployee('company1', 'emp1', { department: 'HR' });

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.department).toBe('HR');
    expect(payload.updatedAt).toBe('SERVER_TIMESTAMP');
  });

  it('does not include extraneous keys that were not passed', async () => {
    updateDoc.mockResolvedValue(undefined);

    await updateEmployee('company1', 'emp1', { status: 'Active' });

    const [, payload] = updateDoc.mock.calls[0];
    expect(Object.keys(payload)).toEqual(expect.arrayContaining(['status', 'updatedAt']));
    expect(payload).not.toHaveProperty('fullName');
  });
});

// ---------------------------------------------------------------------------

describe('deleteEmployee', () => {
  it('calls deleteDoc with the correct doc reference', async () => {
    deleteDoc.mockResolvedValue(undefined);

    await deleteEmployee('company1', 'emp1');

    expect(deleteDoc).toHaveBeenCalledTimes(1);
    // doc() returns 'mock-doc-ref'; verify deleteDoc received it
    expect(deleteDoc).toHaveBeenCalledWith('mock-doc-ref');
  });
});

// ---------------------------------------------------------------------------

describe('subscribeToEmployee', () => {
  it('calls onSnapshot and returns the unsubscribe function', () => {
    const unsubscribe = vi.fn();
    onSnapshot.mockReturnValue(unsubscribe);

    const onUpdate = vi.fn();
    const result = subscribeToEmployee('company1', 'emp1', onUpdate);

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(unsubscribe);
  });

  it('calls onUpdate with employee data when document exists', () => {
    onSnapshot.mockImplementation((ref, onNext) => {
      onNext({ exists: () => true, id: 'emp1', data: () => ({ fullName: 'Alice' }) });
      return vi.fn();
    });

    const onUpdate = vi.fn();
    subscribeToEmployee('company1', 'emp1', onUpdate);

    expect(onUpdate).toHaveBeenCalledWith({ id: 'emp1', fullName: 'Alice' });
  });

  it('calls onUpdate with null when document does not exist', () => {
    onSnapshot.mockImplementation((ref, onNext) => {
      onNext({ exists: () => false, id: 'emp1', data: () => ({}) });
      return vi.fn();
    });

    const onUpdate = vi.fn();
    subscribeToEmployee('company1', 'emp1', onUpdate);

    expect(onUpdate).toHaveBeenCalledWith(null);
  });
});
