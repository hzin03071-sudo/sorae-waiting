import { auth, db, messaging } from "./firebase.js";

import {
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging.js";


/* Firebase Cloud Messaging 웹 푸시 공개키 */
const VAPID_KEY =
  "BHu1Ku9udo1VVYVKbzE9ZS3VPubKrRMIUvCiD1vmKi1GOpX-CTG6ODbRC58XpqTfAfUDZpgPKaDPKhRU_qIof6k";


/* Firebase 익명 로그인 */
await signInAnonymously(auth);


/* 예약번호 확인 */
const params = new URLSearchParams(location.search);

const reservationId =
  params.get("id") ||
  localStorage.getItem("soraeReservationId");


if (!reservationId) {
  alert("대기 정보를 찾을 수 없습니다.");
  location.href = "/";
  throw new Error("예약번호가 없습니다.");
}


let reservation = null;
let booth = null;
let boothUnsubscribe = null;


/* 화면 요소 */
const notificationButton =
  document.querySelector("#enableNotification");

const notificationMessage =
  document.querySelector("#notificationMessage");

const cancelButton =
  document.querySelector("#cancelReservation");


/* 예약정보 실시간 확인 */
onSnapshot(
  doc(db, "reservations", reservationId),

  (snapshot) => {
    if (!snapshot.exists()) {
      alert("대기 정보가 존재하지 않습니다.");
      location.href = "/";
      return;
    }

    reservation = snapshot.data();

    localStorage.setItem(
      "soraeReservationId",
      reservationId
    );

    if (boothUnsubscribe) {
      boothUnsubscribe();
    }

    boothUnsubscribe = onSnapshot(
      doc(db, "booths", reservation.boothId),

      (boothSnapshot) => {
        if (!boothSnapshot.exists()) {
          return;
        }

        booth = boothSnapshot.data();
        render();
      }
    );
  }
);


/* 대기 현황 화면 출력 */
function render() {
  if (!reservation || !booth) return;

  const current =
    Number(booth.currentNumber || 0);

  const capacity =
    Number(booth.capacity || 5);

  const ticket =
    Number(reservation.ticketNumber || 0);

  const ahead =
    Math.max(0, ticket - current - 1);

  const estimate =
    Math.ceil(ahead / capacity) *
    Number(booth.minutesPerTurn || 10);

  const called =
    reservation.status === "called" ||
    ticket <= current;


  document.querySelector("#ticketBooth").textContent =
    reservation.boothName;

  document.querySelector("#ticketNumber").textContent =
    ticket;

  document.querySelector("#currentCall").textContent =
    current > 0
      ? `${Math.max(1, current - capacity + 1)}~${current}번`
      : "입장 전";

  document.querySelector("#aheadTeams").textContent =
    `${ahead}팀`;

  document.querySelector("#estimatedWait").textContent =
    ahead ? `약 ${estimate}분` : "곧 입장";


  const message =
    document.querySelector("#statusMessage");


  if (reservation.status === "cancelled") {
    message.textContent =
      "취소된 대기입니다.";

    message.className =
      "status-message cancelled";

    cancelButton.disabled = true;

    disableNotificationButton();
  }

  else if (reservation.status === "completed") {
    message.textContent =
      "체험이 완료되었습니다.";

    message.className =
      "status-message completed";

    cancelButton.disabled = true;

    disableNotificationButton();
  }

  else if (called) {
    message.textContent =
      "지금 체험장으로 입장해주세요!";

    message.className =
      "status-message called";

    cancelButton.disabled = true;
  }

  else if (ahead < 5) {
    message.textContent =
      "곧 입장 순서입니다. 체험장 근처에서 대기해주세요.";

    message.className =
      "status-message soon";
  }

  else {
    message.textContent =
      "현재 정상적으로 대기 중입니다.";

    message.className =
      "status-message";
  }


  if (reservation.notificationEnabled) {
    showNotificationEnabled();
  }
}


/* 알림 버튼 비활성화 */
function disableNotificationButton() {
  if (!notificationButton) return;

  notificationButton.disabled = true;
}


/* 알림 신청 완료 화면 */
function showNotificationEnabled() {
  if (!notificationButton || !notificationMessage) {
    return;
  }

  notificationButton.textContent =
    "입장 알림 신청 완료";

  notificationButton.disabled = true;

  notificationMessage.textContent =
    "입장 순서가 되면 이 휴대폰으로 알림을 보내드립니다.";
}


/* 아이폰 확인 */
function isIOS() {
  return /iPhone|iPad|iPod/i.test(
    navigator.userAgent
  );
}


/* 홈 화면 앱으로 실행했는지 확인 */
function isStandaloneMode() {
  return (
    window.matchMedia(
      "(display-mode: standalone)"
    ).matches ||
    window.navigator.standalone === true
  );
}


/* 알림 받기 버튼 */
notificationButton?.addEventListener(
  "click",

  async () => {
    try {
      if (!messaging) {
        alert(
          "이 브라우저에서는 웹 알림을 지원하지 않습니다."
        );
        return;
      }


      /*
        아이폰은 홈 화면에 추가한 뒤 실행해야
        웹 푸시 알림을 받을 수 있습니다.
      */
      if (isIOS() && !isStandaloneMode()) {
        notificationMessage.textContent =
          "아이폰은 Safari 공유 버튼을 누른 뒤 ‘홈 화면에 추가’하고, 생성된 아이콘으로 다시 접속해주세요.";

        alert(
          "아이폰은 먼저 이 페이지를 홈 화면에 추가해야 알림을 받을 수 있습니다."
        );

        return;
      }


      notificationButton.disabled = true;
      notificationButton.textContent =
        "알림 설정 중…";


      const permission =
        await Notification.requestPermission();


      if (permission !== "granted") {
        notificationButton.disabled = false;
        notificationButton.textContent =
          "입장 알림 받기";

        notificationMessage.textContent =
          "알림이 차단되었습니다. 브라우저 설정에서 알림을 허용해주세요.";

        return;
      }


      /*
        루트 위치의 서비스 워커를 직접 등록합니다.
      */
      const serviceWorkerRegistration =
        await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );


      /*
        이 휴대폰과 브라우저를 구분하는
        FCM 토큰을 발급합니다.
      */
      const token = await getToken(
        messaging,
        {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration
        }
      );


      if (!token) {
        throw new Error(
          "FCM 토큰이 발급되지 않았습니다."
        );
      }


      /*
        해당 대기 예약 문서에
        알림 토큰을 저장합니다.
      */
      await updateDoc(
        doc(db, "reservations", reservationId),

        {
          fcmToken: token,
          notificationEnabled: true,
          notificationEnabledAt:
            serverTimestamp(),

          notificationUserAgent:
            navigator.userAgent
        }
      );


      showNotificationEnabled();
    }

    catch (error) {
      console.error(
        "알림 설정 오류:",
        error
      );

      notificationButton.disabled = false;
      notificationButton.textContent =
        "입장 알림 받기";

      notificationMessage.textContent =
        "알림 설정 중 문제가 발생했습니다. 잠시 후 다시 눌러주세요.";

      alert(
        "알림 설정에 실패했습니다. 잠시 후 다시 시도해주세요."
      );
    }
  }
);


