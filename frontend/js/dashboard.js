const FAVORITES_KEY = 'foodDeliveryFavorites';

document.addEventListener('DOMContentLoaded', () => {
  setupDashboardTabs();
  loadFavoriteItems();
});

function getFavoriteIds() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFavoriteIds(ids) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

function removeFavorite(productId) {
  const ids = getFavoriteIds().filter(id => id !== String(productId));
  saveFavoriteIds(ids);
}

async function loadFavoriteItems() {
  const favoriteIds = getFavoriteIds();
  const favoritesList = document.getElementById('favoritesList');
  const noFavoritesMsg = document.getElementById('noFavoritesMsg');

  if (!favoritesList || !noFavoritesMsg) return;

  if (favoriteIds.length === 0) {
    favoritesList.innerHTML = '';
    noFavoritesMsg.style.display = 'block';
    return;
  }

  try {
    const products = await getAllProducts();
    const favorites = products.filter(product => favoriteIds.includes(String(product.id)));

    favoritesList.innerHTML = '';

    if (favorites.length === 0) {
      noFavoritesMsg.style.display = 'block';
      return;
    }

    noFavoritesMsg.style.display = 'none';
    favorites.forEach(product => {
      favoritesList.appendChild(createFavoriteCard(product));
    });
  } catch (error) {
    console.error('Unable to load favorites:', error);
    favoritesList.innerHTML = '<p class="empty-msg">Unable to load favorites at this time.</p>';
    noFavoritesMsg.style.display = 'none';
  }
}

function createFavoriteCard(product) {
  const card = document.createElement('div');
  card.className = 'order-item';

  card.innerHTML = `
    <img class="order-img" src="${product.image_url || 'https://via.placeholder.com/120x120'}" alt="${product.name}" />
    <div class="order-info">
      <h4>${product.name}</h4>
      <p class="restaurant">${product.description || ''}</p>
      <p class="time">
        <i class="fa-regular fa-clock"></i> Favorite
      </p>
    </div>
    <div class="order-right">
      <span class="order-price">$${product.price}</span>
      <button class="reorder-icon remove-favorite" aria-label="Remove favorite">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `;

  const removeBtn = card.querySelector('.remove-favorite');
  removeBtn.addEventListener('click', () => {
    removeFavorite(product.id);
    loadFavoriteItems();
  });

  return card;
}

function setupDashboardTabs() {
  const recentTab = document.getElementById('recentTab');
  const favoriteTab = document.getElementById('favoriteTab');
  const ordersContent = document.getElementById('ordersContent');
  const favoritesContent = document.getElementById('favoritesContent');

  if (!recentTab || !favoriteTab || !ordersContent || !favoritesContent) return;

  recentTab.addEventListener('click', () => {
    recentTab.classList.add('active');
    favoriteTab.classList.remove('active');
    ordersContent.style.display = 'block';
    favoritesContent.style.display = 'none';
  });

  favoriteTab.addEventListener('click', () => {
    favoriteTab.classList.add('active');
    recentTab.classList.remove('active');
    ordersContent.style.display = 'none';
    favoritesContent.style.display = 'block';
    loadFavoriteItems();
  });
}
