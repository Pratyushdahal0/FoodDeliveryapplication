console.log("[admin-cancellations.js] Loaded");

(function () {
  if (!localStorage.getItem("isAdminLoggedIn")) {
    window.location.href = "admin-login.html";
    return;
  }

  const API = "../../backend/controllers/CancellationController.php?action=cancellation_log";

  let allData = [];

  function adminLogout() {
    localStorage.removeItem("foodExpressCurrentAdmin");
    localStorage.removeItem("isAdminLoggedIn");
    localStorage.removeItem("authToken");
    window.location.href = "admin-login.html";
  }
  window.adminLogout = adminLogout;

  function showMessage(msg, type = "error") {
    const bar = document.getElementById("messageBar");
    if (!bar) return;
    bar.textContent = msg;
    bar.className = "message-bar " + type;
    bar.style.display = "block";
    setTimeout(() => { bar.style.display = "none"; }, 4000);
  }

  function updateStats(data) {
    document.getElementById("statTotal").textContent = data.length;
    document.getElementById("statCustomer").textContent =
      data.filter(r => r.cancelled_by === "customer").length;
    document.getElementById("statOwner").textContent =
      data.filter(r => r.cancelled_by === "restaurant-owner").length;
    document.getElementById("statRider").textContent =
      data.filter(r => r.cancelled_by === "delivery-rider").length;
  }

  function formatDate(str) {
    if (!str) return "—";
    const d = new Date(str);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function cancelledByLabel(val) {
    const map = {
      "customer": "Customer",
      "restaurant-owner": "Restaurant",
      "delivery-rider": "Rider",
      "admin": "Admin",
      "system": "System"
    };
    return map[val] || val || "—";
  }

  function renderTable(data) {
    const tbody = document.getElementById("cancellationsTableBody");
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="loading-state"><h3>No cancellations found</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(row => `
      <tr>
        <td><strong>${row.order_number || "—"}</strong></td>
        <td>
          <span class="status-badge ${row.cancelled_by === 'customer' ? 'status-pending' : row.cancelled_by === 'delivery-rider' ? 'status-preparing' : 'status-cancelled'}">
            ${cancelledByLabel(row.cancelled_by)}
          </span>
        </td>
        <td>${row.reason ? row.reason.substring(0, 60) + (row.reason.length > 60 ? "..." : "") : "No reason given"}</td>
        <td>${row.order_status_at_cancel || "—"}</td>
        <td>${Number(row.refund_eligible) ? '<span style="color:#16a34a;font-weight:700;">Yes</span>' : '<span style="color:#9ca3af;">No</span>'}</td>
        <td>${Number(row.refund_amount) > 0 ? "Rs. " + Number(row.refund_amount).toFixed(2) : "—"}</td>
        <td>${formatDate(row.cancelled_at || row.created_at)}</td>
      </tr>
    `).join("");
  }

  function applyFilters() {
    const search = document.getElementById("searchInput").value.trim().toLowerCase();
    const by = document.getElementById("cancelledByFilter").value;

    let filtered = allData;

    if (search) {
      filtered = filtered.filter(r =>
        (r.order_number || "").toLowerCase().includes(search) ||
        (r.reason || "").toLowerCase().includes(search)
      );
    }

    if (by !== "all") {
      filtered = filtered.filter(r => r.cancelled_by === by);
    }

    renderTable(filtered);
  }

  async function loadData() {
    try {
      const token = localStorage.getItem("authToken") || "";
      const resp = await fetch(API, {
        headers: { "Authorization": "Bearer " + token }
      });
      const result = await resp.json();

      if (!result.success) {
        showMessage(result.message || "Failed to load cancellations.");
        return;
      }

      allData = Array.isArray(result.data) ? result.data : [];
      updateStats(allData);
      applyFilters();
    } catch (err) {
      showMessage("Network error. Please try again.");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadData();

    document.getElementById("searchInput").addEventListener("input", applyFilters);
    document.getElementById("cancelledByFilter").addEventListener("change", applyFilters);
    document.getElementById("refreshBtn").addEventListener("click", loadData);
  });
})();