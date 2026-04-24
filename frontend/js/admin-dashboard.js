const ADMIN_DASHBOARD_API =
  "../../backend/controllers/AdminDashboardController.php?action=summary";

document.addEventListener("DOMContentLoaded", () => {
  loadAdminDashboard();
});

async function loadAdminDashboard() {
  try {
    const response = await fetch(ADMIN_DASHBOARD_API);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load dashboard summary.");
    }

    const data = result.data || {};

    setText("totalRestaurants", data.total_restaurants || 0);
    setText("pendingRestaurants", data.pending_restaurants || 0);
    setText("approvedRestaurants", data.approved_restaurants || 0);
    setText("rejectedRestaurants", data.rejected_restaurants || 0);
    setText("totalOrders", data.total_orders || 0);
    setText("totalMessages", data.total_messages || 0);

    renderRecentApplications(data.recent_applications || []);
  } catch (error) {
    console.error("Dashboard load failed:", error);

    const recentApplications = document.getElementById("recentApplications");
    if (recentApplications) {
      recentApplications.innerHTML = `
        <div class="loading-box">
          Could not load dashboard data. Please check backend connection.
        </div>
      `;
    }
  }
}

function renderRecentApplications(applications) {
  const container = document.getElementById("recentApplications");
  if (!container) return;

  if (!applications.length) {
    container.innerHTML = `
      <div class="loading-box">No restaurant applications found yet.</div>
    `;
    return;
  }

  container.innerHTML = applications
    .map((item) => {
      const status = normalizeStatus(item.status);
      return `
        <div class="list-item">
          <div class="list-item-left">
            <h4>${escapeHtml(item.restaurant_name || "Unnamed Restaurant")}</h4>
            <p>
              ${escapeHtml(item.owner_full_name || "No owner name")} •
              ${escapeHtml(item.city || "No city")} •
              ${escapeHtml(formatDate(item.created_at))}
            </p>
          </div>
          <span class="badge badge-${status}">
            ${escapeHtml(capitalize(status))}
          </span>
        </div>
      `;
    })
    .join("");
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
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}