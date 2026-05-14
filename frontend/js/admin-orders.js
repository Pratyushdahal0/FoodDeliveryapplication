const ADMIN_ORDERS_API = "../../backend/controllers/OrderController.php";

if (!localStorage.getItem("isAdminLoggedIn")) {
  window.location.href = "admin-login.html";
}

window.adminLogout = function () {
  localStorage.removeItem("foodExpressCurrentAdmin");
  localStorage.removeItem("isAdminLoggedIn");
  localStorage.removeItem("authToken");
  window.location.href = "admin-login.html";
};

let allOrders = [];

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshBtn")?.addEventListener("click", loadOrders);
  document.getElementById("searchInput")?.addEventListener("input", renderOrders);
  document.getElementById("statusFilter")?.addEventListener("change", renderOrders);
  document.getElementById("paymentFilter")?.addEventListener("change", renderOrders);
  document.getElementById("issueFilter")?.addEventListener("change", renderOrders);
  document.getElementById("dateFrom")?.addEventListener("change", renderOrders);
  document.getElementById("dateTo")?.addEventListener("change", renderOrders);

  document.getElementById("closeOrderModal")?.addEventListener("click", closeOrderModal);
  document.getElementById("orderViewModal")?.addEventListener("click", (e) => {
    if (e.target.id === "orderViewModal") closeOrderModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOrderModal();
  });

  loadOrders();
});

