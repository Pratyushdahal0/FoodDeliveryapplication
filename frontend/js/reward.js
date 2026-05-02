console.log("[reward.js] Loaded - real-world FoodExpress rewards");

const REWARD_TIERS = [
  {
    discount: 5,
    pointsRequired: 500,
    title: "5% OFF",
    description: "Save on your next order",
  },
  {
    discount: 10,
    pointsRequired: 900,
    title: "10% OFF",
    description: "Better savings on meals",
  },
  {
    discount: 15,
    pointsRequired: 1300,
    title: "15% OFF",
    description: "Premium discount tier",
  },
  {
    discount: 20,
    pointsRequired: 2000,
    title: "20% OFF",
    description: "Maximum savings unlocked",
  },
];

const REWARDS_STORAGE_KEY = "foodexpressRewards";
const LEGACY_POINTS_KEY = "userPoints";
const DASHBOARD_POINTS_KEY = "foodExpressRewardPoints";
const ORDER_HISTORY_KEY = "foodExpressOrders";

const ACTIVE_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready_for_pickup",
];

const ACTIVE_DELIVERY_STATUSES = [
  "searching",
  "assigned",
  "picked_up",
  "on_the_way",
];

/* ===============================
   DATA MODEL
================================ */

function getDefaultRewardsData() {
  const legacyPoints =
    Number(localStorage.getItem(LEGACY_POINTS_KEY)) ||
    Number(localStorage.getItem(DASHBOARD_POINTS_KEY)) ||
    0;

  return {
    currentPoints: legacyPoints,
    lifetimePoints: legacyPoints,
    pendingPoints: 0,
    activeCoupons: [],
    redeemedRewards: [],
    history: [],
    processedOrderIds: [],
    cancelledOrderIds: [],
  };
}

function normalizeRewardsData(data) {
  const fallback = getDefaultRewardsData();

  return {
    currentPoints: Number(data?.currentPoints ?? fallback.currentPoints) || 0,
    lifetimePoints: Number(data?.lifetimePoints ?? fallback.lifetimePoints) || 0,
    pendingPoints: Number(data?.pendingPoints ?? 0) || 0,

    activeCoupons: Array.isArray(data?.activeCoupons) ? data.activeCoupons : [],

    redeemedRewards: Array.isArray(data?.redeemedRewards)
      ? data.redeemedRewards
      : [],

    history: Array.isArray(data?.history) ? data.history : [],

    processedOrderIds: Array.isArray(data?.processedOrderIds)
      ? data.processedOrderIds.map(String)
      : [],

    cancelledOrderIds: Array.isArray(data?.cancelledOrderIds)
      ? data.cancelledOrderIds.map(String)
      : [],
  };
}

function getRewardsData() {
  try {
    const saved = localStorage.getItem(REWARDS_STORAGE_KEY);

    if (!saved) {
      const defaultData = getDefaultRewardsData();
      saveRewardsData(defaultData);
      return defaultData;
    }

    return normalizeRewardsData(JSON.parse(saved));
  } catch (error) {
    console.warn("[reward.js] Rewards data parse failed:", error);

    const fallback = getDefaultRewardsData();
    saveRewardsData(fallback);
    return fallback;
  }
}

function saveRewardsData(data) {
  const cleanData = normalizeRewardsData(data);

  localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(cleanData));

  localStorage.setItem(LEGACY_POINTS_KEY, String(cleanData.currentPoints));
  localStorage.setItem(DASHBOARD_POINTS_KEY, String(cleanData.currentPoints));

  window.dispatchEvent(new Event("foodExpressRewardsUpdated"));

  return cleanData;
}

/* ===============================
   ORDER DETECTION
================================ */

function getAllKnownOrders() {
  const orders = [];

  const latestOrder = readJson("latestOrder", null);
  const lastOrder = readJson("lastOrder", null);
  const historyOrders = readJson(ORDER_HISTORY_KEY, []);

  if (latestOrder) orders.push(latestOrder);
  if (lastOrder) orders.push(lastOrder);
  if (Array.isArray(historyOrders)) orders.push(...historyOrders);

  const unique = [];
  const seen = new Set();

  orders.forEach((order) => {
    const id = getOrderId(order);
    if (!id || seen.has(id)) return;

    seen.add(id);
    unique.push(order);
  });

  return unique;
}

