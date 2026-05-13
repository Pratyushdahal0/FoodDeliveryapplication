/* ================================
   RIDER SETTINGS JS
   Production sync version
   Syncs: Settings ↔ Profile ↔ Dashboard ↔ Topbar
================================ */

console.log("[rider-settings.js] Loaded - production sync settings");

const RIDER_SETTINGS_KEY = "foodExpressRiderSettings";
const RIDER_STATUS_KEY = "foodExpressRiderStatus";
const RIDER_PROFILE_KEY = "foodExpressRiderProfile";
const RIDER_CURRENT_KEY = "foodExpressCurrentRider";
const RIDER_SECURITY_LOG_KEY = "foodExpressRiderSecurityLogs";
const RIDER_DELETE_REQUEST_KEY = "foodExpressRiderDeleteRequest";
const RIDER_DATA_REQUEST_KEY = "foodExpressRiderDataRequest";
const RIDER_LAST_UPDATED_KEY = "foodExpressRiderSettingsUpdatedAt";

const defaultSettings = {
  availability: {
    online: true,
    autoAccept: false,
    breakMode: false,
    radius: "5",
    preferredArea: "Kathmandu",
  },

  notifications: {
    newOrders: true,
    payoutAlerts: true,
    supportMessages: true,
    promotions: false,
    sound: true,
    email: true,
    sms: false,
  },

  payout: {
    method: "Bank Transfer",
    bankName: "Nabil Bank",
    accountName: "Pratyush Dahal",
    accountNumber: "XXXXXXXX1234",
    walletNumber: "",
  },

  security: {
    twoFactor: false,
    loginAlerts: true,
    passwordChangedAt: null,
    devicesLoggedOutAt: null,
  },

  preferences: {
    darkMode: false,
    compactMode: false,
    language: "English",
    currency: "NPR",
  },

  /* Flat mirror fields for other pages */
  payoutMethod: "Bank Transfer",
  deliveryZone: "Kathmandu Zone",
  deliveryRadius: "5 km",
  preferredArea: "Kathmandu",
};

document.addEventListener("DOMContentLoaded", () => {
  initSettingsPage();
});

/* ================================
   INIT
================================ */

function initSettingsPage() {
  const settings = getSettings();

  hydrateTopbar();
  populateSettings(settings);
  applyLiveUI(settings);
  updatePayoutFields();
  bindEvents();

  syncSettingsToLocalStatus(settings);
  syncSettingsToProfile(settings);
}

/* ================================
   STORAGE
================================ */

function getSettings() {
  const stored = localStorage.getItem(RIDER_SETTINGS_KEY);

  if (!stored) {
    const fresh = normalizeSettings(defaultSettings);
    saveSettings(fresh, false);
    return clone(fresh);
  }

  try {
    const parsed = JSON.parse(stored);
    const merged = deepMerge(clone(defaultSettings), parsed);
    const normalized = normalizeSettings(merged);

    syncSettingsToLocalStatus(normalized);
    syncSettingsToProfile(normalized);

    return normalized;
  } catch (error) {
    console.warn("[rider-settings.js] Invalid settings. Resetting.", error);

    const fresh = normalizeSettings(defaultSettings);
    saveSettings(fresh, false);
    return clone(fresh);
  }
}

function saveSettings(settings, showMessage = true) {
  const cleanSettings = normalizeSettings(settings);

  localStorage.setItem(RIDER_SETTINGS_KEY, JSON.stringify(cleanSettings));
  localStorage.setItem(RIDER_LAST_UPDATED_KEY, new Date().toISOString());

  syncSettingsToLocalStatus(cleanSettings);
  syncSettingsToProfile(cleanSettings);

  if (typeof window.applyGlobalRiderStatus === "function") {
    window.applyGlobalRiderStatus();
  }

  window.dispatchEvent(
    new CustomEvent("foodExpressRiderSettingsUpdated", {
      detail: cleanSettings,
    })
  );

  window.dispatchEvent(
    new CustomEvent("foodExpressRiderStatusUpdated", {
      detail: {
        status: getStatusFromSettings(cleanSettings),
      },
    })
  );

  if (showMessage) {
    showToast("Settings saved successfully.", "success");
  }

  return cleanSettings;
}

