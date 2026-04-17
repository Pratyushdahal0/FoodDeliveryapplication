// ══════════════════════════
// shop.js
// Final stable version - no recursive favorite bug
// ══════════════════════════

console.log("NEW SHOP JS LOADED - STABLE VERSION");

let allProducts = [];
const SHOP_FAVORITES_KEY = 'foodDeliveryFavorites';
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80';

// ---------- FAVORITES ----------
function shopGetFavoriteIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(SHOP_FAVORITES_KEY) || '[]');
    return Array.isArray(stored) ? stored.map(String) : [];
  } catch (error) {
    console.error('Failed to parse favorites:', error);
    return [];
  }
}

function shopSaveFavoriteIds(ids) {
  const normalized = Array.isArray(ids) ? ids.map(String) : [];
  localStorage.setItem(SHOP_FAVORITES_KEY, JSON.stringify(normalized));
}

function shopIsFavorite(productId) {
  return shopGetFavoriteIds().includes(String(productId || ''));
}

function shopRenderFavoriteButton(btn, isActive) {
  if (!btn) return;
  btn.textContent = isActive ? '♥' : '♡';
  btn.classList.toggle('liked', isActive);
  btn.style.color = isActive ? '#e53935' : '';
}

function shopToggleFavorite(productId, btn) {
  if (!productId) return;

  const ids = shopGetFavoriteIds();
  const id = String(productId);
  const index = ids.indexOf(id);
  const willBeActive = index === -1;

  if (willBeActive) {
    ids.push(id);
  } else {
    ids.splice(index, 1);
  }

  shopSaveFavoriteIds(ids);
  shopRenderFavoriteButton(btn, willBeActive);
}

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();

  const filterBtns = document.querySelectorAll('.filter-btn');

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', function () {
      filterBtns.forEach((b) => b.classList.remove('active'));
      this.classList.add('active');

      const filter = this.textContent.trim().toLowerCase();
      filterProducts(filter);
    });
  });

  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('add-to-cart')) {
      e.stopPropagation();
      handleAddToCart(e.target);
    }
  });

  const contactBtn = document.querySelector('.btn-contact');
  if (contactBtn) {
    contactBtn.addEventListener('click', () => {
      alert('📩 Opening contact form...');
    });
  }
});

// ---------- LOAD ----------
async function loadProducts() {
  const countEl = document.querySelector('.products-count');

  try {
    console.log('Loading products...');
    allProducts = await getAllProducts();
    console.log('Loaded products:', allProducts);

    if (!Array.isArray(allProducts)) {
      allProducts = [];
    }

    renderProducts(allProducts);
  } catch (error) {
    console.error('Error loading products:', error);
    allProducts = [];

    const grid = document.getElementById('productsGrid');
    if (grid) {
      grid.innerHTML = '<p>Failed to load products.</p>';
    }

    if (countEl) {
      countEl.textContent = 'Error loading products';
    }
  }
}

// ---------- RENDER ----------
function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  const countEl = document.querySelector('.products-count');

  if (!grid) return;

  grid.innerHTML = '';

  if (!Array.isArray(products) || products.length === 0) {
    grid.innerHTML = '<p>No products found.</p>';
    if (countEl) countEl.textContent = 'No items';
    return;
  }

  products.forEach((product) => {
    const card = createProductCard(product);
    grid.appendChild(card);
  });

  if (countEl) {
    countEl.textContent = `Showing ${products.length} item${
      products.length !== 1 ? 's' : ''
    }`;
  }

  attachWishlistListeners();
}

