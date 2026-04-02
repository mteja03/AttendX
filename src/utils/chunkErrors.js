/** Detect errors from stale lazy chunks / wrong MIME after deploy */
export function isChunkLoadError(error) {
  const msg = error?.message || String(error || '');
  return (
    msg.includes('Failed to fetch dynamically') ||
    msg.includes('Loading chunk') ||
    msg.includes('text/html') ||
    msg.includes('Unexpected token')
  );
}
