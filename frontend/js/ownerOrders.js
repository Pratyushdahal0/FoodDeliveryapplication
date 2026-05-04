console.log("[ownerOrders.js] Loaded - fixed renderer v3");

const OWNER_ORDER_API = "../../backend/controllers/OwnerOrderController.php";
const OWNER_ORDERS_POLL_INTERVAL = 6000;

const tabClassMap = {
  pending: "active-pending",
  accepted: "active-accepted",
  ready: "active-ready",
  delivery: "active-delivery",
  delivered: "active-delivered",
  cancelled: "active-cancelled",
};

const statusBadgeMap = {
  pending: { label: "Pending", css: "badge-pending" },
  confirmed: { label: "Confirmed", css: "badge-accepted" },
  preparing: { label: "Preparing", css: "badge-accepted" },
  ready_for_pickup: { label: "Ready for Pickup", css: "badge-ready" },
  picked_up: { label: "Picked Up", css: "badge-accepted" },
  on_the_way: { label: "On The Way", css: "badge-accepted" },
  delivered: { label: "Delivered", css: "badge-delivered" },
  cancelled: { label: "Cancelled", css: "badge-cancelled" },
};

let ownerOrdersCache = [];
let ownerOrdersRefreshTimer = null;
let isOwnerOrdersLoading = false;
let isOwnerOrderUpdating = false;
let currentSortMode = "latest";

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[ownerOrders.js] DOM ready");

  renderOwnerName();
  setupTabs();
  setupControls();
  setupLogout();
  ensureModals();
  ensureToastHost();

  await loadOwnerOrdersFromBackend();
  startAutoRefresh();
});

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
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

  const ownerUserId =
    owner.id || owner.user_id || currentUser.id || currentUser.user_id || null;

  return {
    restaurantId: String(restaurantId || "1"),
    restaurantName: String(restaurantName || "Spicy Grill"),
    ownerUserId,
  };
}

function renderOwnerName() {
  const { restaurantName } = getCurrentOwnerRestaurant();

  document.querySelectorAll(".sidebar-profile .name").forEach((el) => {
    el.textContent = restaurantName;
  });

  document.querySelectorAll(".sidebar-profile .avatar").forEach((el) => {
    el.textContent = restaurantName.charAt(0).toUpperCase();
  });
}

function setupLogout() {
  document.getElementById("ownerLogoutBtn")?.addEventListener("click", () => {
    if (typeof logout === "function") {
      logout();
      return;
    }

    localStorage.removeItem("foodExpressCurrentOwner");
    localStorage.removeItem("foodExpressCurrentUser");
    window.location.href = "restaurant-login.html";
  });
}

function setupTabs() {
  document.querySelectorAll(".owner-order-tabs .tab").forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab, button);
    });
  });
}

function switchTab(type, activeButton) {
  document.querySelectorAll(".owner-order-tabs .tab").forEach((button) => {
    Object.values(tabClassMap).forEach((className) => {
      button.classList.remove(className);
    });
  });

  activeButton.classList.add(tabClassMap[type] || "active-pending");

  document.querySelectorAll(".order-section").forEach((section) => {
    section.classList.remove("active");
  });

  document.getElementById(`section-${type}`)?.classList.add("active");
}

function setupControls() {
  document.getElementById("orderSearchInput")?.addEventListener("input", () => {
    renderOwnerOrders();
  });

  document.getElementById("ownerStatusFilter")?.addEventListener("change", () => {
    renderOwnerOrders();
  });

  document.getElementById("ownerSortMode")?.addEventListener("change", (event) => {
    currentSortMode = event.target.value || "latest";
    renderOwnerOrders();
  });

  document.getElementById("ownerRefreshBtn")?.addEventListener("click", async () => {
    await loadOwnerOrdersFromBackend({ force: true });
  });
}

