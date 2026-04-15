// ══════════════════════════
// food.js
// Food page interactions
// ══════════════════════════

const FAVORITES_KEY = 'foodDeliveryFavorites';
const DEFAULT_IMAGE = 'https://via.placeholder.com/600x400?text=Food';
const DEFAULT_RESTAURANT_ID = 101;
const DEFAULT_RESTAURANT_NAME = 'FoodExpress Kitchen';

let allMenuItems = [];
let currentCategory = 'all';
let currentDiet = 'all';
let currentSearch = '';

const staticMenuItems = [
  {
    id: 'b1',
    name: 'Fluffy Pancakes',
    description: 'Stack of 3 fluffy pancakes with maple syrup',
    price: 9.99,
    image_url:
      'https://images.unsplash.com/photo-1528207776546-365bb710ee93?w=600&h=400&fit=crop',
    rating: 4.8,
    delivery_time: '12 min',
    category: 'breakfast',
    diet: 'veggie',
    is_popular: true,
    restaurant_id: 201,
    restaurant_name: 'Sunrise Cafe',
  },
  {
    id: 'b2',
    name: 'Avocado Toast',
    description: 'Fresh avocado on artisan bread with egg',
    price: 10.99,
    image_url:
      'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=600&h=400&fit=crop',
    rating: 4.7,
    delivery_time: '8 min',
    category: 'breakfast',
    diet: 'veggie',
    is_popular: false,
    restaurant_id: 201,
    restaurant_name: 'Sunrise Cafe',
  },
  {
    id: 'b3',
    name: 'Breakfast Burrito',
    description: 'Eggs, cheese, beans, and salsa wrapped',
    price: 12.99,
    image_url:
      'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=600&h=400&fit=crop',
    rating: 4.6,
    delivery_time: '15 min',
    category: 'breakfast',
    diet: 'none',
    is_popular: false,
    restaurant_id: 202,
    restaurant_name: 'Morning Wraps',
  },
  {
    id: 'b4',
    name: 'French Toast',
    description: 'Brioche bread with berries and cream',
    price: 11.99,
    image_url:
      'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=600&h=400&fit=crop',
    rating: 4.9,
    delivery_time: '15 min',
    category: 'breakfast',
    diet: 'veggie',
    is_popular: false,
    restaurant_id: 201,
    restaurant_name: 'Sunrise Cafe',
  },
  {
    id: 'b5',
    name: 'Eggs Benedict',
    description: 'Poached eggs with hollandaise sauce',
    price: 13.99,
    image_url:
      'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=600&h=400&fit=crop',
    rating: 4.8,
    delivery_time: '20 min',
    category: 'breakfast',
    diet: 'none',
    is_popular: false,
    restaurant_id: 203,
    restaurant_name: 'Brunch House',
  },
  {
    id: 'b6',
    name: 'Acai Bowl',
    description: 'Superfood bowl with fresh fruits and granola',
    price: 12.99,
    image_url:
      'https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?w=600&h=400&fit=crop',
    rating: 4.7,
    delivery_time: '8 min',
    category: 'breakfast',
    diet: 'vegan',
    is_popular: false,
    restaurant_id: 204,
    restaurant_name: 'Green Spoon',
  },
  {
    id: 'l1',
    name: 'Classic Burger',
    description: 'Juicy beef patty with lettuce and tomato',
    price: 14.99,
    image_url:
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=400&fit=crop',
    rating: 4.9,
    delivery_time: '20 min',
    category: 'lunch',
    diet: 'none',
    is_popular: true,
    restaurant_id: 205,
    restaurant_name: 'Burger Barn',
  },
  {
    id: 'l2',
    name: 'Caesar Salad',
    description: 'Crispy romaine with parmesan and croutons',
    price: 11.99,
    image_url:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=400&fit=crop',
    rating: 4.5,
    delivery_time: '10 min',
    category: 'lunch',
    diet: 'veggie',
    is_popular: false,
    restaurant_id: 204,
    restaurant_name: 'Green Spoon',
  },
  {
    id: 'l3',
    name: 'Pasta Carbonara',
    description: 'Creamy pasta with pancetta and egg yolk',
    price: 17.99,
    image_url:
      'https://images.unsplash.com/photo-1621996346565-e3dbc353d2e5?w=600&h=400&fit=crop',
    rating: 4.9,
    delivery_time: '25 min',
    category: 'lunch',
    diet: 'none',
    is_popular: false,
    restaurant_id: 206,
    restaurant_name: 'Pasta Point',
  },
  {
    id: 'd1',
    name: 'Margherita Pizza',
    description: 'Classic tomato base with fresh mozzarella',
    price: 13.99,
    image_url:
      'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=400&fit=crop',
    rating: 4.8,
    delivery_time: '30 min',
    category: 'dinner',
    diet: 'none',
    is_popular: true,
    restaurant_id: 207,
    restaurant_name: 'Pizza Corner',
  },
  {
    id: 'd2',
    name: 'Sushi Rolls',
    description: 'Fresh salmon and tuna with seasoned rice',
    price: 16.99,
    image_url:
      'https://images.unsplash.com/photo-1617196034183-421b4040ed20?w=600&h=400&fit=crop',
    rating: 4.9,
    delivery_time: '20 min',
    category: 'dinner',
    diet: 'none',
    is_popular: false,
    restaurant_id: 208,
    restaurant_name: 'Tokyo Bites',
  },
  {
    id: 'd3',
    name: 'Buddha Bowl',
    description: 'Quinoa, roasted veggies and tahini dressing',
    price: 14.99,
    image_url:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=400&fit=crop',
    rating: 4.6,
    delivery_time: '18 min',
    category: 'dinner',
    diet: 'vegan',
    is_popular: false,
    restaurant_id: 204,
    restaurant_name: 'Green Spoon',
  },
  {
    id: 'ds1',
    name: 'Chocolate Lava Cake',
    description: 'Warm chocolate cake with molten center',
    price: 7.99,
    image_url:
      'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&h=400&fit=crop',
    rating: 4.8,
    delivery_time: '12 min',
    category: 'desserts',
    diet: 'veggie',
    is_popular: true,
    restaurant_id: 209,
    restaurant_name: 'Sweet Crumbs',
  },
  {
    id: 'ds2',
    name: 'Fruit Parfait',
    description: 'Fresh fruit layered with yogurt and granola',
    price: 6.99,
    image_url:
      'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600&h=400&fit=crop',
    rating: 4.5,
    delivery_time: '9 min',
    category: 'desserts',
    diet: 'veggie',
    is_popular: false,
    restaurant_id: 209,
    restaurant_name: 'Sweet Crumbs',
  },
  {
    id: 'bv1',
    name: 'Iced Coffee',
    description: 'Cold brewed coffee served over ice',
    price: 4.99,
    image_url:
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&h=400&fit=crop',
    rating: 4.7,
    delivery_time: '5 min',
    category: 'beverages',
    diet: 'vegan',
    is_popular: false,
    restaurant_id: 201,
    restaurant_name: 'Sunrise Cafe',
  },
  {
    id: 'bv2',
    name: 'Fresh Orange Juice',
    description: 'Freshly squeezed orange juice',
    price: 5.49,
    image_url:
      'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&h=400&fit=crop',
    rating: 4.6,
    delivery_time: '6 min',
    category: 'beverages',
    diet: 'vegan',
    is_popular: false,
    restaurant_id: 204,
    restaurant_name: 'Green Spoon',
  },
];

