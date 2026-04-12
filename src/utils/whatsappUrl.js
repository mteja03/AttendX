/**
 * WhatsApp click-to-send URL — opens WhatsApp Web/App with a pre-filled message.
 */
export function whatsappUrl(phone, message) {
  if (!phone) return null;
  const clean = String(phone).replace(/\D/g, '');
  if (!clean) return null;
  const num =
    clean.startsWith('91') && clean.length >= 12 ? clean : `91${clean}`;
  return (
    `https://api.whatsapp.com/send?phone=${num}&text=` +
    encodeURIComponent(message ?? '')
  );
}
