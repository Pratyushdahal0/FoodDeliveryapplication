console.log("[ownerdashboard.js] Loaded - AI restaurant command center v1");

const OWNER_DASHBOARD_API = "../../backend/controllers/OwnerDashboardController.php";
const OWNER_DASHBOARD_REFRESH_MS = 8000;

let ownerDashboardTimer = null;
let latestDashboardData = null;

document.addEventListener("DOMContentLoaded", async () => {
  renderOwnerShell();
  setupOwnerLogout();

  await loadOwnerDashboard();

  ownerDashboardTimer = setInterval(() => {
    if (!document.hidden) {
      loadOwnerDashboard({ silent: true });
    }
  }, OWNER_DASHBOARD_REFRESH_MS);
});

window.addEventListener("beforeunload", () => {
  if (ownerDashboardTimer) clearInterval(ownerDashboardTimer);
});

function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getOwnerRestaurantContext() {
  const owner = readJson("foodExpressCurrentOwner", {});
  const currentUser = readJson("foodExpressCurrentUser", {});

  const restaurantId =
    localStorage.getItem("ownerRestaurantId") ||
    owner.restaurantId ||
    owner.restaurant_id ||
    currentUser.restaurantId ||
    currentUser.restaurant_id ||
    null;  // ✅ null instead of "1"

const restaurantName =
    localStorage.getItem("ownerRestaurantName") ||
    owner.restaurantName ||
    owner.restaurant_name ||
    currentUser.restaurantName ||
    currentUser.restaurant_name ||
    "My Restaurant";  // ✅ generic fallback

return {
    restaurantId: restaurantId ? String(restaurantId) : null,
    restaurantName: String(restaurantName || "My Restaurant"),
};
}

function renderOwnerShell() {
  const { restaurantName } = getOwnerRestaurantContext();

  document.querySelectorAll(".sidebar-profile .name, #sidebarRestaurantName").forEach((el) => {
    el.textContent = restaurantName;
  });

  document.querySelectorAll(".sidebar-profile .avatar").forEach((el) => {
    el.textContent = restaurantName.charAt(0).toUpperCase();
  });

  const greeting = document.getElementById("dashboardGreeting");
  if (greeting) {
    greeting.textContent = `Welcome back, ${restaurantName}`;
  }
}

