console.log("[notifications.js] Loaded - backend notification bell with smart routing");

(function () {
  const NOTIFICATION_API = "../../backend/controllers/NotificationController.php";
  const POLL_INTERVAL = 5000;

  let notificationsCache = [];
  let unreadCount = 0;
  let pollTimer = null;
  let isLoading = false;

  let boundBell = null;
  let outsideClickBound = false;

  function bindNotificationBell() {
    const bell = document.getElementById("notificationBell");
    const dropdown = document.getElementById("notificationDropdown");
    const badge = document.getElementById("notificationBadge");

    if (!bell || !dropdown || !badge) {
      console.warn("[notifications.js] Bell/dropdown/badge not found yet");
      return;
    }

    /*
      Important:
      Navbar is rendered dynamically.
      If navbar.js replaces the bell element, we must bind the new element again.
    */
    if (boundBell !== bell) {
      bell.onclick = async function (event) {
        event.preventDefault();
        event.stopPropagation();

        dropdown.classList.toggle("show");
        dropdown.classList.toggle("open");

        await loadNotificationsFromBackend();
        renderDropdown();
      };

      boundBell = bell;
    }

    if (!outsideClickBound) {
      document.addEventListener("click", function (event) {
        const activeDropdown = document.getElementById("notificationDropdown");
        const activeBell = document.getElementById("notificationBell");
        const wrapper = activeBell?.closest(".notification-wrapper");

        if (!activeDropdown || !activeBell || !wrapper) return;

        if (!wrapper.contains(event.target)) {
          activeDropdown.classList.remove("show", "open");
        }
      });

      outsideClickBound = true;
    }

    loadNotificationsFromBackend();
    startPolling();
  }

  function getCurrentNotificationUser() {
    const profile =
      readJson("foodExpressCurrentUser", null) ||
      readJson("currentUser", null) ||
      readJson("foodExpressProfile", null) ||
      readJson("foodExpressUserProfile", null) ||
      readJson("foodExpressAuthUser", null) ||
      readJson("loggedInUser", null) ||
      readJson("userProfile", null);

    const email =
      profile?.email ||
      profile?.user_email ||
      localStorage.getItem("userEmail") ||
      localStorage.getItem("foodExpressUserEmail") ||
      localStorage.getItem("loggedInEmail") ||
      "";

    const role =
      profile?.role ||
      localStorage.getItem("userRole") ||
      localStorage.getItem("foodExpressUserRole") ||
      "customer";

    return {
      email: String(email || "").trim(),
      role: normalizeRole(role),
    };
  }

  function normalizeRole(role) {
    const value = String(role || "customer").trim().toLowerCase();

    if (value === "restaurant-owner") return "restaurant-owner";
    if (value === "restaurant_owner") return "restaurant-owner";
    if (value === "owner") return "restaurant-owner";
    if (value === "restaurant") return "restaurant-owner";

    if (value === "delivery-rider") return "delivery-rider";
    if (value === "delivery_rider") return "delivery-rider";
    if (value === "rider") return "delivery-rider";

    if (value === "admin") return "admin";

    return "customer";
  }

  async function loadNotificationsFromBackend() {
    if (isLoading) return;

    const user = getCurrentNotificationUser();

    if (!user.email) {
      notificationsCache = [];
      unreadCount = 0;
      updateBadge();
      renderDropdown();
      return;
    }

    try {
      isLoading = true;

      const url = `${NOTIFICATION_API}?action=list&email=${encodeURIComponent(
        user.email
      )}&role=${encodeURIComponent(user.role)}&limit=30&_=${Date.now()}`;

      const response = await fetch(url);
      const raw = await response.text();

      let result;

      try {
        result = JSON.parse(raw);
      } catch (error) {
        console.error("[notifications.js] Backend returned non-JSON:", raw);
        throw new Error("Notification backend returned invalid JSON.");
      }

      if (!result.success) {
        throw new Error(result.message || "Could not load notifications.");
      }

      notificationsCache = Array.isArray(result.data) ? result.data : [];
      unreadCount = Number(result.unread_count || 0);

      updateBadge();
      renderDropdown();
    } catch (error) {
      console.error("[notifications.js] Failed to load notifications:", error);
    } finally {
      isLoading = false;
    }
  }

  function startPolling() {
    if (pollTimer) return;

    pollTimer = setInterval(function () {
      if (document.hidden) return;
      loadNotificationsFromBackend();
    }, POLL_INTERVAL);
  }

  function updateBadge() {
    const badge = document.getElementById("notificationBadge");
    if (!badge) return;

    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
      badge.style.display = "flex";
    } else {
      badge.textContent = "";
      badge.style.display = "none";
    }
  }

  function renderDropdown() {
    const dropdown = document.getElementById("notificationDropdown");
    if (!dropdown) return;

    const itemsHTML = notificationsCache.length
      ? notificationsCache.map(createNotificationHTML).join("")
      : `
        <div class="notification-empty">
          <i class="fa-regular fa-bell"></i>
          <h4>No notifications yet</h4>
          <p>Order updates will appear here.</p>
        </div>
      `;

    dropdown.innerHTML = `
      <div class="notification-dropdown-header">
        <div class="notification-header-text">
          <h3>Notifications</h3>
          <p>${unreadCount} unread update${unreadCount === 1 ? "" : "s"}</p>
        </div>

        <button type="button" class="notification-mark-read" id="markAllNotificationsRead">
          Mark all read
        </button>
      </div>

      <div class="notification-list">
        ${itemsHTML}
      </div>
    `;

    document
      .getElementById("markAllNotificationsRead")
      ?.addEventListener("click", async function (event) {
        event.preventDefault();
        event.stopPropagation();

        await markAllRead();
      });

    dropdown.querySelectorAll(".notification-item").forEach(function (item) {
      item.addEventListener("click", async function () {
        const id = item.dataset.id;
        const orderNumber = item.dataset.orderNumber;
        const type = item.dataset.type;

        await markOneRead(id);

        const activeDropdown = document.getElementById("notificationDropdown");
        if (activeDropdown) {
          activeDropdown.classList.remove("show", "open");
        }

        routeNotificationClick(type, orderNumber);
      });
    });
  }

  function routeNotificationClick(type, orderNumber) {
    const cleanType = String(type || "").trim();
    const cleanOrderNumber = String(orderNumber || "").trim();

    if (!cleanOrderNumber) return;

    const encodedOrder = encodeURIComponent(cleanOrderNumber);

    const riderFocusTypes = [
      "rider_assigned",
      "rider_picked_up",
      "rider_on_the_way",
    ];

    if (riderFocusTypes.includes(cleanType)) {
      sessionStorage.setItem("foodExpressTrackFocus", "rider");

      const targetUrl = `track-order.html?order=${encodedOrder}&focus=rider#rider`;
      const isTrackPage = window.location.pathname.includes("track-order.html");

      if (isTrackPage) {
        const params = new URLSearchParams(window.location.search);
        const currentOrder =
          params.get("order") || params.get("order_number") || "";

        if (String(currentOrder) === cleanOrderNumber) {
          if (typeof window.focusTrackSection === "function") {
            window.focusTrackSection("rider");
          } else {
            const riderCard = document.getElementById("riderInfoCard");
            if (riderCard) {
              riderCard.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }
          }

          return;
        }
      }

      window.location.href = targetUrl;
      return;
    }

    if (cleanType === "order_delivered") {
      sessionStorage.setItem("foodExpressTrackFocus", "summary");
      window.location.href = `track-order.html?order=${encodedOrder}&focus=summary#summary`;
      return;
    }

    if (
      [
        "order_placed",
        "order_confirmed",
        "food_ready",
        "order_cancelled",
      ].includes(cleanType)
    ) {
      window.location.href = `track-order.html?order=${encodedOrder}`;
      return;
    }

    if (
      [
        "new_order",
        "rider_assigned_owner",
        "rider_picked_up_owner",
        "order_delivered_owner",
      ].includes(cleanType)
    ) {
      window.location.href = `owner-orders.html?order=${encodedOrder}`;
      return;
    }

    if (["delivery_accepted", "delivery_completed"].includes(cleanType)) {
      window.location.href = `rider-deliveries.html?order=${encodedOrder}`;
      return;
    }

    window.location.href = `track-order.html?order=${encodedOrder}`;
  }

  function createNotificationHTML(notification) {
    const isUnread = Number(notification.is_read || 0) === 0;
    const icon = getIcon(notification.type);
    const orderNumber = notification.order_number || "";

    return `
      <div 
        class="notification-item ${isUnread ? "unread" : "read"}"
        data-id="${escapeHtml(notification.id)}"
        data-order-number="${escapeHtml(orderNumber)}"
        data-type="${escapeHtml(notification.type || "")}"
        role="button"
        tabindex="0"
      >
        <div class="notification-icon">
          <i class="${icon}"></i>
        </div>

        <div class="notification-content">
          <h4 class="notification-title">${escapeHtml(
            notification.title || "Notification"
          )}</h4>
          <p class="notification-message">${escapeHtml(
            notification.message || ""
          )}</p>
          <span class="notification-time">${escapeHtml(
            formatTimeAgo(notification.created_at)
          )}</span>
        </div>
      </div>
    `;
  }

  function getIcon(type) {
    const map = {
      order_placed: "fa-solid fa-bag-shopping",
      new_order: "fa-solid fa-receipt",
      order_confirmed: "fa-solid fa-circle-check",
      food_ready: "fa-solid fa-box-open",
      rider_assigned: "fa-solid fa-motorcycle",
      rider_assigned_owner: "fa-solid fa-motorcycle",
      delivery_accepted: "fa-solid fa-check",
      rider_picked_up: "fa-solid fa-bag-shopping",
      rider_picked_up_owner: "fa-solid fa-bag-shopping",
      rider_on_the_way: "fa-solid fa-location-arrow",
      order_delivered: "fa-solid fa-circle-check",
      order_delivered_owner: "fa-solid fa-circle-check",
      delivery_completed: "fa-solid fa-money-bill-wave",
      order_cancelled: "fa-solid fa-circle-xmark",
    };

    return map[type] || "fa-solid fa-bell";
  }

  async function markAllRead() {
    const user = getCurrentNotificationUser();
    if (!user.email) return;

    try {
      await fetch(`${NOTIFICATION_API}?action=mark_all_read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          role: user.role,
        }),
      });

      await loadNotificationsFromBackend();
    } catch (error) {
      console.error("[notifications.js] Mark all read failed:", error);
    }
  }

  async function markOneRead(id) {
    if (!id) return;

    try {
      await fetch(`${NOTIFICATION_API}?action=mark_read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: Number(id),
        }),
      });

      await loadNotificationsFromBackend();
    } catch (error) {
      console.error("[notifications.js] Mark one read failed:", error);
    }
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return "Just now";

    const time = new Date(timestamp).getTime();
    if (Number.isNaN(time)) return "Just now";

    const diff = Math.floor((Date.now() - time) / 60000);

    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff} min${diff > 1 ? "s" : ""} ago`;

    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;

    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  function readJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  window.bindNotificationBell = bindNotificationBell;
  window.loadNotificationsFromBackend = loadNotificationsFromBackend;

  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(bindNotificationBell, 100);
    setTimeout(bindNotificationBell, 500);
    setTimeout(bindNotificationBell, 1000);
  });
})();