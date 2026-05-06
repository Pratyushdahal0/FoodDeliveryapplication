(function () {
  if (window.__FOODEXPRESS_FOOD_JS_LOADED__) {
    console.warn("[food.js] Already loaded, skipping duplicate script.");
    return;
  }

  window.__FOODEXPRESS_FOOD_JS_LOADED__ = true;

  console.log("[food.js] Loaded - restaurant menu v2 (restaurant filter + NPR)");

  const FOOD_FAVORITES_KEY_SAFE = "foodDeliveryFavorites";
  const DEFAULT_FOOD_IMAGE =
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80";

  let allMenuItems = [];
  let currentCategory = "all";
  let currentDiet = "all";
  let currentSearch = "";
  let currentPriceFilter = "all";
  let currentRatingFilter = "all";
  let currentSort = "recommended";
  let currentPopularOnly = false;

  // selectedRestaurant: { id, name } or null when showing all items
  let selectedRestaurant = null;

  /* ===============================
     MONEY FORMAT
  ================================ */

  function formatNpr(amount) {
    const value = Number(amount || 0);

    return `Rs. ${value.toLocaleString("en-NP", {
      maximumFractionDigits: 0,
    })}`;
  }

  /* ===============================
     RESTAURANT DETECTION
     Priority:
       1. URL params (restaurant_id / restaurantId / id)
       2. localStorage object (foodExpressSelectedRestaurant)
       3. localStorage flat keys (selectedRestaurantId / selectedRestaurantName)
       4. null = show all
  ================================ */

  function readRestaurantFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);

      const id =
        params.get("restaurant_id") ||
        params.get("restaurantId") ||
        params.get("id");

      const name =
        params.get("restaurant") ||
        params.get("restaurant_name") ||
        params.get("name");

      if (id) {
        return {
          id: String(id),
          name: name ? decodeURIComponent(name) : "",
        };
      }
    } catch (error) {
      console.warn("[food.js] Failed to parse URL params:", error);
    }

    return null;
  }

  function readRestaurantFromStorage() {
    try {
      const raw = localStorage.getItem("foodExpressSelectedRestaurant");

      if (raw) {
        const obj = JSON.parse(raw);

        if (obj && (obj.id || obj.restaurant_id)) {
          return {
            id: String(obj.id || obj.restaurant_id),
            name: obj.name || obj.restaurant_name || "",
          };
        }
      }
    } catch (error) {
      console.warn("[food.js] Failed to parse stored restaurant:", error);
    }

    const flatId = localStorage.getItem("selectedRestaurantId");
    const flatName = localStorage.getItem("selectedRestaurantName");

    if (flatId) {
      return {
        id: String(flatId),
        name: flatName || "",
      };
    }

    return null;
  }

  function detectSelectedRestaurant() {
    // URL wins, but if URL has id without name, try storage to fill name.
    const fromUrl = readRestaurantFromUrl();
    const fromStorage = readRestaurantFromStorage();

    if (fromUrl) {
      // If URL gave id but no name, try to fill name from storage if it matches.
      if (!fromUrl.name && fromStorage && String(fromStorage.id) === String(fromUrl.id)) {
        fromUrl.name = fromStorage.name;
      }

      // Persist the selection back so other pages stay in sync.
      try {
        localStorage.setItem("selectedRestaurantId", String(fromUrl.id));
        if (fromUrl.name) {
          localStorage.setItem("selectedRestaurantName", fromUrl.name);
        }
        localStorage.setItem(
          "foodExpressSelectedRestaurant",
          JSON.stringify({
            id: Number(fromUrl.id),
            restaurant_id: Number(fromUrl.id),
            name: fromUrl.name || "Restaurant",
            restaurant_name: fromUrl.name || "Restaurant",
            selectedAt: new Date().toISOString(),
          })
        );
      } catch (error) {
        console.warn("[food.js] Failed to persist selected restaurant:", error);
      }

      return fromUrl;
    }

    return fromStorage;
  }

  function updateRestaurantHero() {
    const heroTitle = document.getElementById("heroTitle");
    const heroSubtitle = document.getElementById("heroSubtitle");
    const pageTitle = document.getElementById("pageTitle");
    const backStrip = document.getElementById("restaurantBackStrip");

    if (selectedRestaurant && selectedRestaurant.id) {
      const name = selectedRestaurant.name || "Restaurant";

      if (heroTitle) {
        heroTitle.innerHTML = `${escapeHtml(name)} <span>Menu</span>`;
      }

      if (heroSubtitle) {
        heroSubtitle.textContent = `Fresh dishes prepared by ${name}`;
      }

      if (pageTitle) {
        pageTitle.textContent = `FoodExpress — ${name} Menu`;
      }

      if (backStrip) {
        backStrip.style.display = "block";
      }
    } else {
      if (heroTitle) {
        heroTitle.innerHTML = `Our <span>Menu</span>`;
      }

      if (heroSubtitle) {
        heroSubtitle.textContent =
          "Explore our delicious selection of freshly prepared dishes";
      }

      if (pageTitle) {
        pageTitle.textContent = "FoodExpress — Menu";
      }

      if (backStrip) {
        backStrip.style.display = "none";
      }
    }
  }

  /* ===============================
     NORMALIZE
  ================================ */

  function normalizeMenuItem(item, index = 0) {
    return {
      id: String(item.id ?? `menu-${index + 1}`),
      name: item.name || "Untitled Item",
      description: item.description || "Freshly prepared dish",
      price: Number(item.price ?? 0),
      image_url: item.image_url || DEFAULT_FOOD_IMAGE,
      rating: Number(item.rating ?? 4.5),
      delivery_time: item.delivery_time || "30 min",
      category: String(item.category || "").trim().toLowerCase(),
      originalCategory: String(item.category || "").trim().toLowerCase(),
      diet: normalizeDiet(item),
      is_popular: Number(item.is_popular) === 1 || item.is_popular === true,
      restaurant_id: String(item.restaurant_id ?? ""),
      restaurant_name:
        item.restaurant_name ||
        item.restaurant ||
        item.restaurant_title ||
        "Unknown Restaurant",
      distance: item.distance || `${Math.floor(Math.random() * 500) + 200} m`,
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

  function getDeliveryMinutes(deliveryTime) {
    const match = String(deliveryTime || "").match(/\d+/);
    return match ? Number(match[0]) : 999;
  }

  /* ===============================
     FAVORITES
  ================================ */

  function foodGetFavoriteIds() {
    try {
      const stored = JSON.parse(
        localStorage.getItem(FOOD_FAVORITES_KEY_SAFE) || "[]"
      );

      return Array.isArray(stored) ? stored.map(String) : [];
    } catch {
      return [];
    }
  }

  function foodSaveFavoriteIds(ids) {
    localStorage.setItem(
      FOOD_FAVORITES_KEY_SAFE,
      JSON.stringify(ids.map(String))
    );
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

  /* ===============================
     FILTERS
  ================================ */

  function matchesPrice(price) {
    const amount = Number(price || 0);

    if (currentPriceFilter === "all") return true;

    // Buckets keyed in NPR (legacy keys preserved so existing dropdown values work).
    if (currentPriceFilter === "under10") return amount < 300;
    if (currentPriceFilter === "10to20") return amount >= 300 && amount <= 500;
    if (currentPriceFilter === "20to50") return amount > 500 && amount <= 1000;
    if (currentPriceFilter === "above50") return amount > 1000;

    return true;
  }

  function matchesRating(rating) {
    if (currentRatingFilter === "all") return true;
    return rating >= Number(currentRatingFilter);
  }

  function matchesRestaurant(item) {
    if (!selectedRestaurant || !selectedRestaurant.id) return true;
    return String(item.restaurant_id) === String(selectedRestaurant.id);
  }

  function getFilteredItems() {
    const filtered = allMenuItems.filter((item) => {
      const matchesCategory =
        currentCategory === "all" ||
        String(item.originalCategory || "").toLowerCase() === currentCategory;

      const matchesDiet =
        currentDiet === "all" ||
        (currentDiet === "veggie" && item.diet === "veggie") ||
        (currentDiet === "vegan" && item.diet === "vegan");

      const matchesPopular = !currentPopularOnly || item.is_popular === true;
      const matchesPriceRange = matchesPrice(Number(item.price || 0));
      const matchesMinRating = matchesRating(Number(item.rating || 0));

      const query = currentSearch.trim().toLowerCase();

      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.restaurant_name.toLowerCase().includes(query) ||
        String(item.originalCategory || "").toLowerCase().includes(query);

      return (
        matchesRestaurant(item) &&
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
          getDeliveryMinutes(a.delivery_time) -
          getDeliveryMinutes(b.delivery_time)
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

  function updateResultsSummary(items) {
    const summary = document.getElementById("resultsSummary");
    if (!summary) return;

    const parts = [];

    if (currentCategory !== "all") parts.push(currentCategory);

    if (currentDiet !== "all") {
      parts.push(currentDiet === "veggie" ? "vegetarian" : currentDiet);
    }

    if (currentPopularOnly) parts.push("popular");
    if (currentPriceFilter !== "all") parts.push("price filtered");
    if (currentRatingFilter !== "all") parts.push(`${currentRatingFilter}+ rated`);

    const restaurantPrefix =
      selectedRestaurant && selectedRestaurant.id
        ? `Showing ${selectedRestaurant.name || "this restaurant"}`
        : "Showing all items";

    const filterSuffix = parts.length ? ` • Filtered by ${parts.join(", ")}` : "";

    summary.textContent = `${restaurantPrefix}${filterSuffix} • ${items.length} item${
      items.length !== 1 ? "s" : ""
    }`;
  }

  /* ===============================
     RENDER MENU
  ================================ */

  function renderMenuItems(items) {
    const grid = document.getElementById("menuGrid");
    if (!grid) return;

    updateResultsSummary(items);

    if (!items.length) {
      const showBackButton = selectedRestaurant && selectedRestaurant.id;

      grid.innerHTML = `
        <div class="empty-menu-state">
          <h3>No items found</h3>
          <p>${
            showBackButton
              ? "This restaurant has no items matching your filters."
              : "Try changing the category, filters, or search term."
          }</p>
          ${
            showBackButton
              ? '<a href="shop.html" class="empty-back-link">← Browse other restaurants</a>'
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
                onerror="this.src='${DEFAULT_FOOD_IMAGE}'"
              />

              ${
                item.is_popular
                  ? '<span class="badge-popular">Popular</span>'
                  : ""
              }

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
                aria-label="Save item"
              >
                <i class="${favorite ? "fa-solid" : "fa-regular"} fa-heart"></i>
              </button>
            </div>

            <div class="card-body">
              <div class="card-name">${escapeHtml(item.name)}</div>
              <div class="card-desc">${escapeHtml(item.description)}</div>
              <div class="card-restaurant">from ${escapeHtml(
                item.restaurant_name
              )}</div>

              <div class="card-meta">
                <span>
                  <span class="meta-star">★</span>
                  ${escapeHtml(item.rating.toFixed(1))}
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
                  <i class="fa-solid fa-cart-shopping"></i>
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

  /* ===============================
     CONTROLS
  ================================ */

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
        (category === "all" &&
          element.textContent.trim().toLowerCase() === "all")
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
    const item = allMenuItems.find(
      (entry) => String(entry.id) === String(productId)
    );

    if (!item) {
      console.warn("[food.js] Item not found for cart:", productId);
      return;
    }

    if (typeof window.addItemToCart !== "function") {
      console.warn("[food.js] addItemToCart not available");
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

    if (!added) return;

    if (button) {
      const originalHTML = button.innerHTML;

      button.disabled = true;
      button.innerHTML = `<i class="fa-solid fa-check"></i> Added`;
      button.style.background = "#22c55e";

      window.setTimeout(() => {
        button.disabled = false;
        button.innerHTML = originalHTML;
        button.style.background = "";
      }, 900);
    }
  }

  /* ===============================
     LOAD
  ================================ */

  async function loadMenuItems() {
    let products = [];

    try {
      console.log("[food.js] Starting to load menu items...");

      if (typeof window.getAllProducts === "function") {
        products = await window.getAllProducts();
      }
    } catch (error) {
      console.error("[food.js] Error loading backend menu items:", error);
    }

    if (!Array.isArray(products)) {
      products = [];
    }

    allMenuItems = products.map(normalizeMenuItem);

    // If user opened food.html for a specific restaurant but we never got a name
    // from URL/storage, derive it from the loaded products (first matching item).
    if (selectedRestaurant && selectedRestaurant.id && !selectedRestaurant.name) {
      const sample = allMenuItems.find(
        (it) => String(it.restaurant_id) === String(selectedRestaurant.id)
      );

      if (sample && sample.restaurant_name) {
        selectedRestaurant.name = sample.restaurant_name;

        try {
          localStorage.setItem("selectedRestaurantName", sample.restaurant_name);
        } catch (_) {}

        updateRestaurantHero();
      }
    }

    rerenderMenu();
  }

  function handleMenuGridClick(event) {
    const favoriteButton = event.target.closest('[data-action="favorite"]');

    if (favoriteButton) {
      const productId = favoriteButton.dataset.productId;
      const active = foodToggleFavorite(productId);

      favoriteButton.innerHTML = `<i class="${
        active ? "fa-solid" : "fa-regular"
      } fa-heart"></i>`;

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

    // Detect restaurant FIRST so hero/title render correctly while products load.
    selectedRestaurant = detectSelectedRestaurant();
    updateRestaurantHero();

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
    localStorage.removeItem("checkoutDeliveryFee");
    localStorage.removeItem("checkoutTax");
    localStorage.removeItem("lastOrder");

    window.location.href = "landingpage.html";
  }

  /* ===============================
     UTILS
  ================================ */

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
  window.formatNpr = formatNpr;

  // Run setup on DOMContentLoaded; if the script loaded after DOM is already
  // parsed (e.g. cached), run immediately so we don't miss the event.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupPage);
  } else {
    setupPage();
  }
})();