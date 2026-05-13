console.log("[rider-login.js] Loaded - DB-based rider login v1");

(function () {
  if (window.__FOODEXPRESS_RIDER_LOGIN_LOADED__) {
    console.warn("[rider-login.js] Already loaded.");
    return;
  }

  window.__FOODEXPRESS_RIDER_LOGIN_LOADED__ = true;

  const AUTH_API = "../../backend/controllers/AuthController.php";

  const CURRENT_RIDER_KEY = "foodExpressCurrentRider";
  const CURRENT_USER_KEY = "foodExpressCurrentUser";
  const RIDER_PROFILE_KEY = "foodExpressRiderProfile";
  const RIDER_REMEMBER_KEY = "foodExpressRiderRemember";

  document.addEventListener("DOMContentLoaded", initRiderLogin);

  function initRiderLogin() {
    const form = document.getElementById("riderLoginForm");
    const toggle = document.getElementById("togglePassword");

    prefillRememberedRider();

    form?.addEventListener("submit", handleRiderLogin);

    toggle?.addEventListener("click", () => {
      const input = document.getElementById("riderPassword");
      const icon = toggle.querySelector("i");

      if (!input || !icon) return;

      input.type = input.type === "password" ? "text" : "password";
      icon.className =
        input.type === "password" ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
    });

    if (isRiderAlreadyLoggedIn()) {
      window.location.href = "rider-deliveries.html";
    }
  }

  async function handleRiderLogin(event) {
    event.preventDefault();

    const emailInput = document.getElementById("riderEmail");
    const passwordInput = document.getElementById("riderPassword");
    const rememberInput = document.getElementById("rememberRider");
    const loginBtn = document.getElementById("riderLoginBtn");

    const email = String(emailInput?.value || "").trim().toLowerCase();
    const password = String(passwordInput?.value || "");
    const remember = Boolean(rememberInput?.checked);

    clearMessage();

    if (!email || !password) {
      showMessage("Please enter your rider email and password.", "error");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage("Please enter a valid email address.", "error");
      return;
    }

    setLoading(loginBtn, true);

    try {
      const payload = await postJson(AUTH_API, {
        action: "login",
        email,
        password,
      });

      if (!payload || payload.success !== true) {
        showMessage(payload?.message || "Invalid rider login details.", "error");
        return;
      }

      const user = payload.data || {};
      const role = String(user.role || "").toLowerCase();

      if (role !== "delivery-rider") {
        showMessage(
          "This login is for delivery riders only. Please use the correct login page.",
          "error"
        );
        return;
      }

      const status = String(user.status || "active").toLowerCase();

      if (status === "blocked" || status === "rejected") {
        showMessage(
          "Your rider account is not active. Please contact FoodExpress support.",
          "error"
        );
        return;
      }

      saveRiderSession(user, remember ? email : null, payload.token || "");

      showMessage("Login successful. Redirecting to rider panel...", "success");

      setTimeout(() => {
        window.location.href = "rider-deliveries.html";
      }, 700);
    } catch (error) {
      console.error("[rider-login.js] Login error:", error);
      showMessage(
        "Something went wrong. Please check your connection and try again.",
        "error"
      );
    } finally {
      setLoading(loginBtn, false);
    }
  }

  async function postJson(url, data) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const raw = await response.text();

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error("[rider-login.js] Non-JSON backend response:", raw);
      throw new Error("Server did not return valid JSON.");
    }
  }

  function saveRiderSession(user, rememberEmail, token) {
    const riderId = user.id || user.user_id || "";
    const riderName = user.name || user.full_name || "FoodExpress Rider";
    const riderEmail = String(user.email || "").trim().toLowerCase();
    const riderPhone = user.phone || user.phone_number || "";

    const riderSession = {
      id: Number(riderId),
      user_id: Number(riderId),
      riderId: Number(riderId),
      rider_id: Number(riderId),
      name: riderName,
      fullName: riderName,
      riderName: riderName,
      rider_name: riderName,
      email: riderEmail,
      riderEmail: riderEmail,
      rider_email: riderEmail,
      phone: riderPhone,
      riderPhone: riderPhone,
      rider_phone: riderPhone,
      role: "delivery-rider",
      status: "online",
      accountStatus: user.status || "active",
      loginAt: new Date().toISOString(),
    };

    const canonicalUser = {
      id: Number(riderId),
      user_id: Number(riderId),
      name: riderName,
      email: riderEmail,
      phone: riderPhone,
      role: "delivery-rider",
      status: user.status || "active",
      email_verified_at: user.email_verified_at || null,
    };

    localStorage.setItem(CURRENT_RIDER_KEY, JSON.stringify(riderSession));
    localStorage.setItem(RIDER_PROFILE_KEY, JSON.stringify(riderSession));
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(canonicalUser));

    localStorage.setItem("foodExpressRiderLoggedIn", "true");
    localStorage.setItem("isRiderLoggedIn", "true");
    localStorage.setItem("foodExpressRiderStatus", "online");
    if (token) localStorage.setItem("authToken", token);
    localStorage.setItem("foodExpressRiderEmail", riderEmail);
    localStorage.setItem("foodExpressRiderName", riderName);
    localStorage.setItem("foodExpressRiderPhone", riderPhone);
    localStorage.setItem("foodExpressRiderId", String(riderId));

    localStorage.setItem("riderEmail", riderEmail);
    localStorage.setItem("riderName", riderName);
    localStorage.setItem("riderPhone", riderPhone);
    localStorage.setItem("riderUserId", String(riderId));

    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("userEmail", riderEmail);
    localStorage.setItem("userName", riderName);
    localStorage.setItem("userPhone", riderPhone);
    localStorage.setItem("userRole", "delivery-rider");

    if (rememberEmail) {
      localStorage.setItem(
        RIDER_REMEMBER_KEY,
        JSON.stringify({ email: rememberEmail, remember: true })
      );
    } else {
      localStorage.removeItem(RIDER_REMEMBER_KEY);
    }
  }

  function isRiderAlreadyLoggedIn() {
    try {
      const rider = JSON.parse(localStorage.getItem(CURRENT_RIDER_KEY) || "null");
      return Boolean(
        rider &&
          rider.email &&
          String(rider.role || "").toLowerCase() === "delivery-rider"
      );
    } catch {
      return false;
    }
  }

  function prefillRememberedRider() {
    try {
      const remembered = JSON.parse(
        localStorage.getItem(RIDER_REMEMBER_KEY) || "null"
      );

      if (!remembered) return;

      const emailInput = document.getElementById("riderEmail");
      const rememberInput = document.getElementById("rememberRider");

      if (emailInput && remembered.email) {
        emailInput.value = remembered.email;
      }

      if (rememberInput) {
        rememberInput.checked = Boolean(remembered.remember);
      }
    } catch {
      // ignore
    }
  }

  function setLoading(button, loading) {
    if (!button) return;

    if (loading) {
      button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `Signing in... <i class="fa-solid fa-spinner fa-spin"></i>`;
    } else {
      button.disabled = false;
      button.innerHTML =
        button.dataset.originalText ||
        `Sign In to Rider Panel <i class="fa-solid fa-arrow-right"></i>`;
    }
  }

  function clearMessage() {
    const box = document.getElementById("loginMessage");
    if (!box) return;

    box.className = "message-box";
    box.textContent = "";
  }

  function showMessage(message, type) {
    const box = document.getElementById("loginMessage");
    if (!box) return;

    box.className = `message-box ${type}`;
    box.textContent = message;
  }
})();