document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const payload = {
      name: document.getElementById("registerName").value.trim(),
      email: document.getElementById("registerEmail").value.trim(),
      password: document.getElementById("registerPassword").value,
      phone: document.getElementById("registerPhone").value.trim(),
      address: document.getElementById("registerAddress").value.trim(),
      role: document.getElementById("registerRole").value
    };

    if (!payload.name || !payload.email || !payload.password) {
      showMessage("Please fill all required fields", "error");
      return;
    }

    if (payload.role === "restaurant-owner") {
      localStorage.setItem("restaurantOwnerBasicInfo", JSON.stringify(payload));
      window.location.href = "./restaurant-signup.html";
      return;
    }

    const result = await registerUser(payload);
    showMessage(result.message, result.success ? "success" : "error");

    if (result.success) {
      document.getElementById("registerForm").reset();
      tabButtons[0].click();
    }
  } catch (error) {
    showMessage("Could not connect to backend", "error");
    console.error(error);
  }
});