function getOrderId(order) {
  return String(
    order?.id ||
      order?.orderId ||
      order?.order_id ||
      order?.orderNumber ||
      order?.order_number ||
      ""
  );
}

function getOrderNumber(order) {
  return String(
    order?.orderNumber ||
      order?.order_number ||
      order?.orderId ||
      order?.id ||
      "order"
  );
}

function getOrderStatus(order) {
  return String(order?.status || "").toLowerCase().trim();
}

function getDeliveryStatus(order) {
  return String(
    order?.delivery_status ||
      order?.deliveryStatus ||
      ""
  )
    .toLowerCase()
    .trim();
}

function isOrderDelivered(order) {
  const status = getOrderStatus(order);
  const deliveryStatus = getDeliveryStatus(order);

  return status === "delivered" || deliveryStatus === "delivered";
}

function isOrderCancelled(order) {
  const status = getOrderStatus(order);
  const deliveryStatus = getDeliveryStatus(order);

  return (
    status === "cancelled" ||
    status === "canceled" ||
    deliveryStatus === "cancelled" ||
    deliveryStatus === "canceled"
  );
}

function isOrderActive(order) {
  const status = getOrderStatus(order);
  const deliveryStatus = getDeliveryStatus(order);

  if (isOrderDelivered(order) || isOrderCancelled(order)) return false;

  return (
    ACTIVE_ORDER_STATUSES.includes(status) ||
    ACTIVE_DELIVERY_STATUSES.includes(deliveryStatus)
  );
}

function getRewardPointsForOrder(order) {
  const total = Number(order?.total || 0);
  return Math.max(0, Math.floor(total / 10));
}

/* ===============================
   POINTS SYNC
================================ */

function syncOrdersIntoRewards() {
  const data = getRewardsData();
  const orders = getAllKnownOrders();

  let changed = false;
  let pendingPoints = 0;

  orders.forEach((order) => {
    const orderId = getOrderId(order);
    if (!orderId) return;

    const points = getRewardPointsForOrder(order);
    if (points <= 0) return;

    if (isOrderCancelled(order)) {
      if (!data.cancelledOrderIds.includes(orderId)) {
        data.cancelledOrderIds.push(orderId);

        addRewardHistory(data, {
          type: "cancelled",
          title: "No points earned",
          description: `Order ${getOrderNumber(order)} was cancelled, so no rewards were added.`,
          points: 0,
        });

        changed = true;
      }

      return;
    }

    if (isOrderDelivered(order)) {
      if (!data.processedOrderIds.includes(orderId)) {
        data.currentPoints += points;
        data.lifetimePoints += points;
        data.processedOrderIds.push(orderId);

        addRewardHistory(data, {
          type: "earn",
          title: "Points earned",
          description: `Delivered order ${getOrderNumber(order)} earned ${points} points.`,
          points,
        });

        changed = true;
      }

      return;
    }

    if (isOrderActive(order) && !data.processedOrderIds.includes(orderId)) {
      pendingPoints += points;
    }
  });

  if (Number(data.pendingPoints || 0) !== pendingPoints) {
    data.pendingPoints = pendingPoints;
    changed = true;
  }

  if (changed) {
    saveRewardsData(data);
  }

  return data;
}

function awardPointsFromOrder(order) {
  if (!order || !isOrderDelivered(order)) return false;

  const orderId = getOrderId(order);
  if (!orderId) return false;

  const data = getRewardsData();

  if (data.processedOrderIds.includes(orderId)) {
    return false;
  }

  if (isOrderCancelled(order)) {
    return false;
  }

  const earned = getRewardPointsForOrder(order);
  if (earned <= 0) return false;

  data.currentPoints += earned;
  data.lifetimePoints += earned;
  data.processedOrderIds.push(orderId);

  addRewardHistory(data, {
    type: "earn",
    title: "Points earned",
    description: `Delivered order ${getOrderNumber(order)} earned ${earned} points.`,
    points: earned,
  });

  saveRewardsData(data);
  return true;
}

