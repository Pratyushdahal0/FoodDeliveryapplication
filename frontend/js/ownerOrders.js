console.log("[ownerOrders.js] Loaded - backend owner orders with owner-side view modal fixed");

const OWNER_ORDER_API = "../../backend/controllers/OrderController.php";
const OWNER_ORDERS_POLL_INTERVAL = 5000;

const statusBadgeMap = {
  pending: { label: "Pending", css: "badge-pending" },
  confirmed: { label: "Confirmed", css: "badge-accepted" },
  preparing: { label: "Preparing", css: "badge-accepted" },
  ready_for_pickup: { label: "Ready for Pickup", css: "badge-accepted" },
  picked_up: { label: "Picked Up", css: "badge-accepted" },
  on_the_way: { label: "On The Way", css: "badge-accepted" },
  delivered: { label: "Delivered", css: "badge-delivered" },
  cancelled: { label: "Cancelled", css: "badge-cancelled" },
};

let ownerOrdersCache = [];
let ownerOrdersRefreshTimer = null;
let isOwnerOrdersLoading = false;
let isOwnerOrderUpdating = false;

/* ===============================
   INIT
================================ */

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof requireOwnerAuth === "function") {
    if (!requireOwnerAuth()) return;
  }

  initializeOrderSearch();
  renderOwnerName();
  setupOwnerRefreshButton();
  ensureOwnerOrderModal();

  await loadOwnerOrdersFromBackend();

  startOwnerOrdersAutoRefresh();

  window.addEventListener("storage", (event) => {
    if (
      event.key === "ownerRestaurantId" ||
      event.key === "ownerRestaurantName" ||
      event.key === "foodExpressCurrentOwner"
    ) {
      loadOwnerOrdersFromBackend();
    }
  });

  window.addEventListener("beforeunload", () => {
    stopOwnerOrdersAutoRefresh();
  });
});

/* ===============================
   OWNER INFO
================================ */

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function getCurrentOwnerRestaurant() {
  const owner = readJson("foodExpressCurrentOwner", {});
  const currentUser = readJson("foodExpressCurrentUser", {});

  const restaurantId =
    localStorage.getItem("ownerRestaurantId") ||
    owner.restaurantId ||
    owner.restaurant_id ||
    currentUser.restaurantId ||
    currentUser.restaurant_id ||
    "1";

  const restaurantName =
    localStorage.getItem("ownerRestaurantName") ||
    owner.restaurantName ||
    owner.restaurant_name ||
    currentUser.restaurantName ||
    currentUser.restaurant_name ||
    "Spicy Grill";

  return {
    restaurantId: String(restaurantId || "1"),
    restaurantName: String(restaurantName || "Spicy Grill"),
  };
}

function renderOwnerName() {
  const { restaurantName } = getCurrentOwnerRestaurant();
  const displayName = restaurantName || "Restaurant";

  document.querySelectorAll(".sidebar-profile .name").forEach((el) => {
    el.textContent = displayName;
  });

  document.querySelectorAll(".sidebar-profile .avatar").forEach((el) => {
    el.textContent = displayName.charAt(0).toUpperCase();
  });
}

/* ===============================
   BACKEND LOAD + AUTO REFRESH
================================ */

async function loadOwnerOrdersFromBackend(options = {}) {
  const { silent = false, force = false } = options;

  if (isOwnerOrdersLoading && !force) return;
  if (isOwnerOrderUpdating && !force) return;

  try {
    isOwnerOrdersLoading = true;

    const response = await fetch(
      `${OWNER_ORDER_API}?action=all&limit=100&_=${Date.now()}`
    );

    const raw = await response.text();

    let result;
    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("[ownerOrders.js] Non-JSON response:", raw);
      throw new Error("Order backend did not return valid JSON.");
    }

    if (!result.success) {
      throw new Error(result.message || "Failed to load orders.");
    }

    const allOrders = Array.isArray(result.data) ? result.data : [];
    const ownerRestaurant = getCurrentOwnerRestaurant();

    ownerOrdersCache = filterOrdersForCurrentRestaurant(
      allOrders.map(normalizeBackendOrder),
      ownerRestaurant
    );

    renderOwnerOrders();

    if (!silent) {
      console.log("[ownerOrders.js] Orders loaded:", ownerOrdersCache.length);
    }
  } catch (error) {
    console.error("[ownerOrders.js] Failed to load backend orders:", error);

    if (!silent) {
      renderErrorState(error.message);
    }
  } finally {
    isOwnerOrdersLoading = false;
  }
}

