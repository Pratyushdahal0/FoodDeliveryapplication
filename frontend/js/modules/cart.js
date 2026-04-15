const CART_COUNT_KEY = 'foodDeliveryCartCount';
const CART_ITEMS_KEY = 'foodDeliveryCartItems';

function getCartCountFromStorage() {
  return Number(localStorage.getItem(CART_COUNT_KEY) || 0);
}

function saveCartCountToStorage(count) {
  localStorage.setItem(CART_COUNT_KEY, String(count));
}

function getCartItemsFromStorage() {
  try {
    const items = JSON.parse(localStorage.getItem(CART_ITEMS_KEY) || '[]');
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error('Error parsing cart items:', error);
    return [];
  }
}

function saveCartItemsToStorage(items) {
  localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(items));
}

function normalizeCartProduct(product) {
  return {
    id: String(product.id),
    name: product.name || 'Unnamed Item',
    price: Number(product.price || 0),
    image_url: product.image_url || 'https://via.placeholder.com/80',
    quantity: Number(product.quantity || 1),
    restaurant_id: String(product.restaurant_id || ''),
    restaurant_name: product.restaurant_name || 'Unknown Restaurant',
  };
}

function addItemToCart(product) {
  const normalized = normalizeCartProduct(product);

  if (!normalized.id || !normalized.restaurant_id) {
    console.error('Cannot add item without id and restaurant_id:', product);
    window.alert('Unable to add item: restaurant information is missing.');
    return false;
  }

  const items = getCartItemsFromStorage();
  const existing = items.find(
    (item) =>
      String(item.id) === normalized.id &&
      String(item.restaurant_id) === normalized.restaurant_id
  );

  if (existing) {
    existing.quantity += normalized.quantity;
  } else {
    items.push(normalized);
  }

  saveCartItemsToStorage(items);
  updateCartCount();
  return true;
}

function removeItemFromCart(productId, restaurantId = null) {
  const items = getCartItemsFromStorage();
  const filtered =
    restaurantId === null
      ? items.filter((item) => String(item.id) !== String(productId))
      : items.filter(
          (item) =>
            !(
              String(item.id) === String(productId) &&
              String(item.restaurant_id) === String(restaurantId)
            )
        );

  saveCartItemsToStorage(filtered);
  updateCartCount();
}

function updateCartCount() {
  const items = getCartItemsFromStorage();
  const count = items.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  );
  saveCartCountToStorage(count);
  updateCartBadge(count);
}

function updateCartBadge(count) {
  const badge = document.getElementById('cartCount');
  if (!badge) return;

  badge.textContent = String(count);
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function setupNavbarCartIcon() {
  const navbarRight = document.querySelector('.navbar-right');
  if (!navbarRight || document.getElementById('cartButton')) return;

  const cartButton = document.createElement('a');
  cartButton.href = 'cart.html';
  cartButton.id = 'cartButton';
  cartButton.className = 'cart-btn';
  cartButton.innerHTML = `
    <span aria-hidden="true">🛒</span>
    <span class="cart-count" id="cartCount">0</span>
  `;

  cartButton.addEventListener('click', (event) => {
    if (getCartCountFromStorage() === 0) {
      event.preventDefault();
      window.alert('Your cart is empty. Add items first!');
    }
  });

  navbarRight.insertBefore(cartButton, navbarRight.firstChild);
}

function initializeCartCount() {
  setupNavbarCartIcon();
  updateCartCount();
}

function incrementCartCount(amount = 1) {
  const nextCount = getCartCountFromStorage() + amount;
  saveCartCountToStorage(nextCount);
  updateCartBadge(nextCount);
  return nextCount;
}

window.getCartCountFromStorage = getCartCountFromStorage;
window.saveCartCountToStorage = saveCartCountToStorage;
window.getCartItemsFromStorage = getCartItemsFromStorage;
window.saveCartItemsToStorage = saveCartItemsToStorage;
window.addItemToCart = addItemToCart;
window.removeItemFromCart = removeItemFromCart;
window.updateCartCount = updateCartCount;
window.updateCartBadge = updateCartBadge;
window.setupNavbarCartIcon = setupNavbarCartIcon;
window.initializeCartCount = initializeCartCount;
window.incrementCartCount = incrementCartCount;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCartCount);
} else {
  initializeCartCount();
}