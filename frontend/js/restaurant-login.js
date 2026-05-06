/* =============================================================
   restaurant-login.js  —  DB-based restaurant owner login
   =============================================================
   Priority #5 fix.

   What this replaces:
     The old version was 100% localStorage-only. It checked the
     password against entries in a `foodExpressRestaurants`
     localStorage key that nothing in production ever wrote to,
     so legitimate owners often saw "no restaurant account found".

   What this does now:
     1. POST email/password to AuthController.php?action=login.
        (Same endpoint customers use — backend verifies bcrypt,
         returns role, email_verified_at, etc.)
     2. Verify the returned user has role = 'restaurant-owner'
        (NOT customer / rider / admin).
     3. Verify email is verified.
     4. Look up the restaurant owned by this user via
        PublicRestaurantController.php?action=by_owner.
     5. Branch on restaurant.status:
          approved → full session, redirect to ownerdashboard.html
          pending  → log in, redirect with "under review" banner
          rejected → block login, ask to contact support
          missing  → block login, send to restaurant-signup.html
     6. Write canonical session keys so ownerdashboard.js works
        without any changes:
          foodExpressCurrentUser     (canonical, from Priority #3)
          foodExpressCurrentOwner    (legacy)
          ownerRestaurantId          (flat, used by dashboard)
          ownerRestaurantName        (flat, used by dashboard)
          isOwnerLoggedIn            (flag)
          isLoggedIn                 (so other shared.js helpers work)
          userEmail / userName / userRole (mirrors)
============================================================= */

