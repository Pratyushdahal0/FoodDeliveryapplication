console.log("[admin-login.js] Loaded");

(function () {
  if (window.__FOODEXPRESS_ADMIN_LOGIN_LOADED__) return;
  window.__FOODEXPRESS_ADMIN_LOGIN_LOADED__ = true;

  const AUTH_API = "../../backend/controllers/AuthController.php";

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (isAdminAlreadyLoggedIn()) {
      window.location.href = "admin-dashboard.html";
      return;
    }

    document
      .getElementById("adminLoginForm")
      ?.addEventListener("submit", handleLogin);

    document
      .getElementById("togglePasswordBtn")
      ?.addEventListener("click", togglePassword);
  }

  async function handleLogin(e) {
    e.preventDefault();

    const email    = String(document.getElementById("adminEmail")?.value    || "").trim().toLowerCase();
    const password = String(document.getElementById("adminPassword")?.value || "");
    const btn      = document.getElementById("adminLoginBtn");

    clearMessage();

    if (!email || !password) {
      showMessage("Please enter your email and password.", "error");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage("Please enter a valid email address.", "error");
      return;
    }

    setLoading(btn, true);

    try {
      const res = await fetch(AUTH_API, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "login", email, password }),
      });

      let payload;
      try { payload = await res.json(); } catch (_) { payload = null; }

      if (!payload || payload.success !== true) {
        showMessage(payload?.message || "Invalid email or password.", "error");
        return;
      }

      const user  = payload.data || {};
      const role  = String(user.role || "").toLowerCase();
      const token = payload.token || "";

      if (role !== "admin") {
        showMessage(
          "Access denied. Admin accounts only.",
          "error"
        );
        return;
      }

      saveAdminSession(user, token);

      showMessage("Login successful. Redirecting…", "success");

      setTimeout(() => {
        window.location.href = "admin-dashboard.html";
      }, 700);
    } catch (err) {
      console.error("[admin-login.js] Login error:", err);
      showMessage(
        "Could not reach the server. Please check your connection.",
        "error"
      );
    } finally {
      setLoading(btn, false);
    }
  }

  function saveAdminSession(user, token) {
    const adminData = {
      id:        user.id   || user.user_id || "",
      name:      user.name || "Admin",
      email:     String(user.email || "").trim().toLowerCase(),
      role:      "admin",
      loginAt:   new Date().toISOString(),
    };

    localStorage.setItem("isAdminLoggedIn",         "true");
    localStorage.setItem("foodExpressCurrentAdmin", JSON.stringify(adminData));
    if (token) localStorage.setItem("authToken", token);
  }

  function isAdminAlreadyLoggedIn() {
    return localStorage.getItem("isAdminLoggedIn") === "true";
  }

  function togglePassword() {
    const input = document.getElementById("adminPassword");
    const icon  = document.querySelector("#togglePasswordBtn i");
    if (!input || !icon) return;

    const isHidden = input.type === "password";
    input.type     = isHidden ? "text" : "password";
    icon.className = isHidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.disabled   = true;
      btn.innerHTML  = `<i class="fa-solid fa-spinner fa-spin"></i> Signing in…`;
    } else {
      btn.disabled   = false;
      btn.innerHTML  = `<i class="fa-solid fa-right-to-bracket"></i> Sign In to Admin Panel`;
    }
  }

  function showMessage(msg, type) {
    const box = document.getElementById("loginMessage");
    if (!box) return;
    box.textContent = msg;
    box.className   = `message-box ${type}`;
  }

  function clearMessage() {
    const box = document.getElementById("loginMessage");
    if (!box) return;
    box.textContent = "";
    box.className   = "message-box";
  }
})();
