console.log("[rider-dashboard.js] Loaded - real backend dashboard");

/* ================================
   API + STORAGE
================================ */

const ORDER_API_URL = "../../backend/controllers/OrderController.php";

const RIDER_STATUS_KEY = "foodExpressRiderStatus";
const RIDER_SETTINGS_KEY = "foodExpressRiderSettings";
const ACTIVE_RIDER_DELIVERY_KEY = "foodExpressActiveRiderDelivery";
const RIDER_HISTORY_KEY = "foodexpress_rider_history";
const RIDER_EARNINGS_KEY = "foodexpress_rider_earnings";

let dashboardAvailableOrders = [];
let dashboardActiveOrder = null;
let dashboardHistory = [];

/* ================================
   INIT
================================ */

document.addEventListener("DOMContentLoaded", async () => {
  bindSidebarToggle();
  applyRiderAvailabilityState();
  updateRiderIdentityUI();

  await loadDashboardData();

  bindRefreshButton();
  bindOldStatusButtonIfExists();

  window.addEventListener("foodExpressRiderSettingsUpdated", async () => {
    applyRiderAvailabilityState();
    await loadDashboardData();
  });

  window.addEventListener("storage", async (event) => {
    if (
      event.key === RIDER_STATUS_KEY ||
      event.key === RIDER_SETTINGS_KEY ||
      event.key === ACTIVE_RIDER_DELIVERY_KEY ||
      event.key === RIDER_HISTORY_KEY
    ) {
      applyRiderAvailabilityState();
      await loadDashboardData();
    }
  });
});

/* ================================
   LOAD DASHBOARD
================================ */

async function loadDashboardData() {
  renderLoadingState();

  await Promise.all([
    loadAvailableDeliveriesFromBackend(),
    loadActiveDeliveryFromBackend(),
  ]);

  dashboardHistory = readJson(RIDER_HISTORY_KEY, []);
  if (!Array.isArray(dashboardHistory)) dashboardHistory = [];

  renderDashboard();
}

function renderLoadingState() {
  const activePanel = document.querySelector(".active-delivery");
  const availablePanel = getAvailablePanel();
  const recentPanel = getRecentPanel();

  if (activePanel) {
    activePanel.innerHTML = `
      <div class="panel-header">
        <h3>Active Delivery</h3>
        <span>Loading...</span>
      </div>
      <div class="dashboard-loading-card">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Checking your current delivery...</p>
      </div>
    `;
  }

  if (availablePanel) {
    availablePanel.innerHTML = `
      <div class="panel-header">
        <h3>Available Deliveries</h3>
        <button class="refresh-btn">
          <i class="fa-solid fa-rotate-right"></i>
        </button>
      </div>
      <div class="dashboard-loading-card">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Loading ready pickup orders...</p>
      </div>
    `;
  }

  if (recentPanel) {
    recentPanel.innerHTML = `
      <div class="panel-header">
        <h3>Recent Deliveries</h3>
        <a href="rider-history.html">View All</a>
      </div>
      <div class="dashboard-loading-card">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Loading recent completed trips...</p>
      </div>
    `;
  }
}

async function loadAvailableDeliveriesFromBackend() {
  try {
    const response = await fetch(`${ORDER_API_URL}?action=available_deliveries&_=${Date.now()}`);
    const raw = await response.text();

    let result;
    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("[rider-dashboard.js] Available deliveries non-JSON:", raw);
      throw new Error("Backend did not return valid JSON.");
    }

    if (!result.success) {
      throw new Error(result.message || "Could not load available deliveries.");
    }

    dashboardAvailableOrders = Array.isArray(result.data)
      ? result.data.map(normalizeOrderForDashboard)
      : [];

    return dashboardAvailableOrders;
  } catch (error) {
    console.error("[rider-dashboard.js] Failed to load available deliveries:", error);
    dashboardAvailableOrders = [];
    showToast("Could not load available deliveries.", "error");
    return [];
  }
}

async function loadActiveDeliveryFromBackend() {
  const rider = getCurrentRider();

  try {
    const response = await fetch(
      `${ORDER_API_URL}?action=active_delivery&rider_id=${encodeURIComponent(rider.id)}&_=${Date.now()}`
    );

    const raw = await response.text();

    let result;
    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("[rider-dashboard.js] Active delivery non-JSON:", raw);
      throw new Error("Backend did not return valid JSON.");
    }

    if (!result.success) {
      throw new Error(result.message || "Could not load active delivery.");
    }

    if (result.data) {
      dashboardActiveOrder = normalizeOrderForDashboard(result.data);
      writeJson(ACTIVE_RIDER_DELIVERY_KEY, dashboardActiveOrder);
    } else {
      dashboardActiveOrder = null;
      localStorage.removeItem(ACTIVE_RIDER_DELIVERY_KEY);
    }

    return dashboardActiveOrder;
  } catch (error) {
    console.error("[rider-dashboard.js] Failed to load active delivery:", error);

    const cached = readJson(ACTIVE_RIDER_DELIVERY_KEY, null);
    dashboardActiveOrder = cached ? normalizeOrderForDashboard(cached) : null;

    return dashboardActiveOrder;
  }
}

