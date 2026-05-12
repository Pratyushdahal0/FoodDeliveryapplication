console.log("[dashboard.js] Loaded - final premium real-world customer dashboard");

// Fallback in case shared.js fails to load before this file.
const _apiReq = typeof apiRequest === "function" ? apiRequest : fetch;

const ORDER_HISTORY_KEY = "foodExpressOrders";
const DASHBOARD_PREFS_KEY = "foodExpressDashboardPrefs";
const REWARDS_STORAGE_KEY = "foodexpressRewards";
const CART_ITEMS_KEY = "foodDeliveryCartItems";
const CART_COUNT_KEY = "foodDeliveryCartCount";

const CUSTOMER_ORDER_API =
  "../../backend/controllers/OrderController.php?action=customer_orders";

const DASHBOARD_HIDDEN_ORDERS_KEY = "foodExpressHiddenDashboardOrders";

let dashboardServerStats = {
  total_orders: 0,
  delivered_orders: 0,
  points: 0,
  savings: 0,
};

const DASHBOARD_DEFAULT_IMAGE =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
      <rect width="100%" height="100%" rx="18" fill="#fff1f2"/>
      <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="13" font-weight="700" fill="#ef4444">Food</text>
      <text x="50%" y="63%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="13" font-weight="700" fill="#ef4444">Express</text>
    </svg>
  `);

let allOrdersCache = [];
let showAllOrders = false;

/* ===============================
   INIT
================================ */

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof window.bindProfileEverywhere === "function") {
    window.bindProfileEverywhere();
  }

  restoreDashboardPrefs();
  setupTabs();
  setupDashboardActions();

  await refreshDashboardData();

  loadDashboardStats();
  updateRewardsUI();
  bindDashboardProfileInfo();

  setTimeout(() => {
    bindDashboardProfileInfo();
    updateRewardsUI();
    loadDashboardStats();

    if (typeof window.bindProfileEverywhere === "function") {
      window.bindProfileEverywhere();
    }

    if (typeof window.bindNotificationBell === "function") {
      window.bindNotificationBell();
    }
  }, 300);
});

window.addEventListener("foodExpressProfileUpdated", async () => {
  bindDashboardProfileInfo();
  updateRewardsUI();
  await refreshDashboardData();
  loadDashboardStats();
});

window.addEventListener("foodExpressRewardsUpdated", () => {
  updateRewardsUI();
  loadDashboardStats();
});

let _dashStorageTimer = null;
window.addEventListener("storage", async (event) => {
  if (
    event.key === "userProfile" ||
    event.key === "userName" ||
    event.key === "userEmail" ||
    event.key === ORDER_HISTORY_KEY ||
    event.key === "lastOrder" ||
    event.key === "latestOrder"
  ) {
    clearTimeout(_dashStorageTimer);
    _dashStorageTimer = setTimeout(async () => {
      bindDashboardProfileInfo();
      updateRewardsUI();
      await refreshDashboardData();
      loadDashboardStats();
    }, 2000); // wait 2 seconds before re-fetching
  }
});

/* ===============================
   MAIN DASHBOARD DATA
================================ */

async function refreshDashboardData() {
  const profile = getDashboardProfile();

  allOrdersCache = await loadCustomerOrdersForDashboard(profile.email);

  renderOrdersList();
  await loadFavoritesData();
}

/* ===============================================================
   loadCustomerOrdersForDashboard
   ---------------------------------------------------------------
   Fetches the logged-in customer's orders from the DB via
   OrderController.php?action=customer_orders, updates
   dashboardServerStats, and returns normalized orders.
   Falls back to localStorage on any failure so the dashboard
   never goes blank during a backend outage.
=============================================================== */
async function loadCustomerOrdersForDashboard(email) {
  // Reset stats so a stale value from a previous user doesn't leak.
  dashboardServerStats = {
    total_orders: 0,
    delivered_orders: 0,
    points: 0,
    savings: 0,
  };

  if (!email || email === "No email added") {
    console.warn(
      "[dashboard.js] No customer email available; falling back to local orders."
    );
    return getSortedOrders().map(normalizeDashboardOrder);
  }

  try {
    const url = `${CUSTOMER_ORDER_API}&email=${encodeURIComponent(email)}`;
    console.log("[dashboard.js] Fetching customer orders:", url);

    const response = await _apiReq(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    // Robust JSON parse — InfinityFree sometimes injects a non-JSON
    // anti-bot HTML page. Read as text first, then parse.
    const raw = await response.text();

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (parseError) {
      console.error(
        "[dashboard.js] customer_orders returned non-JSON response:",
        raw.slice(0, 200)
      );
      return getSortedOrders().map(normalizeDashboardOrder);
    }

    if (!payload || payload.success !== true) {
      console.warn(
        "[dashboard.js] customer_orders API returned failure:",
        payload && payload.message
      );
      return getSortedOrders().map(normalizeDashboardOrder);
    }

    const dbOrders = Array.isArray(payload.data) ? payload.data : [];

    if (payload.stats && typeof payload.stats === "object") {
      dashboardServerStats = {
        total_orders: Number(payload.stats.total_orders || 0),
        delivered_orders: Number(payload.stats.delivered_orders || 0),
        points: Number(payload.stats.points || 0),
        savings: Number(payload.stats.savings || 0),
      };
    } else {
      const deliveredCount = dbOrders.filter((o) => {
        const status = String(o.status || o.delivery_status || "").toLowerCase();
        return status === "delivered";
      }).length;

      dashboardServerStats = {
        total_orders: dbOrders.length,
        delivered_orders: deliveredCount,
        points: deliveredCount * 100,
        savings: 0,
      };
    }

    console.log(
      "[dashboard.js] Loaded",
      dbOrders.length,
      "DB orders for",
      email,
      "stats:",
      dashboardServerStats
    );

    const hiddenNums = getHiddenDashboardOrderNumbers();
    const visibleOrders = dbOrders.filter(o => {
      const num1 = String(o.order_number || "");
      const num2 = String(o.orderNumber || "");
      const num3 = String(o.id || "");
      return !hiddenNums.includes(num1) && !hiddenNums.includes(num2) && !hiddenNums.includes(num3);
    });

    return visibleOrders.map(normalizeDashboardOrder);
  } catch (error) {
    console.error("[dashboard.js] Error fetching customer orders:", error);
    return getSortedOrders().map(normalizeDashboardOrder);
  }
}



function loadDashboardStats() {
  const profile = getDashboardProfile();
  const orders = allOrdersCache.length ? allOrdersCache : getSortedOrders();

  const totalOrders =
    Number(dashboardServerStats.total_orders || 0) || orders.length;

  const realisticSavings =
    Number(dashboardServerStats.savings || 0) ||
    calculateRealisticSavings(orders);

  const points =
    Number(dashboardServerStats.points || 0) || getCurrentRewardPoints(profile);

  setText("ordersCount", totalOrders);
  setText("pointsCount", points);
  setText("savingsAmount", formatRs(realisticSavings));

  syncDashboardRewards(points, realisticSavings);
  bindDashboardProfileInfo();
}




function normalizeDashboardOrder(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];

  return {
    ...order,

    id: order.id || order.order_id || order.orderId,
    orderId: order.orderId || order.order_id || order.id,
    order_id: order.order_id || order.orderId || order.id,

    orderNumber:
      order.orderNumber ||
      order.order_number ||
      order.orderId ||
      order.order_id ||
      order.id,

    order_number:
      order.order_number ||
      order.orderNumber ||
      order.orderId ||
      order.order_id ||
      order.id,

    restaurantName:
      order.restaurantName ||
      order.restaurant_name ||
      order.storeName ||
      "Spicy Grill",

    restaurant_name:
      order.restaurant_name ||
      order.restaurantName ||
      order.storeName ||
      "Spicy Grill",

    customerName: order.customerName || order.customer_name || "",
    customer_name: order.customer_name || order.customerName || "",

    customerEmail: order.customerEmail || order.customer_email || "",
    customer_email: order.customer_email || order.customerEmail || "",

    total: Number(order.total || 0),
    status: String(order.status || "").toLowerCase() || "pending",

    deliveryStatus: order.deliveryStatus || order.delivery_status || "",
    delivery_status: order.delivery_status || order.deliveryStatus || "",

    riderName: order.riderName || order.rider_name || "",
    rider_name: order.rider_name || order.riderName || "",

    riderPhone: order.riderPhone || order.rider_phone || "",
    rider_phone: order.rider_phone || order.riderPhone || "",

    createdAt: order.createdAt || order.created_at || order.timestamp,
    created_at: order.created_at || order.createdAt || order.timestamp,
    timestamp: order.timestamp || order.created_at || order.createdAt,

    items: items.map((item) => ({
      ...item,
      name: item.name || item.product_name || item.title || "Food item",
      product_name: item.product_name || item.name || item.title || "Food item",
      quantity: Number(item.quantity || 1),
      price: Number(item.price || item.unit_price || 0),
      restaurant_name:
        item.restaurant_name ||
        item.restaurantName ||
        order.restaurant_name ||
        order.restaurantName ||
        "Spicy Grill",
    })),

    itemCount: Number(order.itemCount || order.item_count || items.length),
  };
}

function sortDashboardOrders(orders) {
  return [...orders].sort((a, b) => {
    const aTime = new Date(a.timestamp || a.created_at || a.createdAt || 0).getTime();
    const bTime = new Date(b.timestamp || b.created_at || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function syncDashboardRewards(points, savings) {
  const currentRewards = readJson(REWARDS_STORAGE_KEY, {});

  const nextRewards = {
    ...currentRewards,
    currentPoints: Number(points || 0),
    totalSavings: Number(savings || 0),
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(nextRewards));
  localStorage.setItem("foodExpressRewardPoints", String(Number(points || 0)));
  localStorage.setItem("userPoints", String(Number(points || 0)));
}

function getHiddenDashboardOrderNumbers() {
  return readJson(DASHBOARD_HIDDEN_ORDERS_KEY, []);
}

function calculateRealisticSavings(orders) {
  return orders.reduce((sum, order) => {
    const discount =
      Number(order.discountAmount || 0) ||
      Number(order.discount_amount || 0) ||
      Number(order.couponDiscountAmount || 0) ||
      0;

    return sum + discount;
  }, 0);
}

function bindDashboardProfileInfo() {
  const profile = getDashboardProfile();

  setText("welcomeName", profile.name || "User");
  setText("welcomeEmail", profile.email || "No email added");

  if (typeof window.bindProfileEverywhere === "function") {
    window.bindProfileEverywhere();
  }
}

/* ===============================
   REWARDS DASHBOARD CARD
================================ */

function updateRewardsUI() {
  const profile = getDashboardProfile();
  const rewardsData = readJson(REWARDS_STORAGE_KEY, null);
  const points = getCurrentRewardPoints(profile);
  const pendingPoints = Number(rewardsData?.pendingPoints || 0);

  const rewardTiers = [
    { points: 500, label: "5% OFF" },
    { points: 900, label: "10% OFF" },
    { points: 1300, label: "15% OFF" },
    { points: 2000, label: "20% OFF" },
  ];

  const nextTier = rewardTiers.find((tier) => points < tier.points);
  const finalTier = rewardTiers[rewardTiers.length - 1];

  const targetPoints = nextTier ? nextTier.points : finalTier.points;
  const progress = Math.min(100, Math.round((points / targetPoints) * 100));
  const remaining = nextTier ? Math.max(0, nextTier.points - points) : 0;

  const fill = document.getElementById("rewardsProgressFill");
  if (fill) fill.style.width = `${progress}%`;

  setText("rewardsProgressText", `${points} / ${targetPoints} points`);

  if (pendingPoints > 0) {
    setText(
      "rewardsSubtitle",
      `${pendingPoints} pending points will unlock after delivery.`
    );
    return;
  }

  if (nextTier) {
    setText(
      "rewardsSubtitle",
      `You're ${remaining} points away from ${nextTier.label}.`
    );
  } else {
    setText("rewardsSubtitle", "🎉 You unlocked all reward tiers!");
  }
}

