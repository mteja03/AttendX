export default function SortIcon({ colKey, sortConfig }) {
  if (sortConfig.key !== colKey) return <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M3 4l2-2 2 2M3 6l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
  return sortConfig.dir === 'asc'
    ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M3 6l2-2 2 2" stroke="#1B6B6B" strokeWidth="1.5" strokeLinecap="round"/></svg>
    : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M3 4l2 2 2-2" stroke="#1B6B6B" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
