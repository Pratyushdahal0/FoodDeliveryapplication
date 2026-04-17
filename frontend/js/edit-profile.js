function getSavedUserProfile() {
  try {
    return JSON.parse(localStorage.getItem("userProfile") || "null");
  } catch (error) {
    console.error("Failed to parse userProfile:", error);
    return null;
  }
}

function getFallbackProfile() {
  return {
    name: localStorage.getItem("userName") || "User",
    email: localStorage.getItem("userEmail") || "",
    phone: localStorage.getItem("userPhone") || "",
    address: localStorage.getItem("userAddress") || "",
    profileImage: localStorage.getItem("userProfileImage") || ""
  };
}

function getProfileData() {
  const saved = getSavedUserProfile();
  if (saved) return saved;
  return getFallbackProfile();
}

function getInitials(name) {
  const text = String(name || "").trim();
  if (!text) return "U";

  const parts = text.split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function renderAvatar(profile) {
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
    avatarInitial.textContent = getInitials(profile.name);
  }
}

function fillProfileForm() {
  const profile = getProfileData();

  document.getElementById("fullName").value = profile.name || "";
  document.getElementById("emailAddress").value = profile.email || "";
  document.getElementById("phoneNumber").value = profile.phone || "";
  document.getElementById("address").value = profile.address || "";

  const profileHeaderName = document.getElementById("profileHeaderName");
  if (profileHeaderName) {
    profileHeaderName.textContent = profile.name || "User";
  }

  renderAvatar(profile);
}

function saveProfile(event) {
  event.preventDefault();

  const oldProfile = getProfileData();

  const updatedProfile = {
    name: document.getElementById("fullName").value.trim(),
    email: document.getElementById("emailAddress").value.trim(),
    phone: document.getElementById("phoneNumber").value.trim(),
    address: document.getElementById("address").value.trim(),
    profileImage: oldProfile.profileImage || ""
  };

  localStorage.setItem("userProfile", JSON.stringify(updatedProfile));
  localStorage.setItem("userName", updatedProfile.name);
  localStorage.setItem("userEmail", updatedProfile.email);
  localStorage.setItem("userPhone", updatedProfile.phone);
  localStorage.setItem("userAddress", updatedProfile.address);
  localStorage.setItem("userProfileImage", updatedProfile.profileImage);

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
    const profile = getProfileData();
    profile.profileImage = e.target.result;

    localStorage.setItem("userProfile", JSON.stringify(profile));
    localStorage.setItem("userProfileImage", profile.profileImage);

    renderAvatar(profile);
  };

  reader.readAsDataURL(file);
}

document.addEventListener("DOMContentLoaded", () => {
  fillProfileForm();

  const form = document.getElementById("editProfileForm");
  if (form) {
    form.addEventListener("submit", saveProfile);
  }

  const photoInput = document.getElementById("profilePhoto");
  if (photoInput) {
    photoInput.addEventListener("change", handleProfilePhotoUpload);
  }
});

window.resetProfileForm = resetProfileForm;