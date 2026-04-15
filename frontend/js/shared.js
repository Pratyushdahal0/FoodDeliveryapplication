const USER_PROFILE_KEY = 'foodExpressUserProfile';
const FAVORITES_KEY = 'foodDeliveryFavorites';
const CART_COUNT_KEY = 'foodDeliveryCartCount';
const CART_ITEMS_KEY = 'foodDeliveryCartItems';

function getUserProfile() {
  try {
    return JSON.parse(localStorage.getItem(USER_PROFILE_KEY) || 'null');
  } catch (error) {
    console.error('Error reading user profile from localStorage', error);
    return null;
  }
}

function saveUserProfile(profile) {
  if (!profile || typeof profile !== 'object') return;
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

function clearSession() {
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('userEmail');
  localStorage.removeItem(USER_PROFILE_KEY);
  localStorage.removeItem(CART_COUNT_KEY);
  localStorage.removeItem(CART_ITEMS_KEY);
  localStorage.removeItem('checkoutTotal');
  localStorage.removeItem('checkoutSubtotal');
  localStorage.removeItem('checkoutTax');
  localStorage.removeItem('lastOrder');
}

function logout() {
  clearSession();
  window.location.href = 'landingpage.html';
}

function requireAuth() {
  if (!localStorage.getItem('isLoggedIn')) {
    alert('Please login first');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function getCurrentUserEmail() {
  const profile = getUserProfile();
  return profile?.email || localStorage.getItem('userEmail') || '';
}

function getCurrentUserRole() {
  const profile = getUserProfile();
  return profile?.role || '';
}

async function fetchUserProfile(email) {
  if (!email) return null;

  try {
    const url = `../../backend/controllers/AuthController.php?action=profile&email=${encodeURIComponent(email)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error('Profile request failed: ' + res.status);
    }

    const data = await res.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.warn('Unable to fetch user profile from backend:', error);
    return null;
  }
}

function requireOwnerAuth() {
  if (!requireAuth()) return false;
  const role = getCurrentUserRole();
  if (role !== 'restaurant-owner') {
    alert('Owner access only. Redirecting to customer dashboard.');
    window.location.href = 'dashboard.html';
    return false;
  }
  return true;
}

function requireCustomerAuth() {
  if (!requireAuth()) return false;
  const role = getCurrentUserRole();
  if (role === 'restaurant-owner') {
    alert('Customer access only. Redirecting to owner dashboard.');
    window.location.href = 'ownerdashboard.html';
    return false;
  }
  return true;
}

function getFavoriteIds() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch (error) {
    console.error('Error parsing favorites from localStorage', error);
    return [];
  }
}

function saveFavoriteIds(ids) {
  const normalized = Array.isArray(ids) ? ids.map(String) : [];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(normalized));
}

function isFavorite(productId) {
  return getFavoriteIds().includes(String(productId));
}

function renderFavoriteButton(btn, isActive) {
  if (!btn) return;

  btn.textContent = isActive ? '♥' : '♡';
  btn.classList.toggle('liked', isActive);
  btn.style.color = isActive ? '#e53935' : '';
}

function toggleFavorite(productId, btn) {
  if (!productId) return;

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

  const active = isFavorite(productId);
  renderFavoriteButton(btn, active);
}

function initFavoriteButtons(root = document) {
  root.querySelectorAll('.wishlist-btn[data-product-id]').forEach((btn) => {
    updateFavoriteButton(btn);
  });
}

function getUserStats(profile) {
  const points = Number(profile?.points ?? 850);
  const orders = Number(profile?.orders ?? 0);
  const saved = Number(profile?.saved ?? 25);
  const nextThreshold = 1000;
  const progress = Math.min(100, Math.round((points / nextThreshold) * 100));

  return {
    points,
    orders,
    saved,
    nextThreshold,
    progress
  };
}

window.getUserProfile = getUserProfile;
window.saveUserProfile = saveUserProfile;
window.clearSession = clearSession;
window.logout = logout;
window.requireAuth = requireAuth;
window.getCurrentUserEmail = getCurrentUserEmail;
window.fetchUserProfile = fetchUserProfile;
window.getFavoriteIds = getFavoriteIds;
window.saveFavoriteIds = saveFavoriteIds;
window.isFavorite = isFavorite;
window.toggleFavorite = toggleFavorite;
window.updateFavoriteButton = updateFavoriteButton;
window.initFavoriteButtons = initFavoriteButtons;
window.getUserStats = getUserStats;
window.getCurrentUserRole = getCurrentUserRole;
window.requireOwnerAuth = requireOwnerAuth;
window.requireCustomerAuth = requireCustomerAuth;
