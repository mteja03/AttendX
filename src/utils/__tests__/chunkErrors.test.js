import { describe, it, expect } from 'vitest';
import { isChunkLoadError } from '../chunkErrors';

describe('isChunkLoadError', () => {
  it('returns true when error.name is ChunkLoadError', () => {
    expect(isChunkLoadError({ name: 'ChunkLoadError' })).toBe(true);
    expect(isChunkLoadError({ name: 'ChunkLoadError', message: '' })).toBe(true);
  });

  it('returns true for "Failed to fetch dynamically" message', () => {
    expect(
      isChunkLoadError({ message: 'Failed to fetch dynamically imported module' })
    ).toBe(true);
    expect(
      isChunkLoadError(new Error('Failed to fetch dynamically imported module'))
    ).toBe(true);
  });

  it('returns true for "dynamically imported module" message', () => {
    expect(
      isChunkLoadError({ message: 'error loading dynamically imported module' })
    ).toBe(true);
  });

  it('returns true for "Loading chunk" message', () => {
    expect(isChunkLoadError({ message: 'Loading chunk 123 failed.' })).toBe(true);
  });

  it('returns true for "text/html" message (wrong MIME type)', () => {
    expect(
      isChunkLoadError({ message: 'Expected a JavaScript module script but the server responded with a MIME type of text/html' })
    ).toBe(true);
  });

  it('returns true for "Unexpected token" message', () => {
    expect(isChunkLoadError({ message: 'Unexpected token <' })).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false);
    expect(isChunkLoadError({ name: 'TypeError', message: 'Cannot read property of null' })).toBe(false);
    expect(isChunkLoadError({ message: 'permission denied' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it('returns false for an empty error object', () => {
    expect(isChunkLoadError({})).toBe(false);
  });

  it('handles a plain string being passed', () => {
    // msg = String(error) will be used
    expect(isChunkLoadError('Loading chunk 5 failed')).toBe(true);
    expect(isChunkLoadError('some random error')).toBe(false);
  });

  it('name match takes priority (even if message is benign)', () => {
    expect(
      isChunkLoadError({ name: 'ChunkLoadError', message: 'some unrelated text' })
    ).toBe(true);
  });
});