function normalizeMenuItem(item, index = 0) {
  const normalizedCategory = normalizeCategory(item.category, item.name);
  const normalizedDiet = normalizeDiet(item);
  const id = String(item.id ?? `menu-${index + 1}`);

  return {
    id,
    name: item.name || 'Untitled Item',
    description: item.description || 'Freshly prepared dish',
    price: Number(item.price ?? 0),
    image_url: item.image_url || item.image || DEFAULT_IMAGE,
    rating: Number(item.rating ?? 4.6).toFixed(1),
    delivery_time: item.delivery_time || item.deliveryTime || '20 min',
    category: normalizedCategory,
    diet: normalizedDiet,
    is_popular: Boolean(item.is_popular ?? item.isPopular),
    restaurant_id: String(
      item.restaurant_id ??
        item.restaurantId ??
        item.owner_restaurant_id ??
        DEFAULT_RESTAURANT_ID
    ),
    restaurant_name:
      item.restaurant_name ||
      item.restaurantName ||
      item.shop_name ||
      DEFAULT_RESTAURANT_NAME,
    distance: item.distance || `${Math.floor(Math.random() * 500) + 200}`,
  };
}

function normalizeCategory(category, name = '') {
  const raw = String(category || '').trim().toLowerCase();

  if (
    ['breakfast', 'lunch', 'dinner', 'desserts', 'beverages'].includes(raw)
  ) {
    return raw;
  }

  const byKeyword = `${raw} ${String(name).toLowerCase()}`;

  if (
    /pancake|toast|breakfast|benedict|acai|omelette|burrito/.test(byKeyword)
  ) {
    return 'breakfast';
  }
  if (/burger|salad|sandwich|wrap|taco|lunch|pasta/.test(byKeyword)) {
    return 'lunch';
  }
  if (/pizza|sushi|steak|bowl|dinner/.test(byKeyword)) {
    return 'dinner';
  }
  if (/cake|dessert|cookie|ice cream|parfait|sweet/.test(byKeyword)) {
    return 'desserts';
  }
  if (/coffee|juice|tea|smoothie|drink|beverage/.test(byKeyword)) {
    return 'beverages';
  }

  return 'lunch';
}