function normalizeSettings(settings) {
  const normalized = deepMerge(clone(defaultSettings), settings || {});

  normalized.preferences.currency = "NPR";

  normalized.availability.radius = String(
    normalized.availability.radius || "5"
  ).replace(" km", "");

  const allowedRadius = ["3", "5", "8", "10", "15"];
  if (!allowedRadius.includes(normalized.availability.radius)) {
    normalized.availability.radius = "5";
  }

  normalized.availability.preferredArea = String(
    normalized.availability.preferredArea || "Kathmandu"
  ).trim();

  if (!normalized.availability.preferredArea) {
    normalized.availability.preferredArea = "Kathmandu";
  }

  if (!normalized.availability.online) {
    normalized.availability.breakMode = false;
    normalized.availability.autoAccept = false;
  }

  if (normalized.availability.breakMode) {
    normalized.availability.online = true;
    normalized.availability.autoAccept = false;
  }

  normalized.payout.method = normalized.payout.method || "Bank Transfer";
  normalized.payout.bankName = String(normalized.payout.bankName || "").trim();
  normalized.payout.accountName = String(
    normalized.payout.accountName || ""
  ).trim();
  normalized.payout.accountNumber = String(
    normalized.payout.accountNumber || ""
  ).trim();
  normalized.payout.walletNumber = String(
    normalized.payout.walletNumber || ""
  ).trim();

  /* Flat mirror fields for profile/dashboard compatibility */
  normalized.payoutMethod = normalized.payout.method;
  normalized.deliveryZone = `${normalized.availability.preferredArea} Zone`;
  normalized.deliveryRadius = `${normalized.availability.radius} km`;
  normalized.preferredArea = normalized.availability.preferredArea;
  normalized.payout_method = normalized.payout.method;
  normalized.delivery_zone = normalized.deliveryZone;
  normalized.maxDistance = `${normalized.availability.radius} km`;

  return normalized;
}

function resetSettings() {
  const fresh = normalizeSettings(defaultSettings);

  saveSettings(fresh, false);
  populateSettings(fresh);
  applyLiveUI(fresh);
  updatePayoutFields();

  showToast("Settings reset to default.", "success");
}

function syncSettingsToLocalStatus(settings) {
  localStorage.setItem(RIDER_STATUS_KEY, getStatusFromSettings(settings));
}

function getStatusFromSettings(settings) {
  if (!settings.availability.online) return "offline";
  if (settings.availability.breakMode) return "break";
  return "online";
}

function syncSettingsToProfile(settings) {
  const profile = readJsonObject(RIDER_PROFILE_KEY, null) || {};
  const currentRider = readJsonObject(RIDER_CURRENT_KEY, null) || {};

  const merged = {
    ...currentRider,
    ...profile,

    payoutMethod: settings.payout.method,
    payout_method: settings.payout.method,

    deliveryZone: `${settings.availability.preferredArea} Zone`,
    delivery_zone: `${settings.availability.preferredArea} Zone`,

    maxDistance: `${settings.availability.radius} km`,
    max_distance: `${settings.availability.radius} km`,

    preferredArea: settings.availability.preferredArea,

    updatedAt: new Date().toISOString(),
  };

  if (settings.payout.method === "Bank Transfer") {
    merged.bankName = settings.payout.bankName;
    merged.accountName = settings.payout.accountName;
    merged.accountNumber = settings.payout.accountNumber;
  } else {
    merged.walletNumber = settings.payout.walletNumber;
  }

  localStorage.setItem(RIDER_PROFILE_KEY, JSON.stringify(merged));
  localStorage.setItem(RIDER_CURRENT_KEY, JSON.stringify(merged));

  window.dispatchEvent(
    new CustomEvent("foodExpressRiderProfileUpdated", {
      detail: merged,
    })
  );
}

/* ================================
   POPULATE / COLLECT
================================ */