function getCurrentRewardPoints(profile = {}) {
  const serverPoints = Number(dashboardServerStats.points || 0);

  if (serverPoints > 0) {
    return serverPoints;
  }

  const rewardsData = readJson(REWARDS_STORAGE_KEY, null);

  return Number(
    rewardsData?.currentPoints ??
      profile.points ??
      localStorage.getItem("userPoints") ??
      localStorage.getItem("foodExpressRewardPoints") ??
      0
  );
}



/* ===============================
   TABS
================================ */

function setupTabs() {
  const recentTab = document.getElementById("recentTab");
  const favoriteTab = document.getElementById("favoriteTab");
  const ordersContent = document.getElementById("ordersContent");
  const favoritesContent = document.getElementById("favoritesContent");
  const viewAllBtn = document.getElementById("viewAllOrdersBtn");

  if (!recentTab || !favoriteTab || !ordersContent || !favoritesContent) {
    return;
  }

  recentTab.addEventListener("click", () => {
    recentTab.classList.add("active");
    favoriteTab.classList.remove("active");

    ordersContent.style.display = "block";
    favoritesContent.style.display = "none";

    if (viewAllBtn) {
      viewAllBtn.style.display = allOrdersCache.length > 4 ? "flex" : "none";
    }
  });

  favoriteTab.addEventListener("click", () => {
    favoriteTab.classList.add("active");
    recentTab.classList.remove("active");

    ordersContent.style.display = "none";
    favoritesContent.style.display = "block";

    if (viewAllBtn) viewAllBtn.style.display = "none";
  });
}

