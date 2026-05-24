const ADMIN_USERS_API = "../../backend/controllers/AdminUsersController.php";

if (!localStorage.getItem("isAdminLoggedIn")) {
  window.location.href = "admin-login.html";
}

window.adminLogout = function () {
  localStorage.removeItem("foodExpressCurrentAdmin");
  localStorage.removeItem("isAdminLoggedIn");
  localStorage.removeItem("authToken");
  window.location.href = "admin-login.html";
};

let allUsers = [];
let _pendingBlockId     = null;
let _pendingBlockStatus = null;
let _pendingApprovalId  = null;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshBtn")?.addEventListener("click", loadUsers);
  document.getElementById("searchInput")?.addEventListener("input", renderUsers);
  document.getElementById("statusFilter")?.addEventListener("change", renderUsers);
  document.getElementById("roleFilter")?.addEventListener("change", renderUsers);
  document.getElementById("approvalFilter")?.addEventListener("change", renderUsers);

  document.getElementById("closeUserOrdersModal")?.addEventListener("click", closeUserOrdersModal);
  document.getElementById("userOrdersModal")?.addEventListener("click", (e) => {
    if (e.target.id === "userOrdersModal") closeUserOrdersModal();
  });

  document.getElementById("closeBlockModal")?.addEventListener("click", closeBlockModal);
  document.getElementById("cancelBlockBtn")?.addEventListener("click", closeBlockModal);
  document.getElementById("confirmBlockBtn")?.addEventListener("click", applyUserStatus);
  document.getElementById("blockConfirmModal")?.addEventListener("click", (e) => {
    if (e.target.id === "blockConfirmModal") closeBlockModal();
  });

  document.getElementById("approvalModal")?.addEventListener("click", (e) => {
    if (e.target.id === "approvalModal") closeApprovalModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeUserOrdersModal();
      closeBlockModal();
      closeApprovalModal();
    }
  });

  loadUsers();
});

