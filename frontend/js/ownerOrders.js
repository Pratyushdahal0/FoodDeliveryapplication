document.addEventListener('DOMContentLoaded', () => {
  if (typeof requireOwnerAuth === 'function') {
    if (!requireOwnerAuth()) return;
  }

  updateOrderTabCounts();
  attachOrderActions();
});

const statusSectionMap = {
  pending: 'section-pending',
  accepted: 'section-accepted',
  confirmed: 'section-accepted',
  preparing: 'section-accepted',
  on_the_way: 'section-accepted',
  delivered: 'section-delivered',
  cancelled: 'section-cancelled'
};

const statusBadgeMap = {
  pending: { label: 'Pending', css: 'badge-pending' },
  accepted: { label: 'Accepted', css: 'badge-accepted' },
  confirmed: { label: 'Confirmed', css: 'badge-accepted' },
  preparing: { label: 'Preparing', css: 'badge-accepted' },
  on_the_way: { label: 'On the Way', css: 'badge-accepted' },
  delivered: { label: 'Delivered', css: 'badge-delivered' },
  cancelled: { label: 'Cancelled', css: 'badge-cancelled' }
};

function attachOrderActions() {
  document.querySelectorAll('.order-card').forEach((card) => {
    const rejectBtn = card.querySelector('.btn-reject');
    const acceptBtn = card.querySelector('.btn-accept');
    const deliverBtn = card.querySelector('.btn-deliver');
    const viewBtn = card.querySelector('.btn-view');

    rejectBtn?.addEventListener('click', () => {
      transitionOrder(card, 'cancelled');
    });

    acceptBtn?.addEventListener('click', () => {
      transitionOrder(card, 'accepted');
    });

    deliverBtn?.addEventListener('click', () => {
      const currentStatus = card.dataset.status;
      const nextStatus = currentStatus === 'accepted' ? 'on_the_way' : 'delivered';
      transitionOrder(card, nextStatus);
    });

    viewBtn?.addEventListener('click', () => {
      const orderNumber = card.dataset.orderId || card.querySelector('.order-id')?.textContent?.replace('#', '').trim();
      if (orderNumber) {
        window.location.href = `track-order.html?order=${encodeURIComponent(orderNumber)}`;
      }
    });
  });
}

function transitionOrder(card, nextStatus) {
  if (!card) return;
  card.dataset.status = nextStatus;

  const badge = card.querySelector('.badge');
  if (badge) {
    const statusInfo = statusBadgeMap[nextStatus] || statusBadgeMap.pending;
    badge.textContent = statusInfo.label;
    badge.className = `badge ${statusInfo.css}`;
  }

  const targetSectionId = statusSectionMap[nextStatus];
  const targetSection = document.getElementById(targetSectionId);
  if (targetSection) {
    targetSection.appendChild(card);
  }

  updateTabCounts();
}

function updateOrderTabCounts() {
  const counts = {
    pending: document.querySelectorAll('.order-card[data-status="pending"]').length,
    accepted: document.querySelectorAll('.order-card[data-status="accepted"]').length + document.querySelectorAll('.order-card[data-status="confirmed"]').length + document.querySelectorAll('.order-card[data-status="preparing"]').length + document.querySelectorAll('.order-card[data-status="on_the_way"]').length,
    delivered: document.querySelectorAll('.order-card[data-status="delivered"]').length,
    cancelled: document.querySelectorAll('.order-card[data-status="cancelled"]').length
  };

  document.querySelectorAll('.tab').forEach((button) => {
    const labelText = button.textContent.replace(/\(.*\)/, '').trim();
    const type = labelText.toLowerCase().split(' ')[1];
    if (type && counts[type] !== undefined) {
      const icon = button.querySelector('i');
      const label = labelText.replace(/^(pending|accepted|delivered|cancelled)\s*/i, match => match.trim());
      const count = counts[type];
      if (icon) {
        button.innerHTML = `${icon.outerHTML} ${label} (${count})`;
      } else {
        button.textContent = `${label} (${count})`;
      }
    }
  });
}

window.transitionOrder = transitionOrder;
window.updateOrderTabCounts = updateOrderTabCounts;
window.attachOrderActions = attachOrderActions;
