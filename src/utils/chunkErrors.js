/** Detect errors from stale lazy chunks / wrong MIME after deploy */
export function isChunkLoadError(error) {
  if (error?.name === 'ChunkLoadError') return true;
  const msg = error?.message || String(error || '');
  return (
    msg.includes('Failed to fetch dynamically') ||
    msg.includes('dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('text/html') ||
    msg.includes('Unexpected token')
  );
}
