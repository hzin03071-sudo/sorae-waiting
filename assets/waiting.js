import { auth, db, messaging } from "./firebase.js";

import {
  signInAnonymously,
  onAuthStateChanged
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


/* ==================================================
   Firebase 웹 푸시 공개키
================================================== */

const VAPID_KEY =
  "BHu1Ku9udo1VVYVKbzE9ZS3VPubKrRMIUvCiD1vmKi1GOpX-CTG6ODbRC58XpqTfAfUDZpgPKaDPKhRU_qIof6k";


/* ==================================================
   예약 ID 확인
================================================== */

const params = new URLSearchParams(window.location.search);

const reservationId =
  params.get("id") ||
  params.get("reservationId");


/* ==================================================
   HTML 요소 검색
================================================== */

function findElement(...selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);

    if (element) {
      return element;
    }
  }

  return null;
}


const boothNameElement = findElement(
  "#boothName",
  "#waitingBoothName",
  "[data-booth-name]"
);

const ticketNumberElement = findElement(
  "#ticketNumber",
  "#waitingNumber",
  "#myNumber",
  "[data-ticket-number]"
);

const currentNumberElement = findElement(
  "#currentNumber",
  "#currentRange",
  "#calledNumber",
  "[data-current-number]"
);

const aheadCountElement = findElement(
  "#aheadCount",
  "#waitingCount",
  "#teamsAhead",
  "[data-ahead-count]"
);

const estimatedTimeElement = findElement(
  "#estimatedTime",
  "#waitTime",
  "[data-estimated-time]"
);

const statusMessageElement = findElement(
  "#statusMessage",
  "#waitingStatus",
  "#mainStatus",
  "[data-status-message]"
);

const cancelButton = findElement(
  "#cancelButton",
  "#cancelWaitingButton",
  ".cancel-button"
);

const notificationButton = findElement(
  "#notificationButton",
  "#enableNotificationButton",
  "#pushButton",
  ".notification-button"
);

const notificationStatusElement = findElement(
  "#notificationStatus",
  "#pushStatus",
  "[data-notification-status]"
);


/* ==================================================
   현재 상태
================================================== */

let currentReservation = null;
let currentBooth = null;

let reservationUnsubscribe = null;
let boothUnsubscribe = null;

let currentBoothId = null;

let serviceWorkerRegistration = null;
let notificationProcessing = false;
let notificationListenerAdded = false;


/* ==================================================
   페이지 시작
================================================== */

if (!reservationId) {
  showPageError(
    "대기 신청 정보를 찾을 수 없습니다. QR코드로 다시 접속해주세요."
  );
} else {
  initializePage();
}


/* ==================================================
   초기 실행
================================================== */

async function initializePage() {
  try {
    await ensureAnonymousLogin();

    /*
     * 예약 조회와 버튼 연결을 먼저 실행한다.
     * 서비스워커 오류 때문에 버튼이 멈추지 않도록 한다.
     */

    listenReservation();
    prepareNotificationButton();
    listenForegroundMessages();

    /*
     * 서비스워커는 별도로 등록한다.
     */

    try {
      await registerMessagingServiceWorker();
    } catch (serviceWorkerError) {
      console.error(
        "서비스워커 사전 등록 오류:",
        serviceWorkerError
      );

      serviceWorkerRegistration = null;

      setNotificationStatus(
        "알림 버튼을 눌러 알림 등록을 다시 시도해주세요."
      );
    }
  } catch (error) {
    console.error(
      "대기 화면 초기화 오류:",
      error
    );

    showPageError(
      "대기 정보를 불러오는 중 오류가 발생했습니다."
    );
  }
}


/* ==================================================
   익명 로그인
================================================== */

async function ensureAnonymousLogin() {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve, reject) => {
    let signInStarted = false;

    const unsubscribe = onAuthStateChanged(
      auth,

      async (user) => {
        if (user) {
          unsubscribe();
          resolve(user);
          return;
        }

        if (signInStarted) {
          return;
        }

        signInStarted = true;

        try {
          const result =
            await signInAnonymously(auth);

          unsubscribe();
          resolve(result.user);
        } catch (error) {
          unsubscribe();
          reject(error);
        }
      },

      (error) => {
        unsubscribe();
        reject(error);
      }
    );
  });
}


/* ==================================================
   예약 실시간 조회
================================================== */

