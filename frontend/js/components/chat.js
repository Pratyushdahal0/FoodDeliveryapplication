/**
 * FoodExpress — Order Chat Widget
 *
 * Usage (customer / track-order page):
 *   window.FoodExpressChat.init({
 *     containerId: 'orderChatSection',
 *     orderId:     42,
 *     senderRole:  'customer',
 *     senderName:  'Anita Sharma',
 *     senderEmail: 'anita@example.com',
 *   });
 *
 * Usage (rider / deliveries page):
 *   window.FoodExpressChat.init({
 *     containerId: 'riderChatSection',
 *     orderId:     42,
 *     senderRole:  'rider',
 *     senderName:  'Ramesh',
 *     senderEmail: 'ramesh@example.com',
 *   });
 */
(function () {
  'use strict';

  const CHAT_API = '../../backend/controllers/ChatController.php';
  const POLL_MS  = 5000;

  const _timers = {};

  /* ── helpers ──────────────────────────────────────────────── */
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTime(ts) {
    if (!ts) return 'Now';
    const d = new Date(String(ts).replace(' ', 'T'));
    if (isNaN(d.getTime())) return 'Now';
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1)  return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /* ── inject CSS once ──────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('feChatStyles')) return;
    const s = document.createElement('style');
    s.id = 'feChatStyles';
    s.textContent = `
.fe-chat-section {
  border-radius: 24px;
  border: 1px solid #e5e7eb;
  background: #fff;
  padding: 22px;
  box-shadow: 0 8px 32px rgba(15,23,42,.06);
  margin-top: 20px;
}
.fe-chat-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 10px;
}
.fe-chat-header-info h3 {
  font-size: 1rem;
  font-weight: 900;
  color: #111827;
  margin: 0 0 3px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.fe-chat-header-info h3 i { color: #f97316; }
.fe-chat-header-info p {
  font-size: 13px;
  color: #6b7280;
  margin: 0;
}
.fe-chat-unread {
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 900;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  flex-shrink: 0;
}
.fe-chat-messages {
  height: 260px;
  overflow-y: auto;
  border: 1.5px solid #f3f4f6;
  border-radius: 16px;
  padding: 12px;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scroll-behavior: smooth;
}
.fe-chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  gap: 8px;
  text-align: center;
  padding: 20px;
}
.fe-chat-empty i  { font-size: 30px; opacity: .35; }
.fe-chat-empty p  { font-size: 13px; margin: 0; }
.fe-chat-system {
  text-align: center;
  font-size: 11px;
  color: #9ca3af;
  padding: 4px 10px;
  background: #f3f4f6;
  border-radius: 8px;
  align-self: center;
}
.fe-chat-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 82%;
}
.fe-chat-row-me    { align-self: flex-end;   align-items: flex-end;   }
.fe-chat-row-other { align-self: flex-start; align-items: flex-start; }
.fe-chat-bubble {
  padding: 9px 14px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}
.fe-chat-bubble-me {
  background: linear-gradient(135deg,#f97316,#ef4444);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.fe-chat-bubble-other {
  background: #fff;
  color: #111827;
  border: 1.5px solid #e5e7eb;
  border-bottom-left-radius: 4px;
}
.fe-chat-meta { font-size: 11px; color: #9ca3af; }
.fe-chat-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 12px 0 10px;
}
.fe-chat-quick-btn {
  padding: 7px 13px;
  border: 1.5px solid #e5e7eb;
  border-radius: 999px;
  background: #f9fafb;
  color: #374151;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: inherit;
}
.fe-chat-quick-btn:hover {
  background: #fff1eb;
  border-color: #f97316;
  color: #f97316;
}
.fe-chat-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.fe-chat-input {
  flex: 1;
  padding: 11px 16px;
  border: 1.5px solid #e5e7eb;
  border-radius: 999px;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  background: #fff;
  transition: border-color .15s;
}
.fe-chat-input:focus { border-color: #f97316; }
.fe-chat-send-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg,#f97316,#ef4444);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity .15s;
}
.fe-chat-send-btn:hover    { opacity: .88; }
.fe-chat-send-btn:disabled { opacity: .45; cursor: not-allowed; }
    `;
    document.head.appendChild(s);
  }

  /* ── render ───────────────────────────────────────────────── */
  function renderMessages(container, messages, myRole) {
    if (!messages.length) {
      container.innerHTML =
        '<div class="fe-chat-empty">' +
        '<i class="fa-regular fa-comments"></i>' +
        '<p>No messages yet — say something!</p>' +
        '</div>';
      return;
    }

    const atBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 60;

    container.innerHTML = messages
      .map((msg) => {
        if (msg.sender_role === 'system') {
          return `<div class="fe-chat-system">${esc(msg.message)}</div>`;
        }
        const isMe = msg.sender_role === myRole;
        const name = msg.sender_name || msg.sender_role;
        return `
          <div class="fe-chat-row ${isMe ? 'fe-chat-row-me' : 'fe-chat-row-other'}">
            <div class="fe-chat-bubble ${isMe ? 'fe-chat-bubble-me' : 'fe-chat-bubble-other'}">
              ${esc(msg.message)}
            </div>
            <div class="fe-chat-meta">${esc(name)} · ${fmtTime(msg.created_at)}</div>
          </div>`;
      })
      .join('');

    if (atBottom) container.scrollTop = container.scrollHeight;
  }

  function updateBadge(badge, messages, myRole) {
    if (!badge) return;
    const n = (messages || []).filter(
      (m) => Number(m.is_read) === 0 && m.sender_role !== myRole
    ).length;
    if (n > 0) {
      badge.textContent = n > 9 ? '9+' : String(n);
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  /* ── API ──────────────────────────────────────────────────── */
  async function apiGet(orderId) {
    try {
      const resp = await fetch(
        `${CHAT_API}?action=get_messages&order_id=${orderId}&_=${Date.now()}`
      );
      const text = await resp.text();
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  async function apiSend(orderId, role, name, email, message) {
    try {
      const resp = await fetch(`${CHAT_API}?action=send_message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id:     orderId,
          sender_role:  role,
          sender_name:  name,
          sender_email: email,
          message:      message,
        }),
      });
      const text = await resp.text();
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function apiMarkRead(orderId, role) {
    fetch(`${CHAT_API}?action=mark_read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, reader_role: role }),
    }).catch(() => {});
  }

  /* ── init ─────────────────────────────────────────────────── */
  function init(cfg) {
    const { containerId, orderId, senderRole, senderName, senderEmail } = cfg;

    injectStyles();

    const section = document.getElementById(containerId);
    if (!section) return;

    const messagesEl = section.querySelector('.fe-chat-messages');
    const inputEl    = section.querySelector('.fe-chat-input');
    const sendBtn    = section.querySelector('.fe-chat-send-btn');
    const badge      = section.querySelector('.fe-chat-unread');

    if (!messagesEl || !inputEl || !sendBtn) return;

    destroy(containerId);

    async function refresh() {
      const result = await apiGet(orderId);
      if (result && result.success) {
        renderMessages(messagesEl, result.data || [], senderRole);
        updateBadge(badge, result.data || [], senderRole);
      }
    }

    refresh().then(() => apiMarkRead(orderId, senderRole));

    _timers[containerId] = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);

    async function doSend() {
      const msg = inputEl.value.trim();
      if (!msg) return;
      sendBtn.disabled = true;
      inputEl.value = '';
      const result = await apiSend(orderId, senderRole, senderName, senderEmail, msg);
      if (result && result.success) {
        await refresh();
        apiMarkRead(orderId, senderRole);
      }
      sendBtn.disabled = false;
      inputEl.focus();
    }

    sendBtn.addEventListener('click', doSend);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });

    section.querySelectorAll('[data-quick-msg]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const result = await apiSend(
          orderId, senderRole, senderName, senderEmail, btn.dataset.quickMsg
        );
        if (result && result.success) {
          await refresh();
          apiMarkRead(orderId, senderRole);
        }
      });
    });

    messagesEl.addEventListener('click', () => apiMarkRead(orderId, senderRole));
  }

  function destroy(containerId) {
    if (_timers[containerId]) {
      clearInterval(_timers[containerId]);
      delete _timers[containerId];
    }
  }

  window.FoodExpressChat = { init, destroy };
})();
