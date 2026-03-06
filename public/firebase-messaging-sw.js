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

  self.registration.showNotification(notificationTitle, notificationOptions);
});
