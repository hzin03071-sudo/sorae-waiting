import { auth, db } from "./firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection, doc, onSnapshot, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const boothList = document.querySelector("#boothList");
const template = document.querySelector("#boothTemplate");
const notice = document.querySelector("#notice");
const dialog = document.querySelector("#reserveDialog");
const form = document.querySelector("#reserveForm");
const selectedBoothName = document.querySelector("#selectedBoothName");
const closeDialog = document.querySelector("#closeDialog");
const submitReserve = document.querySelector("#submitReserve");

let selectedBooth = null;
let boothCache = new Map();

await signInAnonymously(auth);

onSnapshot(collection(db, "booths"), (snapshot) => {
  boothCache.clear();
  snapshot.forEach(d => boothCache.set(d.id, { id: d.id, ...d.data() }));
  render();
}, (error) => {
  notice.textContent = "대기 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
  console.error(error);
});

function render() {
  boothList.innerHTML = "";
  const booths = [...boothCache.values()].sort((a,b)=>(a.order ?? 99)-(b.order ?? 99));

  if (!booths.length) {
    notice.textContent = "운영자가 체험 정보를 준비 중입니다.";
    return;
  }
  notice.textContent = "대기 등록 후 이 화면을 닫아도 다시 확인할 수 있습니다.";

  for (const booth of booths) {
    const node = template.content.cloneNode(true);
    const capacity = Number(booth.capacity || 5);
    const current = Number(booth.currentNumber || 0);
    const last = Number(booth.lastNumber || 0);
    const waiting = Math.max(0, last - current);
    const turns = Math.ceil(waiting / capacity);
    const estimate = turns * Number(booth.minutesPerTurn || 10);

    node.querySelector(".tag").textContent = booth.icon || "체험";
    node.querySelector(".booth-name").textContent = booth.name;
    node.querySelector(".status").textContent = booth.isOpen ? "접수 중" : "마감";
    node.querySelector(".status").classList.toggle("closed", !booth.isOpen);
    node.querySelector(".current").textContent =
      current > 0 ? `${Math.max(1,current-capacity+1)}~${current}번` : "입장 전";
    node.querySelector(".waiting").textContent = `${waiting}팀`;
    node.querySelector(".estimate").textContent = waiting ? `약 ${estimate}분` : "바로 가능";

    const btn = node.querySelector(".reserve-btn");
    btn.disabled = !booth.isOpen;
    btn.textContent = booth.isOpen ? "대기 등록" : "접수 마감";
    btn.addEventListener("click", () => {
      selectedBooth = booth;
      selectedBoothName.textContent = booth.name;
      dialog.showModal();
    });

    boothList.appendChild(node);
  }
}

closeDialog.addEventListener("click", () => dialog.close());

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedBooth) return;

  submitReserve.disabled = true;
  submitReserve.textContent = "등록 중...";

  const name = document.querySelector("#customerName").value.trim();
  const phoneLast4 = document.querySelector("#phoneLast4").value.trim();
  const partySize = Number(document.querySelector("#partySize").value);

  try {
    const boothRef = doc(db, "booths", selectedBooth.id);
    const reservationId = crypto.randomUUID();
    const reservationRef = doc(db, "reservations", reservationId);

    const ticketNumber = await runTransaction(db, async (tx) => {
      const snap = await tx.get(boothRef);
      if (!snap.exists()) throw new Error("체험 정보를 찾을 수 없습니다.");
      const booth = snap.data();
      if (!booth.isOpen) throw new Error("현재 접수가 마감되었습니다.");

      const next = Number(booth.lastNumber || 0) + 1;
      tx.update(boothRef, {
        lastNumber: next,
        totalPeople: Number(booth.totalPeople || 0) + partySize
      });
      tx.set(reservationRef, {
        boothId: selectedBooth.id,
        boothName: booth.name,
        ticketNumber: next,
        name,
        phoneLast4,
        partySize,
        status: "waiting",
        ownerUid: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });
      return next;
    });

    localStorage.setItem("soraeReservationId", reservationId);
    localStorage.setItem("soraeTicketNumber", String(ticketNumber));
    location.href = `./waiting.html?id=${encodeURIComponent(reservationId)}`;
  } catch (e) {
    alert(e.message || "등록 중 오류가 발생했습니다.");
    submitReserve.disabled = false;
    submitReserve.textContent = "대기번호 받기";
  }
});
