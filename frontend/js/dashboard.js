const ORDER_HISTORY_KEY = "foodExpressOrders";
const NOTIFICATION_PREF_KEY = "foodExpressNotificationsEnabled";
const DASHBOARD_PREFS_KEY = "foodExpressDashboardPrefs";
const DASHBOARD_DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80";

let allOrdersCache = [];
let showAllOrders = false;

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof bindProfileEverywhere === "function") {
    bindProfileEverywhere();
  }

  restoreDashboardPrefs();
  loadDashboardStats();
  setupTabs();
  setupDashboardActions();
  updateRewardsUI();
  await refreshDashboardData();
});

window.addEventListener("foodexpress:profile-updated", async () => {
  bindDashboardProfileInfo();
  updateRewardsUI();
  await refreshDashboardData();
});

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

  setText("ordersCount", totalOrders);
  setText("pointsCount", Number(profile.points || localStorage.getItem("userPoints") || 0));
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

function updateRewardsUI() {
  const profile = getDashboardProfile();

  const points = Number(
    profile.points ||
      localStorage.getItem("userPoints") ||
      localStorage.getItem("foodExpressRewardPoints") ||
      0,
  );

  const nextThreshold = 1000;
  const progress = Math.min(100, Math.round((points / nextThreshold) * 100));
  const remaining = Math.max(0, nextThreshold - points);

  const fill = document.getElementById("rewardsProgressFill");
  if (fill) fill.style.width = `${progress}%`;

  setText("rewardsProgressText", `${points} / ${nextThreshold} points`);

  if (remaining > 0) {
    setText(
      "rewardsSubtitle",
      `You're ${remaining} points away from a free meal!`,
    );
  } else {
    setText("rewardsSubtitle", "🎉 You unlocked your reward!");
  }
}

function setupTabs() {
  const recentTab = document.getElementById("recentTab");
  const favoriteTab = document.getElementById("favoriteTab");
  const ordersContent = document.getElementById("ordersContent");
  const favoritesContent = document.getElementById("favoritesContent");
  const viewAllBtn = document.getElementById("viewAllOrdersBtn");

  if (!recentTab || !favoriteTab || !ordersContent || !favoritesContent) return;

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

      const orderId = order.orderId || order.id || `ORD-${index + 1}`;
      const status = order.status || "pending";

      return `
        <div class="dashboard-order-item" data-order-index="${index}">
          <div class="dashboard-order-left">
            <div class="dashboard-order-title">${escapeHtml(orderTitle)}</div>
            <div class="dashboard-order-meta">
              Order #${escapeHtml(String(orderId))} • ${count} item${
                count !== 1 ? "s" : ""
              } • ${formatPlacedTime(order.timestamp || order.created_at)}
            </div>
          </div>
          <div class="dashboard-order-right">
            <div class="dashboard-order-total">$${Number(order.total || 0).toFixed(2)}</div>
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
      typeof getAllProducts === "function" ? await getAllProducts() : [];

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
          <div class="dashboard-favorite-item" data-product-id="${escapeHtml(
            String(item.id || ""),
          )}">
            <div class="dashboard-favorite-left">
              <img
                src="${escapeHtml(image)}"
                alt="${escapeHtml(name)}"
                class="dashboard-favorite-image"
                onerror="this.src='${DASHBOARD_DEFAULT_IMAGE}'"
              />
              <div class="dashboard-favorite-info">
                <div class="dashboard-favorite-name">${escapeHtml(name)}</div>
                <div class="dashboard-favorite-meta">${escapeHtml(subtitle)}</div>
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
    console.error("Failed to load favorites preview:", error);
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
          // ❌ REMOVE from favorites
          ids = ids.filter((id) => id !== String(productId));
          saveFavoriteIdsSafe(ids);

          // ✅ REMOVE CARD instantly from UI
          const card = button.closest(".dashboard-favorite-item");
          if (card) card.remove();

          // ✅ if empty → show message
          if (!ids.length) {
            const empty = document.getElementById("noFavoritesMsg");
            if (empty) empty.style.display = "block";
          }

        } else {
          // (rare case: add back)
          ids.push(String(productId));
          saveFavoriteIdsSafe(ids);
          button.classList.add("active");
          button.textContent = "♥";
        }
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

    alert("No order found yet. Place an order first.");
  });

  bindClick("actionRedeemPoints", () => {
    window.location.href = "rewards.html";
  });

  bindClick("actionEditProfile", () => {
    window.location.href = "edit-profile.html";
  });

  bindClick("actionAddresses", () => {
    const profile =
      typeof getSafeProfile === "function" ? getSafeProfile() : {};

    const address = getSavedAddress(profile);

    if (address) {
      alert(`Saved address:\n\n${address}`);
    } else {
      alert("No saved address found yet. Add one from Edit Profile.");
      window.location.href = "edit-profile.html";
    }
  });

  bindClick("actionPaymentMethods", () => {
    window.location.href = "payment.html";
  });

  bindClick("actionNotifications", () => {
    const current = localStorage.getItem(NOTIFICATION_PREF_KEY);
    const nextValue = current === "false" ? "true" : "false";
    localStorage.setItem(NOTIFICATION_PREF_KEY, nextValue);

    alert(
      nextValue === "true"
        ? "Notifications turned ON."
        : "Notifications turned OFF.",
    );
  });

  bindClick("actionSettings", () => {
    const profile =
      typeof getSafeProfile === "function" ? getSafeProfile() : {};
    const notificationsEnabled =
      localStorage.getItem(NOTIFICATION_PREF_KEY) !== "false";

    alert(
      `Account Settings\n\nName: ${profile.name || "Guest User"}\nEmail: ${
        profile.email || "No email"
      }\nNotifications: ${notificationsEnabled ? "On" : "Off"}`,
    );
  });

  bindClick("actionLogout", () => {
    if (typeof logout === "function") {
      logout();
    } else {
      localStorage.removeItem("isLoggedIn");
      window.location.href = "landingpage.html";
    }
  });
}

function bindClick(id, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", handler);
}

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

function getSavedAddress(profile = {}) {
  const parts = [
    profile.address,
    profile.address_line1,
    profile.address_line2,
    profile.city,
    profile.state,
    profile.country,
  ]
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter(Boolean);

  return parts.join(", ");
}

function getFavoriteIdsSafe() {
  if (typeof getFavoriteIds === "function") {
    return getFavoriteIds();
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
  if (typeof saveFavoriteIds === "function") {
    saveFavoriteIds(ids);
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
function getDashboardProfile() {
  if (typeof window.getSavedUserProfile === "function") {
    const savedProfile = window.getSavedUserProfile();

    return {
      ...savedProfile,
      points:
        savedProfile.points ||
        localStorage.getItem("userPoints") ||
        localStorage.getItem("foodExpressRewardPoints") ||
        0,
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

    phone:
      profile.phone ||
      localStorage.getItem("userPhone") ||
      "",

    address:
      profile.address ||
      localStorage.getItem("userAddress") ||
      "",

    profileImage:
      profile.profileImage ||
      profile.image ||
      localStorage.getItem("userProfileImage") ||
      "",

    points:
      profile.points ||
      localStorage.getItem("userPoints") ||
      localStorage.getItem("foodExpressRewardPoints") ||
      0,
  };
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatStatus(status) {
  const map = {
    pending: "Pending",
    confirmed: "Confirmed",
    preparing: "Preparing",
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
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}