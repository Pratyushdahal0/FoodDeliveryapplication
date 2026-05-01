const ORDER_HISTORY_KEY = "foodExpressOrders";

const STATUS_FLOW = [
  "pending",
  "confirmed",
  "preparing",
  "rider_assigned",
  "ready_for_pickup",
  "picked_up",
  "on_the_way",
  "delivered",
];

const DEFAULT_IMAGE = "https://via.placeholder.com/80?text=Food";

let latestOrder = null;
let syncInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  initializeTrackingPage();
});

function initializeTrackingPage() {
  latestOrder = getLatestTrackedOrder();

  if (!latestOrder || !latestOrder.items || !latestOrder.items.length) {
    showEmptyState();
    return;
  }

  renderTrackingPage(latestOrder);
  startTrackingSync();
}

function startTrackingSync() {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(() => {
    const updatedOrder = getLatestTrackedOrder();
    if (!updatedOrder) return;

    const oldRestaurantStatus = getOrderStatus(latestOrder);
    const oldDeliveryStatus = getDeliveryStatus(latestOrder);

    const newRestaurantStatus = getOrderStatus(updatedOrder);
    const newDeliveryStatus = getDeliveryStatus(updatedOrder);

    latestOrder = updatedOrder;

    if (
      oldRestaurantStatus !== newRestaurantStatus ||
      oldDeliveryStatus !== newDeliveryStatus
    ) {
      renderTrackingPage(latestOrder);
    } else {
      hydrateLatestOrder();
      updateStepUI(latestOrder);
    }
  }, 1500);

  window.addEventListener("storage", (event) => {
    if (
      event.key === "foodExpressOrders" ||
      event.key === "lastOrder" ||
      event.key === "foodExpressOrdersUpdatedAt"
    ) {
      const updatedOrder = getLatestTrackedOrder();
      if (!updatedOrder) return;

      latestOrder = updatedOrder;
      renderTrackingPage(latestOrder);
    }
  });
}

function getLatestTrackedOrder() {
  const params = new URLSearchParams(window.location.search);
  const queryOrder = params.get("order");

  const lastOrder = readJson("lastOrder", null);
  const allOrders = readJson(ORDER_HISTORY_KEY, []);

  if (queryOrder && Array.isArray(allOrders)) {
    const byQuery = allOrders.find((order) => {
      return (
        String(order.id || "") === String(queryOrder) ||
        String(order.orderId || "") === String(queryOrder) ||
        String(order.orderNumber || "") === String(queryOrder) ||
        String(order.order_number || "") === String(queryOrder)
      );
    });

    if (byQuery) return byQuery;
  }

  if (!lastOrder) return null;

  const matched = allOrders.find((order) => {
    return (
      (order.id && lastOrder.id && String(order.id) === String(lastOrder.id)) ||
      (order.orderId &&
        lastOrder.orderId &&
        String(order.orderId) === String(lastOrder.orderId)) ||
      (order.orderNumber &&
        lastOrder.orderNumber &&
        String(order.orderNumber) === String(lastOrder.orderNumber))
    );
  });

  return matched || lastOrder;
}

function renderTrackingPage(order) {
  latestOrder = order;
  hydrateLatestOrder();
  updateStepUI(latestOrder);
}

function showEmptyState() {
  const empty = document.getElementById("emptyOrderState");
  const content = document.getElementById("trackContent");

  if (empty) empty.style.display = "block";
  if (content) content.style.display = "none";
}

function hydrateLatestOrder() {
  setText(
    "orderNumberBadge",
    latestOrder.orderNumber || latestOrder.order_number || latestOrder.orderId || "#ORDER"
  );

  setText(
    "restaurantName",
    latestOrder.restaurantName || latestOrder.restaurant_name || "Restaurant"
  );

  setText(
    "deliveryAddress",
    `${latestOrder.address || ""}${
      latestOrder.city ? ", " + latestOrder.city : ""
    }`.trim() || "Delivery address not available"
  );

  setText("deliveryFullText", buildDeliveryText(latestOrder));
  setText("etaValue", latestOrder.estimatedDelivery || latestOrder.eta || "30–40 min");

  setText(
    "paymentMethodValue",
    formatPaymentMethod(latestOrder.paymentMethod || latestOrder.payment_method)
  );

  const itemCount = Number(
    latestOrder.itemCount || countItems(latestOrder.items)
  );

  setText("itemCountValue", `${itemCount} item${itemCount !== 1 ? "s" : ""}`);

  setText(
    "placedTimeValue",
    formatPlacedTime(latestOrder.timestamp || latestOrder.createdAt || latestOrder.created_at)
  );

  renderSummaryItems();
  renderSummaryValues();

  setStatusPill(latestOrder);
  fillStepTimesFromHistory(latestOrder);
  setLiveNote(latestOrder);
  renderRiderInfo(latestOrder);
}

