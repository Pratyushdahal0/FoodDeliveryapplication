console.log("[rider-profile.js] Loaded - production rider profile");

const RIDER_PROFILE_KEY = "foodExpressRiderProfile";
const RIDER_CURRENT_KEY = "foodExpressCurrentRider";
const RIDER_SETTINGS_KEY = "foodExpressRiderSettings";
const RIDER_STATUS_KEY = "foodExpressRiderStatus";
const RIDER_HISTORY_KEY = "foodexpress_rider_history";

const DEFAULT_RIDER_PROFILE = {
  id: 1,
  name: "Pratyush Dahal",
  email: "rider@foodexpress.local",
  phone: "+977 9800000000",
  address: "New Baneshwor, Kathmandu",
  joinedAt: "2026-05-01T08:00:00",
  image: "https://i.pravatar.cc/180?img=12",

  vehicleType: "Bike",
  vehicleNumber: "Not added",
  licenseNumber: "Not added",
  deliveryZone: "Kathmandu Zone",
  maxDistance: "8 km",
  payoutMethod: "",

  emergencyName: "",
  emergencyPhone: "",

  rating: 4.9,
  verificationStatus: "verified",
};

document.addEventListener("DOMContentLoaded", () => {
  bindProfileEvents();
  renderProfilePage();

  window.addEventListener("storage", (event) => {
    if (
      event.key === RIDER_PROFILE_KEY ||
      event.key === RIDER_CURRENT_KEY ||
      event.key === RIDER_SETTINGS_KEY ||
      event.key === RIDER_STATUS_KEY ||
      event.key === RIDER_HISTORY_KEY
    ) {
      renderProfilePage();
    }
  });
});

/* ================= EVENTS ================= */

function bindProfileEvents() {
  document.getElementById("editProfileBtn")?.addEventListener("click", openProfileModal);
  document.getElementById("avatarEditBtn")?.addEventListener("click", openProfileModal);
  document.getElementById("closeProfileModal")?.addEventListener("click", closeProfileModal);
  document.getElementById("cancelProfileEdit")?.addEventListener("click", closeProfileModal);
  document.getElementById("resetProfileBtn")?.addEventListener("click", resetProfile);

  document.getElementById("profileModal")?.addEventListener("click", (event) => {
    if (event.target.id === "profileModal") closeProfileModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeProfileModal();
  });

  document.getElementById("profileForm")?.addEventListener("submit", saveProfileFromForm);
}

/* ================= MAIN RENDER ================= */

function renderProfilePage() {
  const profile = getProfile();
  const settings = getSettings();
  const status = getRiderStatus();
  const stats = getProfileStats();

  syncTopbar(profile, status);
  renderHero(profile, status);
  renderStats(profile, stats);
  renderPersonalInfo(profile);
  renderVehicleInfo(profile);
  renderEmergencyInfo(profile);
  renderVerification(profile);
  renderOperations(profile, settings, status);
}

function syncTopbar(profile, status) {
  setText("topbarRiderName", profile.name);
  setText("topbarRiderId", `Rider ID: RID-${String(profile.id || 1).padStart(4, "0")}`);

  const image = profile.image || DEFAULT_RIDER_PROFILE.image;

  const topbarImg = document.getElementById("topbarProfileImage");
  if (topbarImg) topbarImg.src = image;

  const topbarOnline = document.querySelector(".online-pill");
  if (topbarOnline) {
    topbarOnline.innerHTML = `<span></span> ${capitalize(status)}`;
    topbarOnline.classList.toggle("offline", status !== "online");
  }

  document.querySelector(".notification-btn small")?.classList.toggle("hide", false);
}

