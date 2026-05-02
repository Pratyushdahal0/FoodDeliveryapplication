console.log("[rider-deliveries.js] Loaded - backend rider delivery flow fixed");

/* ================================
   STORAGE KEYS
================================ */

const ORDER_STORAGE_KEY = "foodExpressOrders";
const LAST_ORDER_KEY = "lastOrder";
const ORDER_UPDATED_KEY = "foodExpressOrdersUpdatedAt";
const ACTIVE_RIDER_DELIVERY_KEY = "foodExpressActiveRiderDelivery";
const RIDER_HISTORY_KEY = "foodexpress_rider_history";
const RIDER_EARNINGS_KEY = "foodexpress_rider_earnings";

const RIDER_AUTO_REFRESH_INTERVAL = 5000;

let riderAutoRefreshTimer = null;
let isRiderAutoRefreshing = false;

/* ================================
   BACKEND
================================ */

const ORDER_API_URL = "../../backend/controllers/OrderController.php";

let backendAvailableOrders = [];

/* ================================
   MAIN INIT
================================ */

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

  let activeOrder = null;
  async function loadActiveDeliveryFromBackend() {
  const rider = getCurrentRider();

  try {
    const response = await fetch(
      `${ORDER_API_URL}?action=active_delivery&rider_id=${encodeURIComponent(rider.id)}`
    );

    const raw = await response.text();

    let result;
    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("[rider-deliveries.js] Active delivery non-JSON:", raw);
      throw new Error("Backend did not return valid JSON.");
    }

    if (!result.success) {
      throw new Error(result.message || "Could not load active delivery.");
    }

    if (result.data) {
      activeOrder = normalizeOrderForRider(result.data);
      writeJson(ACTIVE_RIDER_DELIVERY_KEY, activeOrder);
    } else {
      activeOrder = null;
      localStorage.removeItem(ACTIVE_RIDER_DELIVERY_KEY);
    }

    return activeOrder;
  } catch (error) {
    console.error("[rider-deliveries.js] Failed to load active delivery:", error);
    activeOrder = readJson(ACTIVE_RIDER_DELIVERY_KEY, null);
    return activeOrder;
  }
}
  let activeFilter = "All";

  const activeBox = document.getElementById("activeDelivery");
  const availableBox = document.getElementById("availableList");
  const availableCount = document.getElementById("availableCount");
  const activeCount = document.getElementById("activeCount");
  const potentialEarnings = document.getElementById("potentialEarnings");
  const toast = document.getElementById("toast");
  const refreshBtn = document.getElementById("refreshOrders");

  const tripSteps = [
    { key: "assigned", label: "Accepted" },
    { key: "ready_for_pickup", label: "Food Ready" },
    { key: "picked_up", label: "Picked Up" },
    { key: "on_the_way", label: "On the Way" },
    { key: "delivered", label: "Delivered" },
  ];

  /* ================================
     BASIC HELPERS
  ================================ */

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`[rider-deliveries.js] Could not parse ${key}`, error);
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
    if (!toast) {
      console.log(`[toast:${type}]`, message);
      return;
    }

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
    }, 2600);
  }

  function safeCssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(String(value));
    }

    return String(value).replace(/"/g, '\\"');
  }

  /* ================================
     BACKEND ORDER LOADING
  ================================ */

  async function loadAvailableDeliveriesFromBackend() {
    try {
      const response = await fetch(`${ORDER_API_URL}?action=available_deliveries`);
      const raw = await response.text();

      let result;

      try {
        result = JSON.parse(raw);
      } catch (error) {
        console.error("[rider-deliveries.js] Non-JSON backend response:", raw);
        throw new Error("Backend did not return valid JSON.");
      }

      if (!result.success) {
        throw new Error(result.message || "Could not load available deliveries.");
      }

      backendAvailableOrders = Array.isArray(result.data)
        ? result.data.map(normalizeBackendOrder)
        : [];

      console.log("[rider-deliveries.js] Backend available deliveries:", {
        count: backendAvailableOrders.length,
        orders: backendAvailableOrders,
      });

      return backendAvailableOrders;
    } catch (error) {
      console.error("[rider-deliveries.js] Failed to load deliveries:", error);
      backendAvailableOrders = [];
      showToast("Could not load delivery requests.", "error");
      return [];
    }
  }

  function normalizeBackendOrder(order) {
    return {
      ...order,

      id: order.id || order.orderId || order.order_id,
      orderId: order.orderId || order.order_id || order.id,
      order_id: order.order_id || order.orderId || order.id,

      orderNumber:
        order.orderNumber || order.order_number || order.orderNo || order.id,
      order_number:
        order.order_number || order.orderNumber || order.orderNo || order.id,

      restaurantId: order.restaurantId || order.restaurant_id || "",
      restaurant_id: order.restaurant_id || order.restaurantId || "",

      restaurantName:
        order.restaurantName ||
        order.restaurant_name ||
        order.restaurant ||
        "Restaurant",

      restaurant_name:
        order.restaurant_name ||
        order.restaurantName ||
        order.restaurant ||
        "Restaurant",

      restaurantAddress:
        order.restaurantAddress ||
        order.restaurant_address ||
        order.pickup ||
        "",

      restaurant_address:
        order.restaurant_address ||
        order.restaurantAddress ||
        order.pickup ||
        "",

      customerName:
        order.customerName ||
        order.customer_name ||
        order.fullName ||
        order.name ||
        "Customer",

      customer_name:
        order.customer_name ||
        order.customerName ||
        order.fullName ||
        order.name ||
        "Customer",

      customerEmail: order.customerEmail || order.customer_email || "",
      customer_email: order.customer_email || order.customerEmail || "",

      phoneNumber: order.phoneNumber || order.phone_number || order.phone || "",
      phone_number: order.phone_number || order.phoneNumber || order.phone || "",

      postalCode: order.postalCode || order.postal_code || "",
      postal_code: order.postal_code || order.postalCode || "",

      paymentMethod: order.paymentMethod || order.payment_method || "cash",
      payment_method: order.payment_method || order.paymentMethod || "cash",

      deliveryFee: order.deliveryFee || order.delivery_fee || 0,
      delivery_fee: order.delivery_fee || order.deliveryFee || 0,

      deliveryStatus:
        order.deliveryStatus || order.delivery_status || "searching",

      delivery_status:
        order.delivery_status || order.deliveryStatus || "searching",

      riderId: order.riderId || order.rider_id || null,
      rider_id: order.rider_id || order.riderId || null,

      riderName: order.riderName || order.rider_name || null,
      rider_name: order.rider_name || order.riderName || null,

      createdAt: order.createdAt || order.created_at || "",
      created_at: order.created_at || order.createdAt || "",

      updatedAt: order.updatedAt || order.updated_at || "",
      updated_at: order.updated_at || order.updatedAt || "",

      total: Number(order.total || 0),
      subtotal: Number(order.subtotal || 0),
      tax: Number(order.tax || 0),

      items: Array.isArray(order.items) ? order.items : [],
    };
  }

  function getAllOrders() {
    const localOrders = readJson(ORDER_STORAGE_KEY, []);
    const safeLocalOrders = Array.isArray(localOrders) ? localOrders : [];
    const safeBackendOrders = Array.isArray(backendAvailableOrders)
      ? backendAvailableOrders
      : [];

    const merged = [...safeBackendOrders];

    safeLocalOrders.forEach((localOrder) => {
      const exists = merged.some((backendOrder) => {
        const backendId =
          backendOrder.id || backendOrder.orderId || backendOrder.order_id;
        const localId = localOrder.id || localOrder.orderId || localOrder.order_id;

        const backendNumber =
          backendOrder.orderNumber || backendOrder.order_number || "";
        const localNumber =
          localOrder.orderNumber || localOrder.order_number || "";

        return (
          String(backendId) === String(localId) ||
          String(backendNumber) === String(localNumber)
        );
      });

      if (!exists) {
        merged.push(normalizeBackendOrder(localOrder));
      }
    });

    return merged;
  }

  function saveAllOrders(orders) {
    const safeOrders = Array.isArray(orders) ? orders : [];

    backendAvailableOrders = safeOrders.map(normalizeBackendOrder);

    writeJson(ORDER_STORAGE_KEY, backendAvailableOrders);
    localStorage.setItem(ORDER_UPDATED_KEY, String(Date.now()));
  }

  /* ================================
     RIDER INFO
  ================================ */

  function getCurrentRider() {
  /*
    Important:
    Do NOT use foodExpressCurrentUser/currentUser here.
    Those can be customer or restaurant owner accounts, which caused:
    "Spicy Grill Owner is your rider..."

    Rider pages should only use rider-specific localStorage/profile data.
  */

  const storedRider =
    readJson("foodExpressCurrentRider", null) ||
    readJson("foodExpressRiderProfile", null) ||
    readJson("riderProfile", null) ||
    {};

  const fallbackName =
    localStorage.getItem("riderName") ||
    localStorage.getItem("foodExpressRiderName") ||
    storedRider.name ||
    storedRider.fullName ||
    storedRider.full_name ||
    storedRider.riderName ||
    storedRider.rider_name ||
    "";

  const fallbackEmail =
    localStorage.getItem("riderEmail") ||
    localStorage.getItem("foodExpressRiderEmail") ||
    storedRider.email ||
    storedRider.riderEmail ||
    storedRider.rider_email ||
    "";

  const fallbackPhone =
    localStorage.getItem("riderPhone") ||
    localStorage.getItem("foodExpressRiderPhone") ||
    storedRider.phone ||
    storedRider.phoneNumber ||
    storedRider.phone_number ||
    storedRider.riderPhone ||
    storedRider.rider_phone ||
    "";

  const fallbackId =
    storedRider.id ||
    storedRider.rider_id ||
    localStorage.getItem("riderUserId") ||
    localStorage.getItem("foodExpressRiderId") ||
    1;

  const riderName = String(fallbackName || "").trim();
  const riderEmail = String(fallbackEmail || "").trim();
  const riderPhone = String(fallbackPhone || "").trim();

  return {
    id: Number(fallbackId || 1),

    name:
      riderName && !/owner/i.test(riderName)
        ? riderName
        : "FoodExpress Rider",

    email:
      riderEmail && !/owner/i.test(riderEmail)
        ? riderEmail
        : "rider@foodexpress.local",

    phone: riderPhone,
  };
}

  /* ================================
     ORDER NORMALIZATION HELPERS
  ================================ */

  function getOrderId(order) {
    return String(
      order.id ||
        order.orderId ||
        order.order_id ||
        order.orderNumber ||
        order.order_number ||
        ""
    );
  }

  function getBackendOrderId(order) {
    return order.orderId || order.order_id || order.id || "";
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

    if (total <= 0) return 75;

    const earning = Math.round(total * 0.08 + 70);

    return Math.max(75, earning);
  }

  function calculateDistanceLabel(order) {
    return order.distance || "2.5 km";
  }

  function calculateEtaLabel(order) {
    return order.eta || "20 mins";
  }

  function getDeliveryStatus(order) {
    const raw =
      order.deliveryStatus ||
      order.delivery_status ||
      order.delivery_status_name ||
      "";

    return String(raw || "searching").toLowerCase().trim();
  }

  function getOrderStatus(order) {
    return String(order.status || "pending").toLowerCase().trim();
  }

  function normalizeOrderForRider(order) {
    const normalizedBase = normalizeBackendOrder(order);

    const id = getOrderId(normalizedBase);
    const orderNumber = getOrderNumber(normalizedBase);
    const deliveryStatus = getDeliveryStatus(normalizedBase);
    const orderStatus = getOrderStatus(normalizedBase);

    let readyLabel = "Looking for rider";
    let type = "Searching";
    let icon = "fa-magnifying-glass-location";

    if (orderStatus === "ready_for_pickup" && deliveryStatus === "searching") {
      readyLabel = "Ready for pickup";
      type = "Ready";
      icon = "fa-bag-shopping";
    }

    if (deliveryStatus === "assigned") {
      readyLabel = "Accepted";
      type = "Active";
      icon = "fa-clock";
    }

    if (deliveryStatus === "assigned" && orderStatus === "ready_for_pickup") {
      readyLabel = "Ready for pickup";
      type = "Active";
      icon = "fa-bag-shopping";
    }

    if (deliveryStatus === "picked_up") {
      readyLabel = "Picked up";
      type = "Active";
      icon = "fa-motorcycle";
    }

    if (deliveryStatus === "on_the_way") {
      readyLabel = "On the way";
      type = "Active";
      icon = "fa-route";
    }

    if (deliveryStatus === "delivered" || orderStatus === "delivered") {
      readyLabel = "Delivered";
      type = "Completed";
      icon = "fa-circle-check";
    }

    return {
      ...normalizedBase,

      riderTaskId: id,
      id,
      orderId: getBackendOrderId(normalizedBase),
      order_id: getBackendOrderId(normalizedBase),

      orderNumber,
      order_number: orderNumber,

      restaurant: getRestaurantName(normalizedBase),
      customer: getCustomerName(normalizedBase),
      phone: getCustomerPhone(normalizedBase),

      pickup: getPickupAddress(normalizedBase),
      dropoff: getDropoffAddress(normalizedBase),

      itemsSummary: getItemsSummary(normalizedBase),
      earning: estimateEarning(normalizedBase),
      distance: calculateDistanceLabel(normalizedBase),
      eta: calculateEtaLabel(normalizedBase),
      image: getOrderImage(normalizedBase),

      orderStatus,
      deliveryStatus,
      ready: readyLabel,
      type,
      icon,
    };
  }

  /* ================================
     ORDER LISTING
  ================================ */

  function getAvailableDeliveryOrders() {
    const orders = getAllOrders();

    return orders
      .filter((order) => {
        const orderStatus = getOrderStatus(order);
        const deliveryStatus = getDeliveryStatus(order);

        const isRestaurantReady = orderStatus === "ready_for_pickup";

        const isNotAssignedYet =
          !deliveryStatus ||
          deliveryStatus === "searching" ||
          deliveryStatus === "unassigned" ||
          deliveryStatus === "pending";

        return (
          isRestaurantReady &&
          isNotAssignedYet &&
          orderStatus !== "cancelled" &&
          orderStatus !== "delivered"
        );
      })
      .map(normalizeOrderForRider);
  }

  function getFilteredOrders() {
    const availableOrders = getAvailableDeliveryOrders();

    const withoutActive = activeOrder
      ? availableOrders.filter(
          (order) =>
            String(order.id) !== String(activeOrder.id) &&
            String(order.orderNumber) !== String(activeOrder.orderNumber)
        )
      : availableOrders;

    if (activeFilter === "All") return withoutActive;

    return withoutActive.filter((order) => order.type === activeFilter);
  }

  function updateStats() {
    const availableOrders = getFilteredOrders();

    const totalPotential = availableOrders.reduce(
      (sum, order) => sum + Number(order.earning || 0),
      0
    );

    if (availableCount) availableCount.innerText = availableOrders.length;
    if (activeCount) activeCount.innerText = activeOrder ? "1" : "0";

    if (potentialEarnings) {
      potentialEarnings.innerText = formatMoney(totalPotential);
    }
  }

  function renderAvailable() {
    if (!availableBox) return;

    const orders = getFilteredOrders();

    if (!orders.length) {
      availableBox.innerHTML = `
        <div class="empty-orders">
          <div>
            <i class="fa-solid fa-magnifying-glass-location"></i>
            <h3>No rider requests right now</h3>
            <p>Orders marked ready for pickup by restaurants will appear here.</p>
            <button class="empty-refresh-btn" id="emptyRefreshBtn">
              <i class="fa-solid fa-rotate-right"></i>
              Refresh Orders
            </button>
          </div>
        </div>
      `;

      document
        .getElementById("emptyRefreshBtn")
        ?.addEventListener("click", refreshOrders);

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
                <p>${escapeHtml(order.orderNumber)} • ${escapeHtml(
                  order.customer
                )}</p>
              </div>

              <strong class="pay-badge">${formatMoney(order.earning)}</strong>
            </div>

            <div class="expire-badge">
              <i class="fa-regular fa-clock"></i>
              ${escapeHtml(order.ready)}
            </div>

            <div class="delivery-meta">
              <span>
                <i class="fa-solid fa-route"></i>
                ${escapeHtml(order.distance)}
              </span>

              <span>
                <i class="fa-regular fa-clock"></i>
                ${escapeHtml(order.eta)}
              </span>

              <span>
                <i class="fa-solid fa-bag-shopping"></i>
                ${escapeHtml(order.itemsSummary)}
              </span>
            </div>

            <div class="delivery-actions">
              <button class="accept-btn" data-id="${escapeHtml(order.id)}">
                Accept Delivery
              </button>

              <button class="decline-btn" data-id="${escapeHtml(order.id)}">
                Decline
              </button>
            </div>
          </article>
        `
      )
      .join("");

    document.querySelectorAll(".delivery-card").forEach((card) => {
      card.addEventListener("click", () => {
        const order = orders.find(
          (item) => String(item.id) === String(card.dataset.id)
        );

        if (order) openDrawer(order);
      });
    });

    document.querySelectorAll(".accept-btn").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        acceptOrder(btn.dataset.id);
      });
    });

    document.querySelectorAll(".decline-btn").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        declineOrder(btn.dataset.id);
      });
    });

    updateStats();
  }

  /* ================================
     ACTIVE DELIVERY
  ================================ */

  function getStepIndexFromOrder(order) {
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

  function getNextActionLabel() {
    if (!activeOrder) return "Accept Delivery";

    const deliveryStatus = getDeliveryStatus(activeOrder);
    const orderStatus = getOrderStatus(activeOrder);

    if (deliveryStatus === "assigned" && orderStatus !== "ready_for_pickup") {
      return "Waiting for Restaurant";
    }

    if (deliveryStatus === "assigned" && orderStatus === "ready_for_pickup") {
      return "Pick Up Order";
    }

    if (deliveryStatus === "picked_up") return "Start Delivery";
    if (deliveryStatus === "on_the_way") return "Mark as Delivered";

    return "Delivery Completed";
  }

  function getNextDeliveryStatus() {
    const deliveryStatus = getDeliveryStatus(activeOrder);

    if (deliveryStatus === "assigned") return "picked_up";
    if (deliveryStatus === "picked_up") return "on_the_way";
    if (deliveryStatus === "on_the_way") return "delivered";

    return "delivered";
  }

  function shouldDisableNextStep() {
    if (!activeOrder) return true;

    const deliveryStatus = getDeliveryStatus(activeOrder);
    const orderStatus = getOrderStatus(activeOrder);

    if (deliveryStatus === "delivered" || orderStatus === "delivered") {
      return true;
    }

    if (deliveryStatus === "assigned" && orderStatus !== "ready_for_pickup") {
      return true;
    }

    return false;
  }

  function renderActive() {
    if (!activeBox) return;

    if (!activeOrder) {
      activeBox.innerHTML = `
        <div class="empty-active">
          <div>
            <i class="fa-solid fa-box-open"></i>
            <h3>No active delivery</h3>
            <p>Accept a delivery request to start your next trip.</p>
          </div>
        </div>
      `;

      updateStats();
      return;
    }

    activeOrder = normalizeOrderForRider(activeOrder);

    const currentStep = getStepIndexFromOrder(activeOrder);
    const actionLabel = getNextActionLabel();
    const disabled = shouldDisableNextStep();

    activeBox.innerHTML = `
      <div class="active-top">
        <div>
          <h3>Active Delivery</h3>
          <span class="order-pill">
            ${escapeHtml(activeOrder.orderNumber)} • ${escapeHtml(
              activeOrder.restaurant
            )}
          </span>
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
                  ${
                    index <= currentStep
                      ? `<i class="fa-solid fa-check"></i>`
                      : ""
                  }
                </span>
                ${escapeHtml(step.label)}
              </div>
            `
          )
          .join("")}
      </div>

      ${
        getDeliveryStatus(activeOrder) === "assigned" &&
        getOrderStatus(activeOrder) !== "ready_for_pickup"
          ? `
            <div class="rider-waiting-note" style="margin:16px 0;padding:14px 16px;border-radius:16px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-weight:700;">
              <i class="fa-solid fa-clock"></i>
              Restaurant is still preparing this order. You can pick it up once it is marked ready.
            </div>
          `
          : ""
      }

      <div class="trip-actions">
        <button class="primary-btn" id="nextStepBtn" ${disabled ? "disabled" : ""}>
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

  /* ================================
     BACKEND ACTIONS
  ================================ */

  async function assignRiderBackend(order) {
    const backendOrderId = getBackendOrderId(order);
    const rider = getCurrentRider();

    if (!backendOrderId) {
      throw new Error("This order does not have a backend order ID.");
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
      console.error("[rider-deliveries.js] Raw assign rider response:", raw);
      throw new Error("Server did not return valid JSON.");
    }

    if (!result.success) {
      throw new Error(result.message || "Failed to assign rider.");
    }

    return result;
  }

  async function updateBackendDeliveryStatus(order, nextDeliveryStatus) {
    const backendOrderId = getBackendOrderId(order);

    if (!backendOrderId) {
      throw new Error("This order does not have a backend order ID.");
    }

    const response = await fetch(`${ORDER_API_URL}?action=update_delivery_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order_id: Number(backendOrderId),
        delivery_status: nextDeliveryStatus,
      }),
    });

    const raw = await response.text();

    let result;

    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("[rider-deliveries.js] Raw delivery response:", raw);
      throw new Error("Server did not return valid JSON.");
    }

    if (!result.success) {
      throw new Error(result.message || "Backend delivery update failed.");
    }

    return result;
  }

  /* ================================
     LOCAL SYNC
  ================================ */

  function updateLocalOrderDelivery(order, deliveryStatus, riderData = null) {
    const orders = getAllOrders();
    const targetId = getOrderId(order);

    let index = orders.findIndex((item) => {
      return (
        String(item.id) === String(targetId) ||
        String(item.orderId) === String(targetId) ||
        String(item.order_id) === String(targetId) ||
        String(item.orderNumber || item.order_number) ===
          String(order.orderNumber || order.order_number)
      );
    });

    if (index === -1) {
      orders.push({ ...order });
      index = orders.length - 1;
    }

    const currentOrder = normalizeBackendOrder(orders[index]);

    currentOrder.deliveryStatus = deliveryStatus;
    currentOrder.delivery_status = deliveryStatus;
    currentOrder.updatedAt = new Date().toISOString();
    currentOrder.updated_at = currentOrder.updatedAt;

    if (deliveryStatus === "picked_up") {
      currentOrder.status = "picked_up";
    }

    if (deliveryStatus === "on_the_way") {
      currentOrder.status = "on_the_way";
    }

    if (deliveryStatus === "delivered") {
      currentOrder.status = "delivered";
    }

    if (riderData) {
      currentOrder.riderId = riderData.id;
      currentOrder.rider_id = riderData.id;
      currentOrder.riderName = riderData.name;
      currentOrder.rider_name = riderData.name;
      currentOrder.riderEmail = riderData.email;
      currentOrder.rider_email = riderData.email;
      currentOrder.riderPhone = riderData.phone;
      currentOrder.rider_phone = riderData.phone;
      currentOrder.riderAssignedAt = new Date().toISOString();
      currentOrder.rider_assigned_at = currentOrder.riderAssignedAt;
    }

    if (!Array.isArray(currentOrder.deliveryHistory)) {
      currentOrder.deliveryHistory = [];
    }

    currentOrder.deliveryHistory.push({
      status: deliveryStatus,
      time: new Date().toISOString(),
    });

    if (!Array.isArray(currentOrder.statusHistory)) {
      currentOrder.statusHistory = [];
    }

    if (["picked_up", "on_the_way", "delivered"].includes(deliveryStatus)) {
      currentOrder.statusHistory.push({
        status: deliveryStatus,
        time: new Date().toISOString(),
      });
    }

    orders[index] = currentOrder;
    saveAllOrders(orders);

    const lastOrder = readJson(LAST_ORDER_KEY, null);

    if (
      lastOrder &&
      (String(lastOrder.id) === String(currentOrder.id) ||
        String(lastOrder.orderId) === String(currentOrder.orderId) ||
        String(lastOrder.order_id) === String(currentOrder.order_id) ||
        String(lastOrder.orderNumber || lastOrder.order_number) ===
          String(currentOrder.orderNumber || currentOrder.order_number))
    ) {
      writeJson(LAST_ORDER_KEY, currentOrder);
    }

    return normalizeOrderForRider(currentOrder);
  }

  function syncActiveOrderFromStorage() {
    if (!activeOrder) return;

    const orders = getAllOrders();
    const targetId = getOrderId(activeOrder);

    const latest = orders.find((item) => {
      return (
        String(item.id) === String(targetId) ||
        String(item.orderId) === String(targetId) ||
        String(item.order_id) === String(targetId) ||
        String(item.orderNumber || item.order_number) ===
          String(activeOrder.orderNumber || activeOrder.order_number)
      );
    });

    if (latest) {
      activeOrder = normalizeOrderForRider(latest);
      writeJson(ACTIVE_RIDER_DELIVERY_KEY, activeOrder);
    }
  }

  function markActiveDelivery(order) {
    const normalized = normalizeOrderForRider(order);
    writeJson(ACTIVE_RIDER_DELIVERY_KEY, normalized);
    activeOrder = normalized;
  }

  function clearActiveDelivery() {
    localStorage.removeItem(ACTIVE_RIDER_DELIVERY_KEY);
    activeOrder = null;
  }

  /* ================================
     RIDER ACTIONS
  ================================ */

  async function acceptOrder(id) {
  await loadActiveDeliveryFromBackend();

  if (activeOrder) {
    showToast("Finish current delivery before accepting another.", "warning");
    renderActive();
    return;
  }

  const order = getFilteredOrders().find(
    (item) => String(item.id) === String(id)
  );

  if (!order) {
    showToast("Order is no longer available.", "warning");
    await refreshOrders();
    return;
  }

  try {
    showToast("Assigning rider...");

    await assignRiderBackend(order);

    await loadActiveDeliveryFromBackend();
    await loadAvailableDeliveriesFromBackend();

    renderActive();
    renderAvailable();
    updateStats();

    showToast(`${order.orderNumber} accepted successfully.`);
  } catch (error) {
    console.error("[rider-deliveries.js] Accept delivery failed:", error);
    showToast(error.message || "Could not accept delivery.", "error");
  }
}


  function declineOrder(id) {
    showToast("Delivery task hidden for now.");

    const card = document.querySelector(
      `.delivery-card[data-id="${safeCssEscape(String(id))}"]`
    );

    if (card) card.remove();

    updateStats();
  }

  async function nextStep() {
  await loadActiveDeliveryFromBackend();

  if (!activeOrder) {
    showToast("No active delivery found.", "warning");
    renderActive();
    return;
  }

  if (shouldDisableNextStep()) {
    showToast("Food is not ready yet. Wait for restaurant confirmation.", "warning");
    return;
  }

  const nextDeliveryStatus = getNextDeliveryStatus();

  if (getDeliveryStatus(activeOrder) === "delivered") {
    showToast("Delivery already completed.");
    return;
  }

  try {
    showToast("Updating delivery status...");

    await updateBackendDeliveryStatus(activeOrder, nextDeliveryStatus);

    if (nextDeliveryStatus === "delivered") {
      saveDeliveredOrderToEarnings(activeOrder);
      saveDeliveredOrderToHistory(activeOrder);
      clearActiveDelivery();
      await loadAvailableDeliveriesFromBackend();

      renderActive();
      renderAvailable();
      updateStats();

      showToast("Delivery completed. Earnings added.");
      return;
    }

    await loadActiveDeliveryFromBackend();
    await loadAvailableDeliveriesFromBackend();

    renderActive();
    renderAvailable();
    updateStats();

    if (nextDeliveryStatus === "picked_up") {
      showToast("Order picked up from restaurant.");
    } else if (nextDeliveryStatus === "on_the_way") {
      showToast("You are now on the way to the customer.");
    }
  } catch (error) {
    console.error("[rider-deliveries.js] Delivery update failed:", error);
    showToast(error.message || "Could not update delivery status.", "error");
  }
}

  
  /* ================================
     MAP + DRAWER
  ================================ */

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

  function createDrawer() {
    if (document.querySelector(".order-drawer")) return;

    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <div class="drawer-overlay" id="drawerOverlay"></div>
        <aside class="order-drawer" id="orderDrawer"></aside>
      `
    );

    document
      .getElementById("drawerOverlay")
      ?.addEventListener("click", closeDrawer);
  }

  function openDrawer(order) {
    if (!order) return;

    order = normalizeOrderForRider(order);

    createDrawer();

    const drawer = document.getElementById("orderDrawer");
    const overlay = document.getElementById("drawerOverlay");

    if (!drawer) return;

    const isActive =
      activeOrder &&
      (String(activeOrder.id) === String(order.id) ||
        String(activeOrder.orderNumber) === String(order.orderNumber));

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
          <i class="fa-solid fa-phone"></i>
          <div>
            <span>Phone</span>
            <strong>${escapeHtml(order.phone)}</strong>
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
          <strong>${escapeHtml(order.deliveryStatus)}</strong>
        </div>
      </div>

      <div class="drawer-actions">
        ${
          isActive
            ? `
              <button class="drawer-primary" id="drawerNextBtn" ${
                shouldDisableNextStep() ? "disabled" : ""
              }>
                ${escapeHtml(getNextActionLabel())}
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
    drawer.classList.add("show");

    document.getElementById("drawerClose")?.addEventListener("click", closeDrawer);

    document.getElementById("drawerAcceptBtn")?.addEventListener("click", () => {
      acceptOrder(order.id);
      closeDrawer();
    });

    document.getElementById("drawerNextBtn")?.addEventListener("click", async () => {
      await nextStep();

      if (activeOrder) {
        openDrawer(activeOrder);
      } else {
        closeDrawer();
      }
    });

    document.getElementById("drawerNavigateBtn")?.addEventListener("click", () => {
      openGoogleMaps(order);
    });
  }

  function closeDrawer() {
    document.getElementById("drawerOverlay")?.classList.remove("show");
    document.getElementById("orderDrawer")?.classList.remove("show");
  }