function renderSummaryItems() {
  const container = document.getElementById("summaryItems");
  if (!container) return;

  container.innerHTML = (latestOrder.items || [])
    .map((item) => {
      const quantity = Number(item.quantity || 0);
      const price = Number(item.price || 0);
      const lineTotal = quantity * price;

      return `
        <div class="summary-item">
          <img 
            src="${item.image_url || item.image || DEFAULT_IMAGE}" 
            alt="${escapeHtml(item.name || "Food item")}" 
            onerror="this.src='${DEFAULT_IMAGE}'" 
          />
          <div>
            <div class="summary-item-name">${escapeHtml(
              item.name || item.product_name || "Unnamed Item"
            )}</div>
            <div class="summary-item-meta">Qty ${quantity} • $${price.toFixed(
        2
      )} each</div>
          </div>
          <div class="summary-item-price">$${lineTotal.toFixed(2)}</div>
        </div>
      `;
    })
    .join("");
}

function renderSummaryValues() {
  const subtotal = Number(latestOrder.subtotal || sumSubtotal(latestOrder.items));
  const tax = Number(latestOrder.tax || 0);
  const deliveryFee = Number(
    latestOrder.deliveryFee || latestOrder.delivery_fee || 5
  );
  const discountAmount = Number(
    latestOrder.discountAmount || latestOrder.discount_amount || 0
  );
  const total = Number(
    latestOrder.total ||
      Math.max(0, subtotal + tax + deliveryFee - discountAmount)
  );

  setText("subtotalValue", `$${subtotal.toFixed(2)}`);
  setText("taxValue", `$${tax.toFixed(2)}`);
  setText("deliveryFeeValue", `$${deliveryFee.toFixed(2)}`);
  setText("totalValue", `$${total.toFixed(2)}`);

  const discountRow = document.getElementById("discountRow");
  const discountValue = document.getElementById("discountValue");

  if (discountAmount > 0) {
    if (discountRow) discountRow.style.display = "flex";
    if (discountValue) discountValue.textContent = `-$${discountAmount.toFixed(2)}`;
  } else {
    if (discountRow) discountRow.style.display = "none";
    if (discountValue) discountValue.textContent = "-$0.00";
  }
}

/* ================================
   NEW REAL FLOW STATUS HELPERS
================================ */

function getOrderStatus(order = latestOrder) {
  return String(order?.status || "pending").toLowerCase();
}

function getDeliveryStatus(order = latestOrder) {
  return String(order?.deliveryStatus || order?.delivery_status || "searching").toLowerCase();
}

function getRiderName(order = latestOrder) {
  return (
    order?.riderName ||
    order?.rider_name ||
    order?.driverName ||
    order?.driver_name ||
    ""
  );
}

function getVisualStatus(order = latestOrder) {
  const orderStatus = getOrderStatus(order);
  const deliveryStatus = getDeliveryStatus(order);

  if (orderStatus === "delivered" || deliveryStatus === "delivered") {
    return "delivered";
  }

  if (deliveryStatus === "on_the_way") return "on_the_way";
  if (deliveryStatus === "picked_up") return "picked_up";

  if (orderStatus === "ready_for_pickup") return "ready_for_pickup";

  if (deliveryStatus === "assigned") return "rider_assigned";

  if (orderStatus === "preparing") return "preparing";
  if (orderStatus === "confirmed") return "confirmed";

  return "pending";
}

