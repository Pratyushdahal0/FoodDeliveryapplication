const FAVORITES_KEY = "foodDeliveryFavorites";

/* ===============================
   ROLE NORMALIZER
================================ */

function normalizeAppRole(role) {
  const value = String(role || "").toLowerCase().trim();

  if (
    value === "restaurant_owner" ||
    value === "restaurant-owner" ||
    value === "owner" ||
    value.includes("restaurant")
  ) {
    return "restaurant_owner";
  }

  if (
    value === "delivery_rider" ||
    value === "delivery-rider" ||
    value === "rider" ||
    value.includes("rider") ||
    value.includes("delivery")
  ) {
    return "rider";
  }

  return "customer";
}

/* ===============================
   LOGOUT
================================ */

function logout() {
  const keysToRemove = [
    "isLoggedIn",
    "userEmail",
    "userName",
    "userRole",
    "userPhone",
    "userAddress",

    "foodExpressCurrentUser",
    "foodExpressEmailVerified",

    "foodDeliveryCartCount",
    "foodDeliveryCartItems",
    "checkoutItems",
    "checkoutRestaurantId",
    "checkoutRestaurantName",
    "checkoutTotal",
    "checkoutSubtotal",
    "checkoutTax",
    "lastOrder",

    "isOwnerLoggedIn",
    "foodExpressCurrentOwner",
    "ownerUserId",
    "ownerRestaurantId",
    "ownerRestaurantName",

    "isRiderLoggedIn",
    "foodExpressCurrentRider",
    "riderUserId",
  ];

  keysToRemove.forEach((key) => localStorage.removeItem(key));

  if (typeof clearStoredProfile === "function") {
    clearStoredProfile();
  }

  window.location.href = "landingpage.html";
}

/* ===============================
   AUTH CHECKS
================================ */

function requireAuth() {
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";

  if (!isLoggedIn) {
    alert("Please login first");
    window.location.href = "login.html";
    return false;
  }

  return true;
}

function getCurrentUserEmail() {
  const directEmail = localStorage.getItem("userEmail");

  if (directEmail) return directEmail;

  try {
    const currentUser = JSON.parse(
      localStorage.getItem("foodExpressCurrentUser") || "{}"
    );
    if (currentUser.email) return currentUser.email;
  } catch (error) {
    console.error("Error reading current user email", error);
  }

  if (typeof getSafeProfile === "function") {
    return getSafeProfile().email || "";
  }

  return "";
}

function getCurrentUserRole() {
  const directRole = localStorage.getItem("userRole");

  if (directRole) {
    return normalizeAppRole(directRole);
  }

  try {
    const currentUser = JSON.parse(
      localStorage.getItem("foodExpressCurrentUser") || "{}"
    );

    if (currentUser.role) {
      return normalizeAppRole(currentUser.role);
    }
  } catch (error) {
    console.error("Error reading current user role", error);
  }

  try {
    const owner = JSON.parse(
      localStorage.getItem("foodExpressCurrentOwner") || "{}"
    );

    if (owner.role || localStorage.getItem("isOwnerLoggedIn") === "true") {
      return "restaurant_owner";
    }
  } catch (error) {
    console.error("Error reading owner role", error);
  }

  try {
    const rider = JSON.parse(
      localStorage.getItem("foodExpressCurrentRider") || "{}"
    );

    if (rider.role || localStorage.getItem("isRiderLoggedIn") === "true") {
      return "rider";
    }
  } catch (error) {
    console.error("Error reading rider role", error);
  }

  if (typeof getSafeProfile === "function") {
    return normalizeAppRole(getSafeProfile().role || "");
  }

  return "customer";
}