/* ===============================
   RECENT ORDERS
================================ */

function renderOrdersList() {
  const list = document.getElementById("recentOrdersList");
  const empty = document.getElementById("noRecentOrdersMsg");
  const viewAllBtn = document.getElementById("viewAllOrdersBtn");

  if (!list || !empty) return;

  const orders = allOrdersCache || [];

  if (!orders.length) {
    list.innerHTML = "";
    empty.style.display = "block";

    if (viewAllBtn) viewAllBtn.style.display = "none";
    return;
  }

  empty.style.display = "none";

  const ordersToShow = showAllOrders ? orders : orders.slice(0, 4);

  list.innerHTML = ordersToShow.map(renderDashboardOrderCard).join("");

  list
    .querySelectorAll(".dashboard-order-track-btn")
    .forEach((button, visibleIndex) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openTrackingForOrder(ordersToShow[visibleIndex]);
      });
    });

  list
    .querySelectorAll(".dashboard-order-reorder-btn")
    .forEach((button, visibleIndex) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        reorderDashboardOrder(ordersToShow[visibleIndex]);
      });
    });

  list
    .querySelectorAll(".dashboard-order-cancel-btn")
    .forEach((button, visibleIndex) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        showDashboardCancelConfirm(ordersToShow[visibleIndex]);
      });
    });

  list
    .querySelectorAll(".dashboard-order-remove-btn")
    .forEach((button, visibleIndex) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        showRemoveOrderConfirm(ordersToShow[visibleIndex]);
      });
    });

  list
    .querySelectorAll(".dashboard-order-item")
    .forEach((itemEl, visibleIndex) => {
      itemEl.addEventListener("click", () => {
        openTrackingForOrder(ordersToShow[visibleIndex]);
      });
    });

  if (!viewAllBtn) return;

  if (orders.length <= 4) {
    viewAllBtn.style.display = "none";
    return;
  }

  viewAllBtn.style.display = "flex";
  viewAllBtn.innerHTML = showAllOrders
    ? `Show Less <i class="fa-solid fa-chevron-up"></i>`
    : `View All Orders <i class="fa-solid fa-chevron-right"></i>`;
}

