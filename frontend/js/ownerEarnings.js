console.log("[ownerEarnings.js] Loaded - real owner earnings v1");

const OWNER_DASH_API = "../../backend/controllers/OwnerDashboardController.php";

let earningsChartInstance = null;

function readJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function getOwnerRestaurantSession() {
  const currentOwner = readJson("foodExpressCurrentOwner", {});
  const currentUser = readJson("foodExpressCurrentUser", {});
  const selectedRestaurant = readJson("foodExpressSelectedRestaurant", {});

  const id =
    localStorage.getItem("ownerRestaurantId") ||
    currentOwner.restaurantId ||
    currentOwner.restaurant_id ||
    currentOwner.ownerRestaurantId ||
    currentUser.restaurantId ||
    currentUser.restaurant_id ||
    selectedRestaurant.restaurant_id ||
    selectedRestaurant.id ||
    "";

  const name =
    localStorage.getItem("ownerRestaurantName") ||
    currentOwner.restaurantName ||
    currentOwner.restaurant_name ||
    currentUser.restaurantName ||
    currentUser.restaurant_name ||
    selectedRestaurant.restaurant_name ||
    selectedRestaurant.name ||
    "Your Restaurant";

  return {
    id: Number(id || 0),
    name: String(name || "Your Restaurant"),
  };
}

