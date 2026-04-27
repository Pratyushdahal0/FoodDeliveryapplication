/* ================= FOOD EXPRESS RIDER SUPPORT ================= */

const STORAGE_KEY = "foodExpressSupportTickets";
const EARNINGS_KEY = "riderEarningsData";
const SUPPORT_SETTINGS_KEY = "foodExpressSupportSettings";
const ADJUSTMENT_REQUESTS_KEY = "foodExpressAdjustmentRequests";

let tickets = [];
let activeTicketId = null;
let liveSimulationStarted = false;

let supportSettings = {
  agentType: "ai", // ai | human
  personality: "friendly" // friendly | fast | strict
};

/* ================= DEFAULT DATA ================= */

const defaultTickets = [
  {
    id: "TCK-1001",
    title: "New support request",
    routeType: "general",
    status: "open",
    lifecycle: "open",
    priority: "medium",
    unread: false,
    createdAt: Date.now(),
    messages: [
      {
        sender: "agent",
        text: "Hi rider, welcome to FoodExpress Support. How can I help you today?",
        time: new Date().toISOString()
      }
    ]
  }
];

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", () => {
  loadTickets();
  loadSettings();

  if (!activeTicketId && tickets.length > 0) {
    activeTicketId = tickets[0].id;
  }

  renderTickets();
  renderActiveChat();
  bindEvents();
  renderSuggestions(["Check payout", "Pending earnings", "Escalate"]);
  updateSupportModeUI();
  updateNotificationCount();

  startLiveSimulation();
});

/* ================= STORAGE ================= */

function loadTickets() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    tickets = JSON.parse(saved).map((ticket) => ({
      routeType: ticket.routeType || "general",
      status: ticket.status || "open",
      lifecycle: ticket.lifecycle || (ticket.status === "closed" ? "closed" : "open"),
      priority: ticket.priority || "medium",
      unread: Boolean(ticket.unread),
      messages: Array.isArray(ticket.messages) ? ticket.messages : [],
      ...ticket
    }));
  } else {
    tickets = defaultTickets;
    saveTickets();
  }
}

function saveTickets() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

function loadSettings() {
  const saved = localStorage.getItem(SUPPORT_SETTINGS_KEY);

  if (saved) {
    supportSettings = {
      ...supportSettings,
      ...JSON.parse(saved)
    };
  }
}

function saveSettings() {
  localStorage.setItem(SUPPORT_SETTINGS_KEY, JSON.stringify(supportSettings));
}

/* ================= EVENTS ================= */

function bindEvents() {
  const sendBtn = document.getElementById("sendMessageBtn");
  const input = document.getElementById("messageInput");
  const newTicketBtn = document.getElementById("newTicketBtn");
  const closeTicketBtn = document.getElementById("closeTicketBtn");

  if (sendBtn) {
    sendBtn.addEventListener("click", () => sendMessage());
  }

  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        sendMessage();
      }
    });
  }

  if (newTicketBtn) {
    newTicketBtn.addEventListener("click", () => {
      createNewTicket();
    });
  }

  if (closeTicketBtn) {
    closeTicketBtn.addEventListener("click", closeActiveTicket);
  }

  bindQuickReplies();
  bindAgentSwitching();
  bindPersonalitySwitching();
}

function bindQuickReplies() {
  document.querySelectorAll(".quick-reply, .suggestion-chip").forEach((btn) => {
    btn.onclick = () => {
      const message = btn.dataset.message || btn.textContent.trim();
      sendMessage(message);
    };
  });
}

function bindAgentSwitching() {
  document.querySelectorAll(".agent-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.agent === "human") {
        switchToHumanAgent(false);
      } else {
        switchToAIAgent();
      }
    });
  });
}

function bindPersonalitySwitching() {
  document.querySelectorAll(".personality-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      supportSettings.personality = btn.dataset.personality;
      saveSettings();
      updateSupportModeUI();

      const ticket = getActiveTicket();
      if (ticket && ticket.status !== "closed") {
        addSystemMessage(
          ticket.id,
          `Reply style changed to ${capitalize(supportSettings.personality)} mode.`
        );
      }
    });
  });
}

/* ================= UI MODE UPDATE ================= */

function updateSupportModeUI() {
  const agentText = document.getElementById("currentAgentText");
  const modeText = document.getElementById("currentModeText");
  const statusText = document.getElementById("currentStatusText");
  const agentStatusText = document.getElementById("agentStatusText");
  const notice = document.getElementById("supportModeNotice");
  const avatar = document.getElementById("activeAgentAvatar");
  const typingText = document.getElementById("typingText");
  const avgReplyText = document.getElementById("avgReplyText");

  const agentName =
    supportSettings.agentType === "human" ? "Human Agent" : "FoodExpress AI";

  if (agentText) agentText.textContent = agentName;
  if (modeText) modeText.textContent = capitalize(supportSettings.personality);
  if (statusText) statusText.textContent = "Online";
  if (agentStatusText) agentStatusText.textContent = `${agentName} Online`;

  if (avgReplyText) {
    avgReplyText.textContent = supportSettings.agentType === "human" ? "6 sec" : "2 sec";
  }

  if (notice) {
    notice.textContent =
      supportSettings.agentType === "human"
        ? "Human support simulation is handling this ticket. Admin approval is required for payout changes."
        : "FoodExpress AI can help instantly, but payout adjustments require admin review.";
  }

  if (typingText) {
    typingText.textContent =
      supportSettings.agentType === "human"
        ? "Human agent is typing..."
        : "AI agent is typing...";
  }

  if (avatar) {
    avatar.innerHTML =
      supportSettings.agentType === "human"
        ? `<i class="fa-solid fa-user-tie"></i>`
        : `<i class="fa-solid fa-robot"></i>`;
  }

  document.querySelectorAll(".agent-toggle").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.agent === supportSettings.agentType);
  });

  document.querySelectorAll(".personality-chip").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.dataset.personality === supportSettings.personality
    );
  });

  updateQualityPanel(getActiveTicket());
  renderActiveChat();
}

/* ================= TICKET RENDER ================= */

function renderTickets() {
  const ticketList = document.getElementById("ticketList");
  if (!ticketList) return;

  ticketList.innerHTML = "";

  tickets.forEach((ticket) => {
    const lastMessage = ticket.messages[ticket.messages.length - 1];

    const card = document.createElement("div");
    card.className = `
      ticket-card
      ${ticket.id === activeTicketId ? "active" : ""}
      ${ticket.unread ? "unread" : ""}
    `;

    card.innerHTML = `
      <h4>${escapeHTML(ticket.title)}</h4>
      <p>${lastMessage ? escapeHTML(lastMessage.text) : "No messages yet"}</p>

      <div class="ticket-meta">
        <span class="ticket-time">${formatTime(lastMessage?.time)}</span>
        <span class="notification-dot"></span>
      </div>
    `;

    card.addEventListener("click", () => {
      activeTicketId = ticket.id;
      ticket.unread = false;

      saveTickets();
      renderTickets();
      renderActiveChat();
      updateNotificationCount();
      updateQualityPanel(ticket);
    });

    ticketList.appendChild(card);
  });
}