// ---------- CARD ----------
function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';

  const productId = String(product.id || '');
  const productName = product.name || 'Unnamed Product';
  const productPrice = Number(product.price || 0);
  const productImage = product.image_url || DEFAULT_IMAGE;
  const restaurantId = String(product.restaurant_id || '');
  const restaurantName =
    product.restaurant_name ||
    product.restaurant ||
    product.restaurant_title ||
    'Unknown Restaurant';

  const popularBadge =
    Number(product.is_popular) === 1
      ? '<span class="popular-badge">Popular</span>'
      : '';

  const favoriteActive = shopIsFavorite(productId);
  const favoriteClass = favoriteActive ? 'liked' : '';
  const favoriteIcon = favoriteActive ? '♥' : '♡';

  card.innerHTML = `
    <div class="product-img">
      <img
        src="${productImage}"
        alt="${escapeHtml(productName)}"
        onerror="this.src='${DEFAULT_IMAGE}'"
      />
      ${popularBadge}
      <button class="wishlist-btn ${favoriteClass}" data-product-id="${productId}">
        ${favoriteIcon}
      </button>
    </div>
    <div class="product-info">
      <div class="product-name">${escapeHtml(productName)}</div>
      <div class="product-restaurant" style="font-size:0.95rem;color:#777;margin:6px 0 10px;">
        from ${escapeHtml(restaurantName)}
      </div>
      <div class="product-rating">
        <span class="star">★</span> ${product.rating || 0}
        <span>(${product.delivery_time || 'N/A'})</span>
      </div>
      <div class="product-footer">
        <span class="product-price">$${productPrice.toFixed(2)}</span>
        <button
          class="add-to-cart"
          data-product-id="${productId}"
          data-product-name="${escapeHtml(productName)}"
          data-product-price="${productPrice}"
          data-product-image="${productImage}"
          data-restaurant-id="${restaurantId}"
          data-restaurant-name="${escapeHtml(restaurantName)}"
          title="Add to cart"
          type="button"
        >
          +
        </button>
      </div>
    </div>
  `;

  return card;
}

// ---------- FILTER ----------
function filterProducts(filter) {
  let filtered = [];

  if (filter === 'all items') {
    filtered = allProducts;
  } else if (filter === 'popular') {
    filtered = allProducts.filter((p) => Number(p.is_popular) === 1);
  } else {
    filtered = allProducts.filter(
      (p) => String(p.category || '').toLowerCase() === filter
    );
  }

  renderProducts(filtered);
}

// ---------- WISHLIST ----------
function attachWishlistListeners() {
  document.querySelectorAll('.wishlist-btn').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();

      const productId = this.dataset.productId;
      if (!productId) return;

      shopToggleFavorite(productId, this);
    });
  });
}

// ---------- CART ----------
function handleAddToCart(btn) {
  if (!btn || btn.classList.contains('adding')) return;

  const product = {
    id: btn.dataset.productId,
    name: btn.dataset.productName,
    price: Number(btn.dataset.productPrice || 0),
    image_url: btn.dataset.productImage || DEFAULT_IMAGE,
    quantity: 1,
    restaurant_id: btn.dataset.restaurantId,
    restaurant_name: btn.dataset.restaurantName || 'Unknown Restaurant'
  };

  if (!product.id) {
    alert('Product ID is missing.');
    console.error('Missing product id:', product);
    return;
  }

  if (!product.restaurant_id) {
    alert('This item cannot be added because restaurant information is missing.');
    console.error('Missing restaurant_id for product:', product);
    return;
  }

  btn.classList.add('adding');
  const originalText = btn.textContent;

  btn.textContent = '✓';
  btn.style.background = '#22c55e';
  btn.style.transform = 'scale(1.15)';

  try {
    if (typeof addItemToCart === 'function') {
      const added = addItemToCart(product);

      if (!added) {
        throw new Error('addItemToCart returned false');
      }
    } else {
      throw new Error('addItemToCart is not available');
    }
  } catch (error) {
    console.error('Failed to add item to cart:', error);
    alert('Failed to add item to cart.');
  }

  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
    btn.style.transform = '';
    btn.classList.remove('adding');
  }, 1000);
}

// ---------- UTILS ----------
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}