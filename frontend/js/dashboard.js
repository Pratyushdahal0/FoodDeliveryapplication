console.log("[dashboard.js] Loaded - premium dashboard fixed");

const ORDER_HISTORY_KEY = "foodExpressOrders";
const NOTIFICATION_PREF_KEY = "foodExpressNotificationsEnabled";
const DASHBOARD_PREFS_KEY = "foodExpressDashboardPrefs";
const REWARDS_STORAGE_KEY = "foodexpressRewards";

const DASHBOARD_DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80";

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
  loadDashboardStats();
  setupTabs();
  setupDashboardActions();
  updateRewardsUI();

  await refreshDashboardData();

  // Delayed sync because navbar/profile/rewards may render after dashboard.
  setTimeout(() => {
    bindDashboardProfileInfo();
    updateRewardsUI();

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
});

window.addEventListener("foodExpressRewardsUpdated", () => {
  updateRewardsUI();
  loadDashboardStats();
});

window.addEventListener("storage", (event) => {
  if (
    event.key === "userProfile" ||
    event.key === "userName" ||
    event.key === "userEmail" ||
    event.key === "userProfileImage" ||
    event.key === "userPoints" ||
    event.key === "foodExpressRewardPoints" ||
    event.key === REWARDS_STORAGE_KEY ||
    event.key === ORDER_HISTORY_KEY
  ) {
    bindDashboardProfileInfo();
    updateRewardsUI();
    loadDashboardStats();
  }
});

/* ===============================
   MAIN DASHBOARD DATA
================================ */

async function refreshDashboardData() {
  allOrdersCache = getSortedOrders();
  renderOrdersList();
  await loadFavoritesData();
}

function loadDashboardStats() {
  const profile = getDashboardProfile();

  const orders = getSortedOrders();
  const totalOrders = orders.length;

  const totalSpent = orders.reduce(
    (sum, order) => sum + Number(order.total || 0),
    0,
  );

  const realisticSavings = Math.floor(totalSpent * 0.08);
  const points = getCurrentRewardPoints(profile);

  setText("ordersCount", totalOrders);
  setText("pointsCount", points);
  setText("savingsAmount", `$${realisticSavings}`);

  bindDashboardProfileInfo();
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
  const points = getCurrentRewardPoints(profile);

  const rewardTiers = [
    { points: 500, label: "5% OFF" },
    { points: 900, label: "10% OFF" },
    { points: 1300, label: "15% OFF" },
    { points: 2000, label: "20% OFF" },
  ];

  const nextTier = rewardTiers.find((tier) => points < tier.points);
  const finalTier = rewardTiers[rewardTiers.length - 1];

  let targetPoints = nextTier ? nextTier.points : finalTier.points;
  let progress = Math.min(100, Math.round((points / targetPoints) * 100));
  let remaining = nextTier ? Math.max(0, nextTier.points - points) : 0;

  const fill = document.getElementById("rewardsProgressFill");
  if (fill) fill.style.width = `${progress}%`;

  setText("rewardsProgressText", `${points} / ${targetPoints} points`);

  if (nextTier) {
    setText(
      "rewardsSubtitle",
      `You're ${remaining} points away from ${nextTier.label}.`,
    );
  } else {
    setText("rewardsSubtitle", "🎉 You unlocked all reward tiers!");
  }
}

function getCurrentRewardPoints(profile = {}) {
  const rewardsData = readJson(REWARDS_STORAGE_KEY, null);

  return Number(
    rewardsData?.currentPoints ??
      profile.points ??
      localStorage.getItem("userPoints") ??
      localStorage.getItem("foodExpressRewardPoints") ??
      0,
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

  list.innerHTML = ordersToShow
    .map((order, index) => {
      const count = Number(order.itemCount || countItems(order.items || []));
      const orderTitle =
        order.restaurantName ||
        order.restaurant_name ||
        order.storeName ||
        "Restaurant";

      const orderId =
        order.orderNumber || order.orderId || order.id || `ORD-${index + 1}`;

      const status = getDisplayOrderStatus(order);

      return `
        <div class="dashboard-order-item" data-order-index="${index}">
          <div class="dashboard-order-left">
            <div class="dashboard-order-title">
              ${escapeHtml(orderTitle)}
            </div>

            <div class="dashboard-order-meta">
              Order #${escapeHtml(String(orderId))} • ${count} item${
                count !== 1 ? "s" : ""
              } • ${formatPlacedTime(order.timestamp || order.created_at)}
            </div>
          </div>

          <div class="dashboard-order-right">
            <div class="dashboard-order-total">
              $${Number(order.total || 0).toFixed(2)}
            </div>

            <div class="dashboard-order-status status-${escapeHtml(status)}">
              ${formatStatus(status)}
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  list
    .querySelectorAll(".dashboard-order-item")
    .forEach((itemEl, visibleIndex) => {
      itemEl.addEventListener("click", () => {
        const selectedOrder = ordersToShow[visibleIndex];

        if (selectedOrder) {
          localStorage.setItem("lastOrder", JSON.stringify(selectedOrder));
        }

        window.location.href = "track-order.html";
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

function getDisplayOrderStatus(order = {}) {
  const deliveryStatus = order.delivery_status || order.deliveryStatus || "";
  const kitchenStatus = order.status || "pending";

  if (deliveryStatus && deliveryStatus !== "searching") {
    return deliveryStatus;
  }

  return kitchenStatus;
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
    const products =
      typeof window.getAllProducts === "function" ? await getAllProducts() : [];

    const favorites = products.filter((product) =>
      favoriteIds.includes(String(product.id)),
    );

    if (!favorites.length) {
      list.innerHTML = "";
      empty.style.display = "block";
      return;
    }

    empty.style.display = "none";

    list.innerHTML = favorites
      .map((item) => {
        const image =
          item.image_url ||
          item.image ||
          item.photo ||
          item.thumbnail ||
          DASHBOARD_DEFAULT_IMAGE;

        const name = item.name || "Favorite item";

        const subtitle =
          item.restaurant_name ||
          item.restaurantName ||
          item.category ||
          "Restaurant";

        const price = Number(item.price || 0).toFixed(2);
        const isFavorite = favoriteIds.includes(String(item.id));

        return `
          <div
            class="dashboard-favorite-item"
            data-product-id="${escapeHtml(String(item.id || ""))}"
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
              <div class="dashboard-favorite-price">$${price}</div>

              <button
                class="dashboard-favorite-btn ${isFavorite ? "active" : ""}"
                type="button"
                data-fav-id="${escapeHtml(String(item.id || ""))}"
                aria-label="Toggle favorite"
                title="Toggle favorite"
              >
                ${isFavorite ? "♥" : "♡"}
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

        if (ids.includes(String(productId))) {
          ids = ids.filter((id) => id !== String(productId));
          saveFavoriteIdsSafe(ids);

          const card = button.closest(".dashboard-favorite-item");
          if (card) card.remove();

          if (!ids.length) {
            const empty = document.getElementById("noFavoritesMsg");
            if (empty) empty.style.display = "block";
          }

          return;
        }

        ids.push(String(productId));
        saveFavoriteIdsSafe(ids);

        button.classList.add("active");
        button.textContent = "♥";
      });
    });
}

