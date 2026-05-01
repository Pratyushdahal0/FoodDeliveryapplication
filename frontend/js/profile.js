console.log("[profile.js] Loaded - final global profile sync");

/* ================================
   FOODEXPRESS GLOBAL PROFILE BINDER
   Shows profile image/initials/name/email everywhere
================================ */

const PROFILE_KEYS = {
  profile: "userProfile",
  name: "userName",
  email: "userEmail",
  phone: "userPhone",
  address: "userAddress",
  image: "userProfileImage",
};

function safeJsonParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn("[profile.js] JSON parse failed:", error);
    return fallback;
  }
}

function getSavedUserProfile() {
  const profile = safeJsonParse(localStorage.getItem(PROFILE_KEYS.profile), null);

  const name =
    profile?.name ||
    localStorage.getItem(PROFILE_KEYS.name) ||
    localStorage.getItem("pendingVerificationName") ||
    localStorage.getItem("registeredUserName") ||
    "User";

  const email =
    profile?.email ||
    localStorage.getItem(PROFILE_KEYS.email) ||
    localStorage.getItem("pendingVerificationEmail") ||
    localStorage.getItem("registeredUserEmail") ||
    "";

  const phone =
    profile?.phone ||
    localStorage.getItem(PROFILE_KEYS.phone) ||
    "";

  const address =
    profile?.address ||
    localStorage.getItem(PROFILE_KEYS.address) ||
    "";

  const profileImage =
    profile?.profileImage ||
    profile?.image ||
    localStorage.getItem(PROFILE_KEYS.image) ||
    "";

  return {
    name,
    email,
    phone,
    address,
    profileImage,
  };
}

function saveUserProfile(profile) {
  const cleanProfile = {
    name: profile.name || "User",
    email: profile.email || "",
    phone: profile.phone || "",
    address: profile.address || "",
    profileImage: profile.profileImage || "",
  };

  localStorage.setItem(PROFILE_KEYS.profile, JSON.stringify(cleanProfile));
  localStorage.setItem(PROFILE_KEYS.name, cleanProfile.name);
  localStorage.setItem(PROFILE_KEYS.email, cleanProfile.email);
  localStorage.setItem(PROFILE_KEYS.phone, cleanProfile.phone);
  localStorage.setItem(PROFILE_KEYS.address, cleanProfile.address);
  localStorage.setItem(PROFILE_KEYS.image, cleanProfile.profileImage);

  window.dispatchEvent(new Event("foodExpressProfileUpdated"));

  return cleanProfile;
}