function normalizeDiet(item) {
  if (item.diet) {
    const diet = String(item.diet).toLowerCase();
    if (['veggie', 'vegan', 'none'].includes(diet)) return diet;
  }

  const text = `${item.name || ''} ${item.description || ''}`.toLowerCase();

  if (/vegan/.test(text)) return 'vegan';
  if (!/(beef|chicken|salmon|tuna|bacon|fish|pork|ham|meat)/i.test(text)) {
    return 'veggie';
  }
  return 'none';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getFavoriteIds() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFavoriteIds(ids) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids.map(String)));
}

function isFavorite(productId) {
  return getFavoriteIds().includes(String(productId));
}

function toggleFavorite(productId) {
  const id = String(productId);
  const ids = getFavoriteIds();
  const index = ids.indexOf(id);

  if (index === -1) {
    ids.push(id);
  } else {
    ids.splice(index, 1);
  }

  saveFavoriteIds(ids);
  return index === -1;
}

function getFilteredItems() {
  return allMenuItems.filter((item) => {
    const matchesCategory =
      currentCategory === 'all' || item.category === currentCategory;

    const matchesDiet =
      currentDiet === 'all' ||
      (currentDiet === 'veggie' && item.diet === 'veggie') ||
      (currentDiet === 'vegan' && item.diet === 'vegan');

    const query = currentSearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.restaurant_name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query);

    return matchesCategory && matchesDiet && matchesSearch;
  });
}

function renderMenuItems(items) {
  const grid = document.getElementById('menuGrid');
  if (!grid) return;

  if (!items.length) {
    grid.innerHTML = `
      <div class="empty-menu-state">
        <h3>No items found</h3>
        <p>Try changing the category, diet filter, or search term.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = items
    .map((item) => {
      const favorite = isFavorite(item.id);
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
              aria-label="Toggle favourite"
            >${favorite ? '♥' : '♡'}</button>
          </div>
          <div class="card-body">
            <div class="card-name">${escapeHtml(item.name)}</div>
            <div class="card-desc">${escapeHtml(item.description)}</div>
            <div class="card-restaurant">from ${escapeHtml(
              item.restaurant_name
            )}</div>
            <div class="card-meta">
              <span><span class="meta-star">★</span> ${escapeHtml(
                item.rating
              )}</span>
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
  setActiveButton('.cat-tab', (element) => element.dataset.category === category);
  rerenderMenu();
}

function setDiet(_btn, diet) {
  currentDiet = diet;
  setActiveButton('.diet-pill', (element) => element.dataset.diet === diet);
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
    if (typeof window.getAllProducts === 'function') {
      products = await window.getAllProducts();
    }
  } catch (error) {
    console.error('Error loading backend menu items:', error);
  }

  if (!Array.isArray(products) || !products.length) {
    products = staticMenuItems;
  }

  allMenuItems = products.map(normalizeMenuItem);
  rerenderMenu();
}

function handleMenuGridClick(event) {
  const favoriteButton = event.target.closest('[data-action="favorite"]');
  if (favoriteButton) {
    const productId = favoriteButton.dataset.productId;
    const active = toggleFavorite(productId);
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
  const input = document.getElementById('dishSearch');
  if (!input) return;

  input.addEventListener('input', (event) => {
    currentSearch = event.target.value || '';
    rerenderMenu();
  });
}

function setupFilters() {
  document.querySelectorAll('.cat-tab').forEach((button) => {
    button.addEventListener('click', () => {
      setCategory(button, button.dataset.category || 'all');
    });
  });

  document.querySelectorAll('.diet-pill').forEach((button) => {
    button.addEventListener('click', () => {
      setDiet(button, button.dataset.diet || 'all');
    });
  });
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
  setupFilters();

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

window.setCategory = setCategory;
window.setDiet = setDiet;
window.logout = logout;

document.addEventListener('DOMContentLoaded', setupPage);