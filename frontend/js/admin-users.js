const ADMIN_USERS_API =
  "../../backend/controllers/AdminUsersController.php";

let allUsers = [];

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshBtn")?.addEventListener("click", loadUsers);
  document.getElementById("searchInput")?.addEventListener("input", renderUsers);
  document.getElementById("statusFilter")?.addEventListener("change", renderUsers);
  document.getElementById("roleFilter")?.addEventListener("change", renderUsers);

  document.getElementById("closeUserOrdersModal")?.addEventListener("click", closeUserOrdersModal);

  document.getElementById("userOrdersModal")?.addEventListener("click", (event) => {
    if (event.target.id === "userOrdersModal") {
      closeUserOrdersModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeUserOrdersModal();
    }
  });

  loadUsers();
});

async function loadUsers() {
  const table = document.getElementById("usersTableBody");
  const refreshBtn = document.getElementById("refreshBtn");

  if (table) {
    table.innerHTML = `
      <tr>
        <td colspan="6">
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
    const response = await fetch(`${ADMIN_USERS_API}?action=list`);
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
          <td colspan="6">
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

function renderUsers() {
  const table = document.getElementById("usersTableBody");
  if (!table) return;

  const search = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const selectedStatus = document.getElementById("statusFilter")?.value || "all";
  const selectedRole = document.getElementById("roleFilter")?.value || "all";

  const filteredUsers = allUsers.filter((user) => {
    const userStatus = normalizeUserStatus(user.status);
    const userRole = normalizeUserRole(user.role);

    const matchesStatus = selectedStatus === "all" || userStatus === selectedStatus;
    const matchesRole = selectedRole === "all" || userRole === selectedRole;

    const searchText = [
      user.name,
      user.email,
      user.phone,
      user.role,
      user.address
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");

    return matchesStatus && matchesRole && searchText.includes(search);
  });

  if (!filteredUsers.length) {
    table.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <h3>No users found</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = filteredUsers
    .map((user) => {
      const status = normalizeUserStatus(user.status);
      const role = normalizeUserRole(user.role);
      const isBlocked = status === "blocked";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(user.name || "Unnamed User")}</strong>
            <div style="color:#6b7280; font-size:0.88rem;">
              ID: ${escapeHtml(user.id)}
            </div>
          </td>

          <td>
            <div>${escapeHtml(user.email || "No email")}</div>
            <div style="color:#6b7280; font-size:0.88rem;">
              ${escapeHtml(user.phone || "No phone")}
            </div>
          </td>

          <td>
            <span class="role-pill role-${escapeHtml(role)}">
              ${escapeHtml(formatRole(role))}
            </span>
          </td>

          <td>
            <span class="status-badge ${isBlocked ? "status-rejected" : "status-approved"}">
              ${escapeHtml(capitalize(status))}
            </span>
          </td>

          <td>${escapeHtml(formatDate(user.created_at))}</td>

          <td>
            <div class="action-wrap">
              <button 
                class="action-btn btn-view" 
                type="button"
                onclick="viewUserOrders(${Number(user.id)})"
              >
                Orders
              </button>

              <button 
                class="action-btn ${isBlocked ? "btn-approve" : "btn-reject"}"
                type="button"
                onclick="toggleUserStatus(${Number(user.id)}, '${isBlocked ? "active" : "blocked"}')"
              >
                ${isBlocked ? "Unblock" : "Block"}
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function toggleUserStatus(id, status) {
  const confirmAction = confirm(
    status === "blocked"
      ? "Are you sure you want to block this user?"
      : "Are you sure you want to unblock this user?"
  );

  if (!confirmAction) return;

  try {
    const response = await fetch(`${ADMIN_USERS_API}?action=update_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id, status })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to update user status.");
    }

    showMessage(result.message || "User status updated successfully.", "success");
    await loadUsers();
  } catch (error) {
    showMessage(error.message || "Could not update user status.", "error");
  }
}

async function viewUserOrders(userId) {
  const modal = document.getElementById("userOrdersModal");
  const body = document.getElementById("userOrdersBody");

  if (!modal || !body) {
    showMessage("Order history modal is missing in admin-users.html.", "error");
    return;
  }

  body.innerHTML = `
    <h2>User Order History</h2>
    <p>Loading orders...</p>
  `;

  modal.classList.add("show");

  try {
    const response = await fetch(`${ADMIN_USERS_API}?action=orders&user_id=${userId}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load orders.");
    }

    const orders = Array.isArray(result.data) ? result.data : [];

    if (!orders.length) {
      body.innerHTML = `
        <h2>User Order History</h2>
        <div class="empty-state">
          <h3>No orders found</h3>
          <p>This user has not placed any orders yet.</p>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <h2>User Order History</h2>

      <div class="list">
        ${orders
          .map((order) => {
            const status = normalizeOrderStatus(order.status);

            return `
              <div class="list-item">
                <div class="list-item-left">
                  <h4>#${escapeHtml(order.order_number || order.id)}</h4>
                  <p>
                    ${escapeHtml(order.city || "No city")} • 
                    ${escapeHtml(formatDate(order.created_at))} • 
                    ${escapeHtml(formatCurrency(order.total))}
                  </p>
                </div>

                <span class="status-badge ${getOrderStatusClass(status)}">
                  ${escapeHtml(capitalize(status))}
                </span>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  } catch (error) {
    body.innerHTML = `
      <h2>User Order History</h2>
      <div class="empty-state">
        <h3>Could not load order history</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function closeUserOrdersModal() {
  document.getElementById("userOrdersModal")?.classList.remove("show");
}

function normalizeUserStatus(status) {
  const value = String(status || "active").toLowerCase().trim();

  if (!["active", "blocked"].includes(value)) {
    return "active";
  }

  return value;
}

function normalizeUserRole(role) {
  const value = String(role || "customer").toLowerCase().trim();

  if (value === "owner" || value === "restaurant_owner") {
    return "restaurant-owner";
  }

  if (!["customer", "restaurant-owner", "delivery-rider", "admin"].includes(value)) {
    return "customer";
  }

  return value;
}

function formatRole(role) {
  if (role === "customer") return "Customer";
  if (role === "restaurant-owner") return "Restaurant Owner";
  if (role === "delivery-rider") return "Delivery Rider";
  if (role === "admin") return "Admin";
  return "Customer";
}

function normalizeOrderStatus(status) {
  return String(status || "pending").toLowerCase().trim();
}

function getOrderStatusClass(status) {
  if (status === "delivered" || status === "completed") {
    return "status-approved";
  }

  if (status === "cancelled" || status === "rejected") {
    return "status-rejected";
  }

  return "status-pending";
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

function formatDate(value) {
  if (!value) return "Recently";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return date.toLocaleDateString();
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
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