function updateStepUI(orderOrStatus) {
  const order =
    typeof orderOrStatus === "string"
      ? { status: orderOrStatus, delivery_status: latestOrder?.delivery_status }
      : orderOrStatus || latestOrder;

  const visualStatus = getVisualStatus(order);
  const currentIndex = STATUS_FLOW.indexOf(visualStatus);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const isDelivered = visualStatus === "delivered";

  document.querySelectorAll(".step-item").forEach((stepEl, index) => {
    stepEl.classList.remove("active", "done");

    if (isDelivered) {
      stepEl.classList.add("done");
      return;
    }

    if (index < safeIndex) {
      stepEl.classList.add("done");
    } else if (index === safeIndex) {
      stepEl.classList.add("active");
    }
  });

  const fillPercent = isDelivered
    ? 100
    : (safeIndex / (STATUS_FLOW.length - 1)) * 100;

  const progressFill = document.getElementById("progressFill");
  if (progressFill) progressFill.style.width = `${fillPercent}%`;

  setStatusPill(order);
  setLiveNote(order);
}

function setStatusPill(orderOrStatus) {
  const pill = document.getElementById("statusPill");
  if (!pill) return;

  const order =
    typeof orderOrStatus === "string"
      ? { status: orderOrStatus }
      : orderOrStatus || latestOrder;

  const visualStatus = getVisualStatus(order);

  pill.className = `status-pill status-${visualStatus}`;
  pill.textContent = formatStatus(visualStatus);
}

function setLiveNote(orderOrStatus) {
  const note = document.getElementById("liveNote");
  if (!note) return;

  const order =
    typeof orderOrStatus === "string"
      ? { status: orderOrStatus }
      : orderOrStatus || latestOrder;

  const orderStatus = getOrderStatus(order);
  const deliveryStatus = getDeliveryStatus(order);
  const riderName = getRiderName(order);

  if (orderStatus === "delivered" || deliveryStatus === "delivered") {
    note.textContent = "Your order has been delivered successfully.";
    return;
  }

  if (deliveryStatus === "on_the_way") {
    note.textContent = riderName
      ? `${riderName} is on the way to your delivery address.`
      : "Good news — your rider is on the way to your delivery address.";
    return;
  }

  if (deliveryStatus === "picked_up") {
    note.textContent = riderName
      ? `${riderName} has picked up your order from the restaurant.`
      : "Your rider has picked up your order from the restaurant.";
    return;
  }

  if (orderStatus === "ready_for_pickup") {
    note.textContent = riderName
      ? `Your food is ready. ${riderName} can now pick it up.`
      : "Your food is ready and waiting for rider pickup.";
    return;
  }

  if (deliveryStatus === "assigned") {
    note.textContent = riderName
      ? `Your rider ${riderName} has accepted the delivery and is waiting for the restaurant.`
      : "A rider has accepted your delivery and is waiting for the restaurant.";
    return;
  }

  if (orderStatus === "preparing") {
    note.textContent = "Your order is being freshly prepared right now.";
    return;
  }

  if (orderStatus === "confirmed") {
    note.textContent =
      "The restaurant has confirmed your order and we are matching your delivery with a nearby rider.";
    return;
  }

  note.textContent =
    "Your order has been created, sent to the restaurant, and rider matching has started.";
}

