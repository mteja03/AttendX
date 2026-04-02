/**
 * Auto-reload when a lazy chunk fails (e.g. after deploy: old HTML requests missing hashed assets → HTML 404 → MIME error).
 */
function shouldReloadForChunkError(message, filename) {
  const m = message || '';
  return (
    m.includes('Failed to fetch dynamically imported') ||
    m.includes('Loading chunk') ||
    m.includes('Loading CSS chunk') ||
    m.includes('text/html') ||
    m.includes('Unexpected token') ||
    (filename?.endsWith?.('.js') && m.includes('Unexpected'))
  );
}

function tryChunkReload() {
  const lastReload = sessionStorage.getItem('lastChunkReload');
  const now = Date.now();
  if (!lastReload || now - Number(lastReload) > 10000) {
    sessionStorage.setItem('lastChunkReload', String(now));
    window.location.reload();
  }
}

window.addEventListener('error', (event) => {
  if (shouldReloadForChunkError(event.message, event.filename)) {
    tryChunkReload();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message || String(event.reason || '');
  const isChunkError =
    reason.includes('Failed to fetch dynamically imported') ||
    reason.includes('Loading chunk') ||
    reason.includes('Failed to load module') ||
    reason.includes('text/html');
  if (isChunkError) {
    tryChunkReload();
  }
});
