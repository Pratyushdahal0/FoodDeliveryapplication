const ORDER_HISTORY_KEY = "foodExpressOrders";
const STATUS_FLOW = [
  "pending",
  "confirmed",
  "preparing",
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
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  syncInterval = setInterval(() => {
    const updatedOrder = getLatestTrackedOrder();
    if (!updatedOrder) return;

    const oldStatus = latestOrder?.status;
    const newStatus = updatedOrder.status;

    latestOrder = updatedOrder;

    if (oldStatus !== newStatus) {
      renderTrackingPage(latestOrder);
    } else {
      // keep UI data fresh even if status didn’t change
      hydrateLatestOrder();
      updateStepUI(latestOrder.status || "pending");
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
  const lastOrder = readJson("lastOrder", null);
  if (!lastOrder) return null;

  const allOrders = readJson(ORDER_HISTORY_KEY, []);
  const matched = allOrders.find((order) => {
    return (
      (order.id && lastOrder.id && String(order.id) === String(lastOrder.id)) ||
      (order.orderId && lastOrder.orderId && String(order.orderId) === String(lastOrder.orderId)) ||
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
  updateStepUI(latestOrder.status || "pending");
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
    latestOrder.orderNumber || latestOrder.orderId || "#ORDER"
  );
  setText("restaurantName", latestOrder.restaurantName || "Restaurant");
  setText(
    "deliveryAddress",
    `${latestOrder.address || ""}${latestOrder.city ? ", " + latestOrder.city : ""}`.trim() ||
      "Delivery address not available"
  );

  setText("deliveryFullText", buildDeliveryText(latestOrder));
  setText("etaValue", latestOrder.estimatedDelivery || "30–40 min");
  setText(
    "paymentMethodValue",
    formatPaymentMethod(latestOrder.paymentMethod)
  );

  const itemCount = Number(latestOrder.itemCount || countItems(latestOrder.items));
  setText("itemCountValue", `${itemCount} item${itemCount !== 1 ? "s" : ""}`);
  setText("placedTimeValue", formatPlacedTime(latestOrder.timestamp || latestOrder.createdAt));

  renderSummaryItems();
  renderSummaryValues();
  setStatusPill(latestOrder.status || "pending");
  fillStepTimesFromHistory(latestOrder);
  setLiveNote(latestOrder.status || "pending");
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
          <img src="${item.image_url || DEFAULT_IMAGE}" alt="${escapeHtml(item.name || "Food item")}" onerror="this.src='${DEFAULT_IMAGE}'" />
          <div>
            <div class="summary-item-name">${escapeHtml(item.name || "Unnamed Item")}</div>
            <div class="summary-item-meta">Qty ${quantity} • $${price.toFixed(2)} each</div>
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
  const deliveryFee = Number(latestOrder.deliveryFee || latestOrder.delivery_fee || 5);
  const discountAmount = Number(
    latestOrder.discountAmount || latestOrder.discount_amount || 0
  );
  const total = Number(
    latestOrder.total || Math.max(0, subtotal + tax + deliveryFee - discountAmount)
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

function updateStepUI(status) {
  const currentIndex = STATUS_FLOW.indexOf(status);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;

  document.querySelectorAll(".step-item").forEach((stepEl, index) => {
    stepEl.classList.remove("active", "done");

    if (index < safeIndex) {
      stepEl.classList.add("done");
    } else if (index === safeIndex) {
      stepEl.classList.add("active");
    }
  });

  const fillPercent = (safeIndex / (STATUS_FLOW.length - 1)) * 100;
  const progressFill = document.getElementById("progressFill");
  if (progressFill) {
    progressFill.style.width = `${fillPercent}%`;
  }

  setStatusPill(status);
  setLiveNote(status);
}

function setStatusPill(status) {
  const pill = document.getElementById("statusPill");
  if (!pill) return;

  pill.className = `status-pill status-${status}`;
  pill.textContent = formatStatus(status);
}

function setLiveNote(status) {
  const note = document.getElementById("liveNote");
  if (!note) return;

  const messages = {
    pending:
      "Your order has been created and is waiting for the restaurant to confirm it.",
    confirmed:
      "The restaurant has confirmed your order and is getting started.",
    preparing:
      "Your order is being freshly prepared right now.",
    on_the_way:
      "Good news — your rider is on the way to your delivery address.",
    delivered:
      "Your order has been delivered successfully.",
  };

  note.textContent = messages[status] || messages.pending;
}

function fillStepTimesFromHistory(order) {
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const historyMap = {};

  history.forEach((entry) => {
    if (entry?.status && entry?.time && !historyMap[entry.status]) {
      historyMap[entry.status] = entry.time;
    }
  });

  const baseTime = order.timestamp || order.createdAt || new Date().toISOString();

  STATUS_FLOW.forEach((status) => {
    const el = document.getElementById(`time-${status}`);
    if (!el) return;

    if (status === "pending") {
      el.textContent = formatClockTime(new Date(baseTime));
      return;
    }

    if (historyMap[status]) {
      el.textContent = formatClockTime(new Date(historyMap[status]));
    } else {
      el.textContent = "--:--";
    }
  });
}

function reorderLatestOrder() {
  if (!latestOrder || !latestOrder.items || !latestOrder.items.length) {
    alert("No previous order is available to reorder.");
    return;
  }

  const items = latestOrder.items.map((item) => ({
    id: String(item.id || ""),
    name: item.name || "Unnamed Item",
    price: Number(item.price || 0),
    image_url: item.image_url || DEFAULT_IMAGE,
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

function formatStatus(status) {
  const map = {
    pending: "Pending",
    confirmed: "Confirmed",
    preparing: "Preparing",
    on_the_way: "On the way",
    delivered: "Delivered",
  };

  return map[status] || "Pending";
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
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatClockTime(date) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildDeliveryText(order) {
  const addressParts = [order.address, order.city, order.postalCode].filter(Boolean);
  const note = order.deliveryNote ? ` Delivery note: ${order.deliveryNote}.` : "";

  return `${order.fullName || order.customerName || "Customer"} • ${order.phoneNumber || order.phone || "No phone"} • ${addressParts.join(", ")}.${note}`;
}

function countItems(items) {
  return (items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function sumSubtotal(items) {
  return (items || []).reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.quantity || 0);
  }, 0);
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