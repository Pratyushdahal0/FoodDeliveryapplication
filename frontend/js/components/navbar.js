console.log("[navbar.js] Script loaded successfully");

(function () {
  function getLoggedInNavbar(activePage = "") {
    const page = String(activePage || "").toLowerCase();

    return `
      <nav class="navbar" id="navbar">
        <div class="container">
          <div class="navbar-brand">
            <a href="dashboard.html">FoodExpress</a>
          </div>

          <div class="navbar-nav">
            <a href="dashboard.html" class="nav-link ${
              page === "dashboard" ? "active" : ""
            }">Home</a>

            <a href="shop.html" class="nav-link ${
              ["shop", "cart", "payment", "track"].includes(page)
                ? "active"
                : ""
            }">Shop</a>

            <a href="food.html" class="nav-link ${
              page === "food" ? "active" : ""
            }">Food</a>

            <a href="loggedContact.html" class="nav-link ${
              page === "contact" ? "active" : ""
            }">Contact</a>
          </div>

          <div class="navbar-right">
            <div class="search-box">
              <input type="text" placeholder="Search food..." />
            </div>

            <a href="cart.html" class="cart-btn" id="cartButton" aria-label="Open cart">
              <span aria-hidden="true">🛒</span>
              <span class="cart-count" id="cartCount">0</span>
            </a>

            <div class="notification-wrapper">
              <button class="notification-bell" type="button" id="notificationBell" aria-label="Open notifications">
                <i class="fa-regular fa-bell"></i>
                <span class="notification-badge" id="notificationBadge">0</span>
              </button>

              <div class="notification-dropdown" id="notificationDropdown"></div>
            </div>

            <button
              class="navbar-avatar"
              id="navbarAvatar"
              type="button"
              title="Your profile"
              aria-label="Your profile"
            ></button>

            <button class="login-btn" type="button" id="logoutBtn">
              Log out
            </button>
          </div>
        </div>
      </nav>
    `;
  }

  function renderNavbar(activePage = "") {
    const container = document.getElementById("navbarContainer");

    if (!container) {
      console.error("[navbar.js] navbarContainer not found");
      return;
    }

    container.innerHTML = getLoggedInNavbar(activePage);

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        if (typeof window.logout === "function") {
          window.logout();
        } else {
          localStorage.removeItem("isLoggedIn");
          window.location.href = "landingpage.html";
        }
      });
    }

    const navbarAvatar = document.getElementById("navbarAvatar");
    if (navbarAvatar) {
      navbarAvatar.addEventListener("click", function () {
        window.location.href = "edit-profile.html";
      });
    }

    if (typeof window.updateCartCount === "function") {
      window.updateCartCount();
    }

    if (typeof window.bindNotificationBell === "function") {
      window.bindNotificationBell();
    }

    if (typeof window.bindProfileEverywhere === "function") {
      window.bindProfileEverywhere();

      setTimeout(window.bindProfileEverywhere, 100);
      setTimeout(window.bindProfileEverywhere, 400);
    } else {
      bindNavbarAvatarFallback();
    }
  }

  function bindNavbarAvatarFallback() {
    const avatar = document.getElementById("navbarAvatar");
    if (!avatar) return;

    const profile = safeJsonParse(localStorage.getItem("userProfile"), null);

    const name =
      profile?.name ||
      localStorage.getItem("userName") ||
      localStorage.getItem("pendingVerificationName") ||
      "User";

    const image =
      profile?.profileImage ||
      profile?.image ||
      localStorage.getItem("userProfileImage") ||
      "";

    avatar.innerHTML = "";

    if (image) {
      const img = document.createElement("img");
      img.src = image;
      img.alt = name;
      img.className = "profile-avatar-img";

      img.onerror = function () {
        avatar.innerHTML = getInitials(name);
        avatar.classList.remove("has-image");
      };

      avatar.appendChild(img);
      avatar.classList.add("has-image");
      return;
    }

    avatar.textContent = getInitials(name);
    avatar.classList.remove("has-image");
  }

  function getInitials(name) {
    const text = String(name || "").trim();
    if (!text) return "U";

    return text
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  function safeJsonParse(value, fallback = null) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  window.renderNavbar = renderNavbar;
})();