import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
  updateDoc,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


const BOOTHS = [
  {
    id: "salt",
    name: "소래 염전체험",
    icon: "🧂",
    order: 1
  },
  {
    id: "mud",
    name: "소래 머드 체험",
    icon: "🟫",
    order: 2
  },
  {
    id: "crab",
    name: "꽃게 잡기",
    icon: "🦀",
    order: 3
  },
  {
    id: "shrimp",
    name: "대하 잡기",
    icon: "🦐",
    order: 4
  }
];


const loginSection =
  document.querySelector("#loginSection");

const dashboardSection =
  document.querySelector("#dashboardSection");

const adminGrid =
  document.querySelector("#adminGrid");

const adminMessage =
  document.querySelector("#adminMessage");


let realtimeStarted = false;


/* ----------------------------------
   관리자 로그인 상태 확인
---------------------------------- */

onAuthStateChanged(auth, (user) => {
  const isAdmin = Boolean(user && !user.isAnonymous);

  loginSection.classList.toggle("hidden", isAdmin);
  dashboardSection.classList.toggle("hidden", !isAdmin);

  if (isAdmin) {
    startRealtime();
  }
});


/* ----------------------------------
   관리자 로그인
---------------------------------- */

document
  .querySelector("#loginForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const error =
      document.querySelector("#loginError");

    error.textContent = "";

    try {
      await signInWithEmailAndPassword(
        auth,
        document
          .querySelector("#adminEmail")
          .value
          .trim(),

        document
          .querySelector("#adminPassword")
          .value
      );
    } catch (loginError) {
      console.error("관리자 로그인 오류:", loginError);

      error.textContent =
        "이메일 또는 비밀번호를 확인해주세요.";
    }
  });


/* ----------------------------------
   로그아웃
---------------------------------- */

document
  .querySelector("#logoutButton")
  .addEventListener("click", async () => {
    await signOut(auth);
  });


/* ----------------------------------
   체험 부스 초기 생성
---------------------------------- */

document
  .querySelector("#initializeButton")
  .addEventListener("click", async () => {
    const confirmed = confirm(
      "체험 4종을 생성하거나 기본값으로 갱신할까요?"
    );

    if (!confirmed) return;

    try {
      const batch = writeBatch(db);

      for (const booth of BOOTHS) {
        batch.set(
          doc(db, "booths", booth.id),
          {
            ...booth,
            currentNumber: 0,
            lastNumber: 0,
            capacity: 5,
            minutesPerTurn: 10,
            totalPeople: 0,
            isOpen: true
          },
          {
            merge: true
          }
        );
      }

      await batch.commit();

      showAdminMessage(
        "체험 4종이 준비되었습니다."
      );
    } catch (error) {
      console.error("체험 초기화 오류:", error);

      showAdminMessage(
        "체험 정보를 준비하지 못했습니다."
      );
    }
  });


/* ----------------------------------
   실시간 부스 현황
---------------------------------- */

function startRealtime() {
  if (realtimeStarted) return;

  realtimeStarted = true;

  onSnapshot(
    collection(db, "booths"),

    (snapshot) => {
      const booths = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data()
        }))
        .sort(
          (a, b) =>
            (a.order ?? 99) -
            (b.order ?? 99)
        );

      renderAdmin(booths);
    },

    (error) => {
      console.error(
        "부스 실시간 조회 오류:",
        error
      );

      showAdminMessage(
        "부스 현황을 불러오지 못했습니다."
      );
    }
  );
}


/* ----------------------------------
   관리자 화면 출력
---------------------------------- */

