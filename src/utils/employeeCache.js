const CACHE_TTL_MS = 2 * 60 * 1000; // 2 min

const _cache = new Map();

export function getCacheKey(companyId, tab, filters = {}) {
  const f = [
    filters.department || '',
    filters.branch || '',
    filters.location || '',
    filters.employmentType || '',
  ].join('|');
  return `${companyId}_${tab}_${f}`;
}

export function setEmployeeCache(key, data) {
  _cache.set(key, {
    ...data,
    fetchedAt: Date.now(),
  });
}

export function getEmployeeCache(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry;
}

export function clearEmployeeCache(companyId) {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${companyId}_`)) {
      _cache.delete(key);
    }
  }
}

export function invalidateCache(key) {
  _cache.delete(key);
}
