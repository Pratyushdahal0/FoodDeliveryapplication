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
            <a href="dashboard.html" class="nav-link ${page === "dashboard" ? "active" : ""}">Home</a>
            <a href="shop.html" class="nav-link ${["shop", "cart", "payment", "track"].includes(page) ? "active" : ""}">Shop</a>
            <a href="food.html" class="nav-link ${page === "food" ? "active" : ""}">Food</a>
            <a href="loggedContact.html" class="nav-link ${page === "contact" ? "active" : ""}">Contact</a>
          </div>

          <div class="navbar-right">
            <div class="search-box">
              <input type="text" placeholder="Search food..." />
            </div>

            <a href="cart.html" class="cart-btn" id="cartButton" aria-label="Open cart">
              <span aria-hidden="true">🛒</span>
              <span class="cart-count" id="cartCount">0</span>
            </a>

            <div
              class="navbar-avatar"
              id="navbarAvatar"
              title="Your profile"
              aria-label="Your profile"
            ></div>

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
          window.location.href = "landingpage.html";
        }
      });
    }

    if (typeof window.updateCartCount === "function") {
      window.updateCartCount();
    }

    if (typeof window.bindProfileEverywhere === "function") {
      window.bindProfileEverywhere();
    }
  }

  window.renderNavbar = renderNavbar;
})();