function renderDashboardOrderCard(order, index) {
  const count = Number(order.itemCount || countItems(order.items || []));
  const orderTitle = getOrderRestaurantName(order);
  const orderNumber = getOrderNumber(order, index);
  const status = getDisplayOrderStatus(order);
  const statusMeta = getStatusMeta(status);
  const primaryItem = getPrimaryOrderItem(order);
  const placedTime = formatPlacedTime(order.timestamp || order.created_at);
  const total = Number(order.total || 0);
  const canReorder = Array.isArray(order.items) && order.items.length > 0;

  return `
    <div class="dashboard-order-item" data-order-number="${escapeHtml(orderNumber)}">
      <div class="dashboard-order-media">
        <img
          src="${escapeHtml(primaryItem.image)}"
          alt="${escapeHtml(primaryItem.name)}"
          onerror="this.src='${DASHBOARD_DEFAULT_IMAGE}'"
        />
      </div>

      <div class="dashboard-order-main">
        <div class="dashboard-order-top">
          <div>
            <div class="dashboard-order-title">
              ${escapeHtml(orderTitle)}
            </div>

            <div class="dashboard-order-meta">
              <span>Order #${escapeHtml(orderNumber)}</span>
              <span>${count} item${count !== 1 ? "s" : ""}</span>
              <span>${escapeHtml(placedTime)}</span>
            </div>
          </div>

          <div class="dashboard-order-total">
            ${formatRs(total)}
          </div>
        </div>

        <div class="dashboard-order-bottom">
          <div class="dashboard-order-status ${escapeHtml(statusMeta.className)}">
            <i class="fa-solid ${escapeHtml(statusMeta.icon)}"></i>
            ${escapeHtml(statusMeta.label)}
          </div>

          <div class="dashboard-order-actions">
            <button
              type="button"
              class="dashboard-order-track-btn"
              title="Track this order"
            >
              <i class="fa-solid fa-location-dot"></i>
              Track
            </button>

            <button
              type="button"
              class="dashboard-order-reorder-btn"
              ${canReorder ? "" : "disabled"}
              title="Add this order back to cart"
            >
              <i class="fa-solid fa-rotate-right"></i>
              Reorder
            </button>

            ${(String(order.status || "").toLowerCase() === "pending" && String(order.status || "").toLowerCase() !== "cancelled") ? `
            <button
              type="button"
              class="dashboard-order-cancel-btn"
              title="Cancel this order"
              style="background:#fff0ef;color:#dc2626;border:1.5px solid #fca5a5;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;"
            >
              <i class="fa-solid fa-xmark"></i> Cancel
            </button>` : ""}

            <button
              type="button"
              class="dashboard-order-remove-btn"
              title="Remove from recent orders"
              aria-label="Remove from recent orders"
            >
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getOrderRestaurantName(order = {}) {
  const firstItem = Array.isArray(order.items) ? order.items[0] : null;

  const name =
    order.restaurantName ||
    order.restaurant_name ||
    order.storeName ||
    order.restaurant ||
    firstItem?.restaurant_name ||
    firstItem?.restaurantName ||
    firstItem?.storeName ||
    "";

  const cleanName = String(name || "").trim();

  if (
    cleanName &&
    cleanName.toLowerCase() !== "restaurant" &&
    cleanName.toLowerCase() !== "unknown restaurant"
  ) {
    return cleanName;
  }

  return "Spicy Grill";
}

function getOrderNumber(order = {}, index = 0) {
  return String(
    order.orderNumber ||
      order.order_number ||
      order.orderId ||
      order.order_id ||
      order.id ||
      `ORD-${index + 1}`
  );
}

function getPrimaryOrderItem(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const firstItem = items[0] || null;

  const image =
    firstItem?.image_url ||
    firstItem?.imageUrl ||
    firstItem?.image ||
    firstItem?.photo ||
    firstItem?.thumbnail ||
    firstItem?.product_image ||
    firstItem?.productImage ||
    order.image_url ||
    order.image ||
    order.productImage ||
    "";

  const name =
    firstItem?.name ||
    firstItem?.product_name ||
    firstItem?.title ||
    order.itemName ||
    "Order item";

  return {
    name,
    image: image || getSmartFoodFallback(name),
  };
}

function getSmartFoodFallback(name = "") {
  const itemName = String(name || "").toLowerCase();

  if (itemName.includes("pizza")) {
    return "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=300&q=80";
  }

  if (itemName.includes("burger")) {
    return "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&q=80";
  }

  if (itemName.includes("sushi")) {
    return "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=300&q=80";
  }

  if (itemName.includes("momo") || itemName.includes("dumpling")) {
    return "https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=300&q=80";
  }

  if (itemName.includes("chicken") || itemName.includes("grill")) {
    return "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=300&q=80";
  }

  return "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&q=80";
}

function getDisplayOrderStatus(order = {}) {
  const deliveryStatus = String(
    order.delivery_status || order.deliveryStatus || ""
  )
    .toLowerCase()
    .trim();

  const kitchenStatus = String(order.status || "pending").toLowerCase().trim();

  if (deliveryStatus === "delivered") return "delivered";
  if (deliveryStatus === "on_the_way") return "on_the_way";
  if (deliveryStatus === "picked_up") return "picked_up";
  if (deliveryStatus === "assigned") return "rider_assigned";
  if (deliveryStatus === "accepted") return "rider_assigned";

  if (kitchenStatus === "ready_for_pickup") return "ready_for_pickup";
  if (kitchenStatus === "preparing") return "preparing";
  if (kitchenStatus === "confirmed") return "confirmed";

  if (kitchenStatus === "cancelled" || kitchenStatus === "canceled") {
    return "cancelled";
  }

  return "pending";
}

function getStatusMeta(status = "pending") {
  const clean = String(status || "pending").toLowerCase().trim();

  const map = {
    pending: {
      label: "Order received",
      className: "status-pending",
      icon: "fa-clock",
    },
    confirmed: {
      label: "Restaurant confirmed",
      className: "status-confirmed",
      icon: "fa-circle-check",
    },
    preparing: {
      label: "Preparing now",
      className: "status-preparing",
      icon: "fa-utensils",
    },
    ready_for_pickup: {
      label: "Ready for pickup",
      className: "status-ready",
      icon: "fa-bag-shopping",
    },
    searching: {
      label: "Finding rider",
      className: "status-searching",
      icon: "fa-motorcycle",
    },
    rider_assigned: {
      label: "Rider assigned",
      className: "status-rider",
      icon: "fa-motorcycle",
    },
    assigned: {
      label: "Rider assigned",
      className: "status-rider",
      icon: "fa-motorcycle",
    },
    accepted: {
      label: "Rider accepted",
      className: "status-rider",
      icon: "fa-motorcycle",
    },
    picked_up: {
      label: "Picked up",
      className: "status-picked",
      icon: "fa-bag-shopping",
    },
    on_the_way: {
      label: "On the way",
      className: "status-way",
      icon: "fa-route",
    },
    delivered: {
      label: "Delivered",
      className: "status-delivered",
      icon: "fa-circle-check",
    },
    cancelled: {
      label: "Cancelled",
      className: "status-cancelled",
      icon: "fa-ban",
    },
    canceled: {
      label: "Cancelled",
      className: "status-cancelled",
      icon: "fa-ban",
    },
  };

  return map[clean] || map.pending;
}

function openTrackingForOrder(order) {
  if (!order) return;

  const orderNumber = getOrderNumber(order);

  localStorage.setItem("lastOrder", JSON.stringify(order));
  localStorage.setItem("latestOrder", JSON.stringify(order));

  window.location.href = `track-order.html?order=${encodeURIComponent(
    orderNumber
  )}`;
}

function reorderDashboardOrder(order) {
  if (!order || !Array.isArray(order.items) || !order.items.length) {
    showDashboardToast(
      "No saved items",
      "This order does not have saved items available for reorder.",
      "warning"
    );
    return;
  }

  const restaurantId = String(order.restaurantId || order.restaurant_id || "");

  const items = order.items.map((item) => ({
    id: String(item.id || item.product_id || ""),
    name: item.name || item.product_name || "Unnamed item",
    price: Number(item.price || item.unit_price || 0),
    image_url: item.image_url || item.image || "",
    quantity: Number(item.quantity || 1),
    restaurant_id: String(item.restaurant_id || restaurantId),
    restaurant_name:
      item.restaurant_name ||
      item.restaurantName ||
      getOrderRestaurantName(order),
  }));

  localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(items));

  const count = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  localStorage.setItem(CART_COUNT_KEY, String(count));

  if (typeof window.updateCartCount === "function") {
    window.updateCartCount();
  }

  window.dispatchEvent(new CustomEvent("foodexpress:cart-updated"));

  showDashboardToast(
    "Added back to cart",
    "Your previous order has been added to cart.",
    "success"
  );

  setTimeout(() => {
    window.location.href = "cart.html";
  }, 900);
}

function showRemoveOrderConfirm(order) {
  if (!order) return;

  const orderNumber = getOrderNumber(order);

  let modal = document.getElementById("removeOrderModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "removeOrderModal";
    modal.className = "dashboard-confirm-overlay";

    modal.innerHTML = `
      <div class="dashboard-confirm-card">
        <div class="dashboard-confirm-icon">
          <i class="fa-regular fa-trash-can"></i>
        </div>

        <h3>Remove from recent orders?</h3>

        <p id="removeOrderMessage">
          This will only hide the order from your dashboard history. It will not cancel the order.
        </p>

        <div class="dashboard-confirm-actions">
          <button type="button" id="cancelRemoveOrderBtn" class="dashboard-confirm-cancel">
            Keep order
          </button>

          <button type="button" id="confirmRemoveOrderBtn" class="dashboard-confirm-danger">
            Remove
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  const message = document.getElementById("removeOrderMessage");
  const cancelBtn = document.getElementById("cancelRemoveOrderBtn");
  const confirmBtn = document.getElementById("confirmRemoveOrderBtn");

  if (message) {
    message.textContent = `Order #${orderNumber} will be hidden from your recent orders. Tracking data is not cancelled.`;
  }

  modal.classList.add("show");

  if (cancelBtn) {
    cancelBtn.onclick = () => {
      modal.classList.remove("show");
    };
  }

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      modal.classList.remove("show");
      removeDashboardOrder(order);
    };
  }
}

