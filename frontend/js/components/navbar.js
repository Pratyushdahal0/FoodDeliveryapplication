console.log("[navbar.js] Script loaded successfully");

(function () {
  const BRAND_LOGO = "../assets/images/brand/foodexpress-logo-navbar.png";

  function detectActivePage() {
    const file = window.location.pathname.split("/").pop().toLowerCase();

    if (file.includes("dashboard")) return "dashboard";
    if (file.includes("shop") || file.includes("cart") || file.includes("payment")) return "shop";
    if (file.includes("track-order")) return "track";
    if (file.includes("food")) return "food";
    if (file.includes("contact")) return "contact";
    if (file.includes("login")) return "login";
    if (file.includes("register")) return "register";
    if (file.includes("landing")) return "landing";

    return "";
  }

  function isLoggedIn() {
    return (
      localStorage.getItem("isLoggedIn") === "true" ||
      localStorage.getItem("foodExpressLoggedIn") === "true" ||
      !!localStorage.getItem("foodExpressAuthUser") ||
      !!localStorage.getItem("loggedInUser")
    );
  }

  function getBrandLink(href = "landingpage.html") {
    return `
      <a href="${href}" class="brand-link brand-logo-link" aria-label="FoodExpress Home">
        <img
          src="${BRAND_LOGO}"
          alt="FoodExpress"
          class="brand-logo-img"
        />
      </a>
    `;
  }

  function getPublicNavbar(activePage = "") {
    const page = String(activePage || "").toLowerCase();

    return `
      <nav class="navbar" id="navbar">
        <div class="container">
          <div class="navbar-brand">
            ${getBrandLink("landingpage.html")}
          </div>

          <div class="navbar-nav">
            <a href="landingpage.html" class="nav-link ${
              page === "landing" ? "active" : ""
            }">Home</a>

            <a href="shop.html" class="nav-link ${
              page === "shop" ? "active" : ""
            }">Shop</a>

            <a href="food.html" class="nav-link ${
              page === "food" ? "active" : ""
            }">Food</a>

            <a href="contact.html" class="nav-link ${
              page === "contact" ? "active" : ""
            }">Contact</a>
          </div>

          <div class="navbar-right">
            <a href="login.html" class="login-btn ${
              page === "login" ? "active" : ""
            }">Log in</a>
          </div>
        </div>
      </nav>
    `;
  }

  function getLoggedInNavbar(activePage = "") {
    const page = String(activePage || "").toLowerCase();

    return `
      <nav class="navbar" id="navbar">
        <div class="container">
          <div class="navbar-brand">
            ${getBrandLink("dashboard.html")}
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

  function shouldUsePublicNavbar(page) {
    return ["login", "register", "landing"].includes(page);
  }

  function renderNavbar(activePage = "") {
    const page = activePage || detectActivePage();

    const container =
      document.getElementById("navbarContainer") ||
      document.getElementById("navbar");

    if (!container) {
      console.error("[navbar.js] navbarContainer/navbar not found");
      return;
    }

    const html =
      shouldUsePublicNavbar(page) || !isLoggedIn()
        ? getPublicNavbar(page)
        : getLoggedInNavbar(page);

    if (container.id === "navbar") {
      container.outerHTML = html;
    } else {
      container.innerHTML = html;
    }

    bindNavbarActions();
  }

  function bindNavbarActions() {
    const logoutBtn = document.getElementById("logoutBtn");

    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        if (typeof window.logout === "function") {
          window.logout();
        } else {
          localStorage.removeItem("isLoggedIn");
          localStorage.removeItem("foodExpressLoggedIn");
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

  document.addEventListener("DOMContentLoaded", function () {
    const hasNavbar =
      document.getElementById("navbarContainer") || document.getElementById("navbar");

    if (hasNavbar) {
      renderNavbar();
    }
  });
})();