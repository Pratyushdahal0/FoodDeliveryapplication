(() => {
  console.log("[track-order.js] Loaded - backend live tracking + delivered review fixed (loop-safe v2)");

  const ORDER_API_URL = "../../backend/controllers/OrderController.php";
  const ORDER_REVIEW_API_URL = "../../backend/controllers/OrderReviewController.php";
  const TRACK_ORDER_HISTORY_KEY = "foodExpressOrders";
  const TRACK_LAST_ORDER_KEY = "lastOrder";
  const DEFAULT_IMAGE = "";
  const SYNC_INTERVAL_MS = 5000;          // poll every 5 s — stop automatically on terminal status
  const STORAGE_REACT_DEBOUNCE_MS = 1500; // debounce cross-tab storage events

  const STATUS_FLOW = [
    "pending",
    "confirmed",
    "preparing",
    "rider_assigned",
    "ready_for_pickup",
    "picked_up",
    "on_the_way",
    "delivered",
  ];

  let latestOrder = null;
  let syncInterval = null;

  // ---- Loop-safety guards (Priority #4 fix) ----
  // fetchInFlight: prevent overlapping fetches when interval + storage event
  //   + manual call all race. If a fetch is already running, others wait.
  // skipNextStorageReact: when WE write to localStorage, we still get a
  //   storage event in OTHER tabs. We use a timestamp to avoid reacting
  //   to our own recent writes.
  // storageReactTimer: debounce so a burst of cross-tab writes only
  //   triggers one fetch, not 20.
  let fetchInFlight = null;
  let lastSelfWriteAt = 0;
  let storageReactTimer = null;
  let consecutiveFailures = 0;

  document.addEventListener("DOMContentLoaded", () => {
    initializeTrackingPage();
  });

  // Stop polling when the tab is hidden (battery + network savings) and
  // resume when visible. This also reduces the multi-tab amplification
  // because backgrounded tabs don't fetch.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }
    } else if (latestOrder && !syncInterval) {
      startTrackingSync();
    }
  });

  async function initializeTrackingPage() {
    latestOrder = await getLatestTrackedOrder();

    if (!latestOrder) {
      showEmptyState();
      return;
    }

    showTrackState();
    renderTrackingPage(latestOrder);
    startTrackingSync();
  }

  function updateLiveIndicator(active) {
    let el = document.getElementById("trackLiveBadge");

    if (!active) {
      if (el) el.remove();
      return;
    }

    if (!el) {
      if (!document.getElementById("trackLiveStyles")) {
        const s = document.createElement("style");
        s.id = "trackLiveStyles";
        s.textContent =
          "@keyframes trackLivePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.7)}}";
        document.head.appendChild(s);
      }

      el = document.createElement("span");
      el.id = "trackLiveBadge";
      el.title = "Auto-refreshing order status";
      el.style.cssText =
        "display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;" +
        "color:#16a34a;vertical-align:middle;margin-left:8px;";
      el.innerHTML =
        '<span style="width:7px;height:7px;border-radius:50%;background:#16a34a;' +
        'display:inline-block;animation:trackLivePulse 1.4s ease-in-out infinite;flex-shrink:0;"></span>Live';

      const pill = document.getElementById("statusPill");
      const content = document.getElementById("trackContent");
      if (pill && pill.parentNode) {
        pill.insertAdjacentElement("afterend", el);
      } else if (content) {
        content.insertAdjacentElement("afterbegin", el);
      }
    }
  }

  function startTrackingSync() {
    // Skip polling for terminal orders
    if (latestOrder) {
      const s = getOrderStatus(latestOrder);
      const d = getDeliveryStatus(latestOrder);
      if (s === "delivered" || s === "cancelled" || d === "delivered") {
        updateLiveIndicator(false);
        return;
      }
    }

    if (syncInterval) clearInterval(syncInterval);
    updateLiveIndicator(true);

    syncInterval = setInterval(async () => {
      if (document.hidden) return;

      const updatedOrder = await getLatestTrackedOrder();
      if (!updatedOrder) return;

      const oldRestaurantStatus = getOrderStatus(latestOrder);
      const oldDeliveryStatus = getDeliveryStatus(latestOrder);

      const newRestaurantStatus = getOrderStatus(updatedOrder);
      const newDeliveryStatus = getDeliveryStatus(updatedOrder);

      latestOrder = updatedOrder;

      // Stop polling when order reaches a terminal state
      if (
        newRestaurantStatus === "delivered" ||
        newRestaurantStatus === "cancelled" ||
        newDeliveryStatus === "delivered"
      ) {
        clearInterval(syncInterval);
        syncInterval = null;
        updateLiveIndicator(false);
      }

      if (
        oldRestaurantStatus !== newRestaurantStatus ||
        oldDeliveryStatus !== newDeliveryStatus
      ) {
        renderTrackingPage(latestOrder);
      } else {
        hydrateLatestOrder();
        updateStepUI(latestOrder);
      }
    }, SYNC_INTERVAL_MS);

    // ---- Cross-tab storage handler (loop-safe) ----
    // Old version called getLatestTrackedOrder() on EVERY storage event,
    // and getLatestTrackedOrder writes to localStorage on success, which
    // re-fires storage events in the other tab → infinite ping-pong with
    // 2+ tabs open. New version: debounce, ignore our own recent writes,
    // and re-render from cached data without re-fetching.
    window.addEventListener("storage", (event) => {
      if (
        event.key !== TRACK_ORDER_HISTORY_KEY &&
        event.key !== TRACK_LAST_ORDER_KEY &&
        event.key !== "foodExpressOrdersUpdatedAt"
      ) {
        return;
      }

      // Ignore events that arrived within 2s of our own write — they're
      // very likely echoes of our own activity from another tab.
      if (Date.now() - lastSelfWriteAt < 2000) {
        return;
      }

      // Debounce: collapse a burst of writes into a single re-render.
      if (storageReactTimer) clearTimeout(storageReactTimer);

      storageReactTimer = setTimeout(() => {
        storageReactTimer = null;

        // Re-render from the freshly-written localStorage WITHOUT
        // triggering another network fetch. The interval will catch up
        // on backend changes within SYNC_INTERVAL_MS.
        const lastOrder = readJson(TRACK_LAST_ORDER_KEY, null);
        if (lastOrder) {
          latestOrder = normalizeOrder(lastOrder);
          renderTrackingPage(latestOrder);
        }
      }, STORAGE_REACT_DEBOUNCE_MS);
    });
  }

  async function getLatestTrackedOrder() {
    // Single-flight guard: if a fetch is already running, await it
    // instead of starting a new one. This collapses overlapping
    // calls from interval + storage + manual triggers.
    if (fetchInFlight) {
      try {
        return await fetchInFlight;
      } catch (_) {
        return null;
      }
    }

    fetchInFlight = (async () => {
      try {
        const queryOrder = getQueryOrderNumber();

        if (queryOrder) {
          const backendOrder = await fetchOrderByNumberOrId(queryOrder);
          if (backendOrder) {
            consecutiveFailures = 0;
            return backendOrder;
          }
        }

        const lastOrder = readJson(TRACK_LAST_ORDER_KEY, null);
        const allOrders = readJson(TRACK_ORDER_HISTORY_KEY, []);

        const localOrder = findLocalOrder(queryOrder, lastOrder, allOrders);

        const localOrderNumber =
          localOrder?.orderNumber ||
          localOrder?.order_number ||
          localOrder?.orderId ||
          localOrder?.id ||
          "";

        if (localOrderNumber) {
          const backendOrder = await fetchOrderByNumberOrId(localOrderNumber);
          if (backendOrder) {
            consecutiveFailures = 0;
            return backendOrder;
          }
        }

        if (localOrder) {
          consecutiveFailures = 0;
          return normalizeOrder(localOrder);
        }

        const newestBackend = await fetchNewestBackendOrder();
        if (newestBackend) {
          consecutiveFailures = 0;
          return newestBackend;
        }

        return null;
      } catch (error) {
        consecutiveFailures += 1;
        console.warn(
          "[track-order.js] getLatestTrackedOrder failed (#" +
            consecutiveFailures +
            "):",
          error
        );

        // After 5 consecutive failures, slow polling way down so we
        // don't keep hammering a broken backend.
        if (consecutiveFailures >= 5 && syncInterval) {
          clearInterval(syncInterval);
          syncInterval = setInterval(async () => {
            if (document.hidden) return;
            await getLatestTrackedOrder();
          }, 30000);
          console.warn(
            "[track-order.js] Backend unreachable — slowing polling to 30s."
          );
        }

        return null;
      } finally {
        fetchInFlight = null;
      }
    })();

    return await fetchInFlight;
  }

  function getQueryOrderNumber() {
    const params = new URLSearchParams(window.location.search);
    return params.get("order") || params.get("order_number") || params.get("id") || "";
  }

  async function fetchOrderByNumberOrId(value) {
    const searchValue = String(value || "").trim();
    if (!searchValue) return null;

    try {
      let url = "";

      if (/^\d+$/.test(searchValue)) {
        url = `${ORDER_API_URL}?action=single&id=${encodeURIComponent(searchValue)}`;
      } else {
        url = `${ORDER_API_URL}?action=by_number&order_number=${encodeURIComponent(
          searchValue
        )}`;
      }

      const result = await fetchJson(url);

      if (result?.success && result.data) {
        const normalized = normalizeOrder(result.data);
        saveLatestOrderLocally(normalized);
        return normalized;
      }

      return null;
    } catch (error) {
      console.warn("[track-order.js] fetchOrderByNumberOrId failed:", error);
      return null;
    }
  }

  async function fetchNewestBackendOrder() {
    // Intentionally returns null — do not fall back to action=all which returns
    // any customer's most recent order. Callers must supply an order number via
    // URL param or localStorage; the tracking page shows empty state otherwise.
    return null;
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    const raw = await response.text();

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error("[track-order.js] Non-JSON backend response:", raw);
      throw new Error("Backend did not return valid JSON.");
    }
  }

  function findLocalOrder(queryOrder, lastOrder, allOrders) {
    const safeOrders = Array.isArray(allOrders) ? allOrders : [];

    if (queryOrder) {
      const byQuery = safeOrders.find((order) => {
        return (
          String(order.id || "") === String(queryOrder) ||
          String(order.orderId || "") === String(queryOrder) ||
          String(order.order_id || "") === String(queryOrder) ||
          String(order.orderNumber || "") === String(queryOrder) ||
          String(order.order_number || "") === String(queryOrder)
        );
      });

      if (byQuery) return byQuery;
    }

    if (!lastOrder) return null;

    const matched = safeOrders.find((order) => {
      return (
        (order.id && lastOrder.id && String(order.id) === String(lastOrder.id)) ||
        (order.orderId &&
          lastOrder.orderId &&
          String(order.orderId) === String(lastOrder.orderId)) ||
        (order.order_id &&
          lastOrder.order_id &&
          String(order.order_id) === String(lastOrder.order_id)) ||
        (order.orderNumber &&
          lastOrder.orderNumber &&
          String(order.orderNumber) === String(lastOrder.orderNumber)) ||
        (order.order_number &&
          lastOrder.order_number &&
          String(order.order_number) === String(lastOrder.order_number))
      );
    });

    return matched || lastOrder;
  }

  function normalizeOrder(order) {
    const normalized = {
      ...order,

      id: order.id || order.orderId || order.order_id,
      orderId: order.orderId || order.order_id || order.id,
      order_id: order.order_id || order.orderId || order.id,

      orderNumber:
        order.orderNumber || order.order_number || order.orderNo || order.id || "#ORDER",
      order_number:
        order.order_number || order.orderNumber || order.orderNo || order.id || "#ORDER",

      restaurantId: order.restaurantId || order.restaurant_id || "",
      restaurant_id: order.restaurant_id || order.restaurantId || "",

      restaurantName:
        cleanRestaurantName(
          order.restaurantName ||
            order.restaurant_name ||
            order.restaurant ||
            getFirstItemRestaurant(order) ||
            "Spicy Grill"
        ),

      restaurant_name:
        cleanRestaurantName(
          order.restaurant_name ||
            order.restaurantName ||
            order.restaurant ||
            getFirstItemRestaurant(order) ||
            "Spicy Grill"
        ),

      customerName:
        order.customerName ||
        order.customer_name ||
        order.fullName ||
        order.name ||
        "Customer",

      customer_name:
        order.customer_name ||
        order.customerName ||
        order.fullName ||
        order.name ||
        "Customer",

      customerEmail: order.customerEmail || order.customer_email || "",
      customer_email: order.customer_email || order.customerEmail || "",

      phoneNumber: order.phoneNumber || order.phone_number || order.phone || "",
      phone_number: order.phone_number || order.phoneNumber || order.phone || "",

      postalCode: order.postalCode || order.postal_code || "",
      postal_code: order.postal_code || order.postalCode || "",

      paymentMethod: order.paymentMethod || order.payment_method || "cash",
      payment_method: order.payment_method || order.paymentMethod || "cash",

      deliveryFee: Number(order.deliveryFee || order.delivery_fee || 0),
      delivery_fee: Number(order.delivery_fee || order.deliveryFee || 0),

      discountAmount: Number(order.discountAmount || order.discount_amount || 0),
      discount_amount: Number(order.discount_amount || order.discountAmount || 0),

      deliveryStatus: order.deliveryStatus || order.delivery_status || "searching",
      delivery_status: order.delivery_status || order.deliveryStatus || "searching",

      riderName: order.riderName || order.rider_name || "",
      rider_name: order.rider_name || order.riderName || "",

      riderPhone: order.riderPhone || order.rider_phone || "",
      rider_phone: order.rider_phone || order.riderPhone || "",

      riderAssignedAt: order.riderAssignedAt || order.rider_assigned_at || "",
      rider_assigned_at: order.rider_assigned_at || order.riderAssignedAt || "",

      createdAt: order.createdAt || order.created_at || order.timestamp || "",
      created_at: order.created_at || order.createdAt || order.timestamp || "",

      updatedAt: order.updatedAt || order.updated_at || "",
      updated_at: order.updated_at || order.updatedAt || "",

      estimatedDelivery:
  order.estimatedDelivery ||
  order.estimated_delivery ||
  order.eta ||
  order.estimated_arrival ||
  "30–40 min",

estimated_delivery:
  order.estimated_delivery ||
  order.estimatedDelivery ||
  order.eta ||
  order.estimated_arrival ||
  "30–40 min",

      picked_up_at: order.picked_up_at || "",
      on_the_way_at: order.on_the_way_at || "",
      delivered_at: order.delivered_at || "",

      status: String(order.status || "pending").toLowerCase(),

      subtotal: Number(order.subtotal || 0),
      tax: Number(order.tax || 0),
      total: Number(order.total || 0),

      items: Array.isArray(order.items) ? order.items : [],
    };

    normalized.items = normalized.items.map((item) => ({
      ...item,
      restaurant_name:
        item.restaurant_name || item.restaurantName || normalized.restaurantName,
      restaurantName:
        item.restaurantName || item.restaurant_name || normalized.restaurantName,
    }));

    return normalized;
  }

  function getFirstItemRestaurant(order) {
    const first = Array.isArray(order.items) ? order.items[0] : null;
    return first?.restaurant_name || first?.restaurantName || first?.storeName || "";
  }

  function cleanRestaurantName(name) {
    const value = String(name || "").trim();

    if (
      !value ||
      value.toLowerCase() === "restaurant" ||
      value.toLowerCase() === "unknown restaurant"
    ) {
      return "Spicy Grill";
    }

    return value;
  }

  function saveLatestOrderLocally(order) {
    try {
      // Mark that WE are about to write — so storage events arriving in
      // other tabs from these writes can be filtered out (they're echoes
      // of our own activity, not new info).
      lastSelfWriteAt = Date.now();

      localStorage.setItem(TRACK_LAST_ORDER_KEY, JSON.stringify(order));

      const existing = readJson(TRACK_ORDER_HISTORY_KEY, []);
      const orders = Array.isArray(existing) ? existing : [];

      const index = orders.findIndex((item) => {
        return (
          String(item.id || item.orderId || item.order_id) ===
            String(order.id || order.orderId || order.order_id) ||
          String(item.orderNumber || item.order_number) ===
            String(order.orderNumber || order.order_number)
        );
      });

      if (index >= 0) {
        orders[index] = order;
      } else {
        orders.unshift(order);
      }

      localStorage.setItem(TRACK_ORDER_HISTORY_KEY, JSON.stringify(orders));
      localStorage.setItem("foodExpressOrdersUpdatedAt", String(Date.now()));
    } catch (error) {
      console.warn("[track-order.js] Could not save latest order locally:", error);
    }
  }

  function renderTrackingPage(order) {
    showCancelBtn(order);
    latestOrder = normalizeOrder(order);
    showTrackState();
    hydrateLatestOrder();
    updateStepUI(latestOrder);
    handleTrackPageAnchorScroll();
  }

  function showEmptyState() {
    const empty = document.getElementById("emptyOrderState");
    const content = document.getElementById("trackContent");

    if (empty) empty.style.display = "block";
    if (content) content.style.display = "none";
  }

  function showTrackState() {
    const empty = document.getElementById("emptyOrderState");
    const content = document.getElementById("trackContent");

    if (empty) empty.style.display = "none";
    if (content) content.style.display = "block";
  }

  function hydrateLatestOrder() {
    setText("orderNumberBadge", latestOrder.orderNumber || "#ORDER");
    setText("restaurantName", latestOrder.restaurantName || "Spicy Grill");

    setText(
      "deliveryAddress",
      `${latestOrder.address || ""}${latestOrder.city ? ", " + latestOrder.city : ""}`.trim() ||
        "Delivery address not available"
    );

    setText("deliveryFullText", buildDeliveryText(latestOrder));
    setText("etaValue", getTrackingEta(latestOrder));

    setText("paymentMethodValue", formatPaymentMethod(latestOrder.paymentMethod));

    const itemCount = Number(latestOrder.itemCount || countItems(latestOrder.items));
    setText("itemCountValue", `${itemCount} item${itemCount !== 1 ? "s" : ""}`);

    setText("placedTimeValue", formatPlacedTime(latestOrder.createdAt));

    renderSummaryItems();
    renderSummaryValues();

    setStatusPill(latestOrder);
    fillStepTimesFromHistory(latestOrder);
    setLiveNote(latestOrder);
    renderRiderInfo(latestOrder);
    renderDeliveredExperience(latestOrder);
    renderBetaRouteCard(latestOrder);
  }

  function renderSummaryItems() {
    const container = document.getElementById("summaryItems");
    if (!container) return;

    const items = Array.isArray(latestOrder.items) ? latestOrder.items : [];

    if (!items.length) {
      container.innerHTML = `
        <div class="summary-empty">
          Items are saved in the order record.
        </div>
      `;
      return;
    }

    container.innerHTML = items
      .map((item) => {
        const quantity = Number(item.quantity || 1);
        const price = Number(item.price || item.unit_price || 0);
        const lineTotal = quantity * price;
        const itemName = item.name || item.product_name || "Food item";
        const image = item.image_url || item.image || "";

        return `
          <div class="summary-item">
            ${
              image
                ? `
                  <img
                    src="${escapeHtml(image)}"
                    alt="${escapeHtml(itemName)}"
                    onerror="this.style.display='none'"
                  />
                `
                : `
                  <div class="summary-item-icon">
                    <i class="fa-solid fa-bag-shopping"></i>
                  </div>
                `
            }
            <div>
              <div class="summary-item-name">${escapeHtml(itemName)}</div>
              <div class="summary-item-meta">Qty ${quantity} • ${formatCurrency(price)} each</div>
            </div>
            <div class="summary-item-price">${formatCurrency(lineTotal)}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderSummaryValues() {
    const subtotal = Number(latestOrder.subtotal || sumSubtotal(latestOrder.items));
    const tax = Number(latestOrder.tax || 0);
    const deliveryFee = Number(latestOrder.deliveryFee || latestOrder.delivery_fee || 0);
    const discountAmount = Number(
      latestOrder.discountAmount || latestOrder.discount_amount || 0
    );
    const total = Number(
      latestOrder.total || Math.max(0, subtotal + tax + deliveryFee - discountAmount)
    );

    setText("subtotalValue", formatCurrency(subtotal));
    setText("taxValue", formatCurrency(tax));
    setText("deliveryFeeValue", formatCurrency(deliveryFee));
    setText("totalValue", formatCurrency(total));

    const discountRow = document.getElementById("discountRow");
    const discountValue = document.getElementById("discountValue");

    if (discountAmount > 0) {
      if (discountRow) discountRow.style.display = "flex";
      if (discountValue) discountValue.textContent = `-${formatCurrency(discountAmount)}`;
    } else {
      if (discountRow) discountRow.style.display = "none";
      if (discountValue) discountValue.textContent = `${formatCurrency(0)}`;
    }
  }

  function getOrderStatus(order = latestOrder) {
    return String(order?.status || "pending").toLowerCase().trim();
  }

  function getDeliveryStatus(order = latestOrder) {
    return String(order?.deliveryStatus || order?.delivery_status || "searching")
      .toLowerCase()
      .trim();
  }

  function getRiderName(order = latestOrder) {
    return order?.riderName || order?.rider_name || order?.driverName || "";
  }

  function getVisualStatus(order = latestOrder) {
    const orderStatus = getOrderStatus(order);
    const deliveryStatus = getDeliveryStatus(order);

    if (orderStatus === "delivered" || deliveryStatus === "delivered") return "delivered";
    if (deliveryStatus === "on_the_way") return "on_the_way";
    if (deliveryStatus === "picked_up") return "picked_up";
    if (orderStatus === "ready_for_pickup") return "ready_for_pickup";
    if (deliveryStatus === "assigned") return "rider_assigned";
    if (orderStatus === "preparing") return "preparing";
    if (orderStatus === "confirmed") return "confirmed";

    return "pending";
  }

  function updateStepUI(orderOrStatus) {
  const order =
    typeof orderOrStatus === "string"
      ? { status: orderOrStatus, delivery_status: latestOrder?.delivery_status }
      : orderOrStatus || latestOrder;

  ensureTrackTimelineDoneStyles();

  const visualStatus = getVisualStatus(order);
  const currentIndex = STATUS_FLOW.indexOf(visualStatus);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const isDelivered =
    visualStatus === "delivered" ||
    getOrderStatus(order) === "delivered" ||
    getDeliveryStatus(order) === "delivered";

  document.querySelectorAll(".step-item").forEach((stepEl, index) => {
    stepEl.classList.remove("active", "done");

    const dot =
      stepEl.querySelector(".step-dot") ||
      stepEl.querySelector(".timeline-dot") ||
      stepEl.querySelector(".step-circle") ||
      stepEl.querySelector("span");

    if (isDelivered || index < safeIndex) {
      stepEl.classList.add("done");
      if (dot) {
        dot.innerHTML = `<i class="fa-solid fa-check"></i>`;
        dot.style.borderColor = "#22c55e";
        dot.style.background = "#22c55e";
        dot.style.color = "#ffffff";
      }
      return;
    }

    if (index === safeIndex) {
      stepEl.classList.add("active");
      if (dot) {
        dot.style.borderColor = "#ff5a2f";
        dot.style.background = "#fff1ea";
        dot.style.color = "#ff5a2f";
      }
      return;
    }

    if (dot) {
      dot.innerHTML = "";
      dot.style.borderColor = "";
      dot.style.background = "";
      dot.style.color = "";
    }
  });

  const fillPercent = isDelivered
    ? 100
    : (safeIndex / (STATUS_FLOW.length - 1)) * 100;

  const progressFill = document.getElementById("progressFill");
  if (progressFill) progressFill.style.width = `${fillPercent}%`;

  setStatusPill(order);
  setLiveNote(order);
}

function ensureTrackTimelineDoneStyles() {
  if (document.getElementById("trackTimelineDoneStyles")) return;

  const style = document.createElement("style");
  style.id = "trackTimelineDoneStyles";
  style.textContent = `
    .step-item.done .step-dot,
    .step-item.done .timeline-dot,
    .step-item.done .step-circle {
      background: #22c55e !important;
      border-color: #22c55e !important;
      color: #ffffff !important;
    }

    .step-item.done .step-dot i,
    .step-item.done .timeline-dot i,
    .step-item.done .step-circle i {
      color: #ffffff !important;
      font-size: 11px;
    }

    .step-item.done h3,
    .step-item.done h4,
    .step-item.done strong {
      color: #111827 !important;
    }

    .step-item.active .step-dot,
    .step-item.active .timeline-dot,
    .step-item.active .step-circle {
      border-color: #ff5a2f !important;
      background: #fff1ea !important;
      color: #ff5a2f !important;
    }
  `;

  document.head.appendChild(style);
}


  function setStatusPill(orderOrStatus) {
    const pill = document.getElementById("statusPill");
    if (!pill) return;

    const order =
      typeof orderOrStatus === "string"
        ? { status: orderOrStatus }
        : orderOrStatus || latestOrder;

    const visualStatus = getVisualStatus(order);

    pill.className = `status-pill status-${visualStatus}`;
    pill.textContent = formatStatus(visualStatus);
  }

  function setLiveNote(orderOrStatus) {
    const note = document.getElementById("liveNote");
    if (!note) return;

    const order =
      typeof orderOrStatus === "string"
        ? { status: orderOrStatus }
        : orderOrStatus || latestOrder;

    const orderStatus = getOrderStatus(order);
    const deliveryStatus = getDeliveryStatus(order);
    const riderName = getRiderName(order);

    if (orderStatus === "delivered" || deliveryStatus === "delivered") {
      note.textContent = "Your order has been delivered successfully.";
      return;
    }

    if (deliveryStatus === "on_the_way") {
      note.textContent = riderName
        ? `${riderName} is on the way to your delivery address.`
        : "Good news — your rider is on the way to your delivery address.";
      return;
    }

    if (deliveryStatus === "picked_up") {
      note.textContent = riderName
        ? `${riderName} has picked up your order from the restaurant.`
        : "Your rider has picked up your order from the restaurant.";
      return;
    }

    if (orderStatus === "ready_for_pickup") {
      note.textContent = riderName
        ? `Your food is ready. ${riderName} can now pick it up.`
        : "Your food is ready and waiting for rider pickup.";
      return;
    }

    if (deliveryStatus === "assigned") {
      note.textContent = riderName
        ? `Your rider ${riderName} has accepted the delivery and is waiting for the restaurant.`
        : "A rider has accepted your delivery and is waiting for the restaurant.";
      return;
    }

    if (orderStatus === "preparing") {
      note.textContent = "Your order is being freshly prepared right now.";
      return;
    }

    if (orderStatus === "confirmed") {
      note.textContent =
        "The restaurant has confirmed your order and we are matching your delivery with a nearby rider.";
      return;
    }

    note.textContent =
      "Your order has been created, sent to the restaurant, and rider matching has started.";
  }

  function getTrackingEta(order = latestOrder) {
  return (
    order?.estimatedDelivery ||
    order?.estimated_delivery ||
    order?.eta ||
    order?.estimated_arrival ||
    "30–40 min"
  );
}

function getRouteStage(order = latestOrder) {
  const orderStatus = getOrderStatus(order);
  const deliveryStatus = getDeliveryStatus(order);

  if (orderStatus === "delivered" || deliveryStatus === "delivered") {
    return {
      key: "delivered",
      label: "Delivered",
      text: "Your order has arrived at the delivery address.",
      riderLeft: "82%",
    };
  }

  if (deliveryStatus === "on_the_way") {
    return {
      key: "on_the_way",
      label: "On the way",
      text: "Your rider is moving towards your delivery address.",
      riderLeft: "62%",
    };
  }

  if (deliveryStatus === "picked_up") {
    return {
      key: "picked_up",
      label: "Picked up",
      text: "Your rider has picked up the order from the restaurant.",
      riderLeft: "38%",
    };
  }

  if (deliveryStatus === "assigned") {
    return {
      key: "assigned",
      label: "Rider assigned",
      text: "A rider has accepted your delivery and is waiting for pickup.",
      riderLeft: "18%",
    };
  }

  if (orderStatus === "ready_for_pickup") {
    return {
      key: "ready_for_pickup",
      label: "Ready for pickup",
      text: "Your food is ready at the restaurant. Waiting for rider pickup.",
      riderLeft: "12%",
    };
  }

  if (orderStatus === "preparing") {
    return {
      key: "preparing",
      label: "Preparing",
      text: "The restaurant is preparing your food. Route will start after pickup.",
      riderLeft: "12%",
    };
  }

  if (orderStatus === "confirmed") {
    return {
      key: "confirmed",
      label: "Confirmed",
      text: "The restaurant confirmed your order. Rider matching will continue soon.",
      riderLeft: "12%",
    };
  }

  return {
    key: "pending",
    label: "Order received",
    text: "Waiting for restaurant confirmation before delivery route starts.",
    riderLeft: "12%",
  };
}

function buildGoogleMapsDirectionUrl(order = latestOrder) {
  const restaurantName =
    order.restaurantName ||
    order.restaurant_name ||
    getFirstItemRestaurant(order) ||
    "Restaurant";

  const city = order.city || "Kathmandu";
  const address = [order.address, order.city, order.postalCode || order.postal_code]
    .filter(Boolean)
    .join(", ");

  const origin = `${restaurantName}, ${city}, Nepal`;
  const destination = address || `${city}, Nepal`;

  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    origin
  )}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function renderBetaRouteCard(order = latestOrder) {
  const routeText = document.getElementById("routeStatusText");
  const routePill = document.getElementById("routeStagePill");
  const routeEta = document.getElementById("routeEtaMini");
  const routeRider = document.getElementById("routeRiderMini");
  const routeIcon = document.getElementById("simulatedRouteRider");
  const mapsLink = document.getElementById("openGoogleMapsLink");

  const pickupLabel = document.getElementById("pickupLabel");
  const dropoffLabel = document.getElementById("dropoffLabel");

  if (!routeText || !routePill || !routeEta || !routeRider || !routeIcon) return;

  const orderStatus = getOrderStatus(order);
  const deliveryStatus = getDeliveryStatus(order);
  const riderName = getRiderName(order) || "Waiting for rider";
  const restaurantName =
    order.restaurantName ||
    order.restaurant_name ||
    getFirstItemRestaurant(order) ||
    "Restaurant";

  const customerAddress =
    [order.address, order.city, order.postalCode || order.postal_code]
      .filter(Boolean)
      .join(", ") || "Your address";

  if (pickupLabel) pickupLabel.textContent = restaurantName;
  if (dropoffLabel) dropoffLabel.textContent = "Your address";

  routeRider.textContent = riderName;

  // default
  let stageLabel = "Order received";
  let stageText = "Waiting for restaurant confirmation before delivery starts.";
  let riderLeft = "18%";
  let etaText = "Waiting";
  let showMaps = false;

  if (orderStatus === "confirmed") {
    stageLabel = "Confirmed";
    stageText = "The restaurant confirmed your order.";
    riderLeft = "18%";
    etaText = "Preparing";
  }

  if (orderStatus === "preparing") {
    stageLabel = "Preparing";
    stageText = "The kitchen is preparing your order.";
    riderLeft = "20%";
    etaText = "Cooking";
  }

  if (orderStatus === "ready_for_pickup") {
    stageLabel = "Ready for pickup";
    stageText = "Your order is packed and waiting for rider pickup.";
    riderLeft = "26%";
    etaText = "Rider arriving";
  }

  if (deliveryStatus === "assigned") {
    stageLabel = "Rider assigned";
    stageText = "A rider has been assigned and is heading to the restaurant.";
    riderLeft = "30%";
    etaText = "Pickup soon";
  }

  if (deliveryStatus === "picked_up") {
    stageLabel = "Picked up";
    stageText = "Your rider picked up the order from the restaurant.";
    riderLeft = "48%";
    etaText = getTrackingEta(order);
    showMaps = true;
  }

  if (deliveryStatus === "on_the_way") {
    stageLabel = "On the way";
    stageText = "Your rider is on the way to your location.";
    riderLeft = "68%";
    etaText = getTrackingEta(order);
    showMaps = true;
  }

  if (orderStatus === "delivered" || deliveryStatus === "delivered") {
    const deliveredTime =
      formatReadableDate(order.delivered_at || order.updated_at || order.updatedAt) || "Just now";

    stageLabel = "Delivered";
    stageText = "Your order has been delivered successfully.";
    riderLeft = "78%";
    etaText = `Delivered ${deliveredTime}`;
    showMaps = false;
  }

  routeText.textContent = stageText;
  routePill.textContent = stageLabel;
  routeEta.textContent = etaText;
  routeIcon.style.left = riderLeft;

  if (mapsLink) {
    if (showMaps) {
      mapsLink.style.display = "inline-flex";
      mapsLink.href = buildGoogleMapsDirectionUrl(order);
    } else {
      mapsLink.style.display = "none";
    }
  }
}

  function renderRiderInfo(order) {
    const riderName = getRiderName(order);
    const deliveryStatus = getDeliveryStatus(order);
    const existing = document.getElementById("riderInfoCard");

    if (!riderName || deliveryStatus === "searching") {
      if (existing) existing.remove();
      return;
    }

    const phone = String(order.riderPhone || order.rider_phone || "").trim();
    const cleanPhone = phone.replace(/\s+/g, "");

    const statusLabelMap = {
      assigned: "Waiting for pickup",
      picked_up: "Order picked up",
      on_the_way: "On the way",
      delivered: "Delivered",
    };

    const riderStatus = statusLabelMap[deliveryStatus] || "Assigned";

    const callButton = phone
      ? `
        <a
          href="tel:${escapeHtml(cleanPhone)}"
          style="
            flex:1;
            min-height:44px;
            border-radius:999px;
            background:#ef4444;
            color:#fff;
            text-decoration:none;
            display:flex;
            align-items:center;
            justify-content:center;
            gap:8px;
            font-weight:900;
          "
        >
          <i class="fa-solid fa-phone"></i>
          Call Rider
        </a>
      `
      : `
        <button
          type="button"
          disabled
          style="
            flex:1;
            min-height:44px;
            border-radius:999px;
            border:none;
            background:#e5e7eb;
            color:#9ca3af;
            font-weight:900;
            cursor:not-allowed;
          "
        >
          <i class="fa-solid fa-phone"></i>
          No phone
        </button>
      `;

    const messageButton = `
      <button
        type="button"
        onclick="openRiderMessagePlaceholder()"
        style="
          flex:1;
          min-height:44px;
          border-radius:999px;
          background:#ffffff;
          color:#111827;
          border:1px solid #e5e7eb;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          font-weight:900;
          cursor:pointer;
        "
      >
        <i class="fa-solid fa-message"></i>
        Message
      </button>
    `;

    const html = `
      <div
        id="riderInfoCard"
        class="track-info-card"
        style="
          margin-top:18px;
          padding:18px;
          border-radius:24px;
          border:1px solid #e5e7eb;
          background:linear-gradient(135deg,#ffffff 0%,#fff7ed 100%);
          box-shadow:0 18px 40px rgba(15,23,42,0.08);
        "
      >
        <div style="display:flex;align-items:flex-start;gap:14px;">
          <div
            style="
              width:56px;
              height:56px;
              border-radius:999px;
              background:#fff1f1;
              color:#e53935;
              display:flex;
              align-items:center;
              justify-content:center;
              font-weight:900;
              font-size:18px;
              flex-shrink:0;
            "
          >
            ${escapeHtml(getInitials(riderName))}
          </div>

          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
              <div>
                <div style="font-weight:900;color:#111827;font-size:18px;">
                  Your Rider
                </div>
                <div style="color:#111827;font-weight:900;margin-top:3px;">
                  ${escapeHtml(riderName)}
                </div>
              </div>

              <span
                style="
                  border-radius:999px;
                  padding:7px 11px;
                  background:#ecfdf5;
                  color:#16a34a;
                  font-size:12px;
                  font-weight:900;
                "
              >
                ${escapeHtml(riderStatus)}
              </span>
            </div>

            <div style="margin-top:8px;color:#6b7280;font-size:14px;line-height:1.5;">
              ${
                phone
                  ? `<i class="fa-solid fa-phone"></i> ${escapeHtml(phone)}`
                  : `<i class="fa-solid fa-circle-info"></i> Rider phone will appear once available.`
              }
            </div>

            <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
              ${callButton}
              ${messageButton}
            </div>

            <p style="margin:12px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
              Use this only for delivery coordination, address clarification, or urgent order questions.
            </p>
          </div>
        </div>
      </div>
    `;

    const liveNote = document.getElementById("liveNote");

    if (existing) {
      existing.outerHTML = html;
      return;
    }

    if (liveNote) liveNote.insertAdjacentHTML("afterend", html);
  }

  function fillStepTimesFromHistory(order) {
  const historyMap = {};
  const visualStatus = getVisualStatus(order);
  const currentIndex = STATUS_FLOW.indexOf(visualStatus);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const isDelivered =
    visualStatus === "delivered" ||
    getOrderStatus(order) === "delivered" ||
    getDeliveryStatus(order) === "delivered";

  if (order.created_at || order.createdAt) {
    historyMap.pending = order.created_at || order.createdAt;
  }

  if (order.confirmed_at || order.confirmedAt) {
    historyMap.confirmed = order.confirmed_at || order.confirmedAt;
  }

  if (order.preparing_at || order.preparingAt) {
    historyMap.preparing = order.preparing_at || order.preparingAt;
  }

  if (order.ready_for_pickup_at || order.readyForPickupAt) {
    historyMap.ready_for_pickup =
      order.ready_for_pickup_at || order.readyForPickupAt;
  }

  if (order.rider_assigned_at || order.riderAssignedAt) {
    historyMap.rider_assigned = order.rider_assigned_at || order.riderAssignedAt;
  }

  if (order.picked_up_at || order.pickedUpAt) {
    historyMap.picked_up = order.picked_up_at || order.pickedUpAt;
  }

  if (order.on_the_way_at || order.onTheWayAt) {
    historyMap.on_the_way = order.on_the_way_at || order.onTheWayAt;
  }

  if (order.delivered_at || order.deliveredAt) {
    historyMap.delivered = order.delivered_at || order.deliveredAt;
  }

  if (order.updated_at || order.updatedAt) {
    historyMap[visualStatus] = historyMap[visualStatus] || order.updated_at || order.updatedAt;
  }

  const statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const deliveryHistory = Array.isArray(order.deliveryHistory) ? order.deliveryHistory : [];

  [...statusHistory, ...deliveryHistory].forEach((entry) => {
    if (entry?.status && entry?.time && !historyMap[entry.status]) {
      historyMap[entry.status] = entry.time;
    }
  });

  const fallbackTime =
    historyMap.delivered ||
    historyMap.on_the_way ||
    historyMap.picked_up ||
    historyMap.rider_assigned ||
    historyMap.ready_for_pickup ||
    historyMap.preparing ||
    historyMap.confirmed ||
    historyMap.pending ||
    order.updated_at ||
    order.updatedAt ||
    order.created_at ||
    order.createdAt ||
    new Date().toISOString();

  STATUS_FLOW.forEach((status, index) => {
    const el = document.getElementById(`time-${status}`);
    if (!el) return;

    const time = historyMap[status];

    if (status === "pending") {
      el.textContent = formatClockTime(
        parseOrderDate(time || order.createdAt || order.created_at) || new Date()
      );
      return;
    }

    if (time) {
      el.textContent = formatClockTime(parseOrderDate(time));
      return;
    }

    if (isDelivered || index <= safeIndex) {
      el.textContent = formatClockTime(parseOrderDate(fallbackTime)) || "Completed";
      return;
    }

    el.textContent = "--:--";
  });
}

  /* ===============================
     DELIVERED FINAL UX + REVIEW DRAFT
  ================================ */

  function renderDeliveredExperience(order) {
    const isDelivered = getFinalOrderStatus(order) === "delivered";
    let section = document.getElementById("deliveredExperienceCard");

    if (!isDelivered) {
      if (section) section.remove();
      return;
    }

    const orderNumberForCard = getReviewOrderNumber(order);

    if (
      section &&
      section.dataset.orderNumber === orderNumberForCard &&
      section.dataset.rendered === "true"
    ) {
      hydrateReviewDraftUI(order);
      bindDeliveredExperienceActions(order);
      return;
    }

    const earnedPoints = awardDeliveredPointsFromTrack(order);
    const orderNumber = order.orderNumber || order.order_number || "your order";
    const restaurantName =
      order.restaurantName || order.restaurant_name || "the restaurant";

    if (!section) {
      section = document.createElement("section");
      section.id = "deliveredExperienceCard";
      section.className = "delivered-experience-card";

      const timelineCard =
        document.querySelector(".timeline-card") ||
        document.querySelector(".tracking-card") ||
        document.querySelector("#orderTimeline") ||
        document.querySelector("#trackContent");

      if (timelineCard && timelineCard.parentNode) {
        timelineCard.parentNode.insertBefore(section, timelineCard.nextSibling);
      } else {
        document.body.appendChild(section);
      }
    }

    section.dataset.orderNumber = orderNumberForCard;
    section.dataset.rendered = "true";

    section.innerHTML = `
      <div class="delivered-success-top">
        <div class="delivered-success-icon">
          <i class="fa-solid fa-circle-check"></i>
        </div>

        <div>
          <p class="delivered-kicker">Delivered successfully</p>
          <h2>Your order has arrived</h2>
          <p>
            ${escapeHtml(restaurantName)} completed order
            <strong>#${escapeHtml(orderNumber)}</strong>. Enjoy your meal!
          </p>
        </div>
      </div>

      <div class="delivered-reward-box">
        <div>
          <span>FoodExpress Rewards</span>
          <strong>+${earnedPoints} points earned</strong>
          <p>Points are now added to your rewards balance.</p>
        </div>

        <button type="button" id="viewRewardsAfterDeliveryBtn">
          View rewards
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>

      <div class="delivered-rating-box">
        <div class="delivered-rating-head">
          <div>
            <h3>How was your order?</h3>
            <p>Your feedback helps improve restaurants and riders.</p>
          </div>
        </div>

        <div class="rating-row">
          <span>Food quality</span>
          <div class="rating-stars" data-rating-type="food">
            ${buildRatingStars("food")}
          </div>
        </div>

        <div class="rating-row">
          <span>Delivery experience</span>
          <div class="rating-stars" data-rating-type="rider">
            ${buildRatingStars("rider")}
          </div>
        </div>

        <textarea
          id="deliveryReviewNote"
          class="delivery-review-note"
          placeholder="Add a quick note, for example: food was hot, rider was polite..."
        ></textarea>

        <button type="button" id="submitDeliveryReviewBtn" class="submit-review-btn">
          Submit review
        </button>
      </div>

      <div class="delivered-action-row">
        <button type="button" id="deliveredReorderBtn" class="delivered-primary-btn">
          <i class="fa-solid fa-rotate-right"></i>
          Reorder these items
        </button>

        <button type="button" id="deliveredSupportBtn" class="delivered-secondary-btn">
          <i class="fa-solid fa-headset"></i>
          Contact support
        </button>

        <button type="button" id="deliveredDashboardBtn" class="delivered-secondary-btn">
          <i class="fa-solid fa-house"></i>
          Back to dashboard
        </button>
      </div>
    `;

    bindDeliveredExperienceActions(order);
  }

  function getFinalOrderStatus(order) {
    const deliveryStatus = String(
      order?.delivery_status || order?.deliveryStatus || ""
    ).toLowerCase();

    const kitchenStatus = String(order?.status || "").toLowerCase();

    if (deliveryStatus === "delivered" || kitchenStatus === "delivered") {
      return "delivered";
    }

    return deliveryStatus || kitchenStatus || "pending";
  }

  function buildRatingStars(type) {
    return [1, 2, 3, 4, 5]
      .map(
        (value) => `
          <button
            type="button"
            class="rating-star"
            data-rating-type="${type}"
            data-rating-value="${value}"
            aria-label="${value} star"
          >
            <i class="fa-solid fa-star"></i>
          </button>
        `
      )
      .join("");
  }

  function bindDeliveredExperienceActions(order) {
    const viewRewardsBtn = document.getElementById("viewRewardsAfterDeliveryBtn");
    const reorderBtn = document.getElementById("deliveredReorderBtn");
    const supportBtn = document.getElementById("deliveredSupportBtn");
    const dashboardBtn = document.getElementById("deliveredDashboardBtn");
    const reviewBtn = document.getElementById("submitDeliveryReviewBtn");

    if (viewRewardsBtn) {
      viewRewardsBtn.onclick = () => {
        window.location.href = "rewards.html";
      };
    }

    if (reorderBtn) {
      reorderBtn.onclick = () => {
        reorderLatestOrder();
      };
    }

    if (supportBtn) {
      supportBtn.onclick = () => {
        const orderNumber = encodeURIComponent(
          order.orderNumber || order.order_number || ""
        );
        window.location.href = `loggedContact.html?order=${orderNumber}&source=track_order&issue=order_issue`;
      };
    }

    if (dashboardBtn) {
      dashboardBtn.onclick = () => {
        window.location.href = "dashboard.html";
      };
    }

    bindRatingStars(order);
    hydrateReviewDraftUI(order);

    if (reviewBtn) {
      reviewBtn.onclick = () => {
        saveDeliveryReview(order);
      };
    }
  }

  function bindRatingStars(order) {
    const savedReview = getSavedDeliveryReview(order);

    if (savedReview) {
      lockSubmittedReviewUI(savedReview);
      return;
    }

    document.querySelectorAll(".rating-star").forEach((button) => {
      button.onclick = () => {
        const wrapper = button.closest(".rating-stars");

        if (!wrapper || wrapper.dataset.locked === "true") return;

        const type = button.dataset.ratingType;
        const value = Number(button.dataset.ratingValue || 0);

        paintReviewStars(type, value);
        wrapper.setAttribute("data-selected-rating", String(value));
        saveReviewDraft(order, type, value);
      };
    });
  }

  function paintReviewStars(type, value) {
    document
      .querySelectorAll(`.rating-star[data-rating-type="${type}"]`)
      .forEach((star) => {
        const starValue = Number(star.dataset.ratingValue || 0);
        star.classList.toggle("active", starValue <= value);
      });
  }

  function getReviewOrderNumber(order) {
    return String(
      order?.orderNumber ||
        order?.order_number ||
        order?.orderId ||
        order?.order_id ||
        order?.id ||
        getQueryOrderNumber() ||
        ""
    );
  }

  function getReviewDraftKey(order) {
    return `foodExpressReviewDraft_${getReviewOrderNumber(order)}`;
  }

  function getSavedReviewDraft(order) {
    return readJson(getReviewDraftKey(order), {
      foodRating: 0,
      riderRating: 0,
      note: "",
    });
  }

  function saveReviewDraft(order, type, value) {
    const draft = getSavedReviewDraft(order);

    if (type === "food") {
      draft.foodRating = value;
    }

    if (type === "rider") {
      draft.riderRating = value;
    }

    const noteInput = document.getElementById("deliveryReviewNote");
    draft.note = noteInput ? noteInput.value : draft.note || "";

    localStorage.setItem(getReviewDraftKey(order), JSON.stringify(draft));
  }

  function hydrateReviewDraftUI(order) {
    const savedReview = getSavedDeliveryReview(order);

    if (savedReview) {
      lockSubmittedReviewUI(savedReview);
      return;
    }

    const draft = getSavedReviewDraft(order);

    if (draft.foodRating) {
      const foodWrapper = document.querySelector(
        '.rating-stars[data-rating-type="food"]'
      );

      if (foodWrapper) {
        foodWrapper.setAttribute("data-selected-rating", String(draft.foodRating));
        paintReviewStars("food", Number(draft.foodRating));
      }
    }

    if (draft.riderRating) {
      const riderWrapper = document.querySelector(
        '.rating-stars[data-rating-type="rider"]'
      );

      if (riderWrapper) {
        riderWrapper.setAttribute("data-selected-rating", String(draft.riderRating));
        paintReviewStars("rider", Number(draft.riderRating));
      }
    }

    const noteInput = document.getElementById("deliveryReviewNote");

    if (noteInput && draft.note) {
      noteInput.value = draft.note;
    }

    if (noteInput && noteInput.dataset.reviewDraftBound !== "true") {
      noteInput.dataset.reviewDraftBound = "true";

      noteInput.addEventListener("input", () => {
        const nextDraft = getSavedReviewDraft(order);
        nextDraft.note = noteInput.value;
        localStorage.setItem(getReviewDraftKey(order), JSON.stringify(nextDraft));
      });
    }
  }

  async function saveDeliveryReview(order) {
  const foodRating = Number(
    document
      .querySelector('.rating-stars[data-rating-type="food"]')
      ?.getAttribute("data-selected-rating") || 0
  );

  const riderRating = Number(
    document
      .querySelector('.rating-stars[data-rating-type="rider"]')
      ?.getAttribute("data-selected-rating") || 0
  );

  const note = document.getElementById("deliveryReviewNote")?.value || "";
  const orderNumber = getReviewOrderNumber(order);

  if (!foodRating || !riderRating) {
    showTrackActionModal(
      "warning",
      "Rating needed",
      "Please rate both food quality and delivery experience."
    );
    setTimeout(hideTrackActionModal, 1800);
    return;
  }

  const submitBtn = document.getElementById("submitDeliveryReviewBtn");

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving review...";
  }

  const review = {
    orderNumber,
    foodRating,
    riderRating,
    note: note.trim(),
    submitted: true,
    createdAt: new Date().toISOString(),
  };

  const backendPayload = {
    order_id: order?.id || order?.orderId || order?.order_id || null,
    order_number: orderNumber,
    customer_email:
      order?.customerEmail ||
      order?.customer_email ||
      localStorage.getItem("userEmail") ||
      "",
    restaurant_id: order?.restaurantId || order?.restaurant_id || null,
    rider_id: order?.riderId || order?.rider_id || null,
    food_rating: foodRating,
    rider_rating: riderRating,
    review_note: note.trim(),
  };

  try {
    const response = await fetch(`${ORDER_REVIEW_API_URL}?action=create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(backendPayload),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Could not save review to database.");
    }

    review.backendSaved = true;
    review.backendReviewId = result.id || null;
  } catch (error) {
    console.warn("[track-order.js] Review backend save failed:", error);

    review.backendSaved = false;
    review.backendError = error.message || "Backend save failed";
  }

  saveReviewLocally(order, review);
  localStorage.removeItem(getReviewDraftKey(order));

  lockSubmittedReviewUI(review);

  showTrackActionModal(
    "success",
    "Review submitted",
    review.backendSaved
      ? "Thanks! Your review was saved successfully."
      : "Thanks! Your review was saved locally and can sync later."
  );

  setTimeout(hideTrackActionModal, 1800);
}

function saveReviewLocally(order, review) {
  const orderNumber = getReviewOrderNumber(order);
  const reviews = readJson("foodExpressOrderReviews", []);

  const cleanReviews = Array.isArray(reviews)
    ? reviews.filter((item) => String(item.orderNumber) !== String(orderNumber))
    : [];

  cleanReviews.unshift(review);

  localStorage.setItem("foodExpressOrderReviews", JSON.stringify(cleanReviews));
}

  function getSavedDeliveryReview(order) {
    const orderNumber = getReviewOrderNumber(order);
    if (!orderNumber) return null;

    const reviews = readJson("foodExpressOrderReviews", []);

    if (!Array.isArray(reviews)) return null;

    return (
      reviews.find(
        (review) =>
          String(review.orderNumber || "") === String(orderNumber) &&
          review.submitted === true
      ) || null
    );
  }

  function lockSubmittedReviewUI(review) {
    const foodWrapper = document.querySelector('.rating-stars[data-rating-type="food"]');
    const riderWrapper = document.querySelector('.rating-stars[data-rating-type="rider"]');
    const noteInput = document.getElementById("deliveryReviewNote");
    const submitBtn = document.getElementById("submitDeliveryReviewBtn");

    paintLockedStars(foodWrapper, Number(review.foodRating || 0));
    paintLockedStars(riderWrapper, Number(review.riderRating || 0));

    if (noteInput) {
      noteInput.value = review.note || "";
      noteInput.disabled = true;
      noteInput.readOnly = true;
      noteInput.classList.add("delivery-review-note-locked");
    }

    if (submitBtn) {
      submitBtn.textContent = "Review submitted";
      submitBtn.disabled = true;
      submitBtn.classList.add("review-submitted");
    }
  }

  function paintLockedStars(wrapper, rating) {
    if (!wrapper) return;

    wrapper.dataset.locked = "true";
    wrapper.setAttribute("data-selected-rating", String(rating));

    wrapper.querySelectorAll(".rating-star").forEach((star) => {
      const value = Number(star.dataset.ratingValue || 0);

      star.classList.toggle("active", value <= rating);
      star.disabled = true;
      star.classList.add("locked");
    });
  }

  function awardDeliveredPointsFromTrack(order) {
    const earned = Math.max(0, Math.floor(Number(order?.total || 0) / 10));
    const orderId = String(
      order?.id || order?.orderId || order?.order_id || order?.orderNumber || ""
    );

    if (!orderId || earned <= 0) return earned;

    if (typeof window.awardPointsFromOrder === "function") {
      window.awardPointsFromOrder({
        ...order,
        status: "delivered",
        delivery_status: "delivered",
      });

      window.dispatchEvent(new Event("foodExpressRewardsUpdated"));
      return earned;
    }

    const data = readJson("foodexpressRewards", {
      currentPoints: Number(localStorage.getItem("userPoints") || 0),
      lifetimePoints: Number(localStorage.getItem("foodExpressRewardPoints") || 0),
      activeCoupons: [],
      redeemedRewards: [],
      history: [],
      processedOrderIds: [],
    });

    data.currentPoints = Number(data.currentPoints || 0);
    data.lifetimePoints = Number(data.lifetimePoints || 0);
    data.activeCoupons = Array.isArray(data.activeCoupons) ? data.activeCoupons : [];
    data.redeemedRewards = Array.isArray(data.redeemedRewards)
      ? data.redeemedRewards
      : [];
    data.history = Array.isArray(data.history) ? data.history : [];
    data.processedOrderIds = Array.isArray(data.processedOrderIds)
      ? data.processedOrderIds.map(String)
      : [];

    if (!data.processedOrderIds.includes(orderId)) {
      data.currentPoints += earned;
      data.lifetimePoints += earned;
      data.processedOrderIds.push(orderId);

      data.history.unshift({
        id: `earned-${orderId}`,
        type: "earn",
        title: "Points earned",
        description: `Delivered order ${order.orderNumber || orderId} earned ${earned} points.`,
        points: earned,
        createdAt: new Date().toISOString(),
      });

      localStorage.setItem("foodexpressRewards", JSON.stringify(data));
      localStorage.setItem("userPoints", String(data.currentPoints));
      localStorage.setItem("foodExpressRewardPoints", String(data.currentPoints));
      window.dispatchEvent(new Event("foodExpressRewardsUpdated"));
    }

    return earned;
  }

  /* ===============================
     MODAL + ACTIONS
  ================================ */

  function showTrackActionModal(type, title, message) {
    const modal = document.getElementById("trackActionModal");
    const icon = document.getElementById("trackActionIcon");
    const titleEl = document.getElementById("trackActionTitle");
    const messageEl = document.getElementById("trackActionMessage");

    if (!modal || !icon || !titleEl || !messageEl) {
      console.log(`[track:${type}]`, title, message);
      return;
    }

    modal.classList.add("show");
    icon.className = `track-action-icon ${type === "warning" ? "warning" : ""}`;

    icon.innerHTML =
      type === "warning"
        ? `<i class="fa-solid fa-triangle-exclamation"></i>`
        : `<i class="fa-solid fa-check"></i>`;

    titleEl.textContent = title;
    messageEl.textContent = message;
  }

  function hideTrackActionModal() {
    const modal = document.getElementById("trackActionModal");
    if (modal) modal.classList.remove("show");
  }

  function reorderLatestOrder() {
    if (!latestOrder || !latestOrder.items || !latestOrder.items.length) {
      showTrackActionModal(
        "warning",
        "No items to reorder",
        "This order does not have saved items available for reorder."
      );

      setTimeout(hideTrackActionModal, 1800);
      return;
    }

    const items = latestOrder.items.map((item) => ({
      id: String(item.id || item.product_id || ""),
      name: item.name || item.product_name || "Unnamed Item",
      price: Number(item.price || item.unit_price || 0),
      image_url: item.image_url || item.image || "",
      quantity: Number(item.quantity || 1),
      restaurant_id: String(item.restaurant_id || latestOrder.restaurantId || ""),
      restaurant_name:
        item.restaurant_name || latestOrder.restaurantName || "Spicy Grill",
    }));

    localStorage.setItem("foodDeliveryCartItems", JSON.stringify(items));

    const count = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    localStorage.setItem("foodDeliveryCartCount", String(count));

    if (typeof window.updateCartCount === "function") {
      window.updateCartCount();
    }

    showTrackActionModal(
      "success",
      "Added back to cart",
      "Your previous order has been added to cart. Opening cart now."
    );

    setTimeout(() => {
      window.location.href = "cart.html";
    }, 1300);
  }

  function goBackToDashboard() {
    window.location.href = "dashboard.html";
  }

  function openRiderMessagePlaceholder() {
    showTrackActionModal(
      "warning",
      "Rider chat coming soon",
      "For now, please call the rider or contact FoodExpress support for urgent delivery help."
    );

    setTimeout(hideTrackActionModal, 2200);
  }

  function handleTrackPageAnchorScroll() {
    const params = new URLSearchParams(window.location.search);
    const focusFromUrl = params.get("focus");
    const focusFromHash = String(window.location.hash || "").replace("#", "");
    const focusFromSession = sessionStorage.getItem("foodExpressTrackFocus");

    const target = focusFromUrl || focusFromHash || focusFromSession;

    if (!target) return;

    let attempts = 0;

    const scrollTimer = setInterval(() => {
      attempts++;

      let targetElement = null;

      if (target === "rider") {
        targetElement = document.getElementById("riderInfoCard");
      }

      if (target === "summary") {
        targetElement =
          document.querySelector(".summary-title") ||
          document.getElementById("summaryItems");
      }

      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        targetElement.style.boxShadow =
          "0 0 0 5px rgba(239, 68, 68, 0.18), 0 18px 40px rgba(15,23,42,0.10)";

        setTimeout(() => {
          targetElement.style.boxShadow = "";
        }, 2000);

        sessionStorage.removeItem("foodExpressTrackFocus");
        clearInterval(scrollTimer);
      }

      if (attempts >= 12) {
        clearInterval(scrollTimer);
      }
    }, 300);
  }

  function focusTrackSection(target = "rider") {
    sessionStorage.setItem("foodExpressTrackFocus", target);

    setTimeout(() => {
      handleTrackPageAnchorScroll();
    }, 150);
  }

  /* ===============================
     HELPERS
  ================================ */

  function formatStatus(status) {
    const map = {
      pending: "Order Received",
      confirmed: "Restaurant Confirmed",
      preparing: "Preparing",
      rider_assigned: "Rider Assigned",
      ready_for_pickup: "Ready for Pickup",
      picked_up: "Picked Up",
      on_the_way: "On the Way",
      delivered: "Delivered",
    };

    return map[status] || "Order Received";
  }

  function formatPaymentMethod(value) {
    const map = {
      cash: "Cash on Delivery",
      card: "Card Payment",
      digital: "Digital Wallet",
    };

    return map[String(value || "cash").toLowerCase()] || "Cash on Delivery";
  }

  function formatCurrency(amount) {
    return `Rs. ${Number(amount || 0).toFixed(2)}`;
  }

  function formatPlacedTime(timestamp) {
    if (!timestamp) return "Just now";

    const date = parseOrderDate(timestamp);
    if (!date) return "Just now";

    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  /**
   * Parses a timestamp that may come from:
   *   - MySQL: "2026-05-06 13:50:00"          (local server time, no TZ)
   *   - ISO:   "2026-05-06T13:50:00.000Z"     (UTC)
   *   - JS Date object
   *   - epoch millis number
   *
   * MySQL strings have NO timezone marker. Different browsers parse
   * "YYYY-MM-DD HH:MM:SS" inconsistently (some local, some invalid).
   * This helper forces a deterministic local interpretation by
   * converting the space to "T", which all modern browsers treat
   * as local-time when no Z is present.
   */
  function parseOrderDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "number") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    let str = String(value).trim();
    if (!str) return null;

    // Pure date "2026-05-06" — treat as local midnight.
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      str = str + "T00:00:00";
    }

    // MySQL DATETIME: "2026-05-06 13:50:00" → "2026-05-06T13:50:00"
    // (local, no Z, no offset).
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(str)) {
      str = str.replace(" ", "T");
    }

    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatClockTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "--:--";

    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }


  function formatReadableDate(value) {
  const date = parseOrderDate(value);

  if (!date) return "";

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

  return date.toLocaleDateString("en-NP", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}


  function buildDeliveryText(order) {
    const addressParts = [
      order.address,
      order.city,
      order.postalCode || order.postal_code,
    ].filter(Boolean);

    const note =
      order.deliveryNote || order.delivery_note
        ? ` Delivery note: ${order.deliveryNote || order.delivery_note}.`
        : "";

    return `${order.customerName || order.customer_name || "Customer"} • ${
      order.phoneNumber || order.phone || order.phone_number || "No phone"
    } • ${addressParts.join(", ") || "Address not available"}.${note}`;
  }

  function countItems(items) {
    return (items || []).reduce((sum, item) => {
      return sum + Number(item.quantity || 1);
    }, 0);
  }

  function sumSubtotal(items) {
    return (items || []).reduce((sum, item) => {
      return sum + Number(item.price || item.unit_price || 0) * Number(item.quantity || 1);
    }, 0);
  }

  function getInitials(name) {
    const text = String(name || "").trim();
    if (!text) return "R";

    return text
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  window.reorderLatestOrder = reorderLatestOrder;
  window.goBackToDashboard = goBackToDashboard;
  window.openRiderMessagePlaceholder = openRiderMessagePlaceholder;
  window.focusTrackSection = focusTrackSection;

  /* ── Customer cancel order ───────────────────────────────────────────── */

  function showCancelBtn(order) {
    const btn = document.getElementById("cancelOrderBtn");
    if (!btn) return;
    const status = String(order.status || "").toLowerCase();
    // Only show cancel button if order is still pending
    btn.style.display = status === "pending" ? "inline-flex" : "none";
  }

  window.openCancelOrderModal = function () {
    const modal = document.getElementById("cancelOrderModal");
    if (modal) modal.style.display = "flex";
  };

  window.closeCancelOrderModal = function () {
    const modal = document.getElementById("cancelOrderModal");
    if (modal) modal.style.display = "none";
  };

  window.confirmCancelOrder = async function () {
    if (!latestOrder) return;

    const reason = (document.getElementById("cancelReasonInput")?.value || "").trim();
    const btn = document.getElementById("confirmCancelBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Cancelling..."; }

    const canonicalUser = typeof window.getCurrentLoggedInUser === "function"
      ? window.getCurrentLoggedInUser() : null;

    try {
      const resp = await apiRequest(
        "../../backend/controllers/CancellationController.php?action=cancel_order",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id:        latestOrder.id || latestOrder.orderId,
            cancelled_by:    "customer",
            canceller_id:    canonicalUser?.id || null,
            canceller_email: canonicalUser?.email || latestOrder.customerEmail || "",
            reason:          reason,
          }),
        }
      );

      const result = await resp.json();
      window.closeCancelOrderModal();

      if (result.success) {
        // Update local state
        if (latestOrder) latestOrder.status = "cancelled";
        showCancelBtn({ status: "cancelled" });

        // Show refund info if applicable
        let msg = "Your order has been cancelled.";
        if (result.refund_eligible) {
          msg += ` A refund of Rs. ${result.refund_amount} will be processed.`;
        }

        const modal = document.getElementById("trackActionModal");
        const icon  = document.getElementById("trackActionIcon");
        const title = document.getElementById("trackActionTitle");
        const message = document.getElementById("trackActionMessage");

        if (modal && icon && title && message) {
          icon.style.background = "#dcfce7";
          icon.style.color = "#16a34a";
          icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
          title.textContent = "Order cancelled";
          message.textContent = msg;
          modal.style.display = "flex";
          setTimeout(() => { modal.style.display = "none"; }, 4000);
        }
      } else {
        const modal   = document.getElementById("trackActionModal");
        const icon    = document.getElementById("trackActionIcon");
        const title   = document.getElementById("trackActionTitle");
        const message = document.getElementById("trackActionMessage");

        if (modal && icon && title && message) {
          icon.style.background = "#fee2e2";
          icon.style.color = "#dc2626";
          icon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
          title.textContent = "Could not cancel";
          message.textContent = result.message || "Could not cancel order.";
          modal.style.display = "flex";
          setTimeout(() => { modal.style.display = "none"; }, 4000);
        }
      }
    } catch (err) {
      const modal   = document.getElementById("trackActionModal");
      const icon    = document.getElementById("trackActionIcon");
      const title   = document.getElementById("trackActionTitle");
      const message = document.getElementById("trackActionMessage");

      if (modal && icon && title && message) {
        icon.style.background = "#fee2e2";
        icon.style.color = "#dc2626";
        icon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        title.textContent = "Network error";
        message.textContent = "Could not reach server. Please try again.";
        modal.style.display = "flex";
        setTimeout(() => { modal.style.display = "none"; }, 4000);
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Yes, cancel"; }
    }
  };

})();