/* ── LOAD USERS ── */
async function loadUsers() {
  const table = document.getElementById("usersTableBody");
  const refreshBtn = document.getElementById("refreshBtn");

  if (table) {
    table.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="loading-state">
            <h3>Loading users...</h3>
            <p>Please wait while FoodExpress fetches user accounts.</p>
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
    const response = await fetch(`${ADMIN_USERS_API}?action=list`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load users.");
    }

    allUsers = Array.isArray(result.data) ? result.data : [];
    renderUsers();
  } catch (error) {
    if (table) {
      table.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">
              <h3>Could not load users</h3>
              <p>${escapeHtml(error.message || "Please check backend connection.")}</p>
            </div>
          </td>
        </tr>
      `;
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh Users";
    }
  }
}

/* ── RENDER TABLE ── */
function renderUsers() {
  const table = document.getElementById("usersTableBody");
  if (!table) return;

  const search         = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const selectedStatus   = document.getElementById("statusFilter")?.value   || "all";
  const selectedRole     = document.getElementById("roleFilter")?.value     || "all";
  const selectedApproval = document.getElementById("approvalFilter")?.value || "all";

  const filtered = allUsers.filter((user) => {
    const userStatus   = normalizeUserStatus(user.status);
    const userRole     = normalizeUserRole(user.role);
    const approvalStatus = user.approval_status || "approved";

    const matchesStatus   = selectedStatus   === "all" || userStatus   === selectedStatus;
    const matchesRole     = selectedRole     === "all" || userRole     === selectedRole;
    const matchesApproval = selectedApproval === "all" || approvalStatus === selectedApproval;

    const searchText = [user.name, user.email, user.phone, user.role, user.address]
      .map((v) => String(v || "").toLowerCase()).join(" ");

    return matchesStatus && matchesRole && matchesApproval && searchText.includes(search);
  });

  if (!filtered.length) {
    table.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <h3>No users found</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = filtered.map((user) => {
    const status       = normalizeUserStatus(user.status);
    const role         = normalizeUserRole(user.role);
    const isBlocked    = status === "blocked";
    const approvalStatus = user.approval_status || "approved";
    const needsApproval = ["restaurant-owner", "delivery-rider"].includes(user.role) && approvalStatus === "pending";

    const initials = String(user.name || "U")
      .split(" ").map(w => w[0] || "").slice(0, 2).join("").toUpperCase();

    return `
      <tr>
        <td>
          <div class="user-cell">
            <div class="user-avatar">${escapeHtml(initials)}</div>
            <div class="user-info">
              <strong>${escapeHtml(user.name || "Unnamed User")}</strong>
              <span>ID: ${escapeHtml(String(user.id))}</span>
            </div>
          </div>
        </td>

        <td>
          <div>${escapeHtml(user.email || "No email")}</div>
          <div style="color:#6b7280;font-size:0.82rem">${escapeHtml(user.phone || "No phone")}</div>
        </td>

        <td>
          <span class="role-pill">${escapeHtml(formatRole(role))}</span>
        </td>

        <td>
          <span class="status-badge ${isBlocked ? "status-blocked" : "status-active"}">
            ${escapeHtml(capitalize(status))}
          </span>
        </td>

        <td>
          <span class="status-badge ${getApprovalBadgeClass(approvalStatus)}">
            ${escapeHtml(capitalize(approvalStatus))}
          </span>
        </td>

        <td style="color:var(--text-muted);font-size:0.85rem">${escapeHtml(formatDate(user.created_at))}</td>

        <td>
          <div class="action-wrap">
            <button class="action-btn btn-view" type="button"
  onclick="viewUserOrders(${Number(user.id)})">
  <i class="fa-solid fa-receipt"></i> Orders
</button>

${["restaurant-owner", "delivery-rider"].includes(user.role) ? `
  <button class="action-btn ${needsApproval ? "btn-approve" : "btn-secondary"}" type="button"
    onclick="openApprovalModal(${Number(user.id)}, '${escapeHtml(user.name)}')">
    <i class="fa-solid fa-${needsApproval ? "check" : "pen"}"></i>
    ${needsApproval ? "Review" : "Status"}
  </button>
` : ""}

${user.role !== "admin" ? `
  <button class="action-btn ${isBlocked ? "btn-approve" : "btn-reject"}" type="button"
    onclick="toggleUserStatus(${Number(user.id)}, '${isBlocked ? "active" : "blocked"}')">
    ${isBlocked ? "Unblock" : "Block"}
  </button>
` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/* ── BLOCK / UNBLOCK ── */
function toggleUserStatus(id, status) {
  _pendingBlockId     = id;
  _pendingBlockStatus = status;

  const isBlocking = status === "blocked";

  const titleEl   = document.getElementById("blockModalTitle");
  const descEl    = document.getElementById("blockModalDesc");
  const confirmBtn = document.getElementById("confirmBlockBtn");
  const reasonEl  = document.getElementById("blockReasonInput");

  if (titleEl)  titleEl.textContent = isBlocking ? "Block User" : "Unblock User";
  if (descEl)   descEl.textContent  = isBlocking
    ? "Blocking this user will prevent them from logging in. You can unblock them at any time."
    : "This will restore the user's access to the platform.";
  if (confirmBtn) {
    confirmBtn.textContent = isBlocking ? "Block" : "Unblock";
    confirmBtn.className   = isBlocking ? "btn-primary" : "btn-primary";
    confirmBtn.style.background = isBlocking ? "var(--danger)" : "var(--success)";
  }
  if (reasonEl) {
    reasonEl.value = "";
    reasonEl.style.display = isBlocking ? "block" : "none";
  }

  document.getElementById("blockConfirmModal")?.classList.add("show");
}

function closeBlockModal() {
  document.getElementById("blockConfirmModal")?.classList.remove("show");
  _pendingBlockId     = null;
  _pendingBlockStatus = null;
}

async function applyUserStatus() {
  if (!_pendingBlockId) return;

  const id     = _pendingBlockId;
  const status = _pendingBlockStatus;

  closeBlockModal();

  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch(`${ADMIN_USERS_API}?action=update_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ id, status })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to update user status.");
    }

    showMessage(result.message || "User status updated successfully.", "success");
    setTimeout(() => loadUsers(), 1000);
  } catch (error) {
    showMessage(error.message || "Could not update user status.", "error");
  }
}

/* ── VIEW ORDERS ── */
async function viewUserOrders(userId) {
  const modal = document.getElementById("userOrdersModal");
  const body  = document.getElementById("userOrdersBody");

  if (!modal || !body) return;

  body.innerHTML = `<div class="loading-state"><h3>Loading orders...</h3></div>`;
  modal.classList.add("show");

  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch(`${ADMIN_USERS_API}?action=orders&user_id=${userId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const result = await response.json();

    if (!result.success) throw new Error(result.message || "Failed to load orders.");

    const orders = Array.isArray(result.data) ? result.data : [];

    if (!orders.length) {
      body.innerHTML = `
        <div class="empty-state">
          <h3>No orders found</h3>
          <p>This user has not placed any orders yet.</p>
        </div>
      `;
      return;
    }

    body.innerHTML = orders.map((order) => {
      const status     = String(order.status || "pending").toLowerCase();
      const restaurant = order.restaurant_name || ("Restaurant #" + (order.restaurant_id || "?"));
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;
                    padding:12px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-weight:600;font-size:0.875rem">#${escapeHtml(String(order.order_number || order.id))}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">
              ${escapeHtml(restaurant)} · ${escapeHtml(formatDate(order.created_at))}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <strong style="font-size:0.875rem">Rs ${parseFloat(order.total || 0).toLocaleString("en-IN")}</strong>
            <span class="status-badge ${getOrderStatusClass(status)}">${escapeHtml(capitalize(status))}</span>
          </div>
        </div>
      `;
    }).join("");

  } catch (error) {
    body.innerHTML = `
      <div class="empty-state">
        <h3>Could not load orders</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function closeUserOrdersModal() {
  document.getElementById("userOrdersModal")?.classList.remove("show");
}

/* ── APPROVAL MODAL ── */
async function openApprovalModal(userId, userName) {
  _pendingApprovalId = userId;

  const modal = document.getElementById("approvalModal");
  if (!modal) return;

  // Reset fields
  document.getElementById("approvalUserName").textContent = userName;
  document.getElementById("approvalStatus").value = "approved";
  document.getElementById("approvalReason").value = "";
  document.getElementById("approvalNotes").value  = "";

  modal.classList.add("show");
}

function closeApprovalModal() {
  document.getElementById("approvalModal")?.classList.remove("show");
  _pendingApprovalId = null;
}

async function submitApprovalDecision() {
  if (!_pendingApprovalId) {
    showMessage("No user selected", "error");
    return;
  }

  const approvalStatus = document.getElementById("approvalStatus")?.value || "approved";
  const reason  = document.getElementById("approvalReason")?.value.trim() || null;
  const notes   = document.getElementById("approvalNotes")?.value.trim()  || null;

  const submitBtn = document.querySelector("#approvalModal .btn-primary");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Submitting..."; }

  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch(`${ADMIN_USERS_API}?action=update_approval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        id: _pendingApprovalId,
        approval_status: approvalStatus,
        reason,
        notes
      })
    });

    const result = await response.json();

    if (!result.success) throw new Error(result.message || "Failed to update approval status.");

    showMessage(`User ${approvalStatus} successfully!`, "success");
    closeApprovalModal();
    setTimeout(() => loadUsers(), 1000);

  } catch (error) {
    showMessage(escapeHtml(error.message || "An error occurred"), "error");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit Decision"; }
  }
}

/* ── HELPERS ── */
function normalizeUserStatus(status) {
  const v = String(status || "active").toLowerCase().trim();
  return ["active", "blocked"].includes(v) ? v : "active";
}

function normalizeUserRole(role) {
  const v = String(role || "customer").toLowerCase().trim();
  if (v === "owner" || v === "restaurant_owner") return "restaurant-owner";
  return ["customer", "restaurant-owner", "delivery-rider", "admin"].includes(v) ? v : "customer";
}

function formatRole(role) {
  if (role === "customer")        return "Customer";
  if (role === "restaurant-owner") return "Restaurant Owner";
  if (role === "delivery-rider")  return "Delivery Rider";
  if (role === "admin")           return "Admin";
  return "Customer";
}

function getApprovalBadgeClass(status) {
  if (status === "approved")  return "status-approved";
  if (status === "rejected")  return "status-rejected";
  if (status === "suspended") return "status-suspended";
  if (status === "pending")   return "status-pending";
  return "status-approved";
}

function getOrderStatusClass(status) {
  if (["delivered", "completed"].includes(status)) return "status-approved";
  if (["cancelled", "rejected"].includes(status))  return "status-rejected";
  return "status-pending";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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