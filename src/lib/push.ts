import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId,
  );
}

async function getMessagingInstance() {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  return getMessaging(app);
}

export async function subscribeCurrentDeviceToPush(): Promise<string> {
  if (!hasFirebaseConfig()) {
    throw new Error(
      "Firebase config is missing in frontend environment variables.",
    );
  }

  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }

  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported on this browser.");
  }

  const supported = await isSupported();
  if (!supported) {
    throw new Error("Firebase Messaging is not supported on this browser.");
  }

  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;

  if (permission !== "granted") {
    throw new Error("Notification permission was denied.");
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    throw new Error("VAPID key is missing (VITE_FIREBASE_VAPID_KEY).");
  }

  const swUrl = `${import.meta.env.BASE_URL}firebase-messaging-sw.js`;
  const swRegistration = await navigator.serviceWorker.register(swUrl);
  const messaging = await getMessagingInstance();

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swRegistration,
  });

  if (!token) {
    throw new Error("Failed to retrieve push token from Firebase.");
  }

  localStorage.setItem("push_token", token);
  return token;
}

/**
 * Try to retrieve the current device's push token from localStorage.
 * Returns null if the device was never subscribed from this browser.
 */
export function getCurrentDeviceToken(): string | null {
  return localStorage.getItem("push_token");
}
