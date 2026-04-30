console.log("LOGIN JS LOADED - CLEAN SESSION VERSION");

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

function setButtonLoading(button, isLoading, loadingText = "Please wait...") {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalText = button.innerText;
    button.disabled = true;
    button.innerText = loadingText;
  } else {
    button.disabled = false;
    button.innerText = button.dataset.originalText || button.innerText;
  }
}

// Use lowercase path because your working backend URL is /fooddeliveryapp/
function getAuthUrl() {
  return "http://localhost/fooddeliveryapp/backend/controllers/AuthController.php";
}

// ===== CLEAN OLD SESSION BEFORE NEW LOGIN =====
function clearOldAuthSession() {
  const keysToRemove = [
    // Main auth keys
    "isLoggedIn",
    "userEmail",
    "userRole",
    "foodExpressCurrentUser",
    "foodExpressEmailVerified",

    // OTP/temp keys
    "pendingVerificationEmail",
    "pendingVerificationName",

    // Profile/avatar keys that often cause wrong name/avatar
    "foodExpressProfile",
    "foodExpressUserProfile",
    "foodExpressCurrentProfile",
    "userProfile",
    "currentUser",
    "profileData",
    "profilePhoto",
    "userAvatar",

    // Owner/rider sessions
    "isOwnerLoggedIn",
    "foodExpressCurrentOwner",
    "ownerRestaurantId",
    "ownerRestaurantName",
    "isRiderLoggedIn",
    "foodExpressCurrentRider",

    // Customer dashboard cached demo/local data
    "lastOrder",
    "foodExpressOrders",
    "checkoutItems",
    "checkoutRestaurantId",
    "checkoutRestaurantName",
    "checkoutTotal",
    "checkoutSubtotal",
    "checkoutTax"
  ];

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

function saveLoggedInUser(user, email, emailVerified) {
  const cleanUser = {
    id: user.id || "",
    name: user.name || "",
    email: user.email || email,
    phone: user.phone || "",
    address: user.address || "",
    role: user.role || "customer",
    status: user.status || "active",
    created_at: user.created_at || "",
    email_verified_at: user.email_verified_at || null,
  };

  localStorage.setItem("isLoggedIn", "true");
  localStorage.setItem("userEmail", cleanUser.email);
  localStorage.setItem("userRole", cleanUser.role);
  localStorage.setItem("foodExpressCurrentUser", JSON.stringify(cleanUser));
  localStorage.setItem("foodExpressEmailVerified", emailVerified ? "true" : "false");

  // Compatibility keys for pages that may still read old profile storage
  localStorage.setItem("currentUser", JSON.stringify(cleanUser));
  localStorage.setItem("userProfile", JSON.stringify(cleanUser));
  localStorage.setItem("foodExpressProfile", JSON.stringify(cleanUser));
  localStorage.setItem("foodExpressUserProfile", JSON.stringify(cleanUser));
}

// ===== ROLE REDIRECT FOR REGISTER DROPDOWN =====
function handleRoleRedirect() {
  const roleSelect = document.getElementById("regRole");

  if (!roleSelect) {
    console.warn("regRole dropdown not found.");
    return false;
  }

  const role = String(roleSelect.value || "").toLowerCase().trim();

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
    showSuccess("Redirecting to rider registration...");

    setTimeout(() => {
      window.location.href = "rider-signup.html";
    }, 350);

    return true;
  }

  return false;
}

// ===== LOGIN FUNCTION =====
async function handleLogin() {
  const email = document.getElementById("loginEmail")?.value.trim();
  const password = document.getElementById("loginPassword")?.value.trim();
  const submitBtn = document.querySelector("#loginForm .submit-btn");

  clearMessages();

  if (!email || !password) {
    showError("Please enter email and password.");
    return;
  }

  const formData = new FormData();
  formData.append("action", "login");
  formData.append("email", email);
  formData.append("password", password);

  try {
    setButtonLoading(submitBtn, true, "Signing in...");

    const response = await fetch(getAuthUrl(), {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    });

    const result = await response.json();
    console.log("Login Response:", result);

    if (!result.success) {
      showError(result.message || "Login failed.");
      return;
    }

    const user = result.data || {};

    // Important fix: remove stale old account data first
    clearOldAuthSession();

    saveLoggedInUser(user, email, result.email_verified);

    if (!result.email_verified) {
      localStorage.setItem("pendingVerificationEmail", user.email || email);

      showSuccess("Login successful. Please verify your email for full access.");

      setTimeout(() => {
        window.location.href = "verify-email-otp.html";
      }, 900);

      return;
    }

    showSuccess("Login successful. Redirecting...");

    setTimeout(() => {
      if (user.role === "restaurant-owner") {
        window.location.href = "ownerdashboard.html";
      } else if (user.role === "delivery-rider") {
        window.location.href = "rider-dashboard.html";
      } else {
        window.location.href = "dashboard.html";
      }
    }, 800);
  } catch (error) {
    console.error("Login Error:", error);
    showError("Something went wrong: " + error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

// ===== REGISTER FUNCTION =====
async function handleRegister() {
  const name = document.getElementById("regName")?.value.trim();
  const email = document.getElementById("regEmail")?.value.trim();
  const password = document.getElementById("regPassword")?.value.trim();
  const phone = document.getElementById("regPhone")?.value.trim();
  const address = document.getElementById("regAddress")?.value.trim();
  const role = document.getElementById("regRole")?.value.trim();
  const submitBtn = document.querySelector("#registerForm .submit-btn");

  clearMessages();

  if (handleRoleRedirect()) return;

  if (!name || !email || !password) {
    showError("Please fill all required fields.");
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

  try {
    setButtonLoading(submitBtn, true, "Creating account...");

    const response = await fetch(getAuthUrl(), {
      method: "POST",
      body: formData,
      credentials: "same-origin",
    });

    const result = await response.json();
    console.log("Register Response:", result);

    if (!result.success) {
      showError(result.message || "Registration failed.");
      return;
    }

    // Clean previous logged user before new signup verification
    clearOldAuthSession();

    localStorage.setItem("pendingVerificationEmail", email);
    localStorage.setItem("pendingVerificationName", name);

    showSuccess(result.message || "Account created. Please verify your email.");

    setTimeout(() => {
      window.location.href = "verify-email-otp.html";
    }, 900);
  } catch (error) {
    console.error("Register Error:", error);
    showError("Registration failed: " + error.message);
  } finally {
    setButtonLoading(submitBtn, false);
  }
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

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  const roleSelect = document.getElementById("regRole");

  if (roleSelect) {
    roleSelect.addEventListener("change", handleRoleRedirect);
  }

  ["loginEmail", "loginPassword", "regName", "regEmail", "regPassword"].forEach(
    (id) => {
      const input = document.getElementById(id);
      if (!input) return;

      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;

        if (id.startsWith("login")) {
          handleLogin();
        } else {
          handleRegister();
        }
      });
    }
  );
});

// ===== MAKE FUNCTIONS GLOBAL =====
window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.togglePassword = togglePassword;
window.handleRoleRedirect = handleRoleRedirect;