/* ================= CHAT RENDER ================= */

function renderActiveChat() {
  const ticket = getActiveTicket();
  if (!ticket) return;

  const title = document.getElementById("activeTicketTitle");
  const subtitle = document.getElementById("activeTicketSubtitle");
  const badge = document.getElementById("ticketStatusBadge");
  const priorityBadge = document.getElementById("ticketPriorityBadge");
  const chatMessages = document.getElementById("chatMessages");

  const agentName =
    supportSettings.agentType === "human" ? "Human Agent" : "FoodExpress AI";

  if (title) title.textContent = ticket.title;

  if (subtitle) {
    subtitle.textContent = `Ticket ${ticket.id} • ${agentName} • ${formatLifecycle(ticket.lifecycle)}`;
  }

  if (badge) {
    if (ticket.status === "open") {
      badge.textContent = formatLifecycle(ticket.lifecycle).toUpperCase();
      badge.className = "status-badge active";
    } else {
      badge.textContent = "CLOSED";
      badge.className = "status-badge closed";
    }
  }

  if (priorityBadge) {
    updateChatNotice(ticket);
    const priority = ticket.priority || "medium";
    priorityBadge.textContent = priority.toUpperCase();
    priorityBadge.className = `priority ${priority}`;
  }

  if (!chatMessages) return;

  chatMessages.innerHTML = "";

  ticket.messages.forEach((message) => {
    const row = document.createElement("div");
    row.className = `message-row ${message.sender}`;

    const statusHTML =
      message.sender === "rider"
        ? `<span class="message-status">${getMessageStatusIcon(message.status)}</span>`
        : "";

    row.innerHTML = `
      <div class="message-bubble">
        ${escapeHTML(message.text)}
        <span class="message-time">${formatTime(message.time)}</span>
        ${statusHTML}
      </div>
    `;

    chatMessages.appendChild(row);
  });

  scrollToBottom();
  renderAIStateCard(ticket);
}
function renderAIStateCard(ticket) {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages || !ticket || !ticket.aiAnalysis) return;

  const oldCard = document.querySelector(".ai-state-card");
  if (oldCard) oldCard.remove();

  const analysis = ticket.aiAnalysis;

  const shouldShow =
    analysis.risk === "critical" ||
    analysis.recommendedAction === "admin_review" ||
    analysis.recommendedAction === "human_handoff" ||
    ticket.lifecycle === "waiting_admin" ||
    ticket.lifecycle === "under_review";

  if (!shouldShow) return;

  const card = document.createElement("div");

  const isSafety = analysis.risk === "critical";
  const isAdmin = analysis.recommendedAction === "admin_review" || ticket.lifecycle === "waiting_admin";

  card.className = `ai-state-card ${isSafety ? "safety" : ""} ${isAdmin ? "admin" : ""}`;

  const tagsHTML = (analysis.tags || [])
    .map((tag) => {
      const dangerTags = ["safety", "urgent", "human-review"];
      const warningTags = ["admin-review", "payout-review"];

      const tagClass = dangerTags.includes(tag)
        ? "danger"
        : warningTags.includes(tag)
          ? "warning"
          : "";

      return `<span class="ai-tag ${tagClass}">${escapeHTML(tag)}</span>`;
    })
    .join("");

  card.innerHTML = `
    <strong>${isSafety ? "Safety incident detected" : "AI review status"}</strong>
    <p>${escapeHTML(analysis.summary)}</p>
    <p><strong>Next action:</strong> ${escapeHTML(analysis.nextBestAction)}</p>
    <div class="ai-tags">${tagsHTML}</div>
  `;

  const chatPanel = document.querySelector(".chat-panel");
  const notice = document.querySelector(".chat-notice");

  if (notice && notice.parentNode) {
    notice.insertAdjacentElement("afterend", card);
  }

  if (chatPanel) {
    chatPanel.classList.toggle("safety-mode", isSafety);
    chatPanel.classList.toggle("admin-review-mode", isAdmin && !isSafety);
  }
}

/* ================= GETTERS ================= */

function getActiveTicket() {
  return tickets.find((ticket) => ticket.id === activeTicketId);
}

function getTicketById(ticketId) {
  return tickets.find((ticket) => ticket.id === ticketId);
}

/* ================= IMPORTANT FIX: ONE FOCUSED CHAT ================= */

function ensureActiveTicket(messageText = "") {
  let ticket = getActiveTicket();

  if (!ticket || shouldCreateNewTicketForTopicSwitch(ticket, messageText)) {
    const route = detectTicketRoute(messageText);
    ticket = createRoutedTicket(route);

    addSystemMessage(
      ticket.id,
      `New ${route.title.toLowerCase()} ticket created for this issue.`
    );
  }

  activeTicketId = ticket.id;
  ticket.unread = false;

  return ticket;
}
function shouldCreateNewTicketForTopicSwitch(ticket, messageText) {
  if (!ticket || ticket.status === "closed") return true;

  const newRoute = detectTicketRoute(messageText);
  const currentRoute = ticket.routeType || "general";

  const isCurrentSafetyTicket =
    ticket.aiAnalysis?.risk === "critical" ||
    currentRoute === "escalation" ||
    ticket.lifecycle === "under_review";

  const isAdminReviewTicket =
    ticket.lifecycle === "waiting_admin";

  // Safety ticket should stay focused on safety only
  if (isCurrentSafetyTicket && newRoute.type === "payment") {
    return true;
  }

  // Admin payout review should stay focused on payout only
  if (isAdminReviewTicket && newRoute.type !== "payment") {
    return true;
  }

  // General ticket can become anything
  if (currentRoute === "general") return false;

  // If route changes between major categories, create a new ticket
  const majorRoutes = ["payment", "delay", "customer", "escalation"];

  if (
    majorRoutes.includes(currentRoute) &&
    majorRoutes.includes(newRoute.type) &&
    currentRoute !== newRoute.type
  ) {
    return true;
  }

  return false;
}
/* ================= SEND MESSAGE ================= */

function sendMessage(customMessage = null) {
  const input = document.getElementById("messageInput");
  const text = customMessage || input?.value.trim();

  if (!text) return;

  const ticket = ensureActiveTicket(text);

  const riderMessage = {
    sender: "rider",
    text,
    status: "sent",
    time: new Date().toISOString()
  };

  ticket.messages.push(riderMessage);

  autoUpdateTicketDetails(ticket, text);

  if (input && !customMessage) input.value = "";

  saveTickets();
  renderTickets();
  renderActiveChat();
  updateQualityPanel(ticket);

  simulateMessageStatus(riderMessage);

  if (isAdjustmentRequest(text)) {
    handleAdjustmentLifecycle(ticket, text);
    return;
  }

  fakeAgentReply(text);
}

/* ================= SMART ROUTING ONLY FOR NEW TICKETS ================= */

