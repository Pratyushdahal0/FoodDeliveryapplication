console.log("NEW FOOD JS LOADED - FILTERS AND SORTING VERSION");

const FOOD_FAVORITES_KEY = 'foodDeliveryFavorites';
const DEFAULT_IMAGE =
  'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80';

let allMenuItems = [];
let currentCategory = 'all';
let currentDiet = 'all';
let currentSearch = '';
let currentPriceFilter = 'all';
let currentRatingFilter = 'all';
let currentSort = 'recommended';
let currentPopularOnly = false;

function normalizeMenuItem(item, index = 0) {
  return {
    id: String(item.id ?? `menu-${index + 1}`),
    name: item.name || 'Untitled Item',
    description: item.description || 'Freshly prepared dish',
    price: Number(item.price ?? 0),
    image_url: item.image_url || DEFAULT_IMAGE,
    rating: Number(item.rating ?? 4.5),
    delivery_time: item.delivery_time || '30 min',
    category: String(item.category || '').trim().toLowerCase(),
    originalCategory: String(item.category || '').trim().toLowerCase(),
    diet: normalizeDiet(item),
    is_popular: Number(item.is_popular) === 1 || item.is_popular === true,
    restaurant_id: String(item.restaurant_id ?? ''),
    restaurant_name:
      item.restaurant_name ||
      item.restaurant ||
      item.restaurant_title ||
      'Unknown Restaurant',
    distance: item.distance || `${Math.floor(Math.random() * 500) + 200}`,
  };
}

