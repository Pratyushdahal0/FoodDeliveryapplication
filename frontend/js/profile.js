const USER_PROFILE_KEY = 'foodExpressUserProfile';
const USER_SESSION_KEY = 'foodExpressSession';

function getStoredProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(USER_PROFILE_KEY) || 'null');
    return profile && typeof profile === 'object' ? profile : null;
  } catch (error) {
    console.error('Failed to parse user profile:', error);
    return null;
  }
}

function saveStoredProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;

  const current = getStoredProfile() || {};
  const merged = {
    ...current,
    ...profile,
    name: resolveProfileName({ ...current, ...profile }),
    updated_at: new Date().toISOString()
  };

  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent('foodexpress:profile-updated', { detail: merged }));
  return merged;
}

function clearStoredProfile() {
  localStorage.removeItem(USER_PROFILE_KEY);
  window.dispatchEvent(new CustomEvent('foodexpress:profile-updated', { detail: null }));
}

function resolveProfileName(profile) {
  if (profile.name && String(profile.name).trim()) {
    return String(profile.name).trim();
  }

  if (profile.full_name && String(profile.full_name).trim()) {
    return String(profile.full_name).trim();
  }

  const combined = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .join(' ')
    .trim();

  if (combined) return combined;

  if (profile.email) {
    return String(profile.email).split('@')[0];
  }

  return 'Guest User';
}

function getProfileInitials(profile) {
  const name = resolveProfileName(profile || {});
  const parts = name.split(' ').filter(Boolean);

  if (!parts.length) return 'GU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getAvatarUrl(profile) {
  if (!profile) return '';
  return (
    profile.avatar_url ||
    profile.photo_url ||
    profile.profile_photo ||
    ''
  );
}

function getSafeProfile() {
  const profile = getStoredProfile() || {};
  return {
    ...profile,
    name: resolveProfileName(profile),
    email: profile.email || localStorage.getItem('userEmail') || '',
    initials: getProfileInitials(profile),
    avatar_url: getAvatarUrl(profile),
    orders: Number(profile.orders || 0),
    points: Number(profile.points || 0),
    saved: Number(profile.saved || 0)
  };
}

function bootstrapProfileFromSession() {
  const profile = getStoredProfile();
  if (profile) return profile;

  const fallbackEmail = localStorage.getItem('userEmail') || '';
  const fallbackRole = localStorage.getItem('userRole') || '';

  if (!fallbackEmail) return null;

  return saveStoredProfile({
    email: fallbackEmail,
    role: fallbackRole,
    name: fallbackEmail.split('@')[0],
    orders: 0,
    points: 0,
    saved: 0
  });
}

function renderAvatar(container, profile = getSafeProfile()) {
  if (!container) return;

  const imageUrl = profile.avatar_url;
  const initials = profile.initials || getProfileInitials(profile);

  container.classList.add('fe-avatar');

  if (imageUrl) {
    container.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(profile.name)}" class="fe-avatar-image" />`;
  } else {
    container.innerHTML = `<span class="fe-avatar-text">${escapeHtml(initials)}</span>`;
  }
}

function bindProfileText() {
  const profile = getSafeProfile();

  const welcomeName = document.getElementById('welcomeName');
  const welcomeEmail = document.getElementById('welcomeEmail');
  const ordersCount = document.getElementById('ordersCount');
  const pointsCount = document.getElementById('pointsCount');
  const savingsAmount = document.getElementById('savingsAmount');

  if (welcomeName) welcomeName.textContent = profile.name;
  if (welcomeEmail) welcomeEmail.textContent = profile.email || 'No email added';
  if (ordersCount) ordersCount.textContent = String(profile.orders || 0);
  if (pointsCount) pointsCount.textContent = String(profile.points || 0);
  if (savingsAmount) savingsAmount.textContent = `$${Number(profile.saved || 0).toFixed(0)}`;
}

function bindProfileAvatars() {
  const profile = getSafeProfile();

  const welcomeAvatar = document.getElementById('welcomeAvatar');
  const navbarAvatar = document.getElementById('navbarAvatar');
  const accountAvatar = document.getElementById('accountAvatar');

  if (welcomeAvatar) renderAvatar(welcomeAvatar, profile);
  if (navbarAvatar) renderAvatar(navbarAvatar, profile);
  if (accountAvatar) renderAvatar(accountAvatar, profile);
}

function bindProfileEverywhere() {
  bootstrapProfileFromSession();
  bindProfileText();
  bindProfileAvatars();
}

function updateProfileStats(partialStats = {}) {
  const profile = getSafeProfile();
  return saveStoredProfile({
    ...profile,
    orders: Number(partialStats.orders ?? profile.orders ?? 0),
    points: Number(partialStats.points ?? profile.points ?? 0),
    saved: Number(partialStats.saved ?? profile.saved ?? 0)
  });
}

function addRewardPoints(pointsToAdd = 0) {
  const profile = getSafeProfile();
  const nextPoints = Number(profile.points || 0) + Number(pointsToAdd || 0);

  return saveStoredProfile({
    ...profile,
    points: nextPoints
  });
}

function incrementOrderCount() {
  const profile = getSafeProfile();
  return saveStoredProfile({
    ...profile,
    orders: Number(profile.orders || 0) + 1
  });
}

function updateProfilePhoto(photoUrl) {
  return saveStoredProfile({
    ...getSafeProfile(),
    avatar_url: photoUrl || ''
  });
}

function updateProfileDetails(details = {}) {
  return saveStoredProfile({
    ...getSafeProfile(),
    ...details
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

window.getStoredProfile = getStoredProfile;
window.saveStoredProfile = saveStoredProfile;
window.clearStoredProfile = clearStoredProfile;
window.getSafeProfile = getSafeProfile;
window.bootstrapProfileFromSession = bootstrapProfileFromSession;
window.renderAvatar = renderAvatar;
window.bindProfileEverywhere = bindProfileEverywhere;
window.updateProfileStats = updateProfileStats;
window.addRewardPoints = addRewardPoints;
window.incrementOrderCount = incrementOrderCount;
window.updateProfilePhoto = updateProfilePhoto;
window.updateProfileDetails = updateProfileDetails;

document.addEventListener('DOMContentLoaded', bindProfileEverywhere);
window.addEventListener('foodexpress:profile-updated', bindProfileEverywhere);