/* ================================
   RENDER DASHBOARD
================================ */

function renderDashboard() {
  updateRiderIdentityUI();
  updateStats();
  renderActiveDelivery();
  renderAvailableDeliveries();
  renderRecentDeliveries();
  applyRiderAvailabilityState();
  bindRefreshButton();
}

function updateStats() {
  const normalizedHistory = Array.isArray(dashboardHistory)
    ? dashboardHistory.map((order) => normalizeOrderForDashboard(order))
    : [];

  const todayDelivered = normalizedHistory.filter((order) => {
    return isDelivered(order) && isTodayOrder(order);
  });

  const todayEarnings = todayDelivered.reduce((sum, order) => {
    return sum + getRiderEarningAmount(order);
  }, 0);

  const weeklyDelivered = normalizedHistory.filter((order) => {
    const date = getOrderDate(order);
    if (!date || !isDelivered(order)) return false;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    return date >= sevenDaysAgo;
  });

  const todayDeliveryCard = document.querySelector(".stat-card:nth-child(1) h2");
  const activeDeliveryCard = document.querySelector(".stat-card:nth-child(2) h2");
  const todayEarningsCard = document.querySelector(".stat-card:nth-child(3) h2");
  const weeklyCard = document.querySelector(".stat-card:nth-child(4) h2");

  if (todayDeliveryCard) {
    todayDeliveryCard.innerText = todayDelivered.length;
  }

  if (activeDeliveryCard) {
    activeDeliveryCard.innerText = dashboardActiveOrder ? "1" : "0";
  }

  if (todayEarningsCard) {
    todayEarningsCard.innerText = formatMoney(todayEarnings);
  }

  if (weeklyCard) {
    weeklyCard.innerText = weeklyDelivered.length;
  }
}