function normalizeDiet(item) {
  const explicitDiet = String(item.diet || '').toLowerCase();
  if (['veggie', 'vegan', 'none'].includes(explicitDiet)) {
    return explicitDiet;
  }

  const text = `${item.name || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase();

  if (/vegan/.test(text)) return 'vegan';

  if (
    !/(beef|chicken|salmon|tuna|bacon|fish|pork|ham|meat|burger|tikka|sushi)/i.test(
      text
    )
  ) {
    return 'veggie';
  }

  return 'none';
}

function getDeliveryMinutes(deliveryTime) {
  const match = String(deliveryTime || '').match(/\d+/);
  return match ? Number(match[0]) : 999;
}

function foodGetFavoriteIds() {
  try {
    return JSON.parse(localStorage.getItem(FOOD_FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
}

function foodSaveFavoriteIds(ids) {
  localStorage.setItem(FOOD_FAVORITES_KEY, JSON.stringify(ids.map(String)));
}

function foodIsFavorite(productId) {
  return foodGetFavoriteIds().includes(String(productId));
}

function foodToggleFavorite(productId) {
  const id = String(productId);
  const ids = foodGetFavoriteIds();
  const index = ids.indexOf(id);

  if (index === -1) {
    ids.push(id);
    foodSaveFavoriteIds(ids);
    return true;
  }

  ids.splice(index, 1);
  foodSaveFavoriteIds(ids);
  return false;
}

function matchesPrice(price) {
  if (currentPriceFilter === 'all') return true;
  if (currentPriceFilter === 'under10') return price < 10;
  if (currentPriceFilter === '10to20') return price >= 10 && price <= 20;
  if (currentPriceFilter === '20to50') return price > 20 && price <= 50;
  if (currentPriceFilter === 'above50') return price > 50;
  return true;
}

function matchesRating(rating) {
  if (currentRatingFilter === 'all') return true;
  return rating >= Number(currentRatingFilter);
}

function getFilteredItems() {
  const filtered = allMenuItems.filter((item) => {
    const matchesCategory =
      currentCategory === 'all' ||
      String(item.originalCategory || '').toLowerCase() === currentCategory;

    const matchesDiet =
      currentDiet === 'all' ||
      (currentDiet === 'veggie' && item.diet === 'veggie') ||
      (currentDiet === 'vegan' && item.diet === 'vegan');

    const matchesPopular = !currentPopularOnly || item.is_popular === true;
    const matchesPriceRange = matchesPrice(Number(item.price || 0));
    const matchesMinRating = matchesRating(Number(item.rating || 0));

    const query = currentSearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.restaurant_name.toLowerCase().includes(query) ||
      String(item.originalCategory || '').toLowerCase().includes(query);

    return (
      matchesCategory &&
      matchesDiet &&
      matchesPopular &&
      matchesPriceRange &&
      matchesMinRating &&
      matchesSearch
    );
  });

  return sortItems(filtered);
}

function sortItems(items) {
  const sorted = [...items];

  if (currentSort === 'priceLow') {
    sorted.sort((a, b) => a.price - b.price);
  } else if (currentSort === 'priceHigh') {
    sorted.sort((a, b) => b.price - a.price);
  } else if (currentSort === 'ratingHigh') {
    sorted.sort((a, b) => b.rating - a.rating);
  } else if (currentSort === 'fastest') {
    sorted.sort(
      (a, b) => getDeliveryMinutes(a.delivery_time) - getDeliveryMinutes(b.delivery_time)
    );
  } else if (currentSort === 'popular') {
    sorted.sort((a, b) => Number(b.is_popular) - Number(a.is_popular));
  } else {
    sorted.sort((a, b) => {
      if (Number(b.is_popular) !== Number(a.is_popular)) {
        return Number(b.is_popular) - Number(a.is_popular);
      }
      return b.rating - a.rating;
    });
  }

  return sorted;
}

function updateResultsSummary(items) {
  const summary = document.getElementById('resultsSummary');
  if (!summary) return;

  const parts = [];
  if (currentCategory !== 'all') parts.push(currentCategory);
  if (currentDiet !== 'all') parts.push(currentDiet === 'veggie' ? 'vegetarian' : currentDiet);
  if (currentPopularOnly) parts.push('popular');
  if (currentPriceFilter !== 'all') parts.push('price filtered');
  if (currentRatingFilter !== 'all') parts.push(`${currentRatingFilter}+ rated`);

  const label = parts.length ? `Filtered by ${parts.join(', ')}` : 'Showing all items';
  summary.textContent = `${label} • ${items.length} item${items.length !== 1 ? 's' : ''}`;
}

function renderMenuItems(items) {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;

  updateResultsSummary(items);

  if (!items.length) {
    grid.innerHTML = `
      <div class="empty-menu-state">
        <h3>No items found</h3>
        <p>Try changing the category, filters, or search term.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items
    .map((item) => {
      const favorite = foodIsFavorite(item.id);

      return `
        <div class="menu-card" data-product-id="${escapeHtml(item.id)}">
          <div class="card-img">
            <img
              src="${escapeHtml(item.image_url)}"
              alt="${escapeHtml(item.name)}"
              onerror="this.src='${DEFAULT_IMAGE}'"
            />
            ${item.is_popular ? '<span class="badge-popular">Popular</span>' : ''}
            ${
              item.diet === 'veggie'
                ? '<span class="badge-diet veggie">Veggie</span>'
                : item.diet === 'vegan'
                ? '<span class="badge-diet vegan">Vegan</span>'
                : ''
            }
            <button
              class="wishlist-btn ${favorite ? 'liked' : ''}"
              type="button"
              data-action="favorite"
              data-product-id="${escapeHtml(item.id)}"
            >${favorite ? '♥' : '♡'}</button>
          </div>

          <div class="card-body">
            <div class="card-name">${escapeHtml(item.name)}</div>
            <div class="card-desc">${escapeHtml(item.description)}</div>
            <div class="card-restaurant">from ${escapeHtml(item.restaurant_name)}</div>

            <div class="card-meta">
              <span><span class="meta-star">★</span> ${escapeHtml(item.rating.toFixed(1))}</span>
              <span>
                <svg class="meta-icon" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${escapeHtml(item.delivery_time)}
              </span>
              <span>
                <svg class="meta-icon" viewBox="0 0 24 24">
                  <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"></path>
                </svg>
                ${escapeHtml(item.distance)}
              </span>
            </div>

            <div class="card-footer">
              <span class="card-price">$${Number(item.price).toFixed(2)}</span>
              <button
                class="btn-add"
                type="button"
                data-action="add-to-cart"
                data-product-id="${escapeHtml(item.id)}"
              >
                <svg viewBox="0 0 24 24">
                  <circle cx="9" cy="21" r="1"></circle>
                  <circle cx="20" cy="21" r="1"></circle>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                </svg>
                Add
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

function rerenderMenu() {
  renderMenuItems(getFilteredItems());
}

function setActiveButton(selector, predicate) {
  document.querySelectorAll(selector).forEach((element) => {
    element.classList.toggle('active', predicate(element));
  });
}

function setCategory(_btn, category) {
  currentCategory = category;
  setActiveButton('.cat-tab', (element) => {
    return element.textContent.trim().toLowerCase() === category ||
      (category === 'all' && element.textContent.trim().toLowerCase() === 'all');
  });
  rerenderMenu();
}

function setDiet(_btn, diet) {
  currentDiet = diet;
  setActiveButton('.diet-pill', (element) => {
    const value = element.getAttribute('data-diet-pill');
    return value === diet;
  });
  rerenderMenu();
}

function addToCartById(productId, button) {
  const item = allMenuItems.find((entry) => String(entry.id) === String(productId));

  if (!item) {
    console.warn('Item not found for cart:', productId);
    return;
  }

  if (typeof window.addItemToCart !== 'function') {
    console.warn('addItemToCart not available');
    return;
  }

  window.addItemToCart({
    id: item.id,
    name: item.name,
    price: item.price,
    image_url: item.image_url,
    quantity: 1,
    restaurant_id: item.restaurant_id,
    restaurant_name: item.restaurant_name,
  });

  if (button) {
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '✓ Added';
    button.style.background = '#22c55e';

    window.setTimeout(() => {
      button.disabled = false;
      button.innerHTML = originalHTML;
      button.style.background = '';
    }, 900);
  }
}

async function loadMenuItems() {
  let products = [];

  try {
    console.log('Starting to load menu items...');
    if (typeof window.getAllProducts === 'function') {
      console.log('Calling getAllProducts for menu...');
      products = await window.getAllProducts();
      console.log('Menu items loaded:', products);
    }
  } catch (error) {
    console.error('Error loading backend menu items:', error);
  }

  if (!Array.isArray(products)) {
    products = [];
  }

  allMenuItems = products.map(normalizeMenuItem);
  rerenderMenu();
}

function handleMenuGridClick(event) {
  const favoriteButton = event.target.closest('[data-action="favorite"]');
  if (favoriteButton) {
    const productId = favoriteButton.dataset.productId;
    const active = foodToggleFavorite(productId);
    favoriteButton.textContent = active ? '♥' : '♡';
    favoriteButton.classList.toggle('liked', active);
    return;
  }

  const addButton = event.target.closest('[data-action="add-to-cart"]');
  if (addButton) {
    addToCartById(addButton.dataset.productId, addButton);
  }
}

function setupSearch() {
  const heroSearch = document.getElementById('dishSearch');
  const navSearch = document.getElementById('navbarSearch');

  function handleSearch(value) {
    currentSearch = value || '';
    rerenderMenu();
  }

  if (heroSearch) {
    heroSearch.addEventListener('input', (e) => {
      handleSearch(e.target.value);
      if (navSearch) navSearch.value = e.target.value;
    });
  }

  if (navSearch) {
    navSearch.addEventListener('input', (e) => {
      handleSearch(e.target.value);
      if (heroSearch) heroSearch.value = e.target.value;
    });
  }
}

function setupFilterControls() {
  const priceFilter = document.getElementById('priceFilter');
  const ratingFilter = document.getElementById('ratingFilter');
  const sortFilter = document.getElementById('sortFilter');
  const popularOnly = document.getElementById('popularOnly');

  if (priceFilter) {
    priceFilter.addEventListener('change', (e) => {
      currentPriceFilter = e.target.value;
      rerenderMenu();
    });
  }

  if (ratingFilter) {
    ratingFilter.addEventListener('change', (e) => {
      currentRatingFilter = e.target.value;
      rerenderMenu();
    });
  }

  if (sortFilter) {
    sortFilter.addEventListener('change', (e) => {
      currentSort = e.target.value;
      rerenderMenu();
    });
  }

  if (popularOnly) {
    popularOnly.addEventListener('change', (e) => {
      currentPopularOnly = e.target.checked;
      rerenderMenu();
    });
  }
}

function setupPage() {
  const isLoggedIn =
    localStorage.getItem('isLoggedIn') === 'true' ||
    localStorage.getItem('isLoggedIn') === '1';

  if (!isLoggedIn) {
    alert('Please login first');
    window.location.href = 'login.html';
    return;
  }

  setupSearch();
  setupFilterControls();

  const grid = document.getElementById('menuGrid');
  if (grid) {
    grid.addEventListener('click', handleMenuGridClick);
  }

  if (typeof window.initializeCartCount === 'function') {
    window.initializeCartCount();
  }

  loadMenuItems();
}

function logout() {
  localStorage.removeItem('isLoggedIn');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('foodDeliveryCartCount');
  localStorage.removeItem('foodDeliveryCartItems');
  localStorage.removeItem('checkoutItems');
  localStorage.removeItem('checkoutTotal');
  localStorage.removeItem('checkoutSubtotal');
  localStorage.removeItem('checkoutTax');
  localStorage.removeItem('lastOrder');
  window.location.href = 'landingpage.html';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

window.setCategory = setCategory;
window.setDiet = setDiet;
window.logout = logout;

document.addEventListener('DOMContentLoaded', setupPage);