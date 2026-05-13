console.log("ownerMenu.js loaded - owner restaurant DB version");

const API_URL = "../../backend/controllers/ProductController.php";

const DEFAULT_FOOD_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80";

const menuGrid = document.getElementById("menuGrid");
const searchInput = document.getElementById("ownerMenuSearch");

const modal = document.getElementById("menuModal");
const form = document.getElementById("menuForm");
const addBtn = document.querySelector(".btn-add");
const closeBtn = document.getElementById("closeModalBtn");
const cancelBtn = document.getElementById("cancelModalBtn");

const idInput = document.getElementById("menuItemId");
const nameInput = document.getElementById("menuName");
const categoryInput = document.getElementById("menuCategory");
const priceInput = document.getElementById("menuPrice");
const descInput = document.getElementById("menuDescription");
const imageInput = document.getElementById("menuImage");
const availableInput = document.getElementById("menuAvailable");
const popularInput = document.getElementById("menuPopular");

let ownerRestaurant = getOwnerRestaurantSession();
let restaurantId = Number(ownerRestaurant.id || 0);
let allOwnerMenuItems = [];
let activeCategory = "All";

function readJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function getOwnerRestaurantSession() {
  const currentOwner = readJson("foodExpressCurrentOwner", {});
  const currentUser = readJson("foodExpressCurrentUser", {});
  const selectedRestaurant = readJson("foodExpressSelectedRestaurant", {});

  const id =
    localStorage.getItem("ownerRestaurantId") ||
    currentOwner.restaurantId ||
    currentOwner.restaurant_id ||
    currentOwner.ownerRestaurantId ||
    currentUser.restaurantId ||
    currentUser.restaurant_id ||
    selectedRestaurant.restaurant_id ||
    selectedRestaurant.id ||
    "";

  const name =
    localStorage.getItem("ownerRestaurantName") ||
    currentOwner.restaurantName ||
    currentOwner.restaurant_name ||
    currentUser.restaurantName ||
    currentUser.restaurant_name ||
    selectedRestaurant.restaurant_name ||
    selectedRestaurant.name ||
    "Your Restaurant";

  return {
    id: Number(id || 0),
    name: String(name || "Your Restaurant"),
    owner: currentOwner,
  };
}

function requireOwnerRestaurantSession() {
  ownerRestaurant = getOwnerRestaurantSession();
  restaurantId = Number(ownerRestaurant.id || 0);

  if (!restaurantId) {
    alert("Restaurant session not found. Please login again.");
    window.location.href = "restaurant-login.html";
    return false;
  }

  localStorage.setItem("ownerRestaurantId", String(restaurantId));
  localStorage.setItem("ownerRestaurantName", ownerRestaurant.name);

  updateOwnerMenuHeader();
  return true;
}

function updateOwnerMenuHeader() {
  const headerTitle = document.querySelector(".header-card h1");
  const headerText = document.querySelector(".header-card p");
  const brandText = document.querySelector(".navbar-brand");

  if (headerTitle) {
    headerTitle.innerHTML = `${escapeHtml(ownerRestaurant.name)} <span>Menu</span>`;
  }

  if (headerText) {
    headerText.textContent =
      "Manage menu items for your approved restaurant only.";
  }

  if (brandText) {
    brandText.textContent = "FoodExpress";
  }
}

function openModal() {
  if (!modal) return;
  modal.classList.add("show");
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove("show");
}

function resetForm() {
  if (!form) return;

  form.reset();
  if (idInput) idInput.value = "";
  if (availableInput) availableInput.value = "1";
  if (popularInput) popularInput.value = "0";
}

function setLoadingState(message = "Loading menu items...") {
  if (!menuGrid) return;

  menuGrid.innerHTML = `
    <div class="empty-menu-state">
      <h3>${escapeHtml(message)}</h3>
      <p>Please wait while FoodExpress loads your restaurant menu.</p>
    </div>
  `;
}

function setEmptyState(message = "No menu items found.") {
  if (!menuGrid) return;

  menuGrid.innerHTML = `
    <div class="empty-menu-state">
      <h3>${escapeHtml(message)}</h3>
      <p>Add your first menu item for ${escapeHtml(ownerRestaurant.name)}.</p>
    </div>
  `;
}

async function parseJsonResponse(response) {
  const raw = await response.text();

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("[ownerMenu.js] Non-JSON response:", raw);
    throw new Error("Backend returned invalid JSON. Check PHP error.");
  }
}

