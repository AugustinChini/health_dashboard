importScripts(
  "https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyBlC9bIv4Xz4j_L7F1Gp3pjx0lBmNImGCE",
  authDomain: "monit-92034.firebaseapp.com",
  projectId: "monit-92034",
  storageBucket: "monit-92034.firebasestorage.app",
  messagingSenderId: "157336485967",
  appId: "1:157336485967:web:ecb0fd37ea9a0c9a15aa3a",
});

const messaging = firebase.messaging();

const DEFAULT_TITLE = "Health Dashboard";
const DEFAULT_BODY = "New monitoring notification";

function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizePushPayload(event) {
  if (!event.data) return null;

  const jsonPayload = (() => {
    try {
      return event.data.json();
    } catch {
      return null;
    }
  })();

  if (jsonPayload && typeof jsonPayload === "object") {
    return jsonPayload;
  }

  const textPayload = event.data.text();
  const parsed = safeParseJson(textPayload);
  if (parsed && typeof parsed === "object") {
    return parsed;
  }

  return { data: { body: textPayload } };
}

function resolveTargetUrl(payload) {
  return (
    payload?.fcmOptions?.link ||
    payload?.webpush?.fcmOptions?.link ||
    payload?.data?.link ||
    self.registration.scope
  );
}

function buildNotification(payload) {
  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    payload?.data?.appName ||
    DEFAULT_TITLE;

  const body =
    payload?.notification?.body || payload?.data?.body || DEFAULT_BODY;
  const tag =
    payload?.notification?.tag ||
    payload?.data?.tag ||
    "health-dashboard-alert";
  const link = resolveTargetUrl(payload);

  return {
    title,
    options: {
      body,
      tag,
      renotify: true,
      data: {
        link,
        payload,
      },
    },
  };
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = normalizePushPayload(event);
  const { title, options } = buildNotification(payload);

  console.log("[sw] push received", {
    hasData: Boolean(event.data),
    title,
    link: options?.data?.link || null,
    payload,
  });

  event.waitUntil(
    self.registration.showNotification(title, options).catch((error) => {
      console.error("[sw] showNotification failed", error);
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.link || self.registration.scope;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const absoluteTarget = new URL(targetUrl, self.location.origin).href;
        const existing = clients.find(
          (client) =>
            client.url === absoluteTarget ||
            client.url.startsWith(`${absoluteTarget}#`) ||
            client.url.startsWith(`${absoluteTarget}?`),
        );

        if (existing) {
          return existing.focus();
        }

        return self.clients.openWindow(absoluteTarget);
      }),
  );
});

self.addEventListener("notificationclose", (event) => {
  const tag = event.notification?.tag || "unknown";
  console.log("[sw] notification closed", { tag });
});

self.addEventListener("pushsubscriptionchange", (event) => {
  console.warn("[sw] push subscription changed", {
    oldEndpoint: event.oldSubscription?.endpoint || null,
    newEndpoint: event.newSubscription?.endpoint || null,
  });

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "PUSH_SUBSCRIPTION_CHANGED" });
        });
      }),
  );
});

// Background notifications (when web app is not focused)
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload,
  );

  const notificationTitle =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    "Notification Monitoring";
  const notificationOptions = {
    body:
      (payload.notification && payload.notification.body) ||
      (payload.data && payload.data.body) ||
      "Alert from Monitoring",
    data: payload.data || {},
  };

  console.log("[sw] onBackgroundMessage showNotification", {
    notificationTitle,
    notificationOptions,
  });

  self.registration.showNotification(notificationTitle, notificationOptions);
});