function setupOwnerLogout() {
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

async function loadOwnerDashboard(options = {}) {
  const { silent = false } = options;
  const { restaurantId } = getOwnerRestaurantContext();

if (!restaurantId) {
    renderDashboardError("No restaurant found for your account. Please contact support.");
    return;
}

try {
    if (!silent) {
        setDashboardLoading();
    }

    const url = `${OWNER_DASHBOARD_API}?restaurant_id=${encodeURIComponent(restaurantId)}&_=${Date.now()}`;

    const url = `${OWNER_DASHBOARD_API}?restaurant_id=${encodeURIComponent(
      restaurantId
    )}&_=${Date.now()}`;

    const response = await fetch(url);
    const result = await readJsonResponse(response);

    if (!result.success) {
      throw new Error(result.message || "Failed to load owner dashboard.");
    }

    latestDashboardData = result.data || {};
    renderDashboard(latestDashboardData);

    console.log("[ownerdashboard.js] Dashboard loaded:", latestDashboardData);
  } catch (error) {
    console.error("[ownerdashboard.js] Dashboard load failed:", error);
    renderDashboardError(error.message);
  }
}

async function readJsonResponse(response) {
  const raw = await response.text();

  try {
    return JSON.parse(raw);
  } catch {
    console.error("[ownerdashboard.js] Non JSON response:", raw);
    throw new Error("Dashboard backend returned invalid JSON.");
  }
}

function setDashboardLoading() {
  setText("metricTodayOrders", "...");
  setText("metricPendingOrders", "...");
  setText("metricPreparingOrders", "...");
  setText("metricReadyOrders", "...");
  setText("metricCompletedOrders", "...");
  setText("metricCancelledOrders", "...");
  setText("metricTodayRevenue", "...");
  setText("metricAvgPrep", "...");
}

function renderDashboard(data) {
  const restaurantState = data.restaurant_state || {};
  const ai = data.ai_delay_prediction || {};
  const smartQueue = createSmartQueue(data);

  setText("metricTodayOrders", number(data.today_orders));
  setText("metricTotalOrders", `${number(data.total_orders)} total orders`);

  setText("metricPendingOrders", number(data.pending_orders));
  setText("metricPreparingOrders", number(data.preparing_orders));
  setText("metricReadyOrders", number(data.ready_for_pickup_orders));
  setText("metricCompletedOrders", number(data.completed_orders));
  setText("metricCancelledOrders", number(data.cancelled_orders));

  setText("metricTodayRevenue", money(data.today_revenue));
  setText("metricWeeklyRevenue", `${money(data.weekly_earnings)} this week`);
  setText("metricAvgPrep", `${number(data.average_prep_minutes)}m`);

  renderRestaurantState(restaurantState);
  renderAiPrediction(ai);
  renderSmartQueue(smartQueue);
  renderRecentOrders(data.recent_orders || []);
  renderMostOrderedItems(data.most_ordered_items || []);
}

function renderRestaurantState(state) {
  const chip = document.getElementById("restaurantStateChip");
  if (!chip) return;

  const isOpen = String(state.is_open ?? "1") === "1";
  const accepting = String(state.accepting_orders ?? "1") === "1";
  const busy = String(state.busy_mode ?? "0") === "1";

  let label = "Open";
  let bg = "#ecfdf5";
  let color = "#15803d";
  let border = "#bbf7d0";

  if (!isOpen) {
    label = "Closed";
    bg = "#fff1f1";
    color = "#dc2626";
    border = "#fecaca";
  } else if (!accepting) {
    label = "Paused";
    bg = "#fffbeb";
    color = "#b45309";
    border = "#fde68a";
  } else if (busy) {
    label = "Busy mode";
    bg = "#f5f3ff";
    color = "#6d28d9";
    border = "#ddd6fe";
  }

  chip.innerHTML = `<i class="fa-solid fa-circle"></i> ${escapeHtml(label)}`;
  chip.style.background = bg;
  chip.style.color = color;
  chip.style.borderColor = border;
}

function renderAiPrediction(ai) {
  const score = clamp(Number(ai.score || 0), 0, 100);
  const risk = String(ai.risk || "low").toLowerCase();
  const label = ai.label || `${capitalize(risk)} delay risk`;
  const suggestion =
    ai.suggestion || "Kitchen flow looks healthy. Keep monitoring pending orders.";

  const scoreRing = document.getElementById("aiScoreRing");
  if (scoreRing) {
    scoreRing.style.setProperty("--ai-score", `${score}%`);
  }

  setText("aiScoreText", String(score));
  setText("aiRiskTitle", label);
  setText("aiRiskSuggestion", suggestion);

  const pill = document.getElementById("aiRiskPill");
  if (pill) {
    const icon = risk === "critical" || risk === "high"
      ? "fa-triangle-exclamation"
      : risk === "medium"
        ? "fa-gauge-high"
        : "fa-sparkles";

    pill.innerHTML = `<i class="fa-solid ${icon}"></i> ${escapeHtml(capitalize(risk))} risk`;

    if (risk === "critical" || risk === "high") {
      pill.style.background = "#fff1f1";
      pill.style.color = "#dc2626";
    } else if (risk === "medium") {
      pill.style.background = "#fffbeb";
      pill.style.color = "#b45309";
    } else {
      pill.style.background = "#f5f3ff";
      pill.style.color = "#6d28d9";
    }
  }

  const reasons = Array.isArray(ai.reasons) && ai.reasons.length
    ? ai.reasons
    : ["No major delay signals detected right now."];

  const list = document.getElementById("aiReasonsList");
  if (list) {
    list.innerHTML = reasons
      .map((reason) => {
        return `
          <div class="ai-reason">
            <i class="fa-solid fa-circle-check"></i>
            <span>${escapeHtml(reason)}</span>
          </div>
        `;
      })
      .join("");
  }
}

function createSmartQueue(data) {
  const queue = [];

  const pending = Number(data.pending_orders || 0);
  const preparing = Number(data.preparing_orders || 0);
  const ready = Number(data.ready_for_pickup_orders || 0);
  const active = Number(data.active_orders || 0);
  const ai = data.ai_delay_prediction || {};
  const recent = Array.isArray(data.recent_orders) ? data.recent_orders : [];
  const topItems = Array.isArray(data.most_ordered_items)
    ? data.most_ordered_items
    : [];

  if (pending > 0) {
    queue.push({
      icon: "fa-clock",
      title: "Confirm pending orders first",
      text: `${pending} order${pending > 1 ? "s" : ""} still need restaurant confirmation.`,
    });
  }

  if (preparing > 0) {
    queue.push({
      icon: "fa-utensils",
      title: "Keep kitchen prep focused",
      text: `${preparing} order${preparing > 1 ? "s are" : " is"} currently preparing. Avoid long idle time before ready pickup.`,
    });
  }

  if (ready > 0) {
    queue.push({
      icon: "fa-motorcycle",
      title: "Rider handoff waiting",
      text: `${ready} order${ready > 1 ? "s are" : " is"} ready for pickup. Monitor rider assignment.`,
    });
  }

  if (Number(ai.score || 0) >= 60) {
    queue.push({
      icon: "fa-triangle-exclamation",
      title: "Delay risk action needed",
      text: ai.suggestion || "Turn on busy mode or increase estimated prep time.",
    });
  }

  if (topItems.length) {
    const top = topItems[0];
    queue.push({
      icon: "fa-fire",
      title: "Batch prep opportunity",
      text: `${top.item_name || "Top item"} is your most ordered item today. Keep ingredients ready.`,
    });
  }

  if (!queue.length) {
    queue.push({
      icon: "fa-circle-check",
      title: "Kitchen flow looks healthy",
      text: "No urgent action needed. Keep monitoring new orders and rider pickup.",
    });
  }

  return queue.slice(0, 5);
}

function renderSmartQueue(queue) {
  const list = document.getElementById("smartQueueList");
  if (!list) return;

  list.innerHTML = queue
    .map((item) => {
      return `
        <div class="smart-queue-item">
          <div class="smart-queue-icon">
            <i class="fa-solid ${escapeHtml(item.icon)}"></i>
          </div>
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.text)}</p>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderRecentOrders(orders) {
  const body = document.getElementById("recentOrdersTableBody");
  if (!body) return;

  if (!orders.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="owner-empty">No recent orders yet.</div>
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = orders
    .slice(0, 8)
    .map((order) => {
      const status = normalizeStatus(order.status);
      return `
        <tr>
          <td><strong>#${escapeHtml(order.order_number || order.id)}</strong></td>
          <td>${escapeHtml(order.customer_name || "Guest")}</td>
          <td><strong>${money(order.total)}</strong></td>
          <td>
            <span class="dashboard-status status-${escapeHtml(status)}">
              ${escapeHtml(formatStatusLabel(status))}
            </span>
          </td>
          <td>${escapeHtml(order.rider_name || "Not assigned")}</td>
          <td>${escapeHtml(formatTimeAgo(order.created_at))}</td>
        </tr>
      `;
    })
    .join("");
}

function renderMostOrderedItems(items) {
  const list = document.getElementById("mostOrderedItemsList");
  if (!list) return;

  if (!items.length) {
    list.innerHTML = `<div class="owner-empty">No item analytics yet.</div>`;
    return;
  }

  list.innerHTML = items
    .slice(0, 6)
    .map((item) => {
      return `
        <div class="most-item">
          <div>
            <strong>${escapeHtml(item.item_name || "Food item")}</strong>
            <span>${number(item.order_count)} order${Number(item.order_count || 0) === 1 ? "" : "s"}</span>
          </div>
          <b>${number(item.total_qty)} sold</b>
        </div>
      `;
    })
    .join("");
}

function renderDashboardError(message) {
  setText("aiRiskTitle", "Dashboard could not load");
  setText("aiRiskSuggestion", message || "Please check backend connection.");
  setText("recentOrdersTableBody", "");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function normalizeStatus(status) {
  return String(status || "pending").toLowerCase().trim();
}

function formatStatusLabel(status) {
  const map = {
    pending: "Pending",
    confirmed: "Confirmed",
    preparing: "Preparing",
    ready_for_pickup: "Ready for Pickup",
    picked_up: "Picked Up",
    on_the_way: "On The Way",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  return map[normalizeStatus(status)] || "Pending";
}

function money(value) {
  const amount = Number(value || 0);
  return `Rs. ${amount.toFixed(2)}`;
}

function number(value) {
  return Number(value || 0).toLocaleString("en-AU");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}