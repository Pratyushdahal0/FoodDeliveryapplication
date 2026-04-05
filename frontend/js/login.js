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

  const loginUrl = new URL("../../backend/controllers/AuthController.php", window.location.href).href;

  fetch(loginUrl, {
    method: "POST",
    body: formData,
    credentials: "same-origin"
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return res.text();
    })
    .then((data) => {
      if (data.includes("Login successful")) {
        successBox.innerText = data;

        localStorage.setItem("userEmail", email);
        localStorage.setItem("isLoggedIn", "true");

        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 1000);
      } else {
        alertBox.innerText = data;
      }
    })
    .catch((error) => {
      console.error("Login Error:", error);
      alertBox.innerText = "Something went wrong: " + error.message;
    });
}

// ===== MAKE FUNCTION GLOBAL =====
window.handleLogin = handleLogin;