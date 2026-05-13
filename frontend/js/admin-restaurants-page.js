const ADMIN_RESTAURANTS_API =
  "../../backend/controllers/AdminRestaurantsController.php";

if (!localStorage.getItem("isAdminLoggedIn")) {
  window.location.href = "admin-login.html";
}

window.adminLogout = function () {
  localStorage.removeItem("foodExpressCurrentAdmin");
  localStorage.removeItem("isAdminLoggedIn");
  localStorage.removeItem("authToken");
  window.location.href = "admin-login.html";
};

let allRestaurants = [];
let rejectTargetId = null;

document.addEventListener("DOMContentLoaded", () => {
  initializeAdminRestaurantsPage();

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
  document.getElementById("refreshBtn")?.addEventListener("click", loadRestaurants);
  document.getElementById("searchInput")?.addEventListener("input", renderRestaurantsTable);
  document.getElementById("statusFilter")?.addEventListener("change", renderRestaurantsTable);

  setupModalClose();
  loadRestaurants();
}

async function loadRestaurants() {
  const tableBody = document.getElementById("restaurantsTableBody");
  const refreshBtn = document.getElementById("refreshBtn");

  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="loading-state"><h3>Loading restaurants...</h3></div>
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
    const result   = await response.json();

    if (!result.success) throw new Error(result.message);

    allRestaurants = result.data || [];
    updateStats(allRestaurants);
    renderRestaurantsTable();
  } catch (error) {
    showMessage(error.message, "error");
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh Restaurants";
    }
  }
}

function updateStats(restaurants) {
  setText("statTotal",    restaurants.length);
  setText("statPending",  restaurants.filter(r => r.status === "pending").length);
  setText("statApproved", restaurants.filter(r => r.status === "approved").length);
  setText("statRejected", restaurants.filter(r => r.status === "rejected").length);
}

