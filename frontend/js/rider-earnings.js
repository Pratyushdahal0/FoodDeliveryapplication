/* =====================================================
   FoodExpress Rider Earnings
   Production-style beta version
   - No fake seeded earnings
   - Reads completed deliveries from foodexpress_rider_history
   - Supports existing foodexpress_rider_earnings object safely
   - Creates payout requests for admin review only
===================================================== */

console.log('[rider-earnings.js] Loaded beta earnings module');

const RIDER_HISTORY_KEY = 'foodexpress_rider_history';
const RIDER_EARNINGS_KEY = 'foodexpress_rider_earnings';
const RIDER_PAYOUT_REQUESTS_KEY = 'foodexpress_rider_payout_requests';
const RIDER_SETTINGS_KEY = 'foodExpressRiderSettings';
const RIDER_AUTH_KEYS = ['foodExpressRider', 'foodexpress_rider', 'riderUser', 'loggedInRider'];

const WEEKLY_TARGET_ORDERS = 40;
const WEEKLY_TARGET_EARNINGS = 4000;
const DEFAULT_ONLINE_HOURS = '0h 00m';

let earningsChart = null;
let currentChartType = 'weekly';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_LABELS = ['W1', 'W2', 'W3', 'W4'];

document.addEventListener('DOMContentLoaded', () => {
  syncTopbarRiderIdentity();
  prepareStaticCopy();
  bindEvents();
  renderEarningsPage();

  window.addEventListener('focus', renderEarningsPage);
  window.addEventListener('storage', (event) => {
    if ([RIDER_HISTORY_KEY, RIDER_EARNINGS_KEY, RIDER_PAYOUT_REQUESTS_KEY].includes(event.key)) {
      renderEarningsPage();
    }
  });
});

/* ================= EVENTS ================= */

function bindEvents() {
  document.getElementById('withdrawBtn')?.addEventListener('click', openWithdrawModal);
  document.getElementById('cashoutBtn')?.addEventListener('click', openWithdrawModal);
  document.getElementById('closeWithdrawBtn')?.addEventListener('click', closeWithdrawModal);
  document.getElementById('cancelWithdrawBtn')?.addEventListener('click', closeWithdrawModal);
  document.getElementById('confirmWithdrawBtn')?.addEventListener('click', confirmWithdrawRequest);

  document.getElementById('withdrawModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'withdrawModal') closeWithdrawModal();
  });

  document.getElementById('withdrawAmount')?.addEventListener('input', validateWithdrawInput);

  document.querySelectorAll('.toggle-tabs button').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.toggle-tabs button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      currentChartType = button.dataset.chart || 'weekly';
      const summary = buildEarningsSummary();
      renderChart(currentChartType === 'monthly' ? summary.monthlyChart : summary.weeklyChart);
    });
  });
}

function prepareStaticCopy() {
  const dateButton = document.querySelector('.date-btn');
  if (dateButton) {
    dateButton.innerHTML = `<i class="fa-regular fa-calendar"></i> ${getCurrentRangeLabel()}`;
  }

  const modalTitle = document.querySelector('.withdraw-box h2');
  if (modalTitle) modalTitle.textContent = 'Request Rider Payout';

  const modalText = document.querySelector('.withdraw-box p');
  if (modalText) {
    modalText.textContent = 'This creates a payout request for admin review. No real bank transfer happens from this beta page.';
  }

  const confirmBtn = document.getElementById('confirmWithdrawBtn');
  if (confirmBtn) confirmBtn.textContent = 'Submit Payout Request';

  const cashoutBtn = document.getElementById('cashoutBtn');
  if (cashoutBtn) cashoutBtn.textContent = 'Request Payout';
}

/* ================= MAIN RENDER ================= */

