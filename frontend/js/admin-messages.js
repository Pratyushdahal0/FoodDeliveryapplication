const ADMIN_MESSAGES_API =
  "../../backend/controllers/AdminMessagesController.php";

let allMessages = [];
let currentMessageId = null;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshBtn")?.addEventListener("click", loadMessages);
  document.getElementById("searchInput")?.addEventListener("input", renderMessages);
  document.getElementById("statusFilter")?.addEventListener("change", renderMessages);

  document.getElementById("closeMessageModal")?.addEventListener("click", closeMessageModal);

  document.getElementById("messageViewModal")?.addEventListener("click", (event) => {
    if (event.target.id === "messageViewModal") {
      closeMessageModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMessageModal();
    }
  });

  document.getElementById("sendReplyBtn")?.addEventListener("click", sendReply);

  loadMessages();
});

async function loadMessages() {
  const table = document.getElementById("messagesTableBody");
  const refreshBtn = document.getElementById("refreshBtn");

  if (table) {
    table.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="loading-state">
            <h3>Loading support tickets...</h3>
            <p>Please wait while FoodExpress fetches support messages.</p>
          </div>
        </td>
      </tr>
    `;
  }

  if (refreshBtn) refreshBtn.disabled = true;

  try {
    const response = await fetch(`${ADMIN_MESSAGES_API}?action=list`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load messages.");
    }

    allMessages = Array.isArray(result.data) ? result.data : [];
    renderMessages();
  } catch (error) {
    if (table) {
      table.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state">
              <h3>Could not load messages</h3>
              <p>${escapeHtml(error.message || "Please check backend connection.")}</p>
            </div>
          </td>
        </tr>
      `;
    }
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function renderMessages() {
  const table = document.getElementById("messagesTableBody");
  if (!table) return;

  const search =
    document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
  const selectedStatus =
    document.getElementById("statusFilter")?.value || "all";

  const filteredMessages = allMessages.filter((item) => {
    const status = normalizeStatus(item.status);
    const matchesStatus = selectedStatus === "all" || status === selectedStatus;

    const searchText = [
      item.first_name,
      item.last_name,
      item.email,
      item.phone,
      item.subject,
      item.message
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");

    return matchesStatus && searchText.includes(search);
  });

  if (!filteredMessages.length) {
    table.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <h3>No support tickets found</h3>
            <p>Try adjusting your search or status filter.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = filteredMessages
    .map((item) => {
      const status = normalizeStatus(item.status);
      const isResolved = status === "resolved";
      const isInProgress = status === "in_progress";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(getFullName(item))}</strong>
            <div style="color:#6b7280; font-size:0.88rem;">
              ${escapeHtml(item.email || "No email")}
            </div>
          </td>

          <td>
            <strong>${escapeHtml(item.subject || "No subject")}</strong>
            <div style="color:#6b7280; font-size:0.88rem;">
              ${escapeHtml(shortenText(item.message || "", 70))}
            </div>
          </td>

          <td>
            <span class="status-badge ${getStatusClass(status)}">
              ${escapeHtml(formatStatus(status))}
            </span>
          </td>

          <td>${escapeHtml(formatDate(item.created_at))}</td>

          <td>
            <div class="action-wrap">
              <button 
                class="action-btn btn-view"
                type="button"
                onclick="viewMessage(${Number(item.id)})"
              >
                View
              </button>

              <button
                class="action-btn btn-warning"
                type="button"
                onclick="setInProgress(${Number(item.id)})"
                ${isInProgress || isResolved ? "disabled" : ""}
              >
                In Progress
              </button>

              <button
                class="action-btn btn-approve"
                type="button"
                onclick="markResolved(${Number(item.id)})"
                ${isResolved ? "disabled" : ""}
              >
                Resolve
              </button>

              <button
                class="action-btn btn-reject"
                type="button"
                onclick="deleteMessage(${Number(item.id)})"
              >
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function viewMessage(id) {
  const message = allMessages.find((item) => Number(item.id) === Number(id));

  if (!message) {
    showMessage("Message not found.", "error");
    return;
  }

  currentMessageId = id;

  const modal = document.getElementById("messageViewModal");
  const body = document.getElementById("messageModalBody");

  if (!modal || !body) return;

  const status = normalizeStatus(message.status);
  const fullName = getFullName(message);

  body.innerHTML = `
    <div class="support-modal-header">
      <div>
        <p class="support-modal-eyebrow">Support Ticket #${escapeHtml(message.id)}</p>
        <h2>${escapeHtml(message.subject || "No subject")}</h2>
      </div>

      <span class="status-badge ${getStatusClass(status)}">
        ${escapeHtml(formatStatus(status))}
      </span>
    </div>

    <div class="support-message-card">
      <div class="support-avatar">
        ${escapeHtml(getInitials(fullName))}
      </div>

      <div class="support-message-main">
        <div class="support-message-top">
          <div>
            <h3>${escapeHtml(fullName)}</h3>
            <p>${escapeHtml(message.email || "No email")}</p>
          </div>

          <span>${escapeHtml(formatDate(message.created_at))}</span>
        </div>

        <div class="support-message-text">
          ${escapeHtml(message.message || "No message")}
        </div>
      </div>
    </div>

    <div id="replyHistoryBox" class="reply-history-box">
      <h3>Reply History</h3>
      <p class="reply-loading">Loading replies...</p>
    </div>
  `;

  const replyBox = document.getElementById("adminReplyText");
  if (replyBox) replyBox.value = "";

  modal.classList.add("show");

  await loadReplyHistory(id);
}

async function loadReplyHistory(messageId) {
  const box = document.getElementById("replyHistoryBox");
  if (!box) return;

  try {
    const response = await fetch(
      `${ADMIN_MESSAGES_API}?action=replies&message_id=${messageId}`
    );
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to load replies.");
    }

    const replies = Array.isArray(result.data) ? result.data : [];

    if (!replies.length) {
      box.innerHTML = `
        <h3>Reply History</h3>
        <div class="reply-empty">No replies sent yet.</div>
      `;
      return;
    }

    box.innerHTML = `
      <h3>Reply History</h3>
      <div class="reply-chat"> 
        ${replies
          .map((reply) => {
            const sent = reply.sent_status === "sent";

            return `
              <div class="reply-bubble admin">
                <div class="reply-item-head">
                  <strong>FoodExpress Support</strong>
                  <span class="status-badge ${sent ? "status-approved" : "status-rejected"}">
                    ${sent ? "Sent" : "Failed"}
                  </span>
                </div>

                <p>${escapeHtml(reply.reply_text || "")}</p>

                <div class="reply-time">
                  ${escapeHtml(formatDate(reply.created_at))}
                </div>

                ${
                  reply.email_error
                    ? `<div class="reply-error">${escapeHtml(reply.email_error)}</div>`
                    : ""
                }
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  } catch (error) {
    box.innerHTML = `
      <h3>Reply History</h3>
      <div class="reply-error">${escapeHtml(error.message)}</div>
    `;
  }
}

async function sendReply() {
  const text = document.getElementById("adminReplyText")?.value.trim();

  if (!currentMessageId) {
    showMessage("Open a message first.", "error");
    return;
  }

  if (!text) {
    showMessage("Write a reply first.", "error");
    return;
  }

  try {
    const response = await fetch(`${ADMIN_MESSAGES_API}?action=reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: currentMessageId,
        reply: text
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to send reply.");
    }

    showMessage(result.message || "Reply saved successfully.", "success");

    const replyBox = document.getElementById("adminReplyText");
    if (replyBox) replyBox.value = "";

    await loadReplyHistory(currentMessageId);
    await loadMessages();
  } catch (error) {
    showMessage(error.message || "Could not send reply.", "error");
  }
}

async function setInProgress(id) {
  await updateMessageStatus(id, "in_progress", "Ticket marked as In Progress.");
}

async function markResolved(id) {
  await updateMessageStatus(id, "resolved", "Ticket marked as Resolved.");
}

async function updateMessageStatus(id, status, successMessage) {
  try {
    const response = await fetch(`${ADMIN_MESSAGES_API}?action=update_status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id,
        status
      })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to update ticket.");
    }

    showMessage(result.message || successMessage, "success");
    closeMessageModal();
    await loadMessages();
  } catch (error) {
    showMessage(error.message || "Could not update ticket.", "error");
  }
}

async function deleteMessage(id) {
  const confirmDelete = confirm(
    "Are you sure you want to delete this support ticket?"
  );

  if (!confirmDelete) return;

  try {
    const response = await fetch(`${ADMIN_MESSAGES_API}?action=delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ id })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || "Failed to delete ticket.");
    }

    showMessage(result.message || "Ticket deleted successfully.", "success");
    closeMessageModal();
    await loadMessages();
  } catch (error) {
    showMessage(error.message || "Could not delete ticket.", "error");
  }
}

function closeMessageModal() {
  document.getElementById("messageViewModal")?.classList.remove("show");
  currentMessageId = null;

  const replyBox = document.getElementById("adminReplyText");
  if (replyBox) replyBox.value = "";
}

function getFullName(item) {
  return `${item.first_name || ""} ${item.last_name || ""}`.trim() || "Unknown Sender";
}

function getInitials(name) {
  return String(name || "U")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizeStatus(status) {
  const value = String(status || "received").toLowerCase().trim();

  if (
    !["received", "in_progress", "resolved", "emailed", "email_failed"].includes(
      value
    )
  ) {
    return "received";
  }

  return value;
}

function getStatusClass(status) {
  if (status === "resolved" || status === "emailed") {
    return "status-approved";
  }

  if (status === "email_failed") {
    return "status-rejected";
  }

  return "status-pending";
}

function formatStatus(status) {
  if (status === "email_failed") return "Email Failed";
  if (status === "in_progress") return "In Progress";
  return capitalize(status);
}

function shortenText(text, maxLength) {
  const value = String(text || "");

  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength) + "...";
}

function showMessage(message, type) {
  const bar = document.getElementById("messageBar");
  if (!bar) return;

  bar.textContent = message;
  bar.className = `message-bar show ${type}`;

  clearTimeout(showMessage._timer);

  showMessage._timer = setTimeout(() => {
    bar.className = "message-bar";
    bar.textContent = "";
  }, 3000);
}

function formatDate(value) {
  if (!value) return "Recently";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return date.toLocaleDateString();
}

function capitalize(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}