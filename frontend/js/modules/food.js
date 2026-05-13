// ══════════════════════════
// food.js
// Restaurant menu aware version
// Shows selected restaurant menu only when restaurant_id is in URL/localStorage
// ══════════════════════════

console.log("FOOD JS LOADED - RESTAURANT MENU FILTER VERSION");

const FOOD_FAVORITES_KEY = "foodDeliveryFavorites";
const SELECTED_RESTAURANT_KEY = "foodExpressSelectedRestaurant";
const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80";

let allMenuItems = [];
let currentCategory = "all";
let currentDiet = "all";
let currentSearch = "";
let currentPriceFilter = "all";
let currentRatingFilter = "all";
let currentSort = "recommended";
let currentPopularOnly = false;
let selectedRestaurant = getSelectedRestaurantFromContext();

function getSelectedRestaurantFromContext() {
  const params = new URLSearchParams(window.location.search);

  const urlRestaurantId =
    params.get("restaurant_id") || params.get("restaurantId") || params.get("id");

  const urlRestaurantName =
    params.get("restaurant") || params.get("restaurant_name") || params.get("name");

  let storedRestaurant = null;

  try {
    storedRestaurant = JSON.parse(
      localStorage.getItem(SELECTED_RESTAURANT_KEY) || "null"
    );
  } catch {
    storedRestaurant = null;
  }

  const storedRestaurantId =
    localStorage.getItem("selectedRestaurantId") ||
    storedRestaurant?.restaurant_id ||
    storedRestaurant?.restaurantId ||
    storedRestaurant?.id;

  const storedRestaurantName =
    localStorage.getItem("selectedRestaurantName") ||
    storedRestaurant?.restaurant_name ||
    storedRestaurant?.restaurantName ||
    storedRestaurant?.name;

  const restaurantId = urlRestaurantId || storedRestaurantId || "";
  const restaurantName = urlRestaurantName || storedRestaurantName || "";

  if (!restaurantId) {
    return {
      id: "",
      name: "",
      hasRestaurantFilter: false,
    };
  }

  const selected = {
    id: String(restaurantId),
    restaurant_id: String(restaurantId),
    name: restaurantName || "Restaurant",
    restaurant_name: restaurantName || "Restaurant",
    hasRestaurantFilter: true,
  };

  localStorage.setItem("selectedRestaurantId", selected.id);
  localStorage.setItem("selectedRestaurantName", selected.name);
  localStorage.setItem(SELECTED_RESTAURANT_KEY, JSON.stringify(selected));

  return selected;
}

function parseRatingValue(value) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }

  const text = String(value ?? "").trim();
  const match = text.match(/(\d+(\.\d+)?)/);

  if (match) {
    const parsed = Number(match[1]);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return 0;
}

function normalizeMenuItem(item, index = 0) {
  const rawCategory = String(item.category || "").trim().toLowerCase();

  let normalizedCategory = rawCategory;
  if (rawCategory.includes("fast")) normalizedCategory = "fast food";
  else if (rawCategory.includes("pizza")) normalizedCategory = "pizza";
  else if (rawCategory.includes("sushi")) normalizedCategory = "sushi";
  else if (rawCategory.includes("salad")) normalizedCategory = "salad";
  else if (rawCategory.includes("indian")) normalizedCategory = "indian";
  else if (rawCategory.includes("nepali")) normalizedCategory = "nepali";

  const parsedRating = parseRatingValue(item.rating);

  return {
    id: String(item.id ?? `menu-${index + 1}`),
    name: item.name || "Untitled Item",
    description: item.description || "Freshly prepared dish",
    price: Number(item.price ?? 0),
    image_url: item.image_url || DEFAULT_IMAGE,
    rating: parsedRating,
    delivery_time: item.delivery_time || "30 min",
    category: normalizedCategory,
    originalCategory: rawCategory,
    diet: normalizeDiet(item),
    is_popular:
      Number(item.is_popular) === 1 ||
      item.is_popular === true ||
      String(item.badge || "").toLowerCase().includes("popular"),
    restaurant_id: String(item.restaurant_id ?? item.restaurantId ?? ""),
    restaurant_name:
      item.restaurant_name ||
      item.restaurantName ||
      item.restaurant ||
      item.restaurant_title ||
      "Unknown Restaurant",
    distance: item.distance || `${Math.floor(Math.random() * 500) + 200}m`,
  };
}

