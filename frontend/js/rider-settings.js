/* ================================
   RIDER SETTINGS JS
   Production-style frontend logic
================================ */

const RIDER_SETTINGS_KEY = "foodExpressRiderSettings";
const RIDER_STATUS_KEY = "foodExpressRiderStatus";
const RIDER_PROFILE_KEY = "foodExpressRiderProfile";
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
    preferredArea: "Kathmandu"
  },
  notifications: {
    newOrders: true,
    payoutAlerts: true,
    supportMessages: true,
    promotions: false,
    sound: true,
    email: true,
    sms: false
  },
  payout: {
    method: "Bank Transfer",
    bankName: "Nabil Bank",
    accountName: "Ramesh Tamang",
    accountNumber: "XXXXXXXX1234",
    walletNumber: ""
  },
  security: {
    twoFactor: false,
    loginAlerts: true,
    passwordChangedAt: null,
    devicesLoggedOutAt: null
  },
  preferences: {
    darkMode: false,
    language: "English",
    currency: "NPR",
    compactMode: false
  }
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
  applyStatusUI(settings);
  applyPreferenceClasses(settings);
  updatePayoutFields();
  updateAlertMessage(settings);
  bindEvents();

  syncSettingsToLocalStatus(settings);
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

    // Important: always sync separate rider status from actual settings toggles
    syncSettingsToLocalStatus(normalized);

    return normalized;
  } catch (error) {
    console.warn("Invalid rider settings found. Resetting settings.", error);
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

  if (typeof window.applyGlobalRiderStatus === "function") {
  window.applyGlobalRiderStatus();
}

  window.dispatchEvent(
    new CustomEvent("foodExpressRiderSettingsUpdated", {
      detail: cleanSettings
    })
  );

  if (showMessage) {
    showToast("Settings saved successfully.");
  }

  return cleanSettings;
}

function syncSettingsToLocalStatus(settings) {
  let status = "online";

  if (!settings.availability.online) {
    status = "offline";
  } else if (settings.availability.breakMode) {
    status = "break";
  }

  localStorage.setItem(RIDER_STATUS_KEY, status);
}

function normalizeSettings(settings) {
  const normalized = deepMerge(clone(defaultSettings), settings || {});

  // Currency locked to NPR.
  normalized.preferences.currency = "NPR";

  // If rider is offline, break mode and auto accept should not remain active.
  if (!normalized.availability.online) {
    normalized.availability.breakMode = false;
    normalized.availability.autoAccept = false;
  }

  // If rider is on break, auto accept should pause.
  if (normalized.availability.breakMode) {
    normalized.availability.online = true;
    normalized.availability.autoAccept = false;
  }

  // Radius must be one of allowed options.
  const allowedRadius = ["3", "5", "8", "10", "15"];
  if (!allowedRadius.includes(String(normalized.availability.radius))) {
    normalized.availability.radius = "5";
  }

  // Preferred area fallback.
  if (!normalized.availability.preferredArea.trim()) {
    normalized.availability.preferredArea = "Kathmandu";
  }

  return normalized;
}

function resetSettings() {
  saveSettings(defaultSettings, false);

  populateSettings(defaultSettings);
  applyStatusUI(defaultSettings);
  applyPreferenceClasses(defaultSettings);
  updatePayoutFields();
  updateAlertMessage(defaultSettings);

  showToast("Settings reset to default.");
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
  const settings = {
    availability: {
      online: getChecked("onlineToggle"),
      autoAccept: getChecked("autoAcceptToggle"),
      breakMode: getChecked("breakModeToggle"),
      radius: getValue("deliveryRadius") || "5",
      preferredArea: getValue("preferredArea") || "Kathmandu"
    },
    notifications: {
      newOrders: getChecked("newOrdersToggle"),
      payoutAlerts: getChecked("payoutAlertsToggle"),
      supportMessages: getChecked("supportMessagesToggle"),
      promotions: getChecked("promotionsToggle"),
      sound: getChecked("soundToggle"),
      email: getChecked("emailToggle"),
      sms: getChecked("smsToggle")
    },
    payout: {
      method: getValue("payoutMethod") || "Bank Transfer",
      bankName: getValue("bankName"),
      accountName: getValue("accountName"),
      accountNumber: getValue("accountNumber"),
      walletNumber: getValue("walletNumber")
    },
    security: {
      twoFactor: getChecked("twoFactorToggle"),
      loginAlerts: getChecked("loginAlertsToggle"),
      passwordChangedAt: getSettings().security.passwordChangedAt,
      devicesLoggedOutAt: getSettings().security.devicesLoggedOutAt
    },
    preferences: {
      darkMode: getChecked("darkModeToggle"),
      language: getValue("languageSelect") || "English",
      currency: "NPR",
      compactMode: getChecked("compactModeToggle")
    }
  };

  return normalizeSettings(settings);
}

