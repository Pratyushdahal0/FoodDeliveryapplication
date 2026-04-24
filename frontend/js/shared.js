const FAVORITES_KEY = 'foodDeliveryFavorites';

function logout() {
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userRole');
  localStorage.removeItem('foodDeliveryCartCount');
  localStorage.removeItem('foodDeliveryCartItems');
  localStorage.removeItem('checkoutItems');
  localStorage.removeItem('checkoutRestaurantId');
  localStorage.removeItem('checkoutRestaurantName');
  localStorage.removeItem('checkoutTotal');
  localStorage.removeItem('checkoutSubtotal');
  localStorage.removeItem('checkoutTax');
  localStorage.removeItem('lastOrder');

  if (typeof clearStoredProfile === 'function') {
    clearStoredProfile();
  }

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
  if (typeof getSafeProfile === 'function') {
    return getSafeProfile().email || '';
  }
  return localStorage.getItem('userEmail') || '';
}

function getCurrentUserRole() {
  if (typeof getSafeProfile === 'function') {
    return getSafeProfile().role || '';
  }
  return localStorage.getItem('userRole') || '';
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
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
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
  return getFavoriteIds().includes(String(productId || ''));
}

function renderFavoriteButton(btn, isActive) {
  if (!btn) return;
  btn.textContent = isActive ? '♥' : '♡';
  btn.classList.toggle('liked', isActive);
  btn.style.color = isActive ? '#e53935' : '';
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
  root.querySelectorAll('.wishlist-btn[data-product-id]').forEach((btn) => {
    updateFavoriteButton(btn);
  });
}

window.logout = logout;
window.requireAuth = requireAuth;
window.getCurrentUserEmail = getCurrentUserEmail;
window.getCurrentUserRole = getCurrentUserRole;
window.requireOwnerAuth = requireOwnerAuth;
window.requireCustomerAuth = requireCustomerAuth;
window.getFavoriteIds = getFavoriteIds;
window.saveFavoriteIds = saveFavoriteIds;
window.isFavorite = isFavorite;
window.toggleFavorite = toggleFavorite;
window.updateFavoriteButton = updateFavoriteButton;
window.initFavoriteButtons = initFavoriteButtons;