const ORDER_STATUS_STEPS = [
  "pending",
  "confirmed",
  "preparing",
  "on_the_way",
  "delivered"
];

const ORDER_STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  on_the_way: "On The Way",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80";

function formatCurrency(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function getLastOrder() {
  try {
    return JSON.parse(localStorage.getItem("lastOrder") || "null");
  } catch (error) {
    console.error("Failed to read lastOrder:", error);
    return null;
  }
}

function getStatusIndex(status) {
  return ORDER_STATUS_STEPS.indexOf(status);
}

function renderStatus(status) {
  const statusPill = document.getElementById("statusPill");
  const progressFill = document.getElementById("progressFill");
  const stepEls = document.querySelectorAll(".step-item");

  const normalizedStatus = ORDER_STATUS_STEPS.includes(status) ? status : "pending";
  const currentIndex = getStatusIndex(normalizedStatus);

  if (statusPill) {
    statusPill.textContent = ORDER_STATUS_LABELS[normalizedStatus] || "Pending";
  }

  stepEls.forEach((stepEl, index) => {
    stepEl.classList.remove("active", "done");

    if (index < currentIndex) {
      stepEl.classList.add("done");
    } else if (index === currentIndex) {
      stepEl.classList.add("active");
    }
  });

  if (progressFill) {
    const progressPercent =
      currentIndex <= 0
        ? 10
        : Math.min(((currentIndex + 1) / ORDER_STATUS_STEPS.length) * 100, 100);

    progressFill.style.width = `${progressPercent}%`;
  }
}

function renderSummaryItems(items) {
  const summaryItems = document.getElementById("summaryItems");
  if (!summaryItems) return;

  if (!Array.isArray(items) || items.length === 0) {
    summaryItems.innerHTML = `<p>No order items found.</p>`;
    return;
  }

  summaryItems.innerHTML = items
    .map((item) => {
      const imageUrl = item.image_url || FALLBACK_IMAGE;
      const quantity = Number(item.quantity || 1);

      return `
        <div class="summary-item">
          <img src="${imageUrl}" alt="${escapeHtml(item.name || "Food item")}" onerror="this.src='${FALLBACK_IMAGE}'" />
          <div>
            <h4>${escapeHtml(item.name || "Unnamed item")}</h4>
            <p>Qty: ${quantity}</p>
            <p>${formatCurrency(item.price)}</p>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderOrder() {
  const lastOrder = getLastOrder();

  if (!lastOrder) {
    document.getElementById("orderNumberBadge").textContent = "No Order";
    document.getElementById("restaurantName").textContent = "No recent order found";
    document.getElementById("deliveryAddress").textContent =
      "Place an order first to track it here.";
    document.getElementById("summaryItems").innerHTML =
      "<p>No recent order found.</p>";
    return;
  }

  const orderNumber =
    lastOrder.orderNumber || lastOrder.order_number || "ORDER";
  const items = Array.isArray(lastOrder.items) ? lastOrder.items : [];
  const firstItem = items[0] || {};
  const restaurantName =
    firstItem.restaurant_name ||
    lastOrder.restaurant_name ||
    "Demo Restaurant";

  const addressText = [
    lastOrder.address || "",
    lastOrder.city || "",
    lastOrder.postalCode || lastOrder.postal_code || ""
  ]
    .filter(Boolean)
    .join(", ");

  document.getElementById("orderNumberBadge").textContent = `#${orderNumber}`;
  document.getElementById("restaurantName").textContent = restaurantName;
  document.getElementById("deliveryAddress").textContent =
    addressText || "Delivery address unavailable";

  document.getElementById("subtotalValue").textContent = formatCurrency(
    lastOrder.subtotal || lastOrder.checkoutSubtotal || 0
  );
  document.getElementById("taxValue").textContent = formatCurrency(
    lastOrder.tax || lastOrder.checkoutTax || 0
  );
  document.getElementById("deliveryFeeValue").textContent = formatCurrency(
    lastOrder.delivery_fee || 5
  );
  document.getElementById("totalValue").textContent = formatCurrency(
    lastOrder.total || 0
  );

  renderSummaryItems(items);
  renderStatus(lastOrder.status || "pending");
}

function goBackToDashboard() {
  window.location.href = "dashboard.html";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

document.addEventListener("DOMContentLoaded", renderOrder);