/* ── LOAD ── */
async function loadOrders() {
  const table      = document.getElementById("ordersTableBody");
  const refreshBtn = document.getElementById("refreshBtn");

  if (table) {
    table.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="loading-state">
            <h3>Loading orders...</h3>
            <p>Please wait while FoodExpress fetches platform orders.</p>
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
    const response = await fetch(`${ADMIN_ORDERS_API}?action=all&limit=200`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const result = await response.json();

    if (!result.success) throw new Error(result.message || "Failed to load orders.");

    allOrders = Array.isArray(result.data) ? result.data : [];
    updateOrderStats();
    renderOrders();
  } catch (error) {
    if (table) {
      table.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="empty-state">
              <h3>Could not load orders</h3>
              <p>${escapeHtml(error.message || "Please check backend connection.")}</p>
            </div>
          </td>
        </tr>
      `;
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "Refresh Orders";
    }
  }
}

/* ── STATS ── */
function updateOrderStats() {
  setText("statTotalOrders", allOrders.length);

  setText("statCompletedOrders",
    allOrders.filter((o) => {
      const s = normalizeStatus(o.status);
      return s === "delivered" || s === "completed";
    }).length
  );

  setText("statCancelledOrders",
    allOrders.filter((o) => normalizeStatus(o.status) === "cancelled").length
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayRevenue = allOrders
    .filter((o) => {
      const s = normalizeStatus(o.status);
      return s !== "cancelled" && s !== "rejected" &&
             o.created_at && o.created_at.slice(0, 10) === todayStr;
    })
    .reduce((sum, o) => sum + (parseFloat(o.subtotal) || 0), 0);

  setText("statRevenueToday",
    "Rs " + todayRevenue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  );
}

/* ── RENDER TABLE ── */
function renderOrders() {
  const table = document.getElementById("ordersTableBody");
  if (!table) return;

  const search         = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const selectedStatus  = document.getElementById("statusFilter")?.value  || "all";
  const selectedPayment = document.getElementById("paymentFilter")?.value || "all";
  const selectedIssue   = document.getElementById("issueFilter")?.value   || "all";
  const dateFrom        = document.getElementById("dateFrom")?.value || "";
  const dateTo          = document.getElementById("dateTo")?.value   || "";

  const filtered = allOrders.filter((order) => {
    const status  = normalizeStatus(order.status);
    const payment = normalizePayment(order.payment_method);
    const issue   = getOrderIssue(order);

    const matchesStatus  = selectedStatus  === "all" || status  === selectedStatus;
    const matchesPayment = selectedPayment === "all" || payment === selectedPayment;
    const matchesIssue   = selectedIssue   === "all" || issue   === selectedIssue;

    let matchesDate = true;
    if (dateFrom || dateTo) {
      const orderDate = order.created_at ? order.created_at.slice(0, 10) : "";
      if (dateFrom && orderDate < dateFrom) matchesDate = false;
      if (dateTo   && orderDate > dateTo)   matchesDate = false;
    }

    const searchText = [
      order.id, order.order_number, order.customer_name,
      order.phone_number, getRestaurantName(order), getRiderName(order),
      order.city, order.address, order.payment_method, order.status, order.total
    ].map((v) => String(v || "").toLowerCase()).join(" ");

    return matchesStatus && matchesPayment && matchesIssue && matchesDate && searchText.includes(search);
  });

  if (!filtered.length) {
    table.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">
            <h3>No orders found</h3>
            <p>Try changing your search or filters.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = filtered.map((order) => {
    const status = normalizeStatus(order.status);
    const issue  = getOrderIssue(order);

    return `
      <tr>
        <td>
          <strong>#${escapeHtml(order.order_number || String(order.id))}</strong>
          <div style="color:var(--text-muted);font-size:0.78rem">ID: ${escapeHtml(String(order.id))}</div>
        </td>

        <td>
          <div style="font-weight:600">${escapeHtml(order.customer_name || "Unknown")}</div>
          <div style="color:var(--text-muted);font-size:0.78rem">${escapeHtml(order.phone_number || "No phone")}</div>
        </td>

        <td>
          <div style="font-weight:600">${escapeHtml(getRestaurantName(order))}</div>
          <div style="color:var(--text-muted);font-size:0.78rem">${escapeHtml(order.city || "—")}</div>
        </td>

        <td>
          <div>${escapeHtml(getRiderName(order))}</div>
          <div style="color:var(--text-muted);font-size:0.78rem">${escapeHtml(getRiderStatus(order))}</div>
        </td>

        <td>
          <span class="payment-badge">${escapeHtml(formatPayment(order.payment_method))}</span>
        </td>

        <td>
          <span class="status-badge ${getOrderStatusClass(status)}">
            ${escapeHtml(formatStatus(status))}
          </span>
        </td>

        <td>
          <span class="status-badge ${getIssueClass(issue)}">
            ${escapeHtml(formatIssue(issue))}
          </span>
        </td>

        <td style="color:var(--text-muted);font-size:0.85rem">${escapeHtml(formatDate(order.created_at))}</td>

        <td>
          <div class="action-wrap">
            <button class="action-btn btn-view" type="button" onclick="viewOrder(${Number(order.id)})">
              <i class="fa-solid fa-eye"></i> View
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

/* ── VIEW ORDER DETAIL ── */
async function viewOrder(orderId) {
  const modal = document.getElementById("orderViewModal");
  const body  = document.getElementById("orderModalBody");

  if (!modal || !body) return;

  body.innerHTML = `<div class="loading-state"><h3>Loading order details...</h3></div>`;
  modal.classList.add("show");

  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch(`${ADMIN_ORDERS_API}?action=single&id=${orderId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const result = await response.json();

    if (!result.success) throw new Error(result.message || "Failed to load order details.");

    const order = result.data || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const status = normalizeStatus(order.status);
    const issue  = getOrderIssue(order);

    body.innerHTML = `
      <div class="order-detail-header">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <h2>Order #${escapeHtml(order.order_number || String(order.id))}</h2>
            <p>${escapeHtml(formatDate(order.created_at))}</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="status-badge ${getOrderStatusClass(status)}">${escapeHtml(formatStatus(status))}</span>
            <span class="status-badge ${getIssueClass(issue)}">${escapeHtml(formatIssue(issue))}</span>
          </div>
        </div>
      </div>

      <div class="order-info-grid">
        <div class="order-info-item">
          <label>Customer</label>
          <p>${escapeHtml(order.customer_name || "—")}</p>
        </div>
        <div class="order-info-item">
          <label>Phone</label>
          <p>${escapeHtml(order.phone_number || "—")}</p>
        </div>
        <div class="order-info-item">
          <label>Restaurant</label>
          <p>${escapeHtml(getRestaurantName(order))}</p>
        </div>
        <div class="order-info-item">
          <label>Rider</label>
          <p>${escapeHtml(getRiderName(order))}</p>
        </div>
        <div class="order-info-item">
          <label>Payment</label>
          <p>${escapeHtml(formatPayment(order.payment_method))}</p>
        </div>
        <div class="order-info-item">
          <label>City</label>
          <p>${escapeHtml(order.city || "—")}</p>
        </div>
        <div class="order-info-item" style="grid-column:1/-1">
          <label>Delivery Address</label>
          <p>${escapeHtml(order.address || "—")}</p>
        </div>
        ${order.notes ? `
        <div class="order-info-item" style="grid-column:1/-1">
          <label>Notes</label>
          <p>${escapeHtml(order.notes)}</p>
        </div>` : ""}
      </div>

      <div class="order-items-section">
        <h3>Order Items</h3>
        ${items.length ? items.map((item) => `
          <div class="order-item-row">
            <div>
              <div class="order-item-name">${escapeHtml(item.product_name || item.name || "Item")}</div>
              ${item.description ? `<div class="order-item-desc">${escapeHtml(item.description)}</div>` : ""}
            </div>
            <div class="order-item-meta">
              <strong>${formatCurrency(item.price)}</strong>
              <span>Qty: ${escapeHtml(String(item.quantity || 1))}</span>
            </div>
          </div>
        `).join("") : `<p style="color:var(--text-muted);font-size:0.875rem">No items found.</p>`}
      </div>

      <div class="order-totals">
        <div class="order-total-row">
          <span>Subtotal</span>
          <span>${formatCurrency(order.subtotal)}</span>
        </div>
        <div class="order-total-row">
          <span>Tax</span>
          <span>${formatCurrency(order.tax)}</span>
        </div>
        <div class="order-total-row">
          <span>Delivery Fee</span>
          <span>${formatCurrency(order.delivery_fee)}</span>
        </div>
        ${parseFloat(order.discount_amount || 0) > 0 ? `
        <div class="order-total-row" style="color:var(--success)">
          <span>Discount</span>
          <span>- ${formatCurrency(order.discount_amount)}</span>
        </div>` : ""}
        <div class="order-total-row total">
          <span>Total</span>
          <span>${formatCurrency(order.total)}</span>
        </div>
      </div>
    `;

  } catch (error) {
    body.innerHTML = `
      <div class="empty-state">
        <h3>Could not load order details</h3>
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function closeOrderModal() {
  document.getElementById("orderViewModal")?.classList.remove("show");
}

/* ── HELPERS ── */
function getRestaurantName(order) {
  return order.restaurant_name || order.restaurant || order.store_name || "Restaurant not linked";
}

function getRiderName(order) {
  return order.rider_name || order.delivery_rider || order.driver_name || "Unassigned";
}

function getRiderStatus(order) {
  if (order.rider_status) return order.rider_status;
  const status = normalizeStatus(order.status);
  if (status === "out_for_delivery") return "On delivery";
  if (status === "delivered" || status === "completed") return "Completed";
  if (status === "cancelled") return "No delivery";
  return "Not assigned";
}

function getOrderIssue(order) {
  const status = normalizeStatus(order.status);
  if (status === "cancelled" || status === "failed") return "cancelled";
  const createdAt = new Date(order.created_at);
  const now = new Date();
  if (status === "pending" && !Number.isNaN(createdAt.getTime()) && now - createdAt > 30 * 60 * 1000) {
    return "delayed";
  }
  return "normal";
}

function getIssueClass(issue) {
  if (issue === "cancelled") return "status-rejected";
  if (issue === "delayed")   return "status-pending";
  return "status-approved";
}

function formatIssue(issue) {
  if (issue === "cancelled") return "Cancelled";
  if (issue === "delayed")   return "Delayed";
  return "Normal";
}

function normalizeStatus(status) {
  return String(status || "pending").toLowerCase().trim();
}

function normalizePayment(payment) {
  const v = String(payment || "").toLowerCase().trim();
  if (v.includes("cash on delivery") || v.includes("cod")) return "cod";
  if (v.includes("cash"))   return "cash";
  if (v.includes("card"))   return "card";
  if (v.includes("online") || v.includes("digital")) return "online";
  return v || "unknown";
}

function formatPayment(payment) {
  const v = normalizePayment(payment);
  if (v === "cod")    return "Cash on Delivery";
  if (v === "cash")   return "Cash";
  if (v === "card")   return "Card";
  if (v === "online") return "Online";
  return payment || "Unknown";
}

function getOrderStatusClass(status) {
  if (status === "delivered" || status === "completed") return "status-approved";
  if (status === "cancelled" || status === "failed")    return "status-rejected";
  if (status === "preparing" || status === "ready")     return "status-pending";
  return "status-pending";
}

function formatStatus(status) {
  return capitalize(String(status || "pending").replaceAll("_", " "));
}

function formatCurrency(value) {
  const amount = parseFloat(value) || 0;
  return "Rs " + amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
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