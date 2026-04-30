document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireOwnerAuth === "function") {
    if (!requireOwnerAuth()) return;
  }

  renderOwnerOrders();
  updateOrderTabCounts();
  initializeOrderSearch();

  window.addEventListener("storage", (event) => {
    if (
      event.key === "foodExpressOrders" ||
      event.key === "lastOrder" ||
      event.key === "foodExpressOrdersUpdatedAt"
    ) {
      renderOwnerOrders();
      updateOrderTabCounts();
    }
  });
});

const ORDER_STORAGE_KEY = "foodExpressOrders";
const LAST_ORDER_KEY = "lastOrder";
const ORDER_UPDATED_KEY = "foodExpressOrdersUpdatedAt";

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
    return;
  }

  sections.pending.innerHTML = "";
  sections.accepted.innerHTML = "";
  sections.ready.innerHTML = "";
  sections.delivery.innerHTML = "";
  sections.delivered.innerHTML = "";
  sections.cancelled.innerHTML = "";

  const ownerRestaurant = getCurrentOwnerRestaurant();
  const allOrders = readJson(ORDER_STORAGE_KEY, []);
  const filteredOrders = filterOrdersForCurrentRestaurant(
    allOrders,
    ownerRestaurant
  );
  const searchedOrders = applySearchFilter(filteredOrders);

  if (!searchedOrders.length) {
    const emptyMessage = ownerRestaurant.restaurantName
      ? `No orders found for ${ownerRestaurant.restaurantName}.`
      : "No orders found for this restaurant yet.";

    sections.pending.innerHTML = getEmptyStateHTML("No orders yet", emptyMessage);
    updateOrderTabCounts();
    return;
  }

  const sortedOrders = [...searchedOrders].sort((a, b) => {
    const aTime = new Date(a.createdAt || a.timestamp || 0).getTime();
    const bTime = new Date(b.createdAt || b.timestamp || 0).getTime();
    return bTime - aTime;
  });

  sortedOrders.forEach((order) => {
    const normalizedStatus = normalizeStatus(order.status);
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
    }
  });

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

  attachOrderActions();
  updateOrderTabCounts();
}

function createOrderCardHTML(order, status) {
  const orderId = order.id || order.orderId || order.orderNumber || Date.now();
  const orderNumber = order.orderNumber || order.orderId || order.id || "N/A";

  const customerName =
    order.customerName ||
    order.fullName ||
    order.customer_name ||
    order.name ||
    "Guest User";

  const customerPhone =
    order.phoneNumber || order.phone || order.phone_number || "No phone";

  const customerAddress = buildCustomerAddress(order);
  const total = Number(order.total || 0).toFixed(2);
  const orderTime = formatTimeAgo(order.createdAt || order.timestamp);
  const image = getOrderImage(order);

  const itemsHTML =
    Array.isArray(order.items) && order.items.length
      ? order.items
          .map((item) => {
            const quantity = Number(item.quantity || item.qty || 1);
            const itemName = item.name || item.title || "Food Item";
            return `<div class="order-item">${quantity}x ${escapeHtml(
              itemName
            )}</div>`;
          })
          .join("")
      : `<div class="order-item">No items found</div>`;

  const badgeInfo = statusBadgeMap[status] || statusBadgeMap.pending;

  return `
    <div class="order-card" data-order-id="${escapeHtml(
      String(orderId)
    )}" data-status="${escapeHtml(status)}">
      <img
        src="${escapeHtml(image)}"
        alt="Order Image"
        onerror="this.src='https://via.placeholder.com/400x300?text=FoodExpress'"
      />

      <div class="order-body">
        <div class="order-top">
          <div>
            <div class="order-id">#${escapeHtml(String(orderNumber))}</div>
            <div class="order-time">${escapeHtml(orderTime)}</div>
          </div>
          <span class="badge ${badgeInfo.css}">${badgeInfo.label}</span>
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

        <div class="order-footer">
          <div>
            <div class="total-label">Total Amount</div>
            <div class="total-amount">$${total}</div>
          </div>

          <div class="actions">
            ${getActionButtonsHTML(status)}
          </div>
        </div>
      </div>
    </div>
  `;
}

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
    `;
  }

  if (status === "picked_up") {
    return `
      <button class="btn-waiting-rider" type="button" disabled>
        <i class="fa fa-motorcycle"></i> Picked Up by Rider
      </button>
    `;
  }

  if (status === "on_the_way") {
    return `
      <button class="btn-waiting-rider" type="button" disabled>
        <i class="fa fa-location-arrow"></i> Rider On The Way
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

    const rejectBtn = card.querySelector(".btn-reject");
    const confirmBtn = card.querySelector(".btn-confirm");
    const prepareBtn = card.querySelector(".btn-prepare");
    const readyPickupBtn = card.querySelector(".btn-ready-pickup");
    const viewBtn = card.querySelector(".btn-view");

    rejectBtn?.addEventListener("click", () => {
      updateOrderStatus(orderId, "cancelled");
    });

    confirmBtn?.addEventListener("click", () => {
      updateOrderStatus(orderId, "confirmed");
    });

    prepareBtn?.addEventListener("click", () => {
      updateOrderStatus(orderId, "preparing");
    });

    readyPickupBtn?.addEventListener("click", () => {
      updateOrderStatus(orderId, "ready_for_pickup");
    });

    viewBtn?.addEventListener("click", () => {
      const orderNumber =
        card.dataset.orderId ||
        card.querySelector(".order-id")?.textContent?.replace("#", "").trim();

      if (orderNumber) {
        window.location.href = `track-order.html?order=${encodeURIComponent(
          orderNumber
        )}`;
      }
    });
  });
}

