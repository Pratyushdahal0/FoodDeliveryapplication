// ===== SWITCH BETWEEN LOGIN & REGISTER =====
function switchTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');

  if (!loginForm || !registerForm) {
    console.error("Forms not found!");
    return;
  }

  if (tab === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';

    loginTab.classList.add('active');
    registerTab.classList.remove('active');

  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';

    loginTab.classList.remove('active');
    registerTab.classList.add('active');
  }
}

// ===== LOGIN FUNCTION =====
function handleLogin() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  const alertBox = document.getElementById("alertBox");
  const successBox = document.getElementById("successBox");

  alertBox.innerText = "";
  successBox.innerText = "";

  if (!email || !password) {
    alertBox.innerText = "Please enter email and password!";
    return;
  }

  const formData = new FormData();
  formData.append("action", "login");  
  formData.append("email", email);
  formData.append("password", password);

  fetch("http://localhost/fooddeliveryapp/backend/controllers/AuthController.php", {
    method: "POST",
    body: formData
  })
    .then(res => res.text())
    .then(data => {
      console.log("Login Response:", data);

      if (data.includes("Login successful")) {
        successBox.innerText = data;

        setTimeout(() => {
          //Redirect to dashboard.html inside the same pages folder
          window.location.href = "dashboard.html";
        }, 1000);

      } else {
        alertBox.innerText = data;
      }
    })
    .catch(error => {
      console.error("Login Error:", error);
      alertBox.innerText = "Something went wrong!";
    });
}

// ===== REGISTER FUNCTION =====
function handleRegister() {
  const name = document.getElementById("regName").value;
  const email = document.getElementById("regEmail").value;
  const password = document.getElementById("regPassword").value;
  const phone = document.getElementById("regPhone").value;
  const address = document.getElementById("regAddress").value;
  const role = document.getElementById("regRole").value;

  const alertBox = document.getElementById("alertBox");
  const successBox = document.getElementById("successBox");

  alertBox.innerText = "";
  successBox.innerText = "";

  if (!name || !email || !password) {
    alertBox.innerText = "Please fill all required fields!";
    return;
  }

  const formData = new FormData();
  formData.append("action", "register");
  formData.append("name", name);
  formData.append("email", email);
  formData.append("password", password);
  formData.append("phone", phone);
  formData.append("address", address);
  formData.append("role", role);

  fetch("http://localhost/fooddeliveryapp/backend/controllers/AuthController.php", {
    method: "POST",
    body: formData
  })
    .then(res => res.text())
    .then(data => {
      console.log("Register Response:", data);

      if (data.includes("Registered successfully")) {
        successBox.innerText = data;

        setTimeout(() => {
          switchTab("login");
        }, 1000);

      } else {
        alertBox.innerText = data;
      }
    })
    .catch(error => {
      console.error("Register Error:", error);
      alertBox.innerText = "Registration failed!";
    });
}

// ===== OPTIONAL: TOGGLE PASSWORD VISIBILITY =====
function togglePassword(id, btn) {
  const input = document.getElementById(id);
  if (input.type === "password") {
    input.type = "text";
    btn.innerText = "🙈";
  } else {
    input.type = "password";
    btn.innerText = "👁️";
  }
}

// ===== MAKE FUNCTIONS GLOBAL =====
window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.togglePassword = togglePassword;