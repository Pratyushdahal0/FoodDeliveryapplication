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

  document.getElementById("orderViewModal")?.addEventListener("click", (event) => {
    if (event.target.id === "orderViewModal") {
      closeOrderModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOrderModal();
    }
  });

  loadOrders();
});

async function loadOrders() {
  const table = document.getElementById("ordersTableBody");
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

  if (refreshBtn) refreshBtn.disabled = true;

  try {
    const response = await fetch(`${ADMIN_ORDERS_API}?action=all&limit=100`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load orders.");
    }

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
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function updateOrderStats() {
  setText("statTotalOrders", allOrders.length);

  setText(
    "statCompletedOrders",
    allOrders.filter((order) => {
      const status = normalizeStatus(order.status);
      return status === "delivered" || status === "completed";
    }).length
  );

  setText(
    "statCancelledOrders",
    allOrders.filter((order) => normalizeStatus(order.status) === "cancelled").length
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayRevenue = allOrders
    .filter((order) => {
      const s = normalizeStatus(order.status);
      return s !== "cancelled" && s !== "rejected" &&
             order.created_at && order.created_at.slice(0, 10) === todayStr;
    })
    .reduce((sum, order) => sum + (parseFloat(order.subtotal) || 0), 0);

  setText("statRevenueToday", "Rs " + todayRevenue.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
}

function renderOrders() {
  const table = document.getElementById("ordersTableBody");
  if (!table) return;

  const search =
    document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const selectedStatus  = document.getElementById("statusFilter")?.value  || "all";
  const selectedPayment = document.getElementById("paymentFilter")?.value || "all";
  const selectedIssue   = document.getElementById("issueFilter")?.value   || "all";
  const dateFrom        = document.getElementById("dateFrom")?.value || "";
  const dateTo          = document.getElementById("dateTo")?.value   || "";

  const filteredOrders = allOrders.filter((order) => {
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
      order.id,
      order.order_number,
      order.customer_name,
      order.phone_number,
      getRestaurantName(order),
      getRiderName(order),
      order.city,
      order.address,
      order.payment_method,
      order.status,
      order.total
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");

    return (
      matchesStatus &&
      matchesPayment &&
      matchesIssue &&
      matchesDate &&
      searchText.includes(search)
    );
  });

  if (!filteredOrders.length) {
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

  table.innerHTML = filteredOrders
    .map((order) => {
      const status = normalizeStatus(order.status);
      const issue = getOrderIssue(order);

      return `
        <tr>
          <td>
            <strong>#${escapeHtml(order.order_number || order.id)}</strong>
            <div style="color:#6b7280; font-size:0.88rem;">
              ID: ${escapeHtml(order.id)}
            </div>
          </td>

          <td>
            <strong>${escapeHtml(order.customer_name || "Unknown Customer")}</strong>
            <div style="color:#6b7280; font-size:0.88rem;">
              ${escapeHtml(order.phone_number || "No phone")}
            </div>
          </td>

          <td>
            <strong>${escapeHtml(getRestaurantName(order))}</strong>
            <div style="color:#6b7280; font-size:0.88rem;">
              ${escapeHtml(order.city || "No city")}
            </div>
          </td>

          <td>
            <strong>${escapeHtml(getRiderName(order))}</strong>
            <div style="color:#6b7280; font-size:0.88rem;">
              ${escapeHtml(getRiderStatus(order))}
            </div>
          </td>

          <td>
            <span class="payment-badge">
              ${escapeHtml(formatPayment(order.payment_method))}
            </span>
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

          <td>${escapeHtml(formatDate(order.created_at))}</td>

          <td>
            <div class="action-wrap">
              <button
                class="action-btn btn-view"
                type="button"
                onclick="viewOrder(${Number(order.id)})"
              >
                View
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function viewOrder(orderId) {
  const modal = document.getElementById("orderViewModal");
  const body = document.getElementById("orderModalBody");

  if (!modal || !body) return;

  body.innerHTML = `
    <div class="loading-state">
      <h3>Loading order details...</h3>
    </div>
  `;

  modal.classList.add("show");

  try {
    const response = await fetch(`${ADMIN_ORDERS_API}?action=single&id=${orderId}`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load order details.");
    }

    const order = result.data || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const status = normalizeStatus(order.status);
    const issue = getOrderIssue(order);

    body.innerHTML = `
      <div class="support-modal-header">
        <div>
          <p class="support-modal-eyebrow">
            Platform Order #${escapeHtml(order.order_number || order.id)}
          </p>
          <h2>${escapeHtml(order.customer_name || "Unknown Customer")}</h2>
        </div>

        <span class="status-badge ${getOrderStatusClass(status)}">
          ${escapeHtml(formatStatus(status))}
        </span>
      </div>

      <div class="modal-info-grid">
        <div>
          <strong>Customer</strong>
          <p>${escapeHtml(order.customer_name || "Unknown")}</p>
        </div>

        <div>
          <strong>Phone</strong>
          <p>${escapeHtml(order.phone_number || "No phone")}</p>
        </div>

        <div>
          <strong>Restaurant</strong>
          <p>${escapeHtml(getRestaurantName(order))}</p>
        </div>

        <div>
          <strong>Rider</strong>
          <p>${escapeHtml(getRiderName(order))}</p>
        </div>

        <div>
          <strong>Payment</strong>
          <p>${escapeHtml(formatPayment(order.payment_method))}</p>
        </div>

        <div>
          <strong>Issue</strong>
          <p>${escapeHtml(formatIssue(issue))}</p>
        </div>

        <div style="grid-column:1 / -1;">
          <strong>Delivery Address</strong>
          <p>${escapeHtml(order.address || "No address")}</p>
        </div>

        <div>
          <strong>Subtotal</strong>
          <p>${escapeHtml(formatCurrency(order.subtotal))}</p>
        </div>

        <div>
          <strong>Tax</strong>
          <p>${escapeHtml(formatCurrency(order.tax))}</p>
        </div>

        <div>
          <strong>Delivery Fee</strong>
          <p>${escapeHtml(formatCurrency(order.delivery_fee))}</p>
        </div>

        <div>
          <strong>Total</strong>
          <p>${escapeHtml(formatCurrency(order.total))}</p>
        </div>

        <div style="grid-column:1 / -1;">
          <strong>Notes</strong>
          <p>${escapeHtml(order.notes || "No notes")}</p>
        </div>
      </div>

      <div class="order-items-box">
        <h3>Order Items</h3>

        ${
          items.length
            ? items
                .map(
                  (item) => `
                    <div class="order-item-card">
                      <div class="order-item-info">
                        <strong>
                          ${escapeHtml(item.product_name || item.name || "Item")}
                        </strong>

                        <p>
                          ${escapeHtml(item.description || "No item description")}
                        </p>
                      </div>

                      <div class="order-item-meta">
                        <strong>
                          ${escapeHtml(formatCurrency(item.price))}
                        </strong>

                        <span>
                          Qty: ${escapeHtml(item.quantity || 1)}
                        </span>
                      </div>
                    </div>
                  `
                )
                .join("")
            : `<div class="reply-empty">No items found for this order.</div>`
        }
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

function getRestaurantName(order) {
  return (
    order.restaurant_name ||
    order.restaurant ||
    order.store_name ||
    "Restaurant not linked"
  );
}

function getRiderName(order) {
  return (
    order.rider_name ||
    order.delivery_rider ||
    order.driver_name ||
    "Unassigned"
  );
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

  if (
    status === "pending" &&
    !Number.isNaN(createdAt.getTime()) &&
    now - createdAt > 30 * 60 * 1000
  ) {
    return "delayed";
  }

  return "normal";
}

function getIssueClass(issue) {
  if (issue === "cancelled") return "status-rejected";
  if (issue === "delayed") return "status-pending";
  return "status-approved";
}

function formatIssue(issue) {
  if (issue === "cancelled") return "Cancelled";
  if (issue === "delayed") return "Delayed";
  return "Normal";
}

function normalizeStatus(status) {
  return String(status || "pending").toLowerCase().trim();
}

function normalizePayment(payment) {
  const value = String(payment || "").toLowerCase().trim();

  if (value.includes("cash on delivery")) return "cod";
  if (value.includes("cod")) return "cod";
  if (value.includes("cash")) return "cash";
  if (value.includes("card")) return "card";
  if (value.includes("online")) return "online";
  if (value.includes("digital")) return "online";

  return value || "unknown";
}

function formatPayment(payment) {
  const value = normalizePayment(payment);

  if (value === "cod") return "Cash on Delivery";
  if (value === "cash") return "Cash";
  if (value === "card") return "Card";
  if (value === "online") return "Online";
  if (value === "unknown") return "Unknown";

  return payment || "Unknown";
}

function getOrderStatusClass(status) {
  if (status === "delivered" || status === "completed") return "status-approved";
  if (status === "cancelled" || status === "failed") return "status-rejected";
  return "status-pending";
}

function formatStatus(status) {
  return capitalize(String(status || "pending").replaceAll("_", " "));
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "Recently";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";

  return date.toLocaleDateString();
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
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