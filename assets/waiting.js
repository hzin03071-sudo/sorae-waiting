import { auth, db } from "./firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  doc, onSnapshot, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

await signInAnonymously(auth);

const params = new URLSearchParams(location.search);
const reservationId = params.get("id") || localStorage.getItem("soraeReservationId");

if (!reservationId) {
  alert("대기 등록 정보를 찾을 수 없습니다.");
  location.href = "./index.html";
}

let reservation = null;
let booth = null;
let unsubBooth = null;

onSnapshot(doc(db, "reservations", reservationId), (snap) => {
  if (!snap.exists()) {
    alert("대기 정보가 존재하지 않습니다.");
    location.href = "./index.html";
    return;
  }
  reservation = snap.data();

  if (unsubBooth) unsubBooth();
  unsubBooth = onSnapshot(doc(db, "booths", reservation.boothId), (boothSnap) => {
    booth = boothSnap.data();
    render();
  });
}, console.error);

function render() {
  if (!reservation || !booth) return;

  const current = Number(booth.currentNumber || 0);
  const capacity = Number(booth.capacity || 5);
  const ticket = Number(reservation.ticketNumber);
  const ahead = Math.max(0, ticket - current - 1);
  const estimate = Math.ceil(ahead / capacity) * Number(booth.minutesPerTurn || 10);

  document.querySelector("#boothName").textContent = reservation.boothName;
  document.querySelector("#ticketNumber").textContent = ticket;
  document.querySelector("#currentRange").textContent =
    current > 0 ? `${Math.max(1,current-capacity+1)}~${current}번` : "입장 전";
  document.querySelector("#aheadCount").textContent = `${ahead}팀`;
  document.querySelector("#estimateTime").textContent = ahead ? `약 ${estimate}분` : "곧 입장";

  const msg = document.querySelector("#callMessage");
  const isCalled = reservation.status === "called" || ticket <= current;
  const isCancelled = reservation.status === "cancelled";
  const isCompleted = reservation.status === "completed";

  if (isCancelled) {
    msg.textContent = "취소된 대기입니다.";
    msg.className = "call-message cancelled";
  } else if (isCompleted) {
    msg.textContent = "체험이 완료되었습니다.";
    msg.className = "call-message done";
  } else if (isCalled) {
    msg.textContent = "지금 입장해주세요!";
    msg.className = "call-message called";
  } else if (ahead < 5) {
    msg.textContent = "곧 입장 순서입니다. 체험장 근처에서 대기해주세요.";
    msg.className = "call-message soon";
  } else {
    msg.textContent = "현재 정상적으로 대기 중입니다.";
    msg.className = "call-message";
  }

  document.querySelector("#cancelButton").disabled = isCalled || isCancelled || isCompleted;
}

document.querySelector("#cancelButton").addEventListener("click", async () => {
  if (!confirm("대기를 취소하시겠습니까?")) return;
  await updateDoc(doc(db, "reservations", reservationId), {
    status: "cancelled",
    cancelledAt: serverTimestamp()
  });
});
