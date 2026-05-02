(function () {
  console.log("[modules/cart.js] Loaded - stable global cart helpers");

  const CART_COUNT_KEY = "foodDeliveryCartCount";
  const CART_ITEMS_KEY = "foodDeliveryCartItems";

  function readCartItems() {
    try {
      const raw = localStorage.getItem(CART_ITEMS_KEY) || "[]";
      const items = JSON.parse(raw);
      return Array.isArray(items) ? items : [];
    } catch (error) {
      console.error("[modules/cart.js] Error parsing cart items:", error);
      return [];
    }
  }

  function saveCartItems(items) {
    const safeItems = Array.isArray(items) ? items : [];
    localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(safeItems));
    window.dispatchEvent(new CustomEvent("foodexpress:cart-updated"));
  }

  function normalizeCartProduct(product) {
    return {
      id: String(product?.id || product?.product_id || ""),
      name: product?.name || product?.product_name || "Food item",
      price: Number(product?.price || 0),
      image_url: product?.image_url || product?.image || "",
      quantity: Number(product?.quantity || 1),
      restaurant_id: String(product?.restaurant_id || product?.restaurantId || ""),
      restaurant_name:
        product?.restaurant_name ||
        product?.restaurantName ||
        product?.restaurant ||
        "Unknown Restaurant",
    };
  }

  function updateCartBadge(count = null) {
    const finalCount =
      count !== null
        ? Number(count || 0)
        : readCartItems().reduce(
            (total, item) => total + Number(item.quantity || 0),
            0
          );

    const badge = document.getElementById("cartCount");

    if (badge) {
      badge.textContent = String(finalCount);
      badge.style.display = finalCount > 0 ? "flex" : "none";
    }

    return finalCount;
  }

  function updateCartCount() {
    const items = readCartItems();

    const count = items.reduce(
      (total, item) => total + Number(item.quantity || 0),
      0
    );

    localStorage.setItem(CART_COUNT_KEY, String(count));
    updateCartBadge(count);

    return count;
  }

  function addItemToCart(product) {
    const normalized = normalizeCartProduct(product);

    if (!normalized.id) {
      console.error("[modules/cart.js] Cannot add item without product id:", product);
      alert("Unable to add item: product information is missing.");
      return false;
    }

    if (!normalized.restaurant_id) {
      console.error(
        "[modules/cart.js] Cannot add item without restaurant_id:",
        product
      );
      alert("Unable to add item: restaurant information is missing.");
      return false;
    }

    const items = readCartItems();

    const existing = items.find((item) => {
      return (
        String(item.id) === String(normalized.id) &&
        String(item.restaurant_id) === String(normalized.restaurant_id)
      );
    });

    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + normalized.quantity;
    } else {
      items.push(normalized);
    }

    saveCartItems(items);
    updateCartCount();

    return true;
  }

  function removeItemFromCart(productId, restaurantId = null) {
    const items = readCartItems();

    const filtered =
      restaurantId === null
        ? items.filter((item) => String(item.id) !== String(productId))
        : items.filter((item) => {
            return !(
              String(item.id) === String(productId) &&
              String(item.restaurant_id) === String(restaurantId)
            );
          });

    saveCartItems(filtered);
    updateCartCount();
  }

  function clearCart() {
    localStorage.removeItem(CART_COUNT_KEY);
    localStorage.removeItem(CART_ITEMS_KEY);
    updateCartBadge(0);
    window.dispatchEvent(new CustomEvent("foodexpress:cart-updated"));
  }

  function setupNavbarCartIcon() {
    const badge = document.getElementById("cartCount");
    if (badge) {
      updateCartCount();
      return;
    }

    const navbarRight = document.querySelector(".navbar-right");
    if (!navbarRight || document.getElementById("cartButton")) {
      updateCartCount();
      return;
    }

    const cartButton = document.createElement("a");
    cartButton.href = "cart.html";
    cartButton.id = "cartButton";
    cartButton.className = "cart-btn";
    cartButton.innerHTML = `
      <i class="fa-solid fa-cart-shopping"></i>
      <span class="cart-count" id="cartCount">0</span>
    `;

    cartButton.addEventListener("click", function (event) {
      if (updateCartCount() === 0) {
        event.preventDefault();
        alert("Your cart is empty. Add items first.");
      }
    });

    navbarRight.insertBefore(cartButton, navbarRight.firstChild);
    updateCartCount();
  }

  function initializeCartCount() {
    setupNavbarCartIcon();
    updateCartCount();
  }

  function incrementCartCount(amount = 1) {
    const current = Number(localStorage.getItem(CART_COUNT_KEY) || 0);
    const next = current + Number(amount || 1);
    localStorage.setItem(CART_COUNT_KEY, String(next));
    updateCartBadge(next);
    return next;
  }

  window.getCartItemsFromStorage = readCartItems;
  window.saveCartItemsToStorage = saveCartItems;
  window.getCartCountFromStorage = function () {
    return Number(localStorage.getItem(CART_COUNT_KEY) || 0);
  };
  window.saveCartCountToStorage = function (count) {
    localStorage.setItem(CART_COUNT_KEY, String(Number(count || 0)));
    updateCartBadge(Number(count || 0));
  };

  window.addItemToCart = addItemToCart;
  window.removeItemFromCart = removeItemFromCart;
  window.clearCart = clearCart;
  window.updateCartCount = updateCartCount;
  window.updateCartBadge = updateCartBadge;
  window.setupNavbarCartIcon = setupNavbarCartIcon;
  window.initializeCartCount = initializeCartCount;
  window.incrementCartCount = incrementCartCount;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeCartCount);
  } else {
    initializeCartCount();
  }

  window.addEventListener("storage", function (event) {
    if (event.key === CART_ITEMS_KEY || event.key === CART_COUNT_KEY) {
      updateCartCount();
    }
  });

  window.addEventListener("foodexpress:cart-updated", function () {
    updateCartCount();
  });
})();