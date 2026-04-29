console.log("Rider dashboard JS loaded");

/* ================================
   STORAGE KEYS
================================ */
const RIDER_STATUS_KEY = "foodExpressRiderStatus";
const RIDER_SETTINGS_KEY = "foodExpressRiderSettings";

/* ================================
   FAKE RIDER DASHBOARD DATA
================================ */
let riderData = JSON.parse(localStorage.getItem("riderData")) || {
  deliveriesToday: 8,
  activeDelivery: 0,
  earningsToday: 720,
};

function saveRiderData() {
  localStorage.setItem("riderData", JSON.stringify(riderData));
}

/* ================================
   MAIN INIT
================================ */
document.addEventListener("DOMContentLoaded", () => {
  updateUI();
  applyRiderAvailabilityState();
  bindDeliveryProgress();
  bindAcceptButtons();
  bindRefreshButton();
  bindOldStatusButtonIfExists();

  // If Settings updates in same browser session, dashboard can respond.
  window.addEventListener("foodExpressRiderSettingsUpdated", () => {
    applyRiderAvailabilityState();
  });
});

/* ================================
   UPDATE STATS
================================ */
function updateUI() {
  const todayDelivery = document.querySelector(".stat-card:nth-child(1) h2");
  const activeDelivery = document.querySelector(".stat-card:nth-child(2) h2");
  const todayEarnings = document.querySelector(".stat-card:nth-child(3) h2");

  if (todayDelivery) todayDelivery.innerText = riderData.deliveriesToday;
  if (activeDelivery) activeDelivery.innerText = riderData.activeDelivery;

  if (todayEarnings) {
    todayEarnings.innerText = `Rs. ${Number(
      riderData.earningsToday
    ).toLocaleString("en-IN")}`;
  }
}

/* ================================
   TOAST
================================ */
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  const icon =
    type === "success"
      ? "fa-circle-check"
      : type === "warning"
      ? "fa-circle-exclamation"
      : "fa-circle-info";

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  toast.className = `toast show ${type}`;

  clearTimeout(window.__riderDashboardToastTimer);
  window.__riderDashboardToastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

/* ================================
   RIDER AVAILABILITY FROM SETTINGS
================================ */
function getRiderStatus() {
  try {
    const settings = JSON.parse(localStorage.getItem(RIDER_SETTINGS_KEY));

    if (settings && settings.availability) {
      if (!settings.availability.online) return "offline";
      if (settings.availability.breakMode) return "break";
      return "online";
    }
  } catch (error) {
    console.warn("Could not read rider settings.", error);
  }

  const status = localStorage.getItem(RIDER_STATUS_KEY);

  if (status === "online" || status === "offline" || status === "break") {
    return status;
  }

  return "online";
}

function setRiderStatus(status) {
  localStorage.setItem(RIDER_STATUS_KEY, status);

  let settings = {};

  try {
    settings = JSON.parse(localStorage.getItem(RIDER_SETTINGS_KEY)) || {};
  } catch (error) {
    settings = {};
  }

  settings.availability = {
    ...(settings.availability || {}),
    online: status !== "offline",
    breakMode: status === "break",
    autoAccept:
      status === "online"
        ? Boolean(settings.availability?.autoAccept)
        : false
  };

  localStorage.setItem(RIDER_SETTINGS_KEY, JSON.stringify(settings));
}

function applyRiderAvailabilityState() {
  const status = getRiderStatus();

  updateTopbarStatus(status);
  updateSidebarBottomStatus(status);
  updateAvailableDeliveriesState(status);
}

function updateTopbarStatus(status) {
  const onlinePill = document.querySelector(".online-pill");
  if (!onlinePill) return;

  const label =
    status === "offline" ? "Offline" : status === "break" ? "On Break" : "Online";

  onlinePill.classList.remove("offline", "break");

  if (status === "offline") onlinePill.classList.add("offline");
  if (status === "break") onlinePill.classList.add("break");

  // Your HTML is like: <span class="online-pill"><span></span> Online</span>
  onlinePill.innerHTML = `<span></span> ${label}`;
}

function updateSidebarBottomStatus(status) {
  const bottomStatus = document.querySelector(".sidebar-status, .rider-bottom-status");

  if (!bottomStatus) return;

  const label =
    status === "offline" ? "You are Offline" : status === "break" ? "You are On Break" : "You are Online";

  bottomStatus.textContent = label;
}

function updateAvailableDeliveriesState(status) {
  const availableList =
    document.getElementById("availableList") ||
    document.querySelector(".available-list");

  if (!availableList) return;

  // Save original available orders once so they can come back when online.
  if (!availableList.dataset.originalHtml) {
    availableList.dataset.originalHtml = availableList.innerHTML;
  }

  if (status === "offline" || status === "break") {
    availableList.innerHTML = `
      <div class="offline-state">
        <i class="fa-solid fa-power-off"></i>
        <h4>${status === "break" ? "You are on break" : "You are offline"}</h4>
        <p>Go online from Settings to receive new delivery requests.</p>
      </div>
    `;

    return;
  }

  // Restore orders when online.
  if (availableList.dataset.originalHtml) {
    availableList.innerHTML = availableList.dataset.originalHtml;
    bindAcceptButtons();
  }
}