/* ===============================
   COUPONS
================================ */

function createCoupon(discount) {
  return {
    id: `FDX-${discount}OFF-${String(Date.now()).slice(-6)}`,
    discount,
    used: false,
    createdAt: new Date().toISOString(),
  };
}

function redeemReward(cost, discount) {
  const data = getRewardsData();

  if (data.currentPoints < cost) {
    showRewardToast(
      "Not enough points",
      `You need ${cost - data.currentPoints} more points to unlock ${discount}% OFF.`,
      "warning"
    );
    return;
  }

  data.currentPoints -= cost;

  const coupon = createCoupon(discount);
  data.activeCoupons.push(coupon);

  data.redeemedRewards.push({
    discount,
    cost,
    couponId: coupon.id,
    createdAt: new Date().toISOString(),
  });

  addRewardHistory(data, {
    type: "redeem",
    title: `${discount}% coupon redeemed`,
    description: `Coupon ${coupon.id} is now available at checkout.`,
    points: -cost,
  });

  saveRewardsData(data);

  showRewardToast(
    "Coupon unlocked",
    `${discount}% OFF coupon is ready to use at checkout.`,
    "success"
  );

  renderRewards();
}

function getAvailableCoupons() {
  return getRewardsData().activeCoupons.filter((coupon) => !coupon.used);
}

function previewCouponDiscount(couponId, total) {
  const data = getRewardsData();

  const coupon = data.activeCoupons.find(
    (item) => String(item.id) === String(couponId) && !item.used
  );

  if (!coupon) {
    return {
      success: false,
      message: "This coupon is not available.",
    };
  }

  const baseTotal = Number(total || 0);

  if (baseTotal <= 0) {
    return {
      success: false,
      message: "Coupon can only be applied to a valid order total.",
    };
  }

  const discountAmount = Number(
    ((baseTotal * Number(coupon.discount || 0)) / 100).toFixed(2)
  );

  const finalTotal = Math.max(
    0,
    Number((baseTotal - discountAmount).toFixed(2))
  );

  return {
    success: true,
    discountAmount,
    finalTotal,
    coupon,
  };
}

function markCouponAsUsed(couponId) {
  const data = getRewardsData();

  const coupon = data.activeCoupons.find(
    (item) => String(item.id) === String(couponId)
  );

  if (!coupon || coupon.used) return false;

  coupon.used = true;
  coupon.usedAt = new Date().toISOString();

  addRewardHistory(data, {
    type: "coupon-used",
    title: `${coupon.discount}% coupon used`,
    description: `Coupon ${coupon.id} was applied to an order.`,
    points: 0,
  });

  saveRewardsData(data);
  return true;
}

/* ===============================
   RENDER
================================ */

function renderRewards() {
  syncOrdersIntoRewards();

  const pointsValue = document.getElementById("pointsValue");

  // reward.js is also loaded on checkout, dashboard, etc.
  // If rewards page elements are missing, only expose global functions.
  if (!pointsValue) return;

  const data = getRewardsData();
  const points = Number(data.currentPoints || 0);
  const pendingPoints = Number(data.pendingPoints || 0);
  const activeCoupons = data.activeCoupons.filter((coupon) => !coupon.used);

  setText("pointsValue", points);
  setText("lifetimePoints", data.lifetimePoints);
  setText("activeCouponCount", activeCoupons.length);
  setText("currentTierText", getCurrentTier(points));

  renderPendingPointsBanner(pendingPoints);
  renderNextReward(data);
  renderRewardCards();
  renderActiveCoupons();
  renderRewardHistory();
}