/* ================================
   EVENTS
================================ */

function bindEvents() {
  const saveTop = document.getElementById("saveSettingsTopBtn");
  const saveBottom = document.getElementById("saveSettingsBottomBtn");
  const resetBtn = document.getElementById("resetSettingsBtn");

  if (saveTop) saveTop.addEventListener("click", handleSave);
  if (saveBottom) saveBottom.addEventListener("click", handleSave);
  if (resetBtn) resetBtn.addEventListener("click", handleReset);

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

  if (onlineToggle) {
    onlineToggle.addEventListener("change", () => {
      if (!onlineToggle.checked) {
        setChecked("breakModeToggle", false);
        setChecked("autoAcceptToggle", false);
      }

      const saved = saveAvailabilityImmediately();

      showToast(
        saved.availability.online
          ? "You are online and available for requests."
          : "You are offline. New delivery requests are paused."
      );
    });
  }

  if (breakModeToggle) {
    breakModeToggle.addEventListener("change", () => {
      if (breakModeToggle.checked) {
        setChecked("onlineToggle", true);
        setChecked("autoAcceptToggle", false);
      }

      const saved = saveAvailabilityImmediately();

      showToast(
        saved.availability.breakMode
          ? "Break mode is active. Requests are paused."
          : "Break mode turned off."
      );
    });
  }

  if (autoAcceptToggle) {
    autoAcceptToggle.addEventListener("change", () => {
      if (autoAcceptToggle.checked) {
        setChecked("onlineToggle", true);
        setChecked("breakModeToggle", false);
      }

      const saved = saveAvailabilityImmediately();

      showToast(
        saved.availability.autoAccept
          ? "Auto accept enabled."
          : "Auto accept disabled."
      );
    });
  }

  if (deliveryRadius) {
    deliveryRadius.addEventListener("change", () => {
      const saved = saveAvailabilityImmediately();
      showToast(`Delivery radius set to ${saved.availability.radius} km.`);
    });
  }

  if (preferredArea) {
    preferredArea.addEventListener(
      "input",
      debounce(() => {
        const area = preferredArea.value.trim();

        if (area.length > 40) {
          preferredArea.value = area.slice(0, 40);
          showToast("Preferred area cannot be longer than 40 characters.");
          return;
        }

        saveAvailabilityImmediately();
      }, 400)
    );
  }
}

function saveAvailabilityImmediately() {
  const settings = collectSettingsFromUI();

  const saved = saveSettings(settings, false);

  populateSettings(saved);
  applyStatusUI(saved);
  updateAlertMessage(saved);
  updateDisabledStates(saved);

  return saved;
}

function bindPreferenceEvents() {
  const darkModeToggle = document.getElementById("darkModeToggle");
  const compactModeToggle = document.getElementById("compactModeToggle");
  const languageSelect = document.getElementById("languageSelect");
  const currencySelect = document.getElementById("currencySelect");

  if (darkModeToggle) {
    darkModeToggle.addEventListener("change", () => {
      const settings = collectSettingsFromUI();
      applyPreferenceClasses(settings);
    });
  }

  if (compactModeToggle) {
    compactModeToggle.addEventListener("change", () => {
      const settings = collectSettingsFromUI();
      applyPreferenceClasses(settings);
    });
  }

  if (languageSelect) {
    languageSelect.addEventListener("change", () => {
      showToast("Language preference updated. Save changes to keep it.");
    });
  }

  if (currencySelect) {
    currencySelect.value = "NPR";
    currencySelect.disabled = true;
    currencySelect.title = "FoodExpress currently supports NPR only.";
  }
}

function bindPayoutEvents() {
  const payoutMethod = document.getElementById("payoutMethod");
  const bankName = document.getElementById("bankName");
  const accountName = document.getElementById("accountName");
  const accountNumber = document.getElementById("accountNumber");
  const walletNumber = document.getElementById("walletNumber");

  if (payoutMethod) {
  payoutMethod.addEventListener("change", () => {
    updatePayoutFields();

    // Do not show success toast here.
    // Payout method will be saved when rider clicks Save Changes.
  });
}

  [bankName, accountName, accountNumber, walletNumber].forEach((input) => {
    if (!input) return;

    input.addEventListener("input", () => {
      input.classList.remove("input-error");
    });
  });
}

function bindSecurityActions() {
  const changePasswordBtn = document.getElementById("changePasswordBtn");
  const logoutDevicesBtn = document.getElementById("logoutDevicesBtn");

  if (changePasswordBtn) {
    changePasswordBtn.addEventListener("click", handleChangePassword);
  }

  if (logoutDevicesBtn) {
    logoutDevicesBtn.addEventListener("click", handleLogoutAllDevices);
  }
}

