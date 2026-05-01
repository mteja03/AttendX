/**
 * Auto-reload when a lazy chunk fails (e.g. after deploy: old HTML requests missing hashed assets → HTML 404 → MIME error).
 */
function shouldReloadForChunkError(message, filename) {
  const m = message || '';
  return (
    m.includes('Failed to fetch dynamically imported') ||
    m.includes('error loading dynamically imported module') ||
    m.includes('Loading chunk') ||
    m.includes('Loading CSS chunk') ||
    m.includes('text/html') ||
    m.includes('MIME type') ||
    m.includes('Failed to fetch') ||
    m.includes('Importing a module script failed') ||
    m.includes('Unexpected token') ||
    (filename?.endsWith?.('.js') && m.includes('Unexpected'))
  );
}

function shouldReloadForChunkRejection(reasonStr) {
  const m = reasonStr || '';
  return (
    m.includes('Failed to fetch dynamically imported') ||
    m.includes('error loading dynamically imported module') ||
    m.includes('Loading chunk') ||
    m.includes('Loading CSS chunk') ||
    m.includes('Failed to load module') ||
    m.includes('Failed to fetch') ||
    m.includes('MIME type') ||
    m.includes('text/html') ||
    m.includes('Importing a module script failed')
  );
}

function tryChunkReload() {
  try {
    if (!sessionStorage.getItem('chunk_reload')) {
      sessionStorage.setItem('chunk_reload', '1');
      window.location.reload();
    } else {
      sessionStorage.removeItem('chunk_reload');
    }
  } catch {
    window.location.reload();
  }
}

window.addEventListener('load', () => {
  try {
    sessionStorage.removeItem('chunk_reload');
  } catch {
    /* ignore */
  }
});

window.addEventListener('error', (event) => {
  if (shouldReloadForChunkError(event.message, event.filename)) {
    tryChunkReload();
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message || String(event.reason || '');
  if (shouldReloadForChunkRejection(reason)) {
    event.preventDefault();
    tryChunkReload();
  }
});