async function loadMenu() {
  if (!restaurantId) return;

  setLoadingState();

  try {
    const url = `${API_URL}?action=owner_list&restaurant_id=${encodeURIComponent(
      restaurantId
    )}&_=${Date.now()}`;

    const res = await fetch(url);
    const data = await parseJsonResponse(res);

    if (!data.success) {
      menuGrid.innerHTML = `
        <div class="empty-menu-state">
          <h3>Failed to load menu</h3>
          <p>${escapeHtml(data.message || "Please refresh and try again.")}</p>
        </div>
      `;
      return;
    }

    allOwnerMenuItems = Array.isArray(data.data)
      ? data.data.map(normalizeOwnerMenuItem)
      : [];

    renderMenu(getVisibleMenuItems());
  } catch (error) {
    console.error("Error loading menu:", error);

    menuGrid.innerHTML = `
      <div class="empty-menu-state">
        <h3>Something went wrong</h3>
        <p>${escapeHtml(error.message || "Could not load menu items.")}</p>
      </div>
    `;
  }
}

function normalizeOwnerMenuItem(item = {}) {
  return {
    id: Number(item.id || 0),
    restaurant_id: Number(item.restaurant_id || restaurantId),
    restaurant_name:
      item.restaurant_name ||
      item.restaurantName ||
      ownerRestaurant.name ||
      "Restaurant",
    name: item.name || "Untitled item",
    category: item.category || "General",
    price: Number(item.price || 0),
    description: item.description || "",
    image_url: item.image_url || "",
    is_available: Number(item.is_available ?? 1),
    is_popular: Number(item.is_popular ?? 0),
  };
}

function getVisibleMenuItems() {
  const searchTerm = String(searchInput?.value || "").trim().toLowerCase();

  return allOwnerMenuItems.filter((item) => {
    const matchesRestaurant = Number(item.restaurant_id) === Number(restaurantId);

    const matchesCategory =
      activeCategory === "All" ||
      String(item.category || "").toLowerCase() ===
        activeCategory.toLowerCase();

    const matchesSearch =
      !searchTerm ||
      item.name.toLowerCase().includes(searchTerm) ||
      item.category.toLowerCase().includes(searchTerm) ||
      item.description.toLowerCase().includes(searchTerm);

    return matchesRestaurant && matchesCategory && matchesSearch;
  });
}

function renderMenu(items) {
  if (!menuGrid) return;

  menuGrid.innerHTML = "";

  if (!items || items.length === 0) {
    setEmptyState(
      activeCategory === "All"
        ? "No menu items found."
        : `No ${activeCategory} items found.`
    );
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "menu-card";

    const imageUrl =
      item.image_url && item.image_url.trim() !== ""
        ? item.image_url
        : DEFAULT_FOOD_IMAGE;

    card.innerHTML = `
      <div class="card-img-wrap">
        <img
          src="${escapeAttribute(imageUrl)}"
          alt="${escapeAttribute(item.name)}"
          onerror="this.src='${DEFAULT_FOOD_IMAGE}'"
        />

      <div class="menu-status-stack">
  <span class="owner-badge ${
    Number(item.is_available) === 1 ? "available" : "unavailable"
  }">
    ${Number(item.is_available) === 1 ? "Available" : "Hidden"}
  </span>

  ${
    Number(item.is_popular) === 1
      ? `<span class="owner-badge popular">Popular</span>`
      : ""
  }
</div>

        ${
          Number(item.is_popular) === 1
            ? `<span class="badge popular">Popular</span>`
            : ""
        }
      </div>

      <div class="card-body">
        <h3>${escapeHtml(item.name)}</h3>
        <p class="item-desc">${escapeHtml(item.description || "No description added.")}</p>
        <span class="cat-tag">${escapeHtml(item.category)}</span>

        <div class="card-footer">
          <span class="price">${formatRs(item.price)}</span>

          <div class="card-actions owner-card-actions">
  <button class="owner-action-btn edit" type="button" onclick="editItem(${item.id})">
    <i class="fa-solid fa-pen-to-square"></i>
    <span>Edit</span>
  </button>

  <button
    class="owner-action-btn toggle"
    type="button"
    onclick="toggleItemAvailability(${item.id}, ${Number(item.is_available) === 1 ? 0 : 1})"
  >
    <i class="fa-solid ${Number(item.is_available) === 1 ? "fa-eye-slash" : "fa-eye"}"></i>
    <span>${Number(item.is_available) === 1 ? "Hide" : "Show"}</span>
  </button>

  <button class="owner-action-btn delete" type="button" onclick="deleteItem(${item.id})">
    <i class="fa-solid fa-trash-can"></i>
    <span>Delete</span>
  </button>
</div>
        </div>
      </div>
    `;

    menuGrid.appendChild(card);
  });
}

function formatRs(amount) {
  const value = Number(amount || 0);

  return `Rs. ${value.toLocaleString("en-NP", {
    maximumFractionDigits: 0,
  })}`;
}

if (addBtn) {
  addBtn.addEventListener("click", () => {
    resetForm();
    openModal();
  });
}