function listenReservation() {
  if (reservationUnsubscribe) {
    reservationUnsubscribe();
  }

  const reservationRef = doc(
    db,
    "reservations",
    reservationId
  );

  reservationUnsubscribe = onSnapshot(
    reservationRef,

    (snapshot) => {
      if (!snapshot.exists()) {
        showPageError(
          "대기 신청 정보를 찾을 수 없습니다."
        );

        return;
      }

      currentReservation = {
        id: snapshot.id,
        ...snapshot.data()
      };

      renderReservation();

      if (currentReservation.boothId) {
        listenBooth(
          currentReservation.boothId
        );
      }

      restoreNotificationState();
    },

    (error) => {
      console.error(
        "예약 조회 오류:",
        error
      );

      showPageError(
        "대기 신청 정보를 불러오지 못했습니다."
      );
    }
  );
}


/* ==================================================
   체험 부스 실시간 조회
================================================== */

function listenBooth(boothId) {
  if (
    currentBoothId === boothId &&
    boothUnsubscribe
  ) {
    return;
  }

  if (boothUnsubscribe) {
    boothUnsubscribe();
  }

  currentBoothId = boothId;

  const boothRef = doc(
    db,
    "booths",
    boothId
  );

  boothUnsubscribe = onSnapshot(
    boothRef,

    (snapshot) => {
      if (!snapshot.exists()) {
        currentBooth = null;
        renderWaitingInformation();
        return;
      }

      currentBooth = {
        id: snapshot.id,
        ...snapshot.data()
      };

      renderReservation();
    },

    (error) => {
      console.error(
        "체험 부스 조회 오류:",
        error
      );
    }
  );
}


/* ==================================================
   예약 정보 출력
================================================== */

function renderReservation() {
  if (!currentReservation) {
    return;
  }

  const boothName =
    currentReservation.boothName ||
    currentBooth?.name ||
    "체험 프로그램";

  const ticketNumber =
    Number(
      currentReservation.ticketNumber || 0
    );

  setText(
    boothNameElement,
    boothName
  );

  setText(
    ticketNumberElement,
    ticketNumber > 0
      ? String(ticketNumber)
      : "-"
  );

  renderWaitingInformation();
}


/* ==================================================
   대기 현황 계산
================================================== */

function renderWaitingInformation() {
  if (!currentReservation) {
    return;
  }

  const status =
    currentReservation.status ||
    "waiting";

  const ticketNumber =
    Number(
      currentReservation.ticketNumber || 0
    );

  const currentNumber =
    Number(
      currentBooth?.currentNumber || 0
    );

  const capacity =
    Math.max(
      1,
      Number(currentBooth?.capacity || 5)
    );

  const minutesPerTurn =
    Math.max(
      1,
      Number(
        currentBooth?.minutesPerTurn || 10
      )
    );

  const rangeStart =
    currentNumber > 0
      ? Math.max(
          1,
          currentNumber - capacity + 1
        )
      : 0;

  const aheadCount =
    Math.max(
      0,
      ticketNumber - currentNumber - 1
    );

  const waitingRounds =
    Math.ceil(
      aheadCount / capacity
    );

  const estimatedMinutes =
    waitingRounds * minutesPerTurn;


  if (currentNumberElement) {
    currentNumberElement.textContent =
      currentNumber > 0
        ? `${rangeStart}~${currentNumber}번`
        : "입장 전";
  }


  if (aheadCountElement) {
    aheadCountElement.textContent =
      `${aheadCount}팀`;
  }


  if (estimatedTimeElement) {
    if (status === "called") {
      estimatedTimeElement.textContent =
        "지금 입장";
    } else if (status === "cancelled") {
      estimatedTimeElement.textContent =
        "취소 완료";
    } else if (status === "completed") {
      estimatedTimeElement.textContent =
        "체험 완료";
    } else if (aheadCount === 0) {
      estimatedTimeElement.textContent =
        "곧 입장";
    } else {
      estimatedTimeElement.textContent =
        `약 ${Math.max(
          minutesPerTurn,
          estimatedMinutes
        )}분`;
    }
  }

  updateStatusDisplay(status);
}


/* ==================================================
   예약 상태별 화면
================================================== */

