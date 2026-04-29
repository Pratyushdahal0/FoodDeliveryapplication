const currentPage = window.location.pathname.split("/").pop();

document.getElementById("sidebar").innerHTML = `
  <div class="sidebar">
    <div class="logo">
      <h2>FoodExpress</h2>
      <span>Rider Panel</span>
    </div>

    <ul class="menu">
      <li class="${currentPage === "rider-dashboard.html" ? "active" : ""}" data-link="rider-dashboard.html">
        <i class="fa-solid fa-house"></i> <span>Dashboard</span>
      </li>

      <li class="${currentPage === "rider-deliveries.html" ? "active" : ""}" data-link="rider-deliveries.html">
        <i class="fa-solid fa-truck"></i> <span>Deliveries</span>
      </li>

      <li class="${currentPage === "rider-history.html" ? "active" : ""}" data-link="rider-history.html">
        <i class="fa-solid fa-clock-rotate-left"></i> <span>History</span>
      </li>

      <li class="${currentPage === "rider-earnings.html" ? "active" : ""}" data-link="rider-earnings.html">
        <i class="fa-solid fa-wallet"></i> <span>Earnings</span>
      </li>

      <li class="${currentPage === "rider-profile.html" ? "active" : ""}" data-link="rider-profile.html">
        <i class="fa-solid fa-user"></i> <span>Profile</span>
      </li>

      <li class="${currentPage === "rider-settings.html" ? "active" : ""}" data-link="rider-settings.html">
        <i class="fa-solid fa-gear"></i> <span>Settings</span>
      </li>

      <li class="${currentPage === "rider-support.html" ? "active" : ""}" data-link="rider-support.html">
        <i class="fa-solid fa-headset"></i> <span>Support</span>
      </li>
    </ul>

    <div class="status-card">
      <p>You are Online</p>
      <button id="toggleStatus">Go Offline</button>
    </div>
  </div>
`;

// Sidebar menu navigation
document.querySelectorAll(".menu li").forEach((item) => {
  item.addEventListener("click", () => {
    window.location.href = item.getAttribute("data-link");
  });
});

// Sidebar toggle - works on all pages
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const main = document.querySelector(".main");

if (menuToggle && sidebar && main) {
  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("mini");
    main.classList.toggle("mini");
  });
}
/* =====================================================
   GLOBAL RIDER STATUS SYNC
   Works on Dashboard, Deliveries, History, Earnings,
   Settings, Profile, Support
===================================================== */

(function syncRiderStatusEverywhere() {
  const RIDER_STATUS_KEY = "foodExpressRiderStatus";
  const RIDER_SETTINGS_KEY = "foodExpressRiderSettings";

  function getGlobalRiderStatus() {
    try {
      const settings = JSON.parse(localStorage.getItem(RIDER_SETTINGS_KEY));

      if (settings && settings.availability) {
        if (!settings.availability.online) return "offline";
        if (settings.availability.breakMode) return "break";
        return "online";
      }
    } catch (error) {
      console.warn("Could not read rider settings for global status.", error);
    }

    const status = localStorage.getItem(RIDER_STATUS_KEY);

    if (status === "offline" || status === "break" || status === "online") {
      return status;
    }

    return "online";
  }

  function applyGlobalRiderStatus() {
    const status = getGlobalRiderStatus();

    const label =
      status === "offline"
        ? "Offline"
        : status === "break"
        ? "On Break"
        : "Online";

    const dotColor =
      status === "offline"
        ? "#ef4444"
        : status === "break"
        ? "#f4a000"
        : "#0fa958";

    // Topbar pill on every rider page
    document.querySelectorAll(".online-pill").forEach((pill) => {
      pill.classList.remove("offline", "break", "online");

      if (status === "offline") pill.classList.add("offline");
      if (status === "break") pill.classList.add("break");
      if (status === "online") pill.classList.add("online");

      pill.innerHTML = `<span></span> ${label}`;

      const dot = pill.querySelector("span");
      if (dot) dot.style.background = dotColor;
    });

    // Bottom sidebar status if present
    const sidebarStatus = document.querySelector(
      ".sidebar-status, .rider-bottom-status, .sidebar-footer"
    );

    if (sidebarStatus) {
      const text =
        status === "offline"
          ? "You are Offline"
          : status === "break"
          ? "You are On Break"
          : "You are Online";

      const dot = sidebarStatus.querySelector("span");

      if (dot) {
        dot.style.background = dotColor;
      }

      const textNode = Array.from(sidebarStatus.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
      );

      if (textNode) {
        textNode.textContent = ` ${text}`;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", applyGlobalRiderStatus);

  window.addEventListener("storage", (event) => {
    if (
      event.key === RIDER_STATUS_KEY ||
      event.key === RIDER_SETTINGS_KEY
    ) {
      applyGlobalRiderStatus();
    }
  });

  window.applyGlobalRiderStatus = applyGlobalRiderStatus;
})();