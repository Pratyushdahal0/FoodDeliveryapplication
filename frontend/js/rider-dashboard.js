console.log("Rider dashboard JS loaded");

// 🔹 FAKE DATABASE (localStorage)
let riderData = JSON.parse(localStorage.getItem("riderData")) || {
  deliveriesToday: 8,
  activeDelivery: 0,
  earningsToday: 720,
};

// 🔹 UPDATE UI FUNCTION
function updateUI() {
  const todayDelivery = document.querySelector(".stat-card:nth-child(1) h2");
  const activeDelivery = document.querySelector(".stat-card:nth-child(2) h2");
  const todayEarnings = document.querySelector(".stat-card:nth-child(3) h2");

  if (todayDelivery) todayDelivery.innerText = riderData.deliveriesToday;
  if (activeDelivery) activeDelivery.innerText = riderData.activeDelivery;
  if (todayEarnings) todayEarnings.innerText = `Rs. ${riderData.earningsToday}`;
}

document.addEventListener("DOMContentLoaded", () => {

  updateUI(); // 🔥 INITIAL LOAD

  // 👉 SIDEBAR TOGGLE
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".sidebar");
  const main = document.querySelector(".main");

  if (menuToggle && sidebar && main) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("hide");
      main.classList.toggle("full");
    });
  }

  // 👉 ONLINE / OFFLINE
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

  // 👉 DELIVERY PROGRESS
  const steps = document.querySelectorAll(".progress-steps .step");
  const actionButtons = document.querySelectorAll(".delivery-actions button");

  let currentStep = 1;

  function updateSteps(stepIndex) {
    steps.forEach((step, index) => {
      if (index <= stepIndex) {
        step.classList.add("done");
        const circle = step.querySelector("span");
        if (circle && !circle.querySelector("i")) {
          circle.innerHTML = `<i class="fa-solid fa-check"></i>`;
        }
      }
    });
  }

  actionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.innerText.trim();

      if (text === "Picked Up") {
        currentStep = 2;
        updateSteps(currentStep);
      }

      if (text === "On The Way") {
        currentStep = 3;
        updateSteps(currentStep);
      }

      if (text === "Delivered") {
        currentStep = 4;
        updateSteps(currentStep);

        // 🔥 UPDATE DATA
        riderData.deliveriesToday += 1;
        riderData.activeDelivery = 0;
        riderData.earningsToday += 105;

        // 💾 SAVE
        localStorage.setItem("riderData", JSON.stringify(riderData));

        // 🔄 UPDATE UI
        updateUI();

        btn.innerText = "Completed";
        btn.disabled = true;
        btn.style.opacity = "0.6";
      }
    });
  });

  // 👉 ACCEPT ORDER
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

      // 🔥 UPDATE DATA
      riderData.activeDelivery = 1;

      // 💾 SAVE
      localStorage.setItem("riderData", JSON.stringify(riderData));

      // 🔄 UPDATE UI
      updateUI();

      btn.innerText = "Accepted";
      btn.disabled = true;
      btn.style.opacity = "0.6";

      orderCard.style.opacity = "0.5";
      orderCard.style.pointerEvents = "none";

      alert(`${orderId} accepted from ${restaurantName}. Estimated payout: ${payout}`);
    });
  });

});