function getInitials(name) {
  const text = String(name || "").trim();

  if (!text) return "U";

  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function renderAvatarElement(element, profile) {
  if (!element) return;

  const image = profile.profileImage;
  const initials = getInitials(profile.name);

  element.innerHTML = "";

  if (image) {
    const img = document.createElement("img");
    img.src = image;
    img.alt = profile.name || "User profile";
    img.className = "profile-avatar-img";

    img.onerror = function () {
      element.innerHTML = "";
      element.textContent = initials;
      element.classList.remove("has-image");
    };

    element.appendChild(img);
    element.classList.add("has-image");
  } else {
    element.textContent = initials;
    element.classList.remove("has-image");
  }
}

function bindProfileEverywhere() {
  const profile = getSavedUserProfile();

  /* Navbar avatar */
  renderAvatarElement(document.getElementById("navbarAvatar"), profile);

  /* Dashboard / welcome avatars */
  renderAvatarElement(document.getElementById("dashboardAvatar"), profile);
  renderAvatarElement(document.getElementById("userAvatar"), profile);
  renderAvatarElement(document.getElementById("welcomeAvatar"), profile);
  renderAvatarElement(document.getElementById("profileAvatar"), profile);
  renderAvatarElement(document.getElementById("customerAvatar"), profile);

  /* Profile edit page image */
  const profileAvatarImage = document.getElementById("profileAvatarImage");
  const profileAvatarInitial = document.getElementById("profileAvatarInitial");

  if (profileAvatarImage && profileAvatarInitial) {
    if (profile.profileImage) {
      profileAvatarImage.src = profile.profileImage;
      profileAvatarImage.style.display = "block";
      profileAvatarInitial.style.display = "none";
    } else {
      profileAvatarImage.style.display = "none";
      profileAvatarInitial.style.display = "flex";
      profileAvatarInitial.textContent = getInitials(profile.name);
    }
  }

  /* Name text IDs */
  setTextIfExists("profileHeaderName", profile.name);
  setTextIfExists("dashboardUserName", profile.name);
  setTextIfExists("dashboardName", profile.name);
  setTextIfExists("userName", profile.name);
  setTextIfExists("customerName", profile.name);
  setTextIfExists("welcomeUserName", profile.name);
  setTextIfExists("welcomeName", profile.name);

  /* Email text IDs */
  setTextIfExists("dashboardUserEmail", profile.email || "No email added");
  setTextIfExists("dashboardEmail", profile.email || "No email added");
  setTextIfExists("userEmail", profile.email || "No email added");
  setTextIfExists("customerEmail", profile.email || "No email added");
  setTextIfExists("welcomeUserEmail", profile.email || "No email added");
  setTextIfExists("welcomeEmail", profile.email || "No email added");

  /* Forms */
  setInputIfExists("fullName", profile.name);
  setInputIfExists("emailAddress", profile.email);
  setInputIfExists("phoneNumber", profile.phone);
  setInputIfExists("address", profile.address);
}

function setTextIfExists(id, value) {
  const element = document.getElementById(id);
  if (element && value !== undefined && value !== null) {
    element.textContent = value;
  }
}

function setInputIfExists(id, value) {
  const element = document.getElementById(id);
  if (element && value !== undefined && value !== null) {
    element.value = value;
  }
}

function handleProfilePhotoUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    alert("Please upload a JPG, PNG, or WEBP image.");
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    alert("Image is too large. Please upload an image under 2MB.");
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e) {
    const currentProfile = getSavedUserProfile();

    const updatedProfile = {
      ...currentProfile,
      profileImage: e.target.result,
    };

    saveUserProfile(updatedProfile);
    bindProfileEverywhere();
  };

  reader.readAsDataURL(file);
}

function saveProfileForm(event) {
  event.preventDefault();

  const oldProfile = getSavedUserProfile();

  const updatedProfile = {
    name: document.getElementById("fullName")?.value.trim() || oldProfile.name,
    email:
      document.getElementById("emailAddress")?.value.trim() || oldProfile.email,
    phone:
      document.getElementById("phoneNumber")?.value.trim() || oldProfile.phone,
    address:
      document.getElementById("address")?.value.trim() || oldProfile.address,
    profileImage: oldProfile.profileImage || "",
  };

  saveUserProfile(updatedProfile);
  bindProfileEverywhere();

  alert("Profile updated successfully!");
}

function resetProfileForm() {
  bindProfileEverywhere();
}

function initProfileBinder() {
  bindProfileEverywhere();

  /*
    Important:
    dashboard.js or other page JS may run after profile.js and overwrite
    text with Guest User. These delayed binds fix that.
  */
  setTimeout(bindProfileEverywhere, 100);
  setTimeout(bindProfileEverywhere, 400);
  setTimeout(bindProfileEverywhere, 900);
  setTimeout(bindProfileEverywhere, 1500);

  const form = document.getElementById("editProfileForm");
  if (form && !form.dataset.profileBound) {
    form.dataset.profileBound = "true";
    form.addEventListener("submit", saveProfileForm);
  }

  const photoInput = document.getElementById("profilePhoto");
  if (photoInput && !photoInput.dataset.profilePhotoBound) {
    photoInput.dataset.profilePhotoBound = "true";
    photoInput.addEventListener("change", handleProfilePhotoUpload);
  }
}

document.addEventListener("DOMContentLoaded", initProfileBinder);

window.addEventListener("storage", (event) => {
  if (
    event.key === PROFILE_KEYS.profile ||
    event.key === PROFILE_KEYS.image ||
    event.key === PROFILE_KEYS.name ||
    event.key === PROFILE_KEYS.email
  ) {
    bindProfileEverywhere();
  }
});

window.addEventListener("foodExpressProfileUpdated", bindProfileEverywhere);

window.getSavedUserProfile = getSavedUserProfile;
window.saveUserProfile = saveUserProfile;
window.bindProfileEverywhere = bindProfileEverywhere;
window.resetProfileForm = resetProfileForm;