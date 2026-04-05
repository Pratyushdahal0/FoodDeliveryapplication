// ══════════════════════════
//  shop.js
//  Shop page interactions
// ══════════════════════════

let allProducts = []; // Store all products for filtering

document.addEventListener('DOMContentLoaded', async () => {
  await loadProducts();

  // ── FILTER BUTTONS ──
  const filterBtns = document.querySelectorAll('.filter-btn');
  const countEl = document.querySelector('.products-count');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', function () {
      filterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      const filter = this.textContent.trim().toLowerCase();
      filterProducts(filter);
    });
  });

  // ── ADD TO CART ──
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('add-to-cart')) {
      e.stopPropagation();
      handleAddToCart(e.target);
    }
  });

  // ── CONTACT US BUTTON ──
  const contactBtn = document.querySelector('.btn-contact');
  if (contactBtn) {
    contactBtn.addEventListener('click', () => {
      alert('📩 Opening contact form...');
    });
  }
});

// Load products from backend
async function loadProducts() {
  console.log('Starting to load products...');
  try {
    console.log('Calling getAllProducts...');
    allProducts = await getAllProducts();
    console.log('Products loaded:', allProducts);
    renderProducts(allProducts);
  } catch (error) {
    console.error('Error loading products:', error);
    document.querySelector('.products-count').textContent = 'Error loading products';
  }
}

// Render products to the grid
function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  const countEl = document.querySelector('.products-count');

  grid.innerHTML = ''; // Clear existing

  if (products.length === 0) {
    grid.innerHTML = '<p>No products found.</p>';
    countEl.textContent = 'No items';
    return;
  }

  products.forEach(product => {
    const card = createProductCard(product);
    grid.appendChild(card);
  });

  countEl.textContent = `Showing ${products.length} item${products.length !== 1 ? 's' : ''}`;

  // Re-attach wishlist event listeners
  attachWishlistListeners();
}

// Create a product card element
function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';

  const popularBadge = product.is_popular ? '<span class="popular-badge">Popular</span>' : '';

  card.innerHTML = `
    <div class="product-img">
      <img src="${product.image_url || 'https://via.placeholder.com/400x300'}" alt="${product.name}" />
      ${popularBadge}
      <button class="wishlist-btn">♡</button>
    </div>
    <div class="product-info">
      <div class="product-name">${product.name}</div>
      <div class="product-rating">
        <span class="star">★</span> ${product.rating || 0} <span>(${product.delivery_time || 'N/A'})</span>
      </div>
      <div class="product-footer">
        <span class="product-price">$${product.price}</span>
        <button class="add-to-cart">+</button>
      </div>
    </div>
  `;

  return card;
}

// Filter products based on category
function filterProducts(filter) {
  let filtered = [];

  if (filter === 'all items') {
    filtered = allProducts;
  } else if (filter === 'popular') {
    filtered = allProducts.filter(p => p.is_popular);
  } else {
    // For specific categories like Breakfast, Lunch, etc.
    filtered = allProducts.filter(p => p.category.toLowerCase() === filter);
  }

  renderProducts(filtered);
}

// Attach wishlist button listeners
function attachWishlistListeners() {
  document.querySelectorAll('.wishlist-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const isLiked = this.textContent === '♥';
      this.textContent = isLiked ? '♡' : '♥';
      this.classList.toggle('liked', !isLiked);
    });
  });
}

// Handle add to cart animation
function handleAddToCart(btn) {
  if (btn.classList.contains('adding')) return;

  btn.classList.add('adding');
  const original = btn.textContent;

  btn.textContent = '✓';
  btn.style.background = '#22c55e';
  btn.style.transform = 'scale(1.15)';

  setTimeout(() => {
    btn.textContent = original;
    btn.style.background = '';
    btn.style.transform = '';
    btn.classList.remove('adding');
  }, 1000);
}