async function loadOwnerOrdersFromBackend(options = {}) {
  const { silent = false, force = false } = options;

  if (isOwnerOrdersLoading && !force) return;
  if (isOwnerOrderUpdating && !force) return;

  const { restaurantId } = getCurrentOwnerRestaurant();

  try {
    isOwnerOrdersLoading = true;

    if (!silent) {
      renderLoadingState();
    }

    const url = `${OWNER_ORDER_API}?action=list&restaurant_id=${encodeURIComponent(
      restaurantId
    )}&limit=150&_=${Date.now()}`;

    console.log("[ownerOrders.js] Fetching:", url);

    const response = await fetch(url);
    const result = await readJsonResponse(response);

    console.log("[ownerOrders.js] API result:", result);

    if (!result.success) {
      throw new Error(result.message || "Failed to load restaurant orders.");
    }

    ownerOrdersCache = Array.isArray(result.data)
      ? result.data.map(normalizeBackendOrder)
      : [];

    console.log("[ownerOrders.js] Orders loaded:", ownerOrdersCache.length);

    renderOwnerOrders();
  } catch (error) {
    console.error("[ownerOrders.js] Load failed:", error);
    renderErrorState(error.message);
    showToast(error.message, "error");
  } finally {
    isOwnerOrdersLoading = false;
  }
}

async function readJsonResponse(response) {
  const raw = await response.text();

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("[ownerOrders.js] Non JSON response:", raw);
    throw new Error("Backend returned invalid JSON. Check PHP error.");
  }
}

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
    deliveryStatus: order.delivery_status || order.deliveryStatus || "pending",
    riderName: order.rider_name || order.riderName || "",
    riderEmail: order.rider_email || order.riderEmail || "",
    riderPhone: order.rider_phone || order.riderPhone || "",
    createdAt: order.created_at || order.createdAt,
    updatedAt: order.updated_at || order.updatedAt,
    confirmedAt: order.confirmed_at || order.confirmedAt,
    preparingAt: order.preparing_at || order.preparingAt,
    readyForPickupAt: order.ready_for_pickup_at || order.readyForPickupAt,
    cancelReason: order.cancel_reason || order.cancelReason || "",
    subtotal: Number(order.subtotal || 0),
    tax: Number(order.tax || 0),
    deliveryFee: Number(order.delivery_fee || order.deliveryFee || 0),
    total: Number(order.total || 0),
    notes: order.notes || "",
    items: Array.isArray(order.items) ? order.items : [],
    statusHistory: Array.isArray(order.status_history)
      ? order.status_history
      : [],
  };
}

function getSections() {
  const sections = {
    pending: document.getElementById("section-pending"),
    accepted: document.getElementById("section-accepted"),
    ready: document.getElementById("section-ready"),
    delivery: document.getElementById("section-delivery"),
    delivered: document.getElementById("section-delivered"),
    cancelled: document.getElementById("section-cancelled"),
  };

  const missing = Object.entries(sections).filter(([, value]) => !value);

  if (missing.length) {
    console.error("[ownerOrders.js] Missing HTML sections:", missing);
    return null;
  }

  return sections;
}

function renderLoadingState() {
  const sections = getSections();
  if (!sections) return;

  sections.pending.innerHTML = getEmptyStateHTML(
    "Loading orders",
    "Checking restaurant orders from backend..."
  );
}

function renderErrorState(message) {
  const sections = getSections();
  if (!sections) return;

  sections.pending.innerHTML = getEmptyStateHTML(
    "Could not load orders",
    message || "Please check backend connection."
  );
}

function getVisibleOrders() {
  const searchInput = document.getElementById("orderSearchInput");
  const statusFilter = document.getElementById("ownerStatusFilter");

  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const filter = statusFilter ? statusFilter.value : "all";

  let orders = [...ownerOrdersCache];

  if (query) {
    orders = orders.filter((order) => {
      const searchText = [
        order.orderNumber,
        order.customerName,
        order.customerEmail,
        order.phoneNumber,
        order.restaurantName,
        order.address,
        order.city,
      ]
        .join(" ")
        .toLowerCase();

      return searchText.includes(query);
    });
  }

  if (filter !== "all") {
    orders = orders.filter((order) => {
      const status = getOwnerOrderStatus(order);

      if (filter === "delivery") {
        return ["picked_up", "on_the_way"].includes(status);
      }

      return status === filter;
    });
  }

  orders.sort((a, b) => {
    if (currentSortMode === "oldest") return toTime(a.createdAt) - toTime(b.createdAt);
    if (currentSortMode === "highest") return Number(b.total || 0) - Number(a.total || 0);
    if (currentSortMode === "urgent") return getWaitMinutes(b) - getWaitMinutes(a);
    return toTime(b.createdAt) - toTime(a.createdAt);
  });

  return orders;
}

