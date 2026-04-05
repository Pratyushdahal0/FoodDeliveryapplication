// ══════════════════════════
//  shop.js
//  Shop page interactions
// ══════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  // ── FILTER BUTTONS ──
  const filterBtns = document.querySelectorAll('.filter-btn');
  const countEl    = document.querySelector('.products-count');
  const allCards   = document.querySelectorAll('.product-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', function () {
      filterBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      const filter = this.textContent.trim().toLowerCase();

      // Show / hide cards based on filter
      // Cards with a .popular-badge are "Popular"; all are shown for "All Items"
      let visible = 0;
      allCards.forEach(card => {
        const isPopular = !!card.querySelector('.popular-badge');
        let show = false;

        if (filter === 'all items') {
          show = true;
        } else if (filter === 'popular') {
          show = isPopular;
        } else {
          // Breakfast, Lunch, Dinner, Desserts, Drinks — demo: show all
          show = true;
        }

        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });

      if (countEl) {
        countEl.textContent = `Showing ${visible} item${visible !== 1 ? 's' : ''}`;
      }
    });
  });

  // ── WISHLIST TOGGLE ──
  document.querySelectorAll('.wishlist-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const isLiked = this.textContent === '♥';
      this.textContent  = isLiked ? '♡' : '♥';
      this.style.color  = isLiked ? '' : '#e53935';
    });
  });

  // ── ADD TO CART ──
  document.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (this.classList.contains('adding')) return;

      this.classList.add('adding');
      const original = this.textContent;

      this.textContent         = '✓';
      this.style.background    = '#22c55e';
      this.style.transform     = 'scale(1.15)';

      setTimeout(() => {
        this.textContent         = original;
        this.style.background    = '';
        this.style.transform     = '';
        this.classList.remove('adding');
      }, 1000);
    });
  });

  // ── CONTACT US BUTTON ──
  const contactBtn = document.querySelector('.btn-contact');
  if (contactBtn) {
    contactBtn.addEventListener('click', () => {
      alert('📩 Opening contact form...');
    });
  }

});