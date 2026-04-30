console.log("[profile.js] Unified profile system loaded");

const CURRENT_USER_KEY = "foodExpressCurrentUser";

function readJsonSafe(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Failed to parse ${key}:`, error);
    return fallback;
  }
}

function saveJsonSafe(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getFallbackProfile() {
  return {
    id: "",
    name: localStorage.getItem("userName") || "User",
    email: localStorage.getItem("userEmail") || "",
    phone: localStorage.getItem("userPhone") || "",
    address: localStorage.getItem("userAddress") || "",
    role: localStorage.getItem("userRole") || "customer",
    status: "active",
    points: Number(localStorage.getItem("userPoints") || 0),
    profileImage: localStorage.getItem("userProfileImage") || "",
    email_verified_at: null,
  };
}

function normalizeProfile(profile = {}) {
  const fallback = getFallbackProfile();

  return {
    id: profile.id || fallback.id,
    name: profile.name || fallback.name || "User",
    email: profile.email || fallback.email || "",
    phone: profile.phone || fallback.phone || "",
    address: profile.address || fallback.address || "",
    role: profile.role || fallback.role || "customer",
    status: profile.status || fallback.status || "active",
    created_at: profile.created_at || "",
    email_verified_at: profile.email_verified_at || null,
    points: Number(profile.points ?? fallback.points ?? 0),
    profileImage:
      profile.profileImage ||
      profile.profile_image ||
      profile.avatar ||
      fallback.profileImage ||
      "",
  };
}

function getSafeProfile() {
  const currentUser = readJsonSafe(CURRENT_USER_KEY, null);

  if (currentUser && currentUser.email) {
    return normalizeProfile(currentUser);
  }

  const oldProfile =
    readJsonSafe("userProfile", null) ||
    readJsonSafe("foodExpressProfile", null) ||
    readJsonSafe("foodExpressUserProfile", null) ||
    readJsonSafe("currentUser", null);

  if (oldProfile && oldProfile.email) {
    const normalized = normalizeProfile(oldProfile);
    saveStoredProfile(normalized);
    return normalized;
  }

  return normalizeProfile(getFallbackProfile());
}

function getUserProfile() {
  return getSafeProfile();
}

function saveStoredProfile(profile) {
  const normalized = normalizeProfile(profile);

  saveJsonSafe(CURRENT_USER_KEY, normalized);

  // Compatibility for old pages still reading these keys
  saveJsonSafe("userProfile", normalized);
  saveJsonSafe("foodExpressProfile", normalized);
  saveJsonSafe("foodExpressUserProfile", normalized);
  saveJsonSafe("currentUser", normalized);

  localStorage.setItem("userName", normalized.name);
  localStorage.setItem("userEmail", normalized.email);
  localStorage.setItem("userPhone", normalized.phone);
  localStorage.setItem("userAddress", normalized.address);
  localStorage.setItem("userRole", normalized.role);
  localStorage.setItem("userProfileImage", normalized.profileImage || "");

  window.dispatchEvent(new CustomEvent("foodexpress:profile-updated"));

  return normalized;
}

function clearStoredProfile() {
  [
    CURRENT_USER_KEY,
    "userProfile",
    "foodExpressProfile",
    "foodExpressUserProfile",
    "currentUser",
    "foodExpressCurrentProfile",
    "profileData",
    "userName",
    "userPhone",
    "userAddress",
    "userProfileImage",
    "profilePhoto",
    "userAvatar",
  ].forEach((key) => localStorage.removeItem(key));
}

function getInitials(name) {
  const text = String(name || "").trim();
  if (!text) return "U";

  const parts = text.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

/*
  Flexible avatar function:
  - renderAvatar(profile) for edit-profile page
  - renderAvatar(element, profile) for dashboard/navbar
*/
function renderAvatar(targetOrProfile, maybeProfile) {
  const isElement =
    targetOrProfile instanceof HTMLElement ||
    targetOrProfile instanceof Element;

  const target = isElement ? targetOrProfile : null;
  const profile = isElement
    ? normalizeProfile(maybeProfile || getSafeProfile())
    : normalizeProfile(targetOrProfile || getSafeProfile());

  const initials = getInitials(profile.name);

  if (target) {
    target.innerHTML = "";

    if (profile.profileImage) {
      const img = document.createElement("img");
      img.src = profile.profileImage;
      img.alt = profile.name || "User";
      target.appendChild(img);
    } else {
      target.textContent = initials;
    }

    return;
  }

  const avatarImage = document.getElementById("profileAvatarImage");
  const avatarInitial = document.getElementById("profileAvatarInitial");

  if (!avatarImage || !avatarInitial) return;

  if (profile.profileImage) {
    avatarImage.src = profile.profileImage;
    avatarImage.style.display = "block";
    avatarInitial.style.display = "none";
  } else {
    avatarImage.style.display = "none";
    avatarInitial.style.display = "block";
    avatarInitial.textContent = initials;
  }
}

function bindProfileEverywhere() {
  const profile = getSafeProfile();

  const navbarAvatar = document.getElementById("navbarAvatar");
  if (navbarAvatar) {
    renderAvatar(navbarAvatar, profile);
    navbarAvatar.onclick = () => {
      window.location.href = "edit-profile.html";
    };
  }

  const welcomeName = document.getElementById("welcomeName");
  if (welcomeName) welcomeName.textContent = profile.name || "User";

  const welcomeEmail = document.getElementById("welcomeEmail");
  if (welcomeEmail) welcomeEmail.textContent = profile.email || "";

  const profileHeaderName = document.getElementById("profileHeaderName");
  if (profileHeaderName) profileHeaderName.textContent = profile.name || "User";
}

function fillProfileForm() {
  const profile = getSafeProfile();

  const fullName = document.getElementById("fullName");
  const emailAddress = document.getElementById("emailAddress");
  const phoneNumber = document.getElementById("phoneNumber");
  const address = document.getElementById("address");

  if (fullName) fullName.value = profile.name || "";
  if (emailAddress) emailAddress.value = profile.email || "";
  if (phoneNumber) phoneNumber.value = profile.phone || "";
  if (address) address.value = profile.address || "";

  const profileHeaderName = document.getElementById("profileHeaderName");
  if (profileHeaderName) {
    profileHeaderName.textContent = profile.name || "User";
  }

  renderAvatar(profile);
}

function saveProfile(event) {
  if (event) event.preventDefault();

  const oldProfile = getSafeProfile();

  const updatedProfile = {
    ...oldProfile,
    name: document.getElementById("fullName")?.value.trim() || oldProfile.name,
    email:
      document.getElementById("emailAddress")?.value.trim() || oldProfile.email,
    phone:
      document.getElementById("phoneNumber")?.value.trim() || oldProfile.phone,
    address:
      document.getElementById("address")?.value.trim() || oldProfile.address,
    profileImage: oldProfile.profileImage || "",
  };

  saveStoredProfile(updatedProfile);

  alert("Profile updated successfully!");
  fillProfileForm();
}

function resetProfileForm() {
  fillProfileForm();
}

function handleProfilePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (e) {
    const profile = getSafeProfile();

    const updatedProfile = {
      ...profile,
      profileImage: e.target.result,
    };

    saveStoredProfile(updatedProfile);
    renderAvatar(updatedProfile);
    bindProfileEverywhere();
  };

  reader.readAsDataURL(file);
}

document.addEventListener("DOMContentLoaded", () => {
  bindProfileEverywhere();

  if (document.getElementById("editProfileForm")) {
    fillProfileForm();

    const form = document.getElementById("editProfileForm");
    form.addEventListener("submit", saveProfile);
  }

  const photoInput = document.getElementById("profilePhoto");
  if (photoInput) {
    photoInput.addEventListener("change", handleProfilePhotoUpload);
  }
});

window.getSafeProfile = getSafeProfile;
window.getUserProfile = getUserProfile;
window.saveStoredProfile = saveStoredProfile;
window.clearStoredProfile = clearStoredProfile;
window.getInitials = getInitials;
window.renderAvatar = renderAvatar;
window.bindProfileEverywhere = bindProfileEverywhere;
window.resetProfileForm = resetProfileForm;