function detectTicketRoute(message) {
  const lower = message.toLowerCase();

  if (
    lower.includes("payment") ||
    lower.includes("earning") ||
    lower.includes("payout") ||
    lower.includes("withdraw") ||
    lower.includes("bank") ||
    lower.includes("adjust earnings") ||
    lower.includes("missing money") ||
    lower.includes("not paid")
  ) {
    return {
      type: "payment",
      title: "Payment adjustment request",
      priority: "medium",
      intro: "Hi, I can help with your payout or earnings issue. Any payout adjustment will require admin review."
    };
  }

  if (
    lower.includes("delay") ||
    lower.includes("late") ||
    lower.includes("traffic") ||
    lower.includes("pickup") ||
    lower.includes("restaurant waiting")
  ) {
    return {
      type: "delay",
      title: "Delivery delay issue",
      priority: "high",
      intro: "Hi, I can help with your delivery delay. Please share what happened."
    };
  }

  if (
    lower.includes("customer") ||
    lower.includes("not responding") ||
    lower.includes("call") ||
    lower.includes("address") ||
    lower.includes("wrong location")
  ) {
    return {
      type: "customer",
      title: "Customer support issue",
      priority: "medium",
      intro: "Hi, I can help with the customer issue. Please explain the situation."
    };
  }

  if (
    lower.includes("escalate") ||
    lower.includes("human") ||
    lower.includes("agent") ||
    lower.includes("urgent") ||
    lower.includes("unsafe") ||
    lower.includes("emergency")
  ) {
    return {
      type: "escalation",
      title: "Escalation request",
      priority: "high",
      intro: "Hi, I have created an escalation ticket. Please describe the issue clearly."
    };
  }

  return {
    type: "general",
    title: "New support request",
    priority: "medium",
    intro: "Hi, you are connected with FoodExpress Support. Please explain your issue."
  };
}

function createRoutedTicket(route) {
  const newTicket = {
    id: `TCK-${Math.floor(1000 + Math.random() * 9000)}`,
    title: route.title,
    routeType: route.type,
    status: "open",
    lifecycle: "open",
    priority: route.priority,
    unread: false,
    createdAt: Date.now(),
    messages: [
      {
        sender: "agent",
        text: route.intro,
        time: new Date().toISOString()
      }
    ]
  };

  tickets.unshift(newTicket);
  activeTicketId = newTicket.id;

  saveTickets();

  return newTicket;
}

/* ================= AUTO RENAME + PRIORITY ================= */

function autoUpdateTicketDetails(ticket, message) {
  const lower = message.toLowerCase();

  const oldTitle = ticket.title;
  const oldPriority = ticket.priority;
  const oldRouteType = ticket.routeType;

  const detected = detectTicketRoute(message);

  if (ticket.routeType === "general") {
    ticket.routeType = detected.type;
  }

  ticket.title = generateTicketTitle(lower, ticket);
  ticket.priority = generateTicketPriority(lower, ticket);

  if (oldTitle !== ticket.title) {
    addSilentSystemNote(ticket, `Ticket renamed to "${ticket.title}".`);
  }

  if (oldPriority !== ticket.priority) {
    addSilentSystemNote(ticket, `Priority updated to ${ticket.priority.toUpperCase()}.`);
  }

  if (oldRouteType !== ticket.routeType && oldRouteType === "general") {
    addSilentSystemNote(ticket, `Ticket category updated to ${ticket.routeType}.`);
  }

  updateQualityPanel(ticket);
  const context = getTicketContext(ticket, message);
const intent = detectIntent(context);
const sentiment = detectSentiment(context);
const risk = detectSupportRisk(context);
const confidence = calculateAIConfidence(intent, context, risk);

ticket.aiAnalysis = buildAIAnalysis({
  intent,
  sentiment,
  risk,
  confidence,
  ticket
});

ticket.aiConfidence = confidence;
ticket.intent = intent;
ticket.risk = risk;
ticket.sentiment = sentiment;
}

function generateTicketTitle(lower, ticket) {
  if (lower.includes("adjust earnings")) return "Adjustment review request";

  if (
    lower.includes("payout pending") ||
    lower.includes("pending payout") ||
    lower.includes("withdraw") ||
    lower.includes("bank") ||
    lower.includes("not paid") ||
    lower.includes("missing money")
  ) {
    return "Pending payout review";
  }

  if (
    lower.includes("payment") ||
    lower.includes("earning") ||
    lower.includes("payout")
  ) {
    return "Payment and earnings issue";
  }

  if (
    lower.includes("customer not responding") ||
    lower.includes("not responding") ||
    lower.includes("customer unavailable")
  ) {
    return "Customer not responding";
  }

  if (
    lower.includes("wrong address") ||
    lower.includes("wrong location") ||
    lower.includes("address")
  ) {
    return "Customer address issue";
  }

  if (
    lower.includes("delay") ||
    lower.includes("late") ||
    lower.includes("traffic")
  ) {
    return "Delivery delay support";
  }

  if (
    lower.includes("restaurant waiting") ||
    lower.includes("pickup")
  ) {
    return "Restaurant pickup delay";
  }

  if (
    lower.includes("escalate") ||
    lower.includes("urgent") ||
    lower.includes("human") ||
    lower.includes("unsafe") ||
    lower.includes("emergency")
  ) {
    return "Urgent escalation request";
  }

  return ticket.title || "New support request";
}

function generateTicketPriority(lower, ticket) {
  if (
    lower.includes("urgent") ||
    lower.includes("accident") ||
    lower.includes("unsafe") ||
    lower.includes("threat") ||
    lower.includes("emergency") ||
    lower.includes("escalate")
  ) {
    return "high";
  }

  if (
    lower.includes("customer not responding") ||
    lower.includes("not responding") ||
    lower.includes("delay") ||
    lower.includes("late") ||
    lower.includes("wrong address") ||
    lower.includes("wrong location")
  ) {
    return "high";
  }

  if (
    lower.includes("payment") ||
    lower.includes("earning") ||
    lower.includes("payout") ||
    lower.includes("withdraw") ||
    lower.includes("adjust earnings") ||
    lower.includes("missing money") ||
    lower.includes("not paid")
  ) {
    return "medium";
  }

  return ticket.priority || "medium";
}

/* ================= ADJUSTMENT LIFECYCLE ================= */

function isAdjustmentRequest(text) {
  const lower = text.toLowerCase();

  return (
    lower.includes("adjust earnings") ||
    lower.includes("missing money") ||
    lower.includes("not paid") ||
    lower.includes("pay adjustment") ||
    lower.includes("earning adjustment")
  );
}