function removeDashboardOrder(order) {
  const orderNumber = getOrderNumber(order);
  const hiddenOrderNumbers = getHiddenDashboardOrderNumbers();

  if (!hiddenOrderNumbers.includes(orderNumber)) {
    hiddenOrderNumbers.push(orderNumber);
  }

  localStorage.setItem(
    DASHBOARD_HIDDEN_ORDERS_KEY,
    JSON.stringify(hiddenOrderNumbers)
  );

  allOrdersCache = allOrdersCache.filter((item) => {
    return getOrderNumber(item) !== orderNumber;
  });

  const localOrders = readJson(ORDER_HISTORY_KEY, []);

  if (Array.isArray(localOrders)) {
    const filteredOrders = localOrders.filter((item) => {
      return getOrderNumber(item) !== orderNumber;
    });

    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(filteredOrders));
  }

  const lastOrder = readJson("lastOrder", null);
  const latestOrder = readJson("latestOrder", null);

  if (lastOrder && getOrderNumber(lastOrder) === orderNumber) {
    localStorage.removeItem("lastOrder");
  }

  if (latestOrder && getOrderNumber(latestOrder) === orderNumber) {
    localStorage.removeItem("latestOrder");
  }

  renderOrdersList();
  loadDashboardStats();

  showDashboardToast(
    "Removed from recent orders",
    `Order #${orderNumber} was hidden from your dashboard.`,
    "success"
  );
}



/* ===============================
   FAVORITES
================================ */