function isTodayOrder(order) {
  const date = getOrderDate(order);
  if (!date) return false;

  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function renderActiveDelivery() {
  const activePanel = document.querySelector(".active-delivery");
  if (!activePanel) return;

  if (!dashboardActiveOrder) {
    activePanel.innerHTML = `
      <div class="panel-header">
        <h3>Active Delivery</h3>
        <span>No active trip</span>
      </div>

      <div class="empty-active-dashboard">
        <i class="fa-solid fa-box-open"></i>
        <h4>No active delivery</h4>
        <p>Ready pickup orders will appear in Available Deliveries. Accept one to start your trip.</p>
        <a href="rider-deliveries.html" class="primary-dashboard-link">
          <i class="fa-solid fa-motorcycle"></i>
          Go to Deliveries
        </a>
      </div>
    `;

    return;
  }

  const order = normalizeOrderForDashboard(dashboardActiveOrder);
  const currentStep = getStepIndex(order);
  const nextLabel = getNextActionLabel(order);
  const disabled = shouldDisableNextStep(order);

  activePanel.innerHTML = `
    <div class="panel-header">
      <h3>Active Delivery</h3>
      <span>${escapeHtml(order.orderNumber)}</span>
    </div>

    <div class="dashboard-active-status">
      <span class="status-pill ${escapeHtml(getDeliveryStatus(order))}">
        ${escapeHtml(formatStatusLabel(getDeliveryStatus(order)))}
      </span>
      <strong>${formatMoney(estimateEarning(order))}</strong>
    </div>

    <div class="delivery-route">
      <div class="route-point">
        <div class="route-icon restaurant">
          <i class="fa-solid fa-store"></i>
        </div>
        <small>Restaurant</small>
        <h4>${escapeHtml(getRestaurantName(order))}</h4>
        <p>
          <i class="fa-solid fa-location-dot"></i>
          ${escapeHtml(getPickupAddress(order))}
        </p>
      </div>

      <div class="route-middle">
        <div class="dashed-line"></div>
        <i class="fa-solid fa-motorcycle"></i>
        <strong>${escapeHtml(order.distance || "2.5 km")}</strong>
      </div>

      <div class="route-point right">
        <div class="route-icon customer">
          <i class="fa-solid fa-user"></i>
        </div>
        <small>Customer</small>
        <h4>${escapeHtml(getCustomerName(order))}</h4>
        <p>
          <i class="fa-solid fa-location-dot"></i>
          ${escapeHtml(getDropoffAddress(order))}
        </p>
      </div>
    </div>

    <div class="progress-steps">
      ${["Accepted", "Food Ready", "Picked Up", "On The Way", "Delivered"]
        .map((label, index) => {
          return `
            <div class="step ${index <= currentStep ? "done" : ""}">
              <span>${index <= currentStep ? `<i class="fa-solid fa-check"></i>` : ""}</span>
              <p>${escapeHtml(label)}</p>
            </div>
          `;
        })
        .join("")}
    </div>

    ${
      getDeliveryStatus(order) === "assigned" && getOrderStatus(order) !== "ready_for_pickup"
        ? `
          <div class="note-box warning-note">
            <i class="fa-solid fa-clock"></i>
            Restaurant is still preparing this order. Pickup will unlock once it is ready.
          </div>
        `
        : `
          <div class="note-box">
            <i class="fa-solid fa-circle-info"></i>
            Follow the steps in order so the customer tracking page stays updated.
          </div>
        `
    }

    <div class="delivery-actions">
      <button class="outline" id="dashboardViewDetailsBtn">
        <i class="fa-solid fa-circle-info"></i>
        View Details
      </button>

      <button class="outline" id="dashboardNavigateBtn">
        <i class="fa-solid fa-location-arrow"></i>
        Navigate
      </button>

      <button class="primary" id="dashboardNextStepBtn" ${disabled ? "disabled" : ""}>
        <i class="fa-solid fa-circle-check"></i>
        ${escapeHtml(nextLabel)}
      </button>
    </div>
  `;

  document
    .getElementById("dashboardViewDetailsBtn")
    ?.addEventListener("click", () => openOrderDetails(order));

  document
    .getElementById("dashboardNavigateBtn")
    ?.addEventListener("click", () => openGoogleMaps(order));

  document
    .getElementById("dashboardNextStepBtn")
    ?.addEventListener("click", () => nextDeliveryStep(order));
}

function renderAvailableDeliveries() {
  const availablePanel = getAvailablePanel();
  if (!availablePanel) return;

  const status = getRiderStatus();

  if (status === "offline" || status === "break") {
    availablePanel.innerHTML = `
      <div class="panel-header">
        <h3>Available Deliveries</h3>
        <button class="refresh-btn">
          <i class="fa-solid fa-rotate-right"></i>
        </button>
      </div>

      <div class="offline-state">
        <i class="fa-solid fa-power-off"></i>
        <h4>${status === "break" ? "You are on break" : "You are offline"}</h4>
        <p>Go online from Settings to receive new delivery requests.</p>
      </div>
    `;
    return;
  }

  const available = dashboardAvailableOrders
    .filter((order) => {
      const orderStatus = getOrderStatus(order);
      const deliveryStatus = getDeliveryStatus(order);

      return (
        orderStatus === "ready_for_pickup" &&
        ["", "searching", "unassigned", "pending"].includes(deliveryStatus)
      );
    })
    .slice(0, 3);

  if (!available.length) {
    availablePanel.innerHTML = `
      <div class="panel-header">
        <h3>Available Deliveries</h3>
        <button class="refresh-btn">
          <i class="fa-solid fa-rotate-right"></i>
        </button>
      </div>

      <div class="empty-active-dashboard compact">
        <i class="fa-solid fa-magnifying-glass-location"></i>
        <h4>No ready pickup orders</h4>
        <p>When restaurants mark orders as ready, they will appear here.</p>
        <a href="rider-deliveries.html" class="view-all">
          Open Deliveries <i class="fa-solid fa-arrow-right"></i>
        </a>
      </div>
    `;

    return;
  }

  availablePanel.innerHTML = `
    <div class="panel-header">
      <h3>Available Deliveries</h3>
      <button class="refresh-btn">
        <i class="fa-solid fa-rotate-right"></i>
      </button>
    </div>

    ${available
      .map((order) => {
        return `
          <div class="order-card" data-order-id="${escapeHtml(getOrderId(order))}">
            <div>
              <span>${escapeHtml(order.orderNumber)}</span>
              <h4>${escapeHtml(getRestaurantName(order))}</h4>
              <p>${escapeHtml(getPickupAddress(order))}</p>
            </div>

            <div class="order-meta">
              <small>${escapeHtml(order.distance || "2.5 km")}</small>
              <strong>${formatMoney(estimateEarning(order))}</strong>
              <button class="accept-btn" data-order-id="${escapeHtml(getOrderId(order))}">
                Accept
              </button>
            </div>
          </div>
        `;
      })
      .join("")}

    <a class="view-all" href="rider-deliveries.html">
      View All Available Orders <i class="fa-solid fa-arrow-right"></i>
    </a>
  `;

  availablePanel.querySelectorAll(".accept-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();

      const id = button.dataset.orderId;
      const order = available.find((item) => String(getOrderId(item)) === String(id));

      if (order) {
        await acceptOrderFromDashboard(order, button);
      }
    });
  });

  bindRefreshButton();
}