function handleAdjustmentLifecycle(ticket, userText) {
  const existingPending = getPendingAdjustmentForTicket(ticket.id);

  if (existingPending) {
    addAgentMessage(
      ticket.id,
      formatReply(
        `You already have adjustment request ${existingPending.id} pending admin review. I cannot submit another request until this one is reviewed.`,
        userText
      )
    );

    renderSuggestions(["Check review status", "Switch to human", "Close ticket"]);
    return;
  }

  const amount = estimateAdjustmentAmount(userText);
  const fraudRisk = detectFraudRisk(amount);

  ticket.lifecycle = "waiting_admin";
  ticket.aiAnalysis = buildAIAnalysis({
  intent: "payment",
  sentiment: detectSentiment(userText.toLowerCase()),
  risk: fraudRisk === "high" ? "medium" : "low",
  confidence: "high",
  ticket
});
  ticket.priority = fraudRisk === "high" ? "high" : ticket.priority;

  const request = createAdjustmentRequest({
    ticketId: ticket.id,
    amount,
    reason: userText,
    fraudRisk
  });

  addSystemMessage(
    ticket.id,
    `🟡 Adjustment request ${request.id} submitted. Status: Pending admin review.`
  );

  if (fraudRisk === "high") {
    addSystemMessage(ticket.id, "⚠️ Fraud risk: HIGH. Human/admin review required.");
    switchToHumanAgent(true);
  } else {
    addSystemMessage(ticket.id, `Fraud risk: ${fraudRisk.toUpperCase()}. Admin approval required.`);
  }

  addAgentMessage(
    ticket.id,
    formatReply(
      "I have submitted your adjustment request for review. A support admin must approve it before any money is added to your earnings.",
      userText
    )
  );

  renderSuggestions(["Check review status", "Switch to human", "Close ticket"]);
  saveTickets();
  updateQualityPanel(ticket);
}

function createAdjustmentRequest({ ticketId, amount, reason, fraudRisk }) {
  const requests = JSON.parse(localStorage.getItem(ADJUSTMENT_REQUESTS_KEY)) || [];

  const request = {
    id: `ADJ-${Math.floor(1000 + Math.random() * 9000)}`,
    ticketId,
    amount,
    reason,
    fraudRisk,
    status: "pending",
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null
  };

  requests.unshift(request);
  localStorage.setItem(ADJUSTMENT_REQUESTS_KEY, JSON.stringify(requests));

  return request;
}

function getPendingAdjustmentForTicket(ticketId) {
  const requests = JSON.parse(localStorage.getItem(ADJUSTMENT_REQUESTS_KEY)) || [];

  return requests.find((request) => {
    return request.ticketId === ticketId && request.status === "pending";
  });
}

function estimateAdjustmentAmount(text) {
  const match = text.match(/rs\.?\s?(\d+)|(\d+)\s?rs/i);

  if (match) {
    return Number(match[1] || match[2]);
  }

  return 100;
}

function detectFraudRisk(amount) {
  const requests = JSON.parse(localStorage.getItem(ADJUSTMENT_REQUESTS_KEY)) || [];
  const today = new Date().toDateString();

  const todayRequests = requests.filter((req) => {
    return new Date(req.createdAt).toDateString() === today;
  });

  const pendingRequests = requests.filter((req) => req.status === "pending");

  if (todayRequests.length >= 3) return "high";
  if (pendingRequests.length >= 2) return "high";
  if (amount > 500) return "medium";

  return "low";
}

/* ================= ADMIN SIMULATION HELPERS ================= */

function approveAdjustment(requestId, adminName = "Admin") {
  const requests = JSON.parse(localStorage.getItem(ADJUSTMENT_REQUESTS_KEY)) || [];
  const request = requests.find((req) => req.id === requestId);

  if (!request || request.status !== "pending") return;

  request.status = "approved";
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = adminName;

  localStorage.setItem(ADJUSTMENT_REQUESTS_KEY, JSON.stringify(requests));

  adjustEarnings(request.amount);

  const ticket = getTicketById(request.ticketId);

  if (ticket) {
    ticket.lifecycle = "resolved";
    addSystemMessage(ticket.id, `✅ Adjustment ${request.id} approved by ${adminName}.`);
    addAgentMessage(ticket.id, `Approved: Rs. ${request.amount} has been added to your earnings.`);
    saveTickets();
    renderTickets();
    renderActiveChat();
    updateQualityPanel(ticket);
  }
}

function rejectAdjustment(requestId, adminName = "Admin") {
  const requests = JSON.parse(localStorage.getItem(ADJUSTMENT_REQUESTS_KEY)) || [];
  const request = requests.find((req) => req.id === requestId);

  if (!request || request.status !== "pending") return;

  request.status = "rejected";
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = adminName;

  localStorage.setItem(ADJUSTMENT_REQUESTS_KEY, JSON.stringify(requests));

  const ticket = getTicketById(request.ticketId);

  if (ticket) {
    ticket.lifecycle = "resolved";
    addSystemMessage(ticket.id, `❌ Adjustment ${request.id} rejected by ${adminName}.`);
    addAgentMessage(ticket.id, "Your adjustment request was reviewed but could not be approved.");
    saveTickets();
    renderTickets();
    renderActiveChat();
    updateQualityPanel(ticket);
  }
}

/* ================= SMART FAKE AI ================= */

/* ================= PRODUCTION-STYLE FAKE AI ENGINE ================= */

function fakeAgentReply(userMessage) {
  showTyping();

  setTimeout(() => {
    hideTyping();

    const ticket = getActiveTicket();
    if (!ticket) return;

    const aiResult = analyzeSupportMessage(userMessage, ticket);

    // Update ticket based on AI analysis
    ticket.aiConfidence = aiResult.confidence;
    ticket.intent = aiResult.intent;
    ticket.aiConfidence = aiResult.confidence;
ticket.intent = aiResult.intent;
ticket.risk = aiResult.risk;
ticket.sentiment = aiResult.sentiment;

ticket.aiAnalysis = buildAIAnalysis({
  intent: aiResult.intent,
  sentiment: aiResult.sentiment,
  risk: aiResult.risk,
  confidence: aiResult.confidence,
  ticket
});

    if (aiResult.priority) {
      ticket.priority = aiResult.priority;
    }

    if (aiResult.lifecycle) {
      ticket.lifecycle = aiResult.lifecycle;
    }

    if (aiResult.handoffToHuman) {
      switchToHumanAgent(true);
    }

    const reply = formatReply(aiResult.reply, userMessage);
    addAgentMessage(ticket.id, reply);

    renderSuggestions(aiResult.suggestions);
    saveTickets();
    renderTickets();
    renderActiveChat();
    updateQualityPanel(ticket);
  }, getReplyDelay());
}

