console.log("[admin-dashboard.js] Loaded");

(function () {
  const BASE_API    = "../../backend/controllers/AdminDashboardController.php";
  const STATS_API   = BASE_API + "?action=dashboard_stats";
  const REVENUE_API = BASE_API + "?action=revenue_stats";
  const PENDING_API = BASE_API + "?action=pending_approvals";

  let refreshTimer = null;
  let revenueChart = null;

  /* ── auth guard ── */
  if (!localStorage.getItem("isAdminLoggedIn")) {
    window.location.href = "admin-login.html";
    return;
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadDashboard();
    document.getElementById("refreshBtn")?.addEventListener("click", () => {
      loadDashboard();
    });
    refreshTimer = setInterval(loadDashboard, 30_000);
  });

  /* ── main fetch ── */
  async function loadDashboard() {
    const token = localStorage.getItem("authToken");
    const headers = { "Authorization": `Bearer ${token}` };

    try {
      const [statsRes, revenueRes, pendingRes] = await Promise.all([
        fetch(STATS_API,   { cache: "no-store", headers }),
        fetch(REVENUE_API, { cache: "no-store", headers }),
        fetch(PENDING_API, { cache: "no-store", headers }),
      ]);

      const statsPayload   = await statsRes.json();
      const revenuePayload = await revenueRes.json();
      const pendingPayload = await pendingRes.json();

      if (!statsPayload?.success) {
        showMessage(statsPayload?.message || "Failed to load dashboard data.", "error");
        return;
      }

      clearMessage();
      renderStats(statsPayload.data);
      renderRecentOrders(statsPayload.data.recent_orders || []);

      if (revenuePayload?.success && Array.isArray(revenuePayload.data)) {
        renderRevenueChart(revenuePayload.data);
      }

      if (pendingPayload?.success) {
        renderPendingRestaurants(pendingPayload.data.pending_restaurants || []);
        renderPendingUsers(pendingPayload.data.pending_users || []);
      }

    } catch (err) {
      console.error("[admin-dashboard.js] Fetch error:", err);
      showMessage("Could not reach the server. Retrying in 30 seconds.", "error");
    }
  }

  /* ── stats ── */
  function renderStats(data) {
    setText("statTotalOrders",        fmt(data.total_orders));
    setText("statTotalRevenue",       "Rs " + fmtMoney(data.total_revenue));
    setText("statActiveRestaurants",  fmt(data.active_restaurants));
    setText("statTotalUsers",         fmt(data.total_users));
    setText("statPendingRestaurants", fmt(data.pending_restaurants));
    setText("statCancelledToday",     fmt(data.cancelled_today));
  }

  /* ── revenue chart ── */
  function renderRevenueChart(rows) {
    const canvas = document.getElementById("revenueChart");
    if (!canvas) return;

    const labels = rows.map((r) =>
      new Date(r.day).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    );
    const values = rows.map((r) => parseFloat(r.revenue) || 0);

    if (revenueChart) {
      revenueChart.data.labels = labels;
      revenueChart.data.datasets[0].data = values;
      revenueChart.update();
      return;
    }

    revenueChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Revenue (Rs)",
          data: values,
          backgroundColor: "rgba(229,57,53,0.15)",
          borderColor: "rgba(229,57,53,0.85)",
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => " Rs " + fmtMoney(ctx.parsed.y),
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(0,0,0,0.04)" },
            ticks: {
              callback: (v) => "Rs " + fmtMoney(v),
              font: { size: 11 },
            },
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } },
          },
        },
      },
    });
  }

  /* ── recent orders ── */
  function renderRecentOrders(orders) {
    const tbody = document.getElementById("recentOrdersBody");
    if (!tbody) return;

    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>No orders yet</h3><p>Orders placed on the platform will appear here.</p></div></td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map((o) => {
      const badge = statusBadge(o.status);
      const date  = o.created_at
        ? new Date(o.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : "—";

      return `
        <tr>
          <td><strong>${esc(o.order_number || "#" + o.id)}</strong></td>
          <td>
            <div style="font-weight:600">${esc(o.customer_name || "—")}</div>
            <div style="color:var(--text-muted);font-size:0.8rem">${esc(o.customer_email || "")}</div>
          </td>
          <td>${esc(o.restaurant_name || "—")}</td>
          <td>${badge}</td>
          <td><strong>Rs ${fmtMoney(o.total)}</strong></td>
          <td style="color:var(--text-muted);font-size:0.85rem">${date}</td>
        </tr>`;
    }).join("");
  }

  /* ── pending restaurants ── */
  function renderPendingRestaurants(restaurants) {
    const el = document.getElementById("pendingRestaurantsList");
    if (!el) return;

    if (!restaurants.length) {
      el.innerHTML = `<div class="empty-state"><h3>No pending restaurants</h3><p>All caught up! ✅</p></div>`;
      return;
    }

    el.innerHTML = restaurants.slice(0, 5).map((r) => {
      const initials = (r.restaurant_name || "R").substring(0, 2).toUpperCase();
      return `
        <div class="pending-item">
          <div class="pending-avatar">${esc(initials)}</div>
          <div class="pending-info">
            <strong>${esc(r.restaurant_name || "Unnamed")}</strong>
            <span>${esc(r.location || r.city || "No location")}</span>
          </div>
          <span class="pending-badge">Pending</span>
        </div>`;
    }).join("");
  }

  /* ── pending users ── */
  function renderPendingUsers(users) {
    const el = document.getElementById("pendingUsersList");
    if (!el) return;

    if (!users.length) {
      el.innerHTML = `<div class="empty-state"><h3>No pending users</h3><p>All caught up! ✅</p></div>`;
      return;
    }

    el.innerHTML = users.slice(0, 5).map((u) => {
      const initials = (u.name || "U").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
      const roleLabel = u.role === "restaurant-owner" ? "Owner" : "Rider";
      return `
        <div class="pending-item">
          <div class="pending-avatar">${esc(initials)}</div>
          <div class="pending-info">
            <strong>${esc(u.name || "Unknown")}</strong>
            <span>${esc(u.email || "")} · ${roleLabel}</span>
          </div>
          <span class="pending-badge">Pending</span>
        </div>`;
    }).join("");
  }

  /* ── helpers ── */
  function statusBadge(status) {
    const s   = String(status || "").toLowerCase();
    let cls   = "status-pending";
    if (["delivered", "completed"].includes(s))  cls = "status-delivered";
    else if (["cancelled", "rejected"].includes(s)) cls = "status-cancelled";
    else if (s === "preparing") cls = "status-preparing";
    else if (s === "out_for_delivery") cls = "status-out_for_delivery";
    return `<span class="status-badge ${cls}">${esc(s.replace(/_/g, " "))}</span>`;
  }

  function fmt(n) { return n != null ? Number(n).toLocaleString() : "—"; }

  function fmtMoney(n) {
    const v = parseFloat(n) || 0;
    return v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function esc(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showMessage(msg, type) {
    const bar = document.getElementById("messageBar");
    if (!bar) return;
    bar.textContent = msg;
    bar.className = `message-bar show ${type}`;
  }

  function clearMessage() {
    const bar = document.getElementById("messageBar");
    if (!bar) return;
    bar.className   = "message-bar";
    bar.textContent = "";
  }

  window.adminLogout = function () {
    clearInterval(refreshTimer);
    localStorage.removeItem("foodExpressCurrentAdmin");
    localStorage.removeItem("isAdminLoggedIn");
    localStorage.removeItem("authToken");
    window.location.href = "admin-login.html";
  };
})();