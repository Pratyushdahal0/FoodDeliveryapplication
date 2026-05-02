console.log("[cart-page.js] Loaded - Nepal Rs cart summary fixed");

const CART_COUNT_KEY_SAFE = "foodDeliveryCartCount";
const CART_ITEMS_KEY_SAFE = "foodDeliveryCartItems";

document.addEventListener("DOMContentLoaded", () => {
  ensureCartHelpers();
  renderCart();

  const checkoutButton = document.getElementById("proceedCheckoutBtn");
  if (checkoutButton) {
    checkoutButton.addEventListener("click", proceedToCheckout);
  }
});

/* ===============================
   SELF-CONTAINED CART HELPERS
================================ */

function ensureCartHelpers() {
  if (typeof window.getCartItemsFromStorage !== "function") {
    window.getCartItemsFromStorage = function () {
      try {
        const items = JSON.parse(
          localStorage.getItem(CART_ITEMS_KEY_SAFE) || "[]"
        );
        return Array.isArray(items) ? items : [];
      } catch (error) {
        console.error("[cart-page.js] Error parsing cart items:", error);
        return [];
      }
    };
  }

  if (typeof window.saveCartItemsToStorage !== "function") {
    window.saveCartItemsToStorage = function (items) {
      localStorage.setItem(CART_ITEMS_KEY_SAFE, JSON.stringify(items || []));
      window.dispatchEvent(new CustomEvent("foodexpress:cart-updated"));
    };
  }

  if (typeof window.updateCartCount !== "function") {
    window.updateCartCount = function () {
      const items = window.getCartItemsFromStorage();
      const count = items.reduce(
        (total, item) => total + Number(item.quantity || 0),
        0
      );

      localStorage.setItem(CART_COUNT_KEY_SAFE, String(count));

      const badge = document.getElementById("cartCount");
      if (badge) {
        badge.textContent = String(count);
        badge.style.display = count > 0 ? "flex" : "none";
      }

      return count;
    };
  }

  window.updateCartCount();
}

/* ===============================
   REALISTIC NEPAL DELIVERY FEE
================================ */

function calculateFoodExpressDeliveryFee(subtotal) {
  const amount = Number(subtotal || 0);

  if (amount <= 0) return 0;
  if (amount >= 1500) return 0;
  if (amount >= 1000) return 20;
  if (amount >= 500) return 30;

  return 50;
}