function startOwnerOrdersAutoRefresh() {
  stopOwnerOrdersAutoRefresh();

  ownerOrdersRefreshTimer = setInterval(() => {
    if (document.hidden) return;
    if (isOwnerOrderUpdating) return;

    loadOwnerOrdersFromBackend({ silent: true });
  }, OWNER_ORDERS_POLL_INTERVAL);

  console.log("[ownerOrders.js] Auto-refresh started every 5 seconds");
}

function stopOwnerOrdersAutoRefresh() {
  if (ownerOrdersRefreshTimer) {
    clearInterval(ownerOrdersRefreshTimer);
    ownerOrdersRefreshTimer = null;
  }
}

function setupOwnerRefreshButton() {
  const refreshBtn =
    document.getElementById("refreshOrders") ||
    document.getElementById("refreshOrdersBtn") ||
    document.getElementById("ownerRefreshOrdersBtn");

  if (!refreshBtn) return;

  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add("loading");

    await loadOwnerOrdersFromBackend({ force: true });

    refreshBtn.disabled = false;
    refreshBtn.classList.remove("loading");
  });
}

/* ===============================
   NORMALIZE / FILTER
================================ */

function normalizeBackendOrder(order) {
  return {
    ...order,

    id: order.id,
    orderId: order.id,
    orderNumber: order.order_number || order.orderNumber || order.id,

    restaurantId: order.restaurant_id || order.restaurantId,
    restaurantName: order.restaurant_name || order.restaurantName || "",

    customerName: order.customer_name || order.customerName || "Guest User",
    customerEmail: order.customer_email || order.customerEmail || "",
    phoneNumber: order.phone_number || order.phoneNumber || "No phone",

    address: order.address || "",
    city: order.city || "",
    postalCode: order.postal_code || order.postalCode || "",
    paymentMethod: order.payment_method || order.paymentMethod || "cash",

    deliveryStatus: order.delivery_status || order.deliveryStatus || "searching",

    riderName: order.rider_name || order.riderName || "",
    riderEmail: order.rider_email || order.riderEmail || "",
    riderPhone: order.rider_phone || order.riderPhone || "",

    createdAt: order.created_at || order.createdAt,
    updatedAt: order.updated_at || order.updatedAt,

    subtotal: Number(order.subtotal || 0),
    tax: Number(order.tax || 0),
    deliveryFee: Number(order.delivery_fee || order.deliveryFee || 0),
    total: Number(order.total || 0),

    notes: order.notes || "",

    items: Array.isArray(order.items) ? order.items : [],
  };
}

function filterOrdersForCurrentRestaurant(orders, ownerRestaurant) {
  const ownerRestaurantId = String(ownerRestaurant.restaurantId || "").trim();

  const ownerRestaurantName = String(ownerRestaurant.restaurantName || "")
    .trim()
    .toLowerCase();

  return orders.filter((order) => {
    const orderRestaurantId = String(
      order.restaurantId || order.restaurant_id || ""
    ).trim();

    const orderRestaurantName = String(
      order.restaurantName || order.restaurant_name || ""
    )
      .trim()
      .toLowerCase();

    if (ownerRestaurantId && orderRestaurantId) {
      return orderRestaurantId === ownerRestaurantId;
    }

    if (ownerRestaurantName && orderRestaurantName) {
      return orderRestaurantName === ownerRestaurantName;
    }

    return false;
  });
}

/* ===============================
   RENDER ORDERS
================================ */

