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

  const toggleBtn = document.getElementById("toggleStatus");
  const onlinePill = document.querySelector(".online-pill");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const isOnline = toggleBtn.innerText === "Go Offline";

      toggleBtn.innerText = isOnline ? "Go Online" : "Go Offline";

      if (onlinePill) {
        onlinePill.innerHTML = isOnline
          ? `<span style="background:#999"></span> Offline`
          : `<span></span> Online`;
      }
    });
  }

  function formatMoney(amount) {
    return `Rs. ${Number(amount).toLocaleString("en-IN")}`;
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
    },
    {
      id: "#ORD-9418",
      restaurant: "Momo Hub",
      icon: "fa-bowl-food",
      date: "Apr 26, 2026",
      time: "06:15 PM",
      earning: 95,
      status: "Delivered",
    },
    {
      id: "#ORD-9405",
      restaurant: "Pizza Point",
      icon: "fa-pizza-slice",
      date: "Apr 25, 2026",
      time: "01:30 PM",
      earning: 0,
      status: "Cancelled",
    },
    {
      id: "#ORD-9399",
      restaurant: "Biryani House",
      icon: "fa-utensils",
      date: "Apr 25, 2026",
      time: "09:10 AM",
      earning: 120,
      status: "Delivered",
    },
  ];

  const tbody = document.getElementById("historyTableBody");

  function renderHistory() {
    if (!tbody) return;

    tbody.innerHTML = historyData
      .map((order) => {
        const statusClass = order.status.toLowerCase();

        return `
          <tr>
            <td><strong>${order.id}</strong></td>

            <td>
              <div class="restaurant-cell">
                <span class="restaurant-icon">
                  <i class="fa-solid ${order.icon}"></i>
                </span>
                ${order.restaurant}
              </div>
            </td>

            <td>
              <div class="date-cell">
                ${order.date}
                <small>${order.time}</small>
              </div>
            </td>

            <td class="earning">${formatMoney(order.earning)}</td>

            <td>
              <span class="status ${statusClass}">
                ${order.status}
              </span>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function updateSummary() {
    const delivered = historyData.filter((order) => order.status === "Delivered");
    const cancelled = historyData.filter((order) => order.status === "Cancelled");
    const visibleEarnings = delivered.reduce((sum, order) => sum + order.earning, 0);

    const baseDelivered = 139;
    const baseEarnings = 18450;
    const baseResults = 141;

    const totalDelivered = document.getElementById("totalDelivered");
    const totalCancelled = document.getElementById("totalCancelled");
    const totalEarnings = document.getElementById("totalEarnings");
    const totalResults = document.getElementById("totalResults");

    if (totalDelivered) totalDelivered.innerText = baseDelivered + delivered.length;
    if (totalCancelled) totalCancelled.innerText = cancelled.length;
    if (totalEarnings) totalEarnings.innerText = formatMoney(baseEarnings + visibleEarnings);
    if (totalResults) totalResults.innerText = baseResults + historyData.length;
  }

  function downloadCSV() {
    const header = "Order ID,Restaurant,Date,Time,Earnings,Status\n";

    const rows = historyData
      .map((order) => {
        return `${order.id},${order.restaurant},${order.date},${order.time},${formatMoney(order.earning)},${order.status}`;
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

  renderHistory();
  updateSummary();

  const downloadBtn = document.getElementById("downloadCsv");

  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadCSV);
  }
});