function renderOwnerOrders() {
  const sections = getSections();
  if (!sections) return;

  Object.values(sections).forEach((section) => {
    section.innerHTML = "";
  });

  const orders = getVisibleOrders();

  console.log("[ownerOrders.js] Rendering orders:", orders.length);

  if (!orders.length) {
    sections.pending.innerHTML = getEmptyStateHTML(
      "No orders found",
      "No matching orders for this restaurant right now."
    );
    fillEmptySections(sections);
    updateTabCounts();
    return;
  }

  orders.forEach((order) => {
    const status = getOwnerOrderStatus(order);
    const cardHTML = createOrderCardHTML(order, status);

    if (status === "pending") {
      sections.pending.insertAdjacentHTML("beforeend", cardHTML);
    } else if (["confirmed", "preparing"].includes(status)) {
      sections.accepted.insertAdjacentHTML("beforeend", cardHTML);
    } else if (status === "ready_for_pickup") {
      sections.ready.insertAdjacentHTML("beforeend", cardHTML);
    } else if (["picked_up", "on_the_way"].includes(status)) {
      sections.delivery.insertAdjacentHTML("beforeend", cardHTML);
    } else if (status === "delivered") {
      sections.delivered.insertAdjacentHTML("beforeend", cardHTML);
    } else if (status === "cancelled") {
      sections.cancelled.insertAdjacentHTML("beforeend", cardHTML);
    } else {
      sections.pending.insertAdjacentHTML("beforeend", cardHTML);
    }
  });

  fillEmptySections(sections);
  attachOrderActions();
  updateTabCounts();
}

function fillEmptySections(sections) {
  const copy = {
    pending: ["No pending orders", "New customer orders appear here first."],
    accepted: ["No orders in progress", "Confirmed and preparing orders show here."],
    ready: ["No orders ready for pickup", "Ready orders wait here until a rider accepts."],
    delivery: ["No orders with riders", "Picked-up orders show here for restaurant visibility."],
    delivered: ["No completed orders", "Delivered orders will appear here."],
    cancelled: ["No cancelled orders", "Rejected or cancelled orders will appear here."],
  };

  Object.entries(sections).forEach(([key, section]) => {
    if (!section.children.length) {
      section.innerHTML = getEmptyStateHTML(copy[key][0], copy[key][1]);
    }
  });
}

function createOrderCardHTML(order, status) {
  const orderId = order.id || order.orderId;
  const orderNumber = order.orderNumber || order.id || "N/A";
  const badge = statusBadgeMap[status] || statusBadgeMap.pending;
  const waitMinutes = getWaitMinutes(order);
  const urgent = ["pending", "confirmed", "preparing"].includes(status) && waitMinutes >= 8;

  const itemsHTML =
    Array.isArray(order.items) && order.items.length
      ? order.items
          .slice(0, 4)
          .map((item) => {
            const quantity = Number(item.quantity || item.qty || 1);
            const name =
              item.product_name || item.name || item.title || "Food Item";

            return `<div class="order-item">${quantity}x ${escapeHtml(name)}</div>`;
          })
          .join("")
      : `<div class="order-item">Items saved in order</div>`;

  return `
    <article class="order-card ${urgent ? "order-card-urgent" : ""}" data-order-id="${escapeHtml(
      String(orderId)
    )}" data-status="${escapeHtml(status)}">
      <div class="owner-order-icon">
        <i class="fa-solid fa-bag-shopping"></i>
      </div>

      <div class="order-body">
        <div class="order-top">
          <div>
            <div class="order-id">#${escapeHtml(String(orderNumber))}</div>
            <div class="order-time">
              ${escapeHtml(formatTimeAgo(order.createdAt))}
              ${urgent ? ` • ${waitMinutes} mins waiting` : ""}
            </div>
          </div>

          <span class="badge ${escapeHtml(badge.css)}">
            ${escapeHtml(badge.label)}
          </span>
        </div>

        ${
          urgent
            ? `<div class="owner-urgent-alert">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Delay risk: prioritize this order.
              </div>`
            : ""
        }

        <div class="details-grid">
          <div>
            <div class="detail-label">Customer Details</div>
            <div class="detail-name">${escapeHtml(order.customerName)}</div>
            <div class="detail-text">${escapeHtml(order.phoneNumber)}</div>
            <div class="detail-text">${escapeHtml(buildCustomerAddress(order))}</div>
          </div>

          <div>
            <div class="detail-label">Order Items</div>
            ${itemsHTML}
          </div>
        </div>

        ${getRiderInfoHTML(order, status)}

        <div class="owner-mini-timeline">
          ${createMiniTimeline(status)}
        </div>

        <div class="order-footer">
          <div>
            <div class="total-label">Total Amount</div>
            <div class="total-amount">Rs. ${Number(order.total || 0).toFixed(2)}</div>
          </div>

          <div class="actions">
            ${getActionButtonsHTML(status)}
          </div>
        </div>
      </div>
    </article>
  `;
}