function renderPendingPointsBanner(pendingPoints) {
  const hero = document.querySelector(".rewards-hero");
  if (!hero) return;

  let banner = document.getElementById("pendingPointsBanner");

  if (!pendingPoints) {
    if (banner) banner.remove();
    return;
  }

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "pendingPointsBanner";
    banner.style.cssText = `
      grid-column: 1 / -1;
      margin-top: 18px;
      padding: 16px 18px;
      border-radius: 18px;
      background: #fff7ed;
      border: 1px solid #fed7aa;
      color: #9a3412;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 10px;
    `;

    hero.appendChild(banner);
  }

  banner.innerHTML = `
    <i class="fa-solid fa-clock"></i>
    <span>${pendingPoints} pending points will be added after your active order is delivered.</span>
  `;
}

function renderNextReward(data) {
  const points = Number(data.currentPoints || 0);
  const next = REWARD_TIERS.find((tier) => points < tier.pointsRequired);
  const highestTier = REWARD_TIERS[REWARD_TIERS.length - 1];

  if (!next) {
    setText("nextRewardTitle", "All rewards unlocked");
    setText(
      "nextRewardSubtitle",
      "You have enough points for the highest reward tier."
    );
    setText("progressNumbers", `${points} / ${highestTier.pointsRequired} points`);
    setText("pointsText", "You can redeem any available reward tier.");
    setText("progressBadge", "100%");

    setProgressBar(100);
    return;
  }

  const previousTierPoints = getPreviousTierPoints(next.pointsRequired);
  const tierRange = next.pointsRequired - previousTierPoints;
  const progressInTier = Math.max(0, points - previousTierPoints);
  const progress = Math.min(100, Math.round((progressInTier / tierRange) * 100));
  const remaining = next.pointsRequired - points;

  setText("nextRewardTitle", next.title);
  setText(
    "nextRewardSubtitle",
    `You're ${remaining} points away from ${next.title}.`
  );
  setText("progressNumbers", `${points} / ${next.pointsRequired} points`);
  setText("pointsText", `${remaining} points left to unlock this coupon.`);
  setText("progressBadge", `${progress}%`);

  setProgressBar(progress);
}

function renderRewardCards() {
  const data = getRewardsData();
  const points = Number(data.currentPoints || 0);

  document.querySelectorAll("[data-reward-points]").forEach((card) => {
    const cost = Number(card.dataset.rewardPoints);
    const discount = Number(card.dataset.rewardDiscount);

    const button = card.querySelector("[data-redeem-button]");
    const status = card.querySelector("[data-reward-status]");

    const unlocked = points >= cost;

    card.classList.toggle("unlocked", unlocked);
    card.classList.toggle("locked", !unlocked);

    if (status) {
      status.textContent = unlocked
        ? `${discount}% coupon available`
        : `${cost - points} points needed`;
    }

    if (button) {
      button.disabled = !unlocked;
      button.textContent = unlocked ? "Redeem coupon" : "Locked";
      button.onclick = () => redeemReward(cost, discount);
    }
  });
}

function renderActiveCoupons() {
  const container = document.getElementById("activeCouponsList");
  if (!container) return;

  const coupons = getAvailableCoupons();

  if (!coupons.length) {
    container.innerHTML = `
      <div class="empty-state">
        No active coupons yet. Redeem a reward tier when you have enough points.
      </div>
    `;
    return;
  }

  container.innerHTML = coupons
    .map(
      (coupon) => `
        <div class="coupon-card">
          <div class="coupon-main">
            <strong>${coupon.discount}% OFF</strong>
            <p>Ready to apply at checkout</p>
          </div>
          <div class="coupon-code">${escapeHtml(coupon.id)}</div>
        </div>
      `
    )
    .join("");
}

function renderRewardHistory() {
  const container = document.getElementById("rewardHistoryList");
  if (!container) return;

  const data = getRewardsData();

  if (!data.history.length) {
    container.innerHTML = `
      <div class="empty-state">
        No reward activity yet. Delivered orders and redeemed coupons will show here.
      </div>
    `;
    return;
  }

  container.innerHTML = data.history
    .slice(0, 8)
    .map((item) => {
      const points = Number(item.points || 0);
      const pointsClass = points >= 0 ? "plus" : "minus";
      const pointsLabel =
        points === 0 ? "" : `${points > 0 ? "+" : ""}${points} pts`;

      return `
        <div class="history-item">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.description)}</p>
            <p>${formatDate(item.createdAt)}</p>
          </div>
          <span class="history-points ${pointsClass}">
            ${pointsLabel}
          </span>
        </div>
      `;
    })
    .join("");
}

