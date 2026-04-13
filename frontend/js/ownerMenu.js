console.log("ownerMenu.js loaded");

const API_URL = "../../backend/controllers/ProductController.php";
const restaurantId = 1;

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

function openModal() {
  modal.classList.add("show");
}

function closeModal() {
  modal.classList.remove("show");
}

function resetForm() {
  form.reset();
  idInput.value = "";
}

async function loadMenu() {
  try {
    const res = await fetch(
      `${API_URL}?action=owner_list&restaurant_id=${restaurantId}`
    );
    const data = await res.json();

    if (data.success) {
      renderMenu(data.data);
    } else {
      menuGrid.innerHTML = `<p>Failed to load menu items.</p>`;
    }
  } catch (error) {
    console.error("Error loading menu:", error);
    menuGrid.innerHTML = `<p>Something went wrong while loading menu items.</p>`;
  }
}

function renderMenu(items) {
  menuGrid.innerHTML = "";

  if (!items || items.length === 0) {
    menuGrid.innerHTML = `<p>No menu items found.</p>`;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "menu-card";

    const imageUrl =
      item.image_url && item.image_url.trim() !== ""
        ? item.image_url
        : "https://via.placeholder.com/400x300?text=No+Image";

    card.innerHTML = `
      <div class="card-img-wrap">
        <img src="${imageUrl}" alt="${item.name}">
        <span class="badge ${
          Number(item.is_available) === 1 ? "available" : "unavailable"
        }">
          ${Number(item.is_available) === 1 ? "Available" : "Unavailable"}
        </span>
      </div>

      <div class="card-body">
        <h3>${item.name}</h3>
        <span class="cat-tag">${item.category}</span>

        <div class="card-footer">
          <span class="price">$${item.price}</span>

          <div class="card-actions">
            <button class="icon-btn" type="button" onclick="editItem(${item.id})" title="Edit">✏️</button>
            <button class="icon-btn" type="button" onclick="deleteItem(${item.id})" title="Delete">🗑️</button>
          </div>
        </div>
      </div>
    `;

    menuGrid.appendChild(card);
  });
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
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData();
  formData.append("restaurant_id", restaurantId);
  formData.append("name", nameInput.value.trim());
  formData.append("category", categoryInput.value);
  formData.append("price", priceInput.value);
  formData.append("description", descInput.value.trim());
  formData.append("image_url", imageInput.value.trim());
  formData.append("is_available", availableInput.value);
  formData.append("is_popular", popularInput.value);

  let url = `${API_URL}?action=create`;

  if (idInput.value) {
    url = `${API_URL}?action=update`;
    formData.append("id", idInput.value);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });

    const text = await res.text();
    console.log("RAW SAVE RESPONSE:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      alert("Invalid JSON from backend:\n" + text);
      return;
    }

    if (data.success) {
      closeModal();
      resetForm();
      await loadMenu();
      alert(data.message || "Saved successfully");
    } else {
      alert(data.message || "Failed to save item.");
    }
  } catch (error) {
    console.error("Error saving item:", error);
    alert("Something went wrong while saving.");
  }
});

window.editItem = async (id) => {
  try {
    const res = await fetch(`${API_URL}?action=single&id=${id}`);
    const data = await res.json();

    if (!data.success || !data.data) {
      alert("Item not found.");
      return;
    }

    const item = data.data;

    idInput.value = item.id;
    nameInput.value = item.name || "";
    categoryInput.value = item.category || "";
    priceInput.value = item.price || "";
    descInput.value = item.description || "";
    imageInput.value = item.image_url || "";
    availableInput.value = item.is_available ?? "1";
    popularInput.value = item.is_popular ?? "0";

    openModal();
  } catch (error) {
    console.error("Error fetching item:", error);
    alert("Something went wrong while loading item details.");
  }
};

window.deleteItem = async (id) => {
  if (!confirm("Delete this item?")) return;

  const formData = new FormData();
  formData.append("id", id);
  formData.append("restaurant_id", restaurantId);

  try {
    const res = await fetch(`${API_URL}?action=delete`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (data.success) {
      loadMenu();
    } else {
      alert(data.message || "Failed to delete item.");
    }
  } catch (error) {
    console.error("Error deleting item:", error);
    alert("Something went wrong while deleting.");
  }
};

if (searchInput) {
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();

    document.querySelectorAll(".menu-card").forEach((card) => {
      const name = card.querySelector("h3").textContent.toLowerCase();
      const category = card.querySelector(".cat-tag").textContent.toLowerCase();

      card.style.display =
        name.includes(q) || category.includes(q) ? "" : "none";
    });
  });
}

window.filterTag = (element, category) => {
  document.querySelectorAll(".tag").forEach((tag) => {
    tag.classList.remove("active");
  });

  element.classList.add("active");

  document.querySelectorAll(".menu-card").forEach((card) => {
    const cardCategory = card.querySelector(".cat-tag").textContent.trim();

    if (category === "All" || cardCategory === category) {
      card.style.display = "";
    } else {
      card.style.display = "none";
    }
  });
};

loadMenu();