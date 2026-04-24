const ADMIN_RESTAURANTS_API =
  "../../backend/controllers/AdminRestaurantsController.php";

let allRestaurants = [];

document.addEventListener("DOMContentLoaded", () => {
  initializeAdminRestaurantsPage();
});

function initializeAdminRestaurantsPage() {
  const refreshBtn = document.getElementById("refreshBtn");
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");

  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadRestaurants);
  }

  if (searchInput) {
    searchInput.addEventListener("input", renderRestaurantsTable);
  }

  if (statusFilter) {
    statusFilter.addEventListener("change", renderRestaurantsTable);
  }

  loadRestaurants();
}

async function loadRestaurants() {
  const tableBody = document.getElementById("restaurantsTableBody");
  const refreshBtn = document.getElementById("refreshBtn");

  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="loading-state">
            <h3>Loading restaurants...</h3>
            <p>Please wait while FoodExpress fetches restaurant records.</p>
          </div>
        </td>
      </tr>
    `;
  }

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Refreshing...";
  }

  try {
    const response = await fetch(`${ADMIN_RESTAURANTS_API}?action=list`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load restaurants.");
    }

    allRestaurants = Array.isArray(result.data) ? result.data : [];
    updateStats(allRestaurants);
    renderRestaurantsTable();
  } catch (error) {
    console.error("Failed to load restaurants:", error);
    showMessage(error.message || "Could not load restaurants.", "error");

    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <h3>Could not load restaurants</h3>
              <p>${escapeHtml(error.message || "Please check backend setup.")}</p>
            </div>
          </td>
        </tr>
      `;
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh Restaurants";
    }
  }
}

function updateStats(restaurants) {
  const counts = {
    total: restaurants.length,
    pending: restaurants.filter((item) => normalizeStatus(item.status) === "pending").length,
    approved: restaurants.filter((item) => normalizeStatus(item.status) === "approved").length,
    rejected: restaurants.filter((item) => normalizeStatus(item.status) === "rejected").length
  };

  setText("statTotal", counts.total);
  setText("statPending", counts.pending);
  setText("statApproved", counts.approved);
  setText("statRejected", counts.rejected);
}

function renderRestaurantsTable() {
  const tableBody = document.getElementById("restaurantsTableBody");
  if (!tableBody) return;

  const query = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const statusFilter = document.getElementById("statusFilter")?.value || "all";

  const filtered = allRestaurants.filter((item) => {
    const status = normalizeStatus(item.status);
    const matchesStatus = statusFilter === "all" ? true : status === statusFilter;

    const searchText = [
      item.restaurant_name,
      item.owner_full_name,
      item.email,
      item.city,
      item.cuisine_type,
      item.phone
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");

    const matchesSearch = query ? searchText.includes(query) : true;

    return matchesStatus && matchesSearch;
  });

  if (!filtered.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <h3>No restaurants found</h3>
            <p>Try changing your filters or search keyword.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered
    .map((item) => {
      const status = normalizeStatus(item.status);

      return `
        <tr>
          <td>
            <div class="restaurant-cell">
              <img
                class="restaurant-logo"
                src="${escapeHtml(item.logo_url || 'https://via.placeholder.com/60?text=Logo')}"
                alt="Restaurant Logo"
                onerror="this.src='https://via.placeholder.com/60?text=Logo'"
              />
              <div class="restaurant-info">
                <strong>${escapeHtml(item.restaurant_name || "Unnamed Restaurant")}</strong>
                <span>ID: ${escapeHtml(String(item.id || "N/A"))}</span>
              </div>
            </div>
          </td>

          <td>${escapeHtml(item.owner_full_name || "Not provided")}</td>
          <td>
            <div>${escapeHtml(item.email || "No email")}</div>
            <div style="color:#6b7280; font-size:0.88rem;">${escapeHtml(item.phone || "No phone")}</div>
          </td>
          <td>${escapeHtml(item.city || "Not provided")}</td>
          <td>${escapeHtml(item.cuisine_type || "Not provided")}</td>
          <td>
            <span class="status-badge status-${status}">
              ${escapeHtml(capitalize(status))}
            </span>
          </td>
          <td>${escapeHtml(formatDate(item.created_at))}</td>
          <td>
            <div class="action-wrap">
              <button
                class="action-btn btn-approve"
                data-id="${escapeHtml(String(item.id))}"
                data-status="approved"
                ${status === "approved" ? "disabled" : ""}
              >
                Approve
              </button>

              <button
                class="action-btn btn-reject"
                data-id="${escapeHtml(String(item.id))}"
                data-status="rejected"
                ${status === "rejected" ? "disabled" : ""}
              >
                Reject
              </button>

              <button
                class="action-btn btn-view"
                data-view-id="${escapeHtml(String(item.id))}"
              >
                View
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  attachTableActions();
}

function attachTableActions() {
  document.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      const newStatus = button.dataset.status;
      await updateRestaurantStatus(id, newStatus, button);
    });
  });

  document.querySelectorAll("[data-view-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.viewId;
      const restaurant = allRestaurants.find((item) => String(item.id) === String(id));

      if (!restaurant) return;

      alert(
        `Restaurant: ${restaurant.restaurant_name || "N/A"}\n` +
        `Owner: ${restaurant.owner_full_name || "N/A"}\n` +
        `Email: ${restaurant.email || "N/A"}\n` +
        `Phone: ${restaurant.phone || "N/A"}\n` +
        `City: ${restaurant.city || "N/A"}\n` +
        `Cuisine: ${restaurant.cuisine_type || "N/A"}\n` +
        `Status: ${capitalize(normalizeStatus(restaurant.status))}`
      );
    });
  });
}

async function updateRestaurantStatus(id, status, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = status === "approved" ? "Approving..." : "Rejecting...";

  try {
    const response = await fetch(`${ADMIN_RESTAURANTS_API}?action=update_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id, status })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to update restaurant status.");
    }

    showMessage(result.message || "Restaurant status updated successfully.", "success");
    await loadRestaurants();
  } catch (error) {
    console.error("Status update failed:", error);
    showMessage(error.message || "Could not update restaurant status.", "error");
    button.disabled = false;
    button.textContent = originalText;
  }
}

function normalizeStatus(status) {
  const value = String(status || "pending").toLowerCase().trim();
  if (!["pending", "approved", "rejected"].includes(value)) {
    return "pending";
  }
  return value;
}

function formatDate(value) {
  if (!value) return "Recently";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function showMessage(message, type) {
  const bar = document.getElementById("messageBar");
  if (!bar) return;

  bar.textContent = message;
  bar.className = `message-bar show ${type}`;

  clearTimeout(showMessage._timer);
  showMessage._timer = setTimeout(() => {
    bar.className = "message-bar";
    bar.textContent = "";
  }, 3500);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}