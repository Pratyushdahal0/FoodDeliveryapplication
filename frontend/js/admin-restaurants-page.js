const ADMIN_RESTAURANTS_API =
  "../../backend/controllers/AdminRestaurantsController.php";

let allRestaurants = [];
let rejectTargetId = null;

document.addEventListener("DOMContentLoaded", () => {
  initializeAdminRestaurantsPage();

  // Reject modal buttons
  document.getElementById("closeRejectModal")?.addEventListener("click", closeRejectModal);
  document.getElementById("cancelRejectBtn")?.addEventListener("click", closeRejectModal);

  document.getElementById("confirmRejectBtn")?.addEventListener("click", async () => {
    const reason = document.getElementById("rejectReason").value.trim();

    if (!reason) {
      alert("Please enter a reason.");
      return;
    }

    await updateRestaurantStatus(rejectTargetId, "rejected", null, reason);
    closeRejectModal();
  });
});

function initializeAdminRestaurantsPage() {
  const refreshBtn = document.getElementById("refreshBtn");
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");

  if (refreshBtn) refreshBtn.addEventListener("click", loadRestaurants);
  if (searchInput) searchInput.addEventListener("input", renderRestaurantsTable);
  if (statusFilter) statusFilter.addEventListener("change", renderRestaurantsTable);

  setupModalClose();
  loadRestaurants();
}

async function loadRestaurants() {
  const tableBody = document.getElementById("restaurantsTableBody");
  const refreshBtn = document.getElementById("refreshBtn");

  tableBody.innerHTML = `
    <tr>
      <td colspan="8">
        <div class="loading-state">
          <h3>Loading restaurants...</h3>
        </div>
      </td>
    </tr>
  `;

  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  try {
    const response = await fetch(`${ADMIN_RESTAURANTS_API}?action=list`);
    const result = await response.json();

    if (!result.success) throw new Error(result.message);

    allRestaurants = result.data || [];
    updateStats(allRestaurants);
    renderRestaurantsTable();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh Restaurants";
  }
}

function updateStats(restaurants) {
  setText("statTotal", restaurants.length);
  setText("statPending", restaurants.filter(r => r.status === "pending").length);
  setText("statApproved", restaurants.filter(r => r.status === "approved").length);
  setText("statRejected", restaurants.filter(r => r.status === "rejected").length);
}

function renderRestaurantsTable() {
  const tableBody = document.getElementById("restaurantsTableBody");

  const query = document.getElementById("searchInput")?.value.toLowerCase() || "";
  const statusFilter = document.getElementById("statusFilter")?.value || "all";

  const filtered = allRestaurants.filter(r => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;

    const searchText = [
      r.restaurant_name,
      r.owner_full_name,
      r.email,
      r.city
    ].join(" ").toLowerCase();

    const matchSearch = searchText.includes(query);

    return matchStatus && matchSearch;
  });

  tableBody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.restaurant_name}</td>
      <td>${r.owner_full_name}</td>
      <td>${r.email}</td>
      <td>${r.city}</td>
      <td>
        <span class="status-badge status-${r.status}">
          ${capitalize(r.status)}
        </span>
      </td>
      <td>
        <button class="btn-approve" data-id="${r.id}">Approve</button>
        <button class="btn-reject" data-id="${r.id}">Reject</button>
        <button class="btn-view" data-id="${r.id}">View</button>
      </td>
    </tr>
  `).join("");

  attachTableActions();
}

function attachTableActions() {
  // APPROVE
  document.querySelectorAll(".btn-approve").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateRestaurantStatus(btn.dataset.id, "approved", btn);
    });
  });

  // REJECT → OPEN MODAL
  document.querySelectorAll(".btn-reject").forEach(btn => {
    btn.addEventListener("click", () => {
      rejectTargetId = btn.dataset.id;
      document.getElementById("rejectModal").classList.add("show");
    });
  });

  // VIEW
  document.querySelectorAll(".btn-view").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = allRestaurants.find(x => x.id == btn.dataset.id);
      openViewModal(r);
    });
  });
}

function closeRejectModal() {
  document.getElementById("rejectModal").classList.remove("show");
  document.getElementById("rejectReason").value = "";
}

async function updateRestaurantStatus(id, status, button, reason = "") {
  try {
    const response = await fetch(`${ADMIN_RESTAURANTS_API}?action=update_status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, reason })
    });

    const result = await response.json();

    if (!result.success) throw new Error(result.message);

    showMessage("Updated successfully", "success");
    loadRestaurants();
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function openViewModal(r) {
  document.getElementById("viewModal").classList.add("show");
  document.getElementById("modalBody").innerHTML = `
    <h3>${r.restaurant_name}</h3>
    <p>${r.owner_full_name}</p>
    <p>${r.email}</p>
    <p>${r.city}</p>
  `;
}

function setupModalClose() {
  document.getElementById("closeModal")?.addEventListener("click", () => {
    document.getElementById("viewModal").classList.remove("show");
  });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showMessage(msg, type) {
  const bar = document.getElementById("messageBar");
  bar.textContent = msg;
  bar.className = `message-bar show ${type}`;
}

function capitalize(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}