function renderEarningsPage() {
  const summary = buildEarningsSummary();

  setMoney('todayEarnings', summary.todayEarnings);
  setMoney('weekEarnings', summary.weekEarnings);
  setMoney('availableBalance', summary.availableBalance);
  setMoney('pendingPayout', summary.pendingPayout);
  setMoney('cashAvailable', summary.availableBalance);
  setMoney('cashPending', summary.pendingPayout);
  setText('lastPayoutDate', summary.lastPayoutLabel);
  setText('modalAvailableBalance', formatMoney(summary.availableBalance));

  setText('totalDeliveries', summary.totalDeliveries);
  setMoney('avgPerOrder', summary.avgPerOrder);
  setText('onlineHours', summary.onlineHours);
  setText('completionRate', `${summary.completionRate}%`);

  setMoney('basePay', summary.breakdown.basePay);
  setMoney('distancePay', summary.breakdown.distancePay);
  setMoney('bonusPay', summary.breakdown.bonus);
  setMoney('tipsPay', summary.breakdown.tips);
  setText('deductions', summary.breakdown.deductions > 0 ? `- ${formatMoney(summary.breakdown.deductions)}` : formatMoney(0));

  updateCardSubcopy(summary);
  renderBonus(summary);
  renderInsights(summary);
  renderChart(currentChartType === 'monthly' ? summary.monthlyChart : summary.weeklyChart);
  renderTransactions(summary.transactions);
  updateWithdrawButtonState(summary.availableBalance);

  saveNormalizedEarningsSnapshot(summary);
}

function updateCardSubcopy(summary) {
  const todaySpan = document.querySelector('#todayEarnings')?.closest('.earning-card')?.querySelector('span');
  if (todaySpan) {
    todaySpan.classList.toggle('positive', summary.todayEarnings > 0);
    todaySpan.textContent = summary.todayEarnings > 0 ? 'From completed deliveries today' : 'No completed delivery today';
  }

  const weekSpan = document.querySelector('#weekEarnings')?.closest('.earning-card')?.querySelector('span');
  if (weekSpan) weekSpan.textContent = `Weekly target ${formatMoney(WEEKLY_TARGET_EARNINGS)}`;

  const balanceSpan = document.querySelector('#availableBalance')?.closest('.earning-card')?.querySelector('span');
  if (balanceSpan) balanceSpan.textContent = summary.availableBalance > 0 ? 'Ready for payout request' : 'Complete deliveries to earn';

  const pendingSpan = document.querySelector('#pendingPayout')?.closest('.earning-card')?.querySelector('span');
  if (pendingSpan) pendingSpan.textContent = summary.pendingPayout > 0 ? 'Waiting for admin review' : 'No pending payout request';
}

/* ================= DATA BUILDING ================= */

function buildEarningsSummary() {
  const historyOrders = normalizeHistoryOrders(readJson(RIDER_HISTORY_KEY, []));
  const previousEarnings = normalizeExistingEarnings(readJson(RIDER_EARNINGS_KEY, null));
  const payoutRequests = normalizePayoutRequests(readJson(RIDER_PAYOUT_REQUESTS_KEY, []));
  const realOrders = historyOrders.length > 0 ? historyOrders : previousEarnings.orders;

  const now = new Date();
  const weekStart = getStartOfWeek(now);
  const todayKey = toDateKey(now);

  const totalEarnings = sum(realOrders.map((order) => order.earning));
  const todayEarnings = sum(realOrders.filter((order) => toDateKey(order.dateObj) === todayKey).map((order) => order.earning));
  const weekEarnings = sum(realOrders.filter((order) => order.dateObj >= weekStart).map((order) => order.earning));

  const pendingPayout = sum(
    payoutRequests
      .filter((request) => ['pending', 'under_review'].includes(String(request.status).toLowerCase()))
      .map((request) => request.amount)
  );

  const approvedOrPaidPayout = sum(
    payoutRequests
      .filter((request) => ['approved', 'paid', 'processed'].includes(String(request.status).toLowerCase()))
      .map((request) => request.amount)
  );

  const availableBalance = Math.max(totalEarnings - pendingPayout - approvedOrPaidPayout, 0);
  const totalDeliveries = realOrders.length;
  const avgPerOrder = totalDeliveries > 0 ? Math.round(totalEarnings / totalDeliveries) : 0;

  const weeklyChart = buildWeeklyChart(realOrders, now);
  const monthlyChart = buildMonthlyChart(realOrders, now);
  const breakdown = buildBreakdown(realOrders, previousEarnings.breakdown);
  const transactions = buildTransactions(realOrders, payoutRequests, previousEarnings.transactions);

  return {
    todayEarnings,
    weekEarnings,
    availableBalance,
    pendingPayout,
    totalDeliveries,
    avgPerOrder,
    weeklyTarget: WEEKLY_TARGET_ORDERS,
    onlineHours: previousEarnings.onlineHours || DEFAULT_ONLINE_HOURS,
    completionRate: totalDeliveries > 0 ? 100 : 0,
    totalEarnings,
    breakdown,
    weeklyChart,
    monthlyChart,
    transactions,
    lastPayoutLabel: getLastPayoutLabel(payoutRequests),
  };
}