function updateStatusDisplay(status) {
  if (status === "called") {
    setText(
      statusMessageElement,
      "입장 순서입니다. 지금 체험장으로 이동해주세요."
    );

    if (cancelButton) {
      cancelButton.disabled = true;
      cancelButton.textContent =
        "입장 호출 완료";
    }

    return;
  }


  if (status === "cancelled") {
    setText(
      statusMessageElement,
      "대기 신청이 취소되었습니다."
    );

    if (cancelButton) {
      cancelButton.disabled = true;
      cancelButton.textContent =
        "대기 취소 완료";
    }

    if (notificationButton) {
      notificationButton.disabled = true;
    }

    return;
  }


  if (status === "completed") {
    setText(
      statusMessageElement,
      "체험 참여가 완료되었습니다."
    );

    if (cancelButton) {
      cancelButton.disabled = true;
      cancelButton.textContent =
        "체험 완료";
    }

    return;
  }


  setText(
    statusMessageElement,
    "곧 입장 순서입니다. 체험장 근처에서 대기해주세요."
  );

  if (cancelButton) {
    cancelButton.disabled = false;
    cancelButton.textContent =
      "대기 취소";
  }
}


/* ==================================================
   대기 취소
================================================== */

if (cancelButton) {
  cancelButton.addEventListener(
    "click",
    async () => {
      if (!currentReservation) {
        return;
      }

      if (
        currentReservation.status !==
        "waiting"
      ) {
        alert(
          "현재 상태에서는 대기를 취소할 수 없습니다."
        );

        return;
      }

      const confirmed = confirm(
        "대기 신청을 취소하시겠습니까?"
      );

      if (!confirmed) {
        return;
      }

      cancelButton.disabled = true;
      cancelButton.textContent =
        "취소 처리 중...";

      try {
        await updateDoc(
          doc(
            db,
            "reservations",
            reservationId
          ),
          {
            status: "cancelled",
            cancelledAt:
              serverTimestamp()
          }
        );
      } catch (error) {
        console.error(
          "대기 취소 오류:",
          error
        );

        alert(
          "대기 취소 중 오류가 발생했습니다."
        );

        cancelButton.disabled = false;
        cancelButton.textContent =
          "대기 취소";
      }
    }
  );
}


/* ==================================================
   서비스워커 등록
================================================== */

async function registerMessagingServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error(
      "현재 브라우저는 서비스워커를 지원하지 않습니다."
    );
  }

  const registration =
    await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
      {
        scope: "/"
      }
    );

  await navigator.serviceWorker.ready;

  serviceWorkerRegistration =
    registration;

  return registration;
}


/* ==================================================
   알림 버튼 연결
================================================== */

function prepareNotificationButton() {
  if (!notificationButton) {
    console.error(
      "알림 버튼을 찾지 못했습니다."
    );

    return;
  }

  /*
   * HTML에 disabled가 들어 있어도
   * 자바스크립트 실행 후 활성화한다.
   */

  notificationButton.disabled = false;

  if (!notificationListenerAdded) {
    notificationButton.addEventListener(
      "click",
      enableNotifications
    );

    notificationListenerAdded = true;
  }

  restoreNotificationState();
}


/* ==================================================
   알림 지원 여부
================================================== */

function isNotificationSupported() {
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    Boolean(messaging)
  );
}


/* ==================================================
   알림 상태 복원
================================================== */

function restoreNotificationState() {
  if (!notificationButton) {
    return;
  }

  if (!isNotificationSupported()) {
    notificationButton.disabled = true;
    notificationButton.textContent =
      "이 브라우저에서는 알림을 사용할 수 없습니다.";

    setNotificationStatus(
      "Chrome 또는 삼성 인터넷에서 열어주세요."
    );

    return;
  }


  if (
    Notification.permission ===
    "denied"
  ) {
    notificationButton.disabled = false;
    notificationButton.textContent =
      "알림 권한 확인하기";

    setNotificationStatus(
      "브라우저 설정에서 이 사이트의 알림 권한을 허용해주세요."
    );

    return;
  }


  if (
    currentReservation
      ?.notificationEnabled === true &&
    currentReservation?.fcmToken
  ) {
    notificationButton.disabled = true;
    notificationButton.textContent =
      "입장 알림 신청 완료";

    setNotificationStatus(
      "입장 순서가 되면 이 휴대폰으로 알려드립니다."
    );

    return;
  }


  notificationButton.disabled = false;
  notificationButton.textContent =
    "입장 알림 받기";

  if (
    Notification.permission ===
    "granted"
  ) {
    setNotificationStatus(
      "버튼을 눌러 이 휴대폰을 등록해주세요."
    );
  } else {
    setNotificationStatus(
      "입장 순서가 되면 알림을 보내드립니다."
    );
  }
}


