document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("supportTicketForm");
  const submitBtn = document.getElementById("supportSubmitBtn");
  const statusText = document.getElementById("supportStatus");

  if (!form) return;

  const supportContext = buildSupportContext();

  hydrateSupportForm(supportContext);
  renderSupportContextCard(supportContext);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      user_type: document.getElementById("userType")?.value || "customer",
      user_id: document.getElementById("userId")?.value || "",

      first_name: document.getElementById("firstName")?.value.trim() || "",
      last_name: document.getElementById("lastName")?.value.trim() || "",
      email: document.getElementById("email")?.value.trim() || "",
      phone: document.getElementById("phone")?.value.trim() || "",

      issue_type: document.getElementById("issueType")?.value || "",
      issue_title: document.getElementById("issueTitle")?.value.trim() || "",
      message: document.getElementById("message")?.value.trim() || "",

      related_order_id:
        document.getElementById("relatedOrderId")?.value.trim() || "",
      related_restaurant_id:
        document.getElementById("relatedRestaurantId")?.value || "",
      related_rider_id: document.getElementById("relatedRiderId")?.value || "",

      source_page: supportContext.sourcePage || "logged_contact_page",
    };

    if (
      !payload.first_name ||
      !payload.email ||
      !payload.issue_type ||
      !payload.issue_title ||
      !payload.message
    ) {
      showStatus("Please fill all required fields.", "error");
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;
      showStatus("Sending your support request...", "loading");

      const response = await fetch(
        "../../backend/controllers/SupportTicketController.php",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const text = await response.text();

      let result;
      try {
        result = JSON.parse(text);
      } catch (error) {
        console.error("Raw server response:", text);
        throw new Error("Server did not return valid JSON.");
      }

      if (!result.success) {
        showStatus(result.message || "Could not send your message.", "error");
        return;
      }

      showStatus(
        `Message sent successfully. Reference number: ${result.ticket_number}.`,
        "success"
      );

      cacheLatestSupportTicket({
        ...payload,
        ticket_number: result.ticket_number || "",
        created_at: new Date().toISOString(),
      });

      form.reset();

      hydrateSupportForm(supportContext);
      renderSupportContextCard(supportContext);
    } catch (error) {
      console.error("Contact support error:", error);
      showStatus(
        error.message || "Something went wrong while sending your message.",
        "error"
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Message`;
    }
  });

  function buildSupportContext() {
    const params = new URLSearchParams(window.location.search);

    const orderFromUrl =
      params.get("order") ||
      params.get("order_number") ||
      params.get("order_id") ||
      "";

    const issueFromUrl = params.get("issue") || "";
    const sourceFromUrl = params.get("source") || "";

    const lastOrder = readJson("lastOrder", null);
    const latestOrder = readJson("latestOrder", null);
    const allOrders = readJson("foodExpressOrders", []);

    const matchedOrder = findSupportOrder(orderFromUrl, latestOrder, lastOrder, allOrders);

    const profile = getLoggedInProfile();

    const orderNumber =
      orderFromUrl ||
      matchedOrder?.orderNumber ||
      matchedOrder?.order_number ||
      matchedOrder?.orderId ||
      matchedOrder?.order_id ||
      matchedOrder?.id ||
      "";

    return {
      order: matchedOrder,
      orderNumber,
      issueFromUrl,
      sourcePage: sourceFromUrl || (orderNumber ? "track_order_support" : "logged_contact_page"),

      customerName:
        matchedOrder?.customerName ||
        matchedOrder?.customer_name ||
        profile.name ||
        "",

      customerEmail:
        matchedOrder?.customerEmail ||
        matchedOrder?.customer_email ||
        profile.email ||
        "",

      customerPhone:
        matchedOrder?.phoneNumber ||
        matchedOrder?.phone_number ||
        matchedOrder?.phone ||
        profile.phone ||
        "",

      restaurantId:
        matchedOrder?.restaurantId ||
        matchedOrder?.restaurant_id ||
        "",

      restaurantName:
        matchedOrder?.restaurantName ||
        matchedOrder?.restaurant_name ||
        "Restaurant",

      riderId:
        matchedOrder?.riderId ||
        matchedOrder?.rider_id ||
        "",

      riderName:
        matchedOrder?.riderName ||
        matchedOrder?.rider_name ||
        "",

      orderStatus:
        matchedOrder?.status ||
        "",

      deliveryStatus:
        matchedOrder?.delivery_status ||
        matchedOrder?.deliveryStatus ||
        "",
    };
  }

  function hydrateSupportForm(context) {
    const firstNameInput = document.getElementById("firstName");
    const lastNameInput = document.getElementById("lastName");
    const emailInput = document.getElementById("email");
    const phoneInput = document.getElementById("phone");
    const issueTypeInput = document.getElementById("issueType");
    const issueTitleInput = document.getElementById("issueTitle");
    const messageInput = document.getElementById("message");
    const relatedOrderInput = document.getElementById("relatedOrderId");

    const userTypeInput = document.getElementById("userType");
    const userIdInput = document.getElementById("userId");
    const restaurantIdInput = document.getElementById("relatedRestaurantId");
    const riderIdInput = document.getElementById("relatedRiderId");

    const nameParts = splitName(context.customerName);

    if (userTypeInput) userTypeInput.value = "customer";
    if (userIdInput) userIdInput.value = getCurrentUserId();

    if (firstNameInput && !firstNameInput.value) {
      firstNameInput.value = nameParts.first || "Customer";
    }

    if (lastNameInput && !lastNameInput.value) {
      lastNameInput.value = nameParts.last || "";
    }

    if (emailInput && !emailInput.value) {
      emailInput.value = context.customerEmail || "";
    }

    if (phoneInput && !phoneInput.value) {
      phoneInput.value = context.customerPhone || "";
    }

    if (relatedOrderInput && context.orderNumber) {
      relatedOrderInput.value = context.orderNumber;
    }

    if (restaurantIdInput) restaurantIdInput.value = context.restaurantId || "";
    if (riderIdInput) riderIdInput.value = context.riderId || "";

    if (issueTypeInput && !issueTypeInput.value) {
      issueTypeInput.value = inferIssueType(context);
    }

    if (issueTitleInput && !issueTitleInput.value) {
      issueTitleInput.value = buildDefaultIssueTitle(context);
    }

    if (messageInput && !messageInput.value) {
      messageInput.value = buildDefaultSupportMessage(context);
    }
  }

  function renderSupportContextCard(context) {
    const roleText = document.getElementById("detectedRoleText");
    const userText = document.getElementById("detectedUserText");

    if (!roleText || !userText) return;

    if (context.orderNumber) {
      roleText.textContent = `Support for order #${context.orderNumber}`;

      const statusText = [
        context.restaurantName && `Restaurant: ${context.restaurantName}`,
        context.riderName && `Rider: ${context.riderName}`,
        context.deliveryStatus && `Delivery status: ${formatStatus(context.deliveryStatus)}`,
      ]
        .filter(Boolean)
        .join(" • ");

      userText.textContent =
        statusText ||
        "We detected this request from your order tracking page.";
      return;
    }

    roleText.textContent = "Customer support";
    userText.textContent =
      "Send us your issue and our support team will review it soon.";
  }

  function inferIssueType(context) {
    const issue = String(context.issueFromUrl || "").toLowerCase();

    if (issue.includes("refund") || issue.includes("payment")) {
      return "payment_refund";
    }

    if (issue.includes("missing") || issue.includes("wrong")) {
      return "missing_item";
    }

    if (issue.includes("delay") || issue.includes("late")) {
      return "delivery_delay";
    }

    if (issue.includes("reward") || issue.includes("coupon")) {
      return "rewards";
    }

    if (context.orderNumber) {
      const deliveryStatus = String(context.deliveryStatus || "").toLowerCase();

      if (deliveryStatus === "delivered") return "order_issue";
      if (["assigned", "picked_up", "on_the_way"].includes(deliveryStatus)) {
        return "delivery_delay";
      }

      return "order_issue";
    }

    return "";
  }

  function buildDefaultIssueTitle(context) {
    if (!context.orderNumber) return "";

    const deliveryStatus = String(context.deliveryStatus || "").toLowerCase();

    if (deliveryStatus === "delivered") {
      return `Help with delivered order #${context.orderNumber}`;
    }

    if (deliveryStatus === "on_the_way") {
      return `Delivery help for order #${context.orderNumber}`;
    }

    return `Support request for order #${context.orderNumber}`;
  }

  function buildDefaultSupportMessage(context) {
    if (!context.orderNumber) return "";

    const lines = [
      `Hi FoodExpress Support,`,
      ``,
      `I need help with order #${context.orderNumber}.`,
    ];

    if (context.restaurantName) {
      lines.push(`Restaurant: ${context.restaurantName}`);
    }

    if (context.riderName) {
      lines.push(`Rider: ${context.riderName}`);
    }

    if (context.orderStatus || context.deliveryStatus) {
      lines.push(
        `Current status: ${formatStatus(context.orderStatus || "pending")} / ${formatStatus(
          context.deliveryStatus || "searching"
        )}`
      );
    }

    lines.push(``);
    lines.push(`Issue details: `);

    return lines.join("\n");
  }

  function findSupportOrder(orderNumber, latestOrder, lastOrder, allOrders) {
    const orders = [];

    if (latestOrder) orders.push(latestOrder);
    if (lastOrder) orders.push(lastOrder);
    if (Array.isArray(allOrders)) orders.push(...allOrders);

    if (!orders.length) return null;

    if (orderNumber) {
      const matched = orders.find((order) => {
        return (
          String(order?.orderNumber || "") === String(orderNumber) ||
          String(order?.order_number || "") === String(orderNumber) ||
          String(order?.orderId || "") === String(orderNumber) ||
          String(order?.order_id || "") === String(orderNumber) ||
          String(order?.id || "") === String(orderNumber)
        );
      });

      if (matched) return matched;
    }

    return orders[0] || null;
  }

  function getLoggedInProfile() {
    const profileFromGlobal =
      typeof window.getSavedUserProfile === "function"
        ? window.getSavedUserProfile()
        : {};

    const userProfile = readJson("userProfile", {});
    const currentUser = readJson("currentUser", {});
    const loggedInUser = readJson("loggedInUser", {});
    const authUser = readJson("foodExpressAuthUser", {});
    const foodExpressProfile = readJson("foodExpressUserProfile", {});

    const profile = {
      ...authUser,
      ...loggedInUser,
      ...currentUser,
      ...foodExpressProfile,
      ...userProfile,
      ...profileFromGlobal,
    };

    const fallbackEmail =
      localStorage.getItem("userEmail") ||
      localStorage.getItem("pendingVerificationEmail") ||
      localStorage.getItem("foodExpressUserEmail") ||
      "";

    const fallbackName =
      localStorage.getItem("userName") ||
      localStorage.getItem("pendingVerificationName") ||
      localStorage.getItem("foodExpressUserName") ||
      getNameFromEmail(fallbackEmail) ||
      "";

    return {
      id:
        profile.id ||
        profile.user_id ||
        localStorage.getItem("userId") ||
        localStorage.getItem("foodExpressUserId") ||
        "",

      name:
        profile.name ||
        profile.full_name ||
        profile.fullName ||
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        fallbackName ||
        "",

      email:
        profile.email ||
        profile.user_email ||
        profile.email_address ||
        fallbackEmail ||
        "",

      phone:
        profile.phone ||
        profile.phone_number ||
        localStorage.getItem("userPhone") ||
        "",
    };
  }

  function getCurrentUserId() {
    return getLoggedInProfile().id || "";
  }

  function splitName(name) {
    const clean = String(name || "").trim();

    if (!clean) {
      return {
        first: "",
        last: "",
      };
    }

    const parts = clean.split(/\s+/);

    return {
      first: parts[0] || "",
      last: parts.slice(1).join(" "),
    };
  }

  function formatStatus(value) {
    const clean = String(value || "")
      .replace(/_/g, " ")
      .trim();

    if (!clean) return "Not available";

    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function cacheLatestSupportTicket(ticket) {
    const saved = readJson("foodExpressSupportTickets", []);
    const list = Array.isArray(saved) ? saved : [];

    list.unshift(ticket);

    localStorage.setItem(
      "foodExpressSupportTickets",
      JSON.stringify(list.slice(0, 20))
    );
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function getNameFromEmail(email) {
    const clean = String(email || "").trim();

    if (!clean.includes("@")) return "";

    return clean
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function showStatus(message, type) {
    if (!statusText) return;

    statusText.textContent = message;
    statusText.className = "";

    if (type === "success") {
      statusText.classList.add("support-status-success");
    } else if (type === "error") {
      statusText.classList.add("support-status-error");
    } else if (type === "loading") {
      statusText.classList.add("support-status-loading");
    }
  }
});