function renderAdmin(booths) {
  adminGrid.innerHTML = "";

  for (const booth of booths) {
    const capacity =
      Number(booth.capacity || 5);

    const current =
      Number(booth.currentNumber || 0);

    const last =
      Number(booth.lastNumber || 0);

    const waiting =
      Math.max(0, last - current);


    const article =
      document.createElement("article");

    article.className = "admin-card";

    article.innerHTML = `
      <div class="admin-card-head">
        <div>
          <span class="booth-icon">
            ${booth.icon || "🎣"}
          </span>

          <h2>${booth.name}</h2>
        </div>

        <label class="toggle-wrap">
          <span>
            ${booth.isOpen ? "접수 중" : "마감"}
          </span>

          <input
            class="open-toggle"
            type="checkbox"
            ${booth.isOpen ? "checked" : ""}
          >
        </label>
      </div>

      <div class="current-panel">
        <span>현재 입장</span>

        <strong>
          ${
            current > 0
              ? `${Math.max(
                  1,
                  current - capacity + 1
                )}~${current}번`
              : "입장 전"
          }
        </strong>
      </div>

      <div class="admin-metrics">
        <div>
          <span>대기팀</span>
          <strong>${waiting}팀</strong>
        </div>

        <div>
          <span>마지막 번호</span>
          <strong>${last}번</strong>
        </div>

        <div>
          <span>누적 참여</span>
          <strong>
            ${Number(booth.totalPeople || 0)}명
          </strong>
        </div>
      </div>

      <button
        class="btn btn-primary next-call"
        type="button"
      >
        다음 ${capacity}팀 호출
      </button>

      <button
        class="btn btn-secondary reset-number"
        type="button"
      >
        당일 번호 초기화
      </button>
    `;


    const openToggle =
      article.querySelector(".open-toggle");

    const nextCallButton =
      article.querySelector(".next-call");

    const resetButton =
      article.querySelector(".reset-number");


    /* 접수 시작 및 마감 */

    openToggle.addEventListener(
      "change",
      async (event) => {
        const checked =
          event.target.checked;

        event.target.disabled = true;

        try {
          await updateDoc(
            doc(db, "booths", booth.id),
            {
              isOpen: checked
            }
          );

          showAdminMessage(
            checked
              ? `${booth.name} 접수를 시작했습니다.`
              : `${booth.name} 접수를 마감했습니다.`
          );
        } catch (error) {
          console.error(
            "접수 상태 변경 오류:",
            error
          );

          event.target.checked = !checked;

          showAdminMessage(
            "접수 상태를 변경하지 못했습니다."
          );
        } finally {
          event.target.disabled = false;
        }
      }
    );


    /* 다음 팀 호출 */

    nextCallButton.addEventListener(
      "click",
      async () => {
        await callNextTeams({
          booth,
          current,
          last,
          capacity,
          button: nextCallButton
        });
      }
    );


    /* 번호 초기화 */

    resetButton.addEventListener(
      "click",
      async () => {
        const confirmed = confirm(
          `${booth.name}의 번호와 누적 참여 인원을 초기화할까요?`
        );

        if (!confirmed) return;

        resetButton.disabled = true;
        resetButton.textContent = "초기화 중...";

        try {
          await updateDoc(
            doc(db, "booths", booth.id),
            {
              currentNumber: 0,
              lastNumber: 0,
              totalPeople: 0
            }
          );

          showAdminMessage(
            `${booth.name} 번호를 초기화했습니다.`
          );
        } catch (error) {
          console.error(
            "번호 초기화 오류:",
            error
          );

          showAdminMessage(
            "번호를 초기화하지 못했습니다."
          );
        } finally {
          resetButton.disabled = false;
          resetButton.textContent =
            "당일 번호 초기화";
        }
      }
    );


    adminGrid.appendChild(article);
  }
}


/* ----------------------------------
   다음 대기팀 호출
---------------------------------- */