/*
  사이트를 보고 있는 중에 알림이 도착한 경우
  휴대폰 알림창에도 표시합니다.
*/
if (messaging) {
  onMessage(
    messaging,

    async (payload) => {
      if (
        Notification.permission !== "granted"
      ) {
        return;
      }

      const registration =
        await navigator.serviceWorker.ready;

      await registration.showNotification(
        payload.notification?.title ||
          "2026 소래포구축제",

        {
          body:
            payload.notification?.body ||
            "체험 입장 순서가 되었습니다.",

          data: {
            url:
              payload.data?.url ||
              `/waiting.html?id=${reservationId}`
          },

          tag:
            `sorae-call-${reservationId}`,

          renotify: true
        }
      );
    }
  );
}


/*
  이미 알림을 허용했던 방문객이라면
  토큰이 바뀌었는지 다시 확인해 저장합니다.
*/
async function restoreNotificationToken() {
  try {
    if (
      !messaging ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    if (isIOS() && !isStandaloneMode()) {
      return;
    }

    const serviceWorkerRegistration =
      await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js"
      );

    const token = await getToken(
      messaging,
      {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration
      }
    );

    if (!token) return;

    await updateDoc(
      doc(db, "reservations", reservationId),

      {
        fcmToken: token,
        notificationEnabled: true,
        notificationTokenUpdatedAt:
          serverTimestamp()
      }
    );

    showNotificationEnabled();
  }

  catch (error) {
    console.warn(
      "기존 알림 토큰 확인 실패:",
      error
    );
  }
}


restoreNotificationToken();


/* 대기 취소 */
cancelButton.addEventListener(
  "click",

  async () => {
    if (
      !confirm("대기를 취소하시겠습니까?")
    ) {
      return;
    }

    await updateDoc(
      doc(db, "reservations", reservationId),

      {
        status: "cancelled",
        cancelledAt: serverTimestamp(),

        /*
          취소된 예약으로 알림이 발송되지 않도록
          알림 사용 상태도 해제합니다.
        */
        notificationEnabled: false
      }
    );

    localStorage.removeItem(
      "soraeReservationId"
    );
  }
);
