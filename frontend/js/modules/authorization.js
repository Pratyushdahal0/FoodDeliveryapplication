import { renderNavbar } from "../components/navbar.js";
import { renderFooter } from "../components/footer.js";
import { loginUser, registerUser } from "../modules/auth.js";

document.getElementById("navbar").innerHTML = renderNavbar();
document.getElementById("footer").innerHTML = renderFooter();

const tabButtons = document.querySelectorAll(".tab-btn");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const authMessage = document.getElementById("authMessage");

function showMessage(text, type = "success") {
  authMessage.textContent = text;
  authMessage.className = `message show ${type}`;
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const tab = btn.dataset.tab;
    loginTab.classList.toggle("active", tab === "login");
    registerTab.classList.toggle("active", tab === "register");
  });
});

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const result = await loginUser(
      document.getElementById("loginEmail").value.trim(),
      document.getElementById("loginPassword").value
    );

    showMessage(result.message, result.success ? "success" : "error");

    if (result.success) {
      if (result.data.role === "admin") {
        window.location.href = "./admin.html";
      } else {
        window.location.href = "./index.html";
      }
    }
  } catch (error) {
    showMessage("Could not connect to backend", "error");
    console.error(error);
  }
});

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const payload = {
      name: document.getElementById("registerName").value.trim(),
      email: document.getElementById("registerEmail").value.trim(),
      password: document.getElementById("registerPassword").value,
      phone: document.getElementById("registerPhone").value.trim(),
      address: document.getElementById("registerAddress").value.trim(),
      role: document.getElementById("registerRole").value
    };

    const result = await registerUser(payload);
    showMessage(result.message, result.success ? "success" : "error");

    if (result.success) {
      document.getElementById("registerForm").reset();
      tabButtons[0].click();
    }
  } catch (error) {
    showMessage("Could not connect to backend", "error");
    console.error(error);
  }
});