function analyzeSupportMessage(message, ticket) {
  const lower = message.toLowerCase();
  const context = getTicketContext(ticket, message);

  const intent = detectIntent(context);
  const sentiment = detectSentiment(context);
  const risk = detectSupportRisk(context);
  const confidence = calculateAIConfidence(intent, context, risk);

  const result = {
    intent,
    sentiment,
    risk,
    confidence,
    priority: ticket.priority || "medium",
    lifecycle: ticket.lifecycle || "open",
    handoffToHuman: false,
    reply: "",
    suggestions: ["Check payout", "Pending earnings", "Escalate"]
  };
  ticket.aiAnalysis = buildAIAnalysis({
  intent,
  sentiment,
  risk,
  confidence,
  ticket
});

  // Safety first
  if (risk === "critical") {
    result.priority = "high";
    result.lifecycle = "under_review";
    result.handoffToHuman = true;
    result.confidence = "medium";
    result.reply =
      "This sounds safety-related. Please move to a safe place first. I’m marking this as high priority and handing it to human support simulation.";
    result.suggestions = ["Switch to human", "Mark urgent", "Close ticket"];
    return result;
  }

  // Human escalation
  if (intent === "escalation") {
    result.priority = "high";
    result.lifecycle = "under_review";
    result.handoffToHuman = true;
    result.reply =
      "I understand you want this escalated. I’m moving this ticket to human support simulation so it can be reviewed more carefully.";
    result.suggestions = ["Check review status", "Close ticket"];
    return result;
  }

  // Payout / earnings
  if (intent === "payment") {
    result.priority = "medium";

    if (context.includes("adjust earnings") || context.includes("missing money") || context.includes("not paid")) {
      result.reply =
        "I can help submit an adjustment request, but I cannot add money directly. Any payout correction must be reviewed and approved by an admin.";
      result.suggestions = ["Check review status", "Switch to human", "Close ticket"];
      return result;
    }

    result.reply =
      "I can help with your payout or earnings concern. If the issue needs a balance correction, I’ll submit it for admin review instead of applying it instantly.";
    result.suggestions = ["Pending earnings", "adjust earnings", "Switch to human"];
    return result;
  }

  // Delivery delay
  if (intent === "delay") {
    result.priority = "high";
    result.reply =
      "I understand the delivery delay. Your rating should be protected if the delay was caused by traffic, restaurant waiting time, or customer response issues. Are you still at pickup or already on the way?";
    result.suggestions = ["Customer not responding", "Protect my rating", "Escalate delay issue"];
    return result;
  }

  // Customer issue
  if (intent === "customer") {
    result.priority = "high";
    result.reply =
      "If the customer is not responding, wait for 5 minutes and try calling once. Keep this chat open while you confirm. If it continues, the ticket can be escalated.";
    result.suggestions = ["Can I cancel order?", "Switch to human", "Escalate"];
    return result;
  }

  // Rating issue
  if (intent === "rating") {
    result.priority = "medium";
    result.reply =
      "I can help protect your delivery rating if the issue was outside your control. Please share whether it was caused by traffic, restaurant delay, or customer unavailability.";
    result.suggestions = ["Protect my rating", "Escalate", "Customer not responding"];
    return result;
  }

  // Cancellation issue
  if (intent === "cancel") {
    result.priority = "medium";
    result.reply =
      "I can guide you with cancellation. Please do not cancel unless the customer is unavailable, the address is incorrect, or support confirms the next step.";
    result.suggestions = ["Customer not responding", "Switch to human", "Close ticket"];
    return result;
  }

  // General fallback
  result.reply =
    "I’m reviewing your issue. Please share one more detail, such as whether this is about payment, delivery delay, customer issue, or account support.";
  result.suggestions = ["Payment issue", "Delay issue", "Customer issue"];

  return result;
}

function getTicketContext(ticket, currentMessage) {
  const recentMessages = ticket.messages
    .filter((m) => m.sender === "rider")
    .slice(-4)
    .map((m) => m.text.toLowerCase())
    .join(" ");

  return `${recentMessages} ${currentMessage.toLowerCase()}`;
}

function detectIntent(context) {
  if (
    context.includes("unsafe") ||
    context.includes("danger") ||
    context.includes("threat") ||
    context.includes("accident") ||
    context.includes("emergency")
  ) {
    return "safety";
  }

  if (
    context.includes("human") ||
    context.includes("agent") ||
    context.includes("escalate") ||
    context.includes("not resolved")
  ) {
    return "escalation";
  }

  if (
    context.includes("payment") ||
    context.includes("earning") ||
    context.includes("payout") ||
    context.includes("withdraw") ||
    context.includes("bank") ||
    context.includes("not paid") ||
    context.includes("missing money") ||
    context.includes("adjust earnings")
  ) {
    return "payment";
  }

  if (
    context.includes("delay") ||
    context.includes("late") ||
    context.includes("traffic") ||
    context.includes("pickup") ||
    context.includes("restaurant waiting")
  ) {
    return "delay";
  }

  if (
    context.includes("customer") ||
    context.includes("not responding") ||
    context.includes("wrong address") ||
    context.includes("wrong location") ||
    context.includes("call")
  ) {
    return "customer";
  }

  if (
    context.includes("rating") ||
    context.includes("review") ||
    context.includes("bad rating")
  ) {
    return "rating";
  }

  if (
    context.includes("cancel") ||
    context.includes("cancellation")
  ) {
    return "cancel";
  }

  return "general";
}

function detectSentiment(context) {
  if (
    context.includes("angry") ||
    context.includes("frustrated") ||
    context.includes("annoyed") ||
    context.includes("bad") ||
    context.includes("worried")
  ) {
    return "negative";
  }

  if (
    context.includes("thanks") ||
    context.includes("thank you") ||
    context.includes("okay") ||
    context.includes("resolved")
  ) {
    return "positive";
  }

  return "neutral";
}

function detectSupportRisk(context) {
  if (
    context.includes("unsafe") ||
    context.includes("threat") ||
    context.includes("accident") ||
    context.includes("emergency") ||
    context.includes("danger")
  ) {
    return "critical";
  }

  if (
    context.includes("missing money") ||
    context.includes("not paid") ||
    context.includes("wrong location") ||
    context.includes("customer not responding")
  ) {
    return "medium";
  }

  return "low";
}

function buildAIAnalysis({ intent, sentiment, risk, confidence, ticket }) {
  let recommendedAction = "continue_ai_support";

  if (risk === "critical") {
    recommendedAction = "human_handoff";
  } else if (intent === "payment" && ticket.lifecycle === "waiting_admin") {
    recommendedAction = "admin_review";
  } else if (intent === "escalation") {
    recommendedAction = "human_handoff";
  } else if (confidence === "low") {
    recommendedAction = "ask_more_details";
  }

  return {
    intent,
    sentiment,
    risk,
    confidence,
    recommendedAction,
    lastAnalyzedAt: new Date().toISOString()
  };
}