function populateSettings(settings) {
  setChecked("onlineToggle", settings.availability.online);
  setChecked("autoAcceptToggle", settings.availability.autoAccept);
  setChecked("breakModeToggle", settings.availability.breakMode);

  setValue("deliveryRadius", settings.availability.radius);
  setValue("preferredArea", settings.availability.preferredArea);

  setChecked("newOrdersToggle", settings.notifications.newOrders);
  setChecked("payoutAlertsToggle", settings.notifications.payoutAlerts);
  setChecked("supportMessagesToggle", settings.notifications.supportMessages);
  setChecked("promotionsToggle", settings.notifications.promotions);
  setChecked("soundToggle", settings.notifications.sound);
  setChecked("emailToggle", settings.notifications.email);
  setChecked("smsToggle", settings.notifications.sms);

  setValue("payoutMethod", settings.payout.method);
  setValue("bankName", settings.payout.bankName);
  setValue("accountName", settings.payout.accountName);
  setValue("accountNumber", settings.payout.accountNumber);
  setValue("walletNumber", settings.payout.walletNumber);

  setChecked("twoFactorToggle", settings.security.twoFactor);
  setChecked("loginAlertsToggle", settings.security.loginAlerts);

  setChecked("darkModeToggle", settings.preferences.darkMode);
  setChecked("compactModeToggle", settings.preferences.compactMode);

  setValue("languageSelect", settings.preferences.language);
  setValue("currencySelect", "NPR");

  updateDisabledStates(settings);
}

function collectSettingsFromUI() {
  const previous = getSettings();

  return normalizeSettings({
    availability: {
      online: getChecked("onlineToggle"),
      autoAccept: getChecked("autoAcceptToggle"),
      breakMode: getChecked("breakModeToggle"),
      radius: getValue("deliveryRadius") || "5",
      preferredArea: getValue("preferredArea") || "Kathmandu",
    },

    notifications: {
      newOrders: getChecked("newOrdersToggle"),
      payoutAlerts: getChecked("payoutAlertsToggle"),
      supportMessages: getChecked("supportMessagesToggle"),
      promotions: getChecked("promotionsToggle"),
      sound: getChecked("soundToggle"),
      email: getChecked("emailToggle"),
      sms: getChecked("smsToggle"),
    },

    payout: {
      method: getValue("payoutMethod") || "Bank Transfer",
      bankName: getValue("bankName"),
      accountName: getValue("accountName"),
      accountNumber: getValue("accountNumber"),
      walletNumber: getValue("walletNumber"),
    },

    security: {
      twoFactor: getChecked("twoFactorToggle"),
      loginAlerts: getChecked("loginAlertsToggle"),
      passwordChangedAt: previous.security.passwordChangedAt,
      devicesLoggedOutAt: previous.security.devicesLoggedOutAt,
    },

    preferences: {
      darkMode: getChecked("darkModeToggle"),
      compactMode: getChecked("compactModeToggle"),
      language: getValue("languageSelect") || "English",
      currency: "NPR",
    },
  });
}

/* ================================
   EVENTS
================================ */

function bindEvents() {
  document
    .getElementById("saveSettingsTopBtn")
    ?.addEventListener("click", handleSave);

  document
    .getElementById("saveSettingsBottomBtn")
    ?.addEventListener("click", handleSave);

  document
    .getElementById("resetSettingsBtn")
    ?.addEventListener("click", handleReset);

  bindAvailabilityEvents();
  bindPreferenceEvents();
  bindPayoutEvents();
  bindSecurityActions();
  bindAccountActions();
}

