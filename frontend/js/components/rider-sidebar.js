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