function renderRiderInfo(order) {
  const riderName = getRiderName(order);
  const deliveryStatus = getDeliveryStatus(order);

  const existing = document.getElementById("riderInfoCard");

  if (!riderName || deliveryStatus === "searching") {
    if (existing) existing.remove();
    return;
  }

  const html = `
    <div id="riderInfoCard" class="track-info-card" style="margin-top:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;border-radius:999px;background:#fff1f1;color:#e53935;display:flex;align-items:center;justify-content:center;font-weight:900;">
          ${escapeHtml(getInitials(riderName))}
        </div>
        <div>
          <div style="font-weight:900;color:#111827;">Rider assigned</div>
          <div style="color:#6b7280;font-size:0.92rem;">
            ${escapeHtml(riderName)}
            ${
              order.riderPhone || order.rider_phone
                ? ` • ${escapeHtml(order.riderPhone || order.rider_phone)}`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;

  const liveNote = document.getElementById("liveNote");

  if (existing) {
    existing.outerHTML = html;
    return;
  }

  if (liveNote) {
    liveNote.insertAdjacentHTML("afterend", html);
  }
}

function fillStepTimesFromHistory(order) {
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const deliveryHistory = Array.isArray(order.deliveryHistory)
    ? order.deliveryHistory
    : [];

  const historyMap = {};

  history.forEach((entry) => {
    if (entry?.status && entry?.time && !historyMap[entry.status]) {
      historyMap[entry.status] = entry.time;
    }
  });

  deliveryHistory.forEach((entry) => {
    if (entry?.status && entry?.time && !historyMap[entry.status]) {
      historyMap[entry.status] = entry.time;
    }
  });

  if (order.rider_assigned_at && !historyMap.rider_assigned) {
    historyMap.rider_assigned = order.rider_assigned_at;
  }

  if (order.riderAssignedAt && !historyMap.rider_assigned) {
    historyMap.rider_assigned = order.riderAssignedAt;
  }

  const baseTime =
    order.timestamp || order.createdAt || order.created_at || new Date().toISOString();

  STATUS_FLOW.forEach((status) => {
    const el = document.getElementById(`time-${status}`);
    if (!el) return;

    if (status === "pending") {
      el.textContent = formatClockTime(new Date(baseTime));
      return;
    }

   if (status === "rider_assigned") {
  const assignedTime =
    historyMap.rider_assigned ||
    historyMap.assigned ||
    order.rider_assigned_at ||
    order.riderAssignedAt ||
    order.updatedAt ||
    order.updated_at ||
    order.timestamp ||
    order.createdAt ||
    order.created_at;

  el.textContent = assignedTime
    ? formatClockTime(new Date(assignedTime))
    : "--:--";
  return;
}

    if (historyMap[status]) {
      el.textContent = formatClockTime(new Date(historyMap[status]));
    } else {
      el.textContent = "--:--";
    }
  });
}

/* ================================
   ACTIONS
================================ */

function reorderLatestOrder() {
  if (!latestOrder || !latestOrder.items || !latestOrder.items.length) {
    alert("No previous order is available to reorder.");
    return;
  }

  const items = latestOrder.items.map((item) => ({
    id: String(item.id || ""),
    name: item.name || item.product_name || "Unnamed Item",
    price: Number(item.price || 0),
    image_url: item.image_url || item.image || DEFAULT_IMAGE,
    quantity: Number(item.quantity || 1),
    restaurant_id: String(item.restaurant_id || latestOrder.restaurantId || ""),
    restaurant_name:
      item.restaurant_name || latestOrder.restaurantName || "Restaurant",
  }));

  localStorage.setItem("foodDeliveryCartItems", JSON.stringify(items));

  const count = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  localStorage.setItem("foodDeliveryCartCount", String(count));

  if (typeof window.updateCartCount === "function") {
    window.updateCartCount();
  }

  alert("Your last order has been added back to cart.");
  window.location.href = "cart.html";
}

function goBackToDashboard() {
  window.location.href = "dashboard.html";
}

/* ================================
   FORMATTERS
================================ */

function formatStatus(status) {
  const map = {
    pending: "Order Received",
    confirmed: "Restaurant Confirmed",
    preparing: "Preparing",
    rider_assigned: "Rider Assigned",
    ready_for_pickup: "Ready for Pickup",
    picked_up: "Picked Up",
    on_the_way: "On the Way",
    delivered: "Delivered",
  };

  return map[status] || "Order Received";
}

function formatPaymentMethod(value) {
  const map = {
    cash: "Cash on Delivery",
    card: "Card Payment",
    digital: "Digital Wallet",
  };

  return map[value] || "Cash on Delivery";
}

function formatPlacedTime(timestamp) {
  if (!timestamp) return "Just now";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Just now";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatClockTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "--:--";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildDeliveryText(order) {
  const addressParts = [
    order.address,
    order.city,
    order.postalCode || order.postal_code,
  ].filter(Boolean);

  const note = order.deliveryNote || order.delivery_note
    ? ` Delivery note: ${order.deliveryNote || order.delivery_note}.`
    : "";

  return `${order.fullName || order.customerName || order.customer_name || "Customer"} • ${
    order.phoneNumber || order.phone || order.phone_number || "No phone"
  } • ${addressParts.join(", ")}.${note}`;
}

function countItems(items) {
  return (items || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
}

function sumSubtotal(items) {
  return (items || []).reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.quantity || 0);
  }, 0);
}

function getInitials(name) {
  const text = String(name || "").trim();
  if (!text) return "R";

  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

window.reorderLatestOrder = reorderLatestOrder;
window.goBackToDashboard = goBackToDashboard;