async function callNextTeams({
  booth,
  current,
  last,
  capacity,
  button
}) {
  const newCurrent =
    Math.min(last, current + capacity);

  if (newCurrent <= current) {
    alert("호출할 대기팀이 없습니다.");
    return;
  }

  button.disabled = true;
  button.textContent = "호출 처리 중...";

  try {
    const waitingQuery = query(
      collection(db, "reservations"),

      where(
        "boothId",
        "==",
        booth.id
      ),

      where(
        "status",
        "==",
        "waiting"
      )
    );


    const snapshot =
      await getDocs(waitingQuery);


    const reservationsToCall =
      snapshot.docs
        .filter((reservation) => {
          const ticketNumber =
            Number(
              reservation.data().ticketNumber
            );

          return (
            ticketNumber > current &&
            ticketNumber <= newCurrent
          );
        })
        .sort((a, b) => {
          return (
            Number(a.data().ticketNumber) -
            Number(b.data().ticketNumber)
          );
        });


    if (reservationsToCall.length === 0) {
      showAdminMessage(
        "호출 범위에 대기 중인 예약이 없습니다."
      );

      return;
    }


    /*
     * 부스 현재 번호 변경과
     * 예약 상태 변경을 한 번에 저장
     */

    const batch = writeBatch(db);

    batch.update(
      doc(db, "booths", booth.id),
      {
        currentNumber: newCurrent
      }
    );


    for (
      const reservation
      of reservationsToCall
    ) {
      batch.update(
        reservation.ref,
        {
          status: "called",
          calledAt: serverTimestamp()
        }
      );
    }


    await batch.commit();


    const reservationIds =
      reservationsToCall.map(
        (reservation) => reservation.id
      );


    /*
     * Firestore 호출 처리는 완료됐으므로
     * 푸시 실패가 발생해도 호출 자체는 유지
     */

    const pushResult =
      await sendPushNotifications(
        reservationIds
      );


    if (pushResult.ok) {
      if (pushResult.sent > 0) {
        showAdminMessage(
          `${booth.name} ${current + 1}~${newCurrent}번을 호출했습니다. 알림 ${pushResult.sent}건을 발송했습니다.`
        );
      } else {
        showAdminMessage(
          `${booth.name} ${current + 1}~${newCurrent}번을 호출했습니다. 알림을 허용한 이용자는 없습니다.`
        );
      }
    } else {
      showAdminMessage(
        `${booth.name} 호출은 완료됐지만 푸시 알림 발송에 실패했습니다.`
      );
    }
  } catch (error) {
    console.error(
      "다음 팀 호출 오류:",
      error
    );

    showAdminMessage(
      "호출 처리 중 오류가 발생했습니다."
    );
  } finally {
    button.disabled = false;
    button.textContent =
      `다음 ${capacity}팀 호출`;
  }
}


/* ----------------------------------
   푸시 알림 API 호출
---------------------------------- */

async function sendPushNotifications(
  reservationIds
) {
  try {
    const user = auth.currentUser;

    if (!user || user.isAnonymous) {
      throw new Error(
        "운영자 로그인이 필요합니다."
      );
    }


    const idToken =
      await user.getIdToken(true);


    const response = await fetch(
      "/api/sendPush",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${idToken}`
        },

        body: JSON.stringify({
          reservationIds
        })
      }
    );


    let result;

    try {
      result = await response.json();
    } catch {
      result = {
        ok: false,
        message:
          "서버 응답을 확인할 수 없습니다."
      };
    }


    if (!response.ok) {
      throw new Error(
        result.message ||
        `푸시 서버 오류: ${response.status}`
      );
    }


    return {
      ok: true,
      sent: Number(result.sent || 0),
      failed: Number(result.failed || 0),
      message: result.message || ""
    };
  } catch (error) {
    console.error(
      "푸시 알림 API 오류:",
      error
    );

    return {
      ok: false,
      sent: 0,
      failed: reservationIds.length,
      message: error.message
    };
  }
}


/* ----------------------------------
   관리자 안내 문구
---------------------------------- */

function showAdminMessage(message) {
  if (!adminMessage) return;

  adminMessage.textContent = message;

  window.clearTimeout(
    showAdminMessage.timeoutId
  );

  showAdminMessage.timeoutId =
    window.setTimeout(() => {
      adminMessage.textContent = "";
    }, 7000);
}
