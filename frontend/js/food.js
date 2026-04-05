// ══════════════════════════
//  food.js
//  Food page interactions
// ══════════════════════════

let allMenuItems = []; // Store all menu items for filtering

document.addEventListener('DOMContentLoaded', async () => {
  await loadMenuItems();

  // ── CATEGORY TABS ──
  const catTabs = document.querySelectorAll('.cat-tab');
  catTabs.forEach(tab => {
    tab.addEventListener('click', function () {
      catTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');

      const category = this.textContent.trim().toLowerCase();
      filterMenuItems(category, getCurrentDiet());
    });
  });

  // ── DIET FILTERS ──
  const dietPills = document.querySelectorAll('.diet-pill');
  dietPills.forEach(pill => {
    pill.addEventListener('click', function () {
      dietPills.forEach(p => p.classList.remove('active'));
      this.classList.add('active');

      const diet = this.getAttribute('onclick').match(/'(\w+)'/)[1];
      filterMenuItems(getCurrentCategory(), diet);
    });
  });

  // ── SEARCH ──
  const searchInput = document.getElementById('dishSearch');
  searchInput.addEventListener('input', function () {
    const query = this.value.toLowerCase();
    searchMenuItems(query);
  });
});

// Load menu items from backend
async function loadMenuItems() {
  console.log('Starting to load menu items...');
  try {
    console.log('Calling getAllProducts for menu...');
    allMenuItems = await getAllProducts();
    console.log('Menu items loaded:', allMenuItems);
    renderMenuItems(allMenuItems);
  } catch (error) {
    console.error('Error loading menu items:', error);
    document.getElementById('menuGrid').innerHTML = '<p>Error loading menu.</p>';
  }
}

// Render menu items to the grid
function renderMenuItems(items) {
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = ''; // Clear existing

  if (items.length === 0) {
    grid.innerHTML = '<p>No items found.</p>';
    return;
  }

  items.forEach(item => {
    const card = createMenuCard(item);
    grid.appendChild(card);
  });

  // Re-attach event listeners
  attachCardListeners();
}

// Create a menu card element
function createMenuCard(item) {
  const card = document.createElement('div');
  card.className = 'menu-card';

  // Map category to data-category
  const categoryMap = {
    'burger': 'lunch',
    'pizza': 'dinner',
    'sushi': 'dinner',
    'tacos': 'lunch',
    'pasta': 'dinner',
    'salad': 'lunch'
  };
  const dataCategory = categoryMap[item.category] || 'lunch';

  // Assume diet based on description (simple check)
  const isVeggie = !/(beef|chicken|salmon|tuna|bacon|fish)/i.test(item.description);
  const dataDiet = isVeggie ? 'veggie' : 'none';

  const popularBadge = item.is_popular ? '<span class="badge-popular">Popular</span>' : '';
  const dietBadge = dataDiet === 'veggie' ? '<span class="badge-diet veggie">Veggie</span>' : '';

  card.setAttribute('data-category', dataCategory);
  card.setAttribute('data-diet', dataDiet);

  card.innerHTML = `
    <div class="card-img">
      <img src="${item.image_url || 'https://via.placeholder.com/600x400'}" alt="${item.name}" />
      ${popularBadge}
      ${dietBadge}
      <button class="wishlist-btn" onclick="toggleWish(this)">♡</button>
    </div>
    <div class="card-body">
      <div class="card-name">${item.name}</div>
      <div class="card-desc">${item.description}</div>
      <div class="card-meta">
        <span><span class="meta-star">★</span> ${item.rating}</span>
        <span>
          <svg class="meta-icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          ${item.delivery_time}
        </span>
        <span>
          <svg class="meta-icon" viewBox="0 0 24 24">
            <path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z" />
          </svg>
          ${Math.floor(Math.random() * 500) + 200}
        </span>
      </div>
      <div class="card-footer">
        <span class="card-price">$${item.price}</span>
        <button class="btn-add" onclick="addToCart(this)">
          <svg viewBox="0 0 24 24">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          Add
        </button>
      </div>
    </div>
  `;

  return card;
}

// Filter menu items
function filterMenuItems(category, diet) {
  let filtered = allMenuItems;

  // Filter by category
  if (category !== 'all') {
    const categoryMap = {
      'breakfast': ['breakfast'], // No breakfast in data, so empty
      'lunch': ['burger', 'tacos', 'salad'],
      'dinner': ['pizza', 'sushi', 'pasta'],
      'desserts': [], // No desserts in data
      'beverages': [] // No beverages in data
    };
    const allowedCategories = categoryMap[category] || [];
    filtered = filtered.filter(item => allowedCategories.includes(item.category));
  }

  // Filter by diet
  if (diet !== 'all') {
    if (diet === 'veggie') {
      filtered = filtered.filter(item => !/(beef|chicken|salmon|tuna|bacon|fish)/i.test(item.description));
    } else if (diet === 'vegan') {
      // Assume no vegan items for simplicity
      filtered = [];
    }
  }

  renderMenuItems(filtered);
}

// Search menu items
function searchMenuItems(query) {
  if (!query) {
    renderMenuItems(allMenuItems);
    return;
  }

  const filtered = allMenuItems.filter(item =>
    item.name.toLowerCase().includes(query) ||
    item.description.toLowerCase().includes(query)
  );

  renderMenuItems(filtered);
}

// Get current category
function getCurrentCategory() {
  const activeTab = document.querySelector('.cat-tab.active');
  return activeTab ? activeTab.textContent.trim().toLowerCase() : 'all';
}

// Get current diet
function getCurrentDiet() {
  const activePill = document.querySelector('.diet-pill.active');
  if (!activePill) return 'all';
  const onclick = activePill.getAttribute('onclick');
  const match = onclick.match(/'(\w+)'/);
  return match ? match[1] : 'all';
}

// Attach event listeners to cards
function attachCardListeners() {
  // Wishlist buttons
  document.querySelectorAll('.wishlist-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleWish(this);
    });
  });

  // Add to cart buttons
  document.querySelectorAll('.btn-add').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      addToCart(this);
    });
  });
}

// Toggle wishlist (existing function)
function toggleWish(btn) {
  const isLiked = btn.textContent === '♥';
  btn.textContent = isLiked ? '♡' : '♥';
  btn.classList.toggle('liked', !isLiked);
}

// Add to cart (existing function)
function addToCart(btn) {
  if (btn.classList.contains('adding')) return;

  btn.classList.add('adding');
  const originalHTML = btn.innerHTML;

  btn.innerHTML = '✓ Added';
  btn.style.background = '#22c55e';
  btn.style.transform = 'scale(1.05)';

  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.style.background = '';
    btn.style.transform = '';
    btn.classList.remove('adding');
  }, 1000);
}

// Set category (existing function)
function setCategory(btn, category) {
  const tabs = document.querySelectorAll('.cat-tab');
  tabs.forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  filterMenuItems(category, getCurrentDiet());
}

// Set diet (existing function)
function setDiet(btn, diet) {
  const pills = document.querySelectorAll('.diet-pill');
  pills.forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  filterMenuItems(getCurrentCategory(), diet);
}