function bindAvailabilityEvents() {
  const onlineToggle = document.getElementById("onlineToggle");
  const breakModeToggle = document.getElementById("breakModeToggle");
  const autoAcceptToggle = document.getElementById("autoAcceptToggle");
  const deliveryRadius = document.getElementById("deliveryRadius");
  const preferredArea = document.getElementById("preferredArea");

  onlineToggle?.addEventListener("change", () => {
    if (!onlineToggle.checked) {
      setChecked("breakModeToggle", false);
      setChecked("autoAcceptToggle", false);
    }

    const saved = saveAvailabilityImmediately();

    showToast(
      saved.availability.online
        ? "You are online and available for requests."
        : "You are offline. New delivery requests are paused.",
      saved.availability.online ? "success" : "warning"
    );
  });

  breakModeToggle?.addEventListener("change", () => {
    if (breakModeToggle.checked) {
      setChecked("onlineToggle", true);
      setChecked("autoAcceptToggle", false);
    }

    const saved = saveAvailabilityImmediately();

    showToast(
      saved.availability.breakMode
        ? "Break mode is active. Requests are paused."
        : "Break mode turned off.",
      saved.availability.breakMode ? "warning" : "success"
    );
  });

  autoAcceptToggle?.addEventListener("change", () => {
    if (autoAcceptToggle.checked) {
      setChecked("onlineToggle", true);
      setChecked("breakModeToggle", false);
    }

    const saved = saveAvailabilityImmediately();

    showToast(
      saved.availability.autoAccept
        ? "Auto accept enabled."
        : "Auto accept disabled.",
      "success"
    );
  });

  deliveryRadius?.addEventListener("change", () => {
    const saved = saveAvailabilityImmediately();
    showToast(`Delivery radius set to ${saved.availability.radius} km.`, "success");
  });

  preferredArea?.addEventListener(
    "input",
    debounce(() => {
      const area = preferredArea.value.trim();

      if (area.length > 40) {
        preferredArea.value = area.slice(0, 40);
        showToast("Preferred area cannot be longer than 40 characters.", "warning");
        return;
      }

      saveAvailabilityImmediately();
    }, 450)
  );
}

function saveAvailabilityImmediately() {
  const settings = collectSettingsFromUI();
  const saved = saveSettings(settings, false);

  populateSettings(saved);
  applyLiveUI(saved);
  updatePayoutFields();

  return saved;
}

function bindPreferenceEvents() {
  document.getElementById("darkModeToggle")?.addEventListener("change", () => {
    const settings = collectSettingsFromUI();
    applyPreferenceClasses(settings);
  });

  document.getElementById("compactModeToggle")?.addEventListener("change", () => {
    const settings = collectSettingsFromUI();
    applyPreferenceClasses(settings);
  });

  document.getElementById("languageSelect")?.addEventListener("change", () => {
    showToast("Language preference updated. Save changes to keep it.", "success");
  });

  const currencySelect = document.getElementById("currencySelect");
  if (currencySelect) {
    currencySelect.value = "NPR";
    currencySelect.disabled = true;
    currencySelect.title = "FoodExpress currently supports NPR only.";
  }
}

function bindPayoutEvents() {
  const payoutMethod = document.getElementById("payoutMethod");

  payoutMethod?.addEventListener("change", () => {
    updatePayoutFields();

    const method = getValue("payoutMethod");

    if (method === "Bank Transfer") {
      showToast("Bank payout fields enabled. Save changes to sync profile.", "success");
    } else {
      showToast(`${method} wallet payout selected. Add wallet number.`, "success");
    }
  });

  ["bankName", "accountName", "accountNumber", "walletNumber"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", () => {
      document.getElementById(id)?.classList.remove("input-error");
    });
  });
}

function bindSecurityActions() {
  document
    .getElementById("changePasswordBtn")
    ?.addEventListener("click", handleChangePassword);

  document
    .getElementById("logoutDevicesBtn")
    ?.addEventListener("click", handleLogoutAllDevices);
}

function bindAccountActions() {
  document
    .getElementById("downloadDataBtn")
    ?.addEventListener("click", handleDownloadData);

  document
    .getElementById("deleteAccountBtn")
    ?.addEventListener("click", handleDeleteAccountRequest);
}

/* ================================
   SAVE / RESET
================================ */

function handleSave() {
  try {
    const settings = collectSettingsFromUI();
    const validation = validateSettings(settings);

    if (!validation.valid) {
      showToast(validation.message, "error");

      if (validation.fieldId) {
        focusElement(validation.fieldId);
      }

      return;
    }

    const saved = saveSettings(settings, false);

    populateSettings(saved);
    applyLiveUI(saved);
    updatePayoutFields();

    showToast("Settings saved and synced with rider profile.", "success");
  } catch (error) {
    console.error("[rider-settings.js] Save failed:", error);
    showToast("Something went wrong while saving settings.", "error");
  }
}

