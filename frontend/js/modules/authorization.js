const registerForm = document.getElementById("registerForm");

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      const payload = {
        name: document.getElementById("registerName")?.value.trim() || "",
        email: document.getElementById("registerEmail")?.value.trim() || "",
        password: document.getElementById("registerPassword")?.value || "",
        phone: document.getElementById("registerPhone")?.value.trim() || "",
        address: document.getElementById("registerAddress")?.value.trim() || "",
        role: document.getElementById("registerRole")?.value || "customer"
      };

      if (!payload.name || !payload.email || !payload.password) {
        if (typeof showMessage === "function") {
          showMessage("Please fill all required fields", "error");
        }
        return;
      }

      if (payload.role === "restaurant_owner") {
        localStorage.setItem("restaurantOwnerBasicInfo", JSON.stringify(payload));
        localStorage.setItem("userRole", "restaurant_owner");
        window.location.href = "./restaurant-signup.html";
        return;
      }

      const result = await registerUser(payload);

      if (typeof showMessage === "function") {
        showMessage(result.message, result.success ? "success" : "error");
      }

      if (result.success) {
        localStorage.setItem("userRole", payload.role || "customer");
        registerForm.reset();

        if (typeof tabButtons !== "undefined" && tabButtons[0]) {
          tabButtons[0].click();
        }
      }
    } catch (error) {
      if (typeof showMessage === "function") {
        showMessage("Could not connect to backend", "error");
      }
      console.error(error);
    }
  });
}

function getCurrentUserRole() {
  return localStorage.getItem("userRole") || "customer";
}

function requireOwnerAuth() {
  const role = getCurrentUserRole();

  if (role !== "restaurant_owner") {
    alert("Owner access only. Redirecting to customer dashboard.");
    window.location.href = "dashboard.html";
    return false;
  }

  return true;
}

function requireCustomerAuth() {
  const role = getCurrentUserRole();

  if (role === "restaurant_owner") {
    alert("Customer access only. Redirecting to owner dashboard.");
    window.location.href = "ownerdashboard.html";
    return false;
  }

  return true;
}

window.getCurrentUserRole = getCurrentUserRole;
window.requireOwnerAuth = requireOwnerAuth;
window.requireCustomerAuth = requireCustomerAuth;