function renderOwnerOrders() {
  const sections = {
    pending: document.getElementById("section-pending"),
    accepted: document.getElementById("section-accepted"),
    ready: document.getElementById("section-ready"),
    delivery: document.getElementById("section-delivery"),
    delivered: document.getElementById("section-delivered"),
    cancelled: document.getElementById("section-cancelled"),
  };

  if (
    !sections.pending ||
    !sections.accepted ||
    !sections.ready ||
    !sections.delivery ||
    !sections.delivered ||
    !sections.cancelled
  ) {
    console.warn("[ownerOrders.js] One or more order sections are missing.");
    return;
  }

  Object.values(sections).forEach((section) => {
    section.innerHTML = "";
  });

  const searchedOrders = applySearchFilter(ownerOrdersCache);

  if (!searchedOrders.length) {
    sections.pending.innerHTML = getEmptyStateHTML(
      "No orders yet",
      "No orders found for this restaurant yet."
    );
    fillAllEmptySections(sections);
    updateOrderTabCounts();
    return;
  }

  const sortedOrders = [...searchedOrders].sort((a, b) => {
    const aTime = new Date(a.createdAt || a.created_at || 0).getTime();
    const bTime = new Date(b.createdAt || b.created_at || 0).getTime();
    return bTime - aTime;
  });

  sortedOrders.forEach((order) => {
    const normalizedStatus = getOwnerOrderStatus(order);
    const cardHTML = createOrderCardHTML(order, normalizedStatus);

    if (normalizedStatus === "pending") {
      sections.pending.insertAdjacentHTML("beforeend", cardHTML);
    } else if (
      normalizedStatus === "confirmed" ||
      normalizedStatus === "preparing"
    ) {
      sections.accepted.insertAdjacentHTML("beforeend", cardHTML);
    } else if (normalizedStatus === "ready_for_pickup") {
      sections.ready.insertAdjacentHTML("beforeend", cardHTML);
    } else if (
      normalizedStatus === "picked_up" ||
      normalizedStatus === "on_the_way"
    ) {
      sections.delivery.insertAdjacentHTML("beforeend", cardHTML);
    } else if (normalizedStatus === "delivered") {
      sections.delivered.insertAdjacentHTML("beforeend", cardHTML);
    } else if (normalizedStatus === "cancelled") {
      sections.cancelled.insertAdjacentHTML("beforeend", cardHTML);
    } else {
      sections.pending.insertAdjacentHTML("beforeend", cardHTML);
    }
  });

  fillAllEmptySections(sections);
  attachOrderActions();
  updateOrderTabCounts();
}

function fillAllEmptySections(sections) {
  if (!sections.pending.children.length) {
    sections.pending.innerHTML = getEmptyStateHTML(
      "No pending orders",
      "New incoming orders will show here."
    );
  }

  if (!sections.accepted.children.length) {
    sections.accepted.innerHTML = getEmptyStateHTML(
      "No orders in progress",
      "Confirmed and preparing orders will show here."
    );
  }

  if (!sections.ready.children.length) {
    sections.ready.innerHTML = getEmptyStateHTML(
      "No orders ready for pickup",
      "Orders marked ready by the restaurant will wait here for riders."
    );
  }

  if (!sections.delivery.children.length) {
    sections.delivery.innerHTML = getEmptyStateHTML(
      "No orders in delivery",
      "Orders picked up by riders will show here until delivered."
    );
  }

  if (!sections.delivered.children.length) {
    sections.delivered.innerHTML = getEmptyStateHTML(
      "No completed orders",
      "Delivered orders will show here."
    );
  }

  if (!sections.cancelled.children.length) {
    sections.cancelled.innerHTML = getEmptyStateHTML(
      "No cancelled orders",
      "Rejected or cancelled orders will show here."
    );
  }
}

