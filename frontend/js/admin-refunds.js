console.log("[admin-refunds.js] Loaded");

(function () {
  if (!localStorage.getItem("isAdminLoggedIn")) {
    window.location.href = "admin-login.html";
    return;
  }

  const API = "../../backend/controllers/CancellationController.php";
  let allData = [];
  let pendingAction = null;

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

  function formatDate(str) {
    if (!str) return "—";
    const d = new Date(str);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function statusBadge(status) {
    const map = {
      pending:   "status-pending",
      approved:  "status-confirmed",
      rejected:  "status-cancelled",
      processed: "status-delivered",
    };
    return `<span class="status-badge ${map[status] || ''}">${status || "—"}</span>`;
  }

  function updateStats(data) {
    document.getElementById("statTotal").textContent = data.length;
    document.getElementById("statPending").textContent = data.filter(r => r.status === "pending").length;
    document.getElementById("statApproved").textContent = data.filter(r => r.status === "approved").length;
    document.getElementById("statProcessed").textContent = data.filter(r => r.status === "processed").length;
  }

  function renderTable(data) {
    const tbody = document.getElementById("refundsTableBody");
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="loading-state"><h3>No refunds found</h3></div></td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(row => `
      <tr>
        <td><strong>${row.order_number || "—"}</strong></td>
        <td><strong>Rs. ${Number(row.amount || 0).toFixed(2)}</strong></td>
        <td>${row.refund_type || "full"}</td>
        <td>${row.payment_gateway || "—"}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${row.reason ? row.reason.substring(0, 50) + (row.reason.length > 50 ? "..." : "") : "—"}</td>
        <td>${formatDate(row.created_at)}</td>
        <td>
          ${row.status === "pending" ? `
            <button class="action-btn btn-approve" onclick="openRefundAction(${row.id}, 'approved', '${row.order_number}', ${Number(row.amount || 0)})">
              <i class="fa-solid fa-check"></i> Approve
            </button>
            <button class="action-btn btn-reject" onclick="openRefundAction(${row.id}, 'rejected', '${row.order_number}', ${Number(row.amount || 0)})" style="margin-left:6px;">
              <i class="fa-solid fa-xmark"></i> Reject
            </button>
          ` : `<span style="color:#9ca3af;font-size:13px;">No action</span>`}
        </td>
      </tr>
    `).join("");
  }

  function applyFilters() {
    const search = document.getElementById("searchInput").value.trim().toLowerCase();
    const status = document.getElementById("statusFilter").value;

    let filtered = allData;

    if (search) {
      filtered = filtered.filter(r =>
        (r.order_number || "").toLowerCase().includes(search)
      );
    }

    if (status !== "all") {
      filtered = filtered.filter(r => r.status === status);
    }

    renderTable(filtered);
  }

  async function loadData() {
    try {
      const token = localStorage.getItem("authToken") || "";
      const resp = await fetch(`${API}?action=refund_log`, {
        headers: { "Authorization": "Bearer " + token }
      });
      const result = await resp.json();

      if (!result.success) {
        showMessage(result.message || "Failed to load refunds.");
        return;
      }

      allData = Array.isArray(result.data) ? result.data : [];
      updateStats(allData);
      applyFilters();
    } catch (err) {
      showMessage("Network error. Please try again.");
    }
  }

  window.openRefundAction = function(id, newStatus, orderNumber, amount) {
    pendingAction = { id, newStatus };
    const modal = document.getElementById("refundModal");
    document.getElementById("refundModalTitle").textContent =
      newStatus === "approved" ? "Approve Refund" : "Reject Refund";
    document.getElementById("refundModalMsg").textContent =
      `${newStatus === "approved" ? "Approve" : "Reject"} refund of Rs. ${amount.toFixed(2)} for order ${orderNumber}?`;
    document.getElementById("refundNotes").value = "";
    modal.classList.add("show");
  };

  async function processRefund() {
    if (!pendingAction) return;

    const notes = document.getElementById("refundNotes").value.trim();
    const admin = JSON.parse(localStorage.getItem("foodExpressCurrentAdmin") || "{}");
    const token = localStorage.getItem("authToken") || "";

    try {
      const resp = await fetch(`${API}?action=refund_update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
          refund_log_id: pendingAction.id,
          status: pendingAction.newStatus,
          processed_by: admin.id || null,
          notes
        })
      });

      const result = await resp.json();
      document.getElementById("refundModal").classList.remove("show");

      if (result.success) {
        showMessage("Refund " + pendingAction.newStatus + " successfully.", "success");
        loadData();
      } else {
        showMessage(result.message || "Failed to update refund.");
      }
    } catch (err) {
      showMessage("Network error. Please try again.");
    }

    pendingAction = null;
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadData();

    document.getElementById("searchInput").addEventListener("input", applyFilters);
    document.getElementById("statusFilter").addEventListener("change", applyFilters);
    document.getElementById("refreshBtn").addEventListener("click", loadData);

    document.getElementById("confirmRefundBtn").addEventListener("click", processRefund);
    document.getElementById("cancelRefundBtn").addEventListener("click", () => {
      document.getElementById("refundModal").style.display = "none";
      pendingAction = null;
    });
    document.getElementById("closeRefundModal").addEventListener("click", () => {
      document.getElementById("refundModal").style.display = "none";
      pendingAction = null;
    });
  });
})();