// ══════════════════════════════════════════════════════════════════════
// sg-widget.js — Salon Genie client chat widget v2
//
// Architecture (no CORS issues, works on localhost):
//   1. Client types → widget writes to salon.messages (REST, anon key)
//   2. DB Webhook fires genie-receptionist Edge Function automatically
//   3. Edge Function writes reply to salon.messages
//   4. Supabase Realtime pushes reply to widget → rendered as bubble
//
// Slot booking still calls Edge Function directly (book_slot payload)
// because it needs an immediate DB write + confirmation response.
// ══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';
  if (window.__sgWidgetLoaded) return;
  window.__sgWidgetLoaded = true;

  // ── Config ───────────────────────────────────────────────────────────
  const CFG = Object.assign({
    businessId:   '',
    supabaseUrl:  '',
    supabaseKey:  '',
    edgeFnUrl:    '',
    salonName:    'Our Salon',
    salonPhone:   '',
    accentColor:  '#C4856A',
    position:     'bottom-right',
    hideLauncher: false,
  }, window.SG_CONFIG || {});

  const SB_URL = CFG.supabaseUrl;
  const SB_KEY = CFG.supabaseKey;
  const BIZ_ID = CFG.businessId;

  // ── State ────────────────────────────────────────────────────────────
  let sgClientName  = '';
  let sgClientPhone = '';
  let sgSending     = false;
  let isOpen        = false;
  let sgTypingId    = null;
  let sgRealtimeSub = null;
  let sgSeenIds     = new Set(); // prevent duplicate bubbles

  // ── Session ──────────────────────────────────────────────────────────
  function sgRestoreSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem('sg_session') || '{}');
      sgClientName  = s.name  || '';
      sgClientPhone = s.phone || '';
    } catch (_) {}
  }
  function sgSaveSession() {
    try {
      sessionStorage.setItem('sg_session', JSON.stringify({ name: sgClientName, phone: sgClientPhone }));
    } catch (_) {}
  }

  // ── Styles ───────────────────────────────────────────────────────────
  const ACCENT = CFG.accentColor;
  const STYLES = `
    #sg-widget-root * { box-sizing:border-box; margin:0; padding:0; font-family:'DM Sans',system-ui,sans-serif; }
    #sg-widget-root { position:fixed; z-index:99999; ${CFG.position==='bottom-left'?'left:24px':'right:24px'}; bottom:24px; }

    .sg-chat-launcher {
      width:56px; height:56px; border-radius:50%; border:none; cursor:pointer;
      background:${ACCENT}; color:white; font-size:24px;
      box-shadow:0 4px 20px rgba(0,0,0,0.18);
      display:flex; align-items:center; justify-content:center;
      transition:transform 0.2s, box-shadow 0.2s;
    }
    .sg-chat-launcher:hover { transform:scale(1.08); box-shadow:0 6px 24px rgba(0,0,0,0.22); }
    .sg-chat-launcher.hidden { display:none; }

    .sg-unread {
      position:absolute; top:-2px; right:-2px;
      width:18px; height:18px; background:#E53E3E; color:white;
      border-radius:50%; font-size:10px; font-weight:700;
      display:none; align-items:center; justify-content:center;
    }
    .sg-unread.show { display:flex; }

    .sg-chat-window {
      position:absolute; bottom:68px; ${CFG.position==='bottom-left'?'left:0':'right:0'};
      width:360px; height:580px; max-height:85vh;
      background:#FDFAF6; border-radius:18px;
      box-shadow:0 12px 40px rgba(0,0,0,0.16);
      display:flex; flex-direction:column; overflow:hidden;
      transform:scale(0.92) translateY(12px); opacity:0;
      pointer-events:none; transition:all 0.22s cubic-bezier(.4,0,.2,1);
    }
    .sg-chat-window.open { transform:scale(1) translateY(0); opacity:1; pointer-events:all; }

    .sg-chat-header {
      background:${ACCENT}; color:white; padding:14px 16px;
      display:flex; align-items:center; gap:10px; flex-shrink:0;
    }
    .sg-chat-av {
      width:34px; height:34px; border-radius:50%;
      background:rgba(255,255,255,0.25); display:flex;
      align-items:center; justify-content:center; font-size:16px; flex-shrink:0;
    }
    .sg-chat-title { font-weight:700; font-size:14px; }
    .sg-chat-sub   { font-size:11px; opacity:0.78; margin-top:1px; }
    .sg-chat-close {
      margin-left:auto; background:none; border:none; color:white;
      font-size:18px; cursor:pointer; opacity:0.7; padding:4px;
      border-radius:6px; transition:opacity 0.15s;
    }
    .sg-chat-close:hover { opacity:1; }

    .sg-messages {
      flex:1; overflow-y:auto; padding:16px 14px;
      display:flex; flex-direction:column; gap:12px; scroll-behavior:smooth;
      min-height:300px;
    }
    .sg-messages::-webkit-scrollbar { width:3px; }
    .sg-messages::-webkit-scrollbar-thumb { background:rgba(0,0,0,0.12); border-radius:2px; }

    .sg-bubble-row { display:flex; gap:8px; align-items:flex-end; animation:sgFadeUp 0.2s ease both; }
    @keyframes sgFadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    .sg-bubble-row.client { flex-direction:row-reverse; }

    .sg-bubble-av {
      width:26px; height:26px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-size:11px; font-weight:700; flex-shrink:0;
    }
    .sg-bubble-av.salon-av  { background:${ACCENT}; color:white; }
    .sg-bubble-av.client-av { background:#EDE6D8; color:#6A6058; }

    .sg-bubble {
      max-width:84%; padding:11px 14px; border-radius:14px;
      font-size:14px; line-height:1.6; word-break:break-word;
    }
    .sg-bubble-row.salon  .sg-bubble,
    .sg-bubble-row.ai     .sg-bubble { background:#F5F0E8; color:#1C1814; border-bottom-left-radius:4px; }
    .sg-bubble-row.client .sg-bubble { background:${ACCENT}; color:white; border-bottom-right-radius:4px; }
    .sg-bubble-time { font-size:10px; color:#A89A8E; margin-top:3px; padding:0 2px; }

    /* Slot cards */
    .sg-slots-wrap { display:flex; flex-direction:column; gap:7px; margin-top:4px; animation:sgFadeUp 0.25s ease both; }
    .sg-slots-label { font-size:11px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; color:#A89A8E; padding:0 2px; margin-bottom:2px; }
    .sg-slot-btn {
      display:flex; align-items:center; justify-content:space-between;
      padding:10px 14px; border-radius:11px;
      border:1.5px solid rgba(196,133,106,0.3); background:white;
      cursor:pointer; font-family:'DM Sans',system-ui,sans-serif;
      font-size:13px; font-weight:600; color:#1C1814;
      box-shadow:0 1px 6px rgba(0,0,0,0.06);
      transition:all 0.15s; text-align:left;
    }
    .sg-slot-btn:hover { border-color:${ACCENT}; background:rgba(196,133,106,0.06); transform:translateX(2px); }
    .sg-slot-btn:disabled { opacity:0.45; cursor:not-allowed; transform:none; }
    .sg-slot-meta { font-size:11px; font-weight:400; color:#A89A8E; margin-top:1px; }
    .sg-slot-arrow { font-size:16px; color:${ACCENT}; flex-shrink:0; margin-left:8px; }

    /* Booking form */
    .sg-book-form {
      display:flex; flex-direction:column; gap:8px;
      padding:12px 14px; background:#F5F0E8; border-radius:12px;
      animation:sgFadeUp 0.2s ease both;
    }
    .sg-book-form label { font-size:11px; font-weight:700; color:#6A6058; letter-spacing:0.8px; text-transform:uppercase; }
    .sg-book-form input {
      padding:9px 11px; border-radius:9px; border:1.5px solid rgba(0,0,0,0.1);
      background:white; font-family:'DM Sans',system-ui,sans-serif;
      font-size:13px; color:#1C1814; outline:none; transition:border-color 0.18s; width:100%;
    }
    .sg-book-form input:focus { border-color:${ACCENT}; }
    .sg-book-confirm {
      height:40px; border-radius:9px; border:none; cursor:pointer;
      background:${ACCENT}; color:white; font-size:13px; font-weight:700;
      font-family:'DM Sans',system-ui,sans-serif;
      box-shadow:0 3px 10px rgba(196,133,106,0.28); transition:all 0.15s;
    }
    .sg-book-confirm:hover { background:#B5745A; }
    .sg-book-confirm:disabled { opacity:0.5; cursor:not-allowed; }
    .sg-book-cancel {
      font-size:12px; color:#A89A8E; background:none; border:none;
      cursor:pointer; text-align:center; font-family:'DM Sans',system-ui,sans-serif;
      padding:4px; transition:color 0.15s;
    }
    .sg-book-cancel:hover { color:#6A6058; }

    /* Typing */
    .sg-typing { display:flex; gap:4px; align-items:center; padding:2px 4px; }
    .sg-typing span { width:5px; height:5px; border-radius:50%; background:#A89A8E; animation:sgDot 1.2s infinite; }
    .sg-typing span:nth-child(2) { animation-delay:0.2s; }
    .sg-typing span:nth-child(3) { animation-delay:0.4s; }
    @keyframes sgDot { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

    .sg-human-notice { text-align:center; font-size:11px; color:#A89A8E; padding:6px 10px; background:#EDE6D8; border-radius:8px; }

    /* Input */
    .sg-input-area {
      padding:12px 14px; border-top:1px solid rgba(0,0,0,0.07); flex-shrink:0;
      display:flex; gap:8px; align-items:flex-end; background:white;
    }
    .sg-chat-input {
      flex:1; background:#F5F0E8; border:1.5px solid transparent;
      border-radius:12px; padding:12px 14px; font-size:14px; color:#1C1814;
      font-family:'DM Sans',system-ui,sans-serif; outline:none; resize:none;
      min-height:48px; max-height:120px; line-height:1.5; transition:border-color 0.18s;
    }
    .sg-chat-input:focus { border-color:${ACCENT}; }
    .sg-chat-input::placeholder { color:#A89A8E; }
    .sg-send-btn {
      width:48px; height:48px; border-radius:12px; border:none;
      background:${ACCENT}; color:white; font-size:16px; cursor:pointer;
      display:flex; align-items:center; justify-content:center; flex-shrink:0;
      box-shadow:0 2px 8px rgba(196,133,106,0.28); transition:all 0.15s;
    }
    .sg-send-btn:hover { background:#B5745A; transform:scale(1.05); }
    .sg-send-btn:disabled { opacity:0.45; cursor:not-allowed; transform:none; }

    @media (max-width:420px) {
      #sg-widget-root { left:12px; right:12px; bottom:16px; }
      .sg-chat-window { width:100%; right:0; max-height:70vh; }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  // ── DOM ──────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'sg-widget-root';
  root.innerHTML = `
    <div class="sg-chat-launcher${CFG.hideLauncher?' hidden':''}" id="sgLauncher" role="button" aria-label="Open chat" tabindex="0">
      💬
      <div class="sg-unread" id="sgUnread">1</div>
    </div>
    <div class="sg-chat-window" id="sgWindow" role="dialog" aria-label="Chat with ${CFG.salonName}">
      <div class="sg-chat-header">
        <div class="sg-chat-av">✦</div>
        <div>
          <div class="sg-chat-title">Genie — ${CFG.salonName}</div>
          <div class="sg-chat-sub">Virtual receptionist · Usually replies instantly</div>
        </div>
        <button class="sg-chat-close" id="sgClose" aria-label="Close chat">✕</button>
      </div>
      <div class="sg-messages" id="sgMessages"></div>
      <div class="sg-input-area">
        <textarea class="sg-chat-input" id="sgInput" placeholder="Ask about availability, services…" rows="1"></textarea>
        <button class="sg-send-btn" id="sgSend" aria-label="Send">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const launcher = root.querySelector('#sgLauncher');
  const window_  = root.querySelector('#sgWindow');
  const messages = root.querySelector('#sgMessages');
  const input    = root.querySelector('#sgInput');
  const sendBtn  = root.querySelector('#sgSend');
  const closeBtn = root.querySelector('#sgClose');
  const unreadEl = root.querySelector('#sgUnread');

  // ── Open / close ──────────────────────────────────────────────────────
  function sgOpen() {
    isOpen = true;
    window_.classList.add('open');
    unreadEl.classList.remove('show');
    input.focus();
    sgScrollBottom();
    if (!messages.children.length) {
      // Always show static welcome — no DB write needed, no dots
      setTimeout(() => {
        sgAddBubble('ai',
          `Hi! I'm Genie, your virtual receptionist at ${CFG.salonName}. 💅\n\nHow can I help you today? I can check availability, answer questions, or help you book an appointment.${CFG.salonPhone ? '\n\nYou can also call us at ' + CFG.salonPhone + '.' : ''}`,
          new Date().toISOString()
        );
      }, 300);
    }
  }
  function sgClose() { isOpen = false; window_.classList.remove('open'); }
  function sgToggle() { isOpen ? sgClose() : sgOpen(); }

  window.sgOpenChat  = sgOpen;
  window.sgCloseChat = sgClose;
  window.sgOpenBooking  = sgOpen;
  window.sgCloseBooking = sgClose;

  launcher.addEventListener('click', sgToggle);
  launcher.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') sgToggle(); });
  closeBtn.addEventListener('click', sgClose);
  document.addEventListener('keydown', e => { if (e.key==='Escape' && isOpen) sgClose(); });

  // ── Textarea auto-resize ──────────────────────────────────────────────
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  });
  input.addEventListener('keydown', e => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sgSend(); }
  });
  sendBtn.addEventListener('click', sgSend);

  // ── Helpers ───────────────────────────────────────────────────────────
  function sgScrollBottom() { setTimeout(() => { messages.scrollTop = messages.scrollHeight; }, 60); }
  function sgEsc(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Bubbles ───────────────────────────────────────────────────────────
  function sgAddBubble(role, text, ts) {
    if (!text || text === 'undefined') return; // guard
    const row      = document.createElement('div');
    const rowClass = role==='client' ? 'client' : role==='staff' ? 'salon' : 'ai';
    const time     = ts ? new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
    const initials = sgClientName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) || '?';

    row.className  = `sg-bubble-row ${rowClass}`;
    row.dataset.ts = ts || '';

    if (role==='client') {
      row.innerHTML = `
        <div class="sg-bubble-av client-av">${initials}</div>
        <div><div class="sg-bubble">${sgEsc(text)}</div><div class="sg-bubble-time">${time}</div></div>`;
    } else {
      row.innerHTML = `
        <div class="sg-bubble-av salon-av">✦</div>
        <div><div class="sg-bubble" style="white-space:pre-line">${sgEsc(text)}</div><div class="sg-bubble-time">${role==='staff'?'👤 ':''}${time}</div></div>`;
    }
    messages.appendChild(row);
    sgScrollBottom();
    return row;
  }

  // ── Typing indicator ──────────────────────────────────────────────────
  let sgTypingTimeout = null;
  function sgShowTyping() {
    sgRemoveTyping();
    const div = document.createElement('div');
    sgTypingId = 'sgt_' + Date.now();
    div.id = sgTypingId;
    div.className = 'sg-bubble-row ai';
    div.innerHTML = `<div class="sg-bubble-av salon-av">✦</div><div><div class="sg-bubble"><div class="sg-typing"><span></span><span></span><span></span></div></div></div>`;
    messages.appendChild(div);
    sgScrollBottom();
    // Auto-remove after 20s if no reply — prevents infinite dots
    if (sgTypingTimeout) clearTimeout(sgTypingTimeout);
    sgTypingTimeout = setTimeout(() => {
      sgRemoveTyping();
      const phoneStr = CFG.salonPhone ? CFG.salonPhone : null;
      const callMsg = phoneStr
        ? `I'm checking on that — if you don't hear back shortly, give us a call at ${phoneStr} and we'll be happy to help!`
        : `I'm checking on that — our team will follow up with you shortly!`;
      sgAddBubble('ai', callMsg, new Date().toISOString());
    }, 20000);
  }
  function sgClearTypingTimeout() {
    if (sgTypingTimeout) { clearTimeout(sgTypingTimeout); sgTypingTimeout = null; }
  }
  function sgRemoveTyping() {
    if (sgTypingId) { document.getElementById(sgTypingId)?.remove(); sgTypingId = null; }
    if (typeof sgClearTypingTimeout === 'function') sgClearTypingTimeout();
  }

  // ── Slot cards ────────────────────────────────────────────────────────
  function sgRenderSlots(slots) {
    if (!slots || !slots.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'sg-slots-wrap';
    wrap.innerHTML = `<div class="sg-slots-label">Available slots — tap to book</div>`;
    slots.forEach(slot => {
      const btn = document.createElement('button');
      btn.className = 'sg-slot-btn';
      btn.innerHTML = `
        <div>
          <div>${sgEsc(slot.label)}</div>
          <div class="sg-slot-meta">with ${sgEsc(slot.tech_name)}</div>
        </div>
        <span class="sg-slot-arrow">→</span>`;
      btn.addEventListener('click', () => sgPickSlot(slot, wrap));
      wrap.appendChild(btn);
    });
    messages.appendChild(wrap);
    sgScrollBottom();
  }

  async function sgPickSlot(slot, slotsWrap) {
    if (!sgClientPhone) { sgShowBookForm(slot, slotsWrap); return; }
    await sgConfirmSlot(slot, sgClientName, sgClientPhone);
  }

  function sgShowBookForm(slot, slotsWrap) {
    slotsWrap.querySelectorAll('.sg-slot-btn').forEach(b => b.disabled = true);
    const form = document.createElement('div');
    form.className = 'sg-book-form';
    form.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#1C1814;margin-bottom:4px;">
        Booking: ${sgEsc(slot.label)} with ${sgEsc(slot.tech_name)}
      </div>
      <label>Your name</label>
      <input id="sgBookName" type="text" placeholder="First Last" value="${sgEsc(sgClientName)}" autocomplete="name"/>
      <label>Phone number</label>
      <input id="sgBookPhone" type="tel" placeholder="(847) 555-1234" value="${sgEsc(sgClientPhone)}" autocomplete="tel"/>
      <button class="sg-book-confirm" id="sgBookConfirm">✦ Confirm this slot</button>
      <button class="sg-book-cancel" id="sgBookCancel">← Choose a different time</button>
    `;
    messages.appendChild(form);
    sgScrollBottom();
    form.querySelector('#sgBookName').focus();

    form.querySelector('#sgBookPhone').addEventListener('input', e => {
      const d = e.target.value.replace(/\D/g,'').slice(0,10);
      let f = d;
      if (d.length>6) f=`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
      else if (d.length>3) f=`(${d.slice(0,3)}) ${d.slice(3)}`;
      else if (d.length>0) f=`(${d}`;
      e.target.value = f;
    });

    form.querySelector('#sgBookConfirm').addEventListener('click', async () => {
      const name  = form.querySelector('#sgBookName').value.trim();
      const phone = form.querySelector('#sgBookPhone').value.replace(/\D/g,'');
      if (!name)         { form.querySelector('#sgBookName').focus(); return; }
      if (phone.length<10) { form.querySelector('#sgBookPhone').focus(); return; }
      sgClientName = name; sgClientPhone = phone; sgSaveSession();
      form.remove();
      await sgConfirmSlot(slot, name, phone);
    });

    form.querySelector('#sgBookCancel').addEventListener('click', () => {
      form.remove();
      slotsWrap.querySelectorAll('.sg-slot-btn').forEach(b => b.disabled = false);
    });
  }

  // Slot booking still calls Edge Function directly — needs immediate response
  async function sgConfirmSlot(slot, name, phone) {
    sgShowTyping();
    try {
      const res = await fetch(CFG.edgeFnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
        body: JSON.stringify({
          business_id:  BIZ_ID,
          book_slot:    slot,
          client_name:  name,
          client_phone: phone,
          client_first: name.split(' ')[0] || name,
          client_last:  name.split(' ').slice(1).join(' ') || '',
        }),
      });
      const data = await res.json();
      sgRemoveTyping();
      sgAddBubble('ai', data.reply || '✅ Booking requested!', new Date().toISOString());
    } catch (_) {
      sgRemoveTyping();
      sgAddBubble('ai', 'Sorry, couldn\'t complete the booking. Please give us a call!', new Date().toISOString());
    }
  }

  // ── REST: write message to salon.messages ─────────────────────────────
  async function sgWriteMessage(role, content, extra = {}) {
    if (!SB_URL || !SB_KEY) return null;
    try {
      const res = await fetch(`${SB_URL}/rest/v1/messages`, {
        method: 'POST',
        headers: {
          'apikey':           SB_KEY,
          'Authorization':    `Bearer ${SB_KEY}`,
          'Content-Type':     'application/json',
          'Accept-Profile':   'salon',
          'Content-Profile':  'salon',
          'Prefer':           'return=representation',
        },
        body: JSON.stringify({
          business_id:  BIZ_ID,
          client_phone: sgClientPhone || 'anonymous',
          client_name:  sgClientName  || null,
          role,
          text:         content,
          channel:      'website',
          read:         false,
          needs_human:  false,
          human_active: false,
          ai_handled:   false,
          // Only spread known safe columns from extra
          ...(extra.intent ? { intent: extra.intent } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.warn('[sg-widget] message write failed', res.status, err);
        return null;
      }
      const rows = await res.json();
      return Array.isArray(rows) ? rows[0] : null;
    } catch (e) {
      console.warn('[sg-widget] message write error', e);
      return null;
    }
  }

  // ── Greeting: write a special greeting message so webhook fires Genie ─
  // sgWriteGreeting removed — static welcome bubble used instead
  // to avoid stuck dots when webhook is not yet configured

  // ── Collect name+phone if not known yet ─────────────────────────────
  function sgShowInfoForm(onSubmit) {
    // Show a quick inline form to get name + phone before first message
    const existing = document.getElementById('sgInfoForm');
    if (existing) return;

    const form = document.createElement('div');
    form.id = 'sgInfoForm';
    form.className = 'sg-book-form';
    form.style.margin = '0 0 8px';
    form.innerHTML = `
      <div style="font-size:13px;color:#1C1814;margin-bottom:4px;">To get started, please share your info:</div>
      <label>Your name</label>
      <input id="sgInfoName" type="text" placeholder="First Last" autocomplete="name"/>
      <label>Phone number</label>
      <input id="sgInfoPhone" type="tel" placeholder="(847) 555-1234" autocomplete="tel"/>
      <button class="sg-book-confirm" id="sgInfoSubmit">Start chatting →</button>
    `;
    // Insert above input area
    const inputArea = root.querySelector('.sg-input-area');
    inputArea.parentNode.insertBefore(form, inputArea);
    form.querySelector('#sgInfoName').focus();

    form.querySelector('#sgInfoPhone').addEventListener('input', e => {
      const d = e.target.value.replace(/\D/g,'').slice(0,10);
      let f = d;
      if (d.length>6) f=`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
      else if (d.length>3) f=`(${d.slice(0,3)}) ${d.slice(3)}`;
      else if (d.length>0) f=`(${d}`;
      e.target.value = f;
    });

    form.querySelector('#sgInfoSubmit').addEventListener('click', () => {
      const name  = form.querySelector('#sgInfoName').value.trim();
      const phone = form.querySelector('#sgInfoPhone').value.replace(/\D/g,'');
      if (!name)           { form.querySelector('#sgInfoName').focus(); return; }
      if (phone.length<10) { form.querySelector('#sgInfoPhone').focus(); return; }
      sgClientName  = name;
      sgClientPhone = phone;
      sgSaveSession();
      sgLastPollTime = new Date().toISOString(); // reset poll cursor to now
      form.remove();
      onSubmit();
    });
  }

  // ── Send: write client message → webhook fires Genie → poll delivers reply
  async function sgSend() {
    const text = input.value.trim();
    if (!text || sgSending) return;

    // Collect client info first if not known
    if (!sgClientPhone) {
      sgShowInfoForm(() => sgDoSend(text));
      input.value = ''; input.style.height = 'auto';
      return;
    }
    await sgDoSend(text);
  }

  async function sgDoSend(text) {
    sgSending = true;
    sendBtn.disabled = true;
    input.value = ''; input.style.height = 'auto';

    sgAddBubble('client', text, new Date().toISOString());
    sgShowTyping();

    const result = await sgWriteMessage('client', text);
    if (!result) {
      // Write failed — show error
      sgRemoveTyping();
      sgAddBubble('ai', 'Sorry, something went wrong. Please try again or give us a call!', new Date().toISOString());
    }

    sgSending = false;
    sendBtn.disabled = false;
  }

  // ── Poll for replies (no CDN needed, works everywhere) ───────────────
  // Polls salon.messages every 2s for new assistant/staff rows.
  // Falls back gracefully if Supabase Realtime is unavailable.
  let sgPollInterval  = null;
  let sgLastPollTime  = new Date().toISOString();

  function sgStartPolling() {
    if (sgPollInterval) return;
    sgPollInterval = setInterval(sgPoll, 2000);
  }
  function sgStopPolling() {
    if (sgPollInterval) { clearInterval(sgPollInterval); sgPollInterval = null; }
  }

  async function sgPoll() {
    if (!SB_URL || !SB_KEY || !BIZ_ID) return;
    try {
      // Fetch new assistant/staff messages since last poll
      const since = encodeURIComponent(sgLastPollTime);
      const phone = sgClientPhone ? `&client_phone=eq.${encodeURIComponent(sgClientPhone)}` : '';
      // PostgREST in() syntax: role=in.(assistant,staff)
      // Also filter out null/empty text rows
      const url = `${SB_URL}/rest/v1/messages?business_id=eq.${BIZ_ID}${phone}&role=in.(assistant,staff)&created_at=gt.${since}&text=not.is.null&order=created_at.asc&limit=10`;

      const res = await fetch(url, {
        headers: {
          'apikey':         SB_KEY,
          'Authorization':  `Bearer ${SB_KEY}`,
          'Accept-Profile': 'salon',
        }
      });
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) return;

      rows.forEach(row => {
        if (sgSeenIds.has(row.id)) return;
        sgSeenIds.add(row.id);

        const msgText = (row.text || row.content || '').trim();
        if (!msgText || msgText === '__greeting__' || msgText === 'undefined') return;

        // Update poll cursor
        if (row.created_at > sgLastPollTime) sgLastPollTime = row.created_at;

        const role = String(row.role || '').toLowerCase();
        sgRemoveTyping();
        sgAddBubble(role === 'staff' ? 'staff' : 'ai', msgText, row.created_at);

        if (row.needs_human) {
          setTimeout(() => {
            const notice = document.createElement('div');
            notice.className = 'sg-human-notice';
            notice.textContent = '👤 A team member will follow up shortly';
            messages.appendChild(notice);
            sgScrollBottom();
          }, 800);
        }

        if (!isOpen) {
          unreadEl.classList.add('show');
          unreadEl.textContent = '1';
        }
      });
    } catch (_) {}
  }

  // Keep sgSubscribeRealtime name for compatibility — now starts polling
  function sgSubscribeRealtime() {
    sgStartPolling();
  }

  // ── Load message history ──────────────────────────────────────────────
  async function sgLoadHistory() {
    if (!sgClientPhone || !SB_URL || !SB_KEY) return;
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/messages?business_id=eq.${BIZ_ID}&client_phone=eq.${sgClientPhone}&order=created_at.asc&limit=20`,
        { headers: { apikey: SB_KEY, 'Accept-Profile': 'salon' } }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) return;
      rows.forEach(r => {
        if (sgSeenIds.has(r.id)) return;
        sgSeenIds.add(r.id);
        if (r.content === '__greeting__') return;
        const role = String(r.role || '').toLowerCase();
        if (role === 'client' || role === 'assistant' || role === 'staff') {
          sgAddBubble(role === 'client' ? 'client' : role === 'staff' ? 'staff' : 'ai', r.content, r.created_at);
        }
      });
    } catch (_) {}
  }

  // ── Init ──────────────────────────────────────────────────────────────
  sgRestoreSession();
  sgSubscribeRealtime();  // start listening immediately
  if (sgClientPhone) sgLoadHistory();

})();
