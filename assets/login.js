import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (user && !user.isAnonymous) location.href = "./admin.html";
});

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.querySelector("#loginError");
  errorEl.textContent = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      document.querySelector("#email").value.trim(),
      document.querySelector("#password").value
    );
    location.href = "./admin.html";
  } catch (e) {
    errorEl.textContent = "이메일 또는 비밀번호를 확인해주세요.";
  }
});