/* ==================================================
   알림 등록
================================================== */

async function enableNotifications() {
  if (notificationProcessing) {
    return;
  }

  if (!notificationButton) {
    return;
  }

  if (!currentReservation) {
    alert(
      "대기 신청 정보를 불러오는 중입니다. 잠시 후 다시 눌러주세요."
    );

    return;
  }

  notificationProcessing = true;

  notificationButton.disabled = true;
  notificationButton.textContent =
    "알림 설정 중...";

  setNotificationStatus(
    "알림 기기를 등록하고 있습니다."
  );

  try {
    alert(
      "브라우저 알림 권한: " +
      Notification.permission +
      "\n\n브라우저 정보: " +
      navigator.userAgent
    );

    if (!isNotificationSupported()) {
      throw new Error(
        "현재 브라우저에서는 웹 알림을 지원하지 않습니다."
      );
    }

    let permission =
      Notification.permission;

    if (permission === "default") {
      permission =
        await Notification.requestPermission();
    }

    if (permission === "denied") {
      throw new Error(
        "알림이 차단되어 있습니다. 브라우저 설정에서 알림 권한을 허용해주세요."
      );
    }

    if (permission !== "granted") {
      throw new Error(
        "알림 권한이 허용되지 않았습니다."
      );
    }

    if (!serviceWorkerRegistration) {
      serviceWorkerRegistration =
        await registerMessagingServiceWorker();
    }

    const token = await getToken(
      messaging,
      {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration:
          serviceWorkerRegistration
      }
    );

    if (!token) {
      throw new Error(
        "알림 기기 정보를 발급받지 못했습니다."
      );
    }

    const currentUid =
      auth.currentUser?.uid || "";

    const reservationOwnerUid =
      currentReservation.ownerUid || "";

    if (
      reservationOwnerUid &&
      currentUid &&
      reservationOwnerUid !== currentUid
    ) {
      throw new Error(
        "이 예약은 다른 브라우저에서 생성되었습니다. 현재 브라우저에서 새로 대기 신청한 뒤 알림을 등록해주세요."
      );
    }

    await updateDoc(
      doc(
        db,
        "reservations",
        reservationId
      ),
      {
        fcmToken: token,
        notificationEnabled: true,
        notificationEnabledAt:
          serverTimestamp(),
        notificationUserAgent:
          navigator.userAgent
      }
    );

    notificationButton.disabled = true;
    notificationButton.textContent =
      "입장 알림 신청 완료";

    setNotificationStatus(
      "입장 순서가 되면 이 휴대폰으로 알려드립니다."
    );

    await showLocalNotification(
      "2026 소래포구축제",
      "입장 알림 신청이 완료되었습니다."
    );

  } catch (error) {
    console.error(
      "알림 설정 오류:",
      error
    );

    notificationButton.disabled = false;
    notificationButton.textContent =
      "입장 알림 다시 시도";

    const message =
      getFriendlyErrorMessage(error);

    setNotificationStatus(message);
    alert(message);

  } finally {
    notificationProcessing = false;
  }
}

    /*
     * 기존 예약의 ownerUid와 현재 로그인 UID가
     * 다르면 Firestore Rules에서 저장이 거부될 수 있다.
     */

    const currentUid =
      auth.currentUser?.uid || "";

    const reservationOwnerUid =
      currentReservation.ownerUid || "";

    if (
      reservationOwnerUid &&
      currentUid &&
      reservationOwnerUid !== currentUid
    ) {
      throw new Error(
        "이 예약은 다른 브라우저에서 생성되었습니다. 현재 브라우저에서 새로 대기 신청한 뒤 알림을 등록해주세요."
      );
    }

    await updateDoc(
      doc(
        db,
        "reservations",
        reservationId
      ),
      {
        fcmToken: token,
        notificationEnabled: true,
        notificationEnabledAt:
          serverTimestamp(),
        notificationUserAgent:
          navigator.userAgent
      }
    );

    notificationButton.disabled = true;
    notificationButton.textContent =
      "입장 알림 신청 완료";

    setNotificationStatus(
      "입장 순서가 되면 이 휴대폰으로 알려드립니다."
    );

    await showLocalNotification(
      "2026 소래포구축제",
      "입장 알림 신청이 완료되었습니다."
    );

  } catch (error) {
    console.error(
      "알림 설정 오류:",
      error
    );

    notificationButton.disabled = false;
    notificationButton.textContent =
      "입장 알림 다시 시도";

    const message =
      getFriendlyErrorMessage(error);

    setNotificationStatus(message);
    alert(message);

  } finally {
    notificationProcessing = false;
  }
}


