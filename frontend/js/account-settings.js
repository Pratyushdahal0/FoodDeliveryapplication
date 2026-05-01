console.log("[account-settings.js] Loaded - real customer settings fixed");

(function () {
  const ACCOUNT_SETTINGS_KEY_SAFE = "foodExpressAccountSettings";

  const DEFAULT_ACCOUNT_SETTINGS = {
    defaultDeliveryNote: "",
    contactlessDelivery: false,

    defaultPaymentMethod: "cash",
    checkoutReminder: "standard",
    autoApplyBestCoupon: true,
    saveDeliveryDetails: true,

    notifyOrderUpdates: true,
    notifyRiderUpdates: true,
    notifyRewardUpdates: true,
    notifySupportReplies: true,
    notifyPromotions: false,

    personalizedRecommendations: true,
    saveOrderHistory: true,
  };

  document.addEventListener("DOMContentLoaded", function () {
    renderAccountSummary();
    loadAccountSettings();
    bindSettingsEvents();
    setStatus("No changes yet");
  });

  function getAccountSettings() {
    try {
      const raw = localStorage.getItem(ACCOUNT_SETTINGS_KEY_SAFE);
      const parsed = raw ? JSON.parse(raw) : {};

      return {
        ...DEFAULT_ACCOUNT_SETTINGS,
        ...parsed,
      };
    } catch (error) {
      console.warn("[account-settings.js] Failed to read settings:", error);
      return { ...DEFAULT_ACCOUNT_SETTINGS };
    }
  }

  function saveAccountSettings(settings) {
    const finalSettings = {
      ...DEFAULT_ACCOUNT_SETTINGS,
      ...settings,
    };

    localStorage.setItem(
      ACCOUNT_SETTINGS_KEY_SAFE,
      JSON.stringify(finalSettings),
    );

    localStorage.setItem(
      "foodExpressPreferredPayment",
      finalSettings.defaultPaymentMethod,
    );

    localStorage.setItem(
      "foodExpressAutoApplyBestCoupon",
      String(finalSettings.autoApplyBestCoupon),
    );

    localStorage.setItem(
      "foodExpressSaveDeliveryDetails",
      String(finalSettings.saveDeliveryDetails),
    );

    localStorage.setItem(
      "foodExpressContactlessDelivery",
      String(finalSettings.contactlessDelivery),
    );

    localStorage.setItem(
      "foodExpressDefaultDeliveryNote",
      finalSettings.defaultDeliveryNote,
    );

    localStorage.setItem(
      "foodExpressSaveOrderHistory",
      String(finalSettings.saveOrderHistory),
    );

    localStorage.setItem(
      "foodExpressPersonalizedRecommendations",
      String(finalSettings.personalizedRecommendations),
    );

    const anyNotificationEnabled =
      finalSettings.notifyOrderUpdates ||
      finalSettings.notifyRiderUpdates ||
      finalSettings.notifyRewardUpdates ||
      finalSettings.notifySupportReplies ||
      finalSettings.notifyPromotions;

    localStorage.setItem(
      "foodExpressNotificationsEnabled",
      String(anyNotificationEnabled),
    );

    window.dispatchEvent(new Event("foodExpressAccountSettingsUpdated"));

    if (typeof window.renderNotificationDropdown === "function") {
      window.renderNotificationDropdown();
    }

    if (typeof window.addFoodExpressNotification === "function") {
      window.addFoodExpressNotification({
        title: "Settings saved",
        message: "Your FoodExpress customer preferences were updated.",
        type: "success",
        category: "support",
        icon: "fa-sliders",
        link: "account-settings.html",
      });
    }

    return finalSettings;
  }

  function loadAccountSettings() {
    const settings = getAccountSettings();

    setValue("defaultDeliveryNote", settings.defaultDeliveryNote);
    setChecked("contactlessDelivery", settings.contactlessDelivery);

    setValue("defaultPaymentMethod", settings.defaultPaymentMethod);
    setValue("checkoutReminder", settings.checkoutReminder);
    setChecked("autoApplyBestCoupon", settings.autoApplyBestCoupon);
    setChecked("saveDeliveryDetails", settings.saveDeliveryDetails);

    setChecked("notifyOrderUpdates", settings.notifyOrderUpdates);
    setChecked("notifyRiderUpdates", settings.notifyRiderUpdates);
    setChecked("notifyRewardUpdates", settings.notifyRewardUpdates);
    setChecked("notifySupportReplies", settings.notifySupportReplies);
    setChecked("notifyPromotions", settings.notifyPromotions);

    setChecked(
      "personalizedRecommendations",
      settings.personalizedRecommendations,
    );

    setChecked("saveOrderHistory", settings.saveOrderHistory);
  }

  function collectAccountSettings() {
    return {
      defaultDeliveryNote: getValue("defaultDeliveryNote"),
      contactlessDelivery: getChecked("contactlessDelivery"),

      defaultPaymentMethod: getValue("defaultPaymentMethod") || "cash",
      checkoutReminder: getValue("checkoutReminder") || "standard",
      autoApplyBestCoupon: getChecked("autoApplyBestCoupon"),
      saveDeliveryDetails: getChecked("saveDeliveryDetails"),

      notifyOrderUpdates: getChecked("notifyOrderUpdates"),
      notifyRiderUpdates: getChecked("notifyRiderUpdates"),
      notifyRewardUpdates: getChecked("notifyRewardUpdates"),
      notifySupportReplies: getChecked("notifySupportReplies"),
      notifyPromotions: getChecked("notifyPromotions"),

      personalizedRecommendations: getChecked("personalizedRecommendations"),
      saveOrderHistory: getChecked("saveOrderHistory"),
    };
  }

  function bindSettingsEvents() {
    bindClick("saveSettingsBtn", function () {
      const settings = collectAccountSettings();
      saveAccountSettings(settings);

      setStatus("Saved just now");
      showSettingsToast("Settings saved successfully.");

      const saveBtn = document.getElementById("saveSettingsBtn");
      if (saveBtn) {
        const original = saveBtn.innerHTML;
        saveBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Saved`;
        saveBtn.disabled = true;

        setTimeout(function () {
          saveBtn.innerHTML = original;
          saveBtn.disabled = false;
        }, 1200);
      }
    });

    document.querySelectorAll("input, select").forEach(function (input) {
      input.addEventListener("change", function () {
        setStatus("You have unsaved changes.");
      });

      input.addEventListener("input", function () {
        setStatus("You have unsaved changes.");
      });
    });

    bindClick("headerEditProfileBtn", function () {
      window.location.href = "edit-profile.html";
    });

    bindClick("editProfileBtn", function () {
      window.location.href = "edit-profile.html";
    });

    bindClick("editDeliveryBtn", function () {
      window.location.href = "edit-profile.html";
    });

    bindClick("contactSupportBtn", function () {
      window.location.href = "loggedContact.html";
    });

    bindClick("settingsLogoutBtn", function () {
      const ok = confirm("Are you sure you want to log out?");
      if (!ok) return;

      if (typeof window.logout === "function") {
        window.logout();
        return;
      }

      localStorage.removeItem("isLoggedIn");
      window.location.href = "landingpage.html";
    });

    bindClick("clearLocalDataBtn", function () {
      const ok = confirm(
        "Clear saved FoodExpress preferences? This will not delete your login, profile, orders, or backend account.",
      );

      if (!ok) return;

      localStorage.removeItem(ACCOUNT_SETTINGS_KEY_SAFE);
      localStorage.removeItem("foodExpressPreferredPayment");
      localStorage.removeItem("foodExpressAutoApplyBestCoupon");
      localStorage.removeItem("foodExpressSaveDeliveryDetails");
      localStorage.removeItem("foodExpressContactlessDelivery");
      localStorage.removeItem("foodExpressDefaultDeliveryNote");
      localStorage.removeItem("foodExpressSaveOrderHistory");
      localStorage.removeItem("foodExpressPersonalizedRecommendations");
      localStorage.removeItem("foodExpressNotificationsEnabled");

      loadAccountSettings();
      setStatus("Preferences reset to default.");
      showSettingsToast("Preferences reset to default.");
    });
  }

  function getCurrentCustomerProfile() {
    const profileFromGlobal =
      typeof window.getSavedUserProfile === "function"
        ? window.getSavedUserProfile()
        : {};

    const userProfile = readJson("userProfile", {});
    const foodExpressProfile = readJson("foodExpressUserProfile", {});
    const currentUser = readJson("currentUser", {});
    const loggedInUser = readJson("loggedInUser", {});
    const authUser = readJson("foodExpressAuthUser", {});

    const merged = {
      ...authUser,
      ...loggedInUser,
      ...currentUser,
      ...foodExpressProfile,
      ...userProfile,
      ...profileFromGlobal,
    };

    const email =
      merged.email ||
      merged.user_email ||
      merged.email_address ||
      localStorage.getItem("userEmail") ||
      localStorage.getItem("pendingVerificationEmail") ||
      localStorage.getItem("foodExpressUserEmail") ||
      "No email added";

    const name =
      merged.name ||
      merged.full_name ||
      merged.fullName ||
      [merged.first_name, merged.last_name].filter(Boolean).join(" ") ||
      localStorage.getItem("userName") ||
      localStorage.getItem("pendingVerificationName") ||
      localStorage.getItem("foodExpressUserName") ||
      getNameFromEmail(email) ||
      "User";

    const phone =
      merged.phone ||
      merged.phone_number ||
      localStorage.getItem("userPhone") ||
      localStorage.getItem("foodExpressUserPhone") ||
      "No phone number saved";

    const address =
      merged.address ||
      merged.address_line1 ||
      localStorage.getItem("userAddress") ||
      localStorage.getItem("foodExpressUserAddress") ||
      "No address saved";

    const image =
      merged.profileImage ||
      merged.profile_image ||
      merged.image ||
      merged.avatar ||
      localStorage.getItem("userProfileImage") ||
      "";

    return {
      ...merged,
      name,
      email,
      phone,
      address,
      image,
    };
  }

  function renderAccountSummary() {
    const profile = getCurrentCustomerProfile();

    setText("settingsName", profile.name);
    setText("settingsEmail", profile.email);
    setText("savedAddressText", profile.address);
    setText("savedPhoneText", profile.phone);

    const avatar = document.getElementById("settingsAvatar");
    if (!avatar) return;

    avatar.innerHTML = "";

    if (profile.image) {
      const img = document.createElement("img");
      img.src = profile.image;
      img.alt = profile.name;

      img.onerror = function () {
        avatar.innerHTML = "";
        avatar.textContent = getInitials(profile.name);
      };

      avatar.appendChild(img);
      return;
    }

    avatar.textContent = getInitials(profile.name);
  }

  function getNameFromEmail(email) {
    if (!email || email === "No email added") return "";

    return String(email)
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, function (char) {
        return char.toUpperCase();
      });
  }

  function getInitials(name) {
    return String(name || "User")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("");
  }

  function showSettingsToast(message) {
    let toast = document.getElementById("settingsToast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "settingsToast";
      toast.className = "settings-toast";
      document.body.appendChild(toast);
    }

    toast.innerHTML = `
      <i class="fa-solid fa-circle-check"></i>
      <span>${escapeHtml(message)}</span>
    `;

    toast.classList.add("show");

    setTimeout(function () {
      toast.classList.remove("show");
    }, 2200);
  }

  function setStatus(message) {
    const status = document.getElementById("settingsStatus");
    if (status) status.textContent = message;
  }

  function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? "";
  }

  function getValue(id) {
    const element = document.getElementById(id);
    return element ? element.value.trim() : "";
  }

  function setChecked(id, value) {
    const element = document.getElementById(id);
    if (element) element.checked = Boolean(value);
  }

  function getChecked(id) {
    const element = document.getElementById(id);
    return element ? element.checked : false;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function bindClick(id, handler) {
    const element = document.getElementById(id);
    if (element) element.addEventListener("click", handler);
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  window.getAccountSettings = getAccountSettings;
  window.saveAccountSettings = saveAccountSettings;
})();