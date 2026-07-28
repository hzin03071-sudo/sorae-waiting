import { auth, db } from "./firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection, doc, onSnapshot, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const grid = document.querySelector("#boothGrid");
const loading = document.querySelector("#loadingState");
const dialog = document.querySelector("#reservationDialog");
const form = document.querySelector("#reservationForm");
const activeTicketBox = document.querySelector("#activeTicketBox");

let selectedBooth = null;
let boothMap = new Map();

await signInAnonymously(auth);

const savedReservation = localStorage.getItem("soraeReservationId");
if (savedReservation) {
  activeTicketBox.classList.remove("hidden");
  activeTicketBox.innerHTML = `
    <div>
      <strong>진행 중인 대기번호가 있습니다.</strong>
      <span>내 대기 현황을 다시 확인할 수 있습니다.</span>
    </div>
    <a class="btn btn-secondary small-btn" href="/waiting.html?id=${encodeURIComponent(savedReservation)}">내 번호 확인</a>
  `;
}

onSnapshot(collection(db, "booths"), (snapshot) => {
  boothMap.clear();
  snapshot.forEach((item) => boothMap.set(item.id, { id: item.id, ...item.data() }));
  renderBooths();
}, (error) => {
  loading.textContent = "대기 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  console.error(error);
});

function renderBooths() {
  const booths = [...boothMap.values()].sort((a,b)=>(a.order ?? 99)-(b.order ?? 99));
  grid.innerHTML = "";
  loading.classList.toggle("hidden", booths.length > 0);

  for (const booth of booths) {
    const current = Number(booth.currentNumber || 0);
    const last = Number(booth.lastNumber || 0);
    const capacity = Number(booth.capacity || 5);
    const waitingTeams = Math.max(0, last - current);
    const waitMinutes = Math.ceil(waitingTeams / capacity) * Number(booth.minutesPerTurn || 10);
    const currentText = current > 0 ? `${Math.max(1,current-capacity+1)}~${current}번` : "입장 전";

    const article = document.createElement("article");
    article.className = "booth-card";
    article.innerHTML = `
      <div class="booth-card-head">
        <div>
          <span class="booth-icon">${booth.icon || "🎣"}</span>
          <h2>${escapeHtml(booth.name || "체험")}</h2>
        </div>
        <span class="open-badge ${booth.isOpen ? "" : "closed"}">${booth.isOpen ? "접수 중" : "마감"}</span>
      </div>

      <div class="booth-metrics">
        <div><span>현재 입장</span><strong>${currentText}</strong></div>
        <div><span>대기</span><strong>${waitingTeams}팀</strong></div>
        <div><span>예상</span><strong>${waitingTeams ? `약 ${waitMinutes}분` : "바로 가능"}</strong></div>
      </div>

      <button class="btn btn-primary reserve-button" ${booth.isOpen ? "" : "disabled"}>
        ${booth.isOpen ? "대기 등록" : "접수 마감"}
      </button>
    `;

    article.querySelector(".reserve-button").addEventListener("click", () => {
      selectedBooth = booth;
      document.querySelector("#dialogBoothName").textContent = booth.name;
      dialog.showModal();
    });

    grid.appendChild(article);
  }
}

document.querySelector("#dialogClose").addEventListener("click", () => dialog.close());

document.querySelector("#phoneNumber").addEventListener("input", (event) => {
  const digits = event.target.value.replace(/\D/g, "").slice(0,11);
  if (digits.length < 4) event.target.value = digits;
  else if (digits.length < 8) event.target.value = `${digits.slice(0,3)}-${digits.slice(3)}`;
  else event.target.value = `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedBooth) return;

  const submitButton = document.querySelector("#reserveSubmit");
  submitButton.disabled = true;
  submitButton.textContent = "등록 중...";

  const name = document.querySelector("#customerName").value.trim();
  const phone = document.querySelector("#phoneNumber").value.trim();
  const partySize = Number(document.querySelector("#partySize").value);

  try {
    const reservationId = crypto.randomUUID();
    const boothRef = doc(db, "booths", selectedBooth.id);
    const reservationRef = doc(db, "reservations", reservationId);

    const ticketNumber = await runTransaction(db, async (tx) => {
      const boothSnap = await tx.get(boothRef);
      if (!boothSnap.exists()) throw new Error("체험 정보를 찾을 수 없습니다.");

      const booth = boothSnap.data();
      if (!booth.isOpen) throw new Error("현재 접수가 마감되었습니다.");

      const nextTicket = Number(booth.lastNumber || 0) + 1;

      tx.update(boothRef, {
        lastNumber: nextTicket,
        totalPeople: Number(booth.totalPeople || 0) + partySize
      });

      tx.set(reservationRef, {
        boothId: selectedBooth.id,
        boothName: booth.name,
        ticketNumber: nextTicket,
        name,
        phone,
        partySize,
        status: "waiting",
        ownerUid: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });

      return nextTicket;
    });

    localStorage.setItem("soraeReservationId", reservationId);
    localStorage.setItem("soraeTicketNumber", String(ticketNumber));
    location.href = `/waiting.html?id=${encodeURIComponent(reservationId)}`;
  } catch (error) {
    alert(error.message || "등록 중 오류가 발생했습니다.");
    submitButton.disabled = false;
    submitButton.textContent = "대기번호 받기";
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[char]));
}
