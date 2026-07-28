import { auth, db } from "./firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

await signInAnonymously(auth);

const params = new URLSearchParams(location.search);
const reservationId = params.get("id") || localStorage.getItem("soraeReservationId");

if (!reservationId) {
  alert("대기 정보를 찾을 수 없습니다.");
  location.href = "/";
}

let reservation = null;
let booth = null;
let boothUnsubscribe = null;

onSnapshot(doc(db, "reservations", reservationId), (snapshot) => {
  if (!snapshot.exists()) {
    alert("대기 정보가 존재하지 않습니다.");
    location.href = "/";
    return;
  }

  reservation = snapshot.data();
  localStorage.setItem("soraeReservationId", reservationId);

  if (boothUnsubscribe) boothUnsubscribe();
  boothUnsubscribe = onSnapshot(doc(db, "booths", reservation.boothId), (boothSnapshot) => {
    booth = boothSnapshot.data();
    render();
  });
});

function render() {
  if (!reservation || !booth) return;

  const current = Number(booth.currentNumber || 0);
  const capacity = Number(booth.capacity || 5);
  const ticket = Number(reservation.ticketNumber || 0);
  const ahead = Math.max(0, ticket - current - 1);
  const estimate = Math.ceil(ahead / capacity) * Number(booth.minutesPerTurn || 10);
  const called = reservation.status === "called" || ticket <= current;

  document.querySelector("#ticketBooth").textContent = reservation.boothName;
  document.querySelector("#ticketNumber").textContent = ticket;
  document.querySelector("#currentCall").textContent =
    current > 0 ? `${Math.max(1,current-capacity+1)}~${current}번` : "입장 전";
  document.querySelector("#aheadTeams").textContent = `${ahead}팀`;
  document.querySelector("#estimatedWait").textContent = ahead ? `약 ${estimate}분` : "곧 입장";

  const message = document.querySelector("#statusMessage");
  const cancelButton = document.querySelector("#cancelReservation");

  if (reservation.status === "cancelled") {
    message.textContent = "취소된 대기입니다.";
    message.className = "status-message cancelled";
    cancelButton.disabled = true;
  } else if (reservation.status === "completed") {
    message.textContent = "체험이 완료되었습니다.";
    message.className = "status-message completed";
    cancelButton.disabled = true;
  } else if (called) {
    message.textContent = "지금 체험장으로 입장해주세요!";
    message.className = "status-message called";
    cancelButton.disabled = true;
  } else if (ahead < 5) {
    message.textContent = "곧 입장 순서입니다. 체험장 근처에서 대기해주세요.";
    message.className = "status-message soon";
  } else {
    message.textContent = "현재 정상적으로 대기 중입니다.";
    message.className = "status-message";
  }
}

document.querySelector("#cancelReservation").addEventListener("click", async () => {
  if (!confirm("대기를 취소하시겠습니까?")) return;

  await updateDoc(doc(db, "reservations", reservationId), {
    status: "cancelled",
    cancelledAt: serverTimestamp()
  });

  localStorage.removeItem("soraeReservationId");
});