function requireOwnerAuth() {
  if (!requireAuth()) return false;

  const rawRole =
    localStorage.getItem("userRole") ||
    JSON.parse(localStorage.getItem("foodExpressCurrentUser") || "{}").role ||
    JSON.parse(localStorage.getItem("foodExpressCurrentOwner") || "{}").role ||
    "";

  const normalizedRole = String(rawRole).toLowerCase().trim();

  const isOwner =
    normalizedRole === "restaurant_owner" ||
    normalizedRole === "restaurant-owner" ||
    normalizedRole === "owner" ||
    normalizedRole.includes("restaurant") ||
    localStorage.getItem("isOwnerLoggedIn") === "true";

  if (!isOwner) {
    console.log("[shared.js] Owner auth failed:", {
      rawRole,
      normalizedRole,
      isOwnerLoggedIn: localStorage.getItem("isOwnerLoggedIn"),
      currentOwner: localStorage.getItem("foodExpressCurrentOwner"),
    });

    alert("Owner access only. Redirecting to customer dashboard.");
    window.location.href = "dashboard.html";
    return false;
  }

  console.log("[shared.js] Owner auth passed:", {
    rawRole,
    normalizedRole,
  });

  return true;
}

function requireCustomerAuth() {
  if (!requireAuth()) return false;

  const role = getCurrentUserRole();

  if (role === "restaurant_owner") {
    alert("Customer access only. Redirecting to owner dashboard.");
    window.location.href = "ownerdashboard.html";
    return false;
  }

  if (role === "rider") {
    alert("Customer access only. Redirecting to rider dashboard.");
    window.location.href = "rider-dashboard.html";
    return false;
  }

  return true;
}

function requireRiderAuth() {
  if (!requireAuth()) return false;

  const role = getCurrentUserRole();
  const isRiderLoggedIn = localStorage.getItem("isRiderLoggedIn") === "true";

  if (role !== "rider" && !isRiderLoggedIn) {
    alert("Rider access only. Redirecting to customer dashboard.");
    window.location.href = "dashboard.html";
    return false;
  }

  return true;
}

/* ===============================
   FAVORITES
================================ */

function getFavoriteIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (error) {
    console.error("Error parsing favorites from localStorage", error);
    return [];
  }
}

function saveFavoriteIds(ids) {
  const normalized = Array.isArray(ids) ? ids.map(String) : [];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(normalized));
}

function isFavorite(productId) {
  return getFavoriteIds().includes(String(productId || ""));
}

function renderFavoriteButton(btn, isActive) {
  if (!btn) return;

  btn.textContent = isActive ? "♥" : "♡";
  btn.classList.toggle("liked", isActive);
  btn.style.color = isActive ? "#e53935" : "";
}

function toggleFavorite(productId, btn) {
  if (!productId) return [];

  const ids = getFavoriteIds();
  const id = String(productId);
  const index = ids.indexOf(id);
  const isActive = index === -1;

  if (isActive) {
    ids.push(id);
  } else {
    ids.splice(index, 1);
  }

  saveFavoriteIds(ids);
  renderFavoriteButton(btn, isActive);

  return ids;
}

function updateFavoriteButton(btn) {
  if (!btn) return;

  const productId = btn.dataset.productId;
  if (!productId) return;

  renderFavoriteButton(btn, isFavorite(productId));
}

function initFavoriteButtons(root = document) {
  root.querySelectorAll(".wishlist-btn[data-product-id]").forEach((btn) => {
    updateFavoriteButton(btn);
  });
}

/* ===============================
   GLOBAL EXPORTS
================================ */

window.logout = logout;
window.requireAuth = requireAuth;
window.getCurrentUserEmail = getCurrentUserEmail;
window.getCurrentUserRole = getCurrentUserRole;
window.requireOwnerAuth = requireOwnerAuth;
window.requireCustomerAuth = requireCustomerAuth;
window.requireRiderAuth = requireRiderAuth;

window.getFavoriteIds = getFavoriteIds;
window.saveFavoriteIds = saveFavoriteIds;
window.isFavorite = isFavorite;
window.toggleFavorite = toggleFavorite;
window.updateFavoriteButton = updateFavoriteButton;
window.initFavoriteButtons = initFavoriteButtons;