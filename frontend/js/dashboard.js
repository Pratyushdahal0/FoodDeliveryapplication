document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;
  const profile = await loadCurrentUser();
  renderUserProfile(profile);
  setupDashboardTabs();
  setupDashboardNavigation();
  renderRecentOrders();
  loadFavoriteItems();
});

async function loadCurrentUser() {
  let profile = getUserProfile();
  const email = getCurrentUserEmail();

  if (!profile && email) {
    profile = await fetchUserProfile(email);
    if (profile) {
      profile.points = Number(profile.points ?? 850);
      profile.orders = Number(profile.orders ?? 0);
      profile.saved = Number(profile.saved ?? 25);
      saveUserProfile(profile);
    }
  }

  if (!profile) {
    profile = {
      name: 'Guest',
      email: email || '',
      phone: '',
      address: '',
      role: 'customer',
      points: 850,
      orders: 0,
      saved: 25
    };
  }

  return profile;
}

function renderUserProfile(profile) {
  const initials = profile.name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase())
    .slice(0, 2)
    .join('') || 'ME';

  document.getElementById('welcomeAvatarText').textContent = initials;
  document.getElementById('welcomeName').textContent = profile.name;
  document.getElementById('welcomeEmail').textContent = profile.email;
  document.getElementById('ordersCount').textContent = profile.orders;
  document.getElementById('pointsCount').textContent = profile.points;
  document.getElementById('savingsAmount').textContent = `$${profile.saved}`;

  const nextThreshold = 1000;
  const progress = Math.min(100, Math.round((profile.points / nextThreshold) * 100));
  const pointsLeft = Math.max(0, nextThreshold - profile.points);

  document.getElementById('rewardsSubtitle').textContent =
    pointsLeft > 0
      ? `You're ${pointsLeft} points away from a free meal!`
      : 'You have enough points for a reward!';
  document.getElementById('rewardsProgressText').textContent =
    `${profile.points} / ${nextThreshold} points`;
  document.getElementById('rewardsProgressFill').style.width = `${progress}%`;
}

function renderRecentOrders() {
  const orders = getRecentOrders();
  const listElement = document.getElementById('recentOrdersList');
  const emptyMsg = document.getElementById('noRecentOrdersMsg');

  if (!listElement || !emptyMsg) return;

  if (orders.length === 0) {
    listElement.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  listElement.innerHTML = orders.map(createOrderCard).join('');

  document.querySelectorAll('.view-order-btn').forEach(button => {
    button.addEventListener('click', () => {
      window.location.href = 'track-order.html';
    });
  });
}

function getRecentOrders() {
  const lastOrder = JSON.parse(localStorage.getItem('lastOrder') || 'null');
  if (lastOrder) {
    return [
      {
        id: lastOrder.orderId || lastOrder.orderNumber || '0000',
        name: lastOrder.items?.[0]?.name || 'Recent Order',
        restaurant: lastOrder.restaurantName || 'FoodExpress',
        time: lastOrder.timestamp
          ? new Date(lastOrder.timestamp).toLocaleString()
          : 'Today',
        total: lastOrder.total || 0,
        status: lastOrder.status || 'Preparing'
      }
    ];
  }
  return [];
}

function createOrderCard(order) {
  return `
    <div class="order-item">
      <img
        class="order-img"
        src="https://images.unsplash.com/photo-1499028344343-cd173ffc68a9?w=120&q=80"
        alt="${order.name}"
      />
      <div class="order-info">
        <h4>${order.name}</h4>
        <p class="restaurant">${order.restaurant}</p>
        <p class="time">
          <i class="fa-regular fa-clock"></i> ${order.time}
        </p>
      </div>
      <div class="order-right">
        <span class="order-price">$${Number(order.total).toFixed(2)}</span>
        <button class="reorder-icon view-order-btn" aria-label="Track order">
          <i class="fa-solid fa-location-dot"></i>
        </button>
      </div>
    </div>
  `;
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
    const favorites = products.filter((product) =>
      favoriteIds.includes(String(product.id))
    );

    favoritesList.innerHTML = '';

    if (favorites.length === 0) {
      noFavoritesMsg.style.display = 'block';
      return;
    }

    noFavoritesMsg.style.display = 'none';
    favorites.forEach((product) => {
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

  card.querySelector('.remove-favorite').addEventListener('click', () => {
    const updated = getFavoriteIds().filter((id) => id !== String(product.id));
    saveFavoriteIds(updated);
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

function setupDashboardNavigation() {
  document.getElementById('viewRewardsBtn')?.addEventListener('click', () => {
    window.location.href = 'rewards.html';
  });

  document.getElementById('actionTrackOrder')?.addEventListener('click', () => {
    window.location.href = 'track-order.html';
  });

  document.getElementById('actionRedeemPoints')?.addEventListener('click', () => {
    window.location.href = 'redeem-points.html';
  });

  document.getElementById('actionEditProfile')?.addEventListener('click', () => {
    window.location.href = 'edit-profile.html';
  });

  document.getElementById('actionAddresses')?.addEventListener('click', () => {
    window.location.href = 'addresses.html';
  });

  document.getElementById('actionPaymentMethods')?.addEventListener('click', () => {
    window.location.href = 'payment-methods.html';
  });

  document.getElementById('actionNotifications')?.addEventListener('click', () => {
    window.location.href = 'notifications.html';
  });

  document.getElementById('actionSettings')?.addEventListener('click', () => {
    window.location.href = 'settings.html';
  });

  document.getElementById('actionLogout')?.addEventListener('click', () => {
    logout();
  });
}

