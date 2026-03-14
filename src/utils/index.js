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
