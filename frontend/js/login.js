// ===== SWITCH BETWEEN LOGIN & REGISTER =====
function switchTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');

  if (!loginForm || !registerForm) {
    console.error('Forms not found!');
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
async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const remember = document.getElementById('rememberMe')?.checked;
  const alertBox = document.getElementById('alertBox');
  const successBox = document.getElementById('successBox');

  alertBox.innerText = '';
  successBox.innerText = '';

  if (!email || !password) {
    alertBox.innerText = 'Please enter email and password!';
    return;
  }

  try {
    const formData = new FormData();
    formData.append('action', 'login');
    formData.append('email', email);
    formData.append('password', password);

    const response = await fetch('../../backend/controllers/AuthController.php', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { success: text.includes('Login successful'), message: text };
    }

    if (data.success) {
      const profile = data.data || {
        name: email.split('@')[0].replace(/\./g, ' '),
        email,
        phone: '',
        address: '',
        role: 'customer',
        points: 850,
        orders: 0,
        saved: 25
      };

      if (!profile.points) profile.points = 850;
      if (!profile.orders) profile.orders = 0;
      if (!profile.saved) profile.saved = 25;

      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('userEmail', email);
      saveUserProfile(profile);

      successBox.innerText = data.message || 'Login successful';

      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 800);
    } else {
      alertBox.innerText = data.message || 'Login failed';
    }
  } catch (error) {
    console.error('Login Error:', error);
    alertBox.innerText = 'Something went wrong: ' + error.message;
  }
}

// ===== REGISTER FUNCTION =====
async function handleRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const phone = document.getElementById('regPhone').value.trim();
  const address = document.getElementById('regAddress').value.trim();
  const role = document.getElementById('regRole').value;
  const alertBox = document.getElementById('alertBox');
  const successBox = document.getElementById('successBox');

  alertBox.innerText = '';
  successBox.innerText = '';

  if (!name || !email || !password) {
    alertBox.innerText = 'Please fill all required fields!';
    return;
  }

  try {
    const formData = new FormData();
    formData.append('action', 'register');
    formData.append('name', name);
    formData.append('email', email);
    formData.append('password', password);
    formData.append('phone', phone);
    formData.append('address', address);
    formData.append('role', role);

    const response = await fetch('../../backend/controllers/AuthController.php', {
      method: 'POST',
      body: formData,
      credentials: 'same-origin'
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { success: text.includes('Registered successfully'), message: text };
    }

    if (data.success) {
      const profile = data.data || {
        name,
        email,
        phone,
        address,
        role,
        points: 850,
        orders: 0,
        saved: 25
      };

      saveUserProfile(profile);
      localStorage.setItem('userEmail', email);
      localStorage.setItem('isLoggedIn', 'true');

      successBox.innerText = data.message || 'Registered successfully';
      setTimeout(() => {
        switchTab('login');
      }, 800);
    } else {
      alertBox.innerText = data.message || 'Registration failed';
    }
  } catch (error) {
    console.error('Register Error:', error);
    alertBox.innerText = 'Registration failed: ' + error.message;
  }
}

// ===== OPTIONAL: TOGGLE PASSWORD VISIBILITY =====
function togglePassword(id, btn) {
  const input = document.getElementById(id);
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    btn.innerText = '🙈';
  } else {
    input.type = 'password';
    btn.innerText = '👁️';
  }
}

window.switchTab = switchTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.togglePassword = togglePassword;

function setupRegisterRoleSelect() {
  const roleSelect = document.getElementById('regRole');
  if (!roleSelect) return;

  roleSelect.value = 'customer';
  roleSelect.addEventListener('change', function () {
    if (this.value === 'restaurant-owner') {
      this.value = 'customer';
      window.location.href = 'restaurant-signup.html';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupRegisterRoleSelect();
});

window.addEventListener('pageshow', () => {
  const roleSelect = document.getElementById('regRole');
  if (roleSelect) {
    roleSelect.value = 'customer';
  }
});