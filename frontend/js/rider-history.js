console.log("[rider-history.js] Loaded - real rider history");

/* ================================
   STORAGE KEYS
================================ */

const RIDER_HISTORY_KEY = "foodexpress_rider_history";
const RIDER_EARNINGS_KEY = "foodexpress_rider_earnings";

/* ================================
   INIT
================================ */

document.addEventListener("DOMContentLoaded", () => {
  bindSidebarToggle();
  updateRiderTopbarIdentity();
  updateDateRangeLabel();

  renderHistoryPage();

  const searchInput = document.getElementById("historySearch");
  const statusFilter = document.getElementById("statusFilter");
  const downloadBtn = document.getElementById("downloadCsv");

  searchInput?.addEventListener("input", renderHistoryPage);
  statusFilter?.addEventListener("change", renderHistoryPage);
  downloadBtn?.addEventListener("click", downloadCSV);

  document.getElementById("drawerClose")?.addEventListener("click", closeDrawer);
  document.getElementById("drawerOverlay")?.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === RIDER_HISTORY_KEY || event.key === RIDER_EARNINGS_KEY) {
      renderHistoryPage();
    }
  });
});

/* ================================
   BASIC HELPERS
================================ */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`[rider-history.js] Could not parse ${key}`, error);
    return fallback;
  }
}

