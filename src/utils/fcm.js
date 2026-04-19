import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { app, db } from '../firebase/config';
import { doc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';

let messaging = null;

export const initMessaging = async () => {
  try {
    const supported = await isSupported();
    if (!supported) return null;
    messaging = getMessaging(app);
    return messaging;
  } catch {
    return null;
  }
};

/**
 * @param {string | undefined} userId - normalized user key (e.g. lowercased email)
 * @param {string | null | undefined} companyId
 */
export const requestNotificationPermission = async (userId, companyId) => {
  try {
    const supported = await isSupported();
    if (!supported) {
      if (import.meta.env.DEV) console.warn('FCM not supported in this browser');
      return null;
    }

    const m = messaging || (await initMessaging());
    if (!m) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return null;
    }

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      if (import.meta.env.DEV) console.warn('VITE_FIREBASE_VAPID_KEY is not set');
      return null;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

    const token = await getToken(m, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (token && userId) {
      await setDoc(doc(db, 'fcmTokens', userId), {
        token,
        userId,
        companyId: companyId ?? null,
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp(),
        platform: 'web',
      });
      return token;
    }

    return null;
  } catch (e) {
    if (import.meta.env.DEV) console.error('FCM token error:', e);
    return null;
  }
};

export const deleteFCMToken = async (userId) => {
  if (!userId) return;
  try {
    await deleteDoc(doc(db, 'fcmTokens', userId));
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to delete FCM token:', e);
  }
};

export const onForegroundMessage = (callback) => {
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
};