async function refreshOrders() {
  refreshBtn?.classList.add("loading");
  showToast("Checking for rider requests...");

  await loadActiveDeliveryFromBackend();
  await loadAvailableDeliveriesFromBackend();

  refreshBtn?.classList.remove("loading");

  renderActive();
  renderAvailable();
  updateStats();

  showToast("Rider requests refreshed.");
}

function startRiderAutoRefresh() {
  stopRiderAutoRefresh();

  riderAutoRefreshTimer = setInterval(async () => {
    if (document.hidden) return;
    if (isRiderAutoRefreshing) return;

    try {
      isRiderAutoRefreshing = true;

      await loadActiveDeliveryFromBackend();
      await loadAvailableDeliveriesFromBackend();

      renderActive();
      renderAvailable();
      updateStats();

      console.log("[rider-deliveries.js] Rider auto refreshed");
    } catch (error) {
      console.error("[rider-deliveries.js] Rider auto refresh failed:", error);
    } finally {
      isRiderAutoRefreshing = false;
    }
  }, RIDER_AUTO_REFRESH_INTERVAL);

  console.log("[rider-deliveries.js] Rider auto-refresh started");
}

function stopRiderAutoRefresh() {
  if (riderAutoRefreshTimer) {
    clearInterval(riderAutoRefreshTimer);
    riderAutoRefreshTimer = null;
  }
}

  /* ================================
     HISTORY + EARNINGS
  ================================ */

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

  /* ================================
     EVENTS
  ================================ */

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
      event.key === LAST_ORDER_KEY ||
      event.key === ACTIVE_RIDER_DELIVERY_KEY
    ) {
      activeOrder = readJson(ACTIVE_RIDER_DELIVERY_KEY, null);
      syncActiveOrderFromStorage();
      renderActive();
      renderAvailable();
      updateStats();
    }
  });

  /* ================================
     FIRST LOAD
  ================================ */
Promise.all([
  loadActiveDeliveryFromBackend(),
  loadAvailableDeliveriesFromBackend()
]).then(() => {
  renderActive();
  renderAvailable();
  updateStats();
  startRiderAutoRefresh();
});

window.addEventListener("beforeunload", () => {
  stopRiderAutoRefresh();
});
});