/* ===============================
   TOAST / UX
================================ */

function ensureRewardToast() {
  let toast = document.getElementById("rewardToast");

  if (toast) return toast;

  toast = document.createElement("div");
  toast.id = "rewardToast";
  toast.style.cssText = `
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 9999;
    width: min(380px, calc(100vw - 32px));
    padding: 16px 18px;
    border-radius: 18px;
    background: #111827;
    color: #ffffff;
    box-shadow: 0 20px 60px rgba(15,23,42,0.28);
    display: none;
    gap: 12px;
    align-items: flex-start;
  `;

  document.body.appendChild(toast);
  return toast;
}

function showRewardToast(title, message, type = "success") {
  const toast = ensureRewardToast();

  const icon =
    type === "success"
      ? "fa-circle-check"
      : type === "warning"
        ? "fa-triangle-exclamation"
        : "fa-circle-info";

  const bg =
    type === "success"
      ? "#14532d"
      : type === "warning"
        ? "#78350f"
        : "#111827";

  toast.style.background = bg;
  toast.innerHTML = `
    <i class="fa-solid ${icon}" style="margin-top:3px;"></i>
    <div>
      <strong style="display:block;margin-bottom:4px;">${escapeHtml(title)}</strong>
      <span style="opacity:.9;line-height:1.45;">${escapeHtml(message)}</span>
    </div>
  `;

  toast.style.display = "flex";

  clearTimeout(window.__rewardToastTimer);
  window.__rewardToastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 3600);
}

/* ===============================
   HELPERS
================================ */

function addRewardHistory(data, item) {
  data.history.unshift({
    id: item.id || `history-${Date.now()}`,
    type: item.type || "info",
    title: item.title || "Reward update",
    description: item.description || "",
    points: Number(item.points || 0),
    createdAt: item.createdAt || new Date().toISOString(),
  });

  data.history = data.history.slice(0, 30);
}

function getCurrentTier(points) {
  if (points >= 2000) return "Elite";
  if (points >= 1300) return "Premium";
  if (points >= 900) return "Gold";
  if (points >= 500) return "Silver";
  return "Starter";
}

function getPreviousTierPoints(currentTierPoints) {
  const index = REWARD_TIERS.findIndex(
    (tier) => tier.pointsRequired === currentTierPoints
  );

  if (index <= 0) return 0;

  return REWARD_TIERS[index - 1].pointsRequired;
}

function setProgressBar(value) {
  const bar = document.getElementById("progressBar");
  if (bar) {
    bar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  }
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function formatDate(value) {
  if (!value) return "Just now";

  const date = new Date(value);
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
   GLOBAL EXPORTS
================================ */

window.redeemReward = redeemReward;
window.getAvailableCoupons = getAvailableCoupons;
window.previewCouponDiscount = previewCouponDiscount;
window.markCouponAsUsed = markCouponAsUsed;
window.awardPointsFromOrder = awardPointsFromOrder;
window.renderRewards = renderRewards;
window.getRewardsData = getRewardsData;
window.saveRewardsData = saveRewardsData;
window.syncOrdersIntoRewards = syncOrdersIntoRewards;

document.addEventListener("DOMContentLoaded", () => {
  renderRewards();
});

window.addEventListener("foodExpressRewardsUpdated", () => {
  renderRewards();
});

window.addEventListener("storage", (event) => {
  if (
    event.key === REWARDS_STORAGE_KEY ||
    event.key === LEGACY_POINTS_KEY ||
    event.key === DASHBOARD_POINTS_KEY ||
    event.key === ORDER_HISTORY_KEY ||
    event.key === "latestOrder" ||
    event.key === "lastOrder"
  ) {
    renderRewards();
  }
});