async function loadFavoritesData() {
  const favoriteIds = getFavoriteIdsSafe();
  const list = document.getElementById("favoritesList");
  const empty = document.getElementById("noFavoritesMsg");

  if (!list || !empty) return;

  if (!favoriteIds.length) {
    list.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  try {
    let products = [];

    if (typeof window.getAllProducts === "function") {
      products = await window.getAllProducts();
    } else {
      products = await fetchDashboardProducts();
    }

    const favoriteProductsFromStorage = getFavoriteProductsFromStorage();
    const mergedProducts = [...products, ...favoriteProductsFromStorage];

    const uniqueProducts = [];
    const seen = new Set();

    mergedProducts.forEach((product) => {
      const id = String(product.id || product.product_id || "");
      if (!id || seen.has(id)) return;

      seen.add(id);
      uniqueProducts.push(product);
    });

    const favorites = uniqueProducts.filter((product) =>
      favoriteIds.includes(String(product.id || product.product_id))
    );

    if (!favorites.length) {
      list.innerHTML = "";
      empty.style.display = "block";
      return;
    }

    empty.style.display = "none";

    list.innerHTML = favorites
      .map((item) => {
        const id = String(item.id || item.product_id || "");
        const restaurantId = String(item.restaurant_id || item.restaurantId || "");
        const image =
          item.image_url ||
          item.imageUrl ||
          item.image ||
          item.photo ||
          item.thumbnail ||
          getSmartFoodFallback(item.name || item.product_name || "");

        const name = item.name || item.product_name || "Favorite item";

        const subtitle =
          item.restaurant_name ||
          item.restaurantName ||
          item.storeName ||
          item.category ||
          "Spicy Grill";

        const price = Number(item.price || item.unit_price || 0);

        return `
          <div
            class="dashboard-favorite-item"
            data-product-id="${escapeHtml(id)}"
            data-restaurant-id="${escapeHtml(restaurantId)}"
          >
            <div class="dashboard-favorite-left">
              <img
                src="${escapeHtml(image)}"
                alt="${escapeHtml(name)}"
                class="dashboard-favorite-image"
                onerror="this.src='${DASHBOARD_DEFAULT_IMAGE}'"
              />

              <div class="dashboard-favorite-info">
                <div class="dashboard-favorite-name">
                  ${escapeHtml(name)}
                </div>

                <div class="dashboard-favorite-meta">
                  ${escapeHtml(subtitle)}
                </div>
              </div>
            </div>

            <div class="dashboard-favorite-actions">
              <div class="dashboard-favorite-price">${formatRs(price)}</div>

              <button
                class="dashboard-favorite-btn active"
                type="button"
                data-fav-id="${escapeHtml(id)}"
                aria-label="Remove favorite"
                title="Remove favorite"
              >
                ♥
              </button>
            </div>
          </div>
        `;
      })
      .join("");

    bindFavoriteRemoveButtons();
    bindFavoriteOpenButtons();
  } catch (error) {
    console.error("[dashboard.js] Failed to load favorites preview:", error);
    list.innerHTML = "";
    empty.style.display = "block";
  }
}

function bindFavoriteRemoveButtons() {
  document
    .querySelectorAll(".dashboard-favorite-btn[data-fav-id]")
    .forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();

        const productId = button.dataset.favId;
        if (!productId) return;

        let ids = getFavoriteIdsSafe();

        ids = ids.filter((id) => String(id) !== String(productId));

        saveFavoriteIdsSafe(ids);

        const card = button.closest(".dashboard-favorite-item");
        if (card) {
          card.remove();
        }

        const list = document.getElementById("favoritesList");
        const empty = document.getElementById("noFavoritesMsg");

        if (list && empty && !list.querySelector(".dashboard-favorite-item")) {
          empty.style.display = "block";
        }

        showDashboardToast(
          "Removed from favorites",
          "This item was removed from your saved favorites.",
          "success"
        );
      });
    });
}

function bindFavoriteOpenButtons() {
  document
    .querySelectorAll(".dashboard-favorite-item[data-product-id]")
    .forEach((card) => {
      card.addEventListener("click", () => {
        const productId = card.dataset.productId || "";
        const restaurantId = card.dataset.restaurantId || "";
        const params = new URLSearchParams();
        if (productId) params.set("product_id", productId);
        if (restaurantId) params.set("restaurant_id", restaurantId);
        const qs = params.toString();
        window.location.href = qs ? `food.html?${qs}` : "food.html";
      });
    });
}

/* ===============================
   DASHBOARD ACTIONS
================================ */

function setupDashboardActions() {
  const viewAllBtn = document.getElementById("viewAllOrdersBtn");

  if (viewAllBtn) {
    viewAllBtn.addEventListener("click", () => {
      showAllOrders = !showAllOrders;
      persistDashboardPrefs();
      renderOrdersList();
    });
  }

  bindClick("actionBrowseMenu", () => {
    window.location.href = "food.html";
  });

  bindClick("actionTrackOrder", () => {
    const orders = allOrdersCache.length ? allOrdersCache : getSortedOrders();
    const activeOrder = orders.find((order) => {
      const status = getDisplayOrderStatus(order);
      return !["delivered", "cancelled", "canceled"].includes(status);
    });

    if (activeOrder) {
      openTrackingForOrder(activeOrder);
      return;
    }

    if (orders.length) {
      openTrackingForOrder(orders[0]);
      return;
    }

    showDashboardToast(
      "No order yet",
      "Place an order first, then live tracking will appear here.",
      "warning"
    );
  });

  bindClick("actionRedeemPoints", () => {
    window.location.href = "rewards.html";
  });

  bindClick("actionEditProfile", () => {
    window.location.href = "edit-profile.html";
  });

  bindClick("actionAddresses", () => {
    window.location.href = "edit-profile.html";
  });

  bindClick("actionPaymentMethods", () => {
    window.location.href = "payment.html";
  });

  bindClick("actionNotifications", () => {
    if (typeof window.bindNotificationBell === "function") {
      window.bindNotificationBell();
    }

    const bell =
      document.getElementById("notificationBell") ||
      document.querySelector("[data-notification-bell]");

    if (bell) {
      bell.click();
      return;
    }

    showDashboardToast(
      "Notifications",
      "Notifications are available from the top navbar bell.",
      "info"
    );
  });

  bindClick("actionSettings", () => {
    window.location.href = "account-settings.html";
  });

  bindClick("actionLogout", () => {
    const confirmLogout = confirm("Are you sure you want to log out?");

    if (!confirmLogout) return;

    if (typeof window.logout === "function") {
      window.logout();
      return;
    }

    localStorage.removeItem("isLoggedIn");
    window.location.href = "landingpage.html";
  });
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (!el || el.dataset.dashboardBound === "true") return;

  el.dataset.dashboardBound = "true";
  el.addEventListener("click", handler);
}