function getRiderInfoHTML(order, status) {
  const show =
    ["ready_for_pickup", "picked_up", "on_the_way", "delivered"].includes(status) ||
    order.riderName ||
    order.riderPhone;

  if (!show) return "";

  return `
    <div class="details-grid rider-row">
      <div>
        <div class="detail-label">Rider Details</div>
        <div class="detail-name">${
          escapeHtml(order.riderName || (status === "ready_for_pickup" ? "Waiting for rider" : "Rider assigned"))
        }</div>
        <div class="detail-text">${escapeHtml(order.riderPhone || "Phone not available")}</div>
      </div>

      <div>
        <div class="detail-label">Delivery Progress</div>
        <div class="detail-text">${escapeHtml(formatStatusLabel(status))}</div>
      </div>
    </div>
  `;
}

function createMiniTimeline(status) {
  if (status === "cancelled") {
    return `
      <span class="owner-step done">Received</span>
      <span class="owner-step danger">Cancelled</span>
    `;
  }

  const steps = [
    "pending",
    "confirmed",
    "preparing",
    "ready_for_pickup",
    "picked_up",
    "on_the_way",
    "delivered",
  ];

  const currentIndex = steps.indexOf(status);

  return steps
    .map((step, index) => {
      return `<span class="owner-step ${
        currentIndex >= index ? "done" : ""
      }">${escapeHtml(formatStatusLabel(step))}</span>`;
    })
    .join("");
}

function getActionButtonsHTML(status) {
  if (status === "pending") {
    return `
      <button class="btn-view" type="button">View</button>
      <button class="btn-reject" type="button">Reject</button>
      <button class="btn-confirm" type="button">Confirm</button>
    `;
  }

  if (status === "confirmed") {
    return `
      <button class="btn-view" type="button">View</button>
      <button class="btn-reject" type="button">Cancel</button>
      <button class="btn-prepare" type="button">Start Preparing</button>
    `;
  }

  if (status === "preparing") {
    return `
      <button class="btn-view" type="button">View</button>
      <button class="btn-ready-pickup" type="button">Mark Ready</button>
    `;
  }

  return `<button class="btn-view" type="button">View Details</button>`;
}

