// Cart Page Logic

document.addEventListener('DOMContentLoaded', function() {
  renderCart();
  
  // Proceed to checkout button
  document.getElementById('proceedCheckoutBtn').addEventListener('click', proceedToCheckout);
});

function renderCart() {
  const items = getCartItemsFromStorage();
  const emptyCart = document.getElementById('emptyCart');
  const cartItemsContainer = document.getElementById('cartItemsContainer');
  const cartItemsList = document.getElementById('cartItemsList');
  const cartStatusText = document.getElementById('cartStatusText');
  
  if (items.length === 0) {
    emptyCart.style.display = 'block';
    cartItemsContainer.style.display = 'none';
    cartStatusText.textContent = 'Add items from the shop or menu to get started!';
    return;
  }
  
  emptyCart.style.display = 'none';
  cartItemsContainer.style.display = 'block';
  cartStatusText.textContent = `${items.length} item${items.length !== 1 ? 's' : ''} in cart`;
  
  // Render items
  cartItemsList.innerHTML = items.map(item => `
    <div class="cart-item">
      <div class="cart-item-image">
        <img src="${item.image_url}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/80'">
      </div>
      <div class="cart-item-details">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">$${Number(item.price).toFixed(2)}</div>
      </div>
      <div class="cart-item-quantity">
        <button class="qty-btn" onclick="changeQuantity(${item.id}, -1)">−</button>
        <span class="quantity">${item.quantity}</span>
        <button class="qty-btn" onclick="changeQuantity(${item.id}, 1)">+</button>
      </div>
      <button class="remove-btn" onclick="removeItem(${item.id})">Remove</button>
    </div>
  `).join('');
  
  updateSummary();
}

function changeQuantity(productId, delta) {
  const items = getCartItemsFromStorage();
  const item = items.find(i => i.id === productId);
  
  if (!item) return;
  //still not working properly, need to check console for errors and debug further
  item.quantity += delta;
  if (item.quantity <= 0) {
    removeItem(productId);
  } else {
    saveCartItemsToStorage(items);
    updateCartCount();
    renderCart();
  }
}
//still not working properly, need to check console for errors and debug further
function removeItem(productId) {
  removeItemFromCart(productId);
  renderCart();
}
//still not working properly, need to check console for errors and debug further
function updateSummary() {
  const items = getCartItemsFromStorage();
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
  const deliveryFee = 5.00;
  const tax = subtotal * 0.1; // 10% tax
  const total = subtotal + deliveryFee + tax;
  
  document.getElementById('subtotal').textContent = subtotal.toFixed(2);
  document.getElementById('tax').textContent = tax.toFixed(2);
  document.getElementById('total').textContent = total.toFixed(2);
}

function proceedToCheckout() {
  const items = getCartItemsFromStorage();
  if (items.length === 0) {
    alert('Your cart is empty!');
    return;
  }
  
  // Store cart total for checkout page
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);
  const deliveryFee = 5.00;
  const tax = subtotal * 0.1;
  const total = subtotal + deliveryFee + tax;
  
  localStorage.setItem('checkoutTotal', total.toFixed(2));
  localStorage.setItem('checkoutSubtotal', subtotal.toFixed(2));
  localStorage.setItem('checkoutTax', tax.toFixed(2));
  
  // Redirect to payment/checkout page
  window.location.href = 'payment.html';
}