/* ================= RIDER EARNINGS JS - FINAL PRO VERSION ================= */

console.log("Rider earnings FINAL PRO JS loaded");

const STORAGE_KEY = "foodexpress_rider_earnings";
let earningsChart = null;

const defaultEarningsData = {
  todayEarnings: 825,
  weekEarnings: 3420,
  availableBalance: 2480,
  pendingPayout: 940,
  lastPayoutAt: "2026-04-21T09:00:00",

  totalDeliveries: 30,
  weeklyTarget: 40,
  onlineHours: "35h 20m",
  completionRate: 94,

  breakdown: {
    basePay: 1850,
    distancePay: 720,
    bonus: 500,
    tips: 420,
    deductions: 70,
  },

  chart: [
    { day: "Mon", amount: 420 },
    { day: "Tue", amount: 610 },
    { day: "Wed", amount: 380 },
    { day: "Thu", amount: 825 },
    { day: "Fri", amount: 720 },
    { day: "Sat", amount: 465 },
    { day: "Sun", amount: 120 },
  ],

  monthlyChart: [
    { day: "W1", amount: 2450 },
    { day: "W2", amount: 3120 },
    { day: "W3", amount: 2850 },
    { day: "W4", amount: 3420 },
  ],

  transactions: [
    {
      title: "Order #ORD-9421 Delivered",
      date: "Apr 26, 2026 • 07:42 PM",
      amount: 110,
      type: "earning",
      status: "Completed",
    },
    {
      title: "Order #ORD-9418 Delivered",
      date: "Apr 26, 2026 • 06:15 PM",
      amount: 95,
      type: "earning",
      status: "Completed",
    },
    {
      title: "Weekly Boost Bonus",
      date: "Apr 25, 2026 • 11:30 PM",
      amount: 500,
      type: "bonus",
      status: "Bonus",
    },
    {
      title: "Payout to Bank",
      date: "Apr 21, 2026 • 09:00 AM",
      amount: -1200,
      type: "payout",
      status: "Processed",
    },
  ],
};

document.addEventListener("DOMContentLoaded", () => {
  seedDataIfEmpty();
  renderEarningsPage();

  setInterval(() => {
    const modal = document.getElementById("withdrawModal");
    if (!modal?.classList.contains("show")) {
      updateLastPayoutOnly();
    }
  }, 30000);

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      renderEarningsPage();
      createToast("Earnings updated live.");
    }
  });

  window.addEventListener("focus", () => {
  updateLastPayoutOnly();
});

  document.getElementById("withdrawBtn")?.addEventListener("click", openWithdrawModal);
  document.getElementById("cashoutBtn")?.addEventListener("click", openWithdrawModal);

  document.getElementById("closeWithdrawBtn")?.addEventListener("click", closeWithdrawModal);
  document.getElementById("cancelWithdrawBtn")?.addEventListener("click", closeWithdrawModal);
  document.getElementById("confirmWithdrawBtn")?.addEventListener("click", confirmWithdraw);

  const withdrawInput = document.getElementById("withdrawAmount");
  withdrawInput?.addEventListener("input", () => {
    const value = Number(withdrawInput.value);
    const data = getEarningsData();

    if (!value || value <= 0 || value > data.availableBalance) {
      withdrawInput.style.borderColor = "#dc3545";
    } else {
      withdrawInput.style.borderColor = "#ff4d1c";
    }
  });

  document.getElementById("withdrawModal")?.addEventListener("click", (e) => {
    if (e.target.id === "withdrawModal") closeWithdrawModal();
  });

  document.querySelectorAll(".toggle-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".toggle-tabs button").forEach((item) => {
        item.classList.remove("active");
      });

      btn.classList.add("active");

      const data = getEarningsData();
      const type = btn.dataset.chart || btn.innerText.trim().toLowerCase();

      if (type === "monthly") {
        renderChart(data.monthlyChart || defaultEarningsData.monthlyChart);
      } else {
        renderChart(data.chart);
      }
    });
  });
});

/* ================= DATA ================= */

function seedDataIfEmpty() {
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultEarningsData));
    return;
  }

  const data = getEarningsData();

  if (!data.lastPayoutAt) {
    data.lastPayoutAt = defaultEarningsData.lastPayoutAt;
    saveEarningsData(data);
  }
}

function getEarningsData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultEarningsData;
  } catch (error) {
    console.error("Earnings data error:", error);
    return defaultEarningsData;
  }
}

function saveEarningsData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/* ================= MAIN RENDER ================= */