function attachOrderActions() {
  document.querySelectorAll(".order-card").forEach((card) => {
    const orderId = card.dataset.orderId;

    card.querySelector(".btn-view")?.addEventListener("click", () => {
      openOrderModal(orderId);
    });

    card.querySelector(".btn-reject")?.addEventListener("click", () => {
      openCancelModal(orderId);
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
  });
}

async function updateOrderStatus(orderId, nextStatus, cancelReason = "") {
  if (!orderId || isOwnerOrderUpdating) return;

  const { restaurantId, ownerUserId } = getCurrentOwnerRestaurant();
  const card = document.querySelector(
    `.order-card[data-order-id="${safeCssEscape(orderId)}"]`
  );

  try {
    isOwnerOrderUpdating = true;
    card?.classList.add("is-updating");

    const response = await fetch(`${OWNER_ORDER_API}?action=update_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order_id: Number(orderId),
        restaurant_id: Number(restaurantId),
        owner_user_id: ownerUserId ? Number(ownerUserId) : null,
        status: nextStatus,
        cancel_reason: cancelReason,
      }),
    });

    const result = await readJsonResponse(response);

    if (!result.success) {
      throw new Error(result.message || "Failed to update order.");
    }

    showToast(getSuccessMessage(nextStatus), "success");
    await loadOwnerOrdersFromBackend({ force: true, silent: true });
  } catch (error) {
    console.error("[ownerOrders.js] Update failed:", error);
    showToast(error.message, "error");
  } finally {
    isOwnerOrderUpdating = false;
    card?.classList.remove("is-updating");
  }
}

function getSuccessMessage(status) {
  const map = {
    confirmed: "Order confirmed. Customer was notified.",
    preparing: "Order moved to preparing. Customer tracking updated.",
    ready_for_pickup: "Order is ready for pickup. Riders can now see it.",
    cancelled: "Order cancelled with reason. Customer was notified.",
  };

  return map[status] || "Order updated successfully.";
}

function ensureModals() {
  ensureOrderModal();
  ensureCancelModal();
}

function ensureOrderModal() {
  if (document.getElementById("ownerOrderModal")) return;

  const modal = document.createElement("div");
  modal.id = "ownerOrderModal";
  modal.className = "owner-modal";
  modal.innerHTML = `
    <div class="owner-modal-backdrop" data-close-owner-modal="true"></div>
    <div class="owner-modal-panel">
      <div class="owner-modal-header">
        <div>
          <p>Restaurant Order Details</p>
          <h2 id="ownerOrderModalTitle">Order Details</h2>
        </div>
        <button type="button" data-close-owner-modal="true">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div id="ownerOrderModalBody" class="owner-modal-body"></div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-owner-modal='true']")) {
      closeOrderModal();
    }
  });
}

function openOrderModal(orderId) {
  const order = ownerOrdersCache.find((item) => String(item.id) === String(orderId));

  if (!order) {
    showToast("Order not found.", "error");
    return;
  }

  const status = getOwnerOrderStatus(order);
  const modal = document.getElementById("ownerOrderModal");
  const title = document.getElementById("ownerOrderModalTitle");
  const body = document.getElementById("ownerOrderModalBody");

  title.textContent = `#${order.orderNumber || order.id}`;

  body.innerHTML = `
    <div class="owner-modal-grid">
      <div class="owner-modal-card">
        <h3>Customer</h3>
        ${modalRow("Name", order.customerName)}
        ${modalRow("Email", order.customerEmail || "Not available")}
        ${modalRow("Phone", order.phoneNumber)}
        ${modalRow("Address", buildCustomerAddress(order))}
      </div>

      <div class="owner-modal-card">
        <h3>Order Info</h3>
        ${modalRow("Status", formatStatusLabel(status))}
        ${modalRow("Payment", formatPaymentMethod(order.paymentMethod))}
        ${modalRow("Placed", formatFullDate(order.createdAt))}
        ${modalRow("Total", `Rs. ${Number(order.total || 0).toFixed(2)}`)}
      </div>
    </div>

    <div class="owner-modal-card">
      <h3>Order Items</h3>
      ${
        order.items.length
          ? order.items
              .map((item) => {
                const name = item.product_name || item.name || "Food Item";
                const qty = Number(item.quantity || 1);
                const price = Number(item.price || 0);
                const subtotal = Number(item.subtotal || qty * price);

                return `
                  <div class="owner-modal-item">
                    <div>
                      <strong>${escapeHtml(name)}</strong>
                      <span>Qty ${qty} × Rs. ${price.toFixed(2)}</span>
                    </div>
                    <b>Rs. ${subtotal.toFixed(2)}</b>
                  </div>
                `;
              })
              .join("")
          : `<p>Items saved in order.</p>`
      }
    </div>

    <div class="owner-modal-card">
      <h3>Status Timeline</h3>
      <div class="owner-status-timeline">
        ${createMiniTimeline(status)}
      </div>
    </div>
  `;

  modal.classList.add("show");
}

function closeOrderModal() {
  document.getElementById("ownerOrderModal")?.classList.remove("show");
}

function modalRow(label, value) {
  return `
    <div class="owner-modal-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Not available")}</strong>
    </div>
  `;
}

