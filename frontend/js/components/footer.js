window.renderFooter = function (type = "public") {
  const footer = document.getElementById("footer");
  if (!footer) return;

  if (type === "none") {
    footer.style.display = "none";
    return;
  }

  footer.style.display = "block";

  if (type === "app") {
    footer.innerHTML = `
      <div class="footer-grid">
        <div>
          <div class="footer-logo">FoodExpress</div>
          <p class="footer-desc">
            Order your favourite meals quickly and track everything from one place.
          </p>
        </div>

        <div class="footer-col">
          <h4>App</h4>
          <ul>
            <li><a href="dashboard.html">Dashboard</a></li>
            <li><a href="shop.html">Shop</a></li>
            <li><a href="rewards.html">Rewards</a></li>
            <li><a href="track-order.html">Track Order</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Account</h4>
          <ul>
            <li><a href="edit-profile.html">Edit Profile</a></li>
            <li><a href="cart.html">Cart</a></li>
            <li><a href="loggedContact.html">Support</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Contact</h4>
          <div class="contact-item">📍 <span>Kathmandu, Nepal</span></div>
          <div class="contact-item">📞 <span>+977 - 9841223344</span></div>
          <div class="contact-item">✉️ <span>hello@foodexpress.com</span></div>
        </div>
      </div>

      <div class="footer-bottom">
        © 2026 FoodExpress. All rights reserved.
      </div>
    `;
    return;
  }

  footer.innerHTML = `
    <div class="footer-grid">
      <div>
        <div class="footer-logo">FoodExpress</div>
        <p class="footer-desc">
          Delivering happiness to your doorstep, one meal at a time.
        </p>
        <div class="footer-socials">
          <a href="#">f</a>
          <a href="#">𝕏</a>
          <a href="#">◎</a>
        </div>
      </div>

      <div class="footer-col">
        <h4>Quick Links</h4>
        <ul>
          <li><a href="landingpage.html">Home</a></li>
          <li><a href="about.html">About Us</a></li>
          <li><a href="login.html">Our Menu</a></li>
          <li><a href="contact.html">Contact Us</a></li>
        </ul>
      </div>

      <div class="footer-col">
        <h4>Support</h4>
        <ul>
          <li><a href="#">Help Center</a></li>
          <li><a href="#">Privacy Policy</a></li>
          <li><a href="#">Terms of Service</a></li>
          <li><a href="contact.html">Contact Us</a></li>
        </ul>
      </div>

      <div class="footer-col">
        <h4>Contact</h4>
        <div class="contact-item">📍 <span>Kathmandu, Nepal</span></div>
        <div class="contact-item">📞 <span>+977 - 9841223344</span></div>
        <div class="contact-item">✉️ <span>foodexpressnp.support@gmail.com</span></div>
      </div>
    </div>

    <div class="footer-bottom">
      © 2026 FoodExpress. All rights reserved.
    </div>
  `;
};