function renderHero(profile, status) {
  const image = profile.image || DEFAULT_RIDER_PROFILE.image;

  const profileAvatar = document.getElementById("profileAvatar");
  if (profileAvatar) profileAvatar.src = image;

  setText("profileName", profile.name);
  setText("profileMeta", `Rider ID: RID-${String(profile.id || 1).padStart(4, "0")} • ${profile.deliveryZone || "Kathmandu Zone"}`);
  setText("profilePhone", profile.phone || "Not added");
  setText("profileEmail", profile.email || "Not added");
  setText("profileRating", Number(profile.rating || 4.9).toFixed(1));

  const onlinePill = document.getElementById("profileOnlinePill");
  if (onlinePill) {
    onlinePill.classList.toggle("offline", status !== "online");
    onlinePill.innerHTML = `<i class="fa-solid fa-circle"></i> ${capitalize(status)}`;
  }

  const verificationPill = document.getElementById("verificationPill");
  const complete = isProfileOperationallyComplete(profile);

  if (verificationPill) {
    verificationPill.classList.toggle("pending", !complete);
    verificationPill.innerHTML = complete
      ? `<i class="fa-solid fa-circle-check"></i> Verified Rider`
      : `<i class="fa-solid fa-clock"></i> Profile needs update`;
  }
}

function renderStats(profile, stats) {
  setText("totalDelivered", stats.totalDelivered);
  setText("totalEarnings", formatMoney(stats.totalEarnings));
  setText("vehicleSummary", profile.vehicleType || "Bike");
  setText("vehiclePlateSummary", profile.vehicleNumber || "Not added");
  setText("zoneSummary", profile.deliveryZone || "Kathmandu");
}

function renderPersonalInfo(profile) {
  setText("infoName", profile.name);
  setText("infoEmail", profile.email || "Not added");
  setText("infoPhone", profile.phone || "Not added");
  setText("infoAddress", profile.address || "Kathmandu, Nepal");
  setText("infoJoined", formatJoinedDate(profile.joinedAt));
}

function renderVehicleInfo(profile) {
  const vehicleType = profile.vehicleType || "Bike";
  const vehicleNumber = profile.vehicleNumber || "Not added";
  const licenseNumber = profile.licenseNumber || "Not added";
  const maxDistance = profile.maxDistance || "8 km";

  setText("vehicleTitle", vehicleType);
  setText(
    "vehicleDetails",
    vehicleNumber && vehicleNumber !== "Not added"
      ? `${vehicleNumber} • ${maxDistance} delivery range`
      : "Plate number not added yet."
  );

  setText("vehicleType", vehicleType);
  setText("vehicleNumber", vehicleNumber);
  setText("licenseNumber", licenseNumber);
  setText("maxDistance", maxDistance);

  const icon = document.getElementById("vehicleIcon");
  if (icon) {
    icon.className = getVehicleIconClass(vehicleType);
  }
}

function renderEmergencyInfo(profile) {
  setText("emergencyName", profile.emergencyName || "Not added");
  setText(
    "emergencyPhone",
    profile.emergencyPhone || "Add emergency contact for safety."
  );
}

function renderVerification(profile) {
  const hasVehicle =
    profile.vehicleNumber &&
    profile.vehicleNumber !== "Not added" &&
    profile.vehicleNumber.trim() !== "";

  const hasLicense =
    profile.licenseNumber &&
    profile.licenseNumber !== "Not added" &&
    profile.licenseNumber.trim() !== "";

  const hasEmergency =
    profile.emergencyName &&
    profile.emergencyPhone &&
    profile.emergencyName.trim() !== "" &&
    profile.emergencyPhone.trim() !== "";

  toggleVerify("vehicleVerifyItem", hasVehicle);
  toggleVerify("licenseVerifyItem", hasLicense);
  toggleVerify("emergencyVerifyItem", hasEmergency);

  setText(
    "vehicleVerifyText",
    hasVehicle ? "Vehicle number added" : "Pending vehicle number"
  );

  setText(
    "licenseVerifyText",
    hasLicense ? "License number added" : "Pending license number"
  );

  setText(
    "emergencyVerifyText",
    hasEmergency ? "Emergency contact ready" : "Recommended for safety"
  );
}

function renderOperations(profile, settings, status) {
  setText("opsAvailability", capitalize(status));
  setText(
    "opsPayout",
    profile.payoutMethod ||
      settings.payoutMethod ||
      settings.payout_method ||
      "Not set"
  );
  setText(
    "opsZone",
    profile.deliveryZone ||
      settings.deliveryZone ||
      settings.delivery_zone ||
      "Kathmandu Zone"
  );
}

