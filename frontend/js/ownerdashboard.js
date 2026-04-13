const API_URL = "../../backend/controllers/OwnerDashboardController.php";
const restaurantId = 1; // replace later with logged-in restaurant id

const totalOrdersEl = document.getElementById("totalOrders");
const totalEarningsEl = document.getElementById("totalEarnings");
const activeOrdersEl = document.getElementById("activeOrders");
const pendingOrdersEl = document.getElementById("pendingOrders");
const weeklyEarningsEl = document.getElementById("weeklyEarnings");
const recentOrdersTableEl = document.getElementById("recentOrdersTable");

function formatCurrency(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function formatTimeAgo(dateString) {
  const now = new Date();
  const orderDate = new Date(dateString);
  const diffMs = now - orderDate;

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} mins ago`;
  if (hours < 24) return `${hours} hours ago`;
  return `${days} days ago`;
}

function getStatusClass(status) {
  const s = (status || "").toLowerCase();

  if (s === "pending") return "pending";
  if (s === "confirmed" || s === "preparing" || s === "on_the_way") {
    return "progress";
  }
  if (s === "delivered") return "delivered";

  return "pending";
}

function formatStatus(status) {
  const s = (status || "").toLowerCase();

  if (s === "on_the_way") return "On The Way";
  if (s === "confirmed") return "Confirmed";
  if (s === "preparing") return "Preparing";
  if (s === "delivered") return "Delivered";
  if (s === "cancelled") return "Cancelled";
  return "Pending";
}

function renderRecentOrders(orders) {
  if (!recentOrdersTableEl) return;

  if (!orders || orders.length === 0) {
    recentOrdersTableEl.innerHTML = `
      <tr>
        <td colspan="5">No recent orders found.</td>
      </tr>
    `;
    return;
  }

  recentOrdersTableEl.innerHTML = orders
    .map(
      (order) => `
        <tr>
          <td>
            <div class="order-id">#${order.order_number || order.id}</div>
            <div class="order-time">${formatTimeAgo(order.created_at)}</div>
          </td>
          <td><span class="customer-name">${order.customer_name}</span></td>
          <td><span class="items-text">Order placed</span></td>
          <td><span class="amount">${formatCurrency(order.total)}</span></td>
          <td>
            <span class="status-badge ${getStatusClass(order.status)}">
              ${formatStatus(order.status)}
            </span>
          </td>
        </tr>
      `
    )
    .join("");
}

async function loadDashboard() {
  try {
    const res = await fetch(
      `${API_URL}?restaurant_id=${restaurantId}`
    );
    const data = await res.json();

    if (!data.success) {
      console.error("Dashboard load failed:", data.message);
      return;
    }

    const dashboard = data.data;

    if (totalOrdersEl) totalOrdersEl.textContent = dashboard.total_orders ?? 0;
    if (totalEarningsEl)
      totalEarningsEl.textContent = formatCurrency(dashboard.total_earnings);
    if (activeOrdersEl)
      activeOrdersEl.textContent = dashboard.active_orders ?? 0;
    if (pendingOrdersEl)
      pendingOrdersEl.textContent = dashboard.pending_orders ?? 0;
    if (weeklyEarningsEl)
      weeklyEarningsEl.textContent = formatCurrency(dashboard.weekly_earnings);

    renderRecentOrders(dashboard.recent_orders);
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

document.addEventListener("DOMContentLoaded", loadDashboard);