function writeText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMoney(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatDate(dateValue) {
  const date = parseDate(dateValue);
  if (!date) return "Recently";

  return date.toLocaleDateString("en-NP", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatTime(dateValue) {
  const date = parseDate(dateValue);
  if (!date) return "";

  return date.toLocaleTimeString("en-NP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ================================
   SIDEBAR + IDENTITY
================================ */

function bindSidebarToggle() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  const main = document.querySelector(".main");

  if (!menuToggle || !sidebar || !main) return;

  menuToggle.addEventListener("click", () => {
    if (window.innerWidth <= 800) {
      sidebar.classList.toggle("show");
    } else {
      sidebar.classList.toggle("hide");
      main.classList.toggle("full");
    }
  });
}

function getCurrentRider() {
  const storedRider =
    readJson("foodExpressCurrentRider", null) ||
    readJson("foodExpressRiderProfile", null) ||
    readJson("riderProfile", null) ||
    {};

  const name =
    localStorage.getItem("riderName") ||
    localStorage.getItem("foodExpressRiderName") ||
    storedRider.name ||
    storedRider.fullName ||
    storedRider.full_name ||
    storedRider.riderName ||
    storedRider.rider_name ||
    "";

  const email =
    localStorage.getItem("riderEmail") ||
    localStorage.getItem("foodExpressRiderEmail") ||
    storedRider.email ||
    storedRider.riderEmail ||
    storedRider.rider_email ||
    "";

  const phone =
    localStorage.getItem("riderPhone") ||
    localStorage.getItem("foodExpressRiderPhone") ||
    storedRider.phone ||
    storedRider.phoneNumber ||
    storedRider.phone_number ||
    storedRider.riderPhone ||
    storedRider.rider_phone ||
    "";

  const id =
    storedRider.id ||
    storedRider.rider_id ||
    localStorage.getItem("riderUserId") ||
    localStorage.getItem("foodExpressRiderId") ||
    1;

  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim();

  return {
    id: Number(id || 1),
    name:
      cleanName && !/owner/i.test(cleanName)
        ? cleanName
        : "FoodExpress Rider",
    email:
      cleanEmail && !/owner/i.test(cleanEmail)
        ? cleanEmail
        : "rider@foodexpress.local",
    phone: String(phone || "").trim(),
    image:
      storedRider.profileImage ||
      storedRider.profile_image ||
      storedRider.avatar ||
      storedRider.photo ||
      "",
  };
}

function updateRiderTopbarIdentity() {
  const rider = getCurrentRider();

  const profileName = document.querySelector(".rider-profile h4");
  const profileId = document.querySelector(".rider-profile p");
  const profileImg = document.querySelector(".rider-profile img");

  if (profileName) profileName.textContent = rider.name;
  if (profileId) profileId.textContent = `Rider ID: RID-${String(rider.id).padStart(4, "0")}`;
  if (profileImg && rider.image) profileImg.src = rider.image;
}

function updateDateRangeLabel() {
  const btn = document.querySelector(".date-btn");
  if (!btn) return;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);

  const startLabel = start.toLocaleDateString("en-NP", {
    month: "short",
    day: "2-digit",
  });

  const endLabel = now.toLocaleDateString("en-NP", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  btn.innerHTML = `
    <i class="fa-regular fa-calendar"></i>
    ${startLabel} - ${endLabel}
  `;
}

/* ================================
   HISTORY DATA
================================ */

function getRawHistory() {
  const history = readJson(RIDER_HISTORY_KEY, []);
  return Array.isArray(history) ? history : [];
}

function normalizeHistoryOrder(order) {
  const dateValue =
    order.rawDate ||
    order.deliveredAt ||
    order.delivered_at ||
    order.updatedAt ||
    order.updated_at ||
    order.createdAt ||
    order.created_at ||
    order.date ||
    "";

  const statusRaw =
    order.status ||
    order.deliveryStatus ||
    order.delivery_status ||
    "Delivered";

  const status = formatStatus(statusRaw);

  const earning = Number(
    order.earning ||
      order.amount ||
      order.rider_earning ||
      order.delivery_earning ||
      0
  );

  const baseFare =
    Number(order.baseFare || order.base_fare || 0) ||
    Math.round(earning * 0.65);

  const bonus =
    Number(order.bonus || order.distanceBonus || order.distance_bonus || 0) ||
    Math.max(0, earning - baseFare);

  const orderId =
    order.id ||
    order.orderId ||
    order.order_id ||
    order.orderNumber ||
    order.order_number ||
    "ORDER";

  return {
    id: String(orderId).startsWith("#") ? String(orderId) : `#${orderId}`,
    restaurant:
      order.restaurant ||
      order.restaurantName ||
      order.restaurant_name ||
      "Restaurant",
    icon: order.icon || "fa-bag-shopping",
    customer:
      order.customer ||
      order.customerName ||
      order.customer_name ||
      "Customer",
    date: formatDate(dateValue),
    time: formatTime(dateValue),
    rawDate: dateValue,
    earning,
    status,
    pickup:
      order.pickup ||
      order.restaurantAddress ||
      order.restaurant_address ||
      "Restaurant pickup location",
    dropoff:
      order.dropoff ||
      order.address ||
      order.deliveryAddress ||
      order.delivery_address ||
      "Customer delivery location",
    distance: order.distance || "2.5 km",
    duration: order.duration || order.eta || "Completed",
    baseFare,
    bonus,
  };
}

function formatStatus(status) {
  const clean = String(status || "Delivered").toLowerCase();

  if (clean.includes("cancel")) return "Cancelled";
  if (clean.includes("deliver")) return "Delivered";

  return clean
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getHistoryData() {
  return getRawHistory()
    .map(normalizeHistoryOrder)
    .sort((a, b) => {
      const bDate = parseDate(b.rawDate)?.getTime() || 0;
      const aDate = parseDate(a.rawDate)?.getTime() || 0;
      return bDate - aDate;
    });
}

function getFilteredData() {
  const searchInput = document.getElementById("historySearch");
  const statusFilter = document.getElementById("statusFilter");

  const searchValue = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const statusValue = statusFilter ? statusFilter.value : "All";

  return getHistoryData().filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchValue) ||
      order.restaurant.toLowerCase().includes(searchValue) ||
      order.customer.toLowerCase().includes(searchValue);

    const matchesStatus = statusValue === "All" || order.status === statusValue;

    return matchesSearch && matchesStatus;
  });
}

/* ================================
   RENDER
================================ */

function renderHistoryPage() {
  updateRiderTopbarIdentity();
  updateSummary();
  renderHistory();
  updateFooter();
}

function renderHistory() {
  const tbody = document.getElementById("historyTableBody");
  if (!tbody) return;

  const allData = getHistoryData();
  const filteredData = getFilteredData();

  writeText("visibleCount", filteredData.length);
  writeText("totalResults", allData.length);

  if (!filteredData.length) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">
          No rider history found yet. Delivered orders will appear here after completion.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredData
    .map((order) => {
      const statusClass = order.status.toLowerCase();
      const statusIcon =
        order.status === "Delivered" ? "fa-circle-check" : "fa-circle-xmark";

      return `
        <tr data-order-id="${escapeHtml(order.id)}">
          <td data-label="Order">
            <span class="order-id">${escapeHtml(order.id)}</span>
          </td>

          <td data-label="Restaurant">
            <div class="restaurant-cell">
              <span class="restaurant-icon">
                <i class="fa-solid ${escapeHtml(order.icon)}"></i>
              </span>
              <div>
                <strong>${escapeHtml(order.restaurant)}</strong>
                <small>${escapeHtml(order.customer)}</small>
              </div>
            </div>
          </td>

          <td data-label="Date & Time">
            <div class="date-cell">
              ${escapeHtml(order.date)}
              <small>${escapeHtml(order.time || "Recently")}</small>
            </div>
          </td>

          <td data-label="Earnings" class="earning">
            ${formatMoney(order.earning)}
          </td>

          <td data-label="Status">
            <span class="status ${escapeHtml(statusClass)}">
              <i class="fa-solid ${escapeHtml(statusIcon)}"></i>
              ${escapeHtml(order.status)}
            </span>
          </td>

          <td data-label="Action">
            <button class="view-btn" data-view-id="${escapeHtml(order.id)}">
              View Details
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  attachRowEvents();
}

function updateSummary() {
  const historyData = getHistoryData();

  const delivered = historyData.filter((order) => order.status === "Delivered");
  const cancelled = historyData.filter((order) => order.status === "Cancelled");
  const earnings = delivered.reduce((sum, order) => sum + Number(order.earning || 0), 0);

  writeText("totalDelivered", delivered.length);
  writeText("totalCancelled", cancelled.length);
  writeText("totalEarnings", formatMoney(earnings));
  writeText("totalResults", historyData.length);
}

function updateFooter() {
  const footerText = document.querySelector(".table-footer p");
  const pagination = document.querySelector(".pagination");
  const filtered = getFilteredData();

  if (footerText) {
    footerText.textContent = filtered.length
      ? `Showing ${filtered.length} record${filtered.length === 1 ? "" : "s"}`
      : "No records to show";
  }

  if (pagination) {
    pagination.style.display = "none";
  }
}

/* ================================
   DRAWER
================================ */

function openDrawer(order) {
  const orderDrawer = document.getElementById("orderDrawer");
  const drawerOverlay = document.getElementById("drawerOverlay");

  if (!orderDrawer || !drawerOverlay) return;

  const statusClass = order.status.toLowerCase();
  const statusIcon =
    order.status === "Delivered" ? "fa-circle-check" : "fa-circle-xmark";

  writeText("drawerOrderId", order.id);
  writeText("drawerEarning", formatMoney(order.earning));
  writeText("drawerRestaurant", order.restaurant);
  writeText("drawerDate", `${order.date} • ${order.time || "Recently"}`);
  writeText("drawerPickup", order.pickup);
  writeText("drawerDropoff", order.dropoff);
  writeText("drawerDistance", order.distance);
  writeText("drawerDuration", order.duration);
  writeText("drawerBaseFare", formatMoney(order.baseFare));
  writeText("drawerBonus", formatMoney(order.bonus));
  writeText("drawerTotal", formatMoney(order.earning));

  const drawerRestaurantIcon = document.getElementById("drawerRestaurantIcon");
  if (drawerRestaurantIcon) {
    drawerRestaurantIcon.className = `fa-solid ${order.icon}`;
  }

  const drawerStatus = document.getElementById("drawerStatus");
  if (drawerStatus) {
    drawerStatus.className = `status ${statusClass}`;
    drawerStatus.innerHTML = `
      <i class="fa-solid ${statusIcon}"></i>
      ${escapeHtml(order.status)}
    `;
  }

  drawerOverlay.classList.add("show");
  orderDrawer.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  document.getElementById("drawerOverlay")?.classList.remove("show");
  document.getElementById("orderDrawer")?.classList.remove("show");
  document.body.style.overflow = "";
}

function attachRowEvents() {
  const rows = document.querySelectorAll("#historyTableBody tr[data-order-id]");
  const viewButtons = document.querySelectorAll(".view-btn");

  rows.forEach((row) => {
    row.addEventListener("click", () => {
      const orderId = row.dataset.orderId;
      const order = getFilteredData().find((item) => item.id === orderId);
      if (order) openDrawer(order);
    });
  });

  viewButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();

      const orderId = btn.dataset.viewId;
      const order = getFilteredData().find((item) => item.id === orderId);

      if (order) openDrawer(order);
    });
  });
}

/* ================================
   CSV
================================ */

function downloadCSV() {
  const data = getFilteredData();

  if (!data.length) {
    alert("No history records available to export.");
    return;
  }

  const header =
    "Order ID,Restaurant,Customer,Date,Time,Earnings,Status,Pickup,Dropoff,Distance,Duration\n";

  const rows = data
    .map((order) => {
      return [
        order.id,
        order.restaurant,
        order.customer,
        order.date,
        order.time,
        formatMoney(order.earning),
        order.status,
        order.pickup,
        order.dropoff,
        order.distance,
        order.duration,
      ]
        .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
        .join(",");
    })
    .join("\n");

  const csv = header + rows;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "foodexpress-rider-history.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}