function ensureCancelModal() {
  if (document.getElementById("ownerCancelModal")) return;

  const modal = document.createElement("div");
  modal.id = "ownerCancelModal";
  modal.className = "owner-modal";
  modal.innerHTML = `
    <div class="owner-modal-backdrop" data-close-cancel-modal="true"></div>
    <form class="owner-modal-panel owner-cancel-panel" id="ownerCancelForm">
      <div class="owner-modal-header">
        <div>
          <p>Cancel Order</p>
          <h2>Reject / Cancel order?</h2>
        </div>
        <button type="button" data-close-cancel-modal="true">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="owner-modal-body">
        <p class="cancel-help">
          This will notify the customer. Please select a clear restaurant-side reason.
        </p>

        <select id="ownerCancelReasonSelect" required>
          <option value="">Select reason</option>
          <option value="Item unavailable">Item unavailable</option>
          <option value="Restaurant too busy">Restaurant too busy</option>
          <option value="Restaurant closing soon">Restaurant closing soon</option>
          <option value="Cannot fulfil special instruction">Cannot fulfil special instruction</option>
          <option value="Other restaurant issue">Other restaurant issue</option>
        </select>

        <textarea
          id="ownerCancelReasonText"
          placeholder="Optional note for customer/support"
        ></textarea>

        <div class="owner-cancel-actions">
          <button type="button" class="btn-view" data-close-cancel-modal="true">
            Keep Order
          </button>
          <button type="submit" class="btn-reject">
            Cancel Order
          </button>
        </div>
      </div>
    </form>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-cancel-modal='true']")) {
      closeCancelModal();
    }
  });

  document.getElementById("ownerCancelForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const orderId = modal.dataset.orderId;
    const selected = document.getElementById("ownerCancelReasonSelect").value;
    const extra = document.getElementById("ownerCancelReasonText").value.trim();

    if (!selected) {
      showToast("Please select a cancellation reason.", "error");
      return;
    }

    const reason = [selected, extra].filter(Boolean).join(" - ");

    closeCancelModal();
    await updateOrderStatus(orderId, "cancelled", reason);
  });
}

function openCancelModal(orderId) {
  const modal = document.getElementById("ownerCancelModal");
  modal.dataset.orderId = orderId;

  document.getElementById("ownerCancelReasonSelect").value = "";
  document.getElementById("ownerCancelReasonText").value = "";

  modal.classList.add("show");
}

function closeCancelModal() {
  document.getElementById("ownerCancelModal")?.classList.remove("show");
}

function ensureToastHost() {
  if (document.getElementById("ownerToastHost")) return;

  const host = document.createElement("div");
  host.id = "ownerToastHost";
  host.className = "owner-toast-host";
  document.body.appendChild(host);
}

function showToast(message, type = "info") {
  ensureToastHost();

  const toast = document.createElement("div");
  toast.className = `owner-toast ${type}`;
  toast.textContent = message;

  document.getElementById("ownerToastHost").appendChild(toast);

  setTimeout(() => toast.remove(), 4200);
}

function updateTabCounts() {
  const counts = {
    pending: document.querySelectorAll('.order-card[data-status="pending"]').length,
    accepted:
      document.querySelectorAll('.order-card[data-status="confirmed"]').length +
      document.querySelectorAll('.order-card[data-status="preparing"]').length,
    ready: document.querySelectorAll('.order-card[data-status="ready_for_pickup"]').length,
    delivery:
      document.querySelectorAll('.order-card[data-status="picked_up"]').length +
      document.querySelectorAll('.order-card[data-status="on_the_way"]').length,
    delivered: document.querySelectorAll('.order-card[data-status="delivered"]').length,
    cancelled: document.querySelectorAll('.order-card[data-status="cancelled"]').length,
  };

  const tabs = document.querySelectorAll(".owner-order-tabs .tab");

  if (tabs[0]) tabs[0].innerHTML = `<i class="fa fa-clock"></i><span>Pending (${counts.pending})</span>`;
  if (tabs[1]) tabs[1].innerHTML = `<i class="fa fa-utensils"></i><span>In Progress (${counts.accepted})</span>`;
  if (tabs[2]) tabs[2].innerHTML = `<i class="fa fa-box-open"></i><span>Ready for Pickup (${counts.ready})</span>`;
  if (tabs[3]) tabs[3].innerHTML = `<i class="fa fa-motorcycle"></i><span>In Delivery (${counts.delivery})</span>`;
  if (tabs[4]) tabs[4].innerHTML = `<i class="fa fa-circle-check"></i><span>Completed (${counts.delivered})</span>`;
  if (tabs[5]) tabs[5].innerHTML = `<i class="fa fa-circle-xmark"></i><span>Cancelled (${counts.cancelled})</span>`;
}

function startAutoRefresh() {
  stopAutoRefresh();

  ownerOrdersRefreshTimer = setInterval(() => {
    if (document.hidden || isOwnerOrderUpdating) return;
    loadOwnerOrdersFromBackend({ silent: true });
  }, OWNER_ORDERS_POLL_INTERVAL);
}

function stopAutoRefresh() {
  if (ownerOrdersRefreshTimer) {
    clearInterval(ownerOrdersRefreshTimer);
    ownerOrdersRefreshTimer = null;
  }
}

window.addEventListener("beforeunload", stopAutoRefresh);

function getOwnerOrderStatus(order) {
  const deliveryStatus = String(order.deliveryStatus || "").toLowerCase().trim();
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
  const normalized = normalizeStatus(status);

  const labels = {
    pending: "Pending",
    confirmed: "Confirmed",
    preparing: "Preparing",
    ready_for_pickup: "Ready for Pickup",
    picked_up: "Picked Up",
    on_the_way: "On The Way",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  return labels[normalized] || "Pending";
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
    esewa: "eSewa",
    khalti: "Khalti",
  };

  return map[value] || method || "Cash on Delivery";
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return "Just now";

  const time = new Date(timestamp).getTime();

  if (Number.isNaN(time)) return "Just now";

  const diffMinutes = Math.floor((Date.now() - time) / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min${diffMinutes > 1 ? "s" : ""} ago`;

  const hours = Math.floor(diffMinutes / 60);

  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function formatFullDate(timestamp) {
  if (!timestamp) return "Not available";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toTime(timestamp) {
  const time = new Date(timestamp || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getWaitMinutes(order) {
  const time = toTime(order.createdAt);

  if (!time) return 0;

  return Math.max(0, Math.floor((Date.now() - time) / 60000));
}

function getEmptyStateHTML(title, message) {
  return `
    <div class="empty-state">
      <div class="empty-icon">
        <i class="fa-solid fa-clipboard-list"></i>
      </div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function safeCssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return CSS.escape(String(value));
  }

  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
// ======================================================
// FINAL FIX: Reliable owner tab switching
// Paste this at the bottom of ownerOrders.js
// ======================================================

window.switchOwnerOrderTab = function (type) {
  const tabClassMap = {
    pending: "active-pending",
    accepted: "active-accepted",
    ready: "active-ready",
    delivery: "active-delivery",
    delivered: "active-delivered",
    cancelled: "active-cancelled",
  };

  document.querySelectorAll(".owner-order-tabs .tab, .tabs .tab").forEach((button) => {
    Object.values(tabClassMap).forEach((className) => {
      button.classList.remove(className);
    });

    const tabType =
      button.dataset.tab ||
      button.getAttribute("onclick")?.match(/'([^']+)'/)?.[1];

    if (tabType === type) {
      button.classList.add(tabClassMap[type] || "active-pending");
    }
  });

  document.querySelectorAll(".order-section").forEach((section) => {
    section.classList.remove("active");
    section.style.display = "none";
  });

  const target = document.getElementById("section-" + type);

  if (target) {
    target.classList.add("active");
    target.style.display = "block";
  }

  console.log("[ownerOrders.js] Switched to tab:", type);
};

document.addEventListener("click", function (event) {
  const tab = event.target.closest(".owner-order-tabs .tab, .tabs .tab");

  if (!tab) return;

  event.preventDefault();

  let type = tab.dataset.tab;

  if (!type) {
    const onclick = tab.getAttribute("onclick") || "";
    const match = onclick.match(/switchTab\('([^']+)'/);
    type = match ? match[1] : null;
  }

  if (!type) return;

  window.switchOwnerOrderTab(type);
});