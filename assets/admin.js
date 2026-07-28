import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection, doc, onSnapshot, writeBatch, updateDoc,
  query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const BOOTHS = [
  { id:"salt", name:"소래 염전체험", icon:"🧂 염전", order:1 },
  { id:"mud", name:"소래 머드 체험", icon:"🟫 머드", order:2 },
  { id:"crab", name:"꽃게 잡기", icon:"🦀 꽃게", order:3 },
  { id:"shrimp", name:"대하 잡기", icon:"🦐 대하", order:4 }
];

const adminGrid = document.querySelector("#adminGrid");
const template = document.querySelector("#adminTemplate");
const message = document.querySelector("#adminMessage");

onAuthStateChanged(auth, (user) => {
  if (!user || user.isAnonymous) {
    location.href = "./login.html";
    return;
  }
  startRealtime();
});

document.querySelector("#logoutButton").addEventListener("click", async () => {
  await signOut(auth);
  location.href = "./login.html";
});

document.querySelector("#initializeButton").addEventListener("click", async () => {
  if (!confirm("체험 4종의 기본 정보를 생성하거나 갱신할까요?")) return;
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
  message.textContent = "체험 4종이 준비되었습니다.";
});

function startRealtime() {
  onSnapshot(collection(db, "booths"), (snapshot) => {
    const booths = snapshot.docs.map(d => ({ id:d.id, ...d.data() }))
      .sort((a,b)=>(a.order ?? 99)-(b.order ?? 99));
    render(booths);
  }, (error) => {
    message.textContent = "데이터를 불러오지 못했습니다.";
    console.error(error);
  });
}

function render(booths) {
  adminGrid.innerHTML = "";
  for (const booth of booths) {
    const node = template.content.cloneNode(true);
    const capacity = Number(booth.capacity || 5);
    const current = Number(booth.currentNumber || 0);
    const last = Number(booth.lastNumber || 0);

    node.querySelector(".booth-tag").textContent = booth.icon || "체험";
    node.querySelector(".booth-title").textContent = booth.name;
    node.querySelector(".current-range").textContent =
      current > 0 ? `${Math.max(1,current-capacity+1)}~${current}번` : "입장 전";
    node.querySelector(".waiting-count").textContent = `${Math.max(0,last-current)}팀`;
    node.querySelector(".last-number").textContent = String(last);
    node.querySelector(".total-people").textContent = `${Number(booth.totalPeople || 0)}명`;

    const toggle = node.querySelector(".open-toggle");
    toggle.checked = Boolean(booth.isOpen);
    toggle.addEventListener("change", () =>
      updateDoc(doc(db, "booths", booth.id), { isOpen: toggle.checked })
    );

    node.querySelector(".next-button").addEventListener("click", async () => {
      const newCurrent = Math.min(last, current + capacity);
      if (newCurrent <= current) {
        alert("호출할 대기팀이 없습니다.");
        return;
      }

      await updateDoc(doc(db, "booths", booth.id), { currentNumber: newCurrent });

      const q = query(
        collection(db, "reservations"),
        where("boothId", "==", booth.id),
        where("status", "==", "waiting")
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(r => {
        const data = r.data();
        if (Number(data.ticketNumber) <= newCurrent) {
          batch.update(r.ref, { status:"called", calledAt:serverTimestamp() });
        }
      });
      await batch.commit();
    });

    node.querySelector(".reset-button").addEventListener("click", async () => {
      if (!confirm(`${booth.name} 번호를 0번으로 초기화할까요? 당일 운영 종료 후에만 사용하세요.`)) return;
      await updateDoc(doc(db, "booths", booth.id), {
        currentNumber: 0,
        lastNumber: 0,
        totalPeople: 0
      });
    });

    adminGrid.appendChild(node);
  }
}