function bindAccountActions() {
  const downloadDataBtn = document.getElementById("downloadDataBtn");
  const deleteAccountBtn = document.getElementById("deleteAccountBtn");

  if (downloadDataBtn) {
    downloadDataBtn.addEventListener("click", handleDownloadData);
  }

  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener("click", handleDeleteAccountRequest);
  }
}

/* ================================
   SAVE / RESET
================================ */

function handleSave() {
  const settings = collectSettingsFromUI();
  const validation = validateSettings(settings);

  if (!validation.valid) {
    showToast(validation.message, "error");
    focusElement(validation.fieldId);
    return;
  }

  const saved = saveSettings(settings, false);

  populateSettings(saved);
  applyStatusUI(saved);
  applyPreferenceClasses(saved);
  updatePayoutFields();
  updateAlertMessage(saved);
  updateDisabledStates(saved);

  if (typeof window.applyGlobalRiderStatus === "function") {
    window.applyGlobalRiderStatus();
  }

  showToast("Settings saved successfully.", "success");

  console.log("✅ Rider settings saved:", saved);
}

function handleReset() {
  const confirmReset = confirm(
    "Reset all rider settings to default values? This will not delete your profile."
  );

  if (!confirmReset) return;

  resetSettings();
}

/* ================================
   VALIDATION
================================ */

function validateSettings(settings) {
  const area = settings.availability.preferredArea.trim();

  if (area.length < 2) {
    return {
      valid: false,
      fieldId: "preferredArea",
      message: "Please enter a valid preferred area."
    };
  }

  if (area.length > 40) {
    return {
      valid: false,
      fieldId: "preferredArea",
      message: "Preferred area must be under 40 characters."
    };
  }

  if (settings.payout.method === "Bank Transfer") {
  if (!settings.payout.bankName.trim()) {
    return {
      valid: false,
      fieldId: "bankName",
      message: "Please enter your bank name."
    };
  }

  if (!settings.payout.accountName.trim()) {
    return {
      valid: false,
      fieldId: "accountName",
      message: "Please enter the account holder name."
    };
  }

  if (!isValidAccountNumber(settings.payout.accountNumber)) {
    return {
      valid: false,
      fieldId: "accountNumber",
      message: "Please enter a valid account number."
    };
  }
}

if (settings.payout.method === "eSewa" || settings.payout.method === "Khalti") {
  if (!isValidNepaliPhone(settings.payout.walletNumber)) {
    return {
      valid: false,
      fieldId: "walletNumber",
      message: "Please enter a valid eSewa/Khalti phone number."
    };
  }
}
}

function isValidAccountNumber(value) {
  const clean = String(value || "").trim();

  // Allows masked demo value like XXXXXXXX1234 and real digits.
  if (/^[Xx*]{4,}\d{3,}$/.test(clean)) return true;

  return /^[0-9]{6,24}$/.test(clean.replace(/\s+/g, ""));
}

function isValidNepaliPhone(value) {
  const clean = String(value || "").replace(/\s+/g, "");

  // Nepal mobile examples: 98XXXXXXXX, 97XXXXXXXX, +97798XXXXXXXX
  return /^(\+977)?9[78][0-9]{8}$/.test(clean);
}

/* ================================
   STATUS UI
================================ */

function applyLiveUI(settings) {
  const normalized = normalizeSettings(settings);

  populateSettings(normalized);
  applyStatusUI(normalized);
  updateAlertMessage(normalized);
  updateDisabledStates(normalized);
}

function applyStatusUI(settings) {
  const badge = document.getElementById("availabilityBadge");
  const onlinePill = document.getElementById("onlinePill");
  const onlineText = document.getElementById("onlineText");

  let label = "Online";
  let statusClass = "";

  if (!settings.availability.online) {
    label = "Offline";
    statusClass = "offline";
  } else if (settings.availability.breakMode) {
    label = "On Break";
    statusClass = "break";
  }

  if (badge) {
    badge.textContent = label;
    badge.className = `status-badge ${statusClass}`;
  }

  if (onlineText) {
    onlineText.textContent = label;
  }

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

/* ================================
   PAYOUT
================================ */

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

/* ================================
   PREFERENCES
================================ */

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
    id: "RID-1001",
    name: "Ramesh Tamang",
    avatar: "https://i.pravatar.cc/80?img=12"
  };

  let profile = defaultProfile;

  try {
    const stored = localStorage.getItem(RIDER_PROFILE_KEY);

    if (stored) {
      profile = {
        ...defaultProfile,
        ...JSON.parse(stored)
      };
    }
  } catch (error) {
    console.warn("Could not read rider profile.", error);
  }

  const topbarName = document.getElementById("topbarName");
  const topbarId = document.getElementById("topbarId");
  const topbarAvatar = document.getElementById("topbarAvatar");

  if (topbarName) topbarName.textContent = profile.name || defaultProfile.name;
  if (topbarId) topbarId.textContent = `Rider ID: ${profile.id || defaultProfile.id}`;
  if (topbarAvatar) topbarAvatar.src = profile.avatar || defaultProfile.avatar;
}

