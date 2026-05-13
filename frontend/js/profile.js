console.log("[profile.js] Loaded — final global profile sync");

(function () {
  function safeJsonParse(value, fallback = null) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function getStoredProfile() {
    // Canonical auth keys set by the customer login flow — always role-correct.
    // These take precedence over userProfile, which can be contaminated by a
    // previous owner or rider session that wasn't fully cleared on logout.
    const canonicalEmail = localStorage.getItem("userEmail") || "";
    const canonicalName  = localStorage.getItem("userName")  || "";

    const profile      = safeJsonParse(localStorage.getItem("userProfile"), {}) || {};
    const loggedInUser = safeJsonParse(localStorage.getItem("loggedInUser"), {}) || {};

    // Only use userProfile data when it belongs to the currently logged-in user.
    const profileIsForCurrentUser =
      !profile.email || !canonicalEmail || profile.email === canonicalEmail;

    const name =
      canonicalName ||
      (profileIsForCurrentUser
        ? profile.name ||
          profile.fullName ||
          [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim()
        : null) ||
      loggedInUser.name ||
      loggedInUser.fullName ||
      localStorage.getItem("pendingVerificationName") ||
      "User";

    const email =
      canonicalEmail ||
      (profileIsForCurrentUser ? profile.email : null) ||
      loggedInUser.email ||
      "";

    const image =
      localStorage.getItem("userProfileImage") ||
      (profileIsForCurrentUser
        ? profile.profileImage ||
          profile.image ||
          profile.avatar ||
          profile.profile_picture
        : null) ||
      loggedInUser.profileImage ||
      loggedInUser.image ||
      "";

    return {
      name: String(name || "User").trim(),
      email: String(email || "").trim(),
      image: String(image || "").trim(),
    };
  }

  function getInitials(name) {
    const cleanName = String(name || "").trim();
    if (!cleanName) return "U";

    return cleanName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  function setAvatarContent(element, name, image) {
    if (!element) return;

    element.innerHTML = "";
    element.setAttribute("title", name || "User");
    element.setAttribute("aria-label", name || "User");

    if (image) {
      const img = document.createElement("img");
      img.src = image;
      img.alt = name || "User";
      img.className = "profile-avatar-img";

      img.onerror = function () {
        element.innerHTML = getInitials(name);
        element.classList.remove("has-image");
      };

      element.appendChild(img);
      element.classList.add("has-image");
    } else {
      element.textContent = getInitials(name);
      element.classList.remove("has-image");
    }
  }

  function updateTextElements(selectors, value) {
    if (!value) return;

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.textContent = value;
      });
    });
  }

  function updateAvatarElements(name, image) {
    const avatarSelectors = [
      "#navbarAvatar",
      "#dashboardProfileAvatar",
      "#dashboardAvatar",
      "#profileAvatar",
      "#welcomeAvatar",
      ".dashboard-avatar",
      ".dashboard-user-avatar",
      ".profile-avatar",
      ".profile-avatar-large",
      ".profile-hero-avatar",
      ".welcome-avatar",
      ".user-avatar-large",
      "[data-profile-avatar]",
    ];

    const updated = new Set();

    avatarSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        if (updated.has(element)) return;
        updated.add(element);
        setAvatarContent(element, name, image);
      });
    });
  }

  function updateNameElements(name) {
    const nameSelectors = [
      "#dashboardProfileName",
      "#dashboardUserName",
      "#profileName",
      "#welcomeName",
      ".dashboard-user-name",
      ".dashboard-profile-name",
      ".profile-name",
      ".profile-hero-name",
      ".welcome-user-name",
      ".welcome-name",
      "[data-profile-name]",
    ];

    updateTextElements(nameSelectors, name);
  }

  function updateEmailElements(email) {
    const emailSelectors = [
      "#dashboardProfileEmail",
      "#dashboardUserEmail",
      "#profileEmail",
      "#welcomeEmail",
      ".dashboard-user-email",
      ".dashboard-profile-email",
      ".profile-email",
      ".profile-hero-email",
      ".welcome-user-email",
      ".welcome-email",
      "[data-profile-email]",
    ];

    updateTextElements(emailSelectors, email);
  }

  function bindProfileEverywhere() {
    const profile = getStoredProfile();

    updateAvatarElements(profile.name, profile.image);
    updateNameElements(profile.name);
    updateEmailElements(profile.email);

    return profile;
  }

  function saveProfilePatch(patch = {}) {
    const current = safeJsonParse(localStorage.getItem("userProfile"), {}) || {};
    const updated = { ...current, ...patch };

    localStorage.setItem("userProfile", JSON.stringify(updated));

    if (updated.name) {
      localStorage.setItem("userName", updated.name);
    }

    if (updated.email) {
      localStorage.setItem("userEmail", updated.email);
    }

    if (
      updated.profileImage ||
      updated.image ||
      updated.avatar ||
      updated.profile_picture
    ) {
      localStorage.setItem(
        "userProfileImage",
        updated.profileImage ||
          updated.image ||
          updated.avatar ||
          updated.profile_picture
      );
    }

    bindProfileEverywhere();

    window.dispatchEvent(new CustomEvent("profileUpdated"));
  }

  function initProfileSync() {
    bindProfileEverywhere();

    setTimeout(bindProfileEverywhere, 100);
    setTimeout(bindProfileEverywhere, 400);
    setTimeout(bindProfileEverywhere, 1000);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        bindProfileEverywhere();
      }
    });

    window.addEventListener("focus", bindProfileEverywhere);
    window.addEventListener("storage", bindProfileEverywhere);
    window.addEventListener("profileUpdated", bindProfileEverywhere);
    window.addEventListener("userProfileUpdated", bindProfileEverywhere);
  }

  window.getStoredProfile = getStoredProfile;
  window.getInitials = getInitials;
  window.bindProfileEverywhere = bindProfileEverywhere;
  window.saveProfilePatch = saveProfilePatch;

  document.addEventListener("DOMContentLoaded", initProfileSync);
})();