(function () {
  if (window.__FOODEXPRESS_RESTAURANT_LOGIN_LOADED__) {
    console.warn("[restaurant-login.js] Already loaded.");
    return;
  }
  window.__FOODEXPRESS_RESTAURANT_LOGIN_LOADED__ = true;

  console.log("[restaurant-login.js] Loaded — DB-based owner login v1");

  const AUTH_API = "../../backend/controllers/AuthController.php";
  const RESTAURANT_API = "../../backend/controllers/PublicRestaurantController.php";

  const CURRENT_OWNER_KEY = "foodExpressCurrentOwner";
  const CURRENT_USER_KEY = "foodExpressCurrentUser";
  const OWNER_REMEMBER_KEY = "foodExpressOwnerRemember";

  document.addEventListener("DOMContentLoaded", initializeRestaurantLogin);

  function initializeRestaurantLogin() {
    const form = document.getElementById("restaurantLoginForm");
    const togglePasswordBtn = document.getElementById("togglePasswordBtn");

    prefillRememberedOwner();

    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener("click", toggleOwnerPassword);
    }

    if (form) {
      form.addEventListener("submit", handleOwnerLogin);
    }

    if (isOwnerAlreadyLoggedIn()) {
      window.location.href = "ownerdashboard.html";
    }
  }

  /* =========================================================
     Login flow
  ========================================================= */

  async function handleOwnerLogin(event) {
    event.preventDefault();

    const emailInput = document.getElementById("ownerEmail");
    const passwordInput = document.getElementById("ownerPassword");
    const rememberInput = document.getElementById("rememberOwner");
    const loginBtn = document.getElementById("ownerLoginBtn");

    const email = (emailInput?.value || "").trim().toLowerCase();
    const password = passwordInput?.value || "";
    const rememberMe = rememberInput?.checked || false;

    clearMessage();

    if (!email || !password) {
      showMessage("Please enter both email and password.", "error");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage("Please enter a valid email address.", "error");
      return;
    }

    setLoading(loginBtn, true);

    try {
      // ---- Step 1: backend login ----
      const loginPayload = await postJson(AUTH_API, {
        action: "login",
        email,
        password,
      });

      if (!loginPayload || loginPayload.success !== true) {
        const msg = (loginPayload && loginPayload.message) ||
          "Invalid email or password.";
        showMessage(msg, "error");
        return;
      }

      const userData = loginPayload.data || {};
      const role = String(userData.role || "").toLowerCase();

      // ---- Step 2: role check ----
      // The role enum uses HYPHEN: 'restaurant-owner'. Reject anyone
      // else trying to use this login form.
      if (role !== "restaurant-owner") {
        showMessage(
          "This sign-in is for restaurant owners only. " +
            "Customers should use the customer login page.",
          "error"
        );
        return;
      }

      // ---- Step 3: email verified check ----
      if (!loginPayload.email_verified && !userData.email_verified_at) {
        showMessage(
          "Please verify your owner email before signing in. " +
            "Check your inbox for the verification link.",
          "error"
        );
        return;
      }

      // ---- Step 4: fetch restaurant for this owner ----
      const restaurantPayload = await fetchJson(
        `${RESTAURANT_API}?action=by_owner&user_id=${encodeURIComponent(
          userData.id
        )}`
      );

      if (!restaurantPayload || restaurantPayload.success !== true) {
        if (restaurantPayload && restaurantPayload.code === "no_restaurant") {
          showMessage(
            "Your owner account exists, but no restaurant is registered yet. " +
              "Please complete restaurant registration to continue.",
            "error"
          );
          setTimeout(() => {
            window.location.href = "restaurant-signup.html";
          }, 1800);
          return;
        }

        showMessage(
          (restaurantPayload && restaurantPayload.message) ||
            "Could not load your restaurant. Please try again.",
          "error"
        );
        return;
      }

      const restaurant = restaurantPayload.data || {};
      const status = String(restaurant.status || "pending").toLowerCase();

      // ---- Step 5: restaurant status branching ----
      if (status === "rejected") {
        showMessage(
          "Your restaurant application was not approved. " +
            "Please contact FoodExpress support for next steps.",
          "error"
        );
        return;
      }

      // 'approved' and 'pending' both proceed. 'pending' will see a banner.

      // ---- Step 6: persist canonical + owner-specific session ----
      saveOwnerSession({
        user: userData,
        restaurant,
        rememberEmail: rememberMe ? email : null,
      });

      // ---- Step 7: friendly redirect with feedback ----
      if (status === "pending") {
        showMessage(
          "Logged in. Your restaurant is under review — full access " +
            "will unlock once approved.",
          "success"
        );

        // Stash a transient flag so the dashboard can show a banner.
        try {
          localStorage.setItem("foodExpressOwnerStatusBanner", "pending");
        } catch (_) {}
      } else {
        showMessage("Login successful. Redirecting to your dashboard...", "success");
        try {
          localStorage.removeItem("foodExpressOwnerStatusBanner");
        } catch (_) {}
      }

      setTimeout(() => {
        window.location.href = "ownerdashboard.html";
      }, 800);
    } catch (error) {
      console.error("[restaurant-login.js] Login error:", error);
      showMessage(
        "Something went wrong. Please check your connection and try again.",
        "error"
      );
    } finally {
      setLoading(loginBtn, false);
    }
  }

  /* =========================================================
     Session helpers
  ========================================================= */

  function saveOwnerSession({ user, restaurant, rememberEmail }) {
    const ownerEmail = String(user.email || "").trim().toLowerCase();
    const ownerName = user.name || user.full_name || "Owner";
    const ownerId = user.id || user.user_id || "";
    const restaurantId = String(restaurant.id || "");
    const restaurantName = restaurant.restaurant_name || "Restaurant";

    const ownerSession = {
      ownerId: ownerId,
      userId: ownerId,
      restaurantId: restaurantId,
      restaurantName: restaurantName,
      restaurantStatus: restaurant.status || "pending",
      restaurantPhone: restaurant.phone || "",
      restaurantLocation: restaurant.location || "",
      restaurantCity: restaurant.city || "",
      cuisineType: restaurant.cuisine_type || "",
      isOpen: Number(restaurant.is_open) === 1,
      acceptingOrders: Number(restaurant.accepting_orders) === 1,
      busyMode: Number(restaurant.busy_mode) === 1,
      ownerName: ownerName,
      email: ownerEmail,
      phone: user.phone || restaurant.phone || "",
      role: "restaurant-owner",
      loginAt: new Date().toISOString(),
    };

    const canonicalUser = {
      id: ownerId,
      name: ownerName,
      email: ownerEmail,
      phone: user.phone || "",
      address: user.address || "",
      role: "restaurant-owner",
      status: user.status || "active",
      restaurantId: restaurantId,
      restaurantName: restaurantName,
      email_verified_at: user.email_verified_at || null,
    };

    // Owner-specific keys (consumed by ownerdashboard.js etc.)
    localStorage.setItem(CURRENT_OWNER_KEY, JSON.stringify(ownerSession));
    localStorage.setItem("ownerRestaurantId", restaurantId);
    localStorage.setItem("ownerRestaurantName", restaurantName);
    localStorage.setItem("ownerUserId", String(ownerId));
    localStorage.setItem("isOwnerLoggedIn", "true");

    // Canonical user (Priority #3 — single source of truth across pages)
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(canonicalUser));

    // Mirror flat keys so legacy code still finds the user
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("userEmail", ownerEmail);
    localStorage.setItem("userName", ownerName);
    localStorage.setItem("userRole", "restaurant-owner");
    localStorage.setItem("userPhone", user.phone || "");

    // Remember-me
    if (rememberEmail) {
      localStorage.setItem(
        OWNER_REMEMBER_KEY,
        JSON.stringify({ email: rememberEmail, remember: true })
      );
    } else {
      localStorage.removeItem(OWNER_REMEMBER_KEY);
    }
  }

  function isOwnerAlreadyLoggedIn() {
    try {
      const owner = JSON.parse(
        localStorage.getItem(CURRENT_OWNER_KEY) || "null"
      );
      return !!(owner && owner.restaurantId && owner.email);
    } catch (_) {
      return false;
    }
  }

  function prefillRememberedOwner() {
    try {
      const remembered = JSON.parse(
        localStorage.getItem(OWNER_REMEMBER_KEY) || "null"
      );
      if (!remembered) return;

      const emailInput = document.getElementById("ownerEmail");
      const rememberInput = document.getElementById("rememberOwner");

      if (emailInput && remembered.email) emailInput.value = remembered.email;
      if (rememberInput) rememberInput.checked = !!remembered.remember;
    } catch (_) {
      // ignore
    }
  }

  /* =========================================================
     UI helpers
  ========================================================= */

  function toggleOwnerPassword() {
    const passwordInput = document.getElementById("ownerPassword");
    const toggleBtn = document.getElementById("togglePasswordBtn");
    if (!passwordInput) return;

    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    if (toggleBtn) toggleBtn.textContent = isPassword ? "🙈" : "👁️";
  }

  function setLoading(btn, isLoading) {
    if (!btn) return;
    if (isLoading) {
      btn.disabled = true;
      btn.dataset.originalLabel = btn.dataset.originalLabel || btn.textContent;
      btn.textContent = "Signing in...";
    } else {
      btn.disabled = false;
      if (btn.dataset.originalLabel) {
        btn.textContent = btn.dataset.originalLabel;
      }
    }
  }

  function showMessage(message, type) {
    const messageBox = document.getElementById("loginMessage");
    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `message-box ${type || ""}`.trim();
    messageBox.style.display = "block";
  }

  function clearMessage() {
    const messageBox = document.getElementById("loginMessage");
    if (!messageBox) return;
    messageBox.textContent = "";
    messageBox.className = "message-box";
  }

  /* =========================================================
     Network helpers (tolerant of non-JSON hosting responses)
  ========================================================= */

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    return safeParseJson(await response.text(), url);
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    return safeParseJson(await response.text(), url);
  }

  function safeParseJson(text, url) {
    try {
      return JSON.parse(text);
    } catch (error) {
      console.error(
        "[restaurant-login.js] Non-JSON response from",
        url,
        ":",
        (text || "").slice(0, 200)
      );
      return null;
    }
  }
})();