function renderRecentDeliveries() {
  const recentPanel = getRecentPanel();
  if (!recentPanel) return;

  const delivered = dashboardHistory
    .filter(isDelivered)
    .map((order) => normalizeOrderForDashboard(order))
    .sort((a, b) => {
      const bDate = getOrderDate(b)?.getTime() || 0;
      const aDate = getOrderDate(a)?.getTime() || 0;
      return bDate - aDate;
    })
    .slice(0, 3);

  if (!delivered.length) {
    recentPanel.innerHTML = `
      <div class="panel-header">
        <h3>Recent Deliveries</h3>
        <a href="rider-history.html">View All</a>
      </div>

      <div class="empty-active-dashboard compact">
        <i class="fa-solid fa-receipt"></i>
        <h4>No completed trips yet</h4>
        <p>Delivered orders will appear here after your first completed trip.</p>
      </div>
    `;
    return;
  }

  recentPanel.innerHTML = `
    <div class="panel-header">
      <h3>Recent Deliveries</h3>
      <a href="rider-history.html">View All</a>
    </div>

    ${delivered
      .map((order) => {
        const earning = getRiderEarningAmount(order);

        return `
          <div class="recent-item">
            <div class="recent-left">
              <i class="fa-solid fa-circle-check"></i>
              <div>
                <h4>${escapeHtml(order.orderNumber || order.order_number || "Order")}</h4>
                <p>${escapeHtml(getRestaurantName(order))}</p>
              </div>
            </div>

            <strong>${formatMoney(earning)}</strong>
            <span>Delivered</span>
            <small>${escapeHtml(formatShortTime(getOrderDate(order)))}</small>
          </div>
        `;
      })
      .join("")}
  `;
}

/* ================================
   BACKEND ACTIONS
================================ */

async function acceptOrderFromDashboard(order, button) {
  const riderStatus = getRiderStatus();

  if (riderStatus === "offline" || riderStatus === "break") {
    showToast(
      riderStatus === "break"
        ? "You are on break. Turn off break mode to accept orders."
        : "You are offline. Go online to accept orders.",
      "warning"
    );
    return;
  }

  if (dashboardActiveOrder) {
    showToast("Complete your active delivery before accepting another one.", "warning");
    return;
  }

  const rider = getCurrentRider();
  const backendOrderId = getBackendOrderId(order);

  if (!backendOrderId) {
    showToast("This order does not have a backend order ID.", "error");
    return;
  }

  try {
    if (button) {
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
    }

    const response = await fetch(`${ORDER_API_URL}?action=assign_rider`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order_id: Number(backendOrderId),
        rider_id: rider.id,
        rider_name: rider.name,
        rider_email: rider.email,
        rider_phone: rider.phone,
      }),
    });

    const raw = await response.text();

    let result;
    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("[rider-dashboard.js] Assign rider non-JSON:", raw);
      throw new Error("Server did not return valid JSON.");
    }

    if (!result.success) {
      throw new Error(result.message || "Could not accept delivery.");
    }

    showToast(`${order.orderNumber} accepted successfully.`);
    await loadDashboardData();
  } catch (error) {
    console.error("[rider-dashboard.js] Accept order failed:", error);
    showToast(error.message || "Could not accept delivery.", "error");

    if (button) {
      button.disabled = false;
      button.innerText = "Accept";
    }
  }
}

async function nextDeliveryStep(order) {
  const nextStatus = getNextDeliveryStatus(order);
  const backendOrderId = getBackendOrderId(order);

  if (!backendOrderId) {
    showToast("This order does not have a backend order ID.", "error");
    return;
  }

  try {
    const button = document.getElementById("dashboardNextStepBtn");
    if (button) {
      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating...`;
    }

    const response = await fetch(`${ORDER_API_URL}?action=update_delivery_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order_id: Number(backendOrderId),
        delivery_status: nextStatus,
      }),
    });

    const raw = await response.text();

    let result;
    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("[rider-dashboard.js] Delivery status non-JSON:", raw);
      throw new Error("Server did not return valid JSON.");
    }

    if (!result.success) {
      throw new Error(result.message || "Could not update delivery status.");
    }

    if (nextStatus === "delivered") {
      addToRiderHistory({
        ...order,
        status: "delivered",
        deliveryStatus: "delivered",
        delivery_status: "delivered",
        deliveredAt: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
      });

      localStorage.removeItem(ACTIVE_RIDER_DELIVERY_KEY);
    }

    showToast(
      nextStatus === "picked_up"
        ? "Order picked up."
        : nextStatus === "on_the_way"
          ? "You are on the way to the customer."
          : "Delivery completed."
    );

    await loadDashboardData();
  } catch (error) {
    console.error("[rider-dashboard.js] Update status failed:", error);
    showToast(error.message || "Could not update delivery status.", "error");
    await loadDashboardData();
  }
}

