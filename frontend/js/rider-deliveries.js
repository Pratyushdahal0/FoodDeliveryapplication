console.log("Rider deliveries JS loaded - real FoodExpress flow");

/* ================================
   STORAGE KEYS
================================ */
const ORDER_STORAGE_KEY = "foodExpressOrders";
const LAST_ORDER_KEY = "lastOrder";
const ORDER_UPDATED_KEY = "foodExpressOrdersUpdatedAt";
const ACTIVE_RIDER_DELIVERY_KEY = "foodExpressActiveRiderDelivery";
const RIDER_HISTORY_KEY = "foodexpress_rider_history";
const RIDER_EARNINGS_KEY = "foodexpress_rider_earnings";

document.addEventListener("DOMContentLoaded", () => {
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

  let activeOrder = readJson(ACTIVE_RIDER_DELIVERY_KEY, null);
  let activeFilter = "All";

  const activeBox = document.getElementById("activeDelivery");
  const availableBox = document.getElementById("availableList");
  const availableCount = document.getElementById("availableCount");
  const activeCount = document.getElementById("activeCount");
  const potentialEarnings = document.getElementById("potentialEarnings");
  const toast = document.getElementById("toast");
  const refreshBtn = document.getElementById("refreshOrders");

  const tripSteps = [
    { key: "ready_for_pickup", label: "Accepted" },
    { key: "picked_up", label: "Picked Up" },
    { key: "on_the_way", label: "On the Way" },
    { key: "delivered", label: "Delivered" },
  ];

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`Could not parse ${key}`, error);
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

  function formatMoney(amount) {
    return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
  }

  function showToast(message, type = "success") {
    if (!toast) return;

    const span = toast.querySelector("span");
    if (span) {
      span.innerText = message;
    } else {
      toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    }

    toast.classList.add("show");
    toast.classList.toggle("warning", type === "warning");
    toast.classList.toggle("error", type === "error");

    clearTimeout(window.__riderToastTimer);
    window.__riderToastTimer = setTimeout(() => {
      toast.classList.remove("show", "warning", "error");
    }, 2400);
  }

  function getAllOrders() {
    const orders = readJson(ORDER_STORAGE_KEY, []);
    return Array.isArray(orders) ? orders : [];
  }

  function saveAllOrders(orders) {
    writeJson(ORDER_STORAGE_KEY, orders);
    localStorage.setItem(ORDER_UPDATED_KEY, String(Date.now()));
  }

  function getOrderId(order) {
    return String(order.id || order.orderId || order.order_id || order.orderNumber || "");
  }

  function getBackendOrderId(order) {
    return order.id || order.orderId || order.order_id || "";
  }

  function getOrderNumber(order) {
    return order.orderNumber || order.order_number || order.id || "ORDER";
  }

  function getRestaurantName(order) {
    return (
      order.restaurantName ||
      order.restaurant_name ||
      order.restaurant ||
      "Restaurant"
    );
  }

  function getCustomerName(order) {
    return (
      order.customerName ||
      order.customer_name ||
      order.fullName ||
      order.name ||
      "Customer"
    );
  }

  function getCustomerPhone(order) {
    return order.phoneNumber || order.phone_number || order.phone || "No phone";
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

  function getOrderImage(order) {
    if (Array.isArray(order.items) && order.items.length) {
      return (
        order.items[0].image_url ||
        order.items[0].image ||
        "https://via.placeholder.com/400x300?text=FoodExpress"
      );
    }

    return "https://via.placeholder.com/400x300?text=FoodExpress";
  }

  function getItemsSummary(order) {
    if (!Array.isArray(order.items) || !order.items.length) {
      return "Food order";
    }

    return order.items
      .map((item) => {
        const qty = Number(item.quantity || item.qty || 1);
        const name = item.name || item.title || item.product_name || "Food Item";
        return `${qty}x ${name}`;
      })
      .join(", ");
  }

  function estimateEarning(order) {
    const total = Number(order.total || 0);

    if (total <= 0) return 95;

    const earning = Math.round(total * 0.08 + 70);
    return Math.max(75, earning);
  }

  function calculateDistanceLabel(order) {
    return order.distance || "2.5 km";
  }

  function calculateEtaLabel(order) {
    return order.eta || "20 mins";
  }

  function normalizeOrderForRider(order) {
    const id = getOrderId(order);
    const orderNumber = getOrderNumber(order);

    return {
      ...order,
      riderTaskId: id,
      id,
      orderNumber,
      restaurant: getRestaurantName(order),
      customer: getCustomerName(order),
      phone: getCustomerPhone(order),
      pickup: getPickupAddress(order),
      dropoff: getDropoffAddress(order),
      itemsSummary: getItemsSummary(order),
      earning: estimateEarning(order),
      distance: calculateDistanceLabel(order),
      eta: calculateEtaLabel(order),
      image: getOrderImage(order),
      ready: "Ready for pickup",
      type: "Ready",
      icon: "fa-bag-shopping",
    };
  }

  function getAvailableReadyOrders() {
    const orders = getAllOrders();

    return orders
      .filter((order) => String(order.status || "").toLowerCase() === "ready_for_pickup")
      .map(normalizeOrderForRider);
  }

  function getFilteredOrders() {
    const readyOrders = getAvailableReadyOrders();

    if (activeOrder) {
      return readyOrders.filter((order) => String(order.id) !== String(activeOrder.id));
    }

    if (activeFilter === "All") return readyOrders;

    return readyOrders.filter((order) => order.type === activeFilter);
  }

  function updateStats() {
    const availableOrders = getFilteredOrders();
    const totalPotential = availableOrders.reduce(
      (sum, order) => sum + Number(order.earning || 0),
      0
    );

    if (availableCount) availableCount.innerText = availableOrders.length;
    if (activeCount) activeCount.innerText = activeOrder ? "1" : "0";
    if (potentialEarnings) potentialEarnings.innerText = formatMoney(totalPotential);
  }

  function openGoogleMaps(order) {
    if (!order) return;

    const pickup = encodeURIComponent(order.pickup);
    const dropoff = encodeURIComponent(order.dropoff);

    const url = `https://www.google.com/maps/dir/?api=1&origin=${pickup}&destination=${dropoff}&travelmode=driving`;

    window.open(url, "_blank");
  }

  function fakeMap(order) {
    return `
      <div class="fake-map-card">
        <div class="fake-map-header">
          <div>
            <h4>Route Preview</h4>
            <p>${escapeHtml(order.pickup)} → ${escapeHtml(order.dropoff)}</p>
          </div>

          <span class="map-badge">
            <i class="fa-solid fa-route"></i>
            ${escapeHtml(order.distance)}
          </span>
        </div>

        <div class="map-route-line">
          <span class="map-pin pickup">
            <i class="fa-solid fa-store"></i>
          </span>

          <span class="map-bike">
            <i class="fa-solid fa-motorcycle"></i>
          </span>

          <span class="map-pin drop">
            <i class="fa-solid fa-location-dot"></i>
          </span>
        </div>
      </div>
    `;
  }

  function getStepIndexFromStatus(status) {
    const index = tripSteps.findIndex((step) => step.key === status);
    return index === -1 ? 0 : index;
  }

  function getActiveStatus() {
    return String(activeOrder?.status || "ready_for_pickup").toLowerCase();
  }

  function getNextActionLabel() {
    const status = getActiveStatus();

    if (status === "ready_for_pickup") return "Pick Up Order";
    if (status === "picked_up") return "Start Delivery";
    if (status === "on_the_way") return "Mark as Delivered";
    return "Delivery Completed";
  }

  function getNextStatus() {
    const status = getActiveStatus();

    if (status === "ready_for_pickup") return "picked_up";
    if (status === "picked_up") return "on_the_way";
    if (status === "on_the_way") return "delivered";
    return "delivered";
  }

  function renderActive() {
    if (!activeBox) return;

    if (!activeOrder) {
      activeBox.innerHTML = `
        <div class="empty-active">
          <div>
            <i class="fa-solid fa-box-open"></i>
            <h3>No active delivery</h3>
            <p>Accept a ready pickup order to start your next trip.</p>
          </div>
        </div>
      `;
      updateStats();
      return;
    }

    activeOrder = normalizeOrderForRider(activeOrder);
    const currentStep = getStepIndexFromStatus(getActiveStatus());
    const actionLabel = getNextActionLabel();
    const isCompleted = getActiveStatus() === "delivered";

    activeBox.innerHTML = `
      <div class="active-top">
        <div>
          <h3>Active Delivery</h3>
          <span class="order-pill">${escapeHtml(activeOrder.orderNumber)} • ${escapeHtml(activeOrder.restaurant)}</span>
        </div>

        <div class="active-earning">
          <span>Trip Earnings</span>
          <strong>${formatMoney(activeOrder.earning)}</strong>
        </div>
      </div>

      ${fakeMap(activeOrder)}

      <div class="route-card">
        <div class="route-point">
          <i class="fa-solid fa-store"></i>
          <div>
            <small>Restaurant</small>
            <strong>${escapeHtml(activeOrder.restaurant)}</strong>
            <p>${escapeHtml(activeOrder.pickup)}</p>
          </div>
        </div>

        <div class="route-bike">
          <i class="fa-solid fa-motorcycle"></i>
          <span>${escapeHtml(activeOrder.distance)}</span>
        </div>

        <div class="route-point right">
          <div>
            <small>Customer</small>
            <strong>${escapeHtml(activeOrder.customer)}</strong>
            <p>${escapeHtml(activeOrder.dropoff)}</p>
          </div>
          <i class="fa-solid fa-user"></i>
        </div>
      </div>

      <div class="progress-steps">
        ${tripSteps
          .map(
            (step, index) => `
              <div class="trip-step ${index <= currentStep ? "done" : ""}">
                <span>
                  ${index <= currentStep ? `<i class="fa-solid fa-check"></i>` : ""}
                </span>
                ${escapeHtml(step.label)}
              </div>
            `
          )
          .join("")}
      </div>

      <div class="trip-actions">
        <button class="primary-btn" id="nextStepBtn" ${isCompleted ? "disabled" : ""}>
          <i class="fa-solid fa-circle-check"></i>
          ${escapeHtml(actionLabel)}
        </button>

        <button class="secondary-btn" id="activeDetailsBtn">
          <i class="fa-solid fa-circle-info"></i>
          Details
        </button>

        <button class="secondary-btn" id="activeNavigateBtn">
          <i class="fa-solid fa-location-arrow"></i>
          Navigate
        </button>
      </div>
    `;

    document.getElementById("nextStepBtn")?.addEventListener("click", nextStep);

    document.getElementById("activeDetailsBtn")?.addEventListener("click", () => {
      openDrawer(activeOrder);
    });

    document.getElementById("activeNavigateBtn")?.addEventListener("click", () => {
      openGoogleMaps(activeOrder);
    });

    updateStats();
  }

  function renderAvailable() {
    if (!availableBox) return;

    const orders = getFilteredOrders();

    if (!orders.length) {
      availableBox.innerHTML = `
        <div class="empty-orders">
          <div>
            <i class="fa-solid fa-magnifying-glass-location"></i>
            <h3>No ready pickup orders</h3>
            <p>Orders marked ready by restaurants will appear here.</p>
            <button class="empty-refresh-btn" id="emptyRefreshBtn">
              <i class="fa-solid fa-rotate-right"></i>
              Refresh Orders
            </button>
          </div>
        </div>
      `;

      document.getElementById("emptyRefreshBtn")?.addEventListener("click", refreshOrders);
      updateStats();
      return;
    }

    availableBox.innerHTML = orders
      .map(
        (order) => `
          <article class="delivery-card" data-id="${escapeHtml(order.id)}">
            <div class="delivery-card-top">
              <div>
                <div class="food-icon">
                  <i class="fa-solid ${escapeHtml(order.icon)}"></i>
                </div>
                <h4>${escapeHtml(order.restaurant)}</h4>
                <p>${escapeHtml(order.orderNumber)} • ${escapeHtml(order.customer)}</p>
              </div>

              <strong class="pay-badge">${formatMoney(order.earning)}</strong>
            </div>

            <div class="expire-badge">
              <i class="fa-regular fa-clock"></i>
              ${escapeHtml(order.ready)}
            </div>

            <div class="delivery-meta">
              <span><i class="fa-solid fa-route"></i> ${escapeHtml(order.distance)}</span>
              <span><i class="fa-regular fa-clock"></i> ${escapeHtml(order.eta)}</span>
              <span><i class="fa-solid fa-bag-shopping"></i> ${escapeHtml(order.itemsSummary)}</span>
            </div>

            <div class="delivery-actions">
              <button class="accept-btn" data-id="${escapeHtml(order.id)}">Accept Delivery</button>
              <button class="decline-btn" data-id="${escapeHtml(order.id)}">Decline</button>
            </div>
          </article>
        `
      )
      .join("");

    document.querySelectorAll(".delivery-card").forEach((card) => {
      card.addEventListener("click", () => {
        const order = orders.find((item) => String(item.id) === String(card.dataset.id));
        if (order) openDrawer(order);
      });
    });

    document.querySelectorAll(".accept-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        acceptOrder(btn.dataset.id);
      });
    });

    document.querySelectorAll(".decline-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        declineOrder(btn.dataset.id);
      });
    });

    updateStats();
  }

  async function updateBackendOrderStatus(order, nextStatus) {
    const backendOrderId = getBackendOrderId(order);

    if (!backendOrderId) {
      throw new Error("This order does not have a backend order ID. Place a fresh order and try again.");
    }

    const response = await fetch(
      "../../backend/controllers/OrderController.php?action=update_status",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: backendOrderId,
          status: nextStatus,
        }),
      }
    );

    const raw = await response.text();

    let result;
    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("Raw update status response:", raw);
      throw new Error("Server did not return valid JSON.");
    }

    if (!result.success) {
      throw new Error(result.message || "Backend status update failed.");
    }

    return result;
  }

  function updateLocalOrderStatus(order, nextStatus) {
    const orders = getAllOrders();
    const targetId = getOrderId(order);

    const index = orders.findIndex((item) => {
      return (
        String(item.id) === String(targetId) ||
        String(item.orderId) === String(targetId) ||
        String(item.order_id) === String(targetId) ||
        String(item.orderNumber) === String(order.orderNumber)
      );
    });

    if (index === -1) {
      throw new Error("Could not find this order in local order history.");
    }

    const currentOrder = orders[index];

    currentOrder.status = nextStatus;
    currentOrder.updatedAt = new Date().toISOString();

    if (!Array.isArray(currentOrder.statusHistory)) {
      currentOrder.statusHistory = [];
    }

    currentOrder.statusHistory.push({
      status: nextStatus,
      time: new Date().toISOString(),
    });

    orders[index] = currentOrder;
    saveAllOrders(orders);

    const lastOrder = readJson(LAST_ORDER_KEY, null);
    if (
      lastOrder &&
      (String(lastOrder.id) === String(currentOrder.id) ||
        String(lastOrder.orderId) === String(currentOrder.orderId) ||
        String(lastOrder.order_id) === String(currentOrder.order_id) ||
        String(lastOrder.orderNumber) === String(currentOrder.orderNumber))
    ) {
      writeJson(LAST_ORDER_KEY, currentOrder);
    }

    return normalizeOrderForRider(currentOrder);
  }

  function markActiveDelivery(order) {
    writeJson(ACTIVE_RIDER_DELIVERY_KEY, order);
    activeOrder = order;
  }

  function clearActiveDelivery() {
    localStorage.removeItem(ACTIVE_RIDER_DELIVERY_KEY);
    activeOrder = null;
  }

  async function acceptOrder(id) {
    if (activeOrder) {
      showToast("Finish current delivery before accepting another.", "warning");
      return;
    }

    const order = getFilteredOrders().find((item) => String(item.id) === String(id));

    if (!order) {
      showToast("Order is no longer available.", "warning");
      renderAvailable();
      return;
    }

    markActiveDelivery(order);
    renderActive();
    renderAvailable();

    showToast(`${order.orderNumber} accepted. Pick it up from ${order.restaurant}.`);
  }

  function declineOrder(id) {
    showToast("Delivery task hidden for now.");

    const card = document.querySelector(`.delivery-card[data-id="${CSS.escape(String(id))}"]`);
    if (card) {
      card.remove();
    }

    updateStats();
  }

  async function nextStep() {
    if (!activeOrder) return;

    const nextStatus = getNextStatus();

    if (getActiveStatus() === "delivered") {
      showToast("Delivery already completed.");
      return;
    }

    try {
      showToast("Updating delivery status...");

      await updateBackendOrderStatus(activeOrder, nextStatus);

      const updatedOrder = updateLocalOrderStatus(activeOrder, nextStatus);
      markActiveDelivery(updatedOrder);

      if (nextStatus === "picked_up") {
        showToast("Order picked up from restaurant.");
      } else if (nextStatus === "on_the_way") {
        showToast("You are now on the way to the customer.");
      } else if (nextStatus === "delivered") {
        saveDeliveredOrderToEarnings(updatedOrder);
        saveDeliveredOrderToHistory(updatedOrder);
        clearActiveDelivery();
        showToast("Delivery completed. Earnings added.");
      }

      renderActive();
      renderAvailable();
      updateStats();
    } catch (error) {
      console.error("Delivery status update failed:", error);
      showToast(error.message || "Could not update delivery status.", "error");
    }
  }

  function createDrawer() {
    if (document.querySelector(".order-drawer")) return;

    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <div class="drawer-overlay" id="drawerOverlay"></div>
        <aside class="order-drawer" id="orderDrawer"></aside>
      `
    );

    document.getElementById("drawerOverlay")?.addEventListener("click", closeDrawer);
  }

  function openDrawer(order) {
    if (!order) return;

    order = normalizeOrderForRider(order);

    createDrawer();

    const drawer = document.getElementById("orderDrawer");
    const overlay = document.getElementById("drawerOverlay");
    const isActive = activeOrder && String(activeOrder.id) === String(order.id);

    drawer.innerHTML = `
      <div class="drawer-head">
        <div>
          <h3>${escapeHtml(order.restaurant)}</h3>
          <p>${escapeHtml(order.orderNumber)} • ${escapeHtml(order.customer)}</p>
        </div>

        <button class="drawer-close" id="drawerClose">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="drawer-map">
        ${fakeMap(order)}
      </div>

      <div class="drawer-section">
        <h4>Order Details</h4>

        <div class="drawer-info-row">
          <i class="fa-solid fa-store"></i>
          <div>
            <span>Pickup</span>
            <strong>${escapeHtml(order.restaurant)}, ${escapeHtml(order.pickup)}</strong>
          </div>
        </div>

        <div class="drawer-info-row">
          <i class="fa-solid fa-user"></i>
          <div>
            <span>Customer</span>
            <strong>${escapeHtml(order.customer)}, ${escapeHtml(order.dropoff)}</strong>
          </div>
        </div>

        <div class="drawer-info-row">
          <i class="fa-solid fa-bag-shopping"></i>
          <div>
            <span>Items</span>
            <strong>${escapeHtml(order.itemsSummary)}</strong>
          </div>
        </div>
      </div>

      <div class="drawer-stats">
        <div class="drawer-stat">
          <span>Earnings</span>
          <strong>${formatMoney(order.earning)}</strong>
        </div>

        <div class="drawer-stat">
          <span>Distance</span>
          <strong>${escapeHtml(order.distance)}</strong>
        </div>

        <div class="drawer-stat">
          <span>ETA</span>
          <strong>${escapeHtml(order.eta)}</strong>
        </div>

        <div class="drawer-stat">
          <span>Status</span>
          <strong>${escapeHtml(getActiveStatus())}</strong>
        </div>
      </div>

      <div class="drawer-actions">
        ${
          isActive
            ? `
              <button class="drawer-primary" id="drawerNextBtn">
                Update Status
              </button>
            `
            : `
              <button class="drawer-primary" id="drawerAcceptBtn">
                Accept Delivery
              </button>
            `
        }

        <button class="drawer-secondary" id="drawerNavigateBtn">
          Navigate
        </button>
      </div>
    `;

    overlay?.classList.add("show");
    drawer?.classList.add("show");

    document.getElementById("drawerClose")?.addEventListener("click", closeDrawer);

    document.getElementById("drawerAcceptBtn")?.addEventListener("click", () => {
      acceptOrder(order.id);
      closeDrawer();
    });

    document.getElementById("drawerNextBtn")?.addEventListener("click", async () => {
      await nextStep();
      if (activeOrder) openDrawer(activeOrder);
      else closeDrawer();
    });

    document.getElementById("drawerNavigateBtn")?.addEventListener("click", () => {
      openGoogleMaps(order);
    });
  }

  function closeDrawer() {
    document.getElementById("drawerOverlay")?.classList.remove("show");
    document.getElementById("orderDrawer")?.classList.remove("show");
  }

  function refreshOrders() {
    refreshBtn?.classList.add("loading");
    showToast("Checking for ready pickup orders...");

    setTimeout(() => {
      refreshBtn?.classList.remove("loading");
      renderAvailable();
      updateStats();
      showToast("Ready pickup orders refreshed.");
    }, 700);
  }

  function saveDeliveredOrderToEarnings(order) {
    if (!order) return;

    const defaultData = {
      todayEarnings: 0,
      weekEarnings: 0,
      availableBalance: 0,
      pendingPayout: 0,
      totalDeliveries: 0,
      weeklyTarget: 40,
      onlineHours: "5h 20m",
      completionRate: 94,
      breakdown: {
        basePay: 0,
        distancePay: 0,
        bonus: 0,
        tips: 0,
        deductions: 0,
      },
      chart: [
        { day: "Mon", amount: 0 },
        { day: "Tue", amount: 0 },
        { day: "Wed", amount: 0 },
        { day: "Thu", amount: 0 },
        { day: "Fri", amount: 0 },
        { day: "Sat", amount: 0 },
        { day: "Sun", amount: 0 },
      ],
      transactions: [],
    };

    const data = readJson(RIDER_EARNINGS_KEY, defaultData);
    const earning = Number(order.earning) || 0;

    data.todayEarnings += earning;
    data.weekEarnings += earning;
    data.availableBalance += earning;
    data.totalDeliveries += 1;

    data.breakdown.basePay += Math.round(earning * 0.55);
    data.breakdown.distancePay += Math.round(earning * 0.3);
    data.breakdown.tips += Math.round(earning * 0.15);

    data.transactions.unshift({
      title: `Order ${order.orderNumber || order.id} Delivered`,
      date: new Date().toLocaleString("en-NP", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      amount: earning,
      type: "earning",
      status: "Completed",
    });

    const todayIndex = new Date().getDay() - 1;
    const fixedIndex = todayIndex < 0 ? 6 : todayIndex;

    if (data.chart[fixedIndex]) {
      data.chart[fixedIndex].amount += earning;
    }

    writeJson(RIDER_EARNINGS_KEY, data);
  }

  function saveDeliveredOrderToHistory(order) {
    if (!order) return;

    const history = readJson(RIDER_HISTORY_KEY, []);

    history.unshift({
      id: order.orderNumber || order.id,
      restaurant: order.restaurant,
      icon: order.icon || "fa-bag-shopping",
      customer: order.customer,
      pickup: order.pickup,
      dropoff: order.dropoff,
      earning: order.earning,
      distance: order.distance,
      eta: order.eta,
      status: "Delivered",
      date: new Date().toLocaleString("en-NP", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      rawDate: new Date().toISOString(),
    });

    writeJson(RIDER_HISTORY_KEY, history);
  }

  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((item) => {
        item.classList.remove("active");
      });

      chip.classList.add("active");
      activeFilter = chip.innerText.trim();
      renderAvailable();
    });
  });

  refreshBtn?.addEventListener("click", refreshOrders);

  window.addEventListener("storage", (event) => {
    if (
      event.key === ORDER_STORAGE_KEY ||
      event.key === ORDER_UPDATED_KEY ||
      event.key === LAST_ORDER_KEY
    ) {
      activeOrder = readJson(ACTIVE_RIDER_DELIVERY_KEY, null);
      renderActive();
      renderAvailable();
      updateStats();
    }
  });

  renderActive();
  renderAvailable();
  updateStats();
});