/* ===============================
   PROFILE HELPERS
================================ */

function getDashboardProfile() {
  const currentUser =
    readJson("foodExpressCurrentUser", null) ||
    readJson("currentUser", null) ||
    readJson("loggedInUser", null) ||
    readJson("foodExpressUser", null) ||
    {};

  if (typeof window.getSavedUserProfile === "function") {
    const savedProfile = window.getSavedUserProfile();

    return {
      ...savedProfile,
      name:
        savedProfile.name ||
        currentUser.name ||
        currentUser.full_name ||
        currentUser.fullName ||
        "User",
      email:
        savedProfile.email ||
        currentUser.email ||
        localStorage.getItem("userEmail") ||
        "No email added",
      phone:
        savedProfile.phone ||
        currentUser.phone ||
        currentUser.phone_number ||
        localStorage.getItem("userPhone") ||
        "",
      points: getCurrentRewardPoints(savedProfile),
    };
  }

  const profile = readJson("userProfile", {});

  return {
    name:
      currentUser.name ||
      currentUser.full_name ||
      currentUser.fullName ||
      profile.name ||
      localStorage.getItem("userName") ||
      localStorage.getItem("pendingVerificationName") ||
      "User",

    email:
      currentUser.email ||
      profile.email ||
      localStorage.getItem("userEmail") ||
      localStorage.getItem("pendingVerificationEmail") ||
      "No email added",

    phone:
      currentUser.phone ||
      currentUser.phone_number ||
      profile.phone ||
      localStorage.getItem("userPhone") ||
      "",

    address:
      currentUser.address ||
      profile.address ||
      localStorage.getItem("userAddress") ||
      "",

    profileImage:
      currentUser.profile_image ||
      currentUser.profileImage ||
      profile.profileImage ||
      profile.image ||
      localStorage.getItem("userProfileImage") ||
      "",

    points: getCurrentRewardPoints(profile),
  };
}

/* ===============================
   STORAGE HELPERS
================================ */

function getSortedOrders() {
  const orders = readJson(ORDER_HISTORY_KEY, []);

  if (!Array.isArray(orders)) return [];

  const hiddenOrderNumbers = getHiddenDashboardOrderNumbers();

  const cleanedOrders = orders
    .map((order) => {
      const firstItem = Array.isArray(order.items) ? order.items[0] : null;

      const restaurantName =
        order.restaurantName ||
        order.restaurant_name ||
        firstItem?.restaurant_name ||
        firstItem?.restaurantName ||
        "Spicy Grill";

      const cleanRestaurantName =
        String(restaurantName || "").toLowerCase() === "restaurant" ||
        String(restaurantName || "").toLowerCase() === "unknown restaurant"
          ? "Spicy Grill"
          : restaurantName;

      return {
        ...order,
        restaurantName: cleanRestaurantName,
        restaurant_name: cleanRestaurantName,
        timestamp: order.timestamp || order.created_at || order.createdAt,
        items: Array.isArray(order.items)
          ? order.items.map((item) => ({
              ...item,
              restaurant_name:
                item.restaurant_name ||
                item.restaurantName ||
                cleanRestaurantName,
            }))
          : [],
      };
    })
    .filter((order) => !hiddenOrderNumbers.includes(getOrderNumber(order)));

  localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(cleanedOrders));

  return sortDashboardOrders(cleanedOrders);
}


     

function getFavoriteIdsSafe() {
  const keys = [
    "foodDeliveryFavorites",
    "foodExpressFavorites",
    "foodExpressFoodFavorites",
    "foodFavorites",
    "FOOD_FAVORITES_KEY",
    "favoriteProducts",
    "favorites",
  ];

  const ids = [];

  keys.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (typeof item === "string" || typeof item === "number") {
            ids.push(String(item));
            return;
          }

          if (item && typeof item === "object") {
            const id = item.id || item.product_id || item.productId;
            if (id) ids.push(String(id));
          }
        });
      }

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.keys(parsed).forEach((id) => {
          if (parsed[id]) ids.push(String(id));
        });
      }
    } catch (error) {
      // ignore invalid favorite storage
    }
  });

  return [...new Set(ids)];
}

async function fetchDashboardProducts() {
  const possibleUrls = [
    "../../backend/controllers/ProductController.php?action=all",
  ];

  for (const url of possibleUrls) {
    try {
      const res = await fetch(url);

      if (!res.ok) continue;

      const raw = await res.text();

      let data;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        console.warn("[dashboard.js] Product API returned non-JSON:", raw);
        continue;
      }

      if (data.success && Array.isArray(data.data)) {
        return data.data;
      }

      if (Array.isArray(data)) {
        return data;
      }
    } catch (error) {
      console.warn("[dashboard.js] Product fetch failed:", url, error);
    }
  }

  return [];
}

