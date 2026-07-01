import { describe, it, expect, vi } from 'vitest';

// Mock the sentry module so errorHandler doesn't need a real Sentry setup
vi.mock('../sentry', () => ({
  captureError: vi.fn(),
}));

import { getErrorMessage } from '../errorHandler';

describe('getErrorMessage', () => {
  it('returns "unknown_error" for null/undefined', () => {
    expect(getErrorMessage(null)).toBe('unknown_error');
    expect(getErrorMessage(undefined)).toBe('unknown_error');
  });

  // --- auth_expired ---
  it('detects unauthenticated via code', () => {
    expect(getErrorMessage({ code: 'unauthenticated' })).toBe('auth_expired');
  });

  it('detects auth/id-token-expired via code', () => {
    expect(getErrorMessage({ code: 'auth/id-token-expired' })).toBe('auth_expired');
  });

  it('detects auth/user-token-expired via code', () => {
    expect(getErrorMessage({ code: 'auth/user-token-expired' })).toBe('auth_expired');
  });

  it('detects auth/requires-recent-login via code', () => {
    expect(getErrorMessage({ code: 'auth/requires-recent-login' })).toBe('auth_expired');
  });

  it('detects "not authenticated" via message', () => {
    expect(getErrorMessage({ message: 'User is not authenticated' })).toBe('auth_expired');
  });

  // --- permission_denied ---
  it('detects permission-denied via code', () => {
    expect(getErrorMessage({ code: 'permission-denied' })).toBe('permission_denied');
  });

  it('detects unauthorized via message', () => {
    expect(getErrorMessage({ message: 'Unauthorized access attempt' })).toBe('permission_denied');
  });

  it('detects missing or insufficient via message', () => {
    expect(
      getErrorMessage({ message: 'Missing or insufficient permissions.' })
    ).toBe('permission_denied');
  });

  // --- network_error ---
  it('detects network error via message', () => {
    expect(getErrorMessage({ message: 'A network error occurred.' })).toBe('network_error');
  });

  it('detects offline via message', () => {
    expect(getErrorMessage({ message: 'Client is offline' })).toBe('network_error');
  });

  it('detects unavailable via code', () => {
    expect(getErrorMessage({ code: 'unavailable' })).toBe('network_error');
  });

  it('detects failed to fetch via message', () => {
    expect(getErrorMessage({ message: 'Failed to fetch' })).toBe('network_error');
  });

  it('detects net::err_ browser errors via message', () => {
    expect(getErrorMessage({ message: 'net::ERR_INTERNET_DISCONNECTED' })).toBe('network_error');
  });

  // --- quota_error ---
  it('detects quota via message', () => {
    expect(getErrorMessage({ message: 'Quota exceeded for quota metric' })).toBe('quota_error');
  });

  it('detects resource-exhausted via code', () => {
    expect(getErrorMessage({ code: 'resource-exhausted' })).toBe('quota_error');
  });

  it('detects too-many-requests via code', () => {
    expect(getErrorMessage({ code: 'too-many-requests' })).toBe('quota_error');
  });

  // --- not_found ---
  it('detects not-found via code', () => {
    expect(getErrorMessage({ code: 'not-found' })).toBe('not_found');
  });

  it('detects "does not exist" via message', () => {
    expect(getErrorMessage({ message: 'Document does not exist' })).toBe('not_found');
  });

  // --- unknown_error (fallthrough) ---
  it('returns unknown_error for an unrecognized error', () => {
    expect(getErrorMessage({ code: 'cancelled', message: 'Operation was cancelled' })).toBe(
      'unknown_error'
    );
  });

  it('returns unknown_error for an empty object', () => {
    expect(getErrorMessage({})).toBe('unknown_error');
  });

  it('returns unknown_error when code and message are empty strings', () => {
    expect(getErrorMessage({ code: '', message: '' })).toBe('unknown_error');
  });

  it('combined code+message matching: code provides the auth signal', () => {
    // code = 'UNAUTHENTICATED' (uppercased → lowercased)
    expect(getErrorMessage({ code: 'UNAUTHENTICATED', message: 'some detail' })).toBe(
      'auth_expired'
    );
  });
});
