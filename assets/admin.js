import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection, doc, onSnapshot, writeBatch, updateDoc,
  query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const BOOTHS = [
  { id:"salt", name:"소래 염전체험", icon:"🧂", order:1 },
  { id:"mud", name:"소래 머드 체험", icon:"🟫", order:2 },
  { id:"crab", name:"꽃게 잡기", icon:"🦀", order:3 },
  { id:"shrimp", name:"대하 잡기", icon:"🦐", order:4 }
];

const loginSection = document.querySelector("#loginSection");
const dashboardSection = document.querySelector("#dashboardSection");
const adminGrid = document.querySelector("#adminGrid");

onAuthStateChanged(auth, (user) => {
  const isAdmin = user && !user.isAnonymous;
  loginSection.classList.toggle("hidden", isAdmin);
  dashboardSection.classList.toggle("hidden", !isAdmin);
  if (isAdmin) startRealtime();
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.querySelector("#loginError");
  error.textContent = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      document.querySelector("#adminEmail").value.trim(),
      document.querySelector("#adminPassword").value
    );
  } catch {
    error.textContent = "이메일 또는 비밀번호를 확인해주세요.";
  }
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  await signOut(auth);
});

document.querySelector("#initializeButton").addEventListener("click", async () => {
  if (!confirm("체험 4종을 생성하거나 기본값으로 갱신할까요?")) return;

  const batch = writeBatch(db);
  for (const booth of BOOTHS) {
    batch.set(doc(db, "booths", booth.id), {
      ...booth,
      currentNumber: 0,
      lastNumber: 0,
      capacity: 5,
      minutesPerTurn: 10,
      totalPeople: 0,
      isOpen: true
    }, { merge: true });
  }
  await batch.commit();
  document.querySelector("#adminMessage").textContent = "체험 4종이 준비되었습니다.";
});

let realtimeStarted = false;
function startRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;

  onSnapshot(collection(db, "booths"), (snapshot) => {
    const booths = snapshot.docs.map((item) => ({ id:item.id, ...item.data() }))
      .sort((a,b)=>(a.order ?? 99)-(b.order ?? 99));
    renderAdmin(booths);
  });
}

function renderAdmin(booths) {
  adminGrid.innerHTML = "";

  for (const booth of booths) {
    const capacity = Number(booth.capacity || 5);
    const current = Number(booth.currentNumber || 0);
    const last = Number(booth.lastNumber || 0);
    const waiting = Math.max(0, last-current);

    const article = document.createElement("article");
    article.className = "admin-card";
    article.innerHTML = `
      <div class="admin-card-head">
        <div>
          <span class="booth-icon">${booth.icon || "🎣"}</span>
          <h2>${booth.name}</h2>
        </div>
        <label class="toggle-wrap">
          <span>${booth.isOpen ? "접수 중" : "마감"}</span>
          <input class="open-toggle" type="checkbox" ${booth.isOpen ? "checked" : ""}>
        </label>
      </div>

      <div class="current-panel">
        <span>현재 입장</span>
        <strong>${current > 0 ? `${Math.max(1,current-capacity+1)}~${current}번` : "입장 전"}</strong>
      </div>

      <div class="admin-metrics">
        <div><span>대기팀</span><strong>${waiting}팀</strong></div>
        <div><span>마지막 번호</span><strong>${last}번</strong></div>
        <div><span>누적 참여</span><strong>${Number(booth.totalPeople || 0)}명</strong></div>
      </div>

      <button class="btn btn-primary next-call">다음 5팀 호출</button>
      <button class="btn btn-secondary reset-number">당일 번호 초기화</button>
    `;

    article.querySelector(".open-toggle").addEventListener("change", async (event) => {
      await updateDoc(doc(db, "booths", booth.id), { isOpen: event.target.checked });
    });

    article.querySelector(".next-call").addEventListener("click", async () => {
      const newCurrent = Math.min(last, current + capacity);
      if (newCurrent <= current) {
        alert("호출할 대기팀이 없습니다.");
        return;
      }

      await updateDoc(doc(db, "booths", booth.id), { currentNumber: newCurrent });

      const waitingQuery = query(
        collection(db, "reservations"),
        where("boothId", "==", booth.id),
        where("status", "==", "waiting")
      );
      const snapshot = await getDocs(waitingQuery);
      const batch = writeBatch(db);

      snapshot.forEach((reservation) => {
        if (Number(reservation.data().ticketNumber) <= newCurrent) {
          batch.update(reservation.ref, {
            status: "called",
            calledAt: serverTimestamp()
          });
        }
      });
      await batch.commit();
    });

    article.querySelector(".reset-number").addEventListener("click", async () => {
      if (!confirm(`${booth.name}의 번호와 누적 참여 인원을 초기화할까요?`)) return;
      await updateDoc(doc(db, "booths", booth.id), {
        currentNumber: 0,
        lastNumber: 0,
        totalPeople: 0
      });
    });

    adminGrid.appendChild(article);
  }
}