function createOrderCardHTML(order, status) {
  const orderId = order.id || order.orderId;

  const orderNumber =
    order.orderNumber || order.order_number || orderId || "N/A";

  const customerName =
    order.customerName ||
    order.customer_name ||
    order.fullName ||
    order.name ||
    "Guest User";

  const customerPhone =
    order.phoneNumber || order.phone || order.phone_number || "No phone";

  const customerAddress = buildCustomerAddress(order);
  const total = Number(order.total || 0).toFixed(2);
  const orderTime = formatTimeAgo(order.createdAt || order.created_at);

  const itemsHTML =
    Array.isArray(order.items) && order.items.length
      ? order.items
          .map((item) => {
            const quantity = Number(item.quantity || item.qty || 1);

            const itemName =
              item.name || item.product_name || item.title || "Food Item";

            return `<div class="order-item">${quantity}x ${escapeHtml(
              itemName
            )}</div>`;
          })
          .join("")
      : `<div class="order-item">Items saved in order</div>`;

  const badgeInfo = statusBadgeMap[status] || statusBadgeMap.pending;

  return `
    <div class="order-card" data-order-id="${escapeHtml(
      String(orderId)
    )}" data-status="${escapeHtml(status)}">
      <div class="owner-order-icon">
        <i class="fa-solid fa-bag-shopping"></i>
      </div>

      <div class="order-body">
        <div class="order-top">
          <div>
            <div class="order-id">#${escapeHtml(String(orderNumber))}</div>
            <div class="order-time">${escapeHtml(orderTime)}</div>
          </div>

          <span class="badge ${escapeHtml(badgeInfo.css)}">${escapeHtml(
    badgeInfo.label
  )}</span>
        </div>

        <div class="details-grid">
          <div>
            <div class="detail-label">Customer Details</div>
            <div class="detail-name">${escapeHtml(customerName)}</div>
            <div class="detail-text">${escapeHtml(customerPhone)}</div>
            <div class="detail-text">${escapeHtml(customerAddress)}</div>
          </div>

          <div>
            <div class="detail-label">Order Items</div>
            ${itemsHTML}
          </div>
        </div>

        ${getRiderInfoHTML(order, status)}

        <div class="order-footer">
          <div>
            <div class="total-label">Total Amount</div>
            <div class="total-amount">Rs. ${escapeHtml(total)}</div>
          </div>

          <div class="actions">
            ${getActionButtonsHTML(status)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function getRiderInfoHTML(order, status) {
  const riderName = order.riderName || order.rider_name || "";
  const riderPhone = order.riderPhone || order.rider_phone || "";

  if (
    !riderName &&
    !riderPhone &&
    !["picked_up", "on_the_way", "delivered"].includes(status)
  ) {
    return "";
  }

  return `
    <div class="details-grid" style="margin-top: 14px;">
      <div>
        <div class="detail-label">Rider Details</div>
        <div class="detail-name">${escapeHtml(riderName || "Rider assigned")}</div>
        <div class="detail-text">${escapeHtml(riderPhone || "Phone not available")}</div>
      </div>
      <div>
        <div class="detail-label">Delivery Progress</div>
        <div class="detail-text">${escapeHtml(formatStatusLabel(status))}</div>
      </div>
    </div>
  `;
}

/* ===============================
   ACTION BUTTONS
================================ */

function getActionButtonsHTML(status) {
  if (status === "pending") {
    return `
      <button class="btn-reject" type="button">
        <i class="fa fa-xmark"></i> Reject
      </button>
      <button class="btn-confirm" type="button">
        <i class="fa fa-check"></i> Confirm
      </button>
    `;
  }

  if (status === "confirmed") {
    return `
      <button class="btn-prepare" type="button">
        <i class="fa fa-utensils"></i> Start Preparing
      </button>
    `;
  }

  if (status === "preparing") {
    return `
      <button class="btn-ready-pickup" type="button">
        <i class="fa fa-box-open"></i> Mark Ready for Pickup
      </button>
    `;
  }

  if (status === "ready_for_pickup") {
    return `
      <button class="btn-waiting-rider" type="button" disabled>
        <i class="fa fa-clock"></i> Waiting for Rider
      </button>
      <button class="btn-view" type="button">
        <i class="fa fa-eye"></i> View Details
      </button>
    `;
  }

  if (status === "picked_up") {
    return `
      <button class="btn-waiting-rider" type="button" disabled>
        <i class="fa fa-motorcycle"></i> Picked Up by Rider
      </button>
      <button class="btn-view" type="button">
        <i class="fa fa-eye"></i> View Details
      </button>
    `;
  }

  if (status === "on_the_way") {
    return `
      <button class="btn-waiting-rider" type="button" disabled>
        <i class="fa fa-location-arrow"></i> Rider On The Way
      </button>
      <button class="btn-view" type="button">
        <i class="fa fa-eye"></i> View Details
      </button>
    `;
  }

  if (status === "delivered") {
    return `
      <button class="btn-waiting-rider" type="button" disabled>
        <i class="fa fa-circle-check"></i> Completed
      </button>
      <button class="btn-view" type="button">
        <i class="fa fa-eye"></i> View Details
      </button>
    `;
  }

  if (status === "cancelled") {
    return `
      <button class="btn-waiting-rider" type="button" disabled>
        <i class="fa fa-circle-xmark"></i> Cancelled
      </button>
      <button class="btn-view" type="button">
        <i class="fa fa-eye"></i> View Details
      </button>
    `;
  }

  return `
    <button class="btn-view" type="button">
      <i class="fa fa-eye"></i> View Details
    </button>
  `;
}

function attachOrderActions() {
  document.querySelectorAll(".order-card").forEach((card) => {
    const orderId = card.dataset.orderId;

    card.querySelector(".btn-reject")?.addEventListener("click", () => {
      updateOrderStatus(orderId, "cancelled");
    });

    card.querySelector(".btn-confirm")?.addEventListener("click", () => {
      updateOrderStatus(orderId, "confirmed");
    });

    card.querySelector(".btn-prepare")?.addEventListener("click", () => {
      updateOrderStatus(orderId, "preparing");
    });

    card.querySelector(".btn-ready-pickup")?.addEventListener("click", () => {
      updateOrderStatus(orderId, "ready_for_pickup");
    });

    card.querySelector(".btn-view")?.addEventListener("click", () => {
      openOwnerOrderModal(orderId);
    });
  });
}

async function updateOrderStatus(orderId, nextStatus) {
  if (!orderId) {
    alert("Order ID missing.");
    return;
  }

  if (isOwnerOrderUpdating) {
    console.warn("[ownerOrders.js] Update already in progress.");
    return;
  }

  const card = document.querySelector(
    `.order-card[data-order-id="${safeCssEscape(orderId)}"]`
  );

  try {
    isOwnerOrderUpdating = true;
    setCardUpdating(card, true);

    const response = await fetch(`${OWNER_ORDER_API}?action=update_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order_id: Number(orderId),
        status: nextStatus,
      }),
    });

    const raw = await response.text();

    let result;
    try {
      result = JSON.parse(raw);
    } catch (error) {
      console.error("[ownerOrders.js] Raw update response:", raw);
      throw new Error("Server did not return valid JSON.");
    }

    if (!result.success) {
      throw new Error(result.message || "Failed to update order status.");
    }

    console.log("[ownerOrders.js] Order status updated:", {
      orderId,
      nextStatus,
    });
  } catch (error) {
    console.error("[ownerOrders.js] Order status update failed:", error);
    alert(`Could not update order status: ${error.message}`);
  } finally {
    isOwnerOrderUpdating = false;
    setCardUpdating(card, false);
    await loadOwnerOrdersFromBackend({ force: true });
  }
}

