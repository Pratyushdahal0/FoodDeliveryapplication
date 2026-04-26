document.getElementById("sidebar").innerHTML = `
  <div class="sidebar">
    <div class="logo">
      <h2>FoodExpress</h2>
      <span>Rider Panel</span>
    </div>

    <ul class="menu">
      <li class="active"><i class="fa-solid fa-house"></i> Dashboard</li>
      <li><i class="fa-solid fa-box"></i> Deliveries</li>
      <li><i class="fa-solid fa-clock-rotate-left"></i> History</li>
      <li><i class="fa-solid fa-wallet"></i> Earnings</li>
      <li><i class="fa-solid fa-user"></i> Profile</li>
      <li><i class="fa-solid fa-gear"></i> Settings</li>
      <li><i class="fa-solid fa-headset"></i> Support</li>
    </ul>

    <div class="status-card">
      <p>You are Online</p>
      <button id="toggleStatus">Go Offline</button>
    </div>
  </div>
`;