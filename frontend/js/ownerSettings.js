console.log("[ownerSettings.js] Loaded - real restaurant settings");

const SETTINGS_API = "../../backend/controllers/OwnerSettingsController.php";

let currentRestaurantId = 0;
let lastLoadedSettings = null;

function readJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function getOwnerRestaurantSession() {
  const currentOwner = readJson("foodExpressCurrentOwner", {});
  const currentUser = readJson("foodExpressCurrentUser", {});
  const selectedRestaurant = readJson("foodExpressSelectedRestaurant", {});

  const id =
    localStorage.getItem("ownerRestaurantId") ||
    currentOwner.restaurantId ||
    currentOwner.restaurant_id ||
    currentOwner.ownerRestaurantId ||
    currentUser.restaurantId ||
    currentUser.restaurant_id ||
    selectedRestaurant.restaurant_id ||
    selectedRestaurant.id ||
    "";

  return Number(id || 0);
}

function setMessage(text, type = "") {
  const message = document.getElementById("settingsMessage");
  if (!message) return;

  message.textContent = text;
  message.className = type;
}

function setLoading(button, loading) {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
  } else {
    button.disabled = false;
    button.innerHTML =
      button.dataset.originalText ||
      `<i class="fa-solid fa-floppy-disk"></i> Save Settings`;
  }
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = Number(value || 0) === 1;
}

function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function getChecked(id) {
  return document.getElementById(id)?.checked ? "1" : "0";
}

function normalizeTime(value, fallback) {
  if (!value) return fallback;
  return String(value).slice(0, 5);
}

function updateEtaPreview() {
  const prep = Number(getValue("estimatedPrepMinutes") || 25);
  const handoff = Number(getValue("avgHandoffMinutes") || 5);
  const radius = Number(getValue("deliveryRadiusKm") || 5);
  const busy = document.getElementById("busyMode")?.checked;
  const accepting = document.getElementById("acceptingOrders")?.checked;
  const isOpen = document.getElementById("isOpen")?.checked;
  const delivery = document.getElementById("deliveryAvailable")?.checked;

  const busyExtra = busy ? 8 : 0;
  const radiusExtra = Math.ceil(radius * 1.5);
  const min = Math.max(10, prep + handoff + busyExtra + radiusExtra);
  const max = min + 12;

  const preview = document.getElementById("etaPreview");
  if (!preview) return;

  if (!isOpen) {
    preview.textContent =
      "Customer ETA: Restaurant is closed. Shop page should show the next opening time.";
    return;
  }

  if (!accepting) {
    preview.textContent =
      "Customer ETA: Restaurant is open but not accepting orders right now.";
    return;
  }

  if (!delivery) {
    preview.textContent =
      "Customer ETA: Delivery is disabled. Customers should not be allowed to place delivery orders.";
    return;
  }

  preview.textContent = `Smart customer ETA preview: around ${min}–${max} mins. Based on kitchen prep, handoff time, delivery radius, busy mode, active orders, and rider status.`;
}

function updateStatusSummary(data) {
  const card = document.getElementById("statusSummary");
  if (!card) return;

  const isOpen = Number(data.is_open || 0) === 1;
  const accepting = Number(data.accepting_orders || 0) === 1;
  const busy = Number(data.busy_mode || 0) === 1;

  card.className = `status-card ${isOpen ? "open" : "closed"}`;

  let label = isOpen ? "Open" : "Closed";
  let desc = isOpen ? "Restaurant is visible as open." : "Customers will see closed status.";

  if (isOpen && !accepting) {
    label = "Paused";
    desc = "Open but not accepting new orders.";
  }

  if (isOpen && accepting && busy) {
    label = "Busy Mode";
    desc = "Orders allowed with longer ETA.";
  }

  card.innerHTML = `
    <span class="status-dot"></span>
    <strong>${label}</strong>
    <small>${desc}</small>
  `;
}

function fillForm(data) {
  lastLoadedSettings = data;

  setValue("restaurantName", data.restaurant_name);
  setValue("description", data.description);
  setValue("cuisineType", data.cuisine_type);
  setValue("location", data.location);
  setValue("city", data.city);
  setValue("phone", data.phone);
  setValue("email", data.email);
  setValue("openingTime", normalizeTime(data.opening_time, "09:00"));
  setValue("closingTime", normalizeTime(data.closing_time, "22:00"));
  setChecked("deliveryAvailable", data.delivery_available);
  setChecked("isOpen", data.is_open);
  setChecked("acceptingOrders", data.accepting_orders);
  setChecked("busyMode", data.busy_mode);
  setValue("estimatedPrepMinutes", data.estimated_prep_minutes || 25);
  setValue("logoUrl", data.logo_url);
  setValue("coverImageUrl", data.cover_image_url);
  setChecked("pickupAvailable", data.pickup_available);
setChecked("autoPauseOverload", data.auto_pause_overload);
setValue("avgHandoffMinutes", data.avg_handoff_minutes || 5);
setValue("deliveryRadiusKm", data.delivery_radius_km || 5);
setValue("minOrderAmount", data.min_order_amount || 0);
setValue("packagingFee", data.packaging_fee || 0);
setChecked("showOnShop", data.show_on_shop);
setChecked("showBusyBanner", data.show_busy_banner);
setChecked("preorderAllowed", data.preorder_allowed);
setValue("outOfStockPolicy", data.out_of_stock_policy || "hide");
setChecked("notifyNewOrders", data.notify_new_orders);
setChecked("notifyCancellations", data.notify_cancellations);
setChecked("notifyLowStock", data.notify_low_stock);
setChecked("notifySupport", data.notify_support);

  document.getElementById("settingsTitle").textContent =
    `${data.restaurant_name || "Restaurant"} Settings`;

  localStorage.setItem("ownerRestaurantName", data.restaurant_name || "");
  updateStatusSummary(data);
  updateEtaPreview();
}

