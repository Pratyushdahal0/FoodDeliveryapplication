// ══════════════════════════
// shop.js (FINAL WITH RESTAURANT NAME)
// ══════════════════════════

let allProducts = [];
const FAVORITES_KEY = 'foodDeliveryFavorites';
const DEFAULT_IMAGE = '../assets/images/placeholder-food.jpg';

// ---------- FAVORITES ----------
function getFavoriteIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(stored) ? stored.map(String) : [];
  } catch {
    return [];
  }
}

function saveFavoriteIds(ids) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids || []));
}

function isFavorite(productId) {
  return getFavoriteIds().includes(String(productId));
}

function toggleFavorite(productId, btn) {
  let ids = getFavoriteIds();
  const id = String(productId);

  if (ids.includes(id)) {
    ids = ids.filter((i) => i !== id);
  } else {
    ids.push(id);
  }

  saveFavoriteIds(ids);
  renderFavoriteButton(btn, ids.includes(id));
}

function renderFavoriteButton(btn, active) {
  if (!btn) return;
  btn.textContent = active ? '♥' : '♡';
  btn.classList.toggle('liked', active);
}

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      document
        .querySelectorAll('.filter-btn')
        .forEach((b) => b.classList.remove('active'));

      this.classList.add('active');
      filterProducts(this.textContent.toLowerCase());
    });
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('add-to-cart')) {
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

    if (!Array.isArray(allProducts)) {
      allProducts = [];
    }

    console.log('Loaded:', allProducts);
    renderProducts(allProducts);
  } catch (err) {
    console.error('Error loading products:', err);

    const grid = document.getElementById('productsGrid');
    if (grid) {
      grid.innerHTML = '<p>Failed to load products</p>';
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

  if (!products.length) {
    grid.innerHTML = '<p>No products found.</p>';
    if (countEl) countEl.textContent = 'No items';
    return;
  }

  products.forEach((product) => {
    grid.appendChild(createProductCard(product));
  });

  if (countEl) {
    countEl.textContent = `Showing ${products.length} item${
      products.length !== 1 ? 's' : ''
    }`;
  }
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

  const favoriteActive = isFavorite(productId);
  const popularBadge =
    Number(product.is_popular) === 1
      ? '<span class="popular-badge">Popular</span>'
      : '';

  card.innerHTML = `
    <div class="product-img">
      <img src="${productImage}" alt="${escapeHtml(productName)}" onerror="this.src='${DEFAULT_IMAGE}'" />
      ${popularBadge}
      <button class="wishlist-btn ${favoriteActive ? 'liked' : ''}" type="button">
        ${favoriteActive ? '♥' : '♡'}
      </button>
    </div>

    <div class="product-info">
      <div class="product-name">${escapeHtml(productName)}</div>
      <div class="product-restaurant" style="color:#777; font-size:0.95rem; margin:6px 0 10px;">
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

  const wishlistBtn = card.querySelector('.wishlist-btn');
  if (wishlistBtn) {
    wishlistBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(productId, wishlistBtn);
    });
  }

  return card;
}

// ---------- FILTER ----------
function filterProducts(filter) {
  if (filter.includes('all')) {
    renderProducts(allProducts);
    return;
  }

  if (filter.includes('popular')) {
    renderProducts(allProducts.filter((p) => Number(p.is_popular) === 1));
    return;
  }

  renderProducts(
    allProducts.filter(
      (p) => String(p.category || '').toLowerCase() === filter
    )
  );
}

// ---------- CART ----------
function handleAddToCart(btn) {
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
    alert('Product ID missing');
    return;
  }

  if (!product.restaurant_id) {
    alert('Restaurant info missing');
    return;
  }

  try {
    if (typeof addItemToCart !== 'function') {
      throw new Error('addItemToCart is not available');
    }

    addItemToCart(product);

    btn.textContent = '✓';
    btn.style.background = '#22c55e';

    setTimeout(() => {
      btn.textContent = '+';
      btn.style.background = '';
    }, 800);
  } catch (err) {
    console.error('Cart error:', err);
    alert('Cart error');
  }
}

// ---------- UTILS ----------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}