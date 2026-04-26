console.log("Rider history JS loaded");

document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  const main = document.querySelector(".main");

  if (menuToggle && sidebar && main) {
    menuToggle.addEventListener("click", () => {
      if (window.innerWidth <= 800) {
        sidebar.classList.toggle("show");
      } else {
        sidebar.classList.toggle("hide");
        main.classList.toggle("full");
      }
    });
  }

  const historyData = [
    {
      id: "#ORD-9421",
      restaurant: "Burger House",
      icon: "fa-burger",
      date: "Apr 26, 2026",
      time: "07:42 PM",
      earning: 110,
      status: "Delivered",
      pickup: "New Baneshwor, Kathmandu",
      dropoff: "Koteshwor, Kathmandu",
      distance: "2.4 km",
      duration: "18 mins",
      baseFare: 80,
      bonus: 30,
    },
    {
      id: "#ORD-9418",
      restaurant: "Momo Hub",
      icon: "fa-bowl-food",
      date: "Apr 26, 2026",
      time: "06:15 PM",
      earning: 95,
      status: "Delivered",
      pickup: "Thamel, Kathmandu",
      dropoff: "Lazimpat, Kathmandu",
      distance: "1.8 km",
      duration: "14 mins",
      baseFare: 75,
      bonus: 20,
    },
    {
      id: "#ORD-9405",
      restaurant: "Pizza Point",
      icon: "fa-pizza-slice",
      date: "Apr 25, 2026",
      time: "01:30 PM",
      earning: 0,
      status: "Cancelled",
      pickup: "Putalisadak, Kathmandu",
      dropoff: "Maitidevi, Kathmandu",
      distance: "1.2 km",
      duration: "Cancelled",
      baseFare: 0,
      bonus: 0,
    },
    {
      id: "#ORD-9399",
      restaurant: "Biryani House",
      icon: "fa-utensils",
      date: "Apr 25, 2026",
      time: "09:10 AM",
      earning: 120,
      status: "Delivered",
      pickup: "Boudha, Kathmandu",
      dropoff: "Chabahil, Kathmandu",
      distance: "2.9 km",
      duration: "22 mins",
      baseFare: 85,
      bonus: 35,
    },
  ];

  const tbody = document.getElementById("historyTableBody");
  const searchInput = document.getElementById("historySearch");
  const statusFilter = document.getElementById("statusFilter");

  const totalDelivered = document.getElementById("totalDelivered");
  const totalCancelled = document.getElementById("totalCancelled");
  const totalEarnings = document.getElementById("totalEarnings");
  const totalResults = document.getElementById("totalResults");
  const visibleCount = document.getElementById("visibleCount");

  const drawerOverlay = document.getElementById("drawerOverlay");
  const orderDrawer = document.getElementById("orderDrawer");
  const drawerClose = document.getElementById("drawerClose");

  function formatMoney(amount) {
    return `Rs. ${Number(amount).toLocaleString("en-IN")}`;
  }

  function getFilteredData() {
    const searchValue = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const statusValue = statusFilter ? statusFilter.value : "All";

    return historyData.filter((order) => {
      const matchesSearch =
        order.id.toLowerCase().includes(searchValue) ||
        order.restaurant.toLowerCase().includes(searchValue);

      const matchesStatus = statusValue === "All" || order.status === statusValue;

      return matchesSearch && matchesStatus;
    });
  }

  function renderHistory() {
    if (!tbody) return;

    const filteredData = getFilteredData();

    if (visibleCount) visibleCount.innerText = filteredData.length;
    if (totalResults) totalResults.innerText = historyData.length;

    if (!filteredData.length) {
      tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="6">No history found for this filter.</td>
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
          <tr data-order-id="${order.id}">
            <td data-label="Order">
              <span class="order-id">${order.id}</span>
            </td>

            <td data-label="Restaurant">
              <div class="restaurant-cell">
                <span class="restaurant-icon">
                  <i class="fa-solid ${order.icon}"></i>
                </span>
                <strong>${order.restaurant}</strong>
              </div>
            </td>

            <td data-label="Date & Time">
              <div class="date-cell">
                ${order.date}
                <small>${order.time}</small>
              </div>
            </td>

            <td data-label="Earnings" class="earning">
              ${formatMoney(order.earning)}
            </td>

            <td data-label="Status">
              <span class="status ${statusClass}">
                <i class="fa-solid ${statusIcon}"></i>
                ${order.status}
              </span>
            </td>

            <td data-label="Action">
              <button class="view-btn" data-view-id="${order.id}">
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
    const delivered = historyData.filter((order) => order.status === "Delivered");
    const cancelled = historyData.filter((order) => order.status === "Cancelled");
    const earnings = delivered.reduce((sum, order) => sum + order.earning, 0);

    if (totalDelivered) totalDelivered.innerText = delivered.length;
    if (totalCancelled) totalCancelled.innerText = cancelled.length;
    if (totalEarnings) totalEarnings.innerText = formatMoney(earnings);
    if (totalResults) totalResults.innerText = historyData.length;
  }

  function openDrawer(order) {
    if (!orderDrawer || !drawerOverlay) return;

    const statusClass = order.status.toLowerCase();
    const statusIcon =
      order.status === "Delivered" ? "fa-circle-check" : "fa-circle-xmark";

    document.getElementById("drawerOrderId").innerText = order.id;
    document.getElementById("drawerEarning").innerText = formatMoney(order.earning);
    document.getElementById("drawerRestaurant").innerText = order.restaurant;
    document.getElementById("drawerDate").innerText = `${order.date} • ${order.time}`;
    document.getElementById("drawerPickup").innerText = order.pickup;
    document.getElementById("drawerDropoff").innerText = order.dropoff;
    document.getElementById("drawerDistance").innerText = order.distance;
    document.getElementById("drawerDuration").innerText = order.duration;
    document.getElementById("drawerBaseFare").innerText = formatMoney(order.baseFare);
    document.getElementById("drawerBonus").innerText = formatMoney(order.bonus);
    document.getElementById("drawerTotal").innerText = formatMoney(order.earning);

    const drawerRestaurantIcon = document.getElementById("drawerRestaurantIcon");
    drawerRestaurantIcon.className = `fa-solid ${order.icon}`;

    const drawerStatus = document.getElementById("drawerStatus");
    drawerStatus.className = `status ${statusClass}`;
    drawerStatus.innerHTML = `
      <i class="fa-solid ${statusIcon}"></i>
      ${order.status}
    `;

    drawerOverlay.classList.add("show");
    orderDrawer.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    if (!orderDrawer || !drawerOverlay) return;

    drawerOverlay.classList.remove("show");
    orderDrawer.classList.remove("show");
    document.body.style.overflow = "";
  }

  function attachRowEvents() {
    const rows = document.querySelectorAll("#historyTableBody tr[data-order-id]");
    const viewButtons = document.querySelectorAll(".view-btn");

    rows.forEach((row) => {
      row.addEventListener("click", () => {
        const orderId = row.dataset.orderId;
        const order = historyData.find((item) => item.id === orderId);
        if (order) openDrawer(order);
      });
    });

    viewButtons.forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();

        const orderId = btn.dataset.viewId;
        const order = historyData.find((item) => item.id === orderId);

        if (order) openDrawer(order);
      });
    });
  }

  function downloadCSV() {
    const header =
      "Order ID,Restaurant,Date,Time,Earnings,Status,Pickup,Dropoff,Distance,Duration\n";

    const rows = historyData
      .map((order) => {
        return `${order.id},${order.restaurant},${order.date},${order.time},${formatMoney(order.earning)},${order.status},${order.pickup},${order.dropoff},${order.distance},${order.duration}`;
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

  if (searchInput) searchInput.addEventListener("input", renderHistory);
  if (statusFilter) statusFilter.addEventListener("change", renderHistory);

  const downloadBtn = document.getElementById("downloadCsv");
  if (downloadBtn) downloadBtn.addEventListener("click", downloadCSV);

  if (drawerClose) drawerClose.addEventListener("click", closeDrawer);
  if (drawerOverlay) drawerOverlay.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  updateSummary();
  renderHistory();
});