/* ================================
   RIDER STATUS
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
    console.warn("[rider-dashboard.js] Could not read rider settings.", error);
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
  } catch {
    settings = {};
  }

  settings.availability = {
    ...(settings.availability || {}),
    online: status !== "offline",
    breakMode: status === "break",
    autoAccept:
      status === "online"
        ? Boolean(settings.availability?.autoAccept)
        : false,
  };

  localStorage.setItem(RIDER_SETTINGS_KEY, JSON.stringify(settings));
}

function applyRiderAvailabilityState() {
  const status = getRiderStatus();

  updateTopbarStatus(status);
  updateSidebarBottomStatus(status);
}

function updateTopbarStatus(status) {
  const onlinePill = document.querySelector(".online-pill");
  if (!onlinePill) return;

  const label =
    status === "offline" ? "Offline" : status === "break" ? "On Break" : "Online";

  onlinePill.classList.remove("offline", "break");

  if (status === "offline") onlinePill.classList.add("offline");
  if (status === "break") onlinePill.classList.add("break");

  onlinePill.innerHTML = `<span></span> ${label}`;
}

function updateSidebarBottomStatus(status) {
  const bottomStatus = document.querySelector(".sidebar-status, .rider-bottom-status");
  if (!bottomStatus) return;

  bottomStatus.textContent =
    status === "offline"
      ? "You are Offline"
      : status === "break"
        ? "You are On Break"
        : "You are Online";
}

function bindOldStatusButtonIfExists() {
  const toggleBtn = document.getElementById("toggleStatus");
  if (!toggleBtn) return;

  const status = getRiderStatus();
  toggleBtn.innerText = status === "offline" ? "Go Online" : "Go Offline";

  toggleBtn.addEventListener("click", async () => {
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

    await loadDashboardData();
  });
}

/* ================================
   RIDER IDENTITY
================================ */

function getCurrentRider() {
  const storedRider =
    readJson("foodExpressCurrentRider", null) ||
    readJson("foodExpressRiderProfile", null) ||
    readJson("riderProfile", null) ||
    {};

  const name =
    localStorage.getItem("riderName") ||
    localStorage.getItem("foodExpressRiderName") ||
    storedRider.name ||
    storedRider.fullName ||
    storedRider.full_name ||
    storedRider.riderName ||
    storedRider.rider_name ||
    "";

  const email =
    localStorage.getItem("riderEmail") ||
    localStorage.getItem("foodExpressRiderEmail") ||
    storedRider.email ||
    storedRider.riderEmail ||
    storedRider.rider_email ||
    "";

  const phone =
    localStorage.getItem("riderPhone") ||
    localStorage.getItem("foodExpressRiderPhone") ||
    storedRider.phone ||
    storedRider.phoneNumber ||
    storedRider.phone_number ||
    storedRider.riderPhone ||
    storedRider.rider_phone ||
    "";

  const id =
    storedRider.id ||
    storedRider.rider_id ||
    localStorage.getItem("riderUserId") ||
    localStorage.getItem("foodExpressRiderId") ||
    1;

  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim();

  return {
    id: Number(id || 1),
    name:
      cleanName && !/owner/i.test(cleanName)
        ? cleanName
        : "FoodExpress Rider",
    email:
      cleanEmail && !/owner/i.test(cleanEmail)
        ? cleanEmail
        : "rider@foodexpress.local",
    phone: String(phone || "").trim(),
  };
}

function updateRiderIdentityUI() {
  const rider = getCurrentRider();

  const heroTitle = document.querySelector(".dashboard-hero h1");
  if (heroTitle) {
    heroTitle.innerHTML = `${getGreeting()}, ${escapeHtml(rider.name)}! 👋`;
  }

  const profileName = document.querySelector(".rider-profile h4");
  const profileId = document.querySelector(".rider-profile p");

  if (profileName) profileName.innerText = rider.name;
  if (profileId) profileId.innerText = `Rider ID: RID-${String(rider.id).padStart(4, "0")}`;
}

/* ================================
   ORDER NORMALIZATION
================================ */