function calculateFoodExpressTax(subtotal) {
  return Number(subtotal || 0) * 0.1;
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString("en-NP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatNpr(amount) {
  return `Rs. ${formatMoney(amount)}`;
}

/* ===============================
   CART RENDER
================================ */

function renderCart() {
  ensureCartHelpers();

  const items = window.getCartItemsFromStorage();

  const emptyCart = document.getElementById("emptyCart");
  const cartItemsContainer = document.getElementById("cartItemsContainer");
  const cartItemsList = document.getElementById("cartItemsList");
  const cartStatusText = document.getElementById("cartStatusText");

  if (!emptyCart || !cartItemsContainer || !cartItemsList || !cartStatusText) {
    updateSummary();
    return;
  }

  if (!items.length) {
    emptyCart.style.display = "block";
    cartItemsContainer.style.display = "none";
    cartStatusText.textContent =
      "Add items from the shop or menu to get started.";
    updateSummary();
    return;
  }

  emptyCart.style.display = "none";
  cartItemsContainer.style.display = "block";

  const totalQuantity = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  cartStatusText.textContent = `${totalQuantity} item${
    totalQuantity !== 1 ? "s" : ""
  } in cart`;

  cartItemsList.innerHTML = items
    .map((item) => {
      const id = escapeJs(item.id);
      const restaurantId = escapeJs(item.restaurant_id);
      const name = escapeHtml(item.name || "Food item");
      const image = escapeHtml(item.image_url || item.image || "");
      const price = Number(item.price || 0);
      const quantity = Number(item.quantity || 0);
      const restaurantName = escapeHtml(
        item.restaurant_name || "Unknown Restaurant"
      );

      return `
        <div class="cart-item">
          <div class="cart-item-image ${image ? "" : "image-missing"}">
            ${
              image
                ? `<img
                    src="${image}"
                    alt="${name}"
                    onerror="this.style.display='none'; this.parentElement.classList.add('image-missing');"
                  >`
                : ""
            }
          </div>

          <div class="cart-item-details">
            <div class="cart-item-name">${name}</div>
            <div class="cart-item-price">${formatNpr(price)}</div>
            <div class="cart-item-restaurant">from ${restaurantName}</div>
          </div>

          <div class="cart-item-quantity">
            <button class="qty-btn" onclick="changeQuantity('${id}', '${restaurantId}', -1)">−</button>
            <span class="quantity">${quantity}</span>
            <button class="qty-btn" onclick="changeQuantity('${id}', '${restaurantId}', 1)">+</button>
          </div>

          <button class="remove-btn" onclick="removeItem('${id}', '${restaurantId}')">Remove</button>
        </div>
      `;
    })
    .join("");

  updateSummary();
}

function changeQuantity(productId, restaurantId, delta) {
  ensureCartHelpers();

  const items = window.getCartItemsFromStorage();

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

  window.saveCartItemsToStorage(items);
  window.updateCartCount();
  renderCart();
}

function removeItem(productId, restaurantId) {
  ensureCartHelpers();

  const items = window.getCartItemsFromStorage();

  const filtered = items.filter(
    (item) =>
      !(
        String(item.id) === String(productId) &&
        String(item.restaurant_id) === String(restaurantId)
      )
  );

  window.saveCartItemsToStorage(filtered);
  window.updateCartCount();
  renderCart();
}

function updateSummary() {
  ensureCartHelpers();

  const items = window.getCartItemsFromStorage();

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const deliveryFee = calculateFoodExpressDeliveryFee(subtotal);
  const tax = calculateFoodExpressTax(subtotal);
  const total = subtotal + deliveryFee + tax;

  const subtotalEl = document.getElementById("subtotal");
  const deliveryEl = document.getElementById("deliveryFee");
  const taxEl = document.getElementById("tax");
  const totalEl = document.getElementById("total");

  if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
  if (deliveryEl) deliveryEl.textContent = formatMoney(deliveryFee);
  if (taxEl) taxEl.textContent = formatMoney(tax);
  if (totalEl) totalEl.textContent = formatMoney(total);

  localStorage.setItem("checkoutSubtotal", formatMoney(subtotal));
  localStorage.setItem("checkoutDeliveryFee", formatMoney(deliveryFee));
  localStorage.setItem("checkoutTax", formatMoney(tax));
  localStorage.setItem("checkoutTotal", formatMoney(total));
}

/* ===============================
   CHECKOUT
================================ */

function proceedToCheckout() {
  ensureCartHelpers();

  const items = window.getCartItemsFromStorage();

  if (!items.length) {
    alert("Your cart is empty.");
    return;
  }

  const restaurantIds = [
    ...new Set(
      items.map((item) => String(item.restaurant_id || "")).filter(Boolean)
    ),
  ];

  if (!restaurantIds.length) {
    alert("Failed to place order: No valid restaurant_id found in cart items.");
    return;
  }

  if (restaurantIds.length > 1) {
    alert(
      "Your cart contains items from multiple restaurants. Please order from one restaurant at a time."
    );
    return;
  }

  const cleanItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    price: Number(item.price || 0),
    image_url: item.image_url || item.image || "",
    quantity: Number(item.quantity || 1),
    restaurant_id: String(item.restaurant_id),
    restaurant_name: item.restaurant_name || "Unknown Restaurant",
  }));

  const subtotal = cleanItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const deliveryFee = calculateFoodExpressDeliveryFee(subtotal);
  const tax = calculateFoodExpressTax(subtotal);
  const total = subtotal + deliveryFee + tax;

  localStorage.setItem("checkoutItems", JSON.stringify(cleanItems));
  localStorage.setItem("checkoutRestaurantId", restaurantIds[0]);
  localStorage.setItem(
    "checkoutRestaurantName",
    cleanItems[0].restaurant_name || "Unknown Restaurant"
  );

  localStorage.setItem("checkoutSubtotal", formatMoney(subtotal));
  localStorage.setItem("checkoutDeliveryFee", formatMoney(deliveryFee));
  localStorage.setItem("checkoutTax", formatMoney(tax));
  localStorage.setItem("checkoutTotal", formatMoney(total));

  window.location.href = "payment.html";
}

/* ===============================
   HELPERS
================================ */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeJs(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

window.changeQuantity = changeQuantity;
window.removeItem = removeItem;
window.proceedToCheckout = proceedToCheckout;
window.calculateFoodExpressDeliveryFee = calculateFoodExpressDeliveryFee;