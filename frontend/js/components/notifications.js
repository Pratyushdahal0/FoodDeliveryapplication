console.log("[notifications.js] Loaded - preference-aware notification bell");

const NOTIFICATION_KEY = "foodExpressNotifications";
const ACCOUNT_SETTINGS_KEY = "foodExpressAccountSettings";

const DEFAULT_NOTIFICATION_PREFS = {
  notifyOrderUpdates: true,
  notifyRiderUpdates: true,
  notifyRewardUpdates: true,
  notifySupportReplies: true,
  notifyPromotions: false,
};

function getAccountSettingsForNotifications() {
  try {
    const raw = localStorage.getItem(ACCOUNT_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    return {
      ...DEFAULT_NOTIFICATION_PREFS,
      ...parsed,
    };
  } catch (error) {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

function getNotificationCategory(notification = {}) {
  if (notification.category) return notification.category;

  const type = String(notification.type || "").toLowerCase();
  const title = String(notification.title || "").toLowerCase();
  const message = String(notification.message || "").toLowerCase();

  if (
    type === "rider" ||
    title.includes("rider") ||
    message.includes("rider") ||
    title.includes("picked up") ||
    title.includes("delivered")
  ) {
    return "rider";
  }

  if (
    type === "reward" ||
    title.includes("reward") ||
    title.includes("coupon") ||
    title.includes("points") ||
    message.includes("coupon") ||
    message.includes("points")
  ) {
    return "reward";
  }

  if (
    type === "support" ||
    title.includes("support") ||
    message.includes("support") ||
    title.includes("ticket")
  ) {
    return "support";
  }

  if (
    type === "promotion" ||
    type === "promo" ||
    title.includes("offer") ||
    title.includes("promotion") ||
    title.includes("discount deal")
  ) {
    return "promotion";
  }

  return "order";
}

function isNotificationAllowed(notification = {}) {
  const settings = getAccountSettingsForNotifications();
  const category = getNotificationCategory(notification);

  if (category === "order") return Boolean(settings.notifyOrderUpdates);
  if (category === "rider") return Boolean(settings.notifyRiderUpdates);
  if (category === "reward") return Boolean(settings.notifyRewardUpdates);
  if (category === "support") return Boolean(settings.notifySupportReplies);
  if (category === "promotion") return Boolean(settings.notifyPromotions);

  return true;
}

function getNotifications() {
  try {
    const raw = localStorage.getItem(NOTIFICATION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(parsed)) return [];

    return parsed;
  } catch (error) {
    console.warn("[notifications.js] Failed to read notifications:", error);
    return [];
  }
}

function getVisibleNotifications() {
  return getNotifications().filter(isNotificationAllowed);
}

function saveNotifications(notifications) {
  localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(notifications || []));
}

function seedDemoNotificationIfEmpty() {
  const notifications = getNotifications();

  if (notifications.length) return;

  const demo = [
    {
      id: "demo-rider-assigned",
      title: "Rider assigned",
      message: "FoodExpress Rider has accepted your delivery.",
      type: "rider",
      category: "rider",
      icon: "fa-motorcycle",
      read: false,
      createdAt: Date.now() - 60 * 60 * 1000,
      link: "track-order.html",
    },
  ];

  saveNotifications(demo);
}

function formatNotificationTime(timestamp) {
  if (!timestamp) return "Just now";

  const diff = Date.now() - Number(timestamp);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function getNotificationIcon(notification) {
  if (notification.icon) return notification.icon;

  const category = getNotificationCategory(notification);
  const type = notification.type || "info";

  const map = {
    order: "fa-bag-shopping",
    rider: "fa-motorcycle",
    reward: "fa-coins",
    support: "fa-message",
    promotion: "fa-tags",
    success: "fa-circle-check",
    warning: "fa-triangle-exclamation",
    danger: "fa-circle-exclamation",
    info: "fa-bell",
  };

  return map[category] || map[type] || "fa-bell";
}

function getNotificationIconClass(notification) {
  const category = getNotificationCategory(notification);
  const type = notification.type || "info";

  const map = {
    order: "notification-info",
    rider: "notification-success",
    reward: "notification-warning",
    support: "notification-info",
    promotion: "notification-danger",
    success: "notification-success",
    warning: "notification-warning",
    danger: "notification-danger",
    info: "notification-info",
  };

  return map[category] || map[type] || "notification-info";
}

function renderNotificationDropdown() {
  const dropdown = document.getElementById("notificationDropdown");
  const badge = document.getElementById("notificationBadge");

  if (!dropdown || !badge) return;

  const notifications = getVisibleNotifications();
  const unreadCount = notifications.filter((item) => !item.read).length;

  badge.textContent = unreadCount;
  badge.style.display = unreadCount > 0 ? "flex" : "none";

  if (!notifications.length) {
    dropdown.innerHTML = `
      <div class="notification-head">
        <div>
          <strong>Notifications</strong>
          <span>No visible updates</span>
        </div>
      </div>

      <div class="notification-empty">
        <i class="fa-regular fa-bell"></i>
        <p>No notifications based on your current preferences.</p>
      </div>
    `;
    return;
  }

  dropdown.innerHTML = `
    <div class="notification-head">
      <div>
        <strong>Notifications</strong>
        <span>${unreadCount} unread update${unreadCount === 1 ? "" : "s"}</span>
      </div>

      <button type="button" id="markAllNotificationsRead">
        Mark all read
      </button>
    </div>

    <div class="notification-list">
      ${notifications
        .map(
          (notification) => `
            <button
              type="button"
              class="notification-item ${notification.read ? "" : "unread"}"
              data-notification-id="${escapeNotificationHtml(notification.id)}"
            >
              <span class="notification-icon ${getNotificationIconClass(notification)}">
                <i class="fa-solid ${getNotificationIcon(notification)}"></i>
              </span>

              <span class="notification-content">
                <strong>${escapeNotificationHtml(notification.title || "Notification")}</strong>
                <small>${escapeNotificationHtml(notification.message || "")}</small>
                <em>${formatNotificationTime(notification.createdAt)}</em>
              </span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;

  const markAllBtn = document.getElementById("markAllNotificationsRead");
  if (markAllBtn) {
    markAllBtn.addEventListener("click", function (event) {
      event.stopPropagation();

      const visibleIds = new Set(
        getVisibleNotifications().map((item) => String(item.id)),
      );

      const updated = getNotifications().map((item) =>
        visibleIds.has(String(item.id)) ? { ...item, read: true } : item,
      );

      saveNotifications(updated);
      renderNotificationDropdown();
    });
  }

  dropdown.querySelectorAll(".notification-item").forEach((item) => {
    item.addEventListener("click", function () {
      const id = item.dataset.notificationId;
      const notifications = getNotifications();

      const selected = notifications.find(
        (notification) => String(notification.id) === String(id),
      );

      const updated = notifications.map((notification) =>
        String(notification.id) === String(id)
          ? { ...notification, read: true }
          : notification,
      );

      saveNotifications(updated);
      renderNotificationDropdown();

      if (selected?.link) {
        window.location.href = selected.link;
      }
    });
  });
}

function bindNotificationBell() {
  const bell = document.getElementById("notificationBell");
  const dropdown = document.getElementById("notificationDropdown");

  if (!bell || !dropdown) {
    return;
  }

  seedDemoNotificationIfEmpty();
  renderNotificationDropdown();

  if (bell.dataset.notificationBound === "true") {
    return;
  }

  bell.dataset.notificationBound = "true";

  bell.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();

    renderNotificationDropdown();
    dropdown.classList.toggle("show");
  });

  dropdown.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  document.addEventListener("click", function () {
    dropdown.classList.remove("show");
  });
}

function addFoodExpressNotification(notification) {
  const newNotification = {
    id: notification.id || `notification-${Date.now()}`,
    title: notification.title || "FoodExpress update",
    message: notification.message || "",
    type: notification.type || "info",
    category: notification.category || getNotificationCategory(notification),
    icon: notification.icon || "",
    read: false,
    createdAt: notification.createdAt || Date.now(),
    link: notification.link || "",
  };

  if (!isNotificationAllowed(newNotification)) {
    console.log("[notifications.js] Notification blocked by user settings:", {
      title: newNotification.title,
      category: newNotification.category,
    });
    return false;
  }

  const notifications = getNotifications();
  notifications.unshift(newNotification);
  saveNotifications(notifications);

  if (typeof window.bindNotificationBell === "function") {
    window.bindNotificationBell();
  }

  renderNotificationDropdown();
  return true;
}

function escapeNotificationHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

document.addEventListener("DOMContentLoaded", function () {
  bindNotificationBell();
  setTimeout(bindNotificationBell, 100);
  setTimeout(bindNotificationBell, 400);
  setTimeout(bindNotificationBell, 900);
});

window.addEventListener("foodExpressNotificationsUpdated", function () {
  renderNotificationDropdown();
});

window.addEventListener("foodExpressAccountSettingsUpdated", function () {
  renderNotificationDropdown();
});

window.bindNotificationBell = bindNotificationBell;
window.renderNotificationDropdown = renderNotificationDropdown;
window.addFoodExpressNotification = addFoodExpressNotification;
window.getNotifications = getNotifications;
window.getVisibleNotifications = getVisibleNotifications;