function normalizeDiet(item) {
  const explicitDiet = String(item.diet || "").toLowerCase();

  if (["veggie", "vegan", "none"].includes(explicitDiet)) {
    return explicitDiet;
  }

  const text = `${item.name || ""} ${item.description || ""} ${
    item.category || ""
  }`.toLowerCase();

  if (/vegan/.test(text)) return "vegan";

  if (
    !/(beef|chicken|salmon|tuna|bacon|fish|pork|ham|meat|burger|tikka|sushi)/i.test(
      text
    )
  ) {
    return "veggie";
  }

  return "none";
}

function formatNpr(amount) {
  const value = Number(amount || 0);

  return `Rs. ${value.toLocaleString("en-NP", {
    maximumFractionDigits: 0,
  })}`;
}

function getDeliveryMinutes(deliveryTime) {
  const match = String(deliveryTime || "").match(/\d+/);
  return match ? Number(match[0]) : 999;
}

function foodGetFavoriteIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(FOOD_FAVORITES_KEY) || "[]");
    return Array.isArray(stored) ? stored.map(String) : [];
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

function matchesSelectedRestaurant(item) {
  if (!selectedRestaurant.hasRestaurantFilter) return true;

  return (
    String(item.restaurant_id || "") === String(selectedRestaurant.id || "")
  );
}

function matchesPrice(price) {
  if (currentPriceFilter === "all") return true;

  if (currentPriceFilter === "under10") return price < 1000;
  if (currentPriceFilter === "10to20") return price >= 1000 && price <= 2000;
  if (currentPriceFilter === "20to50") return price > 2000 && price <= 5000;
  if (currentPriceFilter === "above50") return price > 5000;

  return true;
}

function matchesRating(rating) {
  const current = parseRatingValue(rating);

  if (currentRatingFilter === "all") return true;
  if (current === 0) return false;

  return current >= Number(currentRatingFilter);
}

