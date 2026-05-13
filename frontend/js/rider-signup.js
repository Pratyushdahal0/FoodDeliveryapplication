const RIDER_APPLICATIONS_KEY = "foodExpressRiderApplications";
const CURRENT_RIDER_APPLICATION_KEY = "foodExpressCurrentRiderApplication";
const AUTH_API = "../../backend/controllers/AuthController.php";

document.addEventListener("DOMContentLoaded", () => {
  bindStepButtons();
  bindPayoutMethod();
  bindSubmit();
  updatePayoutFields();
});

function bindStepButtons() {
  document.querySelectorAll("[data-next]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextStep = Number(btn.dataset.next);
      const currentStep = nextStep - 1;

      if (!validateStep(currentStep)) return;

      goToStep(nextStep);
    });
  });

  document.querySelectorAll("[data-prev]").forEach((btn) => {
    btn.addEventListener("click", () => {
      goToStep(Number(btn.dataset.prev));
    });
  });
}

function bindPayoutMethod() {
  const method = document.getElementById("payoutMethod");
  method?.addEventListener("change", updatePayoutFields);
}

function bindSubmit() {
  const form = document.getElementById("riderSignupForm");
  form?.addEventListener("submit", handleSubmit);
}

function goToStep(step) {
  document.querySelectorAll(".step-panel").forEach((panel) => {
    panel.classList.toggle("active", Number(panel.dataset.panel) === step);
  });

  document.querySelectorAll(".step-item").forEach((item) => {
    const itemStep = Number(item.dataset.step);

    item.classList.toggle("active", itemStep === step);
    item.classList.toggle("completed", itemStep < step);
  });

  document.querySelectorAll(".step-line").forEach((line) => {
    line.classList.toggle("active", Number(line.dataset.line) < step);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function validateStep(step) {
  if (step === 1) {
    const fullName = getValue("fullName");
    const email = getValue("email");
    const phone = getValue("phone");
    const password = getValue("password");
    const confirmPassword = getValue("confirmPassword");

    if (!fullName || fullName.length < 3) {
      showToast("Please enter your full name.", "error");
      focusField("fullName");
      return false;
    }

    if (!isValidEmail(email)) {
      showToast("Please enter a valid email address.", "error");
      focusField("email");
      return false;
    }

    if (!isValidNepaliPhone(phone)) {
      showToast("Please enter a valid Nepal phone number.", "error");
      focusField("phone");
      return false;
    }

    if (password.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      focusField("password");
      return false;
    }

    if (password !== confirmPassword) {
      showToast("Passwords do not match.", "error");
      focusField("confirmPassword");
      return false;
    }
  }

  if (step === 2) {
    if (!getValue("dob")) {
      showToast("Please select your date of birth.", "error");
      focusField("dob");
      return false;
    }

    if (!getValue("zone")) {
      showToast("Please select your delivery zone.", "error");
      focusField("zone");
      return false;
    }

    if (!getValue("address")) {
      showToast("Please enter your current address.", "error");
      focusField("address");
      return false;
    }

    if (!isValidNepaliPhone(getValue("emergencyContact"))) {
      showToast("Please enter a valid emergency contact number.", "error");
      focusField("emergencyContact");
      return false;
    }
  }

  if (step === 3) {
    if (!getValue("vehicleType")) {
      showToast("Please select vehicle type.", "error");
      focusField("vehicleType");
      return false;
    }

    if (!getValue("vehicleModel")) {
      showToast("Please enter vehicle model.", "error");
      focusField("vehicleModel");
      return false;
    }

    if (!getValue("vehicleNumber")) {
      showToast("Please enter vehicle number.", "error");
      focusField("vehicleNumber");
      return false;
    }

    if (!getValue("licenseNumber")) {
      showToast("Please enter license number.", "error");
      focusField("licenseNumber");
      return false;
    }
  }

  return true;
}

function updatePayoutFields() {
  const method = getValue("payoutMethod") || "Bank Transfer";
  const bankFields = document.getElementById("bankFields");
  const walletField = document.getElementById("walletField");

  if (!bankFields || !walletField) return;

  if (method === "Bank Transfer") {
    bankFields.style.display = "block";
    walletField.classList.remove("show");
  } else {
    bankFields.style.display = "none";
    walletField.classList.add("show");
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;

  const method = getValue("payoutMethod");

  if (method === "Bank Transfer") {
    if (!getValue("bankName")) {
      showToast("Please enter your bank name.", "error");
      focusField("bankName");
      return;
    }

    if (!getValue("accountName")) {
      showToast("Please enter account holder name.", "error");
      focusField("accountName");
      return;
    }

    if (!getValue("accountNumber") || getValue("accountNumber").length < 5) {
      showToast("Please enter a valid account number.", "error");
      focusField("accountNumber");
      return;
    }
  } else {
    if (!isValidNepaliPhone(getValue("walletNumber"))) {
      showToast("Please enter a valid wallet number.", "error");
      focusField("walletNumber");
      return;
    }
  }

  if (!document.getElementById("agreement")?.checked) {
    showToast("Please agree to rider verification policies.", "error");
    return;
  }

  const submitBtn = document.querySelector(".submit-application-btn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Submitting..."; }

  try {
    const response = await fetch(AUTH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        name: getValue("fullName"),
        email: getValue("email"),
        password: getValue("password"),
        phone: getValue("phone"),
        address: getValue("address"),
        role: "delivery-rider",
      }),
    });

    let payload;
    try { payload = await response.json(); } catch (_) { payload = null; }

    if (!payload || payload.success !== true) {
      const msg = (payload && payload.message) || "Registration failed. Please try again.";
      showToast(msg, "error");
      return;
    }

    const application = collectApplication();
    const applications = getApplications();
    applications.unshift(application);
    localStorage.setItem(RIDER_APPLICATIONS_KEY, JSON.stringify(applications));
    localStorage.setItem(CURRENT_RIDER_APPLICATION_KEY, JSON.stringify(application));

    localStorage.setItem(
      "riderSignupSuccess",
      "Account created! Check your email to verify before signing in. Admin review takes 24–48 hours."
    );

    showToast("Application submitted successfully!", "success");

    setTimeout(() => {
      window.location.href = "rider-login.html";
    }, 1000);
  } catch (err) {
    console.error("[rider-signup.js] Submit error:", err);
    showToast("Something went wrong. Please check your connection.", "error");
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Submit Application"; }
  }
}

function collectApplication() {
  return {
    id: "RAPP-" + Date.now(),
    riderId: "RID-" + Date.now().toString().slice(-4),
    status: "pending",
    submittedAt: new Date().toISOString(),
    account: {
      fullName: getValue("fullName"),
      email: getValue("email"),
      phone: getValue("phone"),
      password: getValue("password"),
    },
    rider: {
      dob: getValue("dob"),
      zone: getValue("zone"),
      address: getValue("address"),
      emergencyContact: getValue("emergencyContact"),
    },
    vehicle: {
      vehicleType: getValue("vehicleType"),
      vehicleModel: getValue("vehicleModel"),
      vehicleNumber: getValue("vehicleNumber"),
      licenseNumber: getValue("licenseNumber"),
    },
    documents: {
      profilePhoto: getFileName("profilePhoto"),
      licenseDoc: getFileName("licenseDoc"),
      citizenshipDoc: getFileName("citizenshipDoc"),
      vehicleDoc: getFileName("vehicleDoc"),
    },
    payout: {
      method: getValue("payoutMethod"),
      bankName: getValue("bankName"),
      accountName: getValue("accountName"),
      accountNumber: getValue("accountNumber"),
      walletNumber: getValue("walletNumber"),
    },
  };
}

function getApplications() {
  try {
    return JSON.parse(localStorage.getItem(RIDER_APPLICATIONS_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function getValue(id) {
  return String(document.getElementById(id)?.value || "").trim();
}

function getFileName(id) {
  const input = document.getElementById(id);
  return input?.files?.[0]?.name || "";
}

function focusField(id) {
  document.getElementById(id)?.focus();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidNepaliPhone(value) {
  let clean = String(value || "").trim();
  clean = clean.replace(/[\s\-()]/g, "");

  if (clean.startsWith("977")) {
    clean = `+${clean}`;
  }

  return /^9[78]\d{8}$/.test(clean) || /^\+9779[78]\d{8}$/.test(clean);
}

function showToast(message, type = "success") {
  const toast = document.getElementById("riderToast");
  const text = document.getElementById("riderToastMessage");
  const icon = toast?.querySelector("i");

  if (!toast || !text || !icon) {
    console.warn("[rider-signup] Toast elements missing:", message);
    return;
  }

  text.textContent = message;

  icon.className =
    type === "error"
      ? "fa-solid fa-circle-exclamation"
      : type === "warning"
      ? "fa-solid fa-triangle-exclamation"
      : "fa-solid fa-circle-check";

  toast.className = `toast ${type}`;
  toast.offsetHeight;
  toast.classList.add("show");

  clearTimeout(window.__riderSignupToastTimer);

  window.__riderSignupToastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}