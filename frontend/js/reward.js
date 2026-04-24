const REWARD_TIERS = [
  { discount: 5, pointsRequired: 500, title: "5% OFF" },
  { discount: 10, pointsRequired: 900, title: "10% OFF" },
  { discount: 15, pointsRequired: 1300, title: "15% OFF" },
  { discount: 20, pointsRequired: 2000, title: "20% OFF" },
];

const REWARDS_STORAGE_KEY = "foodexpressRewards";
const LEGACY_POINTS_KEY = "userPoints";

function getDefaultRewardsData() {
  const legacyPoints = Number(localStorage.getItem(LEGACY_POINTS_KEY)) || 0;

  return {
    currentPoints: legacyPoints,
    lifetimePoints: legacyPoints,
    activeCoupons: [],
    redeemedRewards: [],
    history: [],
    processedOrderIds: [],
  };
}

function getRewardsData() {
  try {
    const saved = localStorage.getItem(REWARDS_STORAGE_KEY);

    if (!saved) {
      const defaultData = getDefaultRewardsData();
      localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(defaultData));
      return defaultData;
    }

    return JSON.parse(saved);
  } catch {
    const fallback = getDefaultRewardsData();
    localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

function saveRewardsData(data) {
  localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem(LEGACY_POINTS_KEY, String(data.currentPoints));
}

function createCoupon(discount) {
  return {
    id: `DISC${discount}_${Date.now()}`,
    discount,
    used: false,
    createdAt: new Date().toISOString(),
  };
}

/* ---------------- REWARDS UI ---------------- */

function renderRewards() {
  const data = getRewardsData();
  const points = data.currentPoints;

  document.getElementById("pointsValue").textContent = points;

  const next = REWARD_TIERS.find(r => points < r.pointsRequired);

  if (next) {
    const remaining = next.pointsRequired - points;
    document.getElementById("pointsText").textContent =
      `You're ${remaining} points away from ${next.title}`;

    document.getElementById("progressNumbers").textContent =
      `${points} / ${next.pointsRequired}`;

    document.getElementById("progressBar").style.width =
      (points / next.pointsRequired) * 100 + "%";
  }

  renderRewardCards();
  renderActiveCoupons();
}

/* ---------------- CARDS ---------------- */

function renderRewardCards() {
  const data = getRewardsData();
  const points = data.currentPoints;

  document.querySelectorAll("[data-reward-points]").forEach(card => {
    const cost = Number(card.dataset.rewardPoints);
    const discount = Number(card.dataset.rewardDiscount);

    const btn = card.querySelector("[data-redeem-button]");
    const status = card.querySelector("[data-reward-status]");

    const unlocked = points >= cost;

    btn.disabled = !unlocked;
    btn.textContent = unlocked ? "Redeem Now" : "Locked";

    status.textContent = unlocked
      ? `${discount}% ready`
      : `${cost - points} points needed`;

    btn.onclick = () => redeemReward(cost, discount);
  });
}

/* ---------------- COUPONS ---------------- */

function renderActiveCoupons() {
  const data = getRewardsData();
  const container = document.getElementById("activeCouponsList");
  if (!container) return;

  const coupons = data.activeCoupons.filter(c => !c.used);

  if (!coupons.length) {
    container.innerHTML = "<p>No active coupons</p>";
    return;
  }

  container.innerHTML = coupons.map(c => `
    <div class="coupon-card">
      <strong>${c.discount}% OFF</strong>
      <p>${c.id}</p>
    </div>
  `).join("");
}

/* ---------------- REDEEM ---------------- */

function redeemReward(cost, discount) {
  const data = getRewardsData();

  if (data.currentPoints < cost) {
    alert("Not enough points");
    return;
  }

  data.currentPoints -= cost;

  const coupon = createCoupon(discount);
  data.activeCoupons.push(coupon);

  saveRewardsData(data);

  alert(`${discount}% coupon unlocked!`);
  renderRewards();
}

/* ---------------- ORDER POINTS ---------------- */

function awardPointsFromOrder(order) {
  if (!order || !order.id) return;

  const data = getRewardsData();

  if (data.processedOrderIds.includes(order.id)) return;

  if (order.status !== "delivered") return;

  const earned = Math.floor(order.total / 10);

  data.currentPoints += earned;
  data.lifetimePoints += earned;
  data.processedOrderIds.push(order.id);

  saveRewardsData(data);
}

function awardPointsForLatestDeliveredOrder() {
  const raw = localStorage.getItem("latestOrder");
  if (!raw) return;

  const order = JSON.parse(raw);
  awardPointsFromOrder(order);
}

/* ---------------- CHECKOUT FUNCTIONS ---------------- */

function getAvailableCoupons() {
  return getRewardsData().activeCoupons.filter(c => !c.used);
}

function previewCouponDiscount(couponId, total) {
  const data = getRewardsData();
  const coupon = data.activeCoupons.find(c => c.id === couponId && !c.used);

  if (!coupon) return { success: false };

  const discountAmount = total * coupon.discount / 100;

  return {
    success: true,
    discountAmount,
    finalTotal: total - discountAmount,
    coupon
  };
}

function markCouponAsUsed(couponId) {
  const data = getRewardsData();
  const coupon = data.activeCoupons.find(c => c.id === couponId);

  if (!coupon) return;

  coupon.used = true;
  saveRewardsData(data);
}

/* ---------------- GLOBAL ---------------- */

window.redeemReward = redeemReward;
window.getAvailableCoupons = getAvailableCoupons;
window.previewCouponDiscount = previewCouponDiscount;
window.markCouponAsUsed = markCouponAsUsed;

/* ---------------- INIT ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  awardPointsForLatestDeliveredOrder();
  renderRewards();
});