function saveFavoriteIdsSafe(ids) {
  const cleanIds = [...new Set((ids || []).map(String))];

  const keys = [
    "foodDeliveryFavorites",
    "foodExpressFavorites",
    "foodExpressFoodFavorites",
    "foodFavorites",
    "favoriteProducts",
    "favorites",
  ];

  keys.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;

      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        const nextValue = parsed.filter((item) => {
          if (typeof item === "string" || typeof item === "number") {
            return cleanIds.includes(String(item));
          }

          if (item && typeof item === "object") {
            const id = item.id || item.product_id || item.productId;
            return cleanIds.includes(String(id));
          }

          return false;
        });

        localStorage.setItem(key, JSON.stringify(nextValue));
      }

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const nextObject = {};

        Object.keys(parsed).forEach((id) => {
          if (cleanIds.includes(String(id))) {
            nextObject[id] = parsed[id];
          }
        });

        localStorage.setItem(key, JSON.stringify(nextObject));
      }
    } catch (error) {
      // ignore invalid favorite storage
    }
  });

  localStorage.setItem("foodDeliveryFavorites", JSON.stringify(cleanIds));
}

function getFavoriteProductsFromStorage() {
  const keys = [
    "foodDeliveryFavorites",
    "foodExpressFavorites",
    "foodExpressFoodFavorites",
    "foodFavorites",
    "favoriteProducts",
    "favorites",
  ];

  const products = [];

  keys.forEach((key) => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");

      if (!Array.isArray(parsed)) return;

      parsed.forEach((item) => {
        if (item && typeof item === "object") {
          const id = item.id || item.product_id || item.productId;

          if (id) {
            products.push({
              ...item,
              id: String(id),
            });
          }
        }
      });
    } catch (error) {
      // ignore invalid storage keys
    }
  });

  return products;
}

function persistDashboardPrefs() {
  const prefs = {
    showAllOrders,
  };

  localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(prefs));
}

function restoreDashboardPrefs() {
  const prefs = readJson(DASHBOARD_PREFS_KEY, {});
  showAllOrders = Boolean(prefs.showAllOrders);
}

function countItems(items) {
  return (items || []).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

/* ===============================
   TOAST
================================ */

function showDashboardToast(title, message, type = "success") {
  let toast = document.getElementById("dashboardToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "dashboardToast";
    toast.className = "dashboard-toast";
    document.body.appendChild(toast);
  }

  const icon =
    type === "success"
      ? "fa-circle-check"
      : type === "warning"
        ? "fa-triangle-exclamation"
        : "fa-circle-info";

  toast.className = `dashboard-toast show ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
  `;

  clearTimeout(window.__dashboardToastTimer);
  window.__dashboardToastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

/* ===============================
   UI HELPERS
================================ */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatRs(value) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ===============================
   CANCEL ORDER (DASHBOARD)
================================ */

function showDashboardCancelConfirm(order) {
  if (!order) return;

  let modal = document.getElementById("dashboardCancelModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "dashboardCancelModal";
    modal.style.cssText = "display:none;position:fixed;inset:0;z-index:9999;background:rgba(15,23,42,0.5);backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:20px;";

    modal.innerHTML = `
      <div style="background:#fff;border-radius:24px;padding:36px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
        <div style="width:56px;height:56px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:24px;color:#dc2626;">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h3 style="text-align:center;font-size:20px;color:#12203A;margin-bottom:10px;">Cancel this order?</h3>
        <p id="dashCancelMsg" style="text-align:center;color:#6B7280;font-size:14px;margin-bottom:20px;">This cannot be undone.</p>
        <textarea id="dashCancelReason" placeholder="Reason (optional)" style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:12px;font-size:14px;resize:none;height:70px;margin-bottom:16px;font-family:inherit;box-sizing:border-box;"></textarea>
        <div style="display:flex;gap:10px;">
          <button id="dashCancelKeepBtn" style="flex:1;padding:12px;border-radius:999px;border:1.5px solid #e5e7eb;background:#f9fafb;font-weight:700;cursor:pointer;">Keep order</button>
          <button id="dashCancelConfirmBtn" style="flex:1;padding:12px;border-radius:999px;border:none;background:#dc2626;color:#fff;font-weight:700;cursor:pointer;">Yes, cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const msgEl = document.getElementById("dashCancelMsg");
  const reasonEl = document.getElementById("dashCancelReason");
  const keepBtn = document.getElementById("dashCancelKeepBtn");
  const confirmBtn = document.getElementById("dashCancelConfirmBtn");

  if (msgEl) msgEl.textContent = `Order #${getOrderNumber(order)} will be permanently cancelled.`;
  if (reasonEl) reasonEl.value = "";

  modal.style.display = "flex";

  keepBtn.onclick = () => { modal.style.display = "none"; };

  confirmBtn.onclick = async () => {
    const reason = reasonEl ? reasonEl.value.trim() : "";
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Cancelling...";

    const canonicalUser = typeof window.getCurrentLoggedInUser === "function"
      ? window.getCurrentLoggedInUser() : null;

    try {
      const resp = await fetch(
        "../../backend/controllers/CancellationController.php?action=cancel_order",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id:        order.id || order.order_id || order.orderId,
            cancelled_by:    "customer",
            canceller_id:    canonicalUser?.id || null,
            canceller_email: canonicalUser?.email || order.customerEmail || order.customer_email || "",
            reason,
          }),
        }
      );

      const result = await resp.json();
      modal.style.display = "none";

      if (result.success) {
        let msg = "Your order has been cancelled.";
        if (result.refund_eligible) {
          msg += ` Refund of Rs. ${result.refund_amount} will be processed.`;
        }

        // Re-fetch from DB so UI is fully in sync
        await refreshDashboardData();

        // Show toast AFTER re-render
        showDashboardToast("Order cancelled", msg, "success");
      } else {
        // If already cancelled, just refresh UI silently
        if (result.message && result.message.toLowerCase().includes("already cancelled")) {
          await refreshDashboardData();
        } else {
          showDashboardToast("Cannot cancel", result.message || "Could not cancel order.", "warning");
        }
      }
    } catch (err) {
      modal.style.display = "none";
      showDashboardToast("Error", "Network error. Please try again.", "warning");
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Yes, cancel";
    }
  };
}