function generateAgentReply(message) {
  const lower = message.toLowerCase();
  const ticket = getActiveTicket();

  const recentContext = ticket
    ? ticket.messages
        .filter((m) => m.sender === "rider")
        .slice(-3)
        .map((m) => m.text.toLowerCase())
        .join(" ")
    : "";

  const context = `${lower} ${recentContext}`;

  if (supportSettings.agentType === "human") {
    return generateHumanAgentReply(context);
  }

  if (context.includes("check review status")) {
    return getAdjustmentStatusReply(ticket);
  }

  if (context.includes("unsafe") || context.includes("emergency") || context.includes("threat")) {
    return "This sounds serious. I am marking this as high priority and moving it to human support simulation now.";
  }

  if (
    context.includes("payment") ||
    context.includes("earning") ||
    context.includes("payout") ||
    context.includes("not paid")
  ) {
    return "I can help with that. If this requires a payout change, I will submit it for admin review instead of applying money instantly.";
  }

  if (context.includes("delay") || context.includes("late") || context.includes("traffic")) {
    return "I understand the delay. Your rating should be protected if this was outside your control. Are you still at pickup or already on the way?";
  }

  if (context.includes("customer") || context.includes("not responding")) {
    return "If the customer is not responding, wait 5 minutes and try calling once. I can help you mark the customer as unavailable if needed.";
  }

  if (context.includes("escalate") || context.includes("human")) {
    return "I can escalate this to human support simulation now. A human agent will take over this ticket.";
  }

  return "Got it. I am reviewing your issue. Please share one more detail so I can guide you faster.";
}

function generateHumanAgentReply(context) {
  if (context.includes("check review status")) {
    return getAdjustmentStatusReply(getActiveTicket());
  }

  if (context.includes("payment") || context.includes("earning") || context.includes("payout")) {
    return "Human support here. I will review your payout issue carefully. Any adjustment must be approved by admin before it is added.";
  }

  if (context.includes("delay") || context.includes("late")) {
    return "Human support here. Please continue the delivery safely. I will note that the delay was reported from your side.";
  }

  if (context.includes("customer") || context.includes("not responding")) {
    return "Human support here. Please wait 5 minutes, try calling once, and keep this chat open while you confirm.";
  }

  if (context.includes("unsafe") || context.includes("emergency") || context.includes("threat")) {
    return "Human support here. Please prioritise your safety first. Move to a safe place and stop the delivery if needed.";
  }

  return "Human support here. I am checking this now. Please share any extra detail that can help me resolve it.";
}

function getAdjustmentStatusReply(ticket) {
  if (!ticket) return "I cannot find an active ticket right now.";

  const requests = JSON.parse(localStorage.getItem(ADJUSTMENT_REQUESTS_KEY)) || [];

  const related = requests.find((req) => {
    return req.ticketId === ticket.id;
  });

  if (!related) {
    return "No adjustment request is attached to this ticket yet. Type “adjust earnings” only if you want to submit a payout adjustment for admin review.";
  }

  if (related.status === "pending") {
    return `Your adjustment request ${related.id} is still pending admin review.`;
  }

  if (related.status === "approved") {
    return `Your adjustment request ${related.id} was approved. Rs. ${related.amount} was added to your earnings.`;
  }

  return `Your adjustment request ${related.id} was rejected after review.`;
}

/* ================= PERSONALITY ================= */

function formatReply(baseReply, originalMessage) {
  if (supportSettings.personality === "fast") {
    return makeFastReply(baseReply);
  }

  if (supportSettings.personality === "strict") {
    return makeStrictReply(baseReply, originalMessage);
  }

  return makeFriendlyReply(baseReply);
}

function makeFriendlyReply(reply) {
  const starts = [
    "I understand. ",
    "Thanks for sharing that. ",
    "No worries, I can help. ",
    ""
  ];

  return starts[Math.floor(Math.random() * starts.length)] + reply;
}

function makeFastReply(reply) {
  const firstSentence = reply.split(".")[0];

  if (firstSentence.length > 10) {
    return firstSentence + ".";
  }

  return reply;
}

function makeStrictReply(reply, originalMessage) {
  const lower = originalMessage.toLowerCase();

  if (
    lower.includes("unsafe") ||
    lower.includes("emergency") ||
    lower.includes("threat") ||
    lower.includes("accident")
  ) {
    return "Safety policy: move to a safe location first. This ticket is marked high priority and requires human review.";
  }

  return "Support update: " + reply;
}

function shouldSwitchToHuman(message) {
  const lower = message.toLowerCase();

  return (
    lower.includes("human") ||
    lower.includes("agent") ||
    lower.includes("escalate") ||
    lower.includes("unsafe") ||
    lower.includes("emergency") ||
    lower.includes("threat")
  );
}

/* ================= AGENT SWITCHING ================= */

function switchToHumanAgent(auto = false) {
  if (supportSettings.agentType === "human") return;

  supportSettings.agentType = "human";
  saveSettings();
  updateSupportModeUI();

  const ticket = getActiveTicket();

  if (ticket && ticket.status !== "closed") {
    ticket.lifecycle = "under_review";
    ticket.priority = "high";

    addSystemMessage(
      ticket.id,
      auto
        ? "AI handed this ticket to Human Agent simulation."
        : "You switched to Human Agent simulation."
    );

    saveTickets();
    updateQualityPanel(ticket);
  }
}

function switchToAIAgent() {
  supportSettings.agentType = "ai";
  saveSettings();
  updateSupportModeUI();

  const ticket = getActiveTicket();

  if (ticket && ticket.status !== "closed") {
    addSystemMessage(ticket.id, "You switched back to FoodExpress AI.");
  }
}

function getReplyDelay() {
  if (supportSettings.agentType === "human") return 2200 + Math.random() * 1600;
  if (supportSettings.personality === "fast") return 550 + Math.random() * 700;
  if (supportSettings.personality === "strict") return 1000 + Math.random() * 900;

  return 1000 + Math.random() * 1300;
}

/* ================= MESSAGE STATUS ================= */

function simulateMessageStatus(message) {
  setTimeout(() => {
    message.status = "delivered";
    saveTickets();
    renderActiveChat();
  }, 500);

  setTimeout(() => {
    message.status = "seen";
    saveTickets();
    renderActiveChat();
  }, 1200);
}

function getMessageStatusIcon(status) {
  if (status === "seen") return "✓✓ Seen";
  if (status === "delivered") return "✓✓ Delivered";
  return "✓ Sent";
}

/* ================= ADD MESSAGES ================= */

function addAgentMessage(ticketId, text) {
  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.status === "closed") return;

  ticket.messages.push({
    sender: "agent",
    text,
    time: new Date().toISOString()
  });

  if (ticket.id !== activeTicketId) {
    ticket.unread = true;
  }

  saveTickets();
  renderTickets();
  renderActiveChat();
  updateNotificationCount();
  updateQualityPanel(ticket);
}

function addSystemMessage(ticketId, text) {
  const ticket = getTicketById(ticketId);
  if (!ticket) return;

  ticket.messages.push({
    sender: "system",
    text,
    time: new Date().toISOString()
  });

  saveTickets();
  renderTickets();
  renderActiveChat();
  updateQualityPanel(ticket);
}

function addSilentSystemNote(ticket, text) {
  const alreadyAdded = ticket.messages.some((message) => {
    return message.sender === "system" && message.text === text;
  });

  if (alreadyAdded) return;

  ticket.messages.push({
    sender: "system",
    text,
    time: new Date().toISOString()
  });
}

function markTicketUnread(ticketId) {
  const ticket = getTicketById(ticketId);
  if (!ticket) return;

  if (ticket.id !== activeTicketId) {
    ticket.unread = true;
  }

  saveTickets();
  renderTickets();
  updateNotificationCount();
}