/* ================================
   OLD DASHBOARD STATUS BUTTON SUPPORT
   Only works if #toggleStatus exists
================================ */
function bindOldStatusButtonIfExists() {
  const toggleBtn = document.getElementById("toggleStatus");

  if (!toggleBtn) return;

  const status = getRiderStatus();
  toggleBtn.innerText = status === "offline" ? "Go Online" : "Go Offline";

  toggleBtn.addEventListener("click", () => {
    const currentStatus = getRiderStatus();
    const nextStatus = currentStatus === "offline" ? "online" : "offline";

    setRiderStatus(nextStatus);
    applyRiderAvailabilityState();

    toggleBtn.innerText = nextStatus === "offline" ? "Go Online" : "Go Offline";

    showToast(
      nextStatus === "offline"
        ? "You are now offline."
        : "You are back online."
    );
  });
}

/* ================================
   DELIVERY PROGRESS
================================ */
function bindDeliveryProgress() {
  const steps = document.querySelectorAll(".progress-steps .step");
  const actionButtons = document.querySelectorAll(".delivery-actions button");

  let currentStep = 1;

  function updateSteps(stepIndex) {
    steps.forEach((step, index) => {
      const circle = step.querySelector("span");

      if (index <= stepIndex) {
        step.classList.add("done");
        if (circle) circle.innerHTML = `<i class="fa-solid fa-check"></i>`;
      }
    });
  }

  actionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.innerText.trim();

      if (text === "Picked Up") {
        currentStep = 2;
        updateSteps(currentStep);
        showToast("Order picked up from restaurant.");
      }

      if (text === "On The Way") {
        currentStep = 3;
        updateSteps(currentStep);
        showToast("You are now on the way to customer.");
      }

      if (text === "Delivered") {
        currentStep = 4;
        updateSteps(currentStep);

        riderData.deliveriesToday += 1;
        riderData.activeDelivery = 0;
        riderData.earningsToday += 105;

        saveRiderData();
        updateUI();

        btn.innerText = "Completed";
        btn.disabled = true;
        btn.style.opacity = "0.6";

        showToast("Delivery completed. Rs. 105 added to earnings.");
      }
    });
  });
}

function resetSteps() {
  const steps = document.querySelectorAll(".progress-steps .step");

  steps.forEach((step, index) => {
    const circle = step.querySelector("span");

    if (index <= 1) {
      step.classList.add("done");
      if (circle) circle.innerHTML = `<i class="fa-solid fa-check"></i>`;
    } else {
      step.classList.remove("done");
      if (circle) circle.innerHTML = "";
    }
  });
}

/* ================================
   ACCEPT ORDERS
================================ */
function bindAcceptButtons() {
  const acceptButtons = document.querySelectorAll(".accept-btn");

  acceptButtons.forEach((btn) => {
    // Prevent duplicate listeners after restoring HTML.
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";

    btn.addEventListener("click", () => {
      const status = getRiderStatus();

      if (status === "offline" || status === "break") {
        showToast(
          status === "break"
            ? "You are on break. Turn off break mode to accept orders."
            : "You are offline. Go online to accept orders.",
          "warning"
        );
        return;
      }

      const orderCard = btn.closest(".order-card");
      if (!orderCard) return;

      const orderId = orderCard.querySelector("span")?.innerText || "New Order";
      const restaurantName =
        orderCard.querySelector("h4")?.innerText || "Restaurant";
      const location = orderCard.querySelector("p")?.innerText || "Kathmandu";
      const payout = orderCard.querySelector("strong")?.innerText || "Rs. 95";

      const activeOrderLabel = document.querySelector(
        ".active-delivery .panel-header span, .panel-header span"
      );
      const restaurantTitle = document.querySelector(".route-point h4");
      const restaurantLocation = document.querySelector(".route-point p");

      if (activeOrderLabel) activeOrderLabel.innerText = `Order ${orderId}`;
      if (restaurantTitle) restaurantTitle.innerText = restaurantName;

      if (restaurantLocation) {
        restaurantLocation.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${location}`;
      }

      riderData.activeDelivery = 1;
      saveRiderData();
      updateUI();

      resetSteps();

      btn.innerText = "Accepted";
      btn.disabled = true;
      btn.style.opacity = "0.6";

      orderCard.style.opacity = "0.5";
      orderCard.style.pointerEvents = "none";

      showToast(
        `${orderId} accepted from ${restaurantName}. Estimated payout: ${payout}`
      );
    });
  });
}

/* ================================
   REFRESH BUTTON
================================ */
function bindRefreshButton() {
  const refreshBtn = document.querySelector(".refresh-btn");

  if (!refreshBtn) return;

  refreshBtn.addEventListener("click", () => {
    refreshBtn.classList.add("loading");

    setTimeout(() => {
      refreshBtn.classList.remove("loading");

      const status = getRiderStatus();

      if (status === "offline" || status === "break") {
        showToast(
          status === "break"
            ? "You are on break. No new orders loaded."
            : "You are offline. No new orders loaded.",
          "warning"
        );
      } else {
        showToast("Available deliveries refreshed.");
      }
    }, 1200);
  });
}