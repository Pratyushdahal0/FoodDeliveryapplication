const ADMIN_RESTAURANTS_API = "../../backend/controllers/AdminRestaurantsController.php";

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
let _pendingRestaurantId = null;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshBtn")?.addEventListener("click", loadRestaurants);
  document.getElementById("searchInput")?.addEventListener("input", renderRestaurants);
  document.getElementById("approvalFilter")?.addEventListener("change", renderRestaurants);

  document.getElementById("closeDetailModal")?.addEventListener("click", closeDetailModal);
  document.getElementById("detailModal")?.addEventListener("click", (event) => {
    if (event.target.id === "detailModal") closeDetailModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDetailModal();
      closeApprovalModal();
    }
  });

  loadRestaurants();
});

/* ── LOAD ── */
async function loadRestaurants() {
  const table = document.getElementById("restaurantsTableBody");
  const refreshBtn = document.getElementById("refreshBtn");

  if (table) {
    table.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="loading-state">
            <h3>Loading restaurants...</h3>
            <p>Please wait while FoodExpress fetches restaurant data.</p>
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
    const token = localStorage.getItem("authToken");
    const response = await fetch(`${ADMIN_RESTAURANTS_API}?action=list`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load restaurants.");
    }

    allRestaurants = Array.isArray(result.data) ? result.data : [];
    renderRestaurants();
  } catch (error) {
    if (table) {
      table.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <h3>Could not load restaurants</h3>
              <p>${escapeHtml(error.message || "Please check backend connection.")}</p>
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

/* ── RENDER TABLE ── */
function renderRestaurants() {
  const table = document.getElementById("restaurantsTableBody");
  if (!table) return;

  const search = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const selectedApproval = document.getElementById("approvalFilter")?.value || "all";

  const filtered = allRestaurants.filter((r) => {
    const approvalStatus = r.approval_status || "pending";
    const matchesApproval = selectedApproval === "all" || approvalStatus === selectedApproval;
    const searchText = [r.restaurant_name, r.email, r.phone, r.location]
      .map((v) => String(v || "").toLowerCase())
      .join(" ");
    return matchesApproval && searchText.includes(search);
  });

  if (!filtered.length) {
    table.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <h3>No restaurants found</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = filtered.map((restaurant) => {
    const approvalStatus = restaurant.approval_status || "pending";
    const isPending = approvalStatus === "pending";

    return `
      <tr>
        <td>
          <div class="restaurant-cell">
            <div class="restaurant-logo">
              ${restaurant.logo_url
                ? `<img src="${escapeHtml(restaurant.logo_url)}" alt="Logo">`
                : '<i class="fa-solid fa-utensils"></i>'}
            </div>
            <div class="restaurant-info">
              <strong>${escapeHtml(restaurant.restaurant_name || "Unnamed")}</strong>
              <span>${escapeHtml(restaurant.location || "No location")}</span>
            </div>
          </div>
        </td>

        <td>
          <div>${escapeHtml(restaurant.email || "No email")}</div>
          <div style="color:#6b7280; font-size:0.82rem;">${escapeHtml(restaurant.phone || "No phone")}</div>
        </td>

        <td>
          <span class="role-pill">${escapeHtml(restaurant.cuisine_type || "Various")}</span>
        </td>

        <td>
          <span class="status-badge ${getApprovalBadgeClass(approvalStatus)}">
            ${escapeHtml(capitalize(approvalStatus))}
          </span>
        </td>

        <td>${restaurant.approved_at ? escapeHtml(formatDate(restaurant.approved_at)) : "—"}</td>

        <td>
          ${restaurant.rejection_reason
            ? `<span title="${escapeHtml(restaurant.rejection_reason)}" style="color:#dc2626;cursor:help;">⚠️ ${escapeHtml(restaurant.rejection_reason.substring(0, 30))}...</span>`
            : "—"}
        </td>

        <td>
          <div class="action-wrap">
            <button class="action-btn btn-view" type="button" onclick="viewRestaurantDetail(${Number(restaurant.id)})">
              <i class="fa-solid fa-eye"></i> View
            </button>
            ${isPending ? `
              <button class="action-btn btn-approve" type="button" onclick="openApprovalModal(${Number(restaurant.id)}, '${escapeHtml(restaurant.restaurant_name)}')">
                <i class="fa-solid fa-check"></i> Review
              </button>
            ` : `
              <button class="action-btn btn-secondary" type="button" onclick="openApprovalModal(${Number(restaurant.id)}, '${escapeHtml(restaurant.restaurant_name)}')">
                <i class="fa-solid fa-pen"></i> Change
              </button>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/* ── VIEW DETAIL ── */
async function viewRestaurantDetail(restaurantId) {
  const modal = document.getElementById("detailModal");
  const body = document.getElementById("restaurantDetailBody");

  if (!modal || !body) {
    showMessage("Detail modal is missing in admin-restaurants.html.", "error");
    return;
  }

  body.innerHTML = `<div class="loading-state"><p>Loading restaurant details...</p></div>`;
  modal.classList.add("show");

  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch(`${ADMIN_RESTAURANTS_API}?action=detail&id=${restaurantId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load restaurant details.");
    }

    const r = result.data;

    body.innerHTML = `
      <div class="detail-header">
        <h2>${escapeHtml(r.restaurant_name || "Unnamed")}</h2>
        <p>${escapeHtml(r.location || "No location")}</p>
        <span class="status-badge ${getApprovalBadgeClass(r.approval_status || 'pending')}" style="margin-top:8px;display:inline-block">
          ${escapeHtml(capitalize(r.approval_status || 'pending'))}
        </span>
      </div>

      <p class="section-label">Restaurant Info</p>
      <div class="detail-grid">
        <div class="detail-item"><label>Email</label><p>${escapeHtml(r.email || "—")}</p></div>
        <div class="detail-item"><label>Phone</label><p>${escapeHtml(r.phone || "—")}</p></div>
        <div class="detail-item"><label>Cuisine</label><p>${escapeHtml(r.cuisine_type || "—")}</p></div>
        <div class="detail-item"><label>City</label><p>${escapeHtml(r.city || "—")}</p></div>
        <div class="detail-item"><label>Opening Time</label><p>${escapeHtml(r.opening_time || "—")}</p></div>
        <div class="detail-item"><label>Closing Time</label><p>${escapeHtml(r.closing_time || "—")}</p></div>
        <div class="detail-item"><label>Total Orders</label><p>${r.order_count ?? "—"}</p></div>
        <div class="detail-item"><label>Total Revenue</label><p>Rs ${r.total_revenue ?? "0"}</p></div>
        <div class="detail-item"><label>Avg Rating</label><p>${r.avg_rating ? "★ " + r.avg_rating : "No ratings yet"}</p></div>
        <div class="detail-item"><label>Joined</label><p>${escapeHtml(formatDate(r.created_at))}</p></div>
        <div class="detail-item" style="grid-column:1/-1"><label>Description</label><p>${escapeHtml(r.description || "—")}</p></div>
      </div>

      <p class="section-label">Owner Details</p>
      <div class="detail-grid">
        <div class="detail-item"><label>Owner Name</label><p>${escapeHtml(r.owner_full_name || "—")}</p></div>
        <div class="detail-item"><label>Owner Email</label><p>${escapeHtml(r.owner_email || "—")}</p></div>
        <div class="detail-item"><label>Owner Phone</label><p>${escapeHtml(r.owner_phone || "—")}</p></div>
      </div>

      <p class="section-label">Verification Documents</p>
      <div class="detail-grid">
        <div class="detail-item"><label>PAN Number</label><p>${escapeHtml(r.pan_number || "—")}</p></div>
        <div class="detail-item"><label>Business Reg. Number</label><p>${escapeHtml(r.business_registration_number || "—")}</p></div>
        <div class="detail-item"><label>Verification Code</label><p>${escapeHtml(r.verification_code || "—")}</p></div>
        ${r.pan_image ? `
          <div class="detail-item" style="grid-column:1/-1">
            <label>PAN Image</label>
            <img src="${escapeHtml(r.pan_image)}" style="max-width:100%;max-height:220px;border-radius:8px;margin-top:8px;border:1px solid var(--border);display:block">
          </div>` : ""}
        ${r.citizenship_image ? `
          <div class="detail-item" style="grid-column:1/-1">
            <label>Citizenship Image</label>
            <img src="${escapeHtml(r.citizenship_image)}" style="max-width:100%;max-height:220px;border-radius:8px;margin-top:8px;border:1px solid var(--border);display:block">
          </div>` : ""}
      </div>

      <div class="detail-actions" style="margin-top:20px">
        <button class="btn-primary" onclick="openApprovalModal(${Number(r.id)}, '${escapeHtml(r.restaurant_name)}')">
          <i class="fa-solid fa-${r.approval_status === 'pending' ? 'check' : 'pen'}"></i>
          ${r.approval_status === 'pending' ? 'Review & Approve/Reject' : 'Change Status'}
        </button>
      </div>
    `;

  } catch (error) {
    body.innerHTML = `
      <div class="empty-state">
        <h3>Could not load details</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

/* ── CLOSE DETAIL ── */
function closeDetailModal() {
  document.getElementById("detailModal")?.classList.remove("show");
}

/* ── APPROVAL MODAL ── */
async function openApprovalModal(restaurantId, restaurantName) {
  _pendingRestaurantId = restaurantId;
  const modal = document.getElementById("approvalModal");

  if (modal) {
    document.getElementById("approvalRestaurantName").textContent = restaurantName;
    document.getElementById("approvalStatus").value = "approved";
    document.getElementById("approvalReason").value = "";
    document.getElementById("approvalNotes").value = "";
    modal.classList.add("show");
  }
}

function closeApprovalModal() {
  document.getElementById("approvalModal")?.classList.remove("show");
  _pendingRestaurantId = null;
}

/* ── SUBMIT APPROVAL ── */
async function submitApprovalDecision() {
  if (!_pendingRestaurantId) {
    showMessage("No restaurant selected", "error");
    return;
  }

  const approvalStatus = document.getElementById("approvalStatus")?.value || "approved";
  const reason = document.getElementById("approvalReason")?.value.trim() || null;
  const notes  = document.getElementById("approvalNotes")?.value.trim() || null;

  const submitBtn = document.querySelector("#approvalModal .btn-primary");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";
  }

  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch(`${ADMIN_RESTAURANTS_API}?action=update_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        id: _pendingRestaurantId,
        approval_status: approvalStatus,
        reason,
        notes
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to update approval status.");
    }

    showMessage(`Restaurant ${approvalStatus} successfully!`, "success");
closeApprovalModal();
closeDetailModal();
setTimeout(() => loadRestaurants(), 1500); // wait so toast is visible

  } catch (error) {
    showMessage(escapeHtml(error.message || "An error occurred"), "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Decision";
    }
  }
}

/* ── HELPERS ── */
function getApprovalBadgeClass(status) {
  if (status === "approved")  return "status-approved";
  if (status === "rejected")  return "status-rejected";
  if (status === "suspended") return "status-rejected";
  if (status === "pending")   return "status-pending";
  return "status-approved";
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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
  }, 3000);
}