/* ==================================================
   신청 완료 테스트 알림
================================================== */

async function showLocalNotification(
  title,
  body
) {
  try {
    if (
      Notification.permission !==
      "granted"
    ) {
      return;
    }

    if (!serviceWorkerRegistration) {
      serviceWorkerRegistration =
        await registerMessagingServiceWorker();
    }

    await serviceWorkerRegistration
      .showNotification(
        title,
        {
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: "sorae-notification-test",
          data: {
            url: window.location.href
          }
        }
      );
  } catch (error) {
    /*
     * 테스트 알림 실패는 토큰 저장 성공과 별개이므로
     * 등록 자체를 실패 처리하지 않는다.
     */

    console.warn(
      "신청 완료 알림 표시 오류:",
      error
    );
  }
}


/* ==================================================
   화면을 보고 있을 때 푸시 수신
================================================== */

function listenForegroundMessages() {
  if (!messaging) {
    return;
  }

  try {
    onMessage(
      messaging,

      async (payload) => {
        console.log(
          "화면 활성 상태 메시지:",
          payload
        );

        const title =
          payload.notification?.title ||
          "2026 소래포구축제";

        const body =
          payload.notification?.body ||
          "입장 순서가 되었습니다.";

        await showLocalNotification(
          title,
          body
        );

        alert(
          `${title}\n\n${body}`
        );
      }
    );
  } catch (error) {
    console.error(
      "실시간 메시지 연결 오류:",
      error
    );
  }
}


/* ==================================================
   오류 문구 정리
================================================== */

function getFriendlyErrorMessage(error) {
  const code =
    error?.code || "";

  const originalMessage =
    error?.message || "";

  /*
   * Firestore 저장 권한 오류를 먼저 확인한다.
   */
  if (
    code === "permission-denied" ||
    code.includes("firestore/permission-denied") ||
    originalMessage.includes(
      "Missing or insufficient permissions"
    )
  ) {
    return "현재 예약 정보를 수정할 권한이 없습니다. 이 브라우저에서 새로 대기 신청한 뒤 알림을 등록해주세요.";
  }

  /*
   * 실제 브라우저 알림 권한 오류
   */
  if (
    code.includes("permission-blocked") ||
    originalMessage.includes(
      "알림이 차단되어 있습니다"
    )
  ) {
    return "알림이 차단되어 있습니다. 브라우저의 사이트 설정에서 알림을 허용해주세요.";
  }

  if (
    code.includes("unsupported-browser")
  ) {
    return "현재 브라우저에서는 웹 알림을 지원하지 않습니다.";
  }

  if (
    code.includes("token-subscribe-failed")
  ) {
    return "알림 기기 등록에 실패했습니다. 브라우저를 완전히 종료한 뒤 다시 시도해주세요.";
  }

  if (
    code.includes("invalid-vapid-key")
  ) {
    return "웹 푸시 인증키가 올바르지 않습니다.";
  }

  return (
    originalMessage ||
    "알림 설정에 실패했습니다. 잠시 후 다시 시도해주세요."
  );
}

/* ==================================================
   공통 함수
================================================== */

function setText(element, text) {
  if (!element) {
    return;
  }

  element.textContent = text;
}


function setNotificationStatus(message) {
  if (!notificationStatusElement) {
    return;
  }

  notificationStatusElement.textContent =
    message;
}


function showPageError(message) {
  setText(
    statusMessageElement,
    message
  );

  if (cancelButton) {
    cancelButton.disabled = true;
  }

  if (notificationButton) {
    notificationButton.disabled = true;
  }

  console.error(message);
}


/* ==================================================
   페이지 종료
================================================== */

window.addEventListener(
  "beforeunload",
  () => {
    if (reservationUnsubscribe) {
      reservationUnsubscribe();
    }

    if (boothUnsubscribe) {
      boothUnsubscribe();
    }
  }
);
