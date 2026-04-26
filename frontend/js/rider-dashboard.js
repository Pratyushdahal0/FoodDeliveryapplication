console.log("Rider dashboard JS loaded");

// Fake database
let riderData = JSON.parse(localStorage.getItem("riderData")) || {
  deliveriesToday: 8,
  activeDelivery: 0,
  earningsToday: 720,
};

function saveRiderData() {
  localStorage.setItem("riderData", JSON.stringify(riderData));
}

function updateUI() {
  const todayDelivery = document.querySelector(".stat-card:nth-child(1) h2");
  const activeDelivery = document.querySelector(".stat-card:nth-child(2) h2");
  const todayEarnings = document.querySelector(".stat-card:nth-child(3) h2");

  if (todayDelivery) todayDelivery.innerText = riderData.deliveriesToday;
  if (activeDelivery) activeDelivery.innerText = riderData.activeDelivery;
  if (todayEarnings) {
    todayEarnings.innerText = `Rs. ${Number(riderData.earningsToday).toLocaleString("en-IN")}`;
  }
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  const icon =
    type === "success"
      ? "fa-circle-check"
      : type === "warning"
      ? "fa-circle-exclamation"
      : "fa-circle-info";

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

document.addEventListener("DOMContentLoaded", () => {
  updateUI();

  // ❌ REMOVED SIDEBAR TOGGLE FROM HERE (handled in rider-sidebar.js)

  // Online / offline
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

      showToast(isOnline ? "You are now offline." : "You are back online.");
    });
  }

  // Delivery progress
  const steps = document.querySelectorAll(".progress-steps .step");
  const actionButtons = document.querySelectorAll(".delivery-actions button");

  let currentStep = 1;

  function resetSteps() {
    steps.forEach((step, index) => {
      const circle = step.querySelector("span");

      if (index <= 1) {
        step.classList.add("done");
        if (circle) circle.innerHTML = `<i class="fa-solid fa-check"></i>`;
      } else {
        step.classList.remove("done");
        if (circle) circle.innerHTML = "";
      }
    });
  }

  function updateSteps(stepIndex) {
    steps.forEach((step, index) => {
      const circle = step.querySelector("span");

      if (index <= stepIndex) {
        step.classList.add("done");
        if (circle) circle.innerHTML = `<i class="fa-solid fa-check"></i>`;
      }
    });
  }

  actionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.innerText.trim();

      if (text === "Picked Up") {
        currentStep = 2;
        updateSteps(currentStep);
        showToast("Order picked up from restaurant.");
      }

      if (text === "On The Way") {
        currentStep = 3;
        updateSteps(currentStep);
        showToast("You are now on the way to customer.");
      }

      if (text === "Delivered") {
        currentStep = 4;
        updateSteps(currentStep);

        riderData.deliveriesToday += 1;
        riderData.activeDelivery = 0;
        riderData.earningsToday += 105;

        saveRiderData();
        updateUI();

        btn.innerText = "Completed";
        btn.disabled = true;
        btn.style.opacity = "0.6";

        showToast("Delivery completed. Rs. 105 added to earnings.");
      }
    });
  });

  // Accept order
  const acceptButtons = document.querySelectorAll(".accept-btn");

  acceptButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const orderCard = btn.closest(".order-card");
      if (!orderCard) return;

      const orderId = orderCard.querySelector("span")?.innerText || "New Order";
      const restaurantName = orderCard.querySelector("h4")?.innerText || "Restaurant";
      const location = orderCard.querySelector("p")?.innerText || "Kathmandu";
      const payout = orderCard.querySelector("strong")?.innerText || "Rs. 95";

      const activeOrderLabel = document.querySelector(".active-delivery .panel-header span");
      const restaurantTitle = document.querySelector(".route-point h4");
      const restaurantLocation = document.querySelector(".route-point p");

      if (activeOrderLabel) activeOrderLabel.innerText = `Order ${orderId}`;
      if (restaurantTitle) restaurantTitle.innerText = restaurantName;
      if (restaurantLocation) {
        restaurantLocation.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${location}`;
      }

      riderData.activeDelivery = 1;
      saveRiderData();
      updateUI();

      resetSteps();

      btn.innerText = "Accepted";
      btn.disabled = true;
      btn.style.opacity = "0.6";

      orderCard.style.opacity = "0.5";
      orderCard.style.pointerEvents = "none";

      showToast(`${orderId} accepted from ${restaurantName}. Estimated payout: ${payout}`);
    });
  });
});
const refreshBtn = document.querySelector(".refresh-btn");

refreshBtn.addEventListener("click", () => {
  refreshBtn.classList.add("loading");

  // simulate API call
  setTimeout(() => {
    refreshBtn.classList.remove("loading");
  }, 1500);
});