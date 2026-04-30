const RIDER_APPLICATIONS_KEY = "foodExpressRiderApplications";
const RIDER_PROFILE_KEY = "foodExpressRiderProfile";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("riderLoginForm");
  const toggle = document.getElementById("togglePassword");

  form?.addEventListener("submit", handleRiderLogin);

  toggle?.addEventListener("click", () => {
    const input = document.getElementById("riderPassword");
    const icon = toggle.querySelector("i");

    if (!input || !icon) return;

    input.type = input.type === "password" ? "text" : "password";
    icon.className =
      input.type === "password" ? "fa-solid fa-eye" : "fa-solid fa-eye-slash";
  });
});

function handleRiderLogin(event) {
  event.preventDefault();

  const email = document.getElementById("riderEmail")?.value.trim();
  const password = document.getElementById("riderPassword")?.value.trim();

  if (!email || !password) {
    showMessage("Please enter your rider email and password.", "error");
    return;
  }

  const demoValid = email === "rider@foodexpress.com" && password === "rider123";
  const application = findRiderApplication(email, password);

  if (!demoValid && !application) {
    showMessage("Invalid rider login details.", "error");
    return;
  }

  const profile = application
    ? buildProfileFromApplication(application)
    : getDemoRiderProfile();

  localStorage.setItem("foodExpressRiderLoggedIn", "true");
  localStorage.setItem("foodExpressRiderEmail", email);
  localStorage.setItem(RIDER_PROFILE_KEY, JSON.stringify(profile));

  showMessage("Login successful. Redirecting to rider panel...", "success");

  setTimeout(() => {
    window.location.href = "rider-dashboard.html";
  }, 800);
}

function findRiderApplication(email, password) {
  try {
    const applications =
      JSON.parse(localStorage.getItem(RIDER_APPLICATIONS_KEY)) || [];

    return applications.find(
      (app) =>
        String(app.account.email).toLowerCase() === email.toLowerCase() &&
        app.account.password === password
    );
  } catch (error) {
    console.error("Rider application read failed:", error);
    return null;
  }
}

function buildProfileFromApplication(app) {
  return {
    name: app.account.fullName,
    email: app.account.email,
    phone: app.account.phone,
    riderId: app.riderId || "RID-" + Date.now().toString().slice(-4),
    status: "pending_review",
    avatar: "",
    zone: app.rider.zone,
    address: app.rider.address,
    vehicleType: app.vehicle.vehicleType,
    vehicleNumber: app.vehicle.vehicleNumber,
    rating: 4.9,
    totalDeliveries: 0,
  };
}

function getDemoRiderProfile() {
  return {
    name: "Ramesh Tamang",
    email: "rider@foodexpress.com",
    phone: "9849220167",
    riderId: "RID-1001",
    status: "approved",
    avatar: "",
    zone: "Kathmandu",
    address: "Koteshwor, Kathmandu",
    vehicleType: "Bike",
    vehicleNumber: "BA 95 PA 1234",
    rating: 4.9,
    totalDeliveries: 32,
  };
}

function showMessage(message, type) {
  const box = document.getElementById("loginMessage");
  if (!box) return;

  box.className = `message-box ${type}`;
  box.textContent = message;
}