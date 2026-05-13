const AUTH_API = "../../backend/controllers/AuthController.php";

document.addEventListener("DOMContentLoaded", () => {
  const form        = document.getElementById("restaurantSignupForm");
  const panels      = document.querySelectorAll(".step-panel");
  const stepItems   = document.querySelectorAll(".step-item");
  const stepLines   = document.querySelectorAll(".step-line");
  const nextButtons = document.querySelectorAll("[data-next]");
  const prevButtons = document.querySelectorAll("[data-prev]");

  let currentStep   = 1;
  let pendingEmail  = "";
  let emailVerified = false;

  /* ── restore any partially filled step 1 data ── */
  const savedBasicInfo = localStorage.getItem("restaurantOwnerBasicInfo");
  if (savedBasicInfo) {
    try {
      const userData = JSON.parse(savedBasicInfo);
      if (userData.email)    document.getElementById("restaurantEmail").value    = userData.email;
      if (userData.phone)    document.getElementById("restaurantPhone").value    = userData.phone;
      if (userData.password) document.getElementById("restaurantPassword").value = userData.password;
    } catch (e) {}
  }

  /* ══════════════════════════════════════════════
     UI helpers
  ══════════════════════════════════════════════ */

  function updateStepUI(step) {
    panels.forEach((p) => p.classList.remove("active"));
    document.querySelector(`[data-panel="${step}"]`)?.classList.add("active");

    stepItems.forEach((item, index) => {
      const n = index + 1;
      item.classList.remove("active", "completed");
      const circle = item.querySelector(".step-circle");
      if (n < step)       { item.classList.add("completed"); circle.textContent = "✓"; }
      else if (n === step) { item.classList.add("active");    circle.textContent = n;   }
      else                  { circle.textContent = n; }
    });

    stepLines.forEach((line, i) => {
      line.classList.toggle("filled", i < step - 1);
    });

    clearStepError();
    currentStep = step;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showStepError(message) {
    const panel = document.querySelector(`[data-panel="${currentStep}"]`);
    if (!panel) return;
    let errEl = panel.querySelector(".signup-error-msg");
    if (!errEl) {
      errEl = document.createElement("p");
      errEl.className = "signup-error-msg";
      errEl.style.cssText =
        "color:#dc2626;background:#fee2e2;border:1px solid #fca5a5;" +
        "border-radius:12px;padding:12px 16px;margin-bottom:18px;font-weight:600;font-size:15px;";
      const note = panel.querySelector(".section-note") || panel.querySelector("h2");
      if (note) note.after(errEl);
      else panel.prepend(errEl);
    }
    errEl.textContent = message;
    errEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearStepError() {
    document.querySelectorAll(".signup-error-msg").forEach((el) => el.remove());
  }

  function setBtnLoading(btn, loading, label) {
    btn.disabled = loading;
    btn.textContent = loading ? "Please wait…" : label;
    if (!loading) {
      const icon = document.createElement("i");
      icon.className = btn.dataset.next ? "fa-solid fa-arrow-right" : "fa-solid fa-paper-plane";
      btn.appendChild(icon);
    }
  }

  /* ══════════════════════════════════════════════
     Data helpers
  ══════════════════════════════════════════════ */

  function getStep1() {
    return {
      restaurantName:     (document.getElementById("restaurantName")?.value     || "").trim(),
      restaurantLocation: (document.getElementById("restaurantLocation")?.value || "").trim(),
      restaurantPhone:    (document.getElementById("restaurantPhone")?.value    || "").trim(),
      restaurantEmail:    (document.getElementById("restaurantEmail")?.value    || "").trim(),
      restaurantPassword: (document.getElementById("restaurantPassword")?.value || "").trim(),
    };
  }

  function getStep2() {
    return {
      ownerFullName: (document.getElementById("ownerFullName")?.value || "").trim(),
    };
  }

  function saveStepData(step) {
    if (step === 1) localStorage.setItem("restaurantSignupStep1", JSON.stringify(getStep1()));
    if (step === 2) localStorage.setItem("restaurantSignupStep2", JSON.stringify(getStep2()));

    if (step === 3) {
      const otp = Array.from(document.querySelectorAll(".otp-input"))
        .map((i) => i.value.trim()).join("");
      localStorage.setItem("restaurantSignupStep3", JSON.stringify({ verificationCode: otp }));
    }

    if (step === 4) {
      localStorage.setItem("restaurantSignupStep4", JSON.stringify({
        restaurantDescription: (document.getElementById("restaurantDescription")?.value || "").trim(),
        cuisineType:  document.getElementById("cuisineType")?.value || "",
        openingTime:  document.getElementById("openingTime")?.value || "",
        closingTime:  document.getElementById("closingTime")?.value || "",
        deliveryAvailable: document.getElementById("deliveryAvailable")?.checked ?? true,
      }));
    }

    if (step === 5) {
      localStorage.setItem("restaurantSignupStep5", JSON.stringify({
        panNumber:         (document.getElementById("panNumber")?.value         || "").trim(),
        businessRegNumber: (document.getElementById("businessRegNumber")?.value || "").trim(),
      }));
    }
  }

  /* ══════════════════════════════════════════════
     Validation
  ══════════════════════════════════════════════ */

  function validateStep(step) {
    if (step === 1) {
      const d = getStep1();
      if (!d.restaurantName)     { showStepError("Restaurant name is required.");     return false; }
      if (!d.restaurantLocation) { showStepError("Restaurant location is required."); return false; }
      if (!d.restaurantPhone)    { showStepError("Phone number is required.");         return false; }
      if (!d.restaurantEmail)    { showStepError("Email address is required.");        return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.restaurantEmail)) {
        showStepError("Please enter a valid email address."); return false;
      }
      if (!d.restaurantPassword)         { showStepError("Password is required.");                   return false; }
      if (d.restaurantPassword.length < 6) { showStepError("Password must be at least 6 characters."); return false; }
      saveStepData(1);
      return true;
    }

    if (step === 2) {
      const d = getStep2();
      if (!d.ownerFullName) { showStepError("Owner full name is required."); return false; }
      saveStepData(2);
      return true;
    }

    if (step === 4) {
      const desc = (document.getElementById("restaurantDescription")?.value || "").trim();
      const cui  = document.getElementById("cuisineType")?.value || "";
      const open = document.getElementById("openingTime")?.value || "";
      const close = document.getElementById("closingTime")?.value || "";
      if (!desc)  { showStepError("Restaurant description is required."); return false; }
      if (!cui)   { showStepError("Cuisine type is required.");            return false; }
      if (!open)  { showStepError("Opening time is required.");            return false; }
      if (!close) { showStepError("Closing time is required.");            return false; }
      saveStepData(4);
      return true;
    }

    if (step === 5) {
      const pan = (document.getElementById("panNumber")?.value         || "").trim();
      const brn = (document.getElementById("businessRegNumber")?.value || "").trim();
      if (!pan) { showStepError("PAN number is required.");                   return false; }
      if (!brn) { showStepError("Business registration number is required."); return false; }
      saveStepData(5);
      return true;
    }

    return true;
  }

  /* ══════════════════════════════════════════════
     Step 2 → 3: register account + send OTP
  ══════════════════════════════════════════════ */

  async function registerAndSendOtp(btn) {
    if (!validateStep(1)) return;
    if (!validateStep(2)) return;

    const s1 = getStep1();
    const s2 = getStep2();

    const origLabel = btn.textContent.trim();
    setBtnLoading(btn, true);

    try {
      const resp = await fetch(AUTH_API, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:   "register",
          name:     s2.ownerFullName,
          email:    s1.restaurantEmail,
          password: s1.restaurantPassword,
          phone:    s1.restaurantPhone,
          address:  s1.restaurantLocation,
          role:     "restaurant-owner",
        }),
      });

      const result = await resp.json();

      if (!result.success) {
        showStepError(result.message || "Registration failed. Please try again.");
        return;
      }

      pendingEmail = s1.restaurantEmail;

      /* update info-box to show the actual email */
      const infoBox = document.querySelector('[data-panel="3"] .info-box');
      if (infoBox) {
        infoBox.innerHTML =
          `<i class="fa-solid fa-envelope-circle-check"></i>` +
          ` We've sent a 6-digit code to <strong>${escapeHtml(pendingEmail)}</strong>.`;
      }

      updateStepUI(3);
      focusFirstOtp();
    } catch (err) {
      showStepError("Network error. Please check your connection and try again.");
    } finally {
      setBtnLoading(btn, false, "Next Step");
    }
  }

  /* ══════════════════════════════════════════════
     Step 3 → 4: verify OTP
  ══════════════════════════════════════════════ */

  async function verifyOtp(btn) {
    const otpInputs = document.querySelectorAll(".otp-input");
    const otp = Array.from(otpInputs).map((i) => i.value.trim()).join("");

    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      showStepError("Please enter the full 6-digit verification code.");
      return;
    }

    const origLabel = btn.textContent.trim();
    setBtnLoading(btn, true);

    try {
      const resp = await fetch(AUTH_API, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_email_otp", email: pendingEmail, otp }),
      });

      const result = await resp.json();

      if (!result.success) {
        showStepError(result.message || "Invalid code. Please try again.");
        return;
      }

      emailVerified = true;
      saveStepData(3);
      updateStepUI(4);
    } catch (err) {
      showStepError("Network error. Please check your connection and try again.");
    } finally {
      setBtnLoading(btn, false, "Next Step");
    }
  }

  /* ══════════════════════════════════════════════
     Resend OTP
  ══════════════════════════════════════════════ */

  async function resendOtp() {
    if (!pendingEmail) {
      showStepError("No email on record. Please go back and check your email address.");
      return;
    }

    const resendSpan = document.querySelector(".resend-text span");
    if (resendSpan) { resendSpan.textContent = "Sending…"; resendSpan.style.pointerEvents = "none"; }

    try {
      const resp = await fetch(AUTH_API, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend_email_otp", email: pendingEmail }),
      });

      const result = await resp.json();

      if (result.success) {
        clearStepError();
        const p = document.createElement("p");
        p.style.cssText = "color:#16a34a;font-weight:600;font-size:14px;margin-top:8px;";
        p.textContent   = "A new code has been sent to your email.";
        document.querySelector(".verification-block")?.appendChild(p);
        setTimeout(() => p.remove(), 4000);

        /* clear current inputs */
        document.querySelectorAll(".otp-input").forEach((i) => { i.value = ""; });
        focusFirstOtp();
      } else {
        showStepError(result.message || "Could not resend code. Please try again.");
      }
    } catch (err) {
      showStepError("Network error. Please try again.");
    } finally {
      if (resendSpan) {
        resendSpan.textContent = "Resend";
        resendSpan.style.pointerEvents = "";

        /* 60-second cooldown */
        let secs = 60;
        resendSpan.style.pointerEvents = "none";
        resendSpan.style.opacity = "0.5";
        const tick = setInterval(() => {
          secs--;
          resendSpan.textContent = `Resend (${secs}s)`;
          if (secs <= 0) {
            clearInterval(tick);
            resendSpan.textContent = "Resend";
            resendSpan.style.pointerEvents = "";
            resendSpan.style.opacity = "";
          }
        }, 1000);
      }
    }
  }

  /* ══════════════════════════════════════════════
     Final submit (step 5)
  ══════════════════════════════════════════════ */

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateStep(5)) return;

    const submitBtn = form.querySelector('[type="submit"]');
    const origLabel = submitBtn?.textContent?.trim() || "Register Restaurant";
    if (submitBtn) setBtnLoading(submitBtn, true);

    /* compile full application payload for admin review */
    const application = {
      step1: JSON.parse(localStorage.getItem("restaurantSignupStep1") || "{}"),
      step2: JSON.parse(localStorage.getItem("restaurantSignupStep2") || "{}"),
      step4: JSON.parse(localStorage.getItem("restaurantSignupStep4") || "{}"),
      step5: JSON.parse(localStorage.getItem("restaurantSignupStep5") || "{}"),
      submittedAt:    new Date().toISOString(),
      emailVerified,
    };

    localStorage.setItem("restaurantPendingApplication", JSON.stringify(application));

    /* clear signup temp keys */
    ["restaurantSignupStep1","restaurantSignupStep2","restaurantSignupStep3",
     "restaurantSignupStep4","restaurantSignupStep5","restaurantOwnerBasicInfo"]
      .forEach((k) => localStorage.removeItem(k));

    if (submitBtn) setBtnLoading(submitBtn, false, origLabel);

    localStorage.setItem("restaurantSignupSuccess",
      "Your restaurant application has been submitted and is under review. " +
      "You will be notified within 24-48 hours once approved.");

    window.location.href = "restaurant-login.html";
  });

  /* ══════════════════════════════════════════════
     Button wiring
  ══════════════════════════════════════════════ */

  nextButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nextStep = Number(btn.dataset.next);
      clearStepError();

      /* Step 2 → 3: register + send OTP */
      if (currentStep === 2 && nextStep === 3) {
        await registerAndSendOtp(btn);
        return;
      }

      /* Step 3 → 4: verify OTP */
      if (currentStep === 3 && nextStep === 4) {
        await verifyOtp(btn);
        return;
      }

      if (validateStep(currentStep)) {
        updateStepUI(nextStep);
      }
    });
  });

  prevButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      clearStepError();
      updateStepUI(Number(btn.dataset.prev));
    });
  });

  /* ══════════════════════════════════════════════
     OTP input auto-advance + backspace
  ══════════════════════════════════════════════ */

  function bindOtpInputs() {
    const otpInputs = document.querySelectorAll(".otp-input");
    otpInputs.forEach((input, index) => {
      input.addEventListener("input", () => {
        /* only allow digits */
        input.value = input.value.replace(/\D/g, "").slice(0, 1);
        if (input.value && index < otpInputs.length - 1) {
          otpInputs[index + 1].focus();
        }
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !input.value && index > 0) {
          otpInputs[index - 1].focus();
        }
      });

      input.addEventListener("paste", (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData)
          .getData("text").replace(/\D/g, "").slice(0, 6);
        otpInputs.forEach((inp, i) => { inp.value = pasted[i] || ""; });
        const lastFilled = Math.min(pasted.length, otpInputs.length - 1);
        otpInputs[lastFilled].focus();
      });
    });
  }

  function focusFirstOtp() {
    document.querySelector(".otp-input")?.focus();
  }

  bindOtpInputs();

  /* resend OTP link */
  document.querySelector(".resend-text span")?.addEventListener("click", resendOtp);

  /* ══════════════════════════════════════════════
     Utility
  ══════════════════════════════════════════════ */

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  updateStepUI(1);
});

/* ── password toggle (called from inline onclick) ── */
function toggleRestaurantPassword() {
  const input = document.getElementById("restaurantPassword");
  if (input) input.type = input.type === "password" ? "text" : "password";
}
window.toggleRestaurantPassword = toggleRestaurantPassword;