function normalizeOrderForDashboard(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const firstItem = items[0] || {};

  const restaurantName = cleanDashboardLabel(
    order.restaurantName ||
      order.restaurant_name ||
      order.restaurant ||
      firstItem.restaurantName ||
      firstItem.restaurant_name ||
      firstItem.storeName ||
      firstItem.store_name ||
      ""
  );

  const restaurantAddress = cleanDashboardLabel(
    order.restaurantAddress ||
      order.restaurant_address ||
      order.pickupAddress ||
      order.pickup_address ||
      order.pickup ||
      ""
  );

  const customerName = cleanDashboardLabel(
    order.customerName ||
      order.customer_name ||
      order.customer ||
      order.fullName ||
      order.full_name ||
      order.name ||
      ""
  );

  const customerAddress = [
    order.address,
    order.city,
    order.area,
    order.postalCode || order.postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  const realEarning = getRiderEarningAmount(order);

  return {
    ...order,

    id: order.id || order.orderId || order.order_id,
    orderId: order.orderId || order.order_id || order.id,
    order_id: order.order_id || order.orderId || order.id,

    orderNumber:
      order.orderNumber || order.order_number || order.orderNo || order.id || "ORDER",
    order_number:
      order.order_number || order.orderNumber || order.orderNo || order.id || "ORDER",

    restaurantName: restaurantName || "Restaurant",
    restaurant_name: restaurantName || "Restaurant",

    restaurantAddress:
      restaurantAddress ||
      (restaurantName ? `${restaurantName}, Kathmandu` : "Restaurant pickup location"),
    restaurant_address:
      restaurantAddress ||
      (restaurantName ? `${restaurantName}, Kathmandu` : "Restaurant pickup location"),

    customerName: customerName || "Customer",
    customer_name: customerName || "Customer",

    phoneNumber: order.phoneNumber || order.phone_number || order.phone || "",
    phone_number: order.phone_number || order.phoneNumber || order.phone || "",

    deliveryStatus:
      order.deliveryStatus || order.delivery_status || "searching",
    delivery_status:
      order.delivery_status || order.deliveryStatus || "searching",

    status: order.status || "pending",

    total: Number(order.total || 0),
    subtotal: Number(order.subtotal || 0),
    tax: Number(order.tax || 0),
    deliveryFee: Number(order.deliveryFee || order.delivery_fee || 0),
    delivery_fee: Number(order.delivery_fee || order.deliveryFee || 0),

    earning: realEarning,
    rider_earning: realEarning,
    delivery_earning: realEarning,

    address: order.address || order.deliveryAddress || order.delivery_address || "",
    city: order.city || "",
    area: order.area || "",
    postalCode: order.postalCode || order.postal_code || "",
    postal_code: order.postal_code || order.postalCode || "",

    dropoff:
      order.dropoff ||
      order.dropoffAddress ||
      order.dropoff_address ||
      customerAddress ||
      "Customer delivery location",

    createdAt: order.createdAt || order.created_at || "",
    created_at: order.created_at || order.createdAt || "",
    updatedAt: order.updatedAt || order.updated_at || "",
    updated_at: order.updated_at || order.updatedAt || "",

    deliveredAt: order.deliveredAt || order.delivered_at || "",
    delivered_at: order.delivered_at || order.deliveredAt || "",

    distance: order.distance || "2.5 km",
    eta: order.eta || order.estimated_delivery || order.estimatedDelivery || "20 mins",

    items,
  };
}

function cleanDashboardLabel(value) {
  const text = String(value || "").trim();

  if (!text) return "";
  if (text.toLowerCase() === "restaurant") return "";
  if (text.toLowerCase() === "unknown restaurant") return "";
  if (text.toLowerCase() === "customer") return "";

  return text;
}

function getRestaurantName(order) {
  return (
    cleanDashboardLabel(order.restaurantName) ||
    cleanDashboardLabel(order.restaurant_name) ||
    cleanDashboardLabel(order.restaurant) ||
    "Restaurant"
  );
}

function getCustomerName(order) {
  return (
    cleanDashboardLabel(order.customerName) ||
    cleanDashboardLabel(order.customer_name) ||
    cleanDashboardLabel(order.customer) ||
    cleanDashboardLabel(order.fullName) ||
    cleanDashboardLabel(order.full_name) ||
    "Customer"
  );
}

function getPickupAddress(order) {
  return (
    cleanDashboardLabel(order.restaurantAddress) ||
    cleanDashboardLabel(order.restaurant_address) ||
    cleanDashboardLabel(order.pickupAddress) ||
    cleanDashboardLabel(order.pickup_address) ||
    cleanDashboardLabel(order.pickup) ||
    `${getRestaurantName(order)}, Kathmandu`
  );
}

function getDropoffAddress(order) {
  const parts = [
    order.address,
    order.city,
    order.area,
    order.postalCode || order.postal_code,
  ].filter(Boolean);

  return (
    parts.join(", ") ||
    order.dropoff ||
    order.dropoffAddress ||
    order.dropoff_address ||
    "Customer delivery location"
  );
}

function getRiderEarningAmount(order = {}) {
  const history = readJson(RIDER_HISTORY_KEY, []);
  const orderId = String(
    order.id ||
      order.orderId ||
      order.order_id ||
      order.orderNumber ||
      order.order_number ||
      ""
  ).replace("#", "");

  if (Array.isArray(history) && orderId) {
    const matchedHistory = history.find((item) => {
      const historyId = String(
        item.id ||
          item.orderId ||
          item.order_id ||
          item.orderNumber ||
          item.order_number ||
          ""
      ).replace("#", "");

      return historyId && historyId === orderId;
    });

    const historyEarning = Number(
      matchedHistory?.earning ||
        matchedHistory?.rider_earning ||
        matchedHistory?.delivery_earning ||
        matchedHistory?.amount ||
        0
    );

    if (historyEarning > 0) return Math.round(historyEarning);
  }

  const explicit = Number(
    order.rider_earning ||
      order.riderEarning ||
      order.delivery_earning ||
      order.deliveryEarning ||
      order.earning ||
      order.amount ||
      0
  );

  if (explicit > 0) return Math.round(explicit);

  const deliveryFee = Number(order.deliveryFee || order.delivery_fee || 0);
  if (deliveryFee > 0) return Math.max(100, Math.round(deliveryFee * 2));

  const total = Number(order.total || 0);
  if (total > 0) return Math.max(100, Math.round(total * 0.08 + 70));

  return 100;
}

function estimateEarning(order) {
  return getRiderEarningAmount(order);
}


function getOrderId(order) {
  return String(order.id || order.orderId || order.order_id || order.orderNumber || "");
}

function getBackendOrderId(order) {
  return order.orderId || order.order_id || order.id || "";
}

function getRestaurantName(order) {
  return order.restaurantName || order.restaurant_name || order.restaurant || "Restaurant";
}

function getCustomerName(order) {
  return order.customerName || order.customer_name || order.fullName || "Customer";
}

function getPickupAddress(order) {
  return (
    order.restaurantAddress ||
    order.restaurant_address ||
    order.pickup ||
    `${getRestaurantName(order)}, Kathmandu`
  );
}

function getDropoffAddress(order) {
  const parts = [
    order.address,
    order.city,
    order.area,
    order.postalCode || order.postal_code,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : order.dropoff || "Customer address";
}

function getDeliveryStatus(order) {
  return String(order.deliveryStatus || order.delivery_status || "searching")
    .toLowerCase()
    .trim();
}

function getOrderStatus(order) {
  return String(order.status || "pending").toLowerCase().trim();
}

function estimateEarning(order) {
  const total = Number(order.total || 0);
  if (total <= 0) return 75;

  return Math.max(75, Math.round(total * 0.08 + 70));
}

/* ================================
   STATUS STEPS
================================ */

function getStepIndex(order) {
  const deliveryStatus = getDeliveryStatus(order);
  const orderStatus = getOrderStatus(order);

  if (deliveryStatus === "delivered" || orderStatus === "delivered") return 4;
  if (deliveryStatus === "on_the_way" || orderStatus === "on_the_way") return 3;
  if (deliveryStatus === "picked_up" || orderStatus === "picked_up") return 2;

  if (deliveryStatus === "assigned" && orderStatus === "ready_for_pickup") {
    return 1;
  }

  if (deliveryStatus === "assigned") return 0;

  return 0;
}

function getNextActionLabel(order) {
  const deliveryStatus = getDeliveryStatus(order);
  const orderStatus = getOrderStatus(order);

  if (deliveryStatus === "assigned" && orderStatus !== "ready_for_pickup") {
    return "Waiting for Restaurant";
  }

  if (deliveryStatus === "assigned" && orderStatus === "ready_for_pickup") {
    return "Pick Up Order";
  }

  if (deliveryStatus === "picked_up") return "Start Delivery";
  if (deliveryStatus === "on_the_way") return "Mark Delivered";

  return "Delivery Completed";
}

function getNextDeliveryStatus(order) {
  const deliveryStatus = getDeliveryStatus(order);

  if (deliveryStatus === "assigned") return "picked_up";
  if (deliveryStatus === "picked_up") return "on_the_way";
  if (deliveryStatus === "on_the_way") return "delivered";

  return "delivered";
}

function shouldDisableNextStep(order) {
  const deliveryStatus = getDeliveryStatus(order);
  const orderStatus = getOrderStatus(order);

  if (deliveryStatus === "delivered" || orderStatus === "delivered") return true;

  if (deliveryStatus === "assigned" && orderStatus !== "ready_for_pickup") {
    return true;
  }

  return false;
}

/* ================================
   HISTORY
================================ */

function addToRiderHistory(order) {
  const history = readJson(RIDER_HISTORY_KEY, []);
  const safeHistory = Array.isArray(history) ? history : [];

  const normalized = normalizeOrderForDashboard(order);
  const orderId = getOrderId(normalized);

  const exists = safeHistory.some((item) => String(getOrderId(item)) === String(orderId));

  if (!exists) {
    safeHistory.unshift({
      ...normalized,
      status: "delivered",
      deliveryStatus: "delivered",
      delivery_status: "delivered",
      earning: estimateEarning(normalized),
      deliveredAt: normalized.deliveredAt || new Date().toISOString(),
      delivered_at: normalized.delivered_at || new Date().toISOString(),
    });

    writeJson(RIDER_HISTORY_KEY, safeHistory);
  }

  const earnings = readJson(RIDER_EARNINGS_KEY, []);
  const safeEarnings = Array.isArray(earnings) ? earnings : [];

  const earningExists = safeEarnings.some(
    (entry) => String(entry.orderId || entry.order_id) === String(orderId)
  );

  if (!earningExists) {
    safeEarnings.unshift({
      orderId,
      orderNumber: normalized.orderNumber || normalized.order_number,
      amount: estimateEarning(normalized),
      date: new Date().toISOString(),
      restaurant: getRestaurantName(normalized),
      status: "paid_preview",
    });

    writeJson(RIDER_EARNINGS_KEY, safeEarnings);
  }
}

function getTodayDeliveredOrders() {
  const today = new Date();

  return dashboardHistory.filter((order) => {
    if (!isDelivered(order)) return false;

    const date = getOrderDate(order);
    if (!date) return false;

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  });
}

function isDelivered(order) {
  return (
    getDeliveryStatus(order) === "delivered" ||
    getOrderStatus(order) === "delivered" ||
    String(order.status || "").toLowerCase() === "delivered"
  );
}

function getOrderDate(order) {
  const value =
    order.deliveredAt ||
    order.delivered_at ||
    order.updatedAt ||
    order.updated_at ||
    order.createdAt ||
    order.created_at ||
    order.date;

  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ================================
   UI HELPERS
================================ */

function getAvailablePanel() {
  const panels = Array.from(document.querySelectorAll(".right-panel .panel"));
  return (
    panels.find((panel) =>
      panel.querySelector(".panel-header h3")?.textContent
        ?.toLowerCase()
        .includes("available")
    ) || null
  );
}

function getRecentPanel() {
  const panels = Array.from(document.querySelectorAll(".right-panel .panel"));
  return (
    panels.find((panel) =>
      panel.querySelector(".panel-header h3")?.textContent
        ?.toLowerCase()
        .includes("recent")
    ) || null
  );
}

function bindSidebarToggle() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  const main = document.querySelector(".main");

  if (menuToggle && sidebar && main) {
    menuToggle.addEventListener("click", () => {
      if (window.innerWidth <= 800) {
        sidebar.classList.toggle("show");
      } else {
        sidebar.classList.toggle("hide");
        main.classList.toggle("full");
      }
    });
  }
}

function bindRefreshButton() {
  document.querySelectorAll(".refresh-btn").forEach((refreshBtn) => {
    if (refreshBtn.dataset.bound === "true") return;
    refreshBtn.dataset.bound = "true";

    refreshBtn.addEventListener("click", async () => {
      refreshBtn.classList.add("loading");

      await loadDashboardData();

      refreshBtn.classList.remove("loading");
      showToast("Rider dashboard refreshed.");
    });
  });
}

function openOrderDetails(order) {
  if (!order) return;

  const normalizedOrder = {
    ...order,
    selectedAt: new Date().toISOString(),
  };

  localStorage.setItem(
    "foodExpressSelectedRiderOrder",
    JSON.stringify(normalizedOrder)
  );

  window.location.href = "rider-deliveries.html";
}

function openGoogleMaps(order) {
  const deliveryStatus = getDeliveryStatus(order);

  const origin =
    deliveryStatus === "assigned"
      ? getPickupAddress(order)
      : getPickupAddress(order);

  const destination =
    deliveryStatus === "assigned"
      ? getPickupAddress(order)
      : getDropoffAddress(order);

  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin
  )}&destination=${encodeURIComponent(destination)}&travelmode=driving`;

  window.open(url, "_blank", "noopener");
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) {
    console.log(`[toast:${type}]`, message);
    return;
  }

  const icon =
    type === "success"
      ? "fa-circle-check"
      : type === "warning"
        ? "fa-circle-exclamation"
        : "fa-circle-info";

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  toast.className = `toast show ${type}`;

  clearTimeout(window.__riderDashboardToastTimer);
  window.__riderDashboardToastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function formatMoney(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatStatusLabel(status) {
  return String(status || "Pending")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatShortTime(date) {
  if (!date) return "Recently";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`[rider-dashboard.js] Could not parse ${key}`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}