/* ================= SUGGESTIONS ================= */

function generateSuggestions(message) {
  const lower = message.toLowerCase();

  if (
    lower.includes("payment") ||
    lower.includes("earning") ||
    lower.includes("payout") ||
    lower.includes("adjust")
  ) {
    return ["Check review status", "Switch to human", "Close ticket"];
  }

  if (lower.includes("delay")) {
    return ["Customer not responding", "Protect my rating", "Escalate delay issue"];
  }

  if (lower.includes("customer")) {
    return ["Customer not responding", "Can I cancel order?", "Switch to human"];
  }

  if (lower.includes("unsafe") || lower.includes("emergency")) {
    return ["Switch to human", "Mark urgent", "Close ticket"];
  }

  return ["Check payout", "Pending earnings", "Escalate"];
}

function renderSuggestions(list) {
  const box = document.querySelector(".smart-suggestions");
  if (!box) return;

  box.innerHTML = "";

  list.forEach((text) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggestion-chip";
    btn.textContent = text;

    btn.addEventListener("click", () => {
      const lower = text.toLowerCase();

      if (lower.includes("switch to human")) {
        switchToHumanAgent(false);
        return;
      }

      if (lower.includes("mark urgent")) {
        const ticket = ensureActiveTicket("urgent");

        ticket.priority = "high";
        ticket.lifecycle = "under_review";

        addSystemMessage(ticket.id, "Ticket manually marked as HIGH priority.");
        saveTickets();
        renderTickets();
        renderActiveChat();
        updateQualityPanel(ticket);
        return;
      }

      if (lower.includes("close ticket")) {
        closeActiveTicket();
        return;
      }

      sendMessage(text);
    });

    box.appendChild(btn);
  });
}

/* ================= EARNINGS ================= */

function adjustEarnings(amount) {
  let earningsData = JSON.parse(localStorage.getItem(EARNINGS_KEY)) || {
    totalEarnings: 0,
    availableBalance: 0,
    lastPayout: "No payout yet",
    adjustments: []
  };

  earningsData.totalEarnings = Number(earningsData.totalEarnings || 0) + amount;
  earningsData.availableBalance = Number(earningsData.availableBalance || 0) + amount;

  earningsData.adjustments.push({
    amount,
    reason: "Admin-approved support adjustment",
    time: new Date().toISOString()
  });

  localStorage.setItem(EARNINGS_KEY, JSON.stringify(earningsData));
}

/* ================= CREATE / CLOSE ================= */

function createNewTicket() {
  const route = {
    type: "general",
    title: "New support request",
    priority: "medium",
    intro: "Hi, you are connected with FoodExpress Support. Please explain your issue."
  };

  const newTicket = createRoutedTicket(route);

  saveTickets();
  renderTickets();
  renderActiveChat();
  renderSuggestions(["Delay issue", "Payment issue", "Customer issue"]);
  updateNotificationCount();
  updateQualityPanel(newTicket);

  return newTicket;
}

function closeActiveTicket() {
  const ticket = getActiveTicket();
  if (!ticket) return;

  ticket.status = "closed";
  ticket.lifecycle = "closed";

  addSystemMessage(ticket.id, "Ticket closed.");

  ticket.messages.push({
    sender: "agent",
    text: "This ticket has been closed. You can create a new ticket anytime if you need more help.",
    time: new Date().toISOString()
  });

  saveTickets();
  renderTickets();
  renderActiveChat();
  updateNotificationCount();
  updateQualityPanel(ticket);
}

/* ================= LIVE SIMULATION ================= */

function startLiveSimulation() {
  if (liveSimulationStarted) return;
  liveSimulationStarted = true;

  simulateAgentStatus();
  simulateIncomingMessage();
  syncTicketsFromStorage();
}

function simulateIncomingMessage() {
  setInterval(() => {
    const openTickets = tickets.filter((ticket) => ticket.status === "open");
    if (!openTickets.length) return;

    if (Math.random() < 0.08) {
      const ticket = openTickets[Math.floor(Math.random() * openTickets.length)];

      const messages =
        supportSettings.agentType === "human"
          ? [
              "Human support is still monitoring this ticket.",
              "I am checking this from the support side.",
              "Please share one more detail if the issue is still active."
            ]
          : [
              "Just checking in — are you still facing this issue?",
              "I am still here if you need help with this ticket.",
              "Your ticket is still active. Do you want me to escalate it?"
            ];

      const randomMessage = messages[Math.floor(Math.random() * messages.length)];

      addAgentMessage(ticket.id, randomMessage);
      markTicketUnread(ticket.id);
    }
  }, 18000);
}

function syncTicketsFromStorage() {
  setInterval(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const parsed = JSON.parse(saved);

    if (JSON.stringify(parsed) !== JSON.stringify(tickets)) {
      tickets = parsed;
      renderTickets();
      renderActiveChat();
      updateNotificationCount();
      updateQualityPanel(getActiveTicket());
    }
  }, 2500);
}

function simulateAgentStatus() {
  setInterval(() => {
    const statusText = document.getElementById("agentStatusText");
    const dot = document.querySelector(".online-dot");

    if (!statusText || !dot) return;

    if (Math.random() < 0.08) {
      dot.style.background = "#b8b8b8";
      statusText.textContent = "Agent Busy";

      setTimeout(() => {
        dot.style.background = "#0fa958";
        statusText.textContent =
          supportSettings.agentType === "human"
            ? "Human Agent Online"
            : "AI Agent Online";
      }, 2500);
    }
  }, 10000);
}

/* ================= QUALITY PANEL ================= */

function updateQualityPanel(ticket) {
  const escalation = document.getElementById("escalationLevelText");
  const confidence = document.getElementById("aiConfidenceText");

  if (!ticket) return;

  const analysis = ticket.aiAnalysis || {};

  if (escalation) {
    escalation.textContent =
      ticket.priority === "high" ||
      ticket.routeType === "escalation" ||
      ticket.lifecycle === "waiting_admin" ||
      ticket.lifecycle === "under_review" ||
      analysis.recommendedAction === "human_handoff"
        ? "High"
        : "Low";
  }

  if (confidence) {
    if (supportSettings.agentType === "human") {
      confidence.textContent = "Human Review";
    } else {
      confidence.textContent = capitalize(analysis.confidence || ticket.aiConfidence || "High");
    }
  }
}

/* ================= NOTIFICATION ================= */

function updateNotificationCount() {
  const unreadCount = tickets.filter((ticket) => ticket.unread).length;

  const badge =
    document.getElementById("notifCount") ||
    document.getElementById("notificationCount") ||
    document.querySelector(".notification-count");

  if (badge) {
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? "inline-flex" : "none";
  }
}

/* ================= TYPING ================= */

function showTyping() {
  const typing = document.getElementById("typingIndicator");
  if (typing) typing.classList.remove("hidden");
}

function hideTyping() {
  const typing = document.getElementById("typingIndicator");
  if (typing) typing.classList.add("hidden");
}

