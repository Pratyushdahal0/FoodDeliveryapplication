console.log("[notifications.js] Loaded - global notification bell");

const NOTIFICATION_KEY = "foodExpressNotifications";

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
      type: "success",
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

  const type = notification.type || "info";

  const map = {
    success: "fa-circle-check",
    warning: "fa-triangle-exclamation",
    danger: "fa-circle-exclamation",
    info: "fa-bell",
    order: "fa-bag-shopping",
    rider: "fa-motorcycle",
  };

  return map[type] || "fa-bell";
}

function getNotificationIconClass(notification) {
  const type = notification.type || "info";

  const map = {
    success: "notification-success",
    warning: "notification-warning",
    danger: "notification-danger",
    info: "notification-info",
    order: "notification-info",
    rider: "notification-success",
  };

  return map[type] || "notification-info";
}

function renderNotificationDropdown() {
  const dropdown = document.getElementById("notificationDropdown");
  const badge = document.getElementById("notificationBadge");

  if (!dropdown || !badge) return;

  const notifications = getNotifications();
  const unreadCount = notifications.filter((item) => !item.read).length;

  badge.textContent = unreadCount;
  badge.style.display = unreadCount > 0 ? "flex" : "none";

  if (!notifications.length) {
    dropdown.innerHTML = `
      <div class="notification-head">
        <div>
          <strong>Notifications</strong>
          <span>No updates yet</span>
        </div>
      </div>

      <div class="notification-empty">
        <i class="fa-regular fa-bell"></i>
        <p>No notifications yet.</p>
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

      const updated = getNotifications().map((item) => ({
        ...item,
        read: true,
      }));

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
  const notifications = getNotifications();

  const newNotification = {
    id: notification.id || `notification-${Date.now()}`,
    title: notification.title || "FoodExpress update",
    message: notification.message || "",
    type: notification.type || "info",
    icon: notification.icon || "",
    read: false,
    createdAt: notification.createdAt || Date.now(),
    link: notification.link || "",
  };

  notifications.unshift(newNotification);
  saveNotifications(notifications);

  if (typeof window.bindNotificationBell === "function") {
    window.bindNotificationBell();
  }

  renderNotificationDropdown();
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
  /*
    Navbar is dynamic, so it may not exist immediately.
    These delayed binds make notification work on shop, food,
    dashboard, contact, track-order, payment, etc.
  */
  bindNotificationBell();
  setTimeout(bindNotificationBell, 100);
  setTimeout(bindNotificationBell, 400);
  setTimeout(bindNotificationBell, 900);
});

window.addEventListener("foodExpressNotificationsUpdated", function () {
  renderNotificationDropdown();
});

window.bindNotificationBell = bindNotificationBell;
window.renderNotificationDropdown = renderNotificationDropdown;
window.addFoodExpressNotification = addFoodExpressNotification;