function renderRestaurantsTable() {
  const tableBody  = document.getElementById("restaurantsTableBody");
  const query      = document.getElementById("searchInput")?.value.toLowerCase() || "";
  const statusFilter = document.getElementById("statusFilter")?.value || "all";

  const filtered = allRestaurants.filter(r => {
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    const searchText  = [r.restaurant_name, r.owner_full_name, r.email, r.city].join(" ").toLowerCase();
    return matchStatus && searchText.includes(query);
  });

  if (!filtered.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">
            <h3>No restaurants found</h3>
            <p>Try changing your search or filter.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(r => {
    const owner    = escHtml(r.owner_full_name || "No owner");
    const cuisine  = escHtml(r.cuisine_type   || "—");
    const created  = r.created_at
      ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      : "—";

    return `
      <tr>
        <td>
          <strong>${escHtml(r.restaurant_name)}</strong>
          <div style="color:#6b7280;font-size:0.85rem">${escHtml(r.city || "—")}</div>
        </td>
        <td>${owner}</td>
        <td>
          <div>${escHtml(r.email || "—")}</div>
          <div style="color:#6b7280;font-size:0.85rem">${escHtml(r.phone || "—")}</div>
        </td>
        <td>${escHtml(r.city || "—")}</td>
        <td>${cuisine}</td>
        <td id="rating-${r.id}" style="color:#6b7280;font-size:0.9rem">—</td>
        <td>
          <span class="status-badge status-${r.status}">
            ${capitalize(r.status)}
          </span>
        </td>
        <td style="color:#6b7280;font-size:0.88rem">${created}</td>
        <td>
          <div class="action-wrap">
            <button class="action-btn btn-approve" data-id="${r.id}">Approve</button>
            <button class="action-btn btn-reject"  data-id="${r.id}">Reject</button>
            <button class="action-btn btn-view"    data-id="${r.id}">View</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  attachTableActions();
  loadRatings(filtered.map(r => r.id));
}

async function loadRatings(ids) {
  for (const id of ids) {
    try {
      const res    = await fetch(`${ADMIN_RESTAURANTS_API}?action=detail&id=${id}`);
      const result = await res.json();
      if (result.success && result.data) {
        const cell = document.getElementById(`rating-${id}`);
        if (cell) {
          const avg = result.data.avg_rating;
          cell.textContent = avg != null ? `★ ${avg}` : "—";
          cell.style.color = avg != null ? "#f59e0b" : "#6b7280";
        }
      }
    } catch (_) { /* ignore per-restaurant rating failures */ }
  }
}

function attachTableActions() {
  document.querySelectorAll(".btn-approve").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateRestaurantStatus(btn.dataset.id, "approved", btn);
    });
  });

  document.querySelectorAll(".btn-reject").forEach(btn => {
    btn.addEventListener("click", () => {
      rejectTargetId = btn.dataset.id;
      document.getElementById("rejectModal").classList.add("show");
    });
  });

  document.querySelectorAll(".btn-view").forEach(btn => {
    btn.addEventListener("click", async () => {
      const r = allRestaurants.find(x => x.id == btn.dataset.id);
      if (r) await openViewModal(r);
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

async function openViewModal(r) {
  document.getElementById("viewModal").classList.add("show");

  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <div class="loading-state"><h3>Loading details…</h3></div>
  `;

  let detail = null;
  try {
    const res    = await fetch(`${ADMIN_RESTAURANTS_API}?action=detail&id=${r.id}`);
    const result = await res.json();
    if (result.success) detail = result.data;
  } catch (_) { /* fallback to basic info */ }

  const d = detail || r;

  const owner       = escHtml(d.owner_full_name || "No owner");
  const cuisine     = escHtml(d.cuisine_type    || "—");
  const city        = escHtml(d.city            || "—");
  const location    = escHtml(d.location        || "—");
  const phone       = escHtml(d.phone           || "—");
  const email       = escHtml(d.email           || "—");
  const description = escHtml(d.description     || "No description provided.");
  const created     = d.created_at
    ? new Date(d.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

  const avgRating   = d.avg_rating    != null ? `★ ${d.avg_rating}` : "—";
  const orderCount  = d.order_count   != null ? Number(d.order_count).toLocaleString()  : "—";
  const totalRev    = d.total_revenue != null
    ? "Rs " + parseFloat(d.total_revenue).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : "—";

  body.innerHTML = `
    <div class="modal-restaurant-header" style="padding-right:50px;margin-bottom:24px">
      <div>
        <p style="margin:0 0 4px;color:var(--primary);font-size:0.8rem;font-weight:900;text-transform:uppercase;letter-spacing:0.08em">
          Restaurant Detail
        </p>
        <h2 style="margin:0;font-size:1.6rem;font-weight:900">${escHtml(d.restaurant_name)}</h2>
      </div>
      <span class="status-badge status-${d.status}" style="margin-left:auto">${capitalize(d.status)}</span>
    </div>

    <div class="modal-info-grid">
      <div><strong>Owner</strong><p>${owner}</p></div>
      <div><strong>Cuisine</strong><p>${cuisine}</p></div>
      <div><strong>City</strong><p>${city}</p></div>
      <div><strong>Location</strong><p>${location}</p></div>
      <div><strong>Phone</strong><p>${phone}</p></div>
      <div><strong>Email</strong><p>${email}</p></div>
      <div><strong>Avg Rating</strong><p style="color:#f59e0b">${avgRating}</p></div>
      <div><strong>Total Orders</strong><p>${orderCount}</p></div>
      <div><strong>Revenue</strong><p>${totalRev}</p></div>
      <div><strong>Registered</strong><p>${created}</p></div>
      <div style="grid-column:1 / -1"><strong>Description</strong><p>${description}</p></div>
    </div>

    <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
      <button class="action-btn btn-approve" onclick="updateRestaurantStatus(${d.id},'approved',null)">Approve</button>
      <button class="action-btn btn-reject"  onclick="openRejectFromDetail(${d.id})">Reject</button>
    </div>
  `;
}

window.openRejectFromDetail = function(id) {
  document.getElementById("viewModal").classList.remove("show");
  rejectTargetId = id;
  document.getElementById("rejectModal").classList.add("show");
};

function setupModalClose() {
  document.getElementById("closeModal")?.addEventListener("click", () => {
    document.getElementById("viewModal").classList.remove("show");
  });

  document.getElementById("viewModal")?.addEventListener("click", (e) => {
    if (e.target.id === "viewModal") {
      document.getElementById("viewModal").classList.remove("show");
    }
  });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showMessage(msg, type) {
  const bar = document.getElementById("messageBar");
  if (!bar) return;
  bar.textContent = msg;
  bar.className   = `message-bar show ${type}`;
}

function capitalize(t) {
  return String(t || "").charAt(0).toUpperCase() + String(t || "").slice(1);
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;");
}