/* ================================
   SECURITY ACTIONS
================================ */

function handleChangePassword() {
  const currentPassword = prompt("Enter current password:");

  if (currentPassword === null) return;

  if (currentPassword.trim().length < 4) {
    showToast("Current password is too short.");
    return;
  }

  const newPassword = prompt("Enter new password:");

  if (newPassword === null) return;

  const passwordCheck = validatePasswordStrength(newPassword);

  if (!passwordCheck.valid) {
    showToast(passwordCheck.message);
    return;
  }

  const confirmPassword = prompt("Confirm new password:");

  if (confirmPassword === null) return;

  if (newPassword !== confirmPassword) {
    showToast("New password and confirm password do not match.");
    return;
  }

  const settings = getSettings();
  settings.security.passwordChangedAt = new Date().toISOString();

  saveSettings(settings, false);
  addSecurityLog("Password changed");

  showToast("Password changed successfully.");
}

function validatePasswordStrength(password) {
  const value = String(password || "");

  if (value.length < 8) {
    return {
      valid: false,
      message: "Password must be at least 8 characters."
    };
  }

  if (!/[A-Z]/.test(value)) {
    return {
      valid: false,
      message: "Password must include one uppercase letter."
    };
  }

  if (!/[0-9]/.test(value)) {
    return {
      valid: false,
      message: "Password must include one number."
    };
  }

  return {
    valid: true,
    message: "Strong password."
  };
}

function handleLogoutAllDevices() {
  const confirmLogout = confirm(
    "Logout from all devices? Your current local session will stay active for demo testing."
  );

  if (!confirmLogout) return;

  const settings = getSettings();
  settings.security.devicesLoggedOutAt = new Date().toISOString();

  saveSettings(settings, false);
  addSecurityLog("Logged out from all devices");

  showToast("All other devices have been logged out.");
}

function addSecurityLog(action) {
  const logs = readJsonArray(RIDER_SECURITY_LOG_KEY);

  logs.unshift({
    id: generateId("SEC"),
    action,
    createdAt: new Date().toISOString()
  });

  localStorage.setItem(RIDER_SECURITY_LOG_KEY, JSON.stringify(logs.slice(0, 20)));
}

/* ================================
   ACCOUNT ACTIONS
================================ */

function handleDownloadData() {
  const settings = getSettings();
  const profile = readJsonObject(RIDER_PROFILE_KEY, {
    id: "RID-1001",
    name: "Ramesh Tamang"
  });

  const exportData = {
    exportedAt: new Date().toISOString(),
    riderProfile: profile,
    riderSettings: settings,
    riderStatus: localStorage.getItem(RIDER_STATUS_KEY) || "online",
    securityLogs: readJsonArray(RIDER_SECURITY_LOG_KEY),
    note: "This is frontend demo export data from FoodExpress Rider Panel."
  };

  localStorage.setItem(
    RIDER_DATA_REQUEST_KEY,
    JSON.stringify({
      id: generateId("DATA"),
      status: "completed",
      createdAt: new Date().toISOString()
    })
  );

  downloadJsonFile(exportData, `foodexpress-rider-data-${Date.now()}.json`);
  showToast("Account data downloaded.");
}

function handleDeleteAccountRequest() {
  const existingRequest = readJsonObject(RIDER_DELETE_REQUEST_KEY, null);

  if (existingRequest && existingRequest.status === "pending") {
    showToast("Account deletion request is already pending.");
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
    createdAt: new Date().toISOString()
  };

  localStorage.setItem(RIDER_DELETE_REQUEST_KEY, JSON.stringify(request));
  addSecurityLog("Account deletion requested");

  showToast("Account deletion request submitted for admin review.");
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
  return element ? element.value.trim() : "";
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

  if (!toast) return;

  let icon = "fa-circle-check";

  if (type === "error") {
    icon = "fa-circle-exclamation";
  }

  if (type === "warning") {
    icon = "fa-triangle-exclamation";
  }

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span id="toastMessage">${message}</span>
  `;

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
    console.warn(`Could not read ${key}`, error);
    return fallback;
  }
}

function readJsonArray(key) {
  try {
    const value = localStorage.getItem(key);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
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
    type: "application/json"
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