/* ================= HELPERS ================= */

function scrollToBottom() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(dateString) {
  if (!dateString) return "";

  const date = new Date(dateString);

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatLifecycle(lifecycle) {
  if (lifecycle === "waiting_admin") return "Waiting Admin";
  if (lifecycle === "under_review") return "Under Review";
  if (lifecycle === "resolved") return "Resolved";
  if (lifecycle === "closed") return "Closed";
  return "Active now";
}

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function capitalize(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
/* ================= AI ANALYSIS HELPERS ================= */

function getTicketContext(ticket, currentMessage) {
  const recentMessages = ticket
    ? ticket.messages
        .filter((m) => m.sender === "rider")
        .slice(-4)
        .map((m) => m.text.toLowerCase())
        .join(" ")
    : "";

  return `${recentMessages} ${currentMessage.toLowerCase()}`;
}

function detectIntent(context) {
  if (
    context.includes("unsafe") ||
    context.includes("danger") ||
    context.includes("threat") ||
    context.includes("accident") ||
    context.includes("emergency")
  ) {
    return "safety";
  }

  if (
    context.includes("human") ||
    context.includes("agent") ||
    context.includes("escalate") ||
    context.includes("not resolved")
  ) {
    return "escalation";
  }

  if (
    context.includes("payment") ||
    context.includes("earning") ||
    context.includes("payout") ||
    context.includes("withdraw") ||
    context.includes("bank") ||
    context.includes("not paid") ||
    context.includes("missing money") ||
    context.includes("adjust earnings")
  ) {
    return "payment";
  }

  if (
    context.includes("delay") ||
    context.includes("late") ||
    context.includes("traffic") ||
    context.includes("pickup") ||
    context.includes("restaurant waiting")
  ) {
    return "delay";
  }

  if (
    context.includes("customer") ||
    context.includes("not responding") ||
    context.includes("wrong address") ||
    context.includes("wrong location") ||
    context.includes("call")
  ) {
    return "customer";
  }

  if (
    context.includes("rating") ||
    context.includes("review") ||
    context.includes("bad rating")
  ) {
    return "rating";
  }

  if (
    context.includes("cancel") ||
    context.includes("cancellation")
  ) {
    return "cancel";
  }

  return "general";
}

function detectSentiment(context) {
  if (
    context.includes("angry") ||
    context.includes("frustrated") ||
    context.includes("annoyed") ||
    context.includes("bad") ||
    context.includes("worried")
  ) {
    return "negative";
  }

  if (
    context.includes("thanks") ||
    context.includes("thank you") ||
    context.includes("okay") ||
    context.includes("resolved")
  ) {
    return "positive";
  }

  return "neutral";
}

function detectSupportRisk(context) {
  if (
    context.includes("unsafe") ||
    context.includes("threat") ||
    context.includes("accident") ||
    context.includes("emergency") ||
    context.includes("danger")
  ) {
    return "critical";
  }

  if (
    context.includes("missing money") ||
    context.includes("not paid") ||
    context.includes("wrong location") ||
    context.includes("customer not responding")
  ) {
    return "medium";
  }

  return "low";
}

function calculateAIConfidence(intent, context, risk) {
  if (risk === "critical") return "medium";

  if (intent !== "general") {
    return "high";
  }

  const words = context.trim().split(/\s+/);

  if (words.length < 4) {
    return "low";
  }

  return "medium";
}

function buildAIAnalysis({ intent, sentiment, risk, confidence, ticket }) {
  const tags = generateAITags(intent, risk, ticket);
  const summary = generateAISummary(intent, risk, ticket);
  const nextBestAction = generateNextBestAction(intent, risk, confidence, ticket);

  let recommendedAction = "continue_ai_support";

  if (risk === "critical") {
    recommendedAction = "human_handoff";
  } else if (ticket.lifecycle === "waiting_admin") {
    recommendedAction = "admin_review";
  } else if (intent === "escalation") {
    recommendedAction = "human_handoff";
  } else if (confidence === "low") {
    recommendedAction = "ask_more_details";
  }

  return {
    intent,
    sentiment,
    risk,
    confidence,
    recommendedAction,
    tags,
    summary,
    nextBestAction,
    lastAnalyzedAt: new Date().toISOString()
  };
}

function generateAITags(intent, risk, ticket) {
  const tags = [];

  if (intent && intent !== "general") tags.push(intent);

  if (risk === "critical") {
    tags.push("safety", "urgent", "human-review");
  }

  if (ticket.lifecycle === "waiting_admin") {
    tags.push("admin-review", "payout-review");
  }

  if (ticket.priority === "high") {
    tags.push("high-priority");
  }

  // Only add routeType if it matches the current AI intent
  if (ticket.routeType && ticket.routeType === intent) {
    tags.push(ticket.routeType);
  }

  return [...new Set(tags)];
}

function generateAISummary(intent, risk, ticket) {
  if (risk === "critical") {
    return "Rider reported a possible safety issue. Human support should review immediately.";
  }

  if (ticket.lifecycle === "waiting_admin") {
    return "Rider submitted an earnings adjustment request. Admin approval is required before payout changes.";
  }

  if (intent === "payment") {
    return "Rider is asking about payout, earnings, withdrawal, or missing payment.";
  }

  if (intent === "delay") {
    return "Rider is reporting a delivery delay that may affect trip progress or rating.";
  }

  if (intent === "customer") {
    return "Rider is reporting a customer-related delivery issue.";
  }

  return "Rider is asking for general support assistance.";
}

function generateNextBestAction(intent, risk, confidence, ticket) {
  if (risk === "critical") {
    return "Switch to human support and advise rider to move to a safe location.";
  }

  if (ticket.lifecycle === "waiting_admin") {
    return "Wait for admin to approve or reject the payout adjustment request.";
  }

  if (confidence === "low") {
    return "Ask rider for more details before taking action.";
  }

  if (intent === "payment") {
    return "Check payout context and submit adjustment request only if required.";
  }

  if (intent === "delay") {
    return "Protect rider rating if delay was outside rider control.";
  }

  if (intent === "customer") {
    return "Guide rider through customer unavailable process.";
  }

  return "Continue support conversation and clarify the issue.";
}
function updateChatNotice(ticket) {
  const notice = document.getElementById("supportModeNotice");
  if (!notice || !ticket) return;

  const analysis = ticket.aiAnalysis;

  if (analysis?.risk === "critical") {
    notice.textContent =
      "Safety issue detected. Please move to a safe place first. Human support simulation has been assigned.";
    return;
  }

  if (ticket.lifecycle === "waiting_admin") {
    notice.textContent =
      "This ticket is waiting for admin review. Payout changes cannot be applied until approved.";
    return;
  }

  if (supportSettings.agentType === "human") {
    notice.textContent =
      "Human support simulation is handling this ticket. Admin approval is required for payout changes.";
    return;
  }

  notice.textContent =
    "FoodExpress AI can help instantly, but payout adjustments require admin review.";
}