function handleReset() {
  const confirmReset = confirm(
    "Reset rider settings to default values? This will not delete delivery history."
  );

  if (!confirmReset) return;

  resetSettings();
}

/* ================================
   VALIDATION
================================ */

function validateSettings(settings) {
  const area = String(settings.availability.preferredArea || "").trim();

  if (area.length < 2) {
    return {
      valid: false,
      fieldId: "preferredArea",
      message: "Please enter a valid preferred area.",
    };
  }

  if (area.length > 40) {
    return {
      valid: false,
      fieldId: "preferredArea",
      message: "Preferred area must be under 40 characters.",
    };
  }

  const payoutMethod = String(settings.payout.method || "Bank Transfer");

  if (payoutMethod === "Bank Transfer") {
    if (!String(settings.payout.bankName || "").trim()) {
      return {
        valid: false,
        fieldId: "bankName",
        message: "Please enter your bank name.",
      };
    }

    if (!String(settings.payout.accountName || "").trim()) {
      return {
        valid: false,
        fieldId: "accountName",
        message: "Please enter the account holder name.",
      };
    }

    if (!isValidAccountNumber(settings.payout.accountNumber)) {
      return {
        valid: false,
        fieldId: "accountNumber",
        message: "Please enter a valid account number.",
      };
    }
  }

  if (payoutMethod === "eSewa" || payoutMethod === "Khalti") {
    if (!isValidNepaliPhone(settings.payout.walletNumber)) {
      return {
        valid: false,
        fieldId: "walletNumber",
        message: "Please enter a valid eSewa/Khalti phone number.",
      };
    }
  }

  return {
    valid: true,
    fieldId: null,
    message: "Valid settings.",
  };
}

function isValidAccountNumber(value) {
  const clean = String(value || "").trim();

  if (/^[Xx*]{4,}\d{3,}$/.test(clean)) return true;

  return /^[0-9]{6,24}$/.test(clean.replace(/\s+/g, ""));
}

function isValidNepaliPhone(value) {
  let clean = String(value || "").trim();
  clean = clean.replace(/[\s\-()]/g, "");

  if (clean.startsWith("977")) {
    clean = `+${clean}`;
  }

  if (/^9[78]\d{8}$/.test(clean)) return true;
  if (/^\+9779[78]\d{8}$/.test(clean)) return true;

  return false;
}

/* ================================
   LIVE UI
================================ */

function applyLiveUI(settings) {
  applyStatusUI(settings);
  applyPreferenceClasses(settings);
  updateAlertMessage(settings);
  updateDisabledStates(settings);
}

function applyStatusUI(settings) {
  const badge = document.getElementById("availabilityBadge");
  const onlinePill = document.getElementById("onlinePill");
  const onlineText = document.getElementById("onlineText");

  const status = getStatusFromSettings(settings);

  let label = "Online";
  let statusClass = "";

  if (status === "offline") {
    label = "Offline";
    statusClass = "offline";
  }

  if (status === "break") {
    label = "On Break";
    statusClass = "break";
  }

  if (badge) {
    badge.textContent = label;
    badge.className = `status-badge ${statusClass}`;
  }

  if (onlineText) onlineText.textContent = label;

  if (onlinePill) {
    onlinePill.classList.remove("offline", "break");

    if (statusClass) {
      onlinePill.classList.add(statusClass);
    }
  }
}

function updateAlertMessage(settings) {
  const alertText = document.getElementById("settingsAlertText");
  if (!alertText) return;

  if (!settings.availability.online) {
    alertText.textContent =
      "You are offline. You will not receive new delivery requests.";
    return;
  }

  if (settings.availability.breakMode) {
    alertText.textContent =
      "Break mode is active. You are logged in but paused from receiving requests.";
    return;
  }

  if (settings.availability.autoAccept) {
    alertText.textContent = `Auto accept is enabled for suitable jobs within ${settings.availability.radius} km in ${settings.availability.preferredArea}.`;
    return;
  }

  alertText.textContent =
    "Your availability status controls whether you receive new delivery requests.";
}

