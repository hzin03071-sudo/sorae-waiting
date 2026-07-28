importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCWYZQhRZrfvq_qm90_40w8dlqgQqe_2YQ",
  authDomain: "s4company.firebaseapp.com",
  projectId: "s4company",
  storageBucket: "s4company.firebasestorage.app",
  messagingSenderId: "23303740690",
  appId: "1:23303740690:web:bd60afb6203f4dc79f67cb"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "2026 소래포구축제";

  const options = {
    body:
      payload.notification?.body ||
      "체험 입장 순서가 되었습니다. 체험장으로 이동해주세요.",
    icon: "/assets/icon-192.png",
    badge: "/assets/icon-192.png",
    data: {
      url: payload.data?.url || "/waiting.html"
    },
    tag: "sorae-waiting-call",
    renotify: true
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification.data?.url || "/waiting.html";

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      return clients.openWindow(targetUrl);
    })
  );
});
