const API_URL = "../../backend/controllers/OwnerDashboardController.php";

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`[ownerdashboard.js] Failed to read ${key}`, error);
    return fallback;
  }
}

function getOwnerRestaurantInfo() {
  const owner = readJson("foodExpressCurrentOwner", {});

  const restaurantId =
    localStorage.getItem("ownerRestaurantId") ||
    owner.restaurantId ||
    owner.restaurant_id ||
    "1";

  const restaurantName =
    localStorage.getItem("ownerRestaurantName") ||
    owner.restaurantName ||
    owner.restaurant_name ||
    "Spicy Grill";

  return {
    restaurantId: String(restaurantId),
    restaurantName: String(restaurantName),
  };
}

const ownerRestaurant = getOwnerRestaurantInfo();
const restaurantId = ownerRestaurant.restaurantId;

const totalOrdersEl = document.getElementById("totalOrders");
const totalEarningsEl = document.getElementById("totalEarnings");
const activeOrdersEl = document.getElementById("activeOrders");
const pendingOrdersEl = document.getElementById("pendingOrders");
const weeklyEarningsEl = document.getElementById("weeklyEarnings");
const recentOrdersTableEl = document.getElementById("recentOrdersTable");

function formatCurrency(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderOwnerName() {
  const { restaurantName } = getOwnerRestaurantInfo();
  const displayName = restaurantName || "Restaurant";

  const ownerNameLabel = document.getElementById("ownerNameLabel");
  if (ownerNameLabel) {
    ownerNameLabel.textContent = displayName;
  }

  document.querySelectorAll(".sidebar-profile .name").forEach((el) => {
    el.textContent = displayName;
  });

  document.querySelectorAll(".sidebar-profile .avatar").forEach((el) => {
    el.textContent = displayName.charAt(0).toUpperCase();
  });

  document.querySelectorAll(".profile-btn .avatar").forEach((el) => {
    el.textContent = displayName.charAt(0).toUpperCase();
  });
}

function setupOwnerActions() {
  document.getElementById("ownerQuickAddMenuBtn")?.addEventListener("click", () => {
    window.location.href = "ownerMenu.html";
  });

  document.getElementById("ownerQuickViewOrdersBtn")?.addEventListener("click", () => {
    window.location.href = "ownermanagement.html";
  });

  document.querySelector(".view-all-btn")?.addEventListener("click", () => {
    window.location.href = "ownermanagement.html";
  });
}

function formatTimeAgo(dateString) {
  if (!dateString) return "Just now";

  const now = new Date();
  const orderDate = new Date(dateString);

  if (Number.isNaN(orderDate.getTime())) return "Just now";

  const diffMs = now - orderDate;
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min${minutes > 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function normalizeStatus(status) {
  const s = String(status || "pending").toLowerCase().trim();

  if (s === "accepted") return "confirmed";
  return s;
}

function getStatusClass(status) {
  const s = normalizeStatus(status);

  if (s === "pending") return "pending";

  if (
    s === "confirmed" ||
    s === "preparing" ||
    s === "ready_for_pickup" ||
    s === "picked_up" ||
    s === "on_the_way"
  ) {
    return "progress";
  }

  if (s === "delivered") return "delivered";
  if (s === "cancelled") return "cancelled";

  return "pending";
}

function formatStatus(status) {
  const s = normalizeStatus(status);

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

  return labels[s] || "Pending";
}

function renderRecentOrders(orders) {
  if (!recentOrdersTableEl) return;

  if (!Array.isArray(orders) || orders.length === 0) {
    recentOrdersTableEl.innerHTML = `
      <tr>
        <td colspan="5">No recent orders found for this restaurant.</td>
      </tr>
    `;
    return;
  }

  recentOrdersTableEl.innerHTML = orders
    .map((order) => {
      const orderNumber = order.order_number || order.orderNumber || order.id || "N/A";
      const customerName = order.customer_name || order.customerName || "Guest User";
      const total = order.total || order.total_amount || 0;
      const createdAt = order.created_at || order.createdAt || order.timestamp;
      const status = order.delivery_status || order.status || "pending";

      return `
        <tr>
          <td>
            <div class="order-id">#${escapeHtml(orderNumber)}</div>
            <div class="order-time">${escapeHtml(formatTimeAgo(createdAt))}</div>
          </td>
          <td>
            <span class="customer-name">${escapeHtml(customerName)}</span>
          </td>
          <td>
            <span class="items-text">Order placed</span>
          </td>
          <td>
            <span class="amount">${escapeHtml(formatCurrency(total))}</span>
          </td>
          <td>
            <span class="status-badge ${getStatusClass(status)}">
              ${escapeHtml(formatStatus(status))}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadDashboard() {
  try {
    const currentRestaurant = getOwnerRestaurantInfo();
    const currentRestaurantId = currentRestaurant.restaurantId || "1";

    console.log("[ownerdashboard.js] Loading dashboard for restaurant:", currentRestaurant);

    const res = await fetch(
      `${API_URL}?restaurant_id=${encodeURIComponent(currentRestaurantId)}`
    );

    const raw = await res.text();

    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      console.error("[ownerdashboard.js] Non-JSON dashboard response:", raw);
      throw new Error("Dashboard backend did not return valid JSON.");
    }

    if (!data.success) {
      console.error("Dashboard load failed:", data.message);
      renderRecentOrders([]);
      return;
    }

    const dashboard = data.data || {};

    if (totalOrdersEl) totalOrdersEl.textContent = dashboard.total_orders ?? 0;

    if (totalEarningsEl) {
      totalEarningsEl.textContent = formatCurrency(dashboard.total_earnings);
    }

    if (activeOrdersEl) {
      activeOrdersEl.textContent = dashboard.active_orders ?? 0;
    }

    if (pendingOrdersEl) {
      pendingOrdersEl.textContent = dashboard.pending_orders ?? 0;
    }

    if (weeklyEarningsEl) {
      weeklyEarningsEl.textContent = formatCurrency(dashboard.weekly_earnings);
    }

    renderRecentOrders(dashboard.recent_orders || []);
  } catch (error) {
    console.error("Error loading dashboard:", error);

    if (recentOrdersTableEl) {
      recentOrdersTableEl.innerHTML = `
        <tr>
          <td colspan="5">Failed to load dashboard data.</td>
        </tr>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireOwnerAuth === "function") {
    if (!requireOwnerAuth()) return;
  }

  renderOwnerName();
  setupOwnerActions();
  loadDashboard();
});