function getFilteredItems() {
  const filtered = allMenuItems.filter((item) => {
    const matchesRestaurant = matchesSelectedRestaurant(item);

    const matchesCategory =
      currentCategory === "all" ||
      String(item.category || "").toLowerCase() === currentCategory ||
      String(item.originalCategory || "").toLowerCase().includes(currentCategory);

    const matchesDiet =
      currentDiet === "all" ||
      (currentDiet === "veggie" && item.diet === "veggie") ||
      (currentDiet === "vegan" && item.diet === "vegan");

    const matchesPopular = !currentPopularOnly || item.is_popular === true;
    const matchesPriceRange = matchesPrice(Number(item.price || 0));
    const matchesMinRating = matchesRating(item.rating);

    const query = currentSearch.trim().toLowerCase();

    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      item.restaurant_name.toLowerCase().includes(query) ||
      String(item.originalCategory || "").toLowerCase().includes(query);

    return (
      matchesRestaurant &&
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

  if (currentSort === "priceLow") {
    sorted.sort((a, b) => a.price - b.price);
  } else if (currentSort === "priceHigh") {
    sorted.sort((a, b) => b.price - a.price);
  } else if (currentSort === "ratingHigh") {
    sorted.sort((a, b) => b.rating - a.rating);
  } else if (currentSort === "fastest") {
    sorted.sort(
      (a, b) =>
        getDeliveryMinutes(a.delivery_time) - getDeliveryMinutes(b.delivery_time)
    );
  } else if (currentSort === "popular") {
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

function updateRestaurantHero() {
  const heroTitle = document.querySelector(".food-hero h1");
  const heroText = document.querySelector(".food-hero p");

  if (!selectedRestaurant.hasRestaurantFilter) {
    if (heroTitle) heroTitle.innerHTML = `Our <span>Menu</span>`;
    if (heroText) {
      heroText.textContent =
        "Explore our delicious selection of freshly prepared dishes";
    }
    return;
  }

  if (heroTitle) {
    heroTitle.innerHTML = `${escapeHtml(selectedRestaurant.name)} <span>Menu</span>`;
  }

  if (heroText) {
    heroText.textContent =
      "Browse dishes available from this restaurant and add your favourites to cart.";
  }
}

function updateResultsSummary(items) {
  const summary = document.getElementById("resultsSummary");
  if (!summary) return;

  const parts = [];

  if (selectedRestaurant.hasRestaurantFilter) {
    parts.push(selectedRestaurant.name);
  }

  if (currentCategory !== "all") parts.push(currentCategory);
  if (currentDiet !== "all") {
    parts.push(currentDiet === "veggie" ? "vegetarian" : currentDiet);
  }
  if (currentPopularOnly) parts.push("popular");
  if (currentPriceFilter !== "all") parts.push("price filtered");
  if (currentRatingFilter !== "all") parts.push(`${currentRatingFilter}+ rated`);

  const label = parts.length ? `Filtered by ${parts.join(", ")}` : "Showing all items";

  summary.innerHTML = `
    ${escapeHtml(label)} • ${items.length} item${items.length !== 1 ? "s" : ""}
    ${
      selectedRestaurant.hasRestaurantFilter
        ? `<br><a href="shop.html" style="color:#e53935;font-weight:700;text-decoration:none;">← Back to restaurants</a>`
        : ""
    }
  `;
}

function renderMenuItems(items) {
  const grid = document.getElementById("menuGrid");
  if (!grid) return;

  updateResultsSummary(items);

  if (!items.length) {
    grid.innerHTML = `
      <div class="empty-menu-state">
        <h3>No items found</h3>
        <p>${
          selectedRestaurant.hasRestaurantFilter
            ? `No menu items are available for ${escapeHtml(selectedRestaurant.name)} yet.`
            : "Try changing the category, filters, or search term."
        }</p>
        ${
          selectedRestaurant.hasRestaurantFilter
            ? `<br><a href="shop.html" style="color:#e53935;font-weight:800;text-decoration:none;">← Back to restaurants</a>`
            : ""
        }
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

            ${item.is_popular ? '<span class="badge-popular">Popular</span>' : ""}

            ${
              item.diet === "veggie"
                ? '<span class="badge-diet veggie">Veggie</span>'
                : item.diet === "vegan"
                  ? '<span class="badge-diet vegan">Vegan</span>'
                  : ""
            }

            <button
              class="wishlist-btn ${favorite ? "liked" : ""}"
              type="button"
              data-action="favorite"
              data-product-id="${escapeHtml(item.id)}"
            >
              ${favorite ? "♥" : "♡"}
            </button>
          </div>

          <div class="card-body">
            <div class="card-name">${escapeHtml(item.name)}</div>

            <div class="card-desc">${escapeHtml(item.description)}</div>

            <div class="card-restaurant">
              from ${escapeHtml(item.restaurant_name)}
            </div>

            <div class="card-meta">
              <span>
                <span class="meta-star">★</span>
                ${item.rating > 0 ? escapeHtml(item.rating.toFixed(1)) : "New"}
              </span>

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
              <span class="card-price">${formatNpr(item.price)}</span>

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
    .join("");
}

function rerenderMenu() {
  renderMenuItems(getFilteredItems());
}

function setActiveButton(selector, predicate) {
  document.querySelectorAll(selector).forEach((element) => {
    element.classList.toggle("active", predicate(element));
  });
}

function setCategory(_btn, category) {
  currentCategory = category;

  setActiveButton(".cat-tab", (element) => {
    return (
      element.textContent.trim().toLowerCase() === category ||
      (category === "all" && element.textContent.trim().toLowerCase() === "all")
    );
  });

  rerenderMenu();
}

function setDiet(_btn, diet) {
  currentDiet = diet;

  setActiveButton(".diet-pill", (element) => {
    const value = element.getAttribute("data-diet-pill");
    return value === diet;
  });

  rerenderMenu();
}

function addToCartById(productId, button) {
  const item = allMenuItems.find((entry) => String(entry.id) === String(productId));

  if (!item) {
    console.warn("Item not found for cart:", productId);
    return;
  }

  if (!matchesSelectedRestaurant(item)) {
    alert("This item does not belong to the selected restaurant.");
    return;
  }

  if (typeof window.addItemToCart !== "function") {
    console.warn("addItemToCart not available");
    alert("Cart is not ready. Please refresh and try again.");
    return;
  }

  const added = window.addItemToCart({
    id: item.id,
    name: item.name,
    price: item.price,
    image_url: item.image_url,
    quantity: 1,
    restaurant_id: item.restaurant_id,
    restaurant_name: item.restaurant_name,
  });

  if (added === false) {
    return;
  }

  if (button) {
    const originalHTML = button.innerHTML;
    button.disabled = true;
    button.innerHTML = "✓ Added";
    button.style.background = "#22c55e";

    window.setTimeout(() => {
      button.disabled = false;
      button.innerHTML = originalHTML;
      button.style.background = "";
    }, 900);
  }
}

async function loadMenuItems() {
  let products = [];

  try {
    console.log("Starting to load menu items...");

    if (typeof window.getAllProducts === "function") {
      products = await window.getAllProducts();
    }
  } catch (error) {
    console.error("Error loading backend menu items:", error);
  }

  if (!Array.isArray(products)) {
    products = [];
  }

  allMenuItems = products.map(normalizeMenuItem);

  console.log("Selected restaurant:", selectedRestaurant);
  console.log("All normalized items:", allMenuItems);

  updateRestaurantHero();
  rerenderMenu();
}

function handleMenuGridClick(event) {
  const favoriteButton = event.target.closest('[data-action="favorite"]');

  if (favoriteButton) {
    const productId = favoriteButton.dataset.productId;
    const active = foodToggleFavorite(productId);

    favoriteButton.textContent = active ? "♥" : "♡";
    favoriteButton.classList.toggle("liked", active);
    return;
  }

  const addButton = event.target.closest('[data-action="add-to-cart"]');

  if (addButton) {
    addToCartById(addButton.dataset.productId, addButton);
  }
}

function setupSearch() {
  const heroSearch = document.getElementById("dishSearch");
  const navSearch = document.getElementById("navbarSearch");

  function handleSearch(value) {
    currentSearch = value || "";
    rerenderMenu();
  }

  if (heroSearch) {
    heroSearch.addEventListener("input", (e) => {
      handleSearch(e.target.value);
      if (navSearch) navSearch.value = e.target.value;
    });
  }

  if (navSearch) {
    navSearch.addEventListener("input", (e) => {
      handleSearch(e.target.value);
      if (heroSearch) heroSearch.value = e.target.value;
    });
  }
}

function setupFilterControls() {
  const priceFilter = document.getElementById("priceFilter");
  const ratingFilter = document.getElementById("ratingFilter");
  const sortFilter = document.getElementById("sortFilter");
  const popularOnly = document.getElementById("popularOnly");

  if (priceFilter) {
    priceFilter.addEventListener("change", (e) => {
      currentPriceFilter = e.target.value;
      rerenderMenu();
    });
  }

  if (ratingFilter) {
    ratingFilter.addEventListener("change", (e) => {
      currentRatingFilter = e.target.value;
      rerenderMenu();
    });
  }

  if (sortFilter) {
    sortFilter.addEventListener("change", (e) => {
      currentSort = e.target.value;
      rerenderMenu();
    });
  }

  if (popularOnly) {
    popularOnly.addEventListener("change", (e) => {
      currentPopularOnly = e.target.checked;
      rerenderMenu();
    });
  }
}

function setupPage() {
  const isLoggedIn =
    localStorage.getItem("isLoggedIn") === "true" ||
    localStorage.getItem("isLoggedIn") === "1";

  if (!isLoggedIn) {
    alert("Please login first");
    window.location.href = "login.html";
    return;
  }

  selectedRestaurant = getSelectedRestaurantFromContext();

  setupSearch();
  setupFilterControls();

  const grid = document.getElementById("menuGrid");

  if (grid) {
    grid.addEventListener("click", handleMenuGridClick);
  }

  if (typeof window.initializeCartCount === "function") {
    window.initializeCartCount();
  }

  loadMenuItems();
}

function logout() {
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("foodDeliveryCartCount");
  localStorage.removeItem("foodDeliveryCartItems");
  localStorage.removeItem("checkoutItems");
  localStorage.removeItem("checkoutTotal");
  localStorage.removeItem("checkoutSubtotal");
  localStorage.removeItem("checkoutTax");
  localStorage.removeItem("lastOrder");
  window.location.href = "landingpage.html";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.setCategory = setCategory;
window.setDiet = setDiet;
window.logout = logout;

document.addEventListener("DOMContentLoaded", setupPage);