console.log("LOGIN JS LOADED");

// ===== SWITCH BETWEEN LOGIN & REGISTER =====
function switchTab(tab) {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");

  if (!loginForm || !registerForm || !loginTab || !registerTab) {
    console.error("Login/register forms or tabs not found!");
    return;
  }

  if (tab === "login") {
    loginForm.style.display = "block";
    registerForm.style.display = "none";

    loginTab.classList.add("active");
    registerTab.classList.remove("active");
  } else {
    loginForm.style.display = "none";
    registerForm.style.display = "block";

    loginTab.classList.remove("active");
    registerTab.classList.add("active");
  }

  clearMessages();
}

// ===== MESSAGE HELPERS =====
function clearMessages() {
  const alertBox = document.getElementById("alertBox");
  const successBox = document.getElementById("successBox");

  if (alertBox) alertBox.innerText = "";
  if (successBox) successBox.innerText = "";
}

function showError(message) {
  const alertBox = document.getElementById("alertBox");
  const successBox = document.getElementById("successBox");

  if (successBox) successBox.innerText = "";
  if (alertBox) alertBox.innerText = message;
}

function showSuccess(message) {
  const alertBox = document.getElementById("alertBox");
  const successBox = document.getElementById("successBox");

  if (alertBox) alertBox.innerText = "";
  if (successBox) successBox.innerText = message;
}

// ===== ROLE REDIRECT FOR REGISTER DROPDOWN =====
function handleRoleRedirect() {
  const roleSelect = document.getElementById("regRole");

  if (!roleSelect) {
    console.warn("regRole dropdown not found.");
    return false;
  }

  const role = String(roleSelect.value || "").toLowerCase().trim();

  console.log("Selected role:", role);

  if (role === "restaurant_owner" || role.includes("restaurant")) {
    showSuccess("Redirecting to restaurant registration...");

    setTimeout(() => {
      window.location.href = "restaurant-signup.html";
    }, 350);

    return true;
  }

  if (
    role === "rider" ||
    role === "delivery_rider" ||
    role.includes("rider") ||
    role.includes("delivery")
  ) {
    showSuccess("Redirecting to rider panel...");

    setTimeout(() => {
      /*
        If you create rider-signup.html later,
        change this to: rider-signup.html
      */
      window.location.href = "rider-signup.html";
    }, 350);

    return true;
  }

  return false;
}

// ===== LOGIN FUNCTION =====
function handleLogin() {
  const email = document.getElementById("loginEmail")?.value.trim();
  const password = document.getElementById("loginPassword")?.value.trim();

  clearMessages();

  if (!email || !password) {
    showError("Please enter email and password!");
    return;
  }

  const formData = new FormData();
  formData.append("action", "login");
  formData.append("email", email);
  formData.append("password", password);

  const loginUrl = new URL(
    "../../backend/controllers/AuthController.php",
    window.location.href
  ).href;

  console.log("Login URL:", loginUrl);

  fetch(loginUrl, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      return res.text();
    })
    .then((data) => {
      console.log("Login Response:", data);

      if (data.includes("Login successful")) {
        showSuccess(data);

        localStorage.setItem("userEmail", email);
        localStorage.setItem("isLoggedIn", "true");

        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 1000);
      } else {
        showError(data);
      }
    })
    .catch((error) => {
      console.error("Login Error:", error);
      showError("Something went wrong: " + error.message);
    });
}

// ===== REGISTER FUNCTION =====
function handleRegister() {
  const name = document.getElementById("regName")?.value.trim();
  const email = document.getElementById("regEmail")?.value.trim();
  const password = document.getElementById("regPassword")?.value.trim();
  const phone = document.getElementById("regPhone")?.value.trim();
  const address = document.getElementById("regAddress")?.value.trim();
  const role = document.getElementById("regRole")?.value.trim();

  clearMessages();

  /*
    Role-based routing:
    - Customer uses normal AuthController registration.
    - Restaurant Owner goes to restaurant-signup.html.
    - Rider goes to rider-dashboard.html for now.
  */
  if (handleRoleRedirect()) {
    return;
  }

  if (!name || !email || !password) {
    showError("Please fill all required fields!");
    return;
  }

  if (password.length < 6) {
    showError("Password must be at least 6 characters.");
    return;
  }

  const formData = new FormData();
  formData.append("action", "register");
  formData.append("name", name);
  formData.append("email", email);
  formData.append("password", password);
  formData.append("phone", phone || "");
  formData.append("address", address || "");
  formData.append("role", role || "customer");

  fetch("../../backend/controllers/AuthController.php", {
    method: "POST",
    body: formData,
    credentials: "same-origin",
  })
    .then((res) => res.text())
    .then((data) => {
      console.log("Register Response:", data);

      if (data.includes("Registered successfully")) {
        showSuccess(data);

        setTimeout(() => {
          switchTab("login");
        }, 1000);
      } else {
        showError(data);
      }
    })
    .catch((error) => {
      console.error("Register Error:", error);
      showError("Registration failed!");
    });
}

// ===== TOGGLE PASSWORD VISIBILITY =====
function togglePassword(id, btn) {
  const input = document.getElementById(id);

  if (!input || !btn) return;

  if (input.type === "password") {
    input.type = "text";
    btn.innerText = "🙈";
  } else {
    input.type = "password";
    btn.innerText = "👁️";
  }
}

// ===== INIT ROLE CHANGE LISTENER =====
document.addEventListener("DOMContentLoaded", () => {
  const roleSelect = document.getElementById("regRole");

  if (roleSelect) {
    roleSelect.addEventListener("change", handleRoleRedirect);
  }
});

// ===== MAKE FUNCTIONS GLOBAL =====
window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.togglePassword = togglePassword;
window.handleRoleRedirect = handleRoleRedirect;