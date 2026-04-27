console.log("Rider deliveries JS loaded");

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

  let availableData = [
    {
      id: "#ORD-1001",
      restaurant: "Pizza Point",
      icon: "fa-pizza-slice",
      distance: "2.1 km",
      earning: 95,
      customer: "Pratyush Dahal",
      pickup: "Lazimpat, Kathmandu",
      dropoff: "Koteshwor, Kathmandu",
      ready: "Ready in 5m",
      eta: "18 mins",
      type: "Nearby",
      expires: 90,
    },
    {
      id: "#ORD-1002",
      restaurant: "Momo Hub",
      icon: "fa-bowl-food",
      distance: "3.4 km",
      earning: 130,
      customer: "Sita Sharma",
      pickup: "Thamel, Kathmandu",
      dropoff: "Baneshwor, Kathmandu",
      ready: "Ready now",
      eta: "24 mins",
      type: "High Pay",
      expires: 90,
    },
  ];

  let activeOrder = null;
  let currentStep = 0;
  let activeFilter = "All";
  let countdownInterval = null;

  const activeBox = document.getElementById("activeDelivery");
  const availableBox = document.getElementById("availableList");
  const availableCount = document.getElementById("availableCount");
  const activeCount = document.getElementById("activeCount");
  const potentialEarnings = document.getElementById("potentialEarnings");
  const toast = document.getElementById("toast");
  const refreshBtn = document.getElementById("refreshOrders");

  const steps = ["Accepted", "Arrived", "Picked Up", "On the Way", "Delivered"];

  function formatMoney(amount) {
    return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
  }

  function showToast(message) {
    if (!toast) return;

    toast.querySelector("span").innerText = message;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 2200);
  }

  function updateStats() {
    const totalPotential = availableData.reduce(
      (sum, order) => sum + order.earning,
      0
    );

    if (availableCount) availableCount.innerText = availableData.length;
    if (activeCount) activeCount.innerText = activeOrder ? "1" : "0";
    if (potentialEarnings) potentialEarnings.innerText = formatMoney(totalPotential);
  }

  function openGoogleMaps(order) {
    if (!order) return;

    const pickup = encodeURIComponent(order.pickup);
    const dropoff = encodeURIComponent(order.dropoff);

    const url = `https://www.google.com/maps/dir/?api=1&origin=${pickup}&destination=${dropoff}&travelmode=driving`;

    window.open(url, "_blank");
  }

  function fakeMap(order) {
    return `
      <div class="fake-map-card">
        <div class="fake-map-header">
          <div>
            <h4>Route Preview</h4>
            <p>${order.pickup} → ${order.dropoff}</p>
          </div>

          <span class="map-badge">
            <i class="fa-solid fa-route"></i>
            ${order.distance}
          </span>
        </div>

        <div class="map-route-line">
          <span class="map-pin pickup">
            <i class="fa-solid fa-store"></i>
          </span>

          <span class="map-bike">
            <i class="fa-solid fa-motorcycle"></i>
          </span>

          <span class="map-pin drop">
            <i class="fa-solid fa-location-dot"></i>
          </span>
        </div>
      </div>
    `;
  }

  function renderActive() {
    if (!activeBox) return;

    if (!activeOrder) {
      activeBox.innerHTML = `
        <div class="empty-active">
          <div>
            <i class="fa-solid fa-box-open"></i>
            <h3>No active delivery</h3>
            <p>Accept a delivery task to start your next trip.</p>
          </div>
        </div>
      `;
      updateStats();
      return;
    }

    const actionLabel =
      currentStep === 0
        ? "Arrived at Restaurant"
        : currentStep === 1
        ? "Pick Up Order"
        : currentStep === 2
        ? "Start Delivery"
        : currentStep === 3
        ? "Mark as Delivered"
        : "Delivery Completed";

    activeBox.innerHTML = `
      <div class="active-top">
        <div>
          <h3>Active Delivery</h3>
          <span class="order-pill">${activeOrder.id} • ${activeOrder.restaurant}</span>
        </div>

        <div class="active-earning">
          <span>Trip Earnings</span>
          <strong>${formatMoney(activeOrder.earning)}</strong>
        </div>
      </div>

      ${fakeMap(activeOrder)}

      <div class="route-card">
        <div class="route-point">
          <i class="fa-solid ${activeOrder.icon}"></i>
          <div>
            <small>Restaurant</small>
            <strong>${activeOrder.restaurant}</strong>
            <p>${activeOrder.pickup}</p>
          </div>
        </div>

        <div class="route-bike">
          <i class="fa-solid fa-motorcycle"></i>
          <span>${activeOrder.distance}</span>
        </div>

        <div class="route-point right">
          <div>
            <small>Customer</small>
            <strong>${activeOrder.customer}</strong>
            <p>${activeOrder.dropoff}</p>
          </div>
          <i class="fa-solid fa-user"></i>
        </div>
      </div>

      <div class="progress-steps">
        ${steps
          .map(
            (step, index) => `
              <div class="trip-step ${index <= currentStep ? "done" : ""}">
                <span>
                  ${index <= currentStep ? `<i class="fa-solid fa-check"></i>` : ""}
                </span>
                ${step}
              </div>
            `
          )
          .join("")}
      </div>

      <div class="trip-actions">
        <button class="primary-btn" id="nextStepBtn">
          <i class="fa-solid fa-circle-check"></i>
          ${actionLabel}
        </button>

        <button class="secondary-btn" id="activeDetailsBtn">
          <i class="fa-solid fa-circle-info"></i>
          Details
        </button>

        <button class="secondary-btn" id="activeNavigateBtn">
          <i class="fa-solid fa-location-arrow"></i>
          Navigate
        </button>
      </div>
    `;

    document.getElementById("nextStepBtn")?.addEventListener("click", nextStep);

    document.getElementById("activeDetailsBtn")?.addEventListener("click", () => {
      openDrawer(activeOrder);
    });

    document.getElementById("activeNavigateBtn")?.addEventListener("click", () => {
      openGoogleMaps(activeOrder);
    });

    updateStats();
  }

  function getFilteredOrders() {
    if (activeFilter === "All") return availableData;
    return availableData.filter((order) => order.type === activeFilter);
  }

  function renderAvailable() {
    if (!availableBox) return;

    const orders = getFilteredOrders();

    if (!orders.length) {
      availableBox.innerHTML = `
        <div class="empty-orders">
          <div>
            <i class="fa-solid fa-magnifying-glass-location"></i>
            <h3>No deliveries available</h3>
            <p>No live orders in your zone right now. Refresh to check again.</p>
            <button class="empty-refresh-btn" id="emptyRefreshBtn">
              <i class="fa-solid fa-rotate-right"></i>
              Refresh Orders
            </button>
          </div>
        </div>
      `;

      document.getElementById("emptyRefreshBtn")?.addEventListener("click", refreshOrders);
      updateStats();
      return;
    }

    availableBox.innerHTML = orders
      .map(
        (order) => `
          <article class="delivery-card" data-id="${order.id}">
            <div class="delivery-card-top">
              <div>
                <div class="food-icon">
                  <i class="fa-solid ${order.icon}"></i>
                </div>
                <h4>${order.restaurant}</h4>
                <p>${order.id} • ${order.customer}</p>
              </div>

              <strong class="pay-badge">${formatMoney(order.earning)}</strong>
            </div>

            <div class="expire-badge">
              <i class="fa-regular fa-clock"></i>
              Expires in <span>${order.expires}s</span>
            </div>

            <div class="delivery-meta">
              <span><i class="fa-solid fa-route"></i> ${order.distance}</span>
              <span><i class="fa-regular fa-clock"></i> ${order.eta}</span>
              <span><i class="fa-solid fa-bag-shopping"></i> ${order.ready}</span>
            </div>

            <div class="delivery-actions">
              <button class="accept-btn" data-id="${order.id}">Accept</button>
              <button class="decline-btn" data-id="${order.id}">Decline</button>
            </div>
          </article>
        `
      )
      .join("");

    document.querySelectorAll(".delivery-card").forEach((card) => {
      card.addEventListener("click", () => {
        const order = availableData.find((item) => item.id === card.dataset.id);
        if (order) openDrawer(order);
      });
    });

    document.querySelectorAll(".accept-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        acceptOrder(btn.dataset.id);
      });
    });

    document.querySelectorAll(".decline-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        declineOrder(btn.dataset.id);
      });
    });

    updateStats();
  }

  function startCountdown() {
    clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
      availableData = availableData
        .map((order) => ({
          ...order,
          expires: order.expires - 1,
        }))
        .filter((order) => order.expires > 0);

      renderAvailable();
      updateStats();
    }, 1000);
  }

  function acceptOrder(id) {
    if (activeOrder) {
      showToast("Finish current delivery before accepting another.");
      return;
    }

    const order = availableData.find((item) => item.id === id);
    if (!order) return;

    activeOrder = order;
    currentStep = 0;
    availableData = availableData.filter((item) => item.id !== id);

    closeDrawer();
    renderActive();
    renderAvailable();
    showToast(`${order.id} accepted successfully.`);
  }

  function declineOrder(id) {
    availableData = availableData.filter((item) => item.id !== id);

    closeDrawer();
    renderAvailable();
    showToast("Delivery task declined.");
  }

  function nextStep() {
    if (!activeOrder) return;

    if (currentStep < steps.length - 1) {
      currentStep++;
      renderActive();
      showToast(`Status updated: ${steps[currentStep]}`);
      return;
    }

    saveDeliveredOrderToEarnings(activeOrder);
    saveDeliveredOrderToHistory(activeOrder);

    showToast(`${activeOrder.id} completed. Earnings added.`);
    activeOrder = null;
    currentStep = 0;
    renderActive();
    updateStats();
  }

  function createDrawer() {
    if (document.querySelector(".order-drawer")) return;

    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <div class="drawer-overlay" id="drawerOverlay"></div>
        <aside class="order-drawer" id="orderDrawer"></aside>
      `
    );

    document.getElementById("drawerOverlay")?.addEventListener("click", closeDrawer);
  }

  function openDrawer(order) {
    if (!order) return;

    createDrawer();

    const drawer = document.getElementById("orderDrawer");
    const overlay = document.getElementById("drawerOverlay");
    const isActive = activeOrder && activeOrder.id === order.id;

    drawer.innerHTML = `
      <div class="drawer-head">
        <div>
          <h3>${order.restaurant}</h3>
          <p>${order.id} • ${order.customer}</p>
        </div>

        <button class="drawer-close" id="drawerClose">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="drawer-map">
        ${fakeMap(order)}
      </div>

      <div class="drawer-section">
        <h4>Order Details</h4>

        <div class="drawer-info-row">
          <i class="fa-solid fa-store"></i>
          <div>
            <span>Pickup</span>
            <strong>${order.restaurant}, ${order.pickup}</strong>
          </div>
        </div>

        <div class="drawer-info-row">
          <i class="fa-solid fa-user"></i>
          <div>
            <span>Customer</span>
            <strong>${order.customer}, ${order.dropoff}</strong>
          </div>
        </div>

        <div class="drawer-info-row">
          <i class="fa-solid fa-bag-shopping"></i>
          <div>
            <span>Food Status</span>
            <strong>${order.ready}</strong>
          </div>
        </div>
      </div>

      <div class="drawer-stats">
        <div class="drawer-stat">
          <span>Earnings</span>
          <strong>${formatMoney(order.earning)}</strong>
        </div>

        <div class="drawer-stat">
          <span>Distance</span>
          <strong>${order.distance}</strong>
        </div>

        <div class="drawer-stat">
          <span>ETA</span>
          <strong>${order.eta}</strong>
        </div>

        <div class="drawer-stat">
          <span>Status</span>
          <strong>${isActive ? steps[currentStep] : "Available"}</strong>
        </div>
      </div>

      <div class="drawer-actions">
        ${
          isActive
            ? `
              <button class="drawer-primary" id="drawerNextBtn">
                Update Status
              </button>
            `
            : `
              <button class="drawer-primary" id="drawerAcceptBtn">
                Accept Order
              </button>
            `
        }

        <button class="drawer-secondary" id="drawerNavigateBtn">
          Navigate
        </button>
      </div>
    `;

    overlay?.classList.add("show");
    drawer?.classList.add("show");

    document.getElementById("drawerClose")?.addEventListener("click", closeDrawer);

    document.getElementById("drawerAcceptBtn")?.addEventListener("click", () => {
      acceptOrder(order.id);
    });

    document.getElementById("drawerNextBtn")?.addEventListener("click", () => {
      nextStep();
      if (activeOrder) openDrawer(activeOrder);
      else closeDrawer();
    });

    document.getElementById("drawerNavigateBtn")?.addEventListener("click", () => {
      openGoogleMaps(order);
    });
  }

  function closeDrawer() {
    document.getElementById("drawerOverlay")?.classList.remove("show");
    document.getElementById("orderDrawer")?.classList.remove("show");
  }

  function refreshOrders() {
    refreshBtn?.classList.add("loading");
    showToast("Checking for new deliveries...");

    setTimeout(() => {
      const newOrder = {
        id: `#ORD-${1003 + Math.floor(Math.random() * 50)}`,
        restaurant: "Burger House",
        icon: "fa-burger",
        distance: "1.6 km",
        earning: 105,
        customer: "Aayush Karki",
        pickup: "New Road, Kathmandu",
        dropoff: "Putalisadak, Kathmandu",
        ready: "Pickup soon",
        eta: "15 mins",
        type: "Nearby",
        expires: 90,
      };

      availableData.push(newOrder);

      refreshBtn?.classList.remove("loading");
      renderAvailable();
      updateStats();
      showToast("New delivery added.");
    }, 850);
  }

  function saveDeliveredOrderToEarnings(order) {
    if (!order) return;

    const STORAGE_KEY = "foodexpress_rider_earnings";

    const defaultData = {
      todayEarnings: 0,
      weekEarnings: 0,
      availableBalance: 0,
      pendingPayout: 0,

      totalDeliveries: 0,
      weeklyTarget: 40,
      onlineHours: "5h 20m",
      completionRate: 94,

      breakdown: {
        basePay: 0,
        distancePay: 0,
        bonus: 0,
        tips: 0,
        deductions: 0,
      },

      chart: [
        { day: "Mon", amount: 0 },
        { day: "Tue", amount: 0 },
        { day: "Wed", amount: 0 },
        { day: "Thu", amount: 0 },
        { day: "Fri", amount: 0 },
        { day: "Sat", amount: 0 },
        { day: "Sun", amount: 0 },
      ],

      transactions: [],
    };

    const saved = localStorage.getItem(STORAGE_KEY);
    const data = saved ? JSON.parse(saved) : defaultData;

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

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function saveDeliveredOrderToHistory(order) {
    if (!order) return;

    const HISTORY_KEY = "foodexpress_rider_history";
    const saved = localStorage.getItem(HISTORY_KEY);
    const history = saved ? JSON.parse(saved) : [];

    history.unshift({
      id: order.id,
      restaurant: order.restaurant,
      icon: order.icon,
      customer: order.customer,
      pickup: order.pickup,
      dropoff: order.dropoff,
      earning: order.earning,
      distance: order.distance,
      eta: order.eta,
      status: "Delivered",
      date: new Date().toLocaleString("en-NP", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      rawDate: new Date().toISOString(),
    });

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((item) => {
        item.classList.remove("active");
      });

      chip.classList.add("active");
      activeFilter = chip.innerText.trim();
      renderAvailable();
    });
  });

  refreshBtn?.addEventListener("click", refreshOrders);

  renderActive();
  renderAvailable();
  updateStats();
  startCountdown();
});