if (closeBtn) {
  closeBtn.addEventListener("click", closeModal);
}

if (cancelBtn) {
  cancelBtn.addEventListener("click", closeModal);
}

if (modal) {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!restaurantId) {
      alert("Restaurant session missing. Please login again.");
      return;
    }

    const name = String(nameInput?.value || "").trim();
    const category = String(categoryInput?.value || "").trim();
    const price = Number(priceInput?.value || 0);

    if (!name || !category || !price || price <= 0) {
      alert("Please enter item name, category, and valid price.");
      return;
    }

    const formData = new FormData();
    formData.append("restaurant_id", restaurantId);
    formData.append("name", name);
    formData.append("category", category);
    formData.append("price", price);
    formData.append("description", String(descInput?.value || "").trim());
    formData.append("image_url", String(imageInput?.value || "").trim());
    formData.append("is_available", availableInput?.value || "1");
    formData.append("is_popular", popularInput?.value || "0");

    let url = `${API_URL}?action=create`;

    if (idInput?.value) {
      url = `${API_URL}?action=update`;
      formData.append("id", idInput.value);
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        body: formData,
      });

      const data = await parseJsonResponse(res);

      if (data.success) {
        closeModal();
        resetForm();
        await loadMenu();
        alert(data.message || "Menu item saved successfully.");
      } else {
        alert(data.message || "Failed to save menu item.");
      }
    } catch (error) {
      console.error("Error saving item:", error);
      alert("Something went wrong while saving: " + error.message);
    }
  });
}

window.editItem = async (id) => {
  if (!restaurantId) return;

  try {
    const res = await fetch(`${API_URL}?action=single&id=${encodeURIComponent(id)}`);
    const data = await parseJsonResponse(res);

    if (!data.success || !data.data) {
      alert("Item not found.");
      return;
    }

    const item = normalizeOwnerMenuItem(data.data);

    if (Number(item.restaurant_id) !== Number(restaurantId)) {
      alert("You cannot edit another restaurant's menu item.");
      return;
    }

    idInput.value = item.id;
    nameInput.value = item.name || "";
    categoryInput.value = item.category || "";
    priceInput.value = item.price || "";
    descInput.value = item.description || "";
    imageInput.value = item.image_url || "";
    availableInput.value = String(item.is_available ?? 1);
    popularInput.value = String(item.is_popular ?? 0);

    openModal();
  } catch (error) {
    console.error("Error fetching item:", error);
    alert("Something went wrong while loading item details.");
  }
};

window.deleteItem = async (id) => {
  if (!restaurantId) return;

  if (!confirm("Delete this menu item? This action cannot be undone.")) {
    return;
  }

  const formData = new FormData();
  formData.append("id", id);
  formData.append("restaurant_id", restaurantId);

  try {
    const res = await fetch(`${API_URL}?action=delete`, {
      method: "POST",
      body: formData,
    });

    const data = await parseJsonResponse(res);

    if (data.success) {
      await loadMenu();
      alert(data.message || "Menu item deleted.");
    } else {
      alert(data.message || "Failed to delete item.");
    }
  } catch (error) {
    console.error("Error deleting item:", error);
    alert("Something went wrong while deleting.");
  }
};

window.toggleItemAvailability = async (id, nextValue) => {
  if (!restaurantId) return;

  const formData = new FormData();
  formData.append("id", id);
  formData.append("restaurant_id", restaurantId);
  formData.append("is_available", nextValue);

  try {
    const res = await fetch(`${API_URL}?action=toggle`, {
      method: "POST",
      body: formData,
    });

    const data = await parseJsonResponse(res);

    if (data.success) {
      await loadMenu();
    } else {
      alert(data.message || "Failed to update availability.");
    }
  } catch (error) {
    console.error("Error toggling availability:", error);
    alert("Something went wrong while updating availability.");
  }
};

window.filterTag = (element, category) => {
  activeCategory = category || "All";

  document.querySelectorAll(".tag").forEach((tag) => {
    tag.classList.remove("active");
  });

  element?.classList.add("active");
  renderMenu(getVisibleMenuItems());
};

if (searchInput) {
  searchInput.addEventListener("input", () => {
    renderMenu(getVisibleMenuItems());
  });
}

window.logout = function logout() {
  localStorage.removeItem("foodExpressCurrentOwner");
  localStorage.removeItem("ownerRestaurantId");
  localStorage.removeItem("ownerRestaurantName");
  localStorage.removeItem("foodExpressCurrentUser");
  localStorage.removeItem("isLoggedIn");
  window.location.href = "restaurant-login.html";
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireOwnerAuth === "function") {
    requireOwnerAuth();
  }

  if (!requireOwnerRestaurantSession()) {
    return;
  }

  loadMenu();
});