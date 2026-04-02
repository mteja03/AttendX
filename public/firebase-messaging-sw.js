/* global firebase, importScripts */
// Config globals: /firebase-sw-init.js (generated in build + dev via Vite plugin)
importScripts('/firebase-sw-init.js');
importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY,
  authDomain: self.FIREBASE_AUTH_DOMAIN,
  projectId: self.FIREBASE_PROJECT_ID,
  storageBucket: self.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID,
  appId: self.FIREBASE_APP_ID,
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};

  let actions = [];
  try {
    if (payload.data?.actions) {
      actions = JSON.parse(payload.data.actions);
    }
  } catch {
    actions = [];
  }

  self.registration.showNotification(title || 'AttendX', {
    body: body || '',
    icon: icon || '/favicon.ico',
    badge: '/favicon.ico',
    data: payload.data || {},
    actions: Array.isArray(actions) ? actions : [],
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('attendx') && 'focus' in client) {
          client.focus();
          if ('navigate' in client && typeof client.navigate === 'function') {
            return client.navigate(url);
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    }),
  );
});