function bindFavoriteOpenButtons() {
  document
    .querySelectorAll(".dashboard-favorite-item[data-product-id]")
    .forEach((card) => {
      card.addEventListener("click", () => {
        window.location.href = "food.html";
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
    const orders = getSortedOrders();
    const lastOrder = readJson("lastOrder", null);

    if (lastOrder) {
      window.location.href = "track-order.html";
      return;
    }

    if (orders.length) {
      localStorage.setItem("lastOrder", JSON.stringify(orders[0]));
      window.location.href = "track-order.html";
      return;
    }

    alert("No active order found yet. Place an order first.");
  });

  bindClick("actionRedeemPoints", () => {
    window.location.href = "rewards.html";
  });

  bindClick("actionEditProfile", () => {
    window.location.href = "edit-profile.html";
  });

  bindClick("actionAddresses", () => {
    /*
      Real-world flow:
      For now, delivery address is managed from Edit Profile.
      Later you can build addresses.html.
    */
    window.location.href = "edit-profile.html";
  });

  bindClick("actionPaymentMethods", () => {
    /*
      Real-world flow:
      Payment method is currently managed inside checkout.
      Later you can build payment-methods.html.
    */
    window.location.href = "payment.html";
  });

bindClick("actionNotifications", () => {
  if (typeof window.bindNotificationBell === "function") {
    window.bindNotificationBell();
  }

  const bell = document.getElementById("notificationBell");

  if (bell) {
    bell.click();
    return;
  }

  alert("Notifications are available from the top navbar bell.");
});

bindClick("actionSettings", () => {
  window.location.href = "account-settings.html";
});

  bindClick("actionSettings", () => {
    /*
      Real-world flow:
      Until settings.html exists, account settings are managed from Edit Profile.
    */
    window.location.href = "edit-profile.html";
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
  if (typeof window.getSavedUserProfile === "function") {
    const savedProfile = window.getSavedUserProfile();

    return {
      ...savedProfile,
      points: getCurrentRewardPoints(savedProfile),
    };
  }

  const profile = readJson("userProfile", {});

  return {
    name:
      profile.name ||
      localStorage.getItem("userName") ||
      localStorage.getItem("pendingVerificationName") ||
      "User",

    email:
      profile.email ||
      localStorage.getItem("userEmail") ||
      localStorage.getItem("pendingVerificationEmail") ||
      "No email added",

    phone: profile.phone || localStorage.getItem("userPhone") || "",

    address: profile.address || localStorage.getItem("userAddress") || "",

    profileImage:
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

  return Array.isArray(orders)
    ? [...orders].sort((a, b) => {
        const aTime = new Date(a.timestamp || a.created_at || 0).getTime();
        const bTime = new Date(b.timestamp || b.created_at || 0).getTime();
        return bTime - aTime;
      })
    : [];
}

function getFavoriteIdsSafe() {
  if (typeof window.getFavoriteIds === "function") {
    return window.getFavoriteIds();
  }

  try {
    const parsed = JSON.parse(
      localStorage.getItem("foodDeliveryFavorites") || "[]",
    );

    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    return [];
  }
}

function saveFavoriteIdsSafe(ids) {
  if (typeof window.saveFavoriteIds === "function") {
    window.saveFavoriteIds(ids);
    return;
  }

  localStorage.setItem("foodDeliveryFavorites", JSON.stringify(ids || []));
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
    0,
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
   UI HELPERS
================================ */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatStatus(status) {
  const map = {
    pending: "Pending",
    confirmed: "Confirmed",
    preparing: "Preparing",
    ready_for_pickup: "Ready for pickup",
    searching: "Finding rider",
    rider_assigned: "Rider assigned",
    accepted: "Rider accepted",
    picked_up: "Picked up",
    on_the_way: "On the way",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  return map[status] || "Pending";
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