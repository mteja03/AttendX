/** Escape text for safe insertion into print HTML */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const ATTENDX_PRINT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'DM Sans', Arial, sans-serif;
    color: #1f2937;
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .print-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 0;
  }

  .print-header {
    background: linear-gradient(135deg, #1B6B6B 0%, #0F4444 100%);
    padding: 24px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
  }

  .print-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .print-logo-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: rgba(255,255,255,0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .print-logo-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .print-brand { color: white; }

  .print-brand-name {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.3px;
    line-height: 1;
    margin-bottom: 2px;
  }

  .print-brand-sub {
    font-size: 11px;
    opacity: 0.6;
  }

  .print-header-right {
    text-align: right;
    color: white;
  }

  .print-company-name {
    font-size: 14px;
    font-weight: 600;
    opacity: 0.95;
  }

  .print-report-title {
    font-size: 11px;
    opacity: 0.6;
    margin-top: 2px;
  }

  .print-subheader {
    background: #E8F5F5;
    padding: 12px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #4ECDC4;
    margin-bottom: 24px;
  }

  .print-doc-title {
    font-size: 16px;
    font-weight: 700;
    color: #1B6B6B;
  }

  .print-meta {
    font-size: 11px;
    color: #6b7280;
  }

  .print-content {
    padding: 0 32px 32px;
  }

  .print-section {
    margin-bottom: 24px;
  }

  .print-section-title {
    font-size: 11px;
    font-weight: 700;
    color: #1B6B6B;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding-bottom: 6px;
    border-bottom: 1px solid #E8F5F5;
    margin-bottom: 12px;
  }

  .print-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .print-field-label {
    font-size: 10px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 3px;
  }

  .print-field-value {
    font-size: 13px;
    color: #1f2937;
    font-weight: 500;
  }

  .print-body-text {
    font-size: 13px;
    line-height: 1.75;
    color: #374151;
    white-space: pre-wrap;
  }

  .print-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .print-table th {
    background: #F0F7F7;
    color: #1B6B6B;
    font-weight: 600;
    padding: 8px 12px;
    text-align: left;
    border: 1px solid #E8F5F5;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .print-table td {
    padding: 8px 12px;
    border: 1px solid #f3f4f6;
    color: #374151;
  }

  .print-table tr:nth-child(even) td {
    background: #fafafa;
  }

  .print-highlight-card {
    background: #E8F5F5;
    border: 1px solid #4ECDC4;
    border-radius: 10px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .print-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
  }

  .print-badge-green {
    background: #D1FAE5;
    color: #065F46;
  }

  .print-badge-red {
    background: #FEE2E2;
    color: #991B1B;
  }

  .print-badge-amber {
    background: #FEF3C7;
    color: #92400E;
  }

  .print-badge-teal {
    background: #E8F5F5;
    color: #1B6B6B;
  }

  .print-footer {
    margin-top: 32px;
    padding: 12px 32px;
    background: #F9FAFB;
    border-top: 1px solid #E8F5F5;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .print-footer-brand {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #9ca3af;
  }

  .print-footer-teal {
    color: #1B6B6B;
    font-weight: 600;
  }

  .print-footer-right {
    font-size: 11px;
    color: #9ca3af;
    text-align: right;
  }

  @media print {
    body { margin: 0; }
    .print-header {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

function logoSrc() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/logo/icon.png`;
  }
  return '/logo/icon.png';
}

/**
 * @param {{ title: string, subtitle?: string, companyName?: string, generatedBy?: string, content: string }} opts
 */
export function createPrintDocument({ title, subtitle = '', companyName, generatedBy = '', content }) {
  const t = escapeHtml(title);
  const sub = escapeHtml(subtitle);
  const co = escapeHtml(companyName || '');
  const gen = escapeHtml(generatedBy || '');
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `<!DOCTYPE html>
<html>
<head>
  <title>${t} — AttendX</title>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width"/>
  <style>${ATTENDX_PRINT_STYLES}</style>
</head>
<body>
  <div class="print-page">
    <div class="print-header">
      <div class="print-header-left">
        <div class="print-logo-icon">
          <img src="${logoSrc()}" alt="AttendX" onerror="this.style.display='none'"/>
        </div>
        <div class="print-brand">
          <div class="print-brand-name">AttendX</div>
          <div class="print-brand-sub">HR Management Platform</div>
        </div>
      </div>
      <div class="print-header-right">
        <div class="print-company-name">${co}</div>
        <div class="print-report-title">${sub || 'HR Document'}</div>
      </div>
    </div>
    <div class="print-subheader">
      <div class="print-doc-title">${t}</div>
      <div class="print-meta">
        Generated: ${today} at ${time}${gen ? ` · by ${gen}` : ''}
      </div>
    </div>
    <div class="print-content">${content}</div>
    <div class="print-footer">
      <div class="print-footer-brand">
        <span>Powered by</span>
        <span class="print-footer-teal">AttendX</span>
        <span>· HR Platform</span>
      </div>
      <div class="print-footer-right">
        <div>${co}</div>
        <div>${today}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function openPrintWindow(htmlContent) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return false;
  win.document.write(htmlContent);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
  return true;
}
