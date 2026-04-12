const DEMO_MODE = true;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("restaurantSignupForm");
  const panels = document.querySelectorAll(".step-panel");
  const stepItems = document.querySelectorAll(".step-item");
  const stepLines = document.querySelectorAll(".step-line");
  const nextButtons = document.querySelectorAll("[data-next]");
  const prevButtons = document.querySelectorAll("[data-prev]");

  let currentStep = 1;

  const savedBasicInfo = localStorage.getItem("restaurantOwnerBasicInfo");

  if (savedBasicInfo) {
    try {
      const userData = JSON.parse(savedBasicInfo);

      if (userData.email) {
        document.getElementById("restaurantEmail").value = userData.email;
      }

      if (userData.phone) {
        document.getElementById("restaurantPhone").value = userData.phone;
      }

      if (userData.password) {
        document.getElementById("restaurantPassword").value = userData.password;
      }
    } catch (error) {
      console.error("Error reading restaurant owner data:", error);
    }
  }

  function updateStepUI(step) {
    panels.forEach((panel) => {
      panel.classList.remove("active");
    });

    const currentPanel = document.querySelector(`[data-panel="${step}"]`);
    if (currentPanel) {
      currentPanel.classList.add("active");
    }

    stepItems.forEach((item, index) => {
      const stepNumber = index + 1;
      item.classList.remove("active", "completed");

      const circle = item.querySelector(".step-circle");

      if (stepNumber < step) {
        item.classList.add("completed");
        circle.textContent = "✓";
      } else if (stepNumber === step) {
        item.classList.add("active");
        circle.textContent = stepNumber;
      } else {
        circle.textContent = stepNumber;
      }
    });

    stepLines.forEach((line, index) => {
      if (index < step - 1) {
        line.classList.add("filled");
      } else {
        line.classList.remove("filled");
      }
    });

    currentStep = step;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveStepData(step) {
    if (step === 1) {
      const restaurantName = document.getElementById("restaurantName").value.trim();
      const restaurantLocation = document.getElementById("restaurantLocation").value.trim();
      const restaurantPhone = document.getElementById("restaurantPhone").value.trim();
      const restaurantEmail = document.getElementById("restaurantEmail").value.trim();
      const restaurantPassword = document.getElementById("restaurantPassword").value.trim();

      localStorage.setItem(
        "restaurantSignupStep1",
        JSON.stringify({
          restaurantName,
          restaurantLocation,
          restaurantPhone,
          restaurantEmail,
          restaurantPassword
        })
      );
    }

    if (step === 2) {
      const ownerFullName = document.getElementById("ownerFullName").value.trim();

      localStorage.setItem(
        "restaurantSignupStep2",
        JSON.stringify({
          ownerFullName
        })
      );
    }

    if (step === 3) {
      const otpInputs = document.querySelectorAll(".otp-input");
      const otpValue = Array.from(otpInputs)
        .map((input) => input.value.trim())
        .join("");

      localStorage.setItem(
        "restaurantSignupStep3",
        JSON.stringify({
          verificationCode: otpValue
        })
      );
    }

    if (step === 4) {
      const restaurantDescription = document.getElementById("restaurantDescription").value.trim();
      const cuisineType = document.getElementById("cuisineType").value;
      const openingTime = document.getElementById("openingTime").value;
      const closingTime = document.getElementById("closingTime").value;
      const deliveryAvailable = document.getElementById("deliveryAvailable").checked;

      localStorage.setItem(
        "restaurantSignupStep4",
        JSON.stringify({
          restaurantDescription,
          cuisineType,
          openingTime,
          closingTime,
          deliveryAvailable
        })
      );
    }

    if (step === 5) {
      const panNumber = document.getElementById("panNumber").value.trim();
      const businessRegNumber = document.getElementById("businessRegNumber").value.trim();

      localStorage.setItem(
        "restaurantSignupStep5",
        JSON.stringify({
          panNumber,
          businessRegNumber
        })
      );
    }
  }

  function validateStep(step) {
    if (DEMO_MODE) {
      saveStepData(step);
      return true;
    }

    if (step === 1) {
      const restaurantName = document.getElementById("restaurantName").value.trim();
      const restaurantLocation = document.getElementById("restaurantLocation").value.trim();
      const restaurantPhone = document.getElementById("restaurantPhone").value.trim();
      const restaurantEmail = document.getElementById("restaurantEmail").value.trim();
      const restaurantPassword = document.getElementById("restaurantPassword").value.trim();

      if (!restaurantName || !restaurantLocation || !restaurantPhone || !restaurantEmail || !restaurantPassword) {
        alert("Please fill all required fields in Basic Information.");
        return false;
      }

      saveStepData(1);
    }

    if (step === 2) {
      const ownerFullName = document.getElementById("ownerFullName").value.trim();

      if (!ownerFullName) {
        alert("Please enter owner full name.");
        return false;
      }

      saveStepData(2);
    }

    if (step === 3) {
      const otpInputs = document.querySelectorAll(".otp-input");
      const otpValue = Array.from(otpInputs)
        .map((input) => input.value.trim())
        .join("");

      if (otpValue.length !== 6) {
        alert("Please enter the 6-digit verification code.");
        return false;
      }

      saveStepData(3);
    }

    if (step === 4) {
      const restaurantDescription = document.getElementById("restaurantDescription").value.trim();
      const cuisineType = document.getElementById("cuisineType").value;
      const openingTime = document.getElementById("openingTime").value;
      const closingTime = document.getElementById("closingTime").value;

      if (!restaurantDescription || !cuisineType || !openingTime || !closingTime) {
        alert("Please fill all required restaurant details.");
        return false;
      }

      saveStepData(4);
    }

    if (step === 5) {
      const panNumber = document.getElementById("panNumber").value.trim();
      const businessRegNumber = document.getElementById("businessRegNumber").value.trim();

      if (!panNumber || !businessRegNumber) {
        alert("Please fill all required legal information.");
        return false;
      }

      saveStepData(5);
    }

    return true;
  }

  nextButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextStep = Number(button.dataset.next);

      if (validateStep(currentStep)) {
        updateStepUI(nextStep);
      }
    });
  });

  prevButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const prevStep = Number(button.dataset.prev);
      updateStepUI(prevStep);
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!validateStep(5)) return;

    if (DEMO_MODE) {
      window.location.href = "ownerdashboard.html";
      return;
    }

    const finalData = {
      step1: JSON.parse(localStorage.getItem("restaurantSignupStep1") || "{}"),
      step2: JSON.parse(localStorage.getItem("restaurantSignupStep2") || "{}"),
      step3: JSON.parse(localStorage.getItem("restaurantSignupStep3") || "{}"),
      step4: JSON.parse(localStorage.getItem("restaurantSignupStep4") || "{}"),
      step5: JSON.parse(localStorage.getItem("restaurantSignupStep5") || "{}")
    };

    console.log("Final Restaurant Signup Data:", finalData);
    alert("Restaurant registration submitted successfully!");
  });

  const otpInputs = document.querySelectorAll(".otp-input");
  otpInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      if (input.value.length === 1 && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && index > 0) {
        otpInputs[index - 1].focus();
      }
    });
  });

  updateStepUI(1);
});

function toggleRestaurantPassword() {
  const passwordInput = document.getElementById("restaurantPassword");

  if (passwordInput.type === "password") {
    passwordInput.type = "text";
  } else {
    passwordInput.type = "password";
  }
}

window.toggleRestaurantPassword = toggleRestaurantPassword;