/* ================= MODAL ================= */

function openProfileModal() {
  const profile = getProfile();

  setInput("inputName", profile.name);
  setInput("inputPhone", profile.phone);
  setInput("inputEmail", profile.email);
  setInput("inputAddress", profile.address);
  setInput("inputVehicleType", profile.vehicleType || "Bike");
  setInput("inputVehicleNumber", profile.vehicleNumber === "Not added" ? "" : profile.vehicleNumber);
  setInput("inputLicenseNumber", profile.licenseNumber === "Not added" ? "" : profile.licenseNumber);
  setInput("inputZone", profile.deliveryZone || "Kathmandu Zone");
  setInput("inputMaxDistance", profile.maxDistance || "8 km");
  setInput("inputPayoutMethod", profile.payoutMethod || "");
  setInput("inputEmergencyName", profile.emergencyName || "");
  setInput("inputEmergencyPhone", profile.emergencyPhone || "");
  setInput("inputImage", profile.image || "");

  document.getElementById("profileModal")?.classList.add("show");
}

function closeProfileModal() {
  document.getElementById("profileModal")?.classList.remove("show");
}

function saveProfileFromForm(event) {
  event.preventDefault();

  const existing = getProfile();

  const nextProfile = {
    ...existing,
    name: cleanInput("inputName") || DEFAULT_RIDER_PROFILE.name,
    phone: cleanInput("inputPhone"),
    email: cleanInput("inputEmail"),
    address: cleanInput("inputAddress") || "Kathmandu, Nepal",
    vehicleType: cleanInput("inputVehicleType") || "Bike",
    vehicleNumber: cleanInput("inputVehicleNumber") || "Not added",
    licenseNumber: cleanInput("inputLicenseNumber") || "Not added",
    deliveryZone: cleanInput("inputZone") || "Kathmandu Zone",
    maxDistance: cleanInput("inputMaxDistance") || "8 km",
    payoutMethod: cleanInput("inputPayoutMethod"),
    emergencyName: cleanInput("inputEmergencyName"),
    emergencyPhone: cleanInput("inputEmergencyPhone"),
    image: cleanInput("inputImage") || DEFAULT_RIDER_PROFILE.image,
    updatedAt: new Date().toISOString(),
  };

  saveProfile(nextProfile);
  closeProfileModal();
  renderProfilePage();

  showToast("Rider profile saved successfully.");
}

function resetProfile() {
  const confirmed = window.confirm(
    "Reset rider profile to default beta rider details?"
  );

  if (!confirmed) return;

  saveProfile({
    ...DEFAULT_RIDER_PROFILE,
    updatedAt: new Date().toISOString(),
  });

  renderProfilePage();
  showToast("Rider profile reset.");
}

/* ================= DATA ================= */

function getProfile() {
  const stored =
    readJson(RIDER_PROFILE_KEY, null) ||
    readJson(RIDER_CURRENT_KEY, null) ||
    {};

  const settings = getSettings();

  const profile = {
    ...DEFAULT_RIDER_PROFILE,
    ...stored,
  };

  const localName =
    localStorage.getItem("riderName") ||
    localStorage.getItem("foodExpressRiderName") ||
    "";

  const localEmail =
    localStorage.getItem("riderEmail") ||
    localStorage.getItem("foodExpressRiderEmail") ||
    "";

  const localPhone =
    localStorage.getItem("riderPhone") ||
    localStorage.getItem("foodExpressRiderPhone") ||
    "";

  if (localName && !/owner/i.test(localName)) profile.name = localName;
  if (localEmail && !/owner/i.test(localEmail)) profile.email = localEmail;
  if (localPhone) profile.phone = localPhone;

  profile.id =
    profile.id ||
    profile.rider_id ||
    localStorage.getItem("riderUserId") ||
    localStorage.getItem("foodExpressRiderId") ||
    1;

  profile.deliveryZone =
    profile.deliveryZone ||
    profile.delivery_zone ||
    settings.deliveryZone ||
    settings.delivery_zone ||
    "Kathmandu Zone";

  profile.payoutMethod =
    profile.payoutMethod ||
    profile.payout_method ||
    settings.payoutMethod ||
    settings.payout_method ||
    "";

  profile.image =
    profile.image ||
    profile.profileImage ||
    profile.profile_image ||
    profile.avatar ||
    profile.photo ||
    DEFAULT_RIDER_PROFILE.image;

  return profile;
}