function formatCurrency(amount) {
  const value = Number(amount || 0);

  return `Rs. ${value.toLocaleString("en-NP", {
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(value) {
  if (!value) return "—";

  const normalized =
    typeof value === "string" && !value.includes("T")
      ? value.replace(" ", "T")
      : value;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-NP", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getOrderNumber(order) {
  return order.order_number || order.orderNumber || `ORD-${order.id || "—"}`;
}

function isCompletedOrder(order) {
  const status = String(order.status || "").toLowerCase();
  const deliveryStatus = String(order.delivery_status || order.deliveryStatus || "").toLowerCase();

  return status === "delivered" || status === "completed" || deliveryStatus === "delivered";
}

function calculateMonthRevenue(orders) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return orders.reduce((sum, order) => {
    const rawDate = order.created_at || order.createdAt;
    if (!rawDate) return sum;

    const date = new Date(String(rawDate).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return sum;

    const sameMonth =
      date.getMonth() === currentMonth && date.getFullYear() === currentYear;

    if (!sameMonth || !isCompletedOrder(order)) return sum;

    return sum + Number(order.total || 0);
  }, 0);
}

function buildWeeklySeries(orders) {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const values = [0, 0, 0, 0, 0, 0, 0];

  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  orders.forEach((order) => {
    if (!isCompletedOrder(order)) return;

    const rawDate = order.created_at || order.createdAt;
    if (!rawDate) return;

    const date = new Date(String(rawDate).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return;

    const diffDays = Math.floor((date - monday) / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays <= 6) {
      values[diffDays] += Number(order.total || 0);
    }
  });

  return { labels, values };
}

function updateOwnerHeader(restaurantName) {
  const title = document.getElementById("earningsTitle");
  const subtitle = document.getElementById("earningsSubtitle");
  const avatar = document.getElementById("ownerAvatar");
  const ownerName = document.getElementById("ownerName");

  if (title) title.textContent = `${restaurantName} Earnings`;
  if (subtitle) subtitle.textContent = "Track real income from completed restaurant orders.";

  if (avatar) {
    avatar.textContent = restaurantName
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  if (ownerName) ownerName.textContent = restaurantName;
}

function updateStats(dashboard, recentOrders) {
  const completedOrders = recentOrders.filter(isCompletedOrder);
  const monthRevenue = calculateMonthRevenue(recentOrders);

  const todayRevenue = Number(dashboard.today_revenue || 0);
  const weeklyRevenue = Number(dashboard.weekly_earnings || 0);
  const totalRevenue =
    completedOrders.length > 0
      ? completedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0)
      : Number(dashboard.total_earnings || dashboard.weekly_earnings || 0);

  const averageOrder =
    completedOrders.length > 0 ? totalRevenue / completedOrders.length : 0;

  setText("todayEarnings", formatCurrency(todayRevenue));
  setText("weekEarnings", formatCurrency(weeklyRevenue));
  setText("monthEarnings", formatCurrency(monthRevenue || totalRevenue));
  setText("completedOrders", String(Number(dashboard.completed_orders || completedOrders.length || 0)));
  setText("averageOrderValue", formatCurrency(averageOrder));

  const activeOrders = Number(dashboard.active_orders || 0);
  setText("earningsNote", `${activeOrders} active orders are still in progress and not counted as completed earnings.`);
}

function renderRecentEarnings(orders) {
  const tbody = document.getElementById("earningsTableBody");
  if (!tbody) return;

  const completedOrders = orders.filter(isCompletedOrder).slice(0, 8);

  if (completedOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row">
          No completed earnings yet. Delivered orders will appear here.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = completedOrders
    .map((order) => {
      return `
        <tr>
          <td>#${escapeHtml(getOrderNumber(order))}</td>
          <td>${escapeHtml(order.customer_name || order.customerName || "Customer")}</td>
          <td class="amount">${formatCurrency(order.total || 0)}</td>
          <td class="date">${formatDate(order.created_at || order.createdAt)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderEarningsChart(orders) {
  const canvas = document.getElementById("earningsChart");
  if (!canvas || typeof Chart === "undefined") return;

  const { labels, values } = buildWeeklySeries(orders);
  const ctx = canvas.getContext("2d");

  if (earningsChartInstance) {
    earningsChartInstance.destroy();
  }

  earningsChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: "#ef3b3f",
          backgroundColor: "rgba(239, 59, 63, 0.08)",
          borderWidth: 3,
          pointBackgroundColor: "#ef3b3f",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true,
          tension: 0.42,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${formatCurrency(ctx.parsed.y)}`,
          },
          backgroundColor: "#ffffff",
          titleColor: "#111827",
          bodyColor: "#ef3b3f",
          borderColor: "#e5e7eb",
          borderWidth: 1,
          padding: 12,
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#98a2b3", font: { size: 12, weight: "600" } },
          border: { display: false },
        },
        y: {
          grid: { color: "#f1f5f9" },
          ticks: {
            color: "#98a2b3",
            font: { size: 12, weight: "600" },
            callback: (val) => `Rs. ${Number(val).toLocaleString("en-NP")}`,
          },
          border: { display: false },
        },
      },
    },
  });
}

async function parseJsonResponse(response) {
  const raw = await response.text();

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("[ownerEarnings.js] Non-JSON response:", raw);
    throw new Error("Backend returned invalid JSON.");
  }
}

async function loadOwnerEarnings() {
  if (typeof requireOwnerAuth === "function") {
    if (!requireOwnerAuth()) return;
  }

  const ownerRestaurant = getOwnerRestaurantSession();

  if (!ownerRestaurant.id) {
    alert("Restaurant session not found. Please login again.");
    window.location.href = "restaurant-login.html";
    return;
  }

  updateOwnerHeader(ownerRestaurant.name);
  setLoadingState();

  try {
    const url = `${OWNER_DASH_API}?restaurant_id=${encodeURIComponent(ownerRestaurant.id)}&_=${Date.now()}`;
    const res = await fetch(url);
    const data = await parseJsonResponse(res);

    if (!data.success || !data.data) {
      throw new Error(data.message || "Could not load earnings data.");
    }

    const dashboard = data.data;
    const recentOrders = Array.isArray(dashboard.recent_orders)
      ? dashboard.recent_orders
      : [];

    updateStats(dashboard, recentOrders);
    renderRecentEarnings(recentOrders);
    renderEarningsChart(recentOrders);
  } catch (error) {
    console.error("[ownerEarnings.js] Load error:", error);
    showErrorState(error.message);
  }
}

function setLoadingState() {
  setText("todayEarnings", "Loading...");
  setText("weekEarnings", "Loading...");
  setText("monthEarnings", "Loading...");
  setText("completedOrders", "—");
  setText("averageOrderValue", "—");

  const tbody = document.getElementById("earningsTableBody");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row">Loading real earnings data...</td>
      </tr>
    `;
  }
}

function showErrorState(message) {
  const tbody = document.getElementById("earningsTableBody");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-row error-row">
          ${escapeHtml(message || "Unable to load earnings data.")}
        </td>
      </tr>
    `;
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.logout = function logout() {
  localStorage.removeItem("foodExpressCurrentOwner");
  localStorage.removeItem("ownerRestaurantId");
  localStorage.removeItem("ownerRestaurantName");
  localStorage.removeItem("foodExpressCurrentUser");
  localStorage.removeItem("isLoggedIn");
  window.location.href = "restaurant-login.html";
};

document.addEventListener("DOMContentLoaded", loadOwnerEarnings);