function setCardUpdating(card, isUpdating) {
  if (!card) return;

  card.classList.toggle("is-updating", isUpdating);

  card.querySelectorAll("button").forEach((button) => {
    button.disabled = isUpdating;
    button.classList.toggle("loading", isUpdating);
  });
}

/* ===============================
   OWNER-SIDE ORDER MODAL
================================ */

function ensureOwnerOrderModal() {
  if (document.getElementById("ownerOrderModal")) return;

  const modal = document.createElement("div");
  modal.id = "ownerOrderModal";
  modal.className = "owner-order-modal";
  modal.innerHTML = `
    <div class="owner-order-modal-backdrop" data-close-owner-modal="true"></div>
    <div class="owner-order-modal-panel">
      <div class="owner-order-modal-header">
        <div>
          <p class="owner-order-modal-kicker">Restaurant Order Details</p>
          <h2 id="ownerOrderModalTitle">Order Details</h2>
        </div>
        <button type="button" class="owner-order-modal-close" data-close-owner-modal="true">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div id="ownerOrderModalBody" class="owner-order-modal-body"></div>
    </div>
  `;

  document.body.appendChild(modal);

  injectOwnerOrderModalStyles();

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-owner-modal='true']")) {
      closeOwnerOrderModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOwnerOrderModal();
    }
  });
}

function injectOwnerOrderModalStyles() {
  if (document.getElementById("ownerOrderModalStyles")) return;

  const style = document.createElement("style");
  style.id = "ownerOrderModalStyles";
  style.textContent = `
    .owner-order-modal {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .owner-order-modal.show {
      display: flex;
    }

    .owner-order-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.58);
      backdrop-filter: blur(8px);
    }

    .owner-order-modal-panel {
      position: relative;
      width: min(860px, 100%);
      max-height: 88vh;
      overflow: auto;
      background: #ffffff;
      border-radius: 28px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.28);
      border: 1px solid rgba(226, 232, 240, 0.9);
    }

    .owner-order-modal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding: 28px 30px 20px;
      border-bottom: 1px solid #edf0f5;
    }

    .owner-order-modal-kicker {
      margin: 0 0 6px;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #ef4444;
    }

    .owner-order-modal-header h2 {
      margin: 0;
      font-size: 28px;
      line-height: 1.1;
      color: #111827;
    }

    .owner-order-modal-close {
      width: 44px;
      height: 44px;
      border-radius: 999px;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      color: #111827;
      cursor: pointer;
      font-size: 18px;
    }

    .owner-order-modal-close:hover {
      background: #fee2e2;
      color: #dc2626;
      border-color: #fecaca;
    }

    .owner-order-modal-body {
      padding: 26px 30px 30px;
    }

    .owner-modal-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }

    .owner-modal-card {
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      padding: 18px;
      background: #f9fafb;
    }

    .owner-modal-card h3 {
      margin: 0 0 12px;
      font-size: 15px;
      color: #111827;
    }

    .owner-modal-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 0;
      border-bottom: 1px solid #edf0f5;
      color: #6b7280;
      font-size: 14px;
    }

    .owner-modal-row:last-child {
      border-bottom: none;
    }

    .owner-modal-row strong {
      color: #111827;
      text-align: right;
    }

    .owner-modal-items {
      display: grid;
      gap: 10px;
    }

    .owner-modal-item {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border: 1px solid #e5e7eb;
      background: #ffffff;
      border-radius: 16px;
      padding: 14px;
    }

    .owner-modal-item-name {
      font-weight: 800;
      color: #111827;
    }

    .owner-modal-item-meta {
      margin-top: 4px;
      color: #6b7280;
      font-size: 13px;
    }

    .owner-modal-price {
      font-weight: 900;
      color: #111827;
      white-space: nowrap;
    }

    .owner-modal-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 900;
      background: #fff1f2;
      color: #e11d48;
    }

    @media (max-width: 720px) {
      .owner-order-modal {
        padding: 14px;
      }

      .owner-order-modal-header,
      .owner-order-modal-body {
        padding-left: 20px;
        padding-right: 20px;
      }

      .owner-modal-grid {
        grid-template-columns: 1fr;
      }

      .owner-order-modal-header h2 {
        font-size: 22px;
      }
    }
  `;

  document.head.appendChild(style);
}

