console.log("[login.js] Loaded - production auth flow");

/* ===============================
   AUTH CONFIG
================================ */

function getAuthUrl() {
  /*
    Relative path works on localhost and hosting.
    login.html is inside frontend/pages, so backend is ../../backend.
  */
  return "../../backend/controllers/AuthController.php";
}

/* ===============================
   SMALL HELPERS
================================ */

function getEl(id) {
  return document.getElementById(id);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function normalizeRole(role) {
  const value = String(role || "customer").toLowerCase().trim();

  if (
    value === "restaurant_owner" ||
    value === "restaurant-owner" ||
    value === "owner" ||
    value.includes("restaurant")
  ) {
    return "restaurant_owner";
  }

  if (
    value === "delivery_rider" ||
    value === "delivery-rider" ||
    value === "rider" ||
    value.includes("rider") ||
    value.includes("delivery")
  ) {
    return "rider";
  }

  return "customer";
}

function clearFieldStates() {
  document.querySelectorAll(".input-wrapper, .select-wrapper").forEach((el) => {
    el.classList.remove("field-error");
  });
}

function markFieldError(wrapperId) {
  const wrapper = getEl(wrapperId);
  if (wrapper) wrapper.classList.add("field-error");
}

function clearMessages() {
  const alertBox = getEl("alertBox");
  const successBox = getEl("successBox");

  if (alertBox) {
    alertBox.innerHTML = "";
    alertBox.classList.remove("show");
    alertBox.style.display = "none";
  }

  if (successBox) {
    successBox.innerHTML = "";
    successBox.classList.remove("show");
    successBox.style.display = "none";
  }

  clearFieldStates();
}

function showError(message) {
  const alertBox = getEl("alertBox");
  const successBox = getEl("successBox");

  if (successBox) {
    successBox.innerHTML = "";
    successBox.classList.remove("show");
    successBox.style.display = "none";
  }

  if (!alertBox) {
    alert(message);
    return;
  }

  alertBox.innerHTML = `
    <i class="fa-solid fa-circle-exclamation"></i>
    <span>${escapeHtml(message)}</span>
  `;
  alertBox.classList.add("show");
  alertBox.style.display = "flex";
}

function showSuccess(message) {
  const alertBox = getEl("alertBox");
  const successBox = getEl("successBox");

  if (alertBox) {
    alertBox.innerHTML = "";
    alertBox.classList.remove("show");
    alertBox.style.display = "none";
  }

  if (!successBox) {
    alert(message);
    return;
  }

  successBox.innerHTML = `
    <i class="fa-solid fa-circle-check"></i>
    <span>${escapeHtml(message)}</span>
  `;
  successBox.classList.add("show");
  successBox.style.display = "flex";
}

function setButtonLoading(button, isLoading, loadingText = "Please wait...") {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin"></i>
      <span>${loadingText}</span>
    `;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalHtml || button.innerHTML;
  }
}

async function parseJsonResponse(response) {
  const raw = await response.text();

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("[login.js] Non-JSON response:", raw);
    throw new Error("Server returned an invalid response. Please check backend.");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ===============================
   TAB SWITCHING
================================ */

function switchTab(tab) {
  const loginForm = getEl("loginForm");
  const registerForm = getEl("registerForm");
  const loginTab = getEl("loginTab");
  const registerTab = getEl("registerTab");

  if (!loginForm || !registerForm || !loginTab || !registerTab) {
    console.error("[login.js] Login/register forms or tabs not found.");
    return;
  }

  clearMessages();

  if (tab === "login") {
    loginForm.style.display = "block";
    registerForm.style.display = "none";

    loginTab.classList.add("active");
    registerTab.classList.remove("active");

    setTimeout(() => getEl("loginEmail")?.focus(), 80);
    return;
  }

  loginForm.style.display = "none";
  registerForm.style.display = "block";

  loginTab.classList.remove("active");
  registerTab.classList.add("active");

  setTimeout(() => getEl("regName")?.focus(), 80);
}

/* ===============================
   SESSION HANDLING
================================ */

function clearOldAuthSession() {
  const keysToRemove = [
    "isLoggedIn",
    "userEmail",
    "userName",
    "userRole",
    "userPhone",
    "userAddress",
    "userCity",
    "userPostalCode",

    "foodExpressCurrentUser",
    "foodExpressEmailVerified",

    "pendingVerificationEmail",
    "pendingVerificationName",

    "foodExpressProfile",
    "foodExpressUserProfile",
    "foodExpressCurrentProfile",
    "userProfile",
    "currentUser",
    "profileData",
    "profilePhoto",
    "userAvatar",
    "userProfileImage",

    "isOwnerLoggedIn",
    "foodExpressCurrentOwner",
    "ownerRestaurantId",
    "ownerRestaurantName",

    "isRiderLoggedIn",
    "foodExpressCurrentRider",

    "latestOrder",
    "lastOrder",
    "foodExpressOrders",
    "checkoutItems",
    "checkoutRestaurantId",
    "checkoutRestaurantName",
    "checkoutTotal",
    "checkoutSubtotal",
    "checkoutTax",
  ];

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

function saveRememberedEmail(email, remember) {
  if (remember) {
    localStorage.setItem("foodExpressRememberedEmail", email);
  } else {
    localStorage.removeItem("foodExpressRememberedEmail");
  }
}

function restoreRememberedEmail() {
  const rememberedEmail = localStorage.getItem("foodExpressRememberedEmail");
  const emailInput = getEl("loginEmail");
  const rememberMe = getEl("rememberMe");

  if (rememberedEmail && emailInput) {
    emailInput.value = rememberedEmail;
  }

  if (rememberedEmail && rememberMe) {
    rememberMe.checked = true;
  }
}

function saveLoggedInUser(user, fallbackEmail, emailVerified) {
  const cleanRole = normalizeRole(user.role);

  const cleanUser = {
    id: user.id || user.user_id || "",
    name: user.name || user.full_name || user.fullName || "",
    email: normalizeEmail(user.email || user.user_email || fallbackEmail),
    phone: user.phone || user.phone_number || "",
    address: user.address || "",
    role: cleanRole,
    status: user.status || "active",
    created_at: user.created_at || "",
    email_verified_at: user.email_verified_at || null,
  };

  localStorage.setItem("isLoggedIn", "true");
  localStorage.setItem("userEmail", cleanUser.email);
  localStorage.setItem("userName", cleanUser.name);
  localStorage.setItem("userRole", cleanUser.role);
  localStorage.setItem("userPhone", cleanUser.phone);
  localStorage.setItem("userAddress", cleanUser.address);
  localStorage.setItem("foodExpressCurrentUser", JSON.stringify(cleanUser));
  localStorage.setItem(
    "foodExpressEmailVerified",
    emailVerified ? "true" : "false",
  );

  localStorage.setItem("currentUser", JSON.stringify(cleanUser));
  localStorage.setItem("userProfile", JSON.stringify(cleanUser));
  localStorage.setItem("foodExpressProfile", JSON.stringify(cleanUser));
  localStorage.setItem("foodExpressUserProfile", JSON.stringify(cleanUser));

  if (cleanRole === "restaurant_owner") {
  localStorage.setItem("isOwnerLoggedIn", "true");
  localStorage.setItem("foodExpressCurrentOwner", JSON.stringify(cleanUser));

  if (cleanUser.id) {
    localStorage.setItem("ownerUserId", cleanUser.id);
  }

  localStorage.removeItem("isRiderLoggedIn");
  localStorage.removeItem("foodExpressCurrentRider");
}

if (cleanRole === "rider") {
  localStorage.setItem("isRiderLoggedIn", "true");
  localStorage.setItem("foodExpressCurrentRider", JSON.stringify(cleanUser));

  if (cleanUser.id) {
    localStorage.setItem("riderUserId", cleanUser.id);
  }

  localStorage.removeItem("isOwnerLoggedIn");
  localStorage.removeItem("foodExpressCurrentOwner");
}

if (cleanRole === "customer") {
  localStorage.removeItem("isOwnerLoggedIn");
  localStorage.removeItem("foodExpressCurrentOwner");
  localStorage.removeItem("isRiderLoggedIn");
  localStorage.removeItem("foodExpressCurrentRider");
}

  window.dispatchEvent(new Event("foodExpressProfileUpdated"));

  return cleanUser;
}

function redirectAfterLogin(role) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "restaurant_owner") {
    window.location.href = "ownerdashboard.html";
    return;
  }

  if (normalizedRole === "rider") {
    window.location.href = "rider-dashboard.html";
    return;
  }

  window.location.href = "dashboard.html";
}

/* ===============================
   REGISTER ROLE REDIRECT
================================ */

function handleRoleRedirect() {
  const roleSelect = getEl("regRole");
  if (!roleSelect) return false;

  const role = normalizeRole(roleSelect.value);

  if (role === "restaurant_owner") {
    showSuccess("Redirecting to restaurant registration...");

    setTimeout(() => {
      window.location.href = "restaurant-signup.html";
    }, 350);

    return true;
  }

  if (role === "rider") {
    showSuccess("Redirecting to rider registration...");

    setTimeout(() => {
      window.location.href = "rider-signup.html";
    }, 350);

    return true;
  }

  return false;
}

/* ===============================
   LOGIN
================================ */

async function handleLogin(event) {
  if (event) event.preventDefault();

  const emailInput = getEl("loginEmail");
  const passwordInput = getEl("loginPassword");
  const rememberMe = getEl("rememberMe");
  const submitBtn = getEl("loginSubmitBtn");

  const email = normalizeEmail(emailInput?.value);
  const password = String(passwordInput?.value || "").trim();

  clearMessages();

  if (!email) {
    showError("Please enter your email address.");
    markFieldError("loginEmailWrapper");
    emailInput?.focus();
    return;
  }

  if (!isValidEmail(email)) {
    showError("Please enter a valid email address.");
    markFieldError("loginEmailWrapper");
    emailInput?.focus();
    return;
  }

  if (!password) {
    showError("Please enter your password.");
    markFieldError("loginPasswordWrapper");
    passwordInput?.focus();
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

    const result = await parseJsonResponse(response);
    console.log("[login.js] Login response:", result);

    if (!result.success) {
      /*
        Production-safe message:
        Do not reveal whether email or password was wrong.
      */
      showError("Invalid email or password. Please check your details and try again.");
      markFieldError("loginEmailWrapper");
      markFieldError("loginPasswordWrapper");
      return;
    }

    const user = result.data || result.user || {};
    const isEmailVerified =
      result.email_verified === true ||
      result.email_verified === "true" ||
      user.email_verified_at ||
      user.is_email_verified === true;

    clearOldAuthSession();

    const savedUser = saveLoggedInUser(user, email, isEmailVerified);

    saveRememberedEmail(email, Boolean(rememberMe?.checked));

    if (!isEmailVerified) {
      localStorage.setItem("pendingVerificationEmail", savedUser.email || email);
      localStorage.setItem("pendingVerificationName", savedUser.name || "");

      showSuccess("Login successful. Please verify your email to continue.");

      setTimeout(() => {
        window.location.href = "verify-email-otp.html";
      }, 900);

      return;
    }

    showSuccess("Login successful. Redirecting...");

    setTimeout(() => {
      redirectAfterLogin(savedUser.role);
    }, 700);
  } catch (error) {
    console.error("[login.js] Login error:", error);
    showError(
      "We could not sign you in right now. Please check your connection and try again.",
    );
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/* ===============================
   REGISTER
================================ */

async function handleRegister(event) {
  if (event) event.preventDefault();

  const nameInput = getEl("regName");
  const emailInput = getEl("regEmail");
  const passwordInput = getEl("regPassword");
  const phoneInput = getEl("regPhone");
  const addressInput = getEl("regAddress");
  const roleInput = getEl("regRole");
  const submitBtn = getEl("registerSubmitBtn");

  const name = String(nameInput?.value || "").trim();
  const email = normalizeEmail(emailInput?.value);
  const password = String(passwordInput?.value || "").trim();
  const phone = String(phoneInput?.value || "").trim();
  const address = String(addressInput?.value || "").trim();
  const role = normalizeRole(roleInput?.value);

  clearMessages();

  if (handleRoleRedirect()) return;

  if (!name) {
    showError("Please enter your full name.");
    markFieldError("regNameWrapper");
    nameInput?.focus();
    return;
  }

  if (!email) {
    showError("Please enter your email address.");
    markFieldError("regEmailWrapper");
    emailInput?.focus();
    return;
  }

  if (!isValidEmail(email)) {
    showError("Please enter a valid email address.");
    markFieldError("regEmailWrapper");
    emailInput?.focus();
    return;
  }

  if (!password) {
    showError("Please enter a password.");
    markFieldError("regPasswordWrapper");
    passwordInput?.focus();
    return;
  }

  if (password.length < 6) {
    showError("Password must be at least 6 characters.");
    markFieldError("regPasswordWrapper");
    passwordInput?.focus();
    return;
  }

  if (phone && !/^\d{10}$/.test(phone)) {
    showError("Phone number must be 10 digits.");
    markFieldError("regPhoneWrapper");
    phoneInput?.focus();
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

    const result = await parseJsonResponse(response);
    console.log("[login.js] Register response:", result);

    if (!result.success) {
      showError(result.message || "Registration failed. Please try again.");
      return;
    }

    clearOldAuthSession();

    localStorage.setItem("pendingVerificationEmail", email);
    localStorage.setItem("pendingVerificationName", name);

    showSuccess(
      result.message || "Account created. Please verify your email.",
    );

    setTimeout(() => {
      window.location.href = "verify-email-otp.html";
    }, 900);
  } catch (error) {
    console.error("[login.js] Register error:", error);
    showError(
      "We could not create your account right now. Please try again later.",
    );
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

/* ===============================
   PASSWORD TOGGLE
================================ */

function togglePassword(idOrButton, maybeButton) {
  let inputId = idOrButton;
  let button = maybeButton;

  if (idOrButton instanceof HTMLElement) {
    button = idOrButton;
    inputId = button.dataset.target;
  }

  const input = getEl(inputId);
  if (!input || !button) return;

  const icon = button.querySelector("i");

  if (input.type === "password") {
    input.type = "text";
    button.setAttribute("aria-label", "Hide password");
    if (icon) {
      icon.className = "fa-regular fa-eye-slash";
    }
    return;
  }

  input.type = "password";
  button.setAttribute("aria-label", "Show password");
  if (icon) {
    icon.className = "fa-regular fa-eye";
  }
}

/* ===============================
   INIT
================================ */

document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("isLoggedIn") === "true") {
    redirectAfterLogin(localStorage.getItem("userRole") || "customer");
    return;
  }

  restoreRememberedEmail();

  const loginTab = getEl("loginTab");
  const registerTab = getEl("registerTab");
  const goToRegister = getEl("goToRegister");
  const goToLogin = getEl("goToLogin");

  const loginForm = getEl("loginForm");
  const registerForm = getEl("registerForm");

  loginTab?.addEventListener("click", () => switchTab("login"));
  registerTab?.addEventListener("click", () => switchTab("register"));

  goToRegister?.addEventListener("click", (event) => {
    event.preventDefault();
    switchTab("register");
  });

  goToLogin?.addEventListener("click", (event) => {
    event.preventDefault();
    switchTab("login");
  });

  loginForm?.addEventListener("submit", handleLogin);
  registerForm?.addEventListener("submit", handleRegister);

  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", () => togglePassword(button));
  });

  getEl("regRole")?.addEventListener("change", handleRoleRedirect);

  ["loginEmail", "loginPassword", "regName", "regEmail", "regPassword"].forEach(
    (id) => {
      const input = getEl(id);
      if (!input) return;

      input.addEventListener("input", () => {
        clearFieldStates();

        const alertBox = getEl("alertBox");
        if (alertBox && alertBox.innerHTML.trim()) {
          alertBox.innerHTML = "";
          alertBox.classList.remove("show");
          alertBox.style.display = "none";
        }
      });
    },
  );
});

/* ===============================
   GLOBAL EXPORTS
================================ */

window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.togglePassword = togglePassword;
window.handleRoleRedirect = handleRoleRedirect;