function renderEarningsPage() {
  const data = getEarningsData();

  const avgPerOrder =
    data.totalDeliveries > 0
      ? Math.round(data.weekEarnings / data.totalDeliveries)
      : 0;

  animateMoney("todayEarnings", data.todayEarnings);
  animateMoney("weekEarnings", data.weekEarnings);
  animateMoney("availableBalance", data.availableBalance);
  animateMoney("pendingPayout", data.pendingPayout);

  animateMoney("cashAvailable", data.availableBalance);
  animateMoney("cashPending", data.pendingPayout);

  setText("lastPayoutDate", formatRelativeTime(data.lastPayoutAt));
  setText("modalAvailableBalance", formatMoney(data.availableBalance));

  animateNumber("totalDeliveries", data.totalDeliveries);
  animateMoney("avgPerOrder", avgPerOrder);

  setText("onlineHours", data.onlineHours);
  setText("completionRate", `${data.completionRate}%`);

  animateMoney("basePay", data.breakdown.basePay);
  animateMoney("distancePay", data.breakdown.distancePay);
  animateMoney("bonusPay", data.breakdown.bonus);
  animateMoney("tipsPay", data.breakdown.tips);
  setText("deductions", `- ${formatMoney(data.breakdown.deductions)}`);

  renderBonus(data);
  renderInsights(data);
  renderChart(data.chart);
  renderTransactions(data.transactions);
}

function updateLastPayoutOnly() {
  const data = getEarningsData();
  setText("lastPayoutDate", formatRelativeTime(data.lastPayoutAt));
}

/* ================= INSIGHTS ================= */

function renderInsights(data) {
  if (!data.chart || data.chart.length === 0) return;

  let best = data.chart[0];
  let worst = data.chart[0];

  data.chart.forEach((day) => {
    if (day.amount > best.amount) best = day;
    if (day.amount < worst.amount) worst = day;
  });

  const remainingOrders = Math.max(data.weeklyTarget - data.totalDeliveries, 0);

  setText("bestDay", `${best.day} • ${formatMoney(best.amount)}`);
  setText("worstDay", `${worst.day} • ${formatMoney(worst.amount)}`);
  setText(
    "remainingTarget",
    remainingOrders === 0 ? "Target completed" : `${remainingOrders} deliveries left`
  );
}

/* ================= PREMIUM CHART.JS ================= */

function renderChart(chartData) {
  const canvas = document.getElementById("earningChartCanvas");
  if (!canvas || typeof Chart === "undefined") return;
  if (!Array.isArray(chartData) || chartData.length === 0) return;

  const chartSignature = JSON.stringify(chartData);

  if (earningsChart && earningsChart.__signature === chartSignature) {
    return;
  }

  const ctx = canvas.getContext("2d");
  const labels = chartData.map((item) => item.day);
  const values = chartData.map((item) => item.amount);

  if (earningsChart) earningsChart.destroy();

  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, "rgba(255, 77, 28, 0.35)");
  gradient.addColorStop(1, "rgba(255, 77, 28, 0.02)");

  earningsChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Earnings",
          data: values,
          fill: true,
          backgroundColor: gradient,
          borderColor: "#ff4d1c",
          borderWidth: 3,
          tension: 0.42,
          pointRadius: 5,
          pointHoverRadius: 10,
          pointHitRadius: 20,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#ff4d1c",
          pointBorderWidth: 3,
          pointHoverBackgroundColor: "#ff4d1c",
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 900,
        easing: "easeOutQuart",
      },
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#17172a",
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          padding: 13,
          cornerRadius: 14,
          displayColors: false,
          callbacks: {
            title: (context) => `${context[0].label}`,
            label: (context) => {
              const amount = context.raw;
              const fakeDeliveries = Math.max(Math.round(amount / 110), 1);
              return [`Earnings: ${formatMoney(amount)}`, `Deliveries: ${fakeDeliveries}`];
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: "#858585",
            font: { size: 12, weight: "700" },
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: "#f6f2ef",
            drawTicks: false,
          },
          border: { display: false },
          ticks: {
            color: "#9a8f8a",
            font: { size: 11, weight: "600" },
            callback: (value) => `Rs ${value}`,
          },
        },
      },
    },
  });

  earningsChart.__signature = chartSignature;
}

/* ================= WITHDRAW MODAL ================= */

function openWithdrawModal() {
  const data = getEarningsData();

  setText("modalAvailableBalance", formatMoney(data.availableBalance));

  const input = document.getElementById("withdrawAmount");
  if (input) {
    input.value = "";
    input.style.borderColor = "";
  }

  document.getElementById("withdrawModal")?.classList.add("show");
}

function closeWithdrawModal() {
  document.getElementById("withdrawModal")?.classList.remove("show");
}