async function parseJsonResponse(response) {
  const raw = await response.text();

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("[ownerSettings.js] Non JSON response:", raw);
    throw new Error("Backend returned invalid JSON.");
  }
}

async function loadSettings() {
  if (typeof requireOwnerAuth === "function") {
    if (!requireOwnerAuth()) return;
  }

  currentRestaurantId = getOwnerRestaurantSession();

  if (!currentRestaurantId) {
    alert("Restaurant session not found. Please login again.");
    window.location.href = "restaurant-login.html";
    return;
  }

  setMessage("Loading restaurant settings...");

  try {
    const res = await fetch(
      `${SETTINGS_API}?action=get&restaurant_id=${encodeURIComponent(currentRestaurantId)}&_=${Date.now()}`
    );

    const data = await parseJsonResponse(res);

    if (!data.success || !data.data) {
      throw new Error(data.message || "Could not load settings.");
    }

    fillForm(data.data);
    setMessage("Settings loaded from database.", "success");
  } catch (error) {
    console.error("[ownerSettings.js] Load error:", error);
    setMessage(error.message || "Unable to load settings.", "error");
  }
}

async function saveSettings(event) {
  event.preventDefault();

  const button = document.getElementById("saveSettingsBtn");

  if (!currentRestaurantId) {
    setMessage("Restaurant session missing. Please login again.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("action", "update");
  formData.append("restaurant_id", currentRestaurantId);
  formData.append("restaurant_name", getValue("restaurantName"));
  formData.append("description", getValue("description"));
  formData.append("cuisine_type", getValue("cuisineType"));
  formData.append("location", getValue("location"));
  formData.append("city", getValue("city"));
  formData.append("phone", getValue("phone"));
  formData.append("email", getValue("email"));
  formData.append("opening_time", getValue("openingTime"));
  formData.append("closing_time", getValue("closingTime"));
  formData.append("delivery_available", getChecked("deliveryAvailable"));
  formData.append("is_open", getChecked("isOpen"));
  formData.append("accepting_orders", getChecked("acceptingOrders"));
  formData.append("busy_mode", getChecked("busyMode"));
  formData.append("estimated_prep_minutes", getValue("estimatedPrepMinutes"));
  formData.append("logo_url", getValue("logoUrl"));
  formData.append("cover_image_url", getValue("coverImageUrl"));
  formData.append("pickup_available", getChecked("pickupAvailable"));
formData.append("auto_pause_overload", getChecked("autoPauseOverload"));
formData.append("avg_handoff_minutes", getValue("avgHandoffMinutes"));
formData.append("delivery_radius_km", getValue("deliveryRadiusKm"));
formData.append("min_order_amount", getValue("minOrderAmount"));
formData.append("packaging_fee", getValue("packagingFee"));
formData.append("show_on_shop", getChecked("showOnShop"));
formData.append("show_busy_banner", getChecked("showBusyBanner"));
formData.append("preorder_allowed", getChecked("preorderAllowed"));
formData.append("out_of_stock_policy", getValue("outOfStockPolicy"));
formData.append("notify_new_orders", getChecked("notifyNewOrders"));
formData.append("notify_cancellations", getChecked("notifyCancellations"));
formData.append("notify_low_stock", getChecked("notifyLowStock"));
formData.append("notify_support", getChecked("notifySupport"));

  try {
    setLoading(button, true);
    setMessage("Saving settings...");

    const res = await fetch(`${SETTINGS_API}?action=update`, {
      method: "POST",
      body: formData,
    });

    const data = await parseJsonResponse(res);

    if (!data.success) {
      throw new Error(data.message || "Failed to save settings.");
    }

    localStorage.setItem("ownerRestaurantName", getValue("restaurantName"));

    const updatedSummary = {
      is_open: Number(getChecked("isOpen")),
      accepting_orders: Number(getChecked("acceptingOrders")),
      busy_mode: Number(getChecked("busyMode")),
    };

    updateStatusSummary(updatedSummary);
    updateEtaPreview();

    setMessage("Settings saved successfully.", "success");
  } catch (error) {
    console.error("[ownerSettings.js] Save error:", error);
    setMessage(error.message || "Unable to save settings.", "error");
  } finally {
    setLoading(button, false);
  }
}

function logout() {
  localStorage.removeItem("foodExpressCurrentOwner");
  localStorage.removeItem("ownerRestaurantId");
  localStorage.removeItem("ownerRestaurantName");
  localStorage.removeItem("foodExpressCurrentUser");
  localStorage.removeItem("isLoggedIn");
  window.location.href = "restaurant-login.html";
}

window.logout = logout;

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  document
    .getElementById("ownerSettingsForm")
    ?.addEventListener("submit", saveSettings);

  document.getElementById("resetBtn")?.addEventListener("click", () => {
    if (lastLoadedSettings) {
      fillForm(lastLoadedSettings);
      setMessage("Changes reset.", "success");
    }
  });

  [
  "isOpen",
  "acceptingOrders",
  "busyMode",
  "deliveryAvailable",
  "estimatedPrepMinutes",
  "avgHandoffMinutes",
  "deliveryRadiusKm",
  "pickupAvailable",
  "autoPauseOverload",
  "showOnShop",
  "showBusyBanner",
  "preorderAllowed",
].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", updateEtaPreview);
  document.getElementById(id)?.addEventListener("input", updateEtaPreview);
});
});