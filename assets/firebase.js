import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  getMessaging,
  isSupported
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging.js";

import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/*
  일부 브라우저에서는 웹 푸시를 지원하지 않을 수 있으므로
  지원 여부를 먼저 확인한 후 Messaging을 연결합니다.
*/
export const messaging = await isSupported()
  ? getMessaging(app)
  : null;