async function updateOrderStatus(orderId, nextStatus) {
  const orders = readJson(ORDER_STORAGE_KEY, []);

  const index = orders.findIndex((order) => {
    return (
      String(order.id) === String(orderId) ||
      String(order.orderId) === String(orderId) ||
      String(order.orderNumber) === String(orderId)
    );
  });

  if (index === -1) {
    alert("Order not found.");
    return;
  }

  const currentOrder = orders[index];
  const previousStatus = normalizeStatus(currentOrder.status);

  const backendOrderId = currentOrder.id || currentOrder.orderId;

  if (!backendOrderId) {
    alert("This order does not have a valid backend order ID.");
    return;
  }

  try {
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
      throw new Error(result.message || "Failed to update order status.");
    }

    currentOrder.status = nextStatus;
    currentOrder.updatedAt = new Date().toISOString();

    if (!Array.isArray(currentOrder.statusHistory)) {
      currentOrder.statusHistory = [];
    }

    currentOrder.statusHistory.push({
      status: nextStatus,
      time: new Date().toISOString(),
    });

    if (
      nextStatus === "delivered" &&
      previousStatus !== "delivered" &&
      !currentOrder.pointsAwarded
    ) {
      if (typeof window.awardPointsFromOrder === "function") {
        window.awardPointsFromOrder(currentOrder);
      }

      currentOrder.pointsAwarded = true;
    }

    orders[index] = currentOrder;
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orders));

    const lastOrder = readJson(LAST_ORDER_KEY, null);
    if (
      lastOrder &&
      (String(lastOrder.id) === String(currentOrder.id) ||
        String(lastOrder.orderId) === String(currentOrder.orderId) ||
        String(lastOrder.orderNumber) === String(currentOrder.orderNumber))
    ) {
      localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(currentOrder));
    }

    localStorage.setItem(ORDER_UPDATED_KEY, String(Date.now()));

    if (nextStatus === "delivered" && result.delivered_email_queued) {
      console.log("Delivered email queued successfully.");
    }

    renderOwnerOrders();
  } catch (error) {
    console.error("Order status update failed:", error);
    alert(`Could not update order status: ${error.message}`);
  }
}

function updateOrderTabCounts() {
  const counts = {
    pending: document.querySelectorAll('.order-card[data-status="pending"]').length,

    accepted:
      document.querySelectorAll('.order-card[data-status="confirmed"]').length +
      document.querySelectorAll('.order-card[data-status="preparing"]').length,

    ready: document.querySelectorAll(
      '.order-card[data-status="ready_for_pickup"]'
    ).length,

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
      order.orderNumber || order.orderId || order.id || ""
    ).toLowerCase();

    const customerName = String(
      order.customerName ||
        order.customer_name ||
        order.fullName ||
        order.name ||
        ""
    ).toLowerCase();

    const customerPhone = String(
      order.phoneNumber || order.phone_number || order.phone || ""
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

function filterOrdersForCurrentRestaurant(orders, ownerRestaurant) {
  if (!ownerRestaurant.restaurantId && !ownerRestaurant.restaurantName) {
    return orders;
  }

  return orders.filter((order) => {
    const orderRestaurantId = String(
      order.restaurantId || order.restaurant_id || ""
    ).trim();

    const orderRestaurantName = String(
      order.restaurantName || order.restaurant_name || ""
    )
      .trim()
      .toLowerCase();

    const ownerRestaurantId = String(ownerRestaurant.restaurantId || "").trim();

    const ownerRestaurantName = String(ownerRestaurant.restaurantName || "")
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

function getCurrentOwnerRestaurant() {
  const possibleSources = [
    readJson("foodExpressCurrentOwner", null),
    readJson("currentOwner", null),
    readJson("ownerProfile", null),
    readJson("restaurantOwnerProfile", null),
    readJson("ownerData", null),
  ];

  for (const source of possibleSources) {
    if (!source) continue;

    const restaurantId =
      source.restaurantId ||
      source.restaurant_id ||
      source.assignedRestaurantId ||
      source.assigned_restaurant_id ||
      "";

    const restaurantName =
      source.restaurantName ||
      source.restaurant_name ||
      source.businessName ||
      source.restaurant ||
      "";

    if (restaurantId || restaurantName) {
      return {
        restaurantId: String(restaurantId || ""),
        restaurantName: String(restaurantName || ""),
      };
    }
  }

  const fallbackRestaurantId = localStorage.getItem("ownerRestaurantId") || "";
  const fallbackRestaurantName =
    localStorage.getItem("ownerRestaurantName") || "";

  return {
    restaurantId: String(fallbackRestaurantId),
    restaurantName: String(fallbackRestaurantName),
  };
}

function normalizeStatus(status) {
  const value = String(status || "pending").toLowerCase();

  if (value === "accepted") return "confirmed";
  return value;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
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

function formatTimeAgo(timestamp) {
  if (!timestamp) return "Just now";

  const time = new Date(timestamp).getTime();
  const now = Date.now();
  const diffMinutes = Math.floor((now - time) / (1000 * 60));

  if (diffMinutes < 1) return "Just now";

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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

window.updateOrderTabCounts = updateOrderTabCounts;
window.attachOrderActions = attachOrderActions;