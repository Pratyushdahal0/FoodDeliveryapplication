document.addEventListener('DOMContentLoaded', () => {
  renderCart();

  const checkoutButton = document.getElementById('proceedCheckoutBtn');
  if (checkoutButton) {
    checkoutButton.addEventListener('click', proceedToCheckout);
  }
});

function renderCart() {
  const items = getCartItemsFromStorage();

  const emptyCart = document.getElementById('emptyCart');
  const cartItemsContainer = document.getElementById('cartItemsContainer');
  const cartItemsList = document.getElementById('cartItemsList');
  const cartStatusText = document.getElementById('cartStatusText');

  if (!emptyCart || !cartItemsContainer || !cartItemsList || !cartStatusText) {
    return;
  }

  if (!items.length) {
    emptyCart.style.display = 'block';
    cartItemsContainer.style.display = 'none';
    cartStatusText.textContent = 'Add items from the shop or menu to get started!';
    return;
  }

  emptyCart.style.display = 'none';
  cartItemsContainer.style.display = 'block';
  cartStatusText.textContent = `${items.length} item${
    items.length !== 1 ? 's' : ''
  } in cart`;

  cartItemsList.innerHTML = items
    .map(
      (item) => `
        <div class="cart-item">
          <div class="cart-item-image">
            <img
              src="${item.image_url}"
              alt="${item.name}"
              onerror="this.src='https://via.placeholder.com/80'"
            >
          </div>

          <div class="cart-item-details">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">$${Number(item.price).toFixed(2)}</div>
            <div class="cart-item-restaurant">from ${item.restaurant_name || 'Unknown Restaurant'}</div>
          </div>

          <div class="cart-item-quantity">
            <button class="qty-btn" onclick="changeQuantity('${item.id}', '${item.restaurant_id}', -1)">−</button>
            <span class="quantity">${item.quantity}</span>
            <button class="qty-btn" onclick="changeQuantity('${item.id}', '${item.restaurant_id}', 1)">+</button>
          </div>

          <button class="remove-btn" onclick="removeItem('${item.id}', '${item.restaurant_id}')">Remove</button>
        </div>
      `
    )
    .join('');

  updateSummary();
}

function changeQuantity(productId, restaurantId, delta) {
  const items = getCartItemsFromStorage();

  const item = items.find(
    (entry) =>
      String(entry.id) === String(productId) &&
      String(entry.restaurant_id) === String(restaurantId)
  );

  if (!item) return;

  item.quantity = Number(item.quantity || 0) + delta;

  if (item.quantity <= 0) {
    removeItem(productId, restaurantId);
    return;
  }

  saveCartItemsToStorage(items);
  updateCartCount();
  renderCart();
}

function removeItem(productId, restaurantId) {
  const items = getCartItemsFromStorage();

  const filtered = items.filter(
    (item) =>
      !(
        String(item.id) === String(productId) &&
        String(item.restaurant_id) === String(restaurantId)
      )
  );

  saveCartItemsToStorage(filtered);
  updateCartCount();
  renderCart();
}

function updateSummary() {
  const items = getCartItemsFromStorage();

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0
  );

  const deliveryFee = items.length ? 5.0 : 0;
  const tax = subtotal * 0.1;
  const total = subtotal + deliveryFee + tax;

  const subtotalEl = document.getElementById('subtotal');
  const taxEl = document.getElementById('tax');
  const totalEl = document.getElementById('total');

  if (subtotalEl) subtotalEl.textContent = subtotal.toFixed(2);
  if (taxEl) taxEl.textContent = tax.toFixed(2);
  if (totalEl) totalEl.textContent = total.toFixed(2);
}

function proceedToCheckout() {
  const items = getCartItemsFromStorage();

  if (!items.length) {
    alert('Your cart is empty!');
    return;
  }

  const restaurantIds = [
    ...new Set(items.map((item) => String(item.restaurant_id || '')).filter(Boolean)),
  ];

  if (!restaurantIds.length) {
    alert('Failed to place order: No valid restaurant_id found in cart items');
    return;
  }

  if (restaurantIds.length > 1) {
    alert('Your cart contains items from multiple restaurants. Please order from one restaurant at a time.');
    return;
  }

  const cleanItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    price: Number(item.price),
    image_url: item.image_url,
    quantity: Number(item.quantity),
    restaurant_id: String(item.restaurant_id),
    restaurant_name: item.restaurant_name || 'Unknown Restaurant',
  }));

  const subtotal = cleanItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const deliveryFee = 5.0;
  const tax = subtotal * 0.1;
  const total = subtotal + deliveryFee + tax;

  localStorage.setItem('checkoutItems', JSON.stringify(cleanItems));
  localStorage.setItem('checkoutRestaurantId', restaurantIds[0]);
  localStorage.setItem(
    'checkoutRestaurantName',
    cleanItems[0].restaurant_name || 'Unknown Restaurant'
  );
  localStorage.setItem('checkoutTotal', total.toFixed(2));
  localStorage.setItem('checkoutSubtotal', subtotal.toFixed(2));
  localStorage.setItem('checkoutTax', tax.toFixed(2));

  window.location.href = 'payment.html';
}

window.changeQuantity = changeQuantity;
window.removeItem = removeItem;
window.proceedToCheckout = proceedToCheckout;