function confirmWithdraw() {
  const input = document.getElementById("withdrawAmount");
  const amount = Number(input?.value);

  if (!amount || amount <= 0) {
    createToast("Please enter a valid amount.");
    if (input) input.style.borderColor = "#dc3545";
    return;
  }

  const data = getEarningsData();

  if (amount > data.availableBalance) {
    createToast("Not enough available balance.");
    if (input) input.style.borderColor = "#dc3545";
    return;
  }

  data.availableBalance -= amount;
  data.pendingPayout += amount;
  data.lastPayoutAt = new Date().toISOString();

  data.transactions.unshift({
    title: "Withdraw to Bank",
    date: new Date().toLocaleString("en-NP", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    amount: -amount,
    type: "payout",
    status: "Processed",
  });

  saveEarningsData(data);
  renderEarningsPage();
  closeWithdrawModal();

  createToast(`${formatMoney(amount)} withdrawn successfully 🚀`);
}

/* ================= BONUS ================= */

function renderBonus(data) {
  const percent = Math.min(
    Math.round((data.totalDeliveries / data.weeklyTarget) * 100),
    100
  );

  setText("bonusPercent", `${percent}%`);
  setText("bonusOrders", `${data.totalDeliveries}/${data.weeklyTarget} Orders`);

  const progress = document.getElementById("bonusProgress");
  if (progress) {
    progress.style.width = "0%";
    setTimeout(() => {
      progress.style.width = `${percent}%`;
    }, 250);
  }
}

/* ================= TRANSACTIONS ================= */

function renderTransactions(transactions) {
  const list = document.getElementById("transactionList");
  const empty = document.getElementById("emptyState");

  if (!list || !empty) return;

  list.innerHTML = "";

  if (!transactions || transactions.length === 0) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  transactions.forEach((tx, index) => {
    const item = document.createElement("div");
    item.className = "transaction-item";

    const iconData = getTransactionIcon(tx.type);
    const amountClass = tx.amount < 0 ? "minus" : "plus";
    const amountSymbol = tx.amount > 0 ? "+" : tx.amount < 0 ? "-" : "";

    item.innerHTML = `
      <div class="tx-icon ${iconData.color}">
        <i class="${iconData.icon}"></i>
      </div>

      <div class="tx-info">
        <h4>${tx.title}</h4>
        <p>${tx.date}</p>
      </div>

      <div class="tx-money">
        <strong class="${amountClass}">
          ${amountSymbol}${formatMoney(tx.amount)}
        </strong>
        <span class="badge ${getBadgeClass(tx.status)}">${tx.status}</span>
      </div>
    `;

    item.style.opacity = "0";
    item.style.transform = "translateY(8px)";
    list.appendChild(item);

    setTimeout(() => {
      item.style.transition = "0.35s ease";
      item.style.opacity = "1";
      item.style.transform = "translateY(0)";
    }, index * 70);
  });
}

/* ================= DELIVERIES PAGE CONNECTION ================= */

function saveDeliveredOrderToEarnings(order) {
  if (!order) return;

  const data = getEarningsData();
  const earning = Number(order.earning) || 0;

  data.todayEarnings += earning;
  data.weekEarnings += earning;
  data.availableBalance += earning;
  data.totalDeliveries += 1;

  data.breakdown.basePay += Math.round(earning * 0.55);
  data.breakdown.distancePay += Math.round(earning * 0.3);
  data.breakdown.tips += Math.round(earning * 0.15);

  data.transactions.unshift({
    title: `Order ${order.id} Delivered`,
    date: new Date().toLocaleString("en-NP", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    amount: earning,
    type: "earning",
    status: "Completed",
  });

  const todayIndex = new Date().getDay() - 1;
  const fixedIndex = todayIndex < 0 ? 6 : todayIndex;

  if (data.chart[fixedIndex]) {
    data.chart[fixedIndex].amount += earning;
  }

  saveEarningsData(data);
  createToast(`+ ${formatMoney(earning)} added 🎉`);
}

/* ================= ANIMATIONS ================= */

function animateMoney(id, target) {
  const el = document.getElementById(id);
  if (!el) return;

  const finalText = formatMoney(target);

  // Prevent shaking: if value is already correct, do not animate again
  if (el.textContent.trim() === finalText) return;

  // For earnings page stability, set direct value instead of counting from 0 every render
  el.textContent = finalText;
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;

  const finalText = String(target);

  if (el.textContent.trim() === finalText) return;

  el.textContent = finalText;
}

/* ================= HELPERS ================= */

function getTransactionIcon(type) {
  if (type === "payout") {
    return { icon: "fa-solid fa-building-columns", color: "blue" };
  }

  if (type === "bonus") {
    return { icon: "fa-solid fa-star", color: "orange" };
  }

  return { icon: "fa-solid fa-plus", color: "green" };
}

function getBadgeClass(status) {
  const value = String(status).toLowerCase();

  if (value.includes("processed")) return "processed";
  if (value.includes("bonus")) return "bonus";

  return "completed";
}

function createToast(message) {
  const oldToast = document.querySelector(".earnings-toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.className = "earnings-toast";
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2800);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatMoney(amount) {
  const value = Math.abs(Number(amount) || 0);
  return `Rs. ${value.toLocaleString("en-IN")}`;
}

function formatRelativeTime(dateString) {
  if (!dateString) return "No payout yet";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 30) return "Just now";
  if (minutes < 1) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";

  return date.toLocaleDateString("en-NP", {
    month: "short",
    day: "numeric",
  });
}