function normalizeHistoryOrders(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  return value
    .map((item, index) => normalizeOrder(item, index))
    .filter(Boolean)
    .filter((order) => {
      const key = String(order.id || `${order.restaurant}-${order.earning}-${order.rawDate}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.dateObj - a.dateObj);
}

function normalizeExistingEarnings(value) {
  const empty = {
    orders: [],
    transactions: [],
    breakdown: null,
    onlineHours: DEFAULT_ONLINE_HOURS,
  };

  if (!value) return empty;

  if (Array.isArray(value)) {
    return {
      ...empty,
      orders: value.map((item, index) => normalizeOrder(item, index)).filter(Boolean),
    };
  }

  if (typeof value !== 'object') return empty;
  if (looksLikeOldFakeSeed(value)) return empty;

  const ordersFromTransactions = Array.isArray(value.transactions)
    ? value.transactions
        .filter((tx) => Number(tx.amount) > 0 && String(tx.status || '').toLowerCase().includes('completed'))
        .map((tx, index) => normalizeOrder(
          {
            id: tx.orderId || extractOrderId(tx.title) || `TX-${index + 1}`,
            restaurant: tx.restaurant || 'Completed Delivery',
            earning: tx.amount,
            rawDate: tx.rawDate || tx.createdAt || tx.date,
            date: tx.date,
          },
          index
        ))
        .filter(Boolean)
    : [];

  return {
    orders: ordersFromTransactions,
    transactions: Array.isArray(value.transactions) ? value.transactions : [],
    breakdown: value.breakdown && typeof value.breakdown === 'object' ? value.breakdown : null,
    onlineHours: value.onlineHours || DEFAULT_ONLINE_HOURS,
  };
}

function normalizeOrder(item, index = 0) {
  if (!item || typeof item !== 'object') return null;

  const earning = parseMoney(item.earning ?? item.amount ?? item.fee ?? item.totalEarning);
  if (earning <= 0) return null;

  const rawDate = item.rawDate || item.deliveredAt || item.createdAt || item.completedAt || item.date || new Date().toISOString();
  const dateObj = parseDate(rawDate);

  return {
    id: item.id || item.orderNumber || item.order_id || `ORDER-${index + 1}`,
    restaurant: item.restaurant || item.restaurantName || item.pickupName || 'Restaurant delivery',
    customer: item.customer || item.customerName || 'Customer',
    pickup: item.pickup || item.pickupAddress || '',
    dropoff: item.dropoff || item.dropoffAddress || '',
    earning,
    distance: item.distance || '',
    status: item.status || 'Delivered',
    rawDate: dateObj.toISOString(),
    dateObj,
  };
}

function normalizePayoutRequests(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((request, index) => {
      const amount = parseMoney(request.amount);
      if (amount <= 0) return null;
      const createdAt = parseDate(request.createdAt || request.date || new Date().toISOString());
      return {
        id: request.id || `PAYOUT-${index + 1}`,
        amount,
        status: request.status || 'pending',
        method: request.method || 'Bank payout',
        createdAt: createdAt.toISOString(),
        note: request.note || 'Waiting for admin review',
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function looksLikeOldFakeSeed(data) {
  if (!data || typeof data !== 'object') return false;
  const titles = Array.isArray(data.transactions) ? data.transactions.map((tx) => String(tx.title || '')).join(' ') : '';
  return (
    Number(data.todayEarnings) === 825 &&
    Number(data.weekEarnings) === 3420 &&
    Number(data.availableBalance) === 2480 &&
    titles.includes('ORD-9421')
  );
}

/* ================= CHART + BREAKDOWN ================= */

function buildWeeklyChart(orders, referenceDate) {
  const start = getStartOfWeek(referenceDate);
  const chart = [];

  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    chart.push({
      day: DAY_LABELS[date.getDay()],
      amount: 0,
      deliveries: 0,
      dateKey: toDateKey(date),
    });
  }

  orders.forEach((order) => {
    const match = chart.find((item) => item.dateKey === toDateKey(order.dateObj));
    if (match) {
      match.amount += order.earning;
      match.deliveries += 1;
    }
  });

  return chart;
}

function buildMonthlyChart(orders, referenceDate) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const chart = WEEK_LABELS.map((label) => ({ day: label, amount: 0, deliveries: 0 }));

  orders.forEach((order) => {
    if (order.dateObj.getFullYear() !== year || order.dateObj.getMonth() !== month) return;
    const weekIndex = Math.min(Math.floor((order.dateObj.getDate() - 1) / 7), 3);
    chart[weekIndex].amount += order.earning;
    chart[weekIndex].deliveries += 1;
  });

  return chart;
}

function buildBreakdown(orders, existingBreakdown) {
  if (orders.length === 0 && existingBreakdown && !looksLikeBreakdownFake(existingBreakdown)) {
    return {
      basePay: parseMoney(existingBreakdown.basePay),
      distancePay: parseMoney(existingBreakdown.distancePay),
      bonus: parseMoney(existingBreakdown.bonus),
      tips: parseMoney(existingBreakdown.tips),
      deductions: parseMoney(existingBreakdown.deductions),
    };
  }

  const total = sum(orders.map((order) => order.earning));
  return {
    basePay: Math.round(total * 0.6),
    distancePay: Math.round(total * 0.28),
    bonus: Math.round(total * 0.08),
    tips: Math.round(total * 0.04),
    deductions: 0,
  };
}

function looksLikeBreakdownFake(breakdown) {
  return Number(breakdown.basePay) === 1850 && Number(breakdown.distancePay) === 720;
}

/* ================= TRANSACTIONS ================= */

function buildTransactions(orders, payoutRequests, existingTransactions = []) {
  const orderTransactions = orders.map((order) => ({
    title: `Order ${order.id} Delivered`,
    date: formatDateTime(order.dateObj),
    rawDate: order.rawDate,
    amount: order.earning,
    type: 'earning',
    status: 'Completed',
    restaurant: order.restaurant,
  }));

  const payoutTransactions = payoutRequests.map((request) => ({
    title: `Payout Request ${request.id}`,
    date: formatDateTime(request.createdAt),
    rawDate: request.createdAt,
    amount: -request.amount,
    type: 'payout',
    status: formatPayoutStatus(request.status),
  }));

  const safeExisting = Array.isArray(existingTransactions)
    ? existingTransactions.filter((tx) => !looksLikeFakeTransaction(tx) && tx.type !== 'payout')
    : [];

  return [...payoutTransactions, ...orderTransactions, ...safeExisting]
    .sort((a, b) => parseDate(b.rawDate || b.date) - parseDate(a.rawDate || a.date))
    .slice(0, 40);
}

function renderTransactions(transactions) {
  const list = document.getElementById('transactionList');
  const empty = document.getElementById('emptyState');
  if (!list || !empty) return;

  list.innerHTML = '';

  if (!Array.isArray(transactions) || transactions.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  transactions.forEach((tx, index) => {
    const item = document.createElement('div');
    item.className = 'transaction-item';

    const iconData = getTransactionIcon(tx.type, tx.status);
    const amountClass = tx.amount < 0 ? 'minus' : 'plus';
    const amountPrefix = tx.amount > 0 ? '+' : tx.amount < 0 ? '-' : '';

    item.innerHTML = `
      <div class="tx-icon ${iconData.color}">
        <i class="${iconData.icon}"></i>
      </div>

      <div class="tx-info">
        <h4>${escapeHTML(tx.title)}</h4>
        <p>${escapeHTML(tx.restaurant ? `${tx.restaurant} • ${tx.date}` : tx.date)}</p>
      </div>

      <div class="tx-money">
        <strong class="${amountClass}">${amountPrefix}${formatMoney(tx.amount)}</strong>
        <span class="badge ${getBadgeClass(tx.status)}">${escapeHTML(tx.status)}</span>
      </div>
    `;

    item.style.opacity = '0';
    item.style.transform = 'translateY(8px)';
    list.appendChild(item);

    setTimeout(() => {
      item.style.transition = '0.35s ease';
      item.style.opacity = '1';
      item.style.transform = 'translateY(0)';
    }, index * 45);
  });
}

function looksLikeFakeTransaction(tx) {
  const title = String(tx?.title || '');
  return title.includes('ORD-9421') || title.includes('ORD-9418') || title.includes('Weekly Boost Bonus');
}

/* ================= BONUS + INSIGHTS ================= */

function renderBonus(summary) {
  const percent = Math.min(Math.round((summary.totalDeliveries / summary.weeklyTarget) * 100), 100);
  setText('bonusPercent', `${percent}%`);
  setText('bonusOrders', `${summary.totalDeliveries}/${summary.weeklyTarget} Orders`);

  const progress = document.getElementById('bonusProgress');
  if (progress) {
    requestAnimationFrame(() => {
      progress.style.width = `${percent}%`;
    });
  }
}

function renderInsights(summary) {
  const nonEmptyDays = summary.weeklyChart.filter((day) => day.amount > 0);

  if (nonEmptyDays.length === 0) {
    setText('bestDay', 'No delivery yet');
    setText('worstDay', 'No delivery yet');
  } else {
    const best = nonEmptyDays.reduce((max, day) => (day.amount > max.amount ? day : max), nonEmptyDays[0]);
    const lowest = nonEmptyDays.reduce((min, day) => (day.amount < min.amount ? day : min), nonEmptyDays[0]);
    setText('bestDay', `${best.day} • ${formatMoney(best.amount)}`);
    setText('worstDay', `${lowest.day} • ${formatMoney(lowest.amount)}`);
  }

  const remainingOrders = Math.max(summary.weeklyTarget - summary.totalDeliveries, 0);
  setText('remainingTarget', remainingOrders === 0 ? 'Target completed' : `${remainingOrders} deliveries left`);
}

/* ================= CHART ================= */

function renderChart(chartData) {
  const canvas = document.getElementById("earningChartCanvas");
  const chartWrap = document.querySelector(".chart-wrap");

  if (!canvas || !chartWrap || typeof Chart === "undefined") return;

  const hasMeaningfulData =
    Array.isArray(chartData) &&
    chartData.length > 0 &&
    chartData.some((item) => Number(item.amount) > 0);

  const oldEmpty = chartWrap.querySelector(".chart-empty-state");
  if (oldEmpty) oldEmpty.remove();

  chartWrap.classList.remove("no-data");
  canvas.style.display = "block";

  if (!hasMeaningfulData) {
    if (earningsChart) {
      earningsChart.destroy();
      earningsChart = null;
    }

    chartWrap.classList.add("no-data");
    canvas.style.display = "none";

    const empty = document.createElement("div");
    empty.className = "chart-empty-state";
    empty.innerHTML = `
      <div class="chart-empty-box">
        <div class="chart-empty-content">
          <div class="chart-empty-icon">
            <i class="fa-solid fa-chart-line"></i>
          </div>
          <h3>No earnings activity yet</h3>
          <p>
            Complete deliveries and your weekly earnings trend will appear here.
          </p>
        </div>
      </div>
    `;

    chartWrap.appendChild(empty);
    return;
  }

  const ctx = canvas.getContext("2d");
  const labels = chartData.map((item) => item.day);
  const values = chartData.map((item) => Number(item.amount) || 0);
  const chartSignature = JSON.stringify(chartData);

  if (earningsChart && earningsChart.__signature === chartSignature) {
    return;
  }

  if (earningsChart) earningsChart.destroy();

  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, "rgba(255, 90, 47, 0.24)");
  gradient.addColorStop(1, "rgba(255, 90, 47, 0.02)");

  earningsChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Earnings",
          data: values,
          fill: true,
          backgroundColor: gradient,
          borderColor: "#ff5a2f",
          borderWidth: 3,
          tension: 0.42,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#ff5a2f",
          pointBorderWidth: 3,
          pointHoverBackgroundColor: "#ff5a2f",
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
        easing: "easeOutQuart",
      },
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: "#17172a",
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          padding: 12,
          cornerRadius: 14,
          displayColors: false,
          callbacks: {
            title: (context) => `${context[0].label}`,
            label: (context) => `Earnings: ${formatMoney(context.raw)}`,
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          border: {
            display: false,
          },
          ticks: {
            color: "#8a8490",
            font: {
              size: 12,
              weight: "700",
            },
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(...values) + Math.max(...values) * 0.25,
          grid: {
            color: "#f4efeb",
            drawTicks: false,
          },
          border: {
            display: false,
          },
          ticks: {
            maxTicksLimit: 5,
            color: "#9a939d",
            font: {
              size: 11,
              weight: "600",
            },
            callback: (value) => `Rs ${value}`,
          },
        },
      },
    },
  });

  earningsChart.__signature = chartSignature;
}

function renderSimpleChartFallback(canvas, chartData) {
  const parent = canvas.parentElement;
  if (!parent) return;

  const max = Math.max(...chartData.map((item) => item.amount), 1);
  parent.innerHTML = chartData
    .map((item) => {
      const height = Math.max((item.amount / max) * 150, 12);
      return `
        <div class="chart-col">
          <div class="bar" style="height:${height}px" data-value="${formatMoney(item.amount)}"></div>
          <span>${escapeHTML(item.day)}</span>
        </div>
      `;
    })
    .join('');
}

/* ================= PAYOUT REQUEST ================= */

function openWithdrawModal() {
  const summary = buildEarningsSummary();
  setText('modalAvailableBalance', formatMoney(summary.availableBalance));

  const input = document.getElementById('withdrawAmount');
  if (input) {
    input.value = '';
    input.max = String(summary.availableBalance);
    input.placeholder = summary.availableBalance > 0 ? 'Enter payout request amount' : 'No available balance yet';
    input.disabled = summary.availableBalance <= 0;
    input.style.borderColor = '';
  }

  updateWithdrawButtonState(summary.availableBalance);
  document.getElementById('withdrawModal')?.classList.add('show');
}

function closeWithdrawModal() {
  document.getElementById('withdrawModal')?.classList.remove('show');
}

function validateWithdrawInput() {
  const input = document.getElementById('withdrawAmount');
  const summary = buildEarningsSummary();
  const amount = parseMoney(input?.value);

  if (!input) return;
  input.style.borderColor = amount > 0 && amount <= summary.availableBalance ? '#ff4d1c' : '#dc3545';
}

function updateWithdrawButtonState(availableBalance) {
  const buttons = [document.getElementById('withdrawBtn'), document.getElementById('cashoutBtn'), document.getElementById('confirmWithdrawBtn')].filter(Boolean);
  buttons.forEach((button) => {
    button.disabled = availableBalance <= 0;
    button.classList.toggle('disabled', availableBalance <= 0);
  });
}

function confirmWithdrawRequest() {
  const input = document.getElementById('withdrawAmount');
  const amount = parseMoney(input?.value);
  const summary = buildEarningsSummary();

  if (!amount || amount <= 0) {
    createToast('Please enter a valid payout amount.');
    if (input) input.style.borderColor = '#dc3545';
    return;
  }

  if (amount > summary.availableBalance) {
    createToast('Amount is higher than your available balance.');
    if (input) input.style.borderColor = '#dc3545';
    return;
  }

  const payoutRequests = normalizePayoutRequests(readJson(RIDER_PAYOUT_REQUESTS_KEY, []));
  const request = {
    id: generatePayoutId(),
    amount,
    status: 'pending',
    method: getPayoutMethodLabel(),
    createdAt: new Date().toISOString(),
    note: 'Submitted by rider. Waiting for admin review.',
  };

  payoutRequests.unshift(request);
  writeJson(RIDER_PAYOUT_REQUESTS_KEY, payoutRequests);

  closeWithdrawModal();
  renderEarningsPage();
  createToast(`${formatMoney(amount)} payout request submitted for admin review.`);
}

function getPayoutMethodLabel() {
  const settings = readJson(RIDER_SETTINGS_KEY, null);
  const payout = settings?.payout || settings?.bank || null;
  if (payout?.bankName) return payout.bankName;
  if (payout?.method) return payout.method;
  return 'Bank payout';
}

function getLastPayoutLabel(payoutRequests) {
  if (!payoutRequests.length) return 'No payout request yet';
  const latest = payoutRequests[0];
  return `${formatPayoutStatus(latest.status)} • ${formatRelativeTime(latest.createdAt)}`;
}

function formatPayoutStatus(status) {
  const value = String(status || 'pending').toLowerCase();
  if (value === 'under_review') return 'Under Review';
  if (value === 'approved') return 'Approved';
  if (value === 'paid' || value === 'processed') return 'Paid';
  if (value === 'rejected') return 'Rejected';
  return 'Pending Review';
}

/* ================= TOPBAR ================= */

function syncTopbarRiderIdentity() {
  const rider = getCurrentRider();
  const userBox = document.querySelector('.user-box');
  if (!userBox) return;

  const nameEl = userBox.querySelector('h4');
  const idEl = userBox.querySelector('p');
  const imgEl = userBox.querySelector('img');

  if (nameEl) nameEl.textContent = rider.name;
  if (idEl) idEl.textContent = `Rider ID: ${rider.id}`;
  if (imgEl) {
    imgEl.src = rider.avatar;
    imgEl.alt = rider.name;
  }
}

function getCurrentRider() {
  for (const key of RIDER_AUTH_KEYS) {
    const data = readJson(key, null);
    if (!data || typeof data !== 'object') continue;

    return {
      name: data.name || data.fullName || data.riderName || 'FoodExpress Rider',
      id: data.riderId || data.id || data.user_id || 'RID-BETA',
      avatar: data.avatar || data.profileImage || data.profilePhoto || data.image || 'https://i.pravatar.cc/80?img=12',
    };
  }

  return {
    name: 'FoodExpress Rider',
    id: 'RID-BETA',
    avatar: 'https://i.pravatar.cc/80?img=12',
  };
}

/* ================= SNAPSHOT ================= */

function saveNormalizedEarningsSnapshot(summary) {
  const snapshot = {
    todayEarnings: summary.todayEarnings,
    weekEarnings: summary.weekEarnings,
    availableBalance: summary.availableBalance,
    pendingPayout: summary.pendingPayout,
    totalDeliveries: summary.totalDeliveries,
    weeklyTarget: summary.weeklyTarget,
    onlineHours: summary.onlineHours,
    completionRate: summary.completionRate,
    breakdown: summary.breakdown,
    chart: summary.weeklyChart,
    monthlyChart: summary.monthlyChart,
    transactions: summary.transactions,
    updatedAt: new Date().toISOString(),
    source: 'rider-history-and-payout-requests',
  };

  writeJson(RIDER_EARNINGS_KEY, snapshot);
}

/* ================= HELPERS ================= */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[rider-earnings.js] Could not read ${key}:`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    return Number(cleaned) || 0;
  }
  return 0;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
}

function getStartOfWeek(date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function toDateKey(date) {
  const safeDate = parseDate(date);
  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}-${String(safeDate.getDate()).padStart(2, '0')}`;
}

function formatMoney(amount) {
  const value = Math.abs(Math.round(Number(amount) || 0));
  return `Rs. ${value.toLocaleString('en-IN')}`;
}

function setMoney(id, amount) {
  setText(id, formatMoney(amount));
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatDateTime(value) {
  const date = parseDate(value);
  return date.toLocaleString('en-NP', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(value) {
  const date = parseDate(value);
  const now = new Date();
  const diffMs = now - date;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 30) return 'Just now';
  if (minutes < 1) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-NP', { month: 'short', day: 'numeric' });
}

function getCurrentRangeLabel() {
  const now = new Date();
  const start = getStartOfWeek(now);
  return `${start.toLocaleDateString('en-NP', { month: 'short', day: '2-digit' })} - ${now.toLocaleDateString('en-NP', { month: 'short', day: '2-digit', year: 'numeric' })}`;
}

function getTransactionIcon(type, status) {
  const statusValue = String(status || '').toLowerCase();
  if (type === 'payout') {
    return statusValue.includes('pending') || statusValue.includes('review')
      ? { icon: 'fa-solid fa-hourglass-half', color: 'orange' }
      : { icon: 'fa-solid fa-building-columns', color: 'blue' };
  }
  if (type === 'bonus') return { icon: 'fa-solid fa-star', color: 'orange' };
  return { icon: 'fa-solid fa-plus', color: 'green' };
}

function getBadgeClass(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('pending') || value.includes('review')) return 'pending';
  if (value.includes('paid') || value.includes('approved') || value.includes('processed')) return 'processed';
  if (value.includes('bonus')) return 'bonus';
  if (value.includes('rejected')) return 'rejected';
  return 'completed';
}

function generatePayoutId() {
  const date = new Date();
  return `PAY-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function extractOrderId(title) {
  const match = String(title || '').match(/#?ORD[-\w]*/i);
  return match ? match[0].replace('#', '') : null;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createToast(message) {
  document.querySelector('.earnings-toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'earnings-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3200);
}

// Useful for manual testing from browser console if needed.
window.FoodExpressRiderEarnings = {
  render: renderEarningsPage,
  buildSummary: buildEarningsSummary,
};
