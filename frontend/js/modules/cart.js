// Shared cart badge helper
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
    return JSON.parse(localStorage.getItem(CART_ITEMS_KEY) || '[]');
  } catch (e) {
    console.error('Error parsing cart items:', e);
    return [];
  }
}

function saveCartItemsToStorage(items) {
  localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(items));
}

function addItemToCart(product) {
  const items = getCartItemsFromStorage();
  const existingItem = items.find(item => item.id === product.id);
  
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    items.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      quantity: 1
    });
  }
  
  saveCartItemsToStorage(items);
  updateCartCount();
  console.log('Item added to cart:', product.name);
}

function removeItemFromCart(productId) {
  const items = getCartItemsFromStorage();
  const filtered = items.filter(item => item.id !== productId);
  saveCartItemsToStorage(filtered);
  updateCartCount();
  console.log('Item removed from cart:', productId);
}

function updateCartCount() {
  const items = getCartItemsFromStorage();
  const count = items.reduce((total, item) => total + item.quantity, 0);
  saveCartCountToStorage(count);
  updateCartBadge(count);
}

function updateCartBadge(count) {
  const badge = document.getElementById('cartCount');
  if (!badge) {
    console.warn('Cart badge element not found');
    return;
  }

  badge.textContent = count;
  if (count > 0) {
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
  console.log('Cart badge updated to:', count);
}

function setupNavbarCartIcon() {
  const navbarRight = document.querySelector('.navbar-right');
  if (!navbarRight) {
    console.warn('navbar-right element not found');
    return;
  }
  if (document.getElementById('cartButton')) {
    console.log('Cart button already exists');
    return;
  }

  const cartButton = document.createElement('a');
  cartButton.href = 'cart.html';
  cartButton.id = 'cartButton';
  cartButton.className = 'cart-btn';
  cartButton.innerHTML = `
    <span aria-hidden="true">🛒</span>
    <span class="cart-count" id="cartCount">0</span>
  `;

  cartButton.addEventListener('click', function (event) {
    const currentCount = getCartCountFromStorage();
    if (currentCount === 0) {
      event.preventDefault();
      window.alert('Your cart is empty. Add items first!');
    }
  });

  // Create a new navbar right container if it's empty or append to the end
  if (navbarRight.children.length === 0) {
    navbarRight.appendChild(cartButton);
  } else {
    navbarRight.insertBefore(cartButton, navbarRight.firstChild);
  }
  console.log('Cart button added to navbar');
}

function initializeCartCount() {
  console.log('Initializing cart count');
  setupNavbarCartIcon();
  const count = getCartCountFromStorage();
  updateCartBadge(count);
  console.log('Cart initialized with count:', count);
}

function incrementCartCount(amount = 1) {
  const oldCount = getCartCountFromStorage();
  const nextCount = oldCount + amount;
  console.log('Incrementing cart count from', oldCount, 'to', nextCount);
  saveCartCountToStorage(nextCount);
  updateCartBadge(nextCount);
  return nextCount;
}


// Explicitly export to window for global access FIRST
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

console.log('[cart.js] Cart functions registered globally');

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('[cart.js] DOM ready, initializing cart');
    initializeCartCount();
  });
} else {
  console.log('[cart.js] DOM already ready, initializing cart immediately');
  initializeCartCount();
}
