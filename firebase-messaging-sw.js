importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDfsx3AhGY9YSs73ng2t4s8-Nm76_kQewM",
  authDomain: "capstoneapt-b5681.firebaseapp.com",
  projectId: "capstoneapt-b5681",
  storageBucket: "capstoneapt-b5681.appspot.com",
  messagingSenderId: "192229736140",
  appId: "1:192229736140:web:20d0e4e603d6ca98dd4c69"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.notification.title,
    {
      body: payload.notification.body,
      icon: "/assets/img/logo.png"
    }
  );
});
