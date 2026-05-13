/* ================================
   FoodExpress Rider Notifications
   Shared topbar notification dropdown
================================ */

console.log("[rider-notifications.js] Loaded");

(function () {
  const NOTIFICATION_KEY = "foodExpressRiderNotifications";
  const HISTORY_KEY = "foodexpress_rider_history";
  const SETTINGS_KEY = "foodExpressRiderSettings";
  const STATUS_KEY = "foodExpressRiderStatus";

  const MAX_NOTIFICATIONS = 40;

  document.addEventListener("DOMContentLoaded", () => {
    initRiderNotifications();
  });

  window.FoodExpressRiderNotify = {
    push: pushNotification,
    markAllRead,
    clearRead,
    getAll: getNotifications,
  };

  function initRiderNotifications() {
    if (window.__foodExpressRiderNotificationsInitialized) return;
  window.__foodExpressRiderNotificationsInitialized = true;
    const bell = document.querySelector(".notification-btn");
    if (!bell) return;

    seedInitialNotifications();
    syncStatusNotification();
    //syncHistoryNotifications();

    const wrap = ensureNotificationWrapper(bell);
    const panel = createNotificationPanel();

    wrap.appendChild(panel);

    bell.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePanel(panel);
    });

    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target)) {
        closePanel(panel);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanel(panel);
    });

    window.addEventListener("storage", (event) => {
      if (
        event.key === NOTIFICATION_KEY ||
        //event.key === HISTORY_KEY ||
        event.key === SETTINGS_KEY ||
        event.key === STATUS_KEY
      ) {
        syncHistoryNotifications();
        renderNotifications(panel);
        updateBellCount();
      }
    });

    renderNotifications(panel);
    updateBellCount();
  }

  /* ================================
     WRAPPER / PANEL
  ================================ */

  function ensureNotificationWrapper(bell) {
    if (bell.parentElement?.classList.contains("rider-notification-wrap")) {
      return bell.parentElement;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "rider-notification-wrap";

    bell.parentNode.insertBefore(wrapper, bell);
    wrapper.appendChild(bell);

    return wrapper;
  }

  function createNotificationPanel() {
    const existing = document.getElementById("riderNotificationPanel");
    if (existing) return existing;

    const panel = document.createElement("div");
    panel.id = "riderNotificationPanel";
    panel.className = "rider-notification-panel";
    panel.innerHTML = `
      <div class="rider-notification-head">
        <div>
          <h3>Notifications</h3>
          <p id="riderNotificationSubtitle">Rider updates and alerts</p>
        </div>

        <button type="button" id="markAllNotificationsBtn">
          Mark all read
        </button>
      </div>

      <div class="rider-notification-tabs">
        <button type="button" class="active" data-filter="all">All</button>
        <button type="button" data-filter="unread">Unread</button>
        <button type="button" data-filter="earnings">Earnings</button>
      </div>

      <div class="rider-notification-list" id="riderNotificationList"></div>

      <div class="rider-notification-footer">
        <button type="button" id="clearReadNotificationsBtn">
          Clear read
        </button>

        <a href="rider-settings.html">
          Notification settings
          <i class="fa-solid fa-arrow-right"></i>
        </a>
      </div>
    `;

    panel.dataset.filter = "all";

    panel.querySelector("#markAllNotificationsBtn")?.addEventListener("click", () => {
      markAllRead();
      renderNotifications(panel);
      updateBellCount();
    });

    panel.querySelector("#clearReadNotificationsBtn")?.addEventListener("click", () => {
      clearRead();
      renderNotifications(panel);
      updateBellCount();
    });

    panel.querySelectorAll(".rider-notification-tabs button").forEach((btn) => {
      btn.addEventListener("click", () => {
        panel.querySelectorAll(".rider-notification-tabs button").forEach((item) => {
          item.classList.remove("active");
        });

        btn.classList.add("active");
        panel.dataset.filter = btn.dataset.filter || "all";
        renderNotifications(panel);
      });
    });

    return panel;
  }

  function togglePanel(panel) {
    const isOpen = panel.classList.contains("show");

    if (isOpen) {
      closePanel(panel);
    } else {
      panel.classList.add("show");
syncStatusNotification();
renderNotifications(panel);
updateBellCount();
    }
  }

  function closePanel(panel) {
    panel.classList.remove("show");
  }

  /* ================================
     RENDER
  ================================ */

  function renderNotifications(panel) {
    const list = panel.querySelector("#riderNotificationList");
    const subtitle = panel.querySelector("#riderNotificationSubtitle");

    if (!list) return;

    const filter = panel.dataset.filter || "all";
    const notifications = getFilteredNotifications(filter);

    const unreadCount = getUnreadCount();
    if (subtitle) {
      subtitle.textContent =
        unreadCount > 0
          ? `${unreadCount} unread rider update${unreadCount > 1 ? "s" : ""}`
          : "All rider updates are read";
    }

    if (!notifications.length) {
      list.innerHTML = `
        <div class="rider-notification-empty">
          <div>
            <i class="fa-regular fa-bell"></i>
          </div>
          <h4>No notifications</h4>
          <p>You are all caught up for now.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = notifications
      .map((item) => {
        return `
          <article class="rider-notification-item ${item.read ? "" : "unread"}" data-id="${escapeHtml(item.id)}">
            <div class="notification-icon ${escapeHtml(item.type || "info")}">
              <i class="${getNotificationIcon(item)}"></i>
            </div>

            <div class="notification-copy">
              <div class="notification-title-row">
                <h4>${escapeHtml(item.title)}</h4>
                ${item.read ? "" : `<span></span>`}
              </div>

              <p>${escapeHtml(item.message)}</p>

              <div class="notification-meta">
                <small>${escapeHtml(formatRelativeTime(item.createdAt))}</small>
                ${
                  item.actionUrl
                    ? `<a href="${escapeHtml(item.actionUrl)}" data-action-link="true">Open</a>`
                    : ""
                }
              </div>
            </div>

            <button type="button" class="notification-delete" aria-label="Delete notification">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </article>
        `;
      })
      .join("");

    list.querySelectorAll(".rider-notification-item").forEach((itemEl) => {
      const id = itemEl.dataset.id;

      itemEl.addEventListener("click", (event) => {
        if (
          event.target.closest(".notification-delete") ||
          event.target.closest("[data-action-link='true']")
        ) {
          return;
        }

        markOneRead(id);
        renderNotifications(panel);
        updateBellCount();
      });

      itemEl.querySelector(".notification-delete")?.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteNotification(id);
        renderNotifications(panel);
        updateBellCount();
      });

      itemEl.querySelector("[data-action-link='true']")?.addEventListener("click", () => {
        markOneRead(id);
        updateBellCount();
      });
    });
  }

  function getFilteredNotifications(filter) {
    const notifications = getNotifications();

    if (filter === "unread") {
      return notifications.filter((item) => !item.read);
    }

    if (filter === "earnings") {
      return notifications.filter((item) => item.category === "earnings");
    }

    return notifications;
  }

  function updateBellCount() {
    const bell = document.querySelector(".notification-btn");
    if (!bell) return;

    let badge = bell.querySelector("small");

    if (!badge) {
      badge = document.createElement("small");
      bell.appendChild(badge);
    }

    const count = getUnreadCount();

    badge.textContent = count > 9 ? "9+" : String(count);
    badge.style.display = count > 0 ? "grid" : "none";
  }

  /* ================================
     DATA
  ================================ */

  function getNotifications() {
    const list = readJson(NOTIFICATION_KEY, []);

    return Array.isArray(list)
      ? list
          .filter((item) => item && item.id)
          .sort((a, b) => {
            const bTime = new Date(b.createdAt || 0).getTime();
            const aTime = new Date(a.createdAt || 0).getTime();
            return bTime - aTime;
          })
      : [];
  }

  function saveNotifications(list) {
    const clean = Array.isArray(list) ? list.slice(0, MAX_NOTIFICATIONS) : [];
    localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(clean));
  }

  function pushNotification(notification) {
  const list = getNotifications();

  const stableMessage = String(notification.message || "You have a new rider notification.")
    .trim()
    .toLowerCase();

  const stableTitle = String(notification.title || "Rider update")
    .trim()
    .toLowerCase();

  const stableCategory = String(notification.category || "general").trim().toLowerCase();

  const item = {
    id:
      notification.id ||
      `${stableCategory}-${stableTitle.replace(/[^a-z0-9]+/g, "-")}-${stableMessage
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 48)}`,
    title: notification.title || "Rider update",
    message: notification.message || "You have a new rider notification.",
    type: notification.type || "info",
    category: notification.category || "general",
    actionUrl: notification.actionUrl || "",
    createdAt: notification.createdAt || new Date().toISOString(),
    read: Boolean(notification.read),
  };

  const now = new Date(item.createdAt).getTime();

  const exists = list.some((existing) => {
    const sameId = String(existing.id) === String(item.id);

    const sameContent =
      String(existing.title || "").trim().toLowerCase() === stableTitle &&
      String(existing.message || "").trim().toLowerCase() === stableMessage &&
      String(existing.category || "").trim().toLowerCase() === stableCategory;

    const existingTime = new Date(existing.createdAt || 0).getTime();
    const closeTime = Math.abs(now - existingTime) < 1000 * 60 * 3;

    return sameId || (sameContent && closeTime);
  });

  if (exists) return;

  list.unshift(item);
  saveNotifications(list);

  updateBellCount();

  window.dispatchEvent(
    new CustomEvent("foodExpressRiderNotificationAdded", {
      detail: item,
    })
  );
}

  function markOneRead(id) {
    const list = getNotifications().map((item) => {
      if (item.id === id) {
        return {
          ...item,
          read: true,
          readAt: new Date().toISOString(),
        };
      }

      return item;
    });

    saveNotifications(list);
  }

  function markAllRead() {
    const now = new Date().toISOString();

    const list = getNotifications().map((item) => ({
      ...item,
      read: true,
      readAt: item.readAt || now,
    }));

    saveNotifications(list);
  }

  function clearRead() {
    const list = getNotifications().filter((item) => !item.read);
    saveNotifications(list);
  }

  function deleteNotification(id) {
    const list = getNotifications().filter((item) => item.id !== id);
    saveNotifications(list);
  }

  function getUnreadCount() {
    return getNotifications().filter((item) => !item.read).length;
  }

  /* ================================
     AUTO SYNC FROM RIDER HISTORY
  ================================ */

  function seedInitialNotifications() {
    const existing = getNotifications();
    if (existing.length) return;

    const now = new Date();

    saveNotifications([
      {
        id: "welcome-rider-notification",
        title: "Welcome to Rider Panel",
        message:
          "Your rider dashboard is ready. New order, payout, and support alerts will appear here.",
        type: "info",
        category: "general",
        actionUrl: "rider-dashboard.html",
        createdAt: new Date(now.getTime() - 1000 * 60 * 3).toISOString(),
        read: false,
      },
      {
        id: "settings-sync-notification",
        title: "Profile and settings synced",
        message:
          "Your availability, payout method, and delivery zone can now sync across rider pages.",
        type: "success",
        category: "settings",
        actionUrl: "rider-settings.html",
        createdAt: new Date(now.getTime() - 1000 * 60 * 8).toISOString(),
        read: false,
      },
    ]);
  }

  function syncHistoryNotifications() {
  // Disabled intentionally.
  // Old rider history should NOT recreate "Delivery completed" notifications.
  // New notifications are now pushed only from rider-deliveries.js
  // when rider accepts, picks up, starts delivery, or marks delivered.
  return;
}

  function syncStatusNotification() {
  const status = String(localStorage.getItem(STATUS_KEY) || "online").toLowerCase();

  if (status === "offline") {
    pushNotification({
      id: "rider-status-offline",
      title: "You are offline",
      message: "Go online from Settings to receive new delivery requests.",
      type: "warning",
      category: "settings",
      actionUrl: "rider-settings.html",
      createdAt: new Date().toISOString(),
      read: false,
    });
    return;
  }

  if (status === "break") {
    pushNotification({
      id: "rider-status-break",
      title: "Break mode is active",
      message: "You are logged in but paused from receiving new delivery requests.",
      type: "warning",
      category: "settings",
      actionUrl: "rider-settings.html",
      createdAt: new Date().toISOString(),
      read: false,
    });
  }
}

  function isDeliveredOrder(order) {
    const status = String(
      order.status || order.deliveryStatus || order.delivery_status || ""
    ).toLowerCase();

    return status.includes("deliver");
  }

  function getOrderId(order) {
    return String(
      order.id ||
        order.orderId ||
        order.order_id ||
        order.orderNumber ||
        order.order_number ||
        ""
    ).replace("#", "");
  }

  function getRestaurantName(order) {
  const text = String(
    order.restaurantName ||
      order.restaurant_name ||
      order.restaurant ||
      order.storeName ||
      order.store_name ||
      order.shopName ||
      order.shop_name ||
      ""
  ).trim();

  if (!text || text.toLowerCase() === "restaurant") {
    return "FoodExpress restaurant";
  }

  return text;
}

  function getEarning(order) {
    const amount = Number(
      order.earning ||
        order.rider_earning ||
        order.delivery_earning ||
        order.amount ||
        0
    );

    if (amount > 0) return Math.round(amount);

    const total = Number(order.total || 0);
    if (total > 0) return Math.max(100, Math.round(total * 0.08 + 70));

    return 100;
  }

  /* ================================
     HELPERS
  ================================ */

  function getNotificationIcon(item) {
    if (item.category === "earnings") return "fa-solid fa-coins";
    if (item.category === "settings") return "fa-solid fa-gear";
    if (item.category === "support") return "fa-solid fa-headset";
    if (item.category === "delivery") return "fa-solid fa-motorcycle";
    if (item.type === "warning") return "fa-solid fa-triangle-exclamation";
    if (item.type === "success") return "fa-solid fa-circle-check";

    return "fa-regular fa-bell";
  }

  function formatMoney(amount) {
    return `Rs. ${Number(amount || 0).toLocaleString("en-IN")}`;
  }

  function formatRelativeTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "recently";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 30) return "just now";
    if (minutes < 1) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString("en-NP", {
      month: "short",
      day: "numeric",
    });
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`[rider-notifications.js] Could not read ${key}`, error);
      return fallback;
    }
  }

  function generateId(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 999)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();