function saveProfile(profile) {
  const normalized = {
    ...profile,
    id: Number(profile.id || 1),
  };

  localStorage.setItem(RIDER_PROFILE_KEY, JSON.stringify(normalized));
  localStorage.setItem(RIDER_CURRENT_KEY, JSON.stringify(normalized));

  localStorage.setItem("riderName", normalized.name || "");
  localStorage.setItem("foodExpressRiderName", normalized.name || "");

  localStorage.setItem("riderEmail", normalized.email || "");
  localStorage.setItem("foodExpressRiderEmail", normalized.email || "");

  localStorage.setItem("riderPhone", normalized.phone || "");
  localStorage.setItem("foodExpressRiderPhone", normalized.phone || "");

  window.dispatchEvent(new Event("foodExpressRiderProfileUpdated"));
}

function getSettings() {
  return readJson(RIDER_SETTINGS_KEY, {});
}

function getRiderStatus() {
  const raw =
    localStorage.getItem(RIDER_STATUS_KEY) ||
    readJson(RIDER_SETTINGS_KEY, {})?.availability ||
    "online";

  const status = String(raw || "online").toLowerCase();

  if (status.includes("break")) return "break";
  if (status.includes("offline")) return "offline";

  return "online";
}

function getProfileStats() {
  const history = readJson(RIDER_HISTORY_KEY, []);
  const records = Array.isArray(history) ? history : [];

  const delivered = records.filter((order) => {
    const status = String(order.status || order.deliveryStatus || order.delivery_status || "delivered").toLowerCase();
    return status.includes("deliver");
  });

  const totalEarnings = delivered.reduce((sum, order) => {
    return sum + getEarning(order);
  }, 0);

  return {
    totalDelivered: delivered.length,
    totalEarnings,
  };
}

/* ================= HELPERS ================= */

function getEarning(order = {}) {
  const amount = Number(
    order.earning ||
      order.rider_earning ||
      order.delivery_earning ||
      order.amount ||
      order.fee ||
      0
  );

  if (amount > 0) return Math.round(amount);

  const total = Number(order.total || 0);
  if (total > 0) return Math.max(100, Math.round(total * 0.08 + 70));

  return 0;
}

function isProfileOperationallyComplete(profile) {
  const hasName = Boolean(profile.name && profile.name.trim());
  const hasPhone = Boolean(profile.phone && profile.phone.trim());
  const hasVehicle = Boolean(
    profile.vehicleNumber &&
      profile.vehicleNumber !== "Not added" &&
      profile.vehicleNumber.trim()
  );
  const hasLicense = Boolean(
    profile.licenseNumber &&
      profile.licenseNumber !== "Not added" &&
      profile.licenseNumber.trim()
  );

  return hasName && hasPhone && hasVehicle && hasLicense;
}

function toggleVerify(id, done) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.toggle("done", Boolean(done));
}

function getVehicleIconClass(type) {
  const value = String(type || "").toLowerCase();

  if (value.includes("scooter")) return "fa-solid fa-motorcycle";
  if (value.includes("cycle")) return "fa-solid fa-bicycle";
  if (value.includes("car")) return "fa-solid fa-car";

  return "fa-solid fa-motorcycle";
}

function formatMoney(amount) {
  return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatJoinedDate(value) {
  const date = parseDate(value);

  if (!date) return "May 2026";

  return date.toLocaleDateString("en-NP", {
    month: "long",
    year: "numeric",
  });
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function capitalize(value) {
  const text = String(value || "").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setInput(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || "";
}

function cleanInput(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`[rider-profile.js] Could not parse ${key}`, error);
    return fallback;
  }
}

function showToast(message) {
  const toast = document.getElementById("profileToast");

  if (!toast) {
    console.log("[rider-profile]", message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}