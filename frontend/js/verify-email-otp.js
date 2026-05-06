console.log("VERIFY EMAIL OTP JS LOADED - HOSTED SAFE PATH FIX");

function getAuthUrl() {
  const url = "../../backend/controllers/AuthController.php";
  console.log("OTP Auth URL:", url);
  return url;
}

function getPendingEmail() {
  const params = new URLSearchParams(window.location.search);

  return (
    params.get("email") ||
    localStorage.getItem("pendingVerificationEmail") ||
    localStorage.getItem("userEmail") ||
    ""
  );
}

function showOtpError(message) {
  const errorBox = document.getElementById("otpError");
  const successBox = document.getElementById("otpSuccess");

  if (successBox) successBox.innerText = "";
  if (errorBox) errorBox.innerText = message;
}

function showOtpSuccess(message) {
  const errorBox = document.getElementById("otpError");
  const successBox = document.getElementById("otpSuccess");

  if (errorBox) errorBox.innerText = "";
  if (successBox) successBox.innerText = message;
}

function setLoading(button, loading, text) {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.innerText;
    button.disabled = true;
    button.innerText = text || "Please wait...";
  } else {
    button.disabled = false;
    button.innerText = button.dataset.originalText || button.innerText;
  }
}

async function parseJsonResponse(response) {
  const raw = await response.text();

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("OTP backend returned non-JSON:", raw);
    throw new Error(
      "Server did not return valid JSON. Please refresh and try again."
    );
  }
}

async function verifyOtp() {
  const email = getPendingEmail();
  const otp = document.getElementById("otpInput")?.value.trim();
  const button = document.getElementById("verifyOtpBtn");

  if (!email) {
    showOtpError("Email not found. Please sign up or login again.");
    return;
  }

  if (!otp || !/^[0-9]{6}$/.test(otp)) {
    showOtpError("Please enter the 6-digit OTP.");
    return;
  }

  const formData = new FormData();
  formData.append("action", "verify_email_otp");
  formData.append("email", email);
  formData.append("otp", otp);

  try {
    setLoading(button, true, "Verifying...");

    const response = await fetch(getAuthUrl(), {
      method: "POST",
      body: formData,
    });

    const result = await parseJsonResponse(response);

    if (!result.success) {
      showOtpError(result.message || "Verification failed.");
      return;
    }

    localStorage.setItem("foodExpressEmailVerified", "true");
    localStorage.removeItem("pendingVerificationEmail");
    localStorage.removeItem("pendingVerificationName");

    showOtpSuccess(result.message || "Email verified successfully.");

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1000);
  } catch (error) {
    console.error("OTP Verification Error:", error);
    showOtpError("Something went wrong: " + error.message);
  } finally {
    setLoading(button, false);
  }
}

async function resendOtp() {
  const email = getPendingEmail();
  const button = document.getElementById("resendOtpBtn");

  if (!email) {
    showOtpError("Email not found. Please sign up or login again.");
    return;
  }

  const formData = new FormData();
  formData.append("action", "resend_email_otp");
  formData.append("email", email);

  try {
    setLoading(button, true, "Sending...");

    const response = await fetch(getAuthUrl(), {
      method: "POST",
      body: formData,
    });

    const result = await parseJsonResponse(response);

    if (!result.success) {
      showOtpError(result.message || "Could not resend OTP.");
      return;
    }

    showOtpSuccess(result.message || "A new code has been sent.");
  } catch (error) {
    console.error("Resend OTP Error:", error);
    showOtpError("Could not resend OTP: " + error.message);
  } finally {
    setLoading(button, false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const email = getPendingEmail();
  const emailText = document.getElementById("otpEmailText");
  const otpInput = document.getElementById("otpInput");

  if (emailText) {
    emailText.textContent = email || "your email";
  }

  document.getElementById("verifyOtpBtn")?.addEventListener("click", verifyOtp);
  document.getElementById("resendOtpBtn")?.addEventListener("click", resendOtp);

  otpInput?.addEventListener("input", () => {
    otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 6);
  });

  otpInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      verifyOtp();
    }
  });

  otpInput?.focus();
});