function openOwnerOrderModal(orderId) {
  ensureOwnerOrderModal();

  const order = ownerOrdersCache.find(
    (item) => String(item.id || item.orderId) === String(orderId)
  );

  if (!order) {
    alert("Order details not found. Please refresh orders.");
    return;
  }

  const status = getOwnerOrderStatus(order);
  const orderNumber = order.orderNumber || order.order_number || order.id || "N/A";

  const title = document.getElementById("ownerOrderModalTitle");
  const body = document.getElementById("ownerOrderModalBody");
  const modal = document.getElementById("ownerOrderModal");

  if (title) {
    title.textContent = `#${orderNumber}`;
  }

  if (body) {
    body.innerHTML = createOwnerOrderModalHTML(order, status);
  }

  modal?.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeOwnerOrderModal() {
  const modal = document.getElementById("ownerOrderModal");
  modal?.classList.remove("show");
  document.body.style.overflow = "";
}

function createOwnerOrderModalHTML(order, status) {
  const orderNumber = order.orderNumber || order.order_number || order.id || "N/A";
  const customerName = order.customerName || order.customer_name || "Guest User";
  const customerEmail = order.customerEmail || order.customer_email || "Not available";
  const customerPhone = order.phoneNumber || order.phone_number || "No phone";
  const customerAddress = buildCustomerAddress(order);

  const riderName = order.riderName || order.rider_name || "Not assigned yet";
  const riderEmail = order.riderEmail || order.rider_email || "Not available";
  const riderPhone = order.riderPhone || order.rider_phone || "Not available";

  const paymentMethod = formatPaymentMethod(order.paymentMethod || order.payment_method);
  const createdAt = formatFullDate(order.createdAt || order.created_at);
  const updatedAt = formatFullDate(order.updatedAt || order.updated_at);

  const subtotal = Number(order.subtotal || 0).toFixed(2);
  const tax = Number(order.tax || 0).toFixed(2);
  const deliveryFee = Number(order.deliveryFee || order.delivery_fee || 0).toFixed(2);
  const total = Number(order.total || 0).toFixed(2);

  return `
    <div style="margin-bottom: 20px;">
      <span class="owner-modal-status">
        <i class="fa-solid fa-circle-info"></i>
        ${escapeHtml(formatStatusLabel(status))}
      </span>
    </div>

    <div class="owner-modal-grid">
      <div class="owner-modal-card">
        <h3><i class="fa-solid fa-user"></i> Customer</h3>
        <div class="owner-modal-row"><span>Name</span><strong>${escapeHtml(customerName)}</strong></div>
        <div class="owner-modal-row"><span>Email</span><strong>${escapeHtml(customerEmail)}</strong></div>
        <div class="owner-modal-row"><span>Phone</span><strong>${escapeHtml(customerPhone)}</strong></div>
        <div class="owner-modal-row"><span>Address</span><strong>${escapeHtml(customerAddress)}</strong></div>
      </div>

      <div class="owner-modal-card">
        <h3><i class="fa-solid fa-motorcycle"></i> Rider</h3>
        <div class="owner-modal-row"><span>Name</span><strong>${escapeHtml(riderName)}</strong></div>
        <div class="owner-modal-row"><span>Email</span><strong>${escapeHtml(riderEmail)}</strong></div>
        <div class="owner-modal-row"><span>Phone</span><strong>${escapeHtml(riderPhone)}</strong></div>
        <div class="owner-modal-row"><span>Delivery</span><strong>${escapeHtml(order.deliveryStatus || order.delivery_status || "searching")}</strong></div>
      </div>

      <div class="owner-modal-card">
        <h3><i class="fa-solid fa-receipt"></i> Order Info</h3>
        <div class="owner-modal-row"><span>Order No.</span><strong>#${escapeHtml(orderNumber)}</strong></div>
        <div class="owner-modal-row"><span>Payment</span><strong>${escapeHtml(paymentMethod)}</strong></div>
        <div class="owner-modal-row"><span>Placed</span><strong>${escapeHtml(createdAt)}</strong></div>
        <div class="owner-modal-row"><span>Updated</span><strong>${escapeHtml(updatedAt)}</strong></div>
      </div>

      <div class="owner-modal-card">
        <h3><i class="fa-solid fa-wallet"></i> Payment Summary</h3>
        <div class="owner-modal-row"><span>Subtotal</span><strong>Rs. ${escapeHtml(subtotal)}</strong></div>
        <div class="owner-modal-row"><span>Tax</span><strong>Rs. ${escapeHtml(tax)}</strong></div>
        <div class="owner-modal-row"><span>Delivery Fee</span><strong>Rs. ${escapeHtml(deliveryFee)}</strong></div>
        <div class="owner-modal-row"><span>Total</span><strong>Rs. ${escapeHtml(total)}</strong></div>
      </div>
    </div>

    <div class="owner-modal-card">
      <h3><i class="fa-solid fa-bowl-food"></i> Order Items</h3>
      <div class="owner-modal-items">
        ${createOwnerModalItemsHTML(order)}
      </div>
    </div>

    ${
      order.notes
        ? `
          <div class="owner-modal-card" style="margin-top:16px;">
            <h3><i class="fa-solid fa-note-sticky"></i> Customer Note</h3>
            <p style="margin:0; color:#6b7280; line-height:1.6;">${escapeHtml(order.notes)}</p>
          </div>
        `
        : ""
    }
  `;
}

function createOwnerModalItemsHTML(order) {
  if (!Array.isArray(order.items) || !order.items.length) {
    return `
      <div class="owner-modal-item">
        <div>
          <div class="owner-modal-item-name">Items saved in order</div>
          <div class="owner-modal-item-meta">Backend did not return item details in this order list response yet.</div>
        </div>
      </div>
    `;
  }

  return order.items
    .map((item) => {
      const name = item.name || item.product_name || item.title || "Food Item";
      const quantity = Number(item.quantity || item.qty || 1);
      const price = Number(item.price || 0);
      const lineTotal = Number(item.subtotal || price * quantity).toFixed(2);

      return `
        <div class="owner-modal-item">
          <div>
            <div class="owner-modal-item-name">${escapeHtml(name)}</div>
            <div class="owner-modal-item-meta">Qty ${quantity} • Rs. ${price.toFixed(2)} each</div>
          </div>
          <div class="owner-modal-price">Rs. ${escapeHtml(lineTotal)}</div>
        </div>
      `;
    })
    .join("");
}

/* ===============================
   TAB COUNTS + SEARCH
================================ */

function updateOrderTabCounts() {
  const counts = {
    pending: document.querySelectorAll('.order-card[data-status="pending"]')
      .length,

    accepted:
      document.querySelectorAll('.order-card[data-status="confirmed"]').length +
      document.querySelectorAll('.order-card[data-status="preparing"]').length,

    ready: document.querySelectorAll('.order-card[data-status="ready_for_pickup"]')
      .length,

    delivery:
      document.querySelectorAll('.order-card[data-status="picked_up"]').length +
      document.querySelectorAll('.order-card[data-status="on_the_way"]').length,

    delivered: document.querySelectorAll('.order-card[data-status="delivered"]')
      .length,

    cancelled: document.querySelectorAll('.order-card[data-status="cancelled"]')
      .length,
  };

  const tabs = document.querySelectorAll(".tab");

  if (tabs[0]) {
    tabs[0].innerHTML = `<i class="fa fa-clock"></i> Pending (${counts.pending})`;
  }

  if (tabs[1]) {
    tabs[1].innerHTML = `<i class="fa fa-utensils"></i> In Progress (${counts.accepted})`;
  }

  if (tabs[2]) {
    tabs[2].innerHTML = `<i class="fa fa-box-open"></i> Ready for Pickup (${counts.ready})`;
  }

  if (tabs[3]) {
    tabs[3].innerHTML = `<i class="fa fa-motorcycle"></i> In Delivery (${counts.delivery})`;
  }

  if (tabs[4]) {
    tabs[4].innerHTML = `<i class="fa fa-circle-check"></i> Completed (${counts.delivered})`;
  }

  if (tabs[5]) {
    tabs[5].innerHTML = `<i class="fa fa-circle-xmark"></i> Cancelled (${counts.cancelled})`;
  }
}

function initializeOrderSearch() {
  const searchInput = document.getElementById("orderSearchInput");
  if (!searchInput) return;

  searchInput.addEventListener("input", () => {
    renderOwnerOrders();
  });
}

function applySearchFilter(orders) {
  const searchInput = document.getElementById("orderSearchInput");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  if (!query) return orders;

  return orders.filter((order) => {
    const orderNumber = String(
      order.orderNumber || order.order_number || order.id || ""
    ).toLowerCase();

    const customerName = String(
      order.customerName || order.customer_name || ""
    ).toLowerCase();

    const customerPhone = String(
      order.phoneNumber || order.phone_number || ""
    ).toLowerCase();

    const restaurantName = String(
      order.restaurantName || order.restaurant_name || ""
    ).toLowerCase();

    return (
      orderNumber.includes(query) ||
      customerName.includes(query) ||
      customerPhone.includes(query) ||
      restaurantName.includes(query)
    );
  });
}

/* ===============================
   SMALL UTILITIES
================================ */

function getOwnerOrderStatus(order) {
  const deliveryStatus = String(
    order.deliveryStatus || order.delivery_status || ""
  )
    .toLowerCase()
    .trim();

  const status = normalizeStatus(order.status);

  if (deliveryStatus === "picked_up") return "picked_up";
  if (deliveryStatus === "on_the_way") return "on_the_way";
  if (deliveryStatus === "delivered") return "delivered";

  return status;
}

function normalizeStatus(status) {
  const value = String(status || "pending").toLowerCase().trim();

  if (value === "accepted") return "confirmed";

  return value;
}

function formatStatusLabel(status) {
  const info = statusBadgeMap[status] || statusBadgeMap.pending;
  return info.label;
}

function buildCustomerAddress(order) {
  const parts = [
    order.address,
    order.city,
    order.area,
    order.postalCode || order.postal_code,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "Address not available";
}

function formatPaymentMethod(method) {
  const value = String(method || "cash").toLowerCase();

  const map = {
    cash: "Cash on Delivery",
    cod: "Cash on Delivery",
    card: "Card Payment",
    digital: "Digital Wallet",
    wallet: "Digital Wallet",
  };

  return map[value] || method || "Cash on Delivery";
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return "Just now";

  const time = new Date(timestamp).getTime();
  const now = Date.now();
  const diffMinutes = Math.floor((now - time) / (1000 * 60));

  if (Number.isNaN(time) || diffMinutes < 1) return "Just now";

  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes > 1 ? "s" : ""} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

function formatFullDate(timestamp) {
  if (!timestamp) return "Not available";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-NP", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEmptyStateHTML(title, text) {
  return `
    <div class="order-card" style="padding: 24px; display: block;">
      <div class="order-body">
        <div class="order-top">
          <div>
            <div class="order-id">${escapeHtml(title)}</div>
            <div class="order-time">${escapeHtml(text)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderErrorState(message) {
  const pending = document.getElementById("section-pending");
  if (!pending) return;

  pending.innerHTML = getEmptyStateHTML(
    "Failed to load orders",
    message || "Please refresh the page."
  );

  updateOrderTabCounts();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeCssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(String(value));
  }

  return String(value).replace(/"/g, '\\"');
}

/* ===============================
   GLOBAL EXPORTS
================================ */

window.updateOrderTabCounts = updateOrderTabCounts;
window.attachOrderActions = attachOrderActions;
window.loadOwnerOrdersFromBackend = loadOwnerOrdersFromBackend;
window.startOwnerOrdersAutoRefresh = startOwnerOrdersAutoRefresh;
window.stopOwnerOrdersAutoRefresh = stopOwnerOrdersAutoRefresh;