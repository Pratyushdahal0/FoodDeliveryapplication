const RESTAURANTS_KEY = "foodExpressRestaurants";
const CURRENT_OWNER_KEY = "foodExpressCurrentOwner";
const OWNER_REMEMBER_KEY = "foodExpressOwnerRemember";

document.addEventListener("DOMContentLoaded", () => {
  initializeRestaurantLogin();
});

function initializeRestaurantLogin() {
  const form = document.getElementById("restaurantLoginForm");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");

  prefillRememberedOwner();

  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener("click", toggleOwnerPassword);
  }

  if (form) {
    form.addEventListener("submit", handleOwnerLogin);
  }

  if (isOwnerAlreadyLoggedIn()) {
    window.location.href = "ownerdashboard.html";
  }
}

function handleOwnerLogin(event) {
  event.preventDefault();

  const emailInput = document.getElementById("ownerEmail");
  const passwordInput = document.getElementById("ownerPassword");
  const rememberInput = document.getElementById("rememberOwner");
  const loginBtn = document.getElementById("ownerLoginBtn");

  const email = emailInput?.value.trim().toLowerCase() || "";
  const password = passwordInput?.value || "";
  const rememberMe = rememberInput?.checked || false;

  if (!email || !password) {
    showMessage("Please enter both email and password.", "error");
    return;
  }

  const restaurants = getRestaurants();

  if (!restaurants.length) {
    showMessage(
      "No restaurant account found yet. Please register your restaurant first.",
      "error"
    );
    return;
  }

  const matchedRestaurant = restaurants.find((restaurant) => {
    const restaurantEmail = String(restaurant.email || "").trim().toLowerCase();
    const restaurantPassword = String(restaurant.password || "");

    return restaurantEmail === email && restaurantPassword === password;
  });

  if (!matchedRestaurant) {
    showMessage("Invalid email or password. Please try again.", "error");
    return;
  }

  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing In...";
  }

  const currentOwnerSession = buildOwnerSession(matchedRestaurant);

  localStorage.setItem(CURRENT_OWNER_KEY, JSON.stringify(currentOwnerSession));
  localStorage.setItem("ownerRestaurantId", currentOwnerSession.restaurantId);
  localStorage.setItem("ownerRestaurantName", currentOwnerSession.restaurantName);
  localStorage.setItem("isOwnerLoggedIn", "true");

  if (rememberMe) {
    localStorage.setItem(
      OWNER_REMEMBER_KEY,
      JSON.stringify({
        email: email,
        remember: true
      })
    );
  } else {
    localStorage.removeItem(OWNER_REMEMBER_KEY);
  }

  showMessage("Login successful. Redirecting to your dashboard...", "success");

  setTimeout(() => {
    window.location.href = "ownerdashboard.html";
  }, 700);
}

function buildOwnerSession(restaurant) {
  return {
    ownerId:
      restaurant.ownerId ||
      restaurant.id ||
      `owner_${Date.now()}`,
    restaurantId:
      String(
        restaurant.restaurantId ||
        restaurant.restaurant_id ||
        restaurant.id ||
        `rest_${Date.now()}`
      ),
    restaurantName:
      restaurant.restaurantName ||
      restaurant.restaurant_name ||
      restaurant.name ||
      restaurant.restaurant ||
      "Restaurant",
    email: restaurant.email || "",
    ownerName:
      restaurant.ownerName ||
      restaurant.owner_name ||
      restaurant.ownerFullName ||
      restaurant.fullName ||
      "Owner",
    phone:
      restaurant.phone ||
      restaurant.restaurantPhone ||
      restaurant.restaurant_phone ||
      "",
    location:
      restaurant.location ||
      restaurant.restaurantLocation ||
      restaurant.restaurant_location ||
      "",
    loginAt: new Date().toISOString()
  };
}

function getRestaurants() {
  return readJson(RESTAURANTS_KEY, []);
}

function isOwnerAlreadyLoggedIn() {
  const currentOwner = readJson(CURRENT_OWNER_KEY, null);
  return !!(currentOwner && currentOwner.restaurantId);
}

function prefillRememberedOwner() {
  const remembered = readJson(OWNER_REMEMBER_KEY, null);
  const emailInput = document.getElementById("ownerEmail");
  const rememberInput = document.getElementById("rememberOwner");

  if (!remembered) return;

  if (emailInput && remembered.email) {
    emailInput.value = remembered.email;
  }

  if (rememberInput) {
    rememberInput.checked = !!remembered.remember;
  }
}

function toggleOwnerPassword() {
  const passwordInput = document.getElementById("ownerPassword");
  const toggleBtn = document.getElementById("togglePasswordBtn");

  if (!passwordInput) return;

  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";

  if (toggleBtn) {
    toggleBtn.textContent = isPassword ? "🙈" : "👁️";
  }
}

function showMessage(message, type) {
  const messageBox = document.getElementById("loginMessage");
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = `message-box ${type}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}