function updateDisabledStates(settings) {
  const autoAcceptToggle = document.getElementById("autoAcceptToggle");

  if (autoAcceptToggle) {
    autoAcceptToggle.disabled =
      !settings.availability.online || settings.availability.breakMode;
  }
}

function updatePayoutFields() {
  const method = getValue("payoutMethod") || "Bank Transfer";
  const walletField = document.getElementById("walletField");
  const bankFields = document.querySelectorAll(".bank-field");

  if (method === "Bank Transfer") {
    bankFields.forEach((field) => {
      field.style.display = "grid";
    });

    if (walletField) {
      walletField.classList.remove("show");
      walletField.style.display = "none";
    }
  } else {
    bankFields.forEach((field) => {
      field.style.display = "none";
    });

    if (walletField) {
      walletField.classList.add("show");
      walletField.style.display = "grid";
    }
  }
}

function applyPreferenceClasses(settings) {
  document.body.classList.toggle(
    "rider-dark-mode",
    Boolean(settings.preferences.darkMode)
  );

  document.body.classList.toggle(
    "rider-compact-mode",
    Boolean(settings.preferences.compactMode)
  );
}

/* ================================
   TOPBAR PROFILE
================================ */

function hydrateTopbar() {
  const defaultProfile = {
    id: 1,
    name: "Pratyush Dahal",
    image: "https://i.pravatar.cc/80?img=12",
  };

  const storedProfile = readJsonObject(RIDER_PROFILE_KEY, null);
  const currentRider = readJsonObject(RIDER_CURRENT_KEY, null);

  const profile = {
    ...defaultProfile,
    ...(currentRider || {}),
    ...(storedProfile || {}),
  };

  const riderId = profile.riderId || profile.rider_id || profile.id || 1;
  const image =
    profile.image ||
    profile.avatar ||
    profile.profileImage ||
    profile.profile_image ||
    defaultProfile.image;

  setText("topbarName", profile.name || defaultProfile.name);
  setText("topbarId", `Rider ID: RID-${String(riderId).padStart(4, "0")}`);

  const avatar = document.getElementById("topbarAvatar");
  if (avatar) avatar.src = image;
}

/* ================================
   SECURITY ACTIONS
================================ */

function handleChangePassword() {
  const currentPassword = prompt("Enter current password:");
  if (currentPassword === null) return;

  if (currentPassword.trim().length < 4) {
    showToast("Current password is too short.", "error");
    return;
  }

  const newPassword = prompt("Enter new password:");
  if (newPassword === null) return;

  const passwordCheck = validatePasswordStrength(newPassword);

  if (!passwordCheck.valid) {
    showToast(passwordCheck.message, "error");
    return;
  }

  const confirmPassword = prompt("Confirm new password:");
  if (confirmPassword === null) return;

  if (newPassword !== confirmPassword) {
    showToast("New password and confirm password do not match.", "error");
    return;
  }

  const settings = getSettings();
  settings.security.passwordChangedAt = new Date().toISOString();

  saveSettings(settings, false);
  addSecurityLog("Password changed");

  showToast("Password changed successfully.", "success");
}

function validatePasswordStrength(password) {
  const value = String(password || "");

  if (value.length < 8) {
    return {
      valid: false,
      message: "Password must be at least 8 characters.",
    };
  }

  if (!/[A-Z]/.test(value)) {
    return {
      valid: false,
      message: "Password must include one uppercase letter.",
    };
  }

  if (!/[0-9]/.test(value)) {
    return {
      valid: false,
      message: "Password must include one number.",
    };
  }

  return {
    valid: true,
    message: "Strong password.",
  };
}

function handleLogoutAllDevices() {
  const confirmLogout = confirm(
    "Logout from all devices? Your current local testing session will stay active."
  );

  if (!confirmLogout) return;

  const settings = getSettings();
  settings.security.devicesLoggedOutAt = new Date().toISOString();

  saveSettings(settings, false);
  addSecurityLog("Logged out from all devices");

  showToast("All other devices have been logged out.", "success");
}

function addSecurityLog(action) {
  const logs = readJsonArray(RIDER_SECURITY_LOG_KEY);

  logs.unshift({
    id: generateId("SEC"),
    action,
    createdAt: new Date().toISOString(),
  });

  localStorage.setItem(RIDER_SECURITY_LOG_KEY, JSON.stringify(logs.slice(0, 20)));
}

/* ================================
   ACCOUNT ACTIONS
================================ */

function handleDownloadData() {
  const settings = getSettings();
  const profile = readJsonObject(RIDER_PROFILE_KEY, {});

  const exportData = {
    exportedAt: new Date().toISOString(),
    riderProfile: profile,
    riderSettings: settings,
    riderStatus: localStorage.getItem(RIDER_STATUS_KEY) || "online",
    securityLogs: readJsonArray(RIDER_SECURITY_LOG_KEY),
    note: "Frontend demo export data from FoodExpress Rider Panel.",
  };

  localStorage.setItem(
    RIDER_DATA_REQUEST_KEY,
    JSON.stringify({
      id: generateId("DATA"),
      status: "completed",
      createdAt: new Date().toISOString(),
    })
  );

  downloadJsonFile(exportData, `foodexpress-rider-data-${Date.now()}.json`);
  showToast("Account data downloaded.", "success");
}

function handleDeleteAccountRequest() {
  const existingRequest = readJsonObject(RIDER_DELETE_REQUEST_KEY, null);

  if (existingRequest && existingRequest.status === "pending") {
    showToast("Account deletion request is already pending.", "warning");
    return;
  }

  const confirmed = confirm(
    "Request account deletion? In a real system, admin approval and identity verification are required."
  );

  if (!confirmed) return;

  const request = {
    id: generateId("DEL"),
    status: "pending",
    reason: "Requested by rider from settings page",
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem(RIDER_DELETE_REQUEST_KEY, JSON.stringify(request));
  addSecurityLog("Account deletion requested");

  showToast("Account deletion request submitted for admin review.", "success");
}

/* ================================
   HELPERS
================================ */

function setChecked(id, value) {
  const element = document.getElementById(id);
  if (element) element.checked = Boolean(value);
}

function getChecked(id) {
  const element = document.getElementById(id);
  return element ? Boolean(element.checked) : false;
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value ?? "";
}

function getValue(id) {
  const element = document.getElementById(id);
  return element ? String(element.value || "").trim() : "";
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function focusElement(id) {
  const element = document.getElementById(id);

  if (!element) return;

  element.classList.add("input-error");
  element.focus();

  setTimeout(() => {
    element.classList.remove("input-error");
  }, 1800);
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  const toastIcon = toast?.querySelector("i");

  if (!toast || !toastMessage || !toastIcon) {
    console.log(`[rider-settings] ${message}`);
    return;
  }

  let icon = "fa-circle-check";

  if (type === "error") icon = "fa-circle-exclamation";
  if (type === "warning") icon = "fa-triangle-exclamation";

  toastIcon.className = `fa-solid ${icon}`;
  toastMessage.textContent = message;
  toast.className = `toast show ${type}`;

  clearTimeout(window.__settingsToastTimer);

  window.__settingsToastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source) {
  const output = { ...target };

  Object.keys(source || {}).forEach((key) => {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      output[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  });

  return output;
}

function readJsonObject(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`[rider-settings.js] Could not read ${key}`, error);
    return fallback;
  }
}

function readJsonArray(key) {
  try {
    const value = localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`[rider-settings.js] Could not read ${key}`, error);
    return [];
  }
}

function generateId(prefix) {
  const time = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${time}${random}`;
}

function downloadJsonFile(data, filename) {
  const json = JSON.stringify(data, null, 2);

  const blob = new Blob([json], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function debounce(callback, delay = 300) {
  let timer;

  return function (...args) {
    clearTimeout(timer);

    timer = setTimeout(() => {
      callback.apply(this, args);
    }, delay);
  };
}