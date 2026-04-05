// ══════════════════════════════════════
//  food.js  —  Food / Menu Page Logic
// ══════════════════════════════════════

let currentCategory = 'breakfast';
let currentDiet = 'all';

// ── Category tab click ──
function setCategory(btn, cat) {
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentCategory = cat;
  filterCards();
}

// ── Diet pill click ──
function setDiet(btn, diet) {
  document.querySelectorAll('.diet-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentDiet = diet;
  filterCards();
}

// ── Main filter logic ──
function filterCards() {
  const search = document.getElementById('dishSearch').value.toLowerCase();

  document.querySelectorAll('.menu-card').forEach(card => {
    const matchCat    = card.dataset.category === currentCategory;
    const matchDiet   = currentDiet === 'all' || card.dataset.diet === currentDiet;
    const matchSearch = card.querySelector('.card-name').textContent.toLowerCase().includes(search);

    card.style.display = (matchCat && matchDiet && matchSearch) ? '' : 'none';
  });
}

// ── Wishlist heart toggle ──
function toggleWish(btn) {
  event.stopPropagation();
  const isLiked = btn.textContent === '♥';
  btn.textContent  = isLiked ? '♡' : '♥';
  btn.style.color  = isLiked ? '' : '#e53935';
}

// ── Add to cart feedback ──
function addToCart(btn) {
  event.stopPropagation();
  if (btn.dataset.adding) return;

  btn.dataset.adding = 'true';
  const originalHTML = btn.innerHTML;

  btn.innerHTML         = '✓ Added';
  btn.style.background  = '#22c55e';

  setTimeout(() => {
    btn.innerHTML        = originalHTML;
    btn.style.background = '';
    delete btn.dataset.adding;
  }, 1000);
}

// ── Live search input ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('dishSearch').addEventListener('input', filterCards);

  // Show breakfast cards on page load
  filterCards();
});