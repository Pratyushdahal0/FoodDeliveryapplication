const MAX_POINTS = 1000;

function getUserPoints() {
  return Number(localStorage.getItem("userPoints")) || 850; // demo default
}

function setUserPoints(points) {
  localStorage.setItem("userPoints", points);
}

function renderRewards() {
  const points = getUserPoints();

  document.getElementById("pointsValue").textContent = points;

  const remaining = MAX_POINTS - points;

  document.getElementById("pointsText").textContent =
    `You're ${remaining} points away from a free meal`;

  document.getElementById("progressNumbers").textContent =
    `${points} / ${MAX_POINTS} points`;

  const percent = (points / MAX_POINTS) * 100;
  document.getElementById("progressBar").style.width = percent + "%";
}

function redeemReward(cost) {
  let points = getUserPoints();

  if (points < cost) {
    alert("Not enough points 😢");
    return;
  }

  points -= cost;
  setUserPoints(points);

  alert("Reward redeemed 🎉");

  renderRewards();
}

function logout() {
  localStorage.clear();
  window.location.href = "landingpage.html";
}

document.addEventListener("DOMContentLoaded", renderRewards);