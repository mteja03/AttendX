// Convert any date format to YYYY-MM-DD string
export function toDateString(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  if (value?.toDate) {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (value?.seconds) {
    return new Date(value.seconds * 1000).toISOString().slice(0, 10);
  }
  return '';
}

// Convert any date to displayable DD/MM/YYYY
export function toDisplayDate(value) {
  const str = toDateString(value);
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

// Convert any date to JS Date object
export function toJSDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  if (value?.seconds) {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === 'string') {
    return new Date(value);
  }
  return null;
}

/**
 * Format date for display (India locale)
 */
export function formatDate(dateStr, options = { dateStyle: 'medium' }) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', options);
}

/**
 * Format number with Indian number system (e.g. 1,00,000)
 */
export function formatNumber(num) {
  if (num == null) return '—';
  return new Intl.NumberFormat('en-IN').format(num);
}
