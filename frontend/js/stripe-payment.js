/**
 * FoodExpress — Stripe Payment Helper
 * Exposes window.initStripeForOrder for payment.html
 */

const STRIPE_PK = 'pk_test_51TVc9aCKTvv6sIc4x2vDuDah2GCFdsOXSSE46cLX6gUmWOPKMTMp4JPGqo15SuqLUgzVUsnQ0Z4yX8A4g4N6mMYU00VRnz8obW';
const STRIPE_CONTROLLER = '../../backend/controllers/StripeController.php';

function loadStripeJs(callback) {
  if (window.Stripe) { callback(); return; }
  const s = document.createElement('script');
  s.src = 'https://js.stripe.com/v3/';
  s.onload = callback;
  s.onerror = () => console.error('[Stripe] Failed to load Stripe.js');
  document.head.appendChild(s);
}

window.initStripeForOrder = async function(orderId) {
  const resp   = await fetch(`${STRIPE_CONTROLLER}?action=create_intent`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ order_id: orderId }),
  });
  const result = await resp.json();

  if (!result.success) throw new Error(result.message || 'Stripe init failed.');
  if (result.already_paid) return { already_paid: true };

  await new Promise((resolve, reject) => {
    loadStripeJs(() => {
      try {
        window.__stripeInstance = window.Stripe(STRIPE_PK);
        window.__stripeClientSecret = result.client_secret;
        resolve();
      } catch(e) { reject(e); }
    });
  });

  return { success: true, client_secret: result.client_secret };
};