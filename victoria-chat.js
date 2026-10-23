/* ═══════════════════════════════════════════════════════════════════
   Victoria chat — the one copy, used by every page.
   One tag per page, at the end of <body>:
     <script src="victoria-chat.js"></script>
   (the home page adds data-page="home": its floating Book Now sits where
   the bubble would, so the bubble rides higher there).
   It loads victoria-chat.css, builds the floating bubble + panel, and runs
   the chat, in-chat booking and greeting.
═══════════════════════════════════════════════════════════════════ */
(function () {
  // The chat's booking and "My appointment" only work on https (the booking
  // service refuses http pages), so an http:// link moves to https:// first.
  if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
    return;
  }
  if (document.getElementById('vcpPanel')) return;   // already on the page

  var me = document.currentScript;
  if (me && me.getAttribute('data-page') === 'home') document.documentElement.classList.add('vcp-home');
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = me && me.src ? me.src.replace(/victoria-chat\.js(\?.*)?$/, 'victoria-chat.css') : 'victoria-chat.css';
  // hidden until the styles arrive, so the panel never flashes unstyled
  css.onload = css.onerror = function () {
    panel.style.visibility = ''; launcher.style.visibility = '';
    var m = document.getElementById('vcpMessages');   // a restored conversation opens at its latest message
    if (m) m.scrollTop = m.scrollHeight;
  };
  document.head.appendChild(css);

  // ── Markup: the panel + launcher ──────────────────────────────────
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'cls') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function chip(prompt, icon, big, small, extra) {
    var kids = [icon + ' '];
    if (small) kids.push(el('span', { cls: 'vcp-lg', text: big }), el('span', { cls: 'vcp-sm', text: small }));
    else kids.push(big);
    return el('button', { cls: 'vcp-prompt' + (extra ? ' vcp-extra' : ''), 'data-prompt': prompt }, kids);
  }

  var panel = el('div', { cls: 'victoria-chat-panel', id: 'vcpPanel', role: 'region', 'aria-label': 'Chat with Victoria' }, [
    el('div', { cls: 'vcp-header' }, [
      el('div', { cls: 'vcp-avatar' }, ['💅', el('div', { cls: 'vcp-status-dot' })]),
      el('div', { cls: 'vcp-info' }, [
        el('div', { cls: 'vcp-name', text: "Hi, I'm Victoria 💅" }),
        el('div', { cls: 'vcp-status-text', text: 'Your personal nail concierge · Online & ready to help' }),
      ]),
      el('button', { cls: 'vcp-close', id: 'vcpClose', 'aria-label': 'Close chat', text: '✕' }),
    ]),
    el('div', { cls: 'vcp-messages', id: 'vcpMessages', 'aria-live': 'polite', 'aria-label': 'Chat messages' }, [
      el('div', { cls: 'msg', id: 'openingMsg', style: 'opacity:0;transition:opacity .5s;' }, [
        el('div', { cls: 'msg-avatar', 'aria-hidden': 'true', text: '💅' }),
        el('div', { cls: 'msg-bubble' }, [
          "Hi there! I'm Victoria, your personal nail concierge at ", el('strong', { text: 'Victoria Nails' }), ' in South Elgin. 🌸',
          el('br'), el('br'),
          'I can help you book an appointment, check technician availability, find current promotions, explore our services & pricing, and more.',
          el('br'), el('br'),
          'What can I do for you today?',
        ]),
      ]),
    ]),
    el('div', { cls: 'vcp-prompts', id: 'vcpPrompts' }, [
      chip("I'd like to book an appointment", '📅', 'Book appointment', 'Book'),
      chip('Which technicians are available this week?', '👩‍🎨', 'Check availability', 'Availability'),
      chip('Do you have any current promotions or specials?', '🎁', 'Promotions', null, true),
      chip('What nail services do you offer and what are the prices?', '💰', 'Services & pricing', null, true),
      chip('What are your hours and where are you located?', '🕒', 'Hours & location', null, true),
      chip("I'd like someone from the front desk to contact me.", '📞', 'Contact the front desk', null, true),
      el('button', { cls: 'vcp-more', id: 'vcpMore', type: 'button', 'aria-expanded': 'false', 'aria-label': 'More questions', title: 'More questions', text: '⋯' }),
    ]),
    el('div', { cls: 'vcp-input-row' }, [
      el('input', { cls: 'vcp-input', id: 'vcpInput', type: 'text', placeholder: 'Ask me anything about Victoria Nails…', 'aria-label': 'Message Victoria', autocomplete: 'off' }),
      el('button', { cls: 'vcp-send', id: 'vcpSend', 'aria-label': 'Send message', text: '→' }),
    ]),
    el('p', { cls: 'vcp-note', text: 'Chats may be reviewed by our staff to help you better.' }),
  ]);
  var launcher = el('button', { cls: 'vcp-launcher', id: 'vcpLauncher', 'aria-label': 'Chat with Victoria', 'aria-expanded': 'false' },
                    ['💬', el('span', { cls: 'vcp-l-dot', 'aria-hidden': 'true' })]);
  panel.style.visibility = 'hidden';
  launcher.style.visibility = 'hidden';
  document.body.appendChild(panel);
  document.body.appendChild(launcher);


/* ══ Chat ══ */
(function(){

  /* ══ Victoria's opening message — animated fade in ══ */
  setTimeout(() => {
    const msg = document.getElementById('openingMsg');
    if (msg) msg.style.opacity = '1';
  }, 600);

  /* ══ Direct API call to SalonGenie AI ══
     Works on production (CORS allowed on real domain).
     On localhost: deploy to production to test live AI.
     The floating widget is fully hidden via CSS above.
  ══ */

  const chatHistory = [];
  let   isBusy      = false;

  // Always use the live n8n webhook. Works on production AND localhost
  // (the n8n webhook allows all origins), so you can test the real chat
  // locally without running the :9998 proxy. To restore the local proxy
  // for offline dev, swap this back to the hostname check:
  //   const PROXY_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  //     ? 'http://localhost:9998'
  //     : 'https://exodonprofits.app.n8n.cloud/webhook/victoria-receptionist';
  // Victoria answers from Salon Genie (Supabase function victoria-chat) since
  // 2026-10-18; the n8n webhook is retired.
  const PROXY_URL = 'https://pbojacnagutipfhcxltj.supabase.co/functions/v1/victoria-chat';

  const SERVICES = [
    'Manicure','Spa Manicure','French Manicure','Paraffin Manicure',
    'Pedicure','Spa Pedicure','Deluxe Pedicure','Golden Pedicure','Paraffin Pedicure',
    'Gel Manicure','Gel Pedicure','Gel French','Gel Removal',
    'Dip Powder','Dip French','Dip Removal',
    'Gel-X Full Set','Gel-X Fill','Gel-X Removal',
    'Acrylic Full Set','Acrylic Fill','Acrylic with Tips','Acrylic Removal',
    'Nail Art','Chrome Powder','Nail Gems','Ombre / Gradient',
    'Kids Manicure','Kids Pedicure','Kids Mani + Pedi',
    'Paraffin Treatment','Hot Stone Massage','Callus Removal','Polish Change','Eyebrow Wax',
  ];

  // Detect service from conversation history
  function detectServiceFromHistory() {
    const map = {
      'Gel-X Full Set':   ['gel-x','gelx','gel x'],
      'Gel Manicure':     ['gel mani','gel manicure'],
      'Gel Pedicure':     ['gel pedi','gel pedicure'],
      'Dip Powder':       ['dip powder','dip'],
      'Acrylic Full Set': ['acrylic full','full set'],
      'Acrylic Fill':     ['acrylic fill','fill in'],
      'Golden Pedicure':  ['golden pedicure','gold pedicure'],
      'Pedicure':         ['pedicure','pedi'],
      'Manicure':         ['manicure','mani'],
      'Nail Art':         ['nail art','design'],
      'Eyebrow Wax':      ['eyebrow wax','brow wax'],
    };
    const text = chatHistory.map(m => m.content || '').join(' ').toLowerCase();
    for (const [svc, kws] of Object.entries(map)) {
      if (kws.some(k => text.includes(k))) return svc;
    }
    return '';
  }

  // ── Robust reply extraction ───────────────────────────────────────
  // The page displays whatever the webhook sends back. Different n8n
  // setups return the assistant text under different keys: { reply },
  // { output } (AI Agent node), { text }, { answer }, a single-item
  // array, or nested under { json } / { data }. We check the common
  // shapes so a backend response-format change doesn't silently fall
  // through to the generic fallback. NOTE: this can't fix a webhook that
  // literally returns "ok" — that content must be fixed in the n8n
  // "Respond to Webhook" node (map it to the AI node's output).
  function extractReply(data) {
    if (data == null) return null;
    if (typeof data === 'string') return data.trim() || null;
    if (Array.isArray(data)) {
      for (const item of data) { const r = extractReply(item); if (r) return r; }
      return null;
    }
    const fields = ['reply', 'output', 'text', 'answer', 'response', 'content'];
    for (const f of fields) {
      if (typeof data[f] === 'string' && data[f].trim()) return data[f].trim();
    }
    if (data.json) return extractReply(data.json);   // n8n wraps items under .json
    if (data.data) return extractReply(data.data);
    return null;
  }

  // One request to Victoria. Gives up after 25 s; a failed or garbled
  // answer comes back as an error with a short reason code.
  async function postVictoria(payload) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 25000) : null;
    try {
      let res;
      try {
        res = await fetch(PROXY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                       body: JSON.stringify(payload), signal: ctl ? ctl.signal : undefined });
      } catch (e) { throw new Error(e && e.name === 'AbortError' ? 'timeout' : 'network'); }
      if (!res.ok) throw new Error('http-' + res.status);
      try { return await res.json(); } catch (e) { throw new Error('bad-reply'); }
    } finally { if (timer) clearTimeout(timer); }
  }

  // ── Main chat function ────────────────────────────────────────────
  // One id per visit (this tab), so the salon can read a chat as one conversation
  function chatSession() {
    let id = '';
    try { id = sessionStorage.getItem('vcpSession') || ''; } catch (e) {}
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
         : 'v' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      try { sessionStorage.setItem('vcpSession', id); } catch (e) {}
      window._vcpSession = window._vcpSession || id;
    }
    return window._vcpSession || id;
  }

  async function askVictoria(userMsg) {
    chatHistory.push({ role: 'user', content: userMsg });
    const payload = {
      message:      userMsg,
      session_id:   chatSession(),
      history:      chatHistory.slice(-10),
      client_phone: window._vcPhone || undefined,
      chat_booking: window.vBook ? true : undefined,   // ?book=v2: the AI points to "Book here in the chat"
    };
    let data = null, why = '';
    try {
      // a one-off blip (network, timeout, server error) gets one quiet retry
      try { data = await postVictoria(payload); }
      catch (e1) { await new Promise(r => setTimeout(r, 1200)); data = await postVictoria(payload); }
    } catch (err) {
      why = err && err.message || 'unknown';
      console.warn('[Victoria]', why);
    }
    removeTyping();
    isBusy = false;
    if (!data) {
      addVictoriaBubble("I'm having a little trouble right now — please try again, or call us at (847) 931-9359. We'd love to help! 💅");
      const w = document.getElementById('vcpMessages');
      if (w) {
        const code = document.createElement('div');
        code.style.cssText = 'margin:-4px 0 8px 48px;font-size:11px;color:#a89c94;';
        code.textContent = 'code: ' + why;
        w.appendChild(code); w.scrollTop = w.scrollHeight;
      }
      return;
    }
    const reply = extractReply(data);
    if (reply) { chatHistory.push({ role: 'assistant', content: reply }); addVictoriaBubble(reply); }
    else { addVictoriaBubble("I received your message! You can also call us at (847) 931-9359 for the fastest help."); }
    // Buttons under the reply; a problem here must not turn into "having trouble"
    try {
      if (window.vBook) window.vBook.afterReply(userMsg, reply, data && data.offer, data && data.handoff_note, data && data.waitlist_tech);   // ?book=v2: the button Victoria chose
      // Booking happens on the Galaxy booking page (or in the chat with ?book=v2)
      if ((data.show_tech_picker && data.techs && data.techs.length) || (data.slots && data.slots.length)) {
        renderBookingLink();
      }
    } catch (e) { console.warn('[Victoria] buttons', e && e.message); }
  }

  // ── Book-online button (Galaxy booking page) ──────────────────────
  function renderBookingLink() {
    if (window.vBook && window.vBook.offer()) return;           // ?book=v2: book in the chat instead
    const wrap = document.getElementById('vcpMessages');
    if (!wrap) return;
    document.querySelectorAll('.vc-slot-row, .vc-booking-form, .vc-tech-row').forEach(el => el.remove());
    const row = document.createElement('div');
    row.className = 'vc-slot-row';
    const a = document.createElement('a');
    a.href = 'https://booking.galaxyaccess.us/victoria349';
    a.target = '_blank';
    a.rel = 'noopener';
    a.className = 'btn btn-primary btn-sm';
    a.textContent = '📅 Book online';
    row.appendChild(a);
    wrap.appendChild(row);
    wrap.scrollTop = wrap.scrollHeight;
  }

  // ── Tech picker buttons ───────────────────────────────────────────
  function renderTechPicker(techs, detectedService) {
    const wrap = document.getElementById('vcpMessages');
    if (!wrap) return;
    document.querySelectorAll('.vc-slot-row, .vc-booking-form, .vc-tech-row').forEach(el => el.remove());

    const container = document.createElement('div');
    container.className = 'vc-tech-row';
    container.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:6px 12px 4px 48px;';

    // "Anyone" option first
    const anyBtn = document.createElement('button');
    anyBtn.style.cssText = 'background:#d4a96a;color:#1a1a1a;border:none;border-radius:20px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;';
    anyBtn.textContent = '✦ Anyone Available';
    anyBtn.onclick = () => fetchSlotsForTech(null, detectedService);
    container.appendChild(anyBtn);

    // Individual techs
    techs.forEach(tech => {
      const btn = document.createElement('button');
      btn.style.cssText = 'background:#1a1a1a;color:#d4a96a;border:1px solid #d4a96a;border-radius:20px;padding:7px 16px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .2s;';
      btn.textContent = tech.name;
      btn.onmouseover = () => { btn.style.background='#d4a96a'; btn.style.color='#1a1a1a'; };
      btn.onmouseout  = () => { btn.style.background='#1a1a1a'; btn.style.color='#d4a96a'; };
      btn.onclick = () => fetchSlotsForTech(tech.id, detectedService, tech.name);
      container.appendChild(btn);
    });

    wrap.appendChild(container);
    wrap.scrollTop = wrap.scrollHeight;
  }

  // ── Fetch slots after tech is selected ───────────────────────────
  async function fetchSlotsForTech(techId, service, techName) {
    document.querySelectorAll('.vc-tech-row').forEach(el => el.remove());
    const label = techName ? `with ${techName}` : 'with anyone available';
    addUserBubble(techName ? techName : 'Anyone available');
    showTyping();
    isBusy = true;
    try {
      const res = await fetch(PROXY_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          get_slots:   true,
          tech_id:     techId || null,
          message:     `show available slots ${label}`,
          history:     chatHistory.slice(-6),
          client_phone: window._vcPhone || undefined,
        }),
      });
      const data = await res.json();
      if (data.reply) { chatHistory.push({ role:'assistant', content: data.reply }); addVictoriaBubble(data.reply); }
      if (data.slots && data.slots.length) {
        renderSlotButtons(data.slots, service);
      } else {
        addVictoriaBubble("No open slots found for that selection. Try another technician or call us at (847) 931-9359.");
      }
    } catch(e) {
      addVictoriaBubble("Something went wrong. Please call (847) 931-9359.");
    } finally {
      removeTyping();
      isBusy = false;
    }
  }

  // ── Slot buttons ──────────────────────────────────────────────────
  function renderSlotButtons(slots, preselectedService) {
    const wrap = document.getElementById('vcpMessages');
    if (!wrap) return;
    document.querySelectorAll('.vc-slot-row, .vc-booking-form').forEach(el => el.remove());
    const container = document.createElement('div');
    container.className = 'vc-slot-row';
    container.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;padding:6px 12px 4px 48px;';
    slots.forEach(slot => {
      const btn = document.createElement('button');
      btn.style.cssText = 'background:#1a1a1a;color:#d4a96a;border:1px solid #d4a96a;border-radius:20px;padding:6px 14px;font-size:12px;cursor:pointer;font-family:inherit;transition:all .2s;white-space:nowrap;';
      btn.textContent = slot.label + ' · ' + slot.tech_name;
      btn.onmouseover = () => { btn.style.background='#d4a96a'; btn.style.color='#1a1a1a'; };
      btn.onmouseout  = () => { btn.style.background='#1a1a1a'; btn.style.color='#d4a96a'; };
      btn.onclick = () => showBookingForm(slot, preselectedService || detectServiceFromHistory());
      container.appendChild(btn);
    });
    wrap.appendChild(container);
    wrap.scrollTop = wrap.scrollHeight;
  }

  // ── Booking form ──────────────────────────────────────────────────
  function showBookingForm(slot, preselectedService) {
    document.querySelectorAll('.vc-slot-row, .vc-booking-form').forEach(el => el.remove());
    const wrap = document.getElementById('vcpMessages');
    if (!wrap) return;
    const detectedService = preselectedService || detectServiceFromHistory();

    const form = document.createElement('div');
    form.className = 'vc-booking-form';
    form.style.cssText = 'margin:8px 12px 4px 12px;background:#1e1e1e;border:1px solid #d4a96a44;border-radius:14px;padding:16px;';
    form.innerHTML = `
      <div style="font-size:13px;color:#d4a96a;font-weight:600;margin-bottom:12px;">
        📅 ${slot.label} &nbsp;·&nbsp; 💅 ${slot.tech_name}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <input id="vc-name" type="text" placeholder="Your name *"
          style="background:#111;color:#eee;border:1px solid #444;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;">
        <input id="vc-phone" type="tel" placeholder="Phone number *"
          style="background:#111;color:#eee;border:1px solid #444;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;">
        <select id="vc-service"
          style="background:#111;color:#eee;border:1px solid #444;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;">
          <option value="">Select a service *</option>
          ${SERVICES.map(s => `<option value="${s}" ${s === detectedService ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <input id="vc-notes" type="text" placeholder="Notes (optional — nail shape, color, etc.)"
          style="background:#111;color:#eee;border:1px solid #444;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;outline:none;width:100%;box-sizing:border-box;">
        <div style="display:flex;gap:8px;margin-top:4px;">
          <button id="vc-confirm-btn"
            style="flex:1;background:#d4a96a;color:#1a1a1a;border:none;border-radius:20px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">
            ✅ Confirm Booking
          </button>
          <button id="vc-cancel-btn"
            style="background:#1a1a1a;color:#888;border:1px solid #444;border-radius:20px;padding:10px 16px;font-size:13px;cursor:pointer;font-family:inherit;">
            Cancel
          </button>
        </div>
        <div id="vc-form-error" style="color:#e07070;font-size:12px;display:none;"></div>
        ${detectedService ? '<div style="font-size:11px;color:#d4a96a99;margin-top:-4px;">✦ Pre-filled from your conversation</div>' : ''}
      </div>`;

    wrap.appendChild(form);
    wrap.scrollTop = wrap.scrollHeight;
    document.getElementById('vc-name').focus();

    document.getElementById('vc-cancel-btn').onclick = () => {
      form.remove();
      addVictoriaBubble("No problem! Let me know if you'd like to try a different time. 💅");
    };

    document.getElementById('vc-confirm-btn').onclick = async () => {
      const name    = document.getElementById('vc-name').value.trim();
      const phone   = document.getElementById('vc-phone').value.trim();
      const service = document.getElementById('vc-service').value;
      const notes   = document.getElementById('vc-notes').value.trim();
      const errEl   = document.getElementById('vc-form-error');
      if (!name || !phone || !service) {
        errEl.textContent = 'Please fill in your name, phone, and service.';
        errEl.style.display = 'block'; return;
      }
      errEl.style.display = 'none';
      document.getElementById('vc-confirm-btn').textContent = 'Booking...';
      document.getElementById('vc-confirm-btn').disabled = true;
      form.remove();
      if (phone) window._vcPhone = phone;
      addUserBubble(`Book: ${slot.label} with ${slot.tech_name} — ${service}`);
      showTyping(); isBusy = true;
      try {
        const res = await fetch(PROXY_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            book_slot:    { ...slot, service },
            client_name:  name,
            client_phone: phone,
            service:      service,
            notes:        notes || undefined,
          }),
        });
        const data = await res.json();
        if (data.slot_taken) {
          addVictoriaBubble("Oh no — that slot was just taken! Let me find you another opening...");
          const r2 = await fetch(PROXY_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ get_slots: true, tech_id: null, message: 'show available slots', history: [] }),
          });
          const d2 = await r2.json();
          if (d2.slots && d2.slots.length) renderSlotButtons(d2.slots, service);
        } else {
          chatHistory.push({ role: 'assistant', content: data.reply });
          addVictoriaBubble(data.reply);
        }
      } catch(e) {
        addVictoriaBubble("Sorry, something went wrong. Please call us at (847) 931-9359 to book.");
      } finally { removeTyping(); isBusy = false; }
    };
  }

  function handleSend(msg) {
    msg = (msg || '').trim();
    if (!msg || isBusy) return;
    // Typed while the chat's own form waits for a pick (the waitlist's service): the form takes it
    if (window.vBook && window.vBook.typed && window.vBook.typed(msg)) return;
    isBusy = true;
    addUserBubble(msg);
    showTyping();
    askVictoria(msg);
  }

  /* Prompt chip clicks (the extra ones fold away again after a pick) */
  const vcpPrompts = document.getElementById('vcpPrompts');
  const vcpMore = document.getElementById('vcpMore');
  const setMore = open => {
    if (!vcpPrompts || !vcpMore) return;
    vcpPrompts.classList.toggle('open', open);
    vcpMore.textContent = open ? '✕ Less' : '⋯';
    vcpMore.setAttribute('aria-expanded', String(open));
  };
  if (vcpMore) vcpMore.addEventListener('click', () => setMore(!vcpPrompts.classList.contains('open')));
  document.querySelectorAll('.vcp-prompt').forEach(btn => {
    btn.addEventListener('click', () => {
      setMore(false);
      handleSend(btn.dataset.prompt || btn.textContent.trim());
    });
  });

  /* Text input */
  const inp = document.getElementById('vcpInput');
  const snd = document.getElementById('vcpSend');
  if (snd) snd.addEventListener('click', () => { const v = inp.value.trim(); if (v) { inp.value = ''; handleSend(v); } });
  if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = inp.value.trim(); if (v) { inp.value = ''; handleSend(v); } } });

  /* ── Keep the conversation across pages (this tab, this visit) ──
     Every bubble is saved to sessionStorage and put back on the next page,
     with chatHistory, so Victoria keeps the context. Booking cards and
     buttons aren't kept: a booking left half-done starts over. */
  const SAVE_KEY = 'vcp_transcript';
  const SAVE_MAX = 60;   // bubbles kept
  function saveTranscript() {
    const wrap = document.getElementById('vcpMessages');
    if (!wrap) return;
    const rows = [];
    Array.prototype.forEach.call(wrap.children, r => {
      if (!r.classList.contains('msg') || r.id === 'openingMsg' || r.id === 'typingRow') return;
      const b = r.querySelector('.msg-bubble');
      if (b) rows.push({ who: r.classList.contains('user') ? 'user' : 'victoria', html: b.innerHTML });
    });
    try { sessionStorage.setItem(SAVE_KEY, JSON.stringify({ rows: rows.slice(-SAVE_MAX), history: chatHistory.slice(-20) })); } catch (e) {}
  }
  // Saved bubble markup goes back through a short allow-list (text, bold,
  // line breaks, lists, https/tel links), never as raw HTML
  function cleanNodes(html) {
    const src = document.createElement('template');
    src.innerHTML = html;
    const out = document.createDocumentFragment();
    (function copy(from, to) {
      Array.prototype.forEach.call(from.childNodes, n => {
        if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName.toLowerCase();
        if (tag === 'br') { to.appendChild(document.createElement('br')); return; }
        if (['strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'span', 'a'].indexOf(tag) === -1) { copy(n, to); return; }
        const e = document.createElement(tag);
        if (tag === 'a') {
          const href = n.getAttribute('href') || '';
          if (/^https:\/\//i.test(href)) { e.setAttribute('href', href); e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener'); }
          else if (/^tel:/i.test(href)) e.setAttribute('href', href);
        }
        copy(n, e);
        to.appendChild(e);
      });
    })(src.content, out);
    return out;
  }
  function restoreTranscript() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(SAVE_KEY) || 'null'); } catch (e) {}
    const wrap = document.getElementById('vcpMessages');
    if (!wrap || !saved || !Array.isArray(saved.rows) || !saved.rows.length) return false;
    saved.rows.forEach(r => {
      const user = r && r.who === 'user';
      const av = document.createElement('div');
      av.className = 'msg-avatar';
      av.textContent = user ? 'You' : '💅';
      if (!user) av.setAttribute('aria-hidden', 'true');
      const b = document.createElement('div');
      b.className = 'msg-bubble';
      b.appendChild(cleanNodes(String(r && r.html || '')));
      const row = document.createElement('div');
      row.className = user ? 'msg user' : 'msg';
      row.appendChild(av);
      row.appendChild(b);
      wrap.appendChild(row);
    });
    if (Array.isArray(saved.history)) saved.history.forEach(m => {
      if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') chatHistory.push({ role: m.role, content: m.content });
    });
    const om = document.getElementById('openingMsg');
    if (om) om.style.opacity = '1';
    wrap.scrollTop = wrap.scrollHeight;
    return true;
  }
  window._vcpRestored = restoreTranscript();   // the greeting skips its typing when true
  (function () {
    const wrap = document.getElementById('vcpMessages');
    if (!wrap || typeof MutationObserver !== 'function') return;
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(saveTranscript, 300); }).observe(wrap, { childList: true });
    window.addEventListener('pagehide', saveTranscript);
  })();

  /* ── Floating launcher: open / close the chat panel ── */
  (function () {
    const panel    = document.getElementById('vcpPanel');
    const launcher = document.getElementById('vcpLauncher');
    const closeBtn = document.getElementById('vcpClose');
    if (!panel || !launcher) return;

    let opened = false;
    // auto = opened by the page itself: don't focus the input (that would
    // scroll the page and, on touch screens, pop the keyboard)
    // phones: the panel starts right under the site header
    function placePanel() {
      const h = document.getElementById('site-header');
      const b = h ? Math.round(h.getBoundingClientRect().bottom) : 80;
      panel.style.setProperty('--vcp-top', Math.max(8, b + 8) + 'px');
    }
    window.addEventListener('resize', placePanel);
    window.addEventListener('scroll', () => { if (panel.classList.contains('vcp-open')) placePanel(); }, { passive: true });
    function openChat(auto) {
      hideTeaser();
      placePanel();
      panel.classList.add('vcp-open');
      launcher.classList.add('vcp-active');
      launcher.setAttribute('aria-expanded', 'true');
      launcher.innerHTML = '✕';
      // Reveal the opening greeting the first time it's opened
      const om = document.getElementById('openingMsg');
      if (om) om.style.opacity = '1';
      opened = true;
      try { sessionStorage.setItem('vcp_open', '1'); } catch (e) {}
      const w = document.getElementById('vcpMessages');
      if (w) w.scrollTop = w.scrollHeight;
      if (auto !== true) setTimeout(() => { const i = document.getElementById('vcpInput'); if (i) i.focus(); }, 250);
    }
    function closeChat() {
      // closed by the visitor: don't open it again on the next page of this visit
      try { sessionStorage.setItem('vcp_closed', '1'); sessionStorage.setItem('vcp_open', '0'); } catch (e) {}
      panel.classList.remove('vcp-open');
      launcher.classList.remove('vcp-active');
      launcher.setAttribute('aria-expanded', 'false');
      launcher.innerHTML = '💬<span class="vcp-l-dot" aria-hidden="true"></span>';
    }
    launcher.addEventListener('click', () => { panel.classList.contains('vcp-open') ? closeChat() : openChat(); });
    launcher.addEventListener('click', hideTeaser);
    if (closeBtn) closeBtn.addEventListener('click', closeChat);
    // "Chat Now" buttons open this panel
    window.sgOpenChat = () => openChat();

    // Phones: greeting bubble beside the launcher; tap it to open the chat
    let teaser = null;
    function hideTeaser() { if (teaser) { teaser.remove(); teaser = null; } }
    function showTeaser() {
      teaser = document.createElement('div');
      teaser.className = 'vcp-teaser';
      teaser.setAttribute('role', 'button');
      teaser.setAttribute('tabindex', '0');
      teaser.textContent = "\u{1F44B} Hi! I'm Victoria. Ask me about services, prices or openings.";
      const x = document.createElement('button');
      x.className = 'vcp-teaser-x';
      x.setAttribute('aria-label', 'Dismiss');
      x.textContent = '\u2715';
      x.addEventListener('click', e => {
        e.stopPropagation(); hideTeaser();
        try { sessionStorage.setItem('vcp_closed', '1'); } catch (err) {}
      });
      teaser.appendChild(x);
      teaser.addEventListener('click', () => openChat());
      teaser.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChat(); } });
      document.body.appendChild(teaser);
    }

    // Open by default: the full chat on tablets and computers, the greeting
    // bubble on phones (the full panel would cover most of a phone screen).
    // Not again in this visit once the visitor has closed it.
    // Mid-conversation (restored from the last page): open again only if it
    // was open when they left, on any screen, and skip the greeting bubble.
    let closedBefore = false, wasOpen = false;
    try {
      closedBefore = sessionStorage.getItem('vcp_closed') === '1';
      wasOpen = sessionStorage.getItem('vcp_open') === '1';
    } catch (e) {}
    if (window._vcpRestored) {
      if (wasOpen) openChat(true);
    } else if (!closedBefore) {
      setTimeout(() => {
        if (panel.classList.contains('vcp-open')) return;
        if (window.matchMedia('(max-width: 620px)').matches) showTeaser();
        else openChat(true);
      }, 1200);
    }
    // Close on Escape
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('vcp-open')) closeChat(); });
  })();

  /* Chat bubble helpers */
  function addUserBubble(text) {
    const wrap = document.getElementById('vcpMessages');
    if (!wrap) return;
    const div = document.createElement('div');
    div.className = 'msg user';
    const av = document.createElement('div');
    av.className = 'msg-avatar';
    av.textContent = 'You';
    const bub = document.createElement('div');
    bub.className = 'msg-bubble';
    bub.textContent = text;
    div.appendChild(av);
    div.appendChild(bub);
    div.style.opacity = '0'; div.style.transition = 'opacity .3s';
    wrap.appendChild(div);
    requestAnimationFrame(() => { div.style.opacity = '1'; });
    wrap.scrollTop = wrap.scrollHeight;
  }

  /* Victoria reply bubble */
  function addVictoriaBubble(text) {
    const wrap = document.getElementById('vcpMessages');
    if (!wrap) return;
    const div = document.createElement('div');
    div.className = 'msg';
    // Convert newlines to <br> and basic markdown **bold**
    const formatted = text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
      .replace(/\n/g,'<br/>');
    div.innerHTML = `<div class="msg-avatar" aria-hidden="true">💅</div><div class="msg-bubble">${formatted}</div>`;
    div.style.opacity = '0'; div.style.transition = 'opacity .4s';
    wrap.appendChild(div);
    requestAnimationFrame(() => { div.style.opacity = '1'; });
    wrap.scrollTop = wrap.scrollHeight;
  }

  let typingEl = null;
  function showTyping() {
    const wrap = document.getElementById('vcpMessages');
    if (!wrap) return;
    const row = document.createElement('div');
    row.className = 'msg';
    row.id = 'typingRow';
    row.innerHTML = `<div class="msg-avatar" aria-hidden="true">💅</div>
      <div class="typing-indicator" aria-label="Victoria is typing">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>`;
    wrap.appendChild(row);
    typingEl = row;
    wrap.scrollTop = wrap.scrollHeight;
  }
  function removeTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }

  })();

/* ══ Victoria books in the chat ══ */
(function () {
  // Live for every visitor (2026-10-14). ?book=off turns it off for this tab
  // (testing the old chat); ?book=v2 turns it back on. The salon's own
  // switches (Salon Genie → Settings → Victoria) still decide what works.
  var on = true;
  try {
    var q = new URLSearchParams(location.search).get('book');
    if (q === 'off') sessionStorage.setItem('vb', 'off');
    if (q === 'v2') sessionStorage.removeItem('vb');
    on = sessionStorage.getItem('vb') !== 'off';
  } catch (e) { on = new URLSearchParams(location.search).get('book') !== 'off'; }
  if (!on) return;

  var FN = 'https://pbojacnagutipfhcxltj.supabase.co/functions/v1/victoria-book';
  var BIZ = '0af9e368-f488-449b-8013-7f44361be462';
  var SITE_KEY = '0x4AAAAAAFWHTVtszh0YkqvD';
  var TZ = 'America/Chicago';
  var DAYS_SHOWN = 92;   // the most the chat offers; the posted schedule (bookable_through) usually ends sooner
  var PHONE = '(847) 931-9359';
  var GALAXY = 'https://booking.galaxyaccess.us/victoria349';

  var st = { known: {}, text: '', through: undefined, services: null, service: null, day: null, slots: [], time: null, tech: null, token: '', tsId: null, wantTime: null, wantDay: null, said: [] };
  var card = null, offer = null;

  // ── small helpers ─────────────────────────────────────────────────────
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === 'text') n.textContent = props[k];
      else if (k === 'cls') n.className = props[k];
      else if (k === 'on') Object.keys(props.on).forEach(function (e) { n.addEventListener(e, props.on[e]); });
      else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function msgs() { return document.getElementById('vcpMessages'); }
  function scroll() { var w = msgs(); if (w) w.scrollTop = w.scrollHeight; }
  function bubble(who, nodes) {
    var w = msgs(); if (!w) return;
    var av = el('div', { cls: 'msg-avatar', text: who === 'user' ? 'You' : '💅' });
    if (who !== 'user') av.setAttribute('aria-hidden', 'true');
    var row = el('div', { cls: who === 'user' ? 'msg user' : 'msg' }, [av, el('div', { cls: 'msg-bubble' }, nodes)]);
    w.appendChild(row); scroll();
  }
  function say(text) { bubble('victoria', [text]); }
  function sayNodes(nodes) { bubble('victoria', nodes); }
  function you(text) { bubble('user', [text]); }
  function galaxyLink(text) { return el('a', { href: GALAXY, target: '_blank', rel: 'noopener', text: text || 'our booking page' }); }
  function setCard(nodes, wide) {
    var w = msgs(); if (!w) return;
    if (card) card.remove();
    card = el('div', { cls: 'vb-card' + (wide ? ' vb-wide' : '') }, nodes);
    w.appendChild(card); scroll();
  }
  function closeCard() { if (card) { card.remove(); card = null; } }
  function call(body) {
    body.business_id = BIZ;
    return fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'server_error' }; }); })
      .catch(function () { return { ok: false, error: 'network' }; });
  }

  // ── dates and times (salon time) ──────────────────────────────────────
  function salonToday() {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return p.slice(0, 10);   // YYYY-MM-DD
  }
  function addDays(ymd, n) {
    var d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function dayLabel(ymd, i) {
    if (i === 0) return 'Today';
    if (i === 1) return 'Tomorrow';
    var d = new Date(ymd + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' });
  }
  function longDay(ymd) {
    var d = new Date(ymd + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
  }
  function to12(t) { var h = +t.slice(0, 2), m = t.slice(3, 5); return ((h + 11) % 12 + 1) + ':' + m + (h < 12 ? ' AM' : ' PM'); }
  function mins(t) { return +t.slice(0, 2) * 60 + +t.slice(3, 5); }

  // What the visitor said, used only to pre-select a day and point at a
  // time. Nothing typed is ever sent to the booking itself.
  function readWishes() {
    var text = st.said.slice(-4).join(' ').toLowerCase();
    st.text = ' ' + text.replace(/[^a-z0-9&+:' ]+/g, ' ') + ' ';
    var m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/g);
    st.wantTime = null;
    if (m) {
      var last = m[m.length - 1].match(/(\d{1,2})(?::(\d{2}))?\s*([ap])/);
      var h = +last[1] % 12 + (last[3] === 'p' ? 12 : 0);
      if (h >= 0 && h < 24) st.wantTime = h * 60 + (last[2] ? +last[2] : 0);
    }
    var today = salonToday(), wd = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    // The day: what the visitor said (the last one they mentioned); if they
    // said none, the one day Victoria's last answer was about (only if one)
    var said = daysIn(text), replied = daysIn(String(st.lastReply || '').toLowerCase());
    st.wantDay = said.length ? said[said.length - 1].day
               : uniqueDays(replied).length === 1 ? replied[0].day : null;
  }
  // Days mentioned in a text, in the order mentioned: today, tomorrow,
  // weekdays (next 7 days), "Oct 16" / "October 16", "10/16"
  function daysIn(text) {
    var today = salonToday(), found = [], m, re;
    var wd = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    function add(at, day) { if (day && day >= today && day <= addDays(today, 30)) found.push({ at: at, day: day }); }
    re = /\b(today|tonight|tomorrow)\b/g;
    while ((m = re.exec(text))) add(m.index, m[1] === 'tomorrow' ? addDays(today, 1) : today);
    for (var i = 0; i < 7; i++) {
      var d = addDays(today, i), name = wd[new Date(d + 'T12:00:00Z').getUTCDay()];
      re = new RegExp('\\b' + name.slice(0, 3) + '(' + name.slice(3) + ')?\\b', 'g');
      while ((m = re.exec(text))) add(m.index, d);
    }
    var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    function md(mo, dd) {
      if (!(mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31)) return null;
      var y = +today.slice(0, 4), v = y + '-' + String(mo).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
      return v < today ? (y + 1) + v.slice(4) : v;
    }
    re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(st|nd|rd|th)?\b/g;
    while ((m = re.exec(text))) add(m.index, md(months.indexOf(m[1]) + 1, +m[2]));
    re = /\b(\d{1,2})\/(\d{1,2})\b/g;
    while ((m = re.exec(text))) add(m.index, md(+m[1], +m[2]));
    return found.sort(function (a, b) { return a.at - b.at; });
  }
  function uniqueDays(list) { var u = []; list.forEach(function (x) { if (u.indexOf(x.day) < 0) u.push(x.day); }); return u; }

  // ── step 1: service ───────────────────────────────────────────────────
  function start() {
    if (offer) { offer.remove(); offer = null; }
    st.flow = 'book';
    readWishes();
    st.service = null; st.day = null; st.time = null; st.tech = null; st.onlyTech = null; st.allTechs = false; st.autoAll = null;
    st.techFirst = null; st.techFirstDays = null; st.techFirstFor = null;
    setCard([el('p', { cls: 'vb-note', text: st.services ? 'One moment…' : 'Loading services…' })]);
    // Is this visitor allowed to book right now? Ask first, so nobody picks a
    // service, day, time and tech only to hit the hourly limit at the end.
    // (Asking doesn't count as a try; the form step asks again.)
    Promise.all([call({ action: 'check' }), st.services ? null : call({ action: 'services' })]).then(function (both) {
      var c = both[0] || {};
      if (!c.ok && c.error !== 'bad_request' && c.error !== 'network') { closeCard(); if (stopped(c)) return; }
      if (st.services) return pickService();
      var r = both[1] || {};
      if (!r.ok || !r.services || !r.services.length) {
        closeCard();
        sayNodes(['I can\'t book in the chat right now. You can book on ', galaxyLink(), ' or call us at ' + PHONE + '.']);
        return;
      }
      keepServices(r);
      pickService();
    });
  }
  function keepServices(r) {
    st.services = r.services;
    // the last day the chat can book (the posted schedule); undefined from an
    // older booking function: offer every day as before
    if ('bookable_through' in r) st.through = r.bookable_through || '';
    // every bookable technician's name, so one named in the chat is known
    // even on a day they have no open times
    (r.tech_names || []).forEach(function (n) { if (typeof n === 'string' && n) st.known[n.toLowerCase()] = n; });
    // "Pick a technician first": who the chat can book, by Galaxy id (older booking function: none)
    st.techList = Array.isArray(r.techs) ? r.techs.filter(function (t) { return t && t.id && t.name; }) : [];
    // the waitlist switch (Settings → Victoria); older booking function: only when Victoria offers it
    if (r.waitlist === true) st.waitlistOn = true;
  }
  // What visitors say → words in Galaxy's service names. Used only to put
  // likely services first as buttons; the visitor still taps one.
  var WORDS = [
    [/\b(pedi|pedis|pedicures?|toes?|feet|foot)\b/, /pedicure/i],
    [/\b(mani|manis|manicures?|hands?)\b/, /manicure|mani-pedi/i],
    [/\bmani ?(and |& |-)?pedi|manicure (and|&) pedicure/, /manicure & pedicure|mani-pedi/i],
    [/\b(fills?|refill|fill in|fill-in)\b/, /fill/i],
    [/\b(full ?sets?|new sets?)\b/, /full set|\bset\b/i],
    [/\b(acrylics?)\b/, /full set|fill/i],
    [/\b(dips?|sns|powder)\b/, /dip|powder/i],
    [/\bgel ?-?x\b|\bgelx\b/, /gel x/i],
    [/\b(gel|gels|no ?-?chip|shellac)\b/, /no-?chip|\bgel\b/i],
    [/\b(builder|biab)\b/, /builder/i],
    [/\bombre\b/, /ombre/i],
    [/\bpink (and|&) white\b|\bp ?& ?w\b/, /pink & white/i],
    [/\b(removal|remove|take off|soak off)\b/, /removal/i],
    [/\b(repair|broken|broke|fix)\b/, /repair/i],
    [/\b(polish change|change (my )?polish|color change)\b/, /polish change/i],
    [/\b(eyebrows?|brows?|wax|waxing|lip|chin|face|facial)\b/, /eyebrow|\blip\b|face/i],
    [/\b(kids?|child|children|daughter|son)\b/, /\bkid/i],
    [/\b(nail art|designs?)\b/, /nail art/i],
    [/\bfrench\b/, /french/i], [/\bvolcano\b/, /volcano/i], [/\b(golden|gold)\b/, /golden/i], [/\bcollagen\b/, /collagen/i],
    [/\bplatinum\b/, /platinum/i], [/\borganic\b/, /organic/i], [/\bspa\b/, /\bspa\b/i], [/\bcbd\b/, /cbd/i], [/\bclassic\b/, /classic/i],
  ];
  function likelyServices() {
    var groups = [];
    WORDS.forEach(function (w) { if (w[0].test(st.text || '')) groups.push(w[1]); });
    if (!groups.length) return [];
    var scored = [];
    var fixing = /\b(removal|remove|take off|soak off|repair|broken|broke|fix)\b/.test(st.text || '');
    st.services.forEach(function (s) {
      if (!fixing && /removal|repair/i.test(s.name)) return;   // only when they ask for it
      var n = 0;
      groups.forEach(function (g) { if (g.test(s.name)) n++; });
      if (n) scored.push({ s: s, n: n });
    });
    var best = 0;
    scored.forEach(function (x) { if (x.n > best) best = x.n; });
    return scored.filter(function (x) { return x.n === best; }).map(function (x) { return x.s; });
  }
  function serviceLabel(s) { return s.name; }
  // cheapest first, then A–Z; services without a price go last
  function byPriceThenName(a, b) {
    var pa = a.price != null ? Number(a.price) : Infinity, pb = b.price != null ? Number(b.price) : Infinity;
    return pa !== pb ? (pa < pb ? -1 : 1) : String(a.name).localeCompare(String(b.name));
  }
  function chooseService(s) { st.service = s; you(s.name); if (st.flow === 'waitlist') return waitlistForm(); pickDay(); }

  function pickService() {
    if (st.flow === 'change') {
      closeCard();
      say('To change the service too, the front desk can help. Tap below and tell them what you\'d like.');
      st.handoffNote = changeNote();
      return showOffer('handoff', true);
    }
    var likely = likelyServices();
    if (likely.length) {
      var hi = st.flow === 'waitlist' ? 'Sure! ' : 'Happy to book you in! ';
      say(likely.length === 1 ? hi + 'Is this the service you\'d like?' : hi + 'Which of these would you like?');
      var row = el('div', { cls: 'vb-row' });
      likely.forEach(function (s) {
        row.appendChild(el('button', { cls: 'vb-btn', type: 'button', text: serviceLabel(s), on: { click: function () { chooseService(s); } } }));
      });
      setCard([row, back('Something else', allServices)]);
      return;
    }
    allServices(true);
  }
  // Categories by service name (Galaxy's own categories don't reach us).
  // First rule that matches wins; anything new and unmatched lands in Other.
  var CATEGORIES = [
    ['Kids', /\bkid/i],
    ['Mani + Pedi', /manicure & pedicure|mani-pedi/i],
    ['Polish Change', /polish change/i],
    ['Repairs & Removal', /repair|removal/i],
    ['Pedicures', /pedicure/i],
    ['Manicures', /manicure/i],
    ['Dip Powder', /\bdip\b/i],
    ['Gel X & Builder Gel', /gel x|builder/i],
    ['Acrylic: Full Sets & Fills', /full set|fill|powder/i],
    ['Waxing', /eyebrow|\blip\b|face/i],
    ['Nail Art', /nail art/i],
  ];
  function categoryOf(s) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i][1].test(s.name)) return CATEGORIES[i][0];
    return 'Other';
  }
  function allServices(first) {
    say(first !== true ? 'What kind of service would you like?'
        : st.flow === 'waitlist' ? 'Sure! Which service is it for?' : 'Happy to book you in! What kind of service would you like?');
    var groups = {}, order = CATEGORIES.map(function (c) { return c[0]; }).concat('Other');
    st.services.forEach(function (s) { var c = categoryOf(s); (groups[c] = groups[c] || []).push(s); });
    var cat = el('select', { cls: 'vb-field', 'aria-label': 'Type of service' }, [el('option', { value: '', text: 'Choose a type…' })]);
    order.forEach(function (c) { if (groups[c]) cat.appendChild(el('option', { value: c, text: c + ' (' + groups[c].length + ')' })); });
    var svc = el('select', { cls: 'vb-field', 'aria-label': 'Service', disabled: 'disabled' }, [el('option', { value: '', text: 'Choose a service…' })]);
    var go = el('button', { cls: 'vb-main', type: 'button', disabled: 'disabled', text: 'Next' });
    cat.addEventListener('change', function () {
      svc.textContent = '';
      svc.appendChild(el('option', { value: '', text: 'Choose a service…' }));
      (groups[cat.value] || []).slice().sort(byPriceThenName).forEach(function (s) { svc.appendChild(el('option', { value: s.id, text: serviceLabel(s) })); });
      if (cat.value) svc.removeAttribute('disabled'); else svc.setAttribute('disabled', 'disabled');
      go.setAttribute('disabled', 'disabled');
    });
    svc.addEventListener('change', function () { if (svc.value) go.removeAttribute('disabled'); else go.setAttribute('disabled', 'disabled'); });
    go.addEventListener('click', function () {
      var s = st.services.filter(function (x) { return x.id === svc.value; })[0];
      if (s) chooseService(s);
    });
    setCard([
      el('label', { cls: 'vb-label', text: 'Type of service' }), cat,
      el('label', { cls: 'vb-label', text: 'Service' }), svc,
      el('div', { cls: 'vb-row' }, [go]),
      el('p', { cls: 'vb-note', style: 'margin-top:8px', text: 'One service per appointment. For add-ons or several services, book on our booking page or call ' + PHONE + '.' }),
    ]);
  }

  // ── step 2a: a technician first, then only her days ──────────────────
  // The client who wants Christina picks her before the day; the booking
  // function answers with the days she has an opening for this service.
  function techsForService() {
    var ids = (st.service && st.service.tech_ids) || [];
    return (st.techList || []).filter(function (t) { return ids.indexOf(t.id) >= 0; });
  }
  function techNamed(name) {
    var n = String(name || '').toLowerCase();
    return n ? techsForService().filter(function (t) { return t.name.toLowerCase() === n; })[0] || null : null;
  }
  function anyTech() { st.techFirst = null; st.techFirstDays = null; st.onlyTech = null; st.allTechs = true; st.autoAll = null; pickDay(); }
  function pickTechFirst() {
    var list = techsForService();
    say('Who would you like? I\'ll show you the days they have openings for ' + st.service.name + '.');
    var row = el('div', { cls: 'vb-row' });
    list.forEach(function (t) {
      row.appendChild(el('button', { cls: 'vb-btn', type: 'button', text: t.name, on: { click: function () { you(t.name); techDaysFor(t); } } }));
    });
    setCard([row, back('Any technician', anyTech), el('br'), back('Change service', pickService)]);
  }
  function techDaysFor(t) {
    st.techFirst = t; st.onlyTech = t.name; st.allTechs = false; st.autoAll = null;
    setCard([el('p', { cls: 'vb-note', text: 'Checking ' + t.name + '\'s days…' })]);
    call({ action: 'tech_days', service_id: st.service.id, tech_id: t.id }).then(function (r) {
      if (!r.ok && r.error === 'tech_unavailable') {
        st.techFirst = null; st.onlyTech = null;
        say(t.name + ' doesn\'t do ' + st.service.name + ' online. Pick someone else, or any technician.');
        return pickTechFirst();
      }
      if (!r.ok) return trouble(r.error);
      st.techFirstDays = (r.days || []).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); });
      st.techFirstFor = st.service.id;
      showTechDays();
    });
  }
  function showTechDays() {
    var t = st.techFirst, days = st.techFirstDays || [];
    if (!days.length) {
      sayNodes([t.name + ' has no openings for ' + st.service.name + (st.through ? ' through ' + longDay(st.through) : '') +
                '. You can pick someone else, see every technician\'s times, or call us at ' + PHONE + '.']);
      setCard([waitlistLink(t.name, true), back('Pick another technician', pickTechFirst), el('br'), back('Any technician', anyTech), el('br'), back('Change service', pickService)]);
      return;
    }
    say('These are the days ' + t.name + ' has openings. Which works for you?');
    var today = salonToday(), row = el('div', { cls: 'vb-row' }), shown = 0;
    function dayButton(d) {
      var i = Math.round((Date.parse(d + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000);
      return el('button', { cls: 'vb-btn', type: 'button', text: dayLabel(d, i), on: { click: function () { you(longDay(d)); loadTimes(d); } } });
    }
    var more = el('button', { cls: 'vb-btn', type: 'button', text: 'More dates…' });
    function showMore() {
      var stop = Math.min(days.length, shown + 7);
      for (; shown < stop; shown++) row.insertBefore(dayButton(days[shown]), more);
      if (shown >= days.length) more.remove();
      scroll();
    }
    more.addEventListener('click', showMore);
    row.appendChild(more);
    showMore();
    setCard([row, back('Pick another technician', pickTechFirst), el('br'), back('Any technician', anyTech)]);
  }

  // ── step 2: day ───────────────────────────────────────────────────────
  function pickDay() {
    // chose a technician first (or named one in the chat): only her days
    if (!st.wantDay && !st.allTechs) {
      if (st.techFirst && st.techFirstFor === (st.service && st.service.id)) return showTechDays();
      var named = st.techFirst || techNamed(st.onlyTech || techSaid());
      if (named && (st.techList || []).length) return techDaysFor(named);
    }
    // a day already known from the chat: go straight to its times ("Pick another day" is there)
    var today = salonToday();
    // Only days on the posted schedule can be booked here (the chat books from
    // published shifts); later dates go to the Galaxy booking page.
    var last = st.through === undefined ? addDays(today, 13) : st.through;
    var shown = 0;
    while (shown < DAYS_SHOWN && last && addDays(today, shown) <= last) shown++;
    function later() {
      return el('p', { cls: 'vb-note', style: 'margin-top:8px' }, [
        'Later dates aren\'t on our posted schedule yet. Book those on ', galaxyLink('our online booking page'), ' or call ' + PHONE + '.']);
    }
    if (st.wantDay && st.through !== undefined && (!last || st.wantDay > last)) {
      var far = st.wantDay; st.wantDay = null;
      sayNodes([longDay(far) + ' isn\'t on our posted schedule yet, so I can\'t book it here. You can book it on ',
                galaxyLink('our online booking page'), ' or call us at ' + PHONE + '.']);
      if (!shown) return closeCard();
    }
    if (st.wantDay) { var known = st.wantDay; st.wantDay = null; say('Checking ' + longDay(known) + ' for you…'); return loadTimes(known); }
    if (!shown) {
      closeCard();
      sayNodes(['Our schedule for the coming days isn\'t posted yet, so I can\'t book in the chat. You can book on ',
                galaxyLink('our online booking page'), ' or call us at ' + PHONE + '.']);
      return;
    }
    say('Which day works for you?');
    var row = el('div', { cls: 'vb-row' });
    function dayButton(i) {
      var d = addDays(today, i);
      var b = el('button', { cls: 'vb-btn' + (d === st.wantDay ? ' on' : ''), type: 'button', text: dayLabel(d, i) });
      b.addEventListener('click', function () { you(longDay(d)); loadTimes(d); });
      return b;
    }
    for (var i = 0; i < Math.min(7, shown); i++) row.appendChild(dayButton(i));
    if (shown > 7) {
      // a week at a time: the schedule can reach months ahead
      var more = el('button', { cls: 'vb-btn', type: 'button', text: 'More dates…' }), next = 7;
      more.addEventListener('click', function () {
        var stop = Math.min(shown, next + 7);
        for (; next < stop; next++) row.insertBefore(dayButton(next), more);
        if (next >= shown) more.remove();
        scroll();
      });
      row.appendChild(more);
    }
    var canPick = techsForService().length > 1;
    setCard([row, shown < DAYS_SHOWN ? later() : null,
              canPick ? back('Pick a technician first', pickTechFirst) : null, canPick ? el('br') : null,
              back('Change service', pickService)]);
  }
  // links like "Pick another day" show in the chat as the visitor's answer, so the transcript reads right
  function back(text, fn) { return el('button', { cls: 'vb-link', type: 'button', text: text, on: { click: function () { you(text); fn(); } } }); }

  // ── step 3: time ──────────────────────────────────────────────────────
  function loadTimes(day) {
    st.day = day; st.time = null; st.tech = null;
    setCard([el('p', { cls: 'vb-note', text: 'Checking open times…' })]);
    call({ action: 'slots', service_id: st.service.id, date: day }).then(function (r) {
      if (!r.ok) return trouble(r.error);
      st.slots = r.slots || [];
      if (!st.slots.length) {
        say('Sorry, there are no open times for ' + st.service.name + ' on ' + longDay(day) + '. The schedule for later weeks may not be out yet.');
        return pickDay();
      }
      pickTime();
    });
  }
  // A technician named in the chat (the salon's technician names). A name of
  // 4+ letters also counts one letter off ("Crystall", "Jimy"), like client names.
  function oneOff(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, diff = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return diff + (a.length - i) + (b.length - j) <= 1;
  }
  // everyday words one letter from a name ("mine" ~ Mina, "chose" ~ Chase)
  var NOT_NAMES = ['chose', 'close', 'those', 'these', 'times', 'mine', 'mind', 'mini', 'mint', 'menu', 'jelly', 'belly', 'penny', 'sunny', 'kitty', 'case', 'cases'];
  function techSaid() {
    var hit = null, at = -1, text = st.text || '';
    // and words from service names ("pearls", "mini") never count as a fuzzy name
    var serviceWords = ' ' + (st.services || []).map(function (s) { return String(s.name || '').toLowerCase(); }).join(' ') + ' ';
    Object.keys(st.known).forEach(function (k) {
      if (k.length < 3) return;
      var re = new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), m, last = -1;
      while ((m = re.exec(text))) last = m.index;
      if (last < 0 && k.length >= 4 && k.indexOf(' ') < 0) {
        var w = /[a-z]+/g;
        while ((m = w.exec(text))) if (m[0].length >= 4 && NOT_NAMES.indexOf(m[0]) < 0 && serviceWords.indexOf(' ' + m[0]) < 0 && oneOff(m[0], k)) last = m.index;
      }
      if (last > at) { at = last; hit = st.known[k]; }
    });
    return hit;
  }
  function pickTime() {
    st.slots.forEach(function (s) { st.known[s.tech.toLowerCase()] = s.tech; });
    if (!st.allTechs && !st.onlyTech) st.onlyTech = techSaid();
    st.view = st.onlyTech ? st.slots.filter(function (s) { return s.tech === st.onlyTech; }) : st.slots;
    if (st.onlyTech && !st.view.length) {
      // the waitlist only for a technician who does this service online
      st.autoAllWait = !!st.waitlistOn && !!techNamed(st.onlyTech);
      say(st.onlyTech + ' has no opening for ' + st.service.name + ' (' + st.service.minutes + ' min) on ' + longDay(st.day) + ' that can be booked online. ' +
          (st.autoAllWait ? 'I can tell you when ' + st.onlyTech + ' has one, or pick someone who is free below.'
                         : 'Here is everyone who is free. To stay with ' + st.onlyTech + ', tap Pick another day or Change service.'));
      st.autoAll = st.onlyTech;                       // only for this day: another day looks for them again
      st.onlyTech = null; st.allTechs = true; st.view = st.slots;
    }
    var times = [];
    st.view.forEach(function (s) { if (times.indexOf(s.time) < 0) times.push(s.time); });
    times.sort();
    var near = null;
    if (st.wantTime != null) {
      near = times.slice().sort(function (a, b) { return Math.abs(mins(a) - st.wantTime) - Math.abs(mins(b) - st.wantTime); })[0];
    }
    var exact = near && mins(near) === st.wantTime;
    var withWho = st.onlyTech ? ' with ' + st.onlyTech : '';
    say(exact ? to12(near) + ' is open' + withWho + ' on ' + longDay(st.day) + '. Tap it, or pick another time.'
        : near ? to12(near) + ' is the closest open time' + withWho + ' to what you asked for. Here is everything open on ' + longDay(st.day) + ':'
        : 'Here are the open times' + withWho + ' on ' + longDay(st.day) + ':');
    var row = el('div', { cls: 'vb-row' });
    times.forEach(function (t) {
      var b = el('button', { cls: 'vb-btn' + (t === near ? ' near on' : ''), type: 'button', text: to12(t) });
      b.addEventListener('click', function () { you(to12(t)); st.time = t; pickTech(); });
      row.appendChild(b);
    });
    setCard([st.autoAll && st.autoAllWait ? waitlistLink(st.autoAll, true, st.day) : null, st.autoAll && st.autoAllWait ? el('p', { cls: 'vb-note', text: 'Or pick someone who is free:' }) : null,
             row, st.onlyTech ? back('See all technicians', function () { st.onlyTech = null; st.allTechs = true; st.autoAll = null; pickTime(); }) : null,
             st.onlyTech ? el('br') : null,
             back('Pick another day', function () { if (st.autoAll) { st.allTechs = false; st.autoAll = null; } pickDay(); }),
             st.autoAll ? el('br') : null,
             // the named tech may not do this service: pick another, same day, same tech
             st.autoAll ? back('Change service', function () { st.allTechs = false; st.autoAll = null; st.wantDay = st.day; pickService(); }) : null]);
  }

  // ── step 4: technician ────────────────────────────────────────────────
  function pickTech() {
    var free = (st.view || st.slots).filter(function (s) { return s.time === st.time; });
    st.anyTech = false;
    if (free.length === 1) { st.tech = free[0]; you(free[0].tech); return askWho(); }
    say('Who would you like? These technicians are free at ' + to12(st.time) + '.');
    var row = el('div', { cls: 'vb-row' });
    var any = el('button', { cls: 'vb-btn on', type: 'button', text: '✦ Anyone available' });
    any.addEventListener('click', function () { st.tech = free[0]; st.anyTech = true; you('Anyone available'); askWho(); });
    row.appendChild(any);
    free.forEach(function (s) {
      var b = el('button', { cls: 'vb-btn', type: 'button', text: s.tech });
      b.addEventListener('click', function () { st.tech = s; you(s.tech); askWho(); });
      row.appendChild(b);
    });
    setCard([row, back('Pick another time', pickTime)]);
  }

  // ── step 5: who you are ───────────────────────────────────────────────
  // Cloudflare couldn't verify this browser: say so, with a way through
  function tsTrouble(ts) {
    if (ts.nextSibling && ts.nextSibling.className === 'vb-err vb-ts-err') return;
    ts.parentNode.insertBefore(el('p', { cls: 'vb-err vb-ts-err', role: 'alert',
      text: 'The security check couldn\'t verify this browser. Please refresh the page or try another browser (Safari or Chrome on your phone works best), or call us at ' + PHONE + '.' }), ts.nextSibling);
  }
  function loadTurnstile(cb) {
    if (window.turnstile) return cb();
    if (!document.getElementById('vbTsScript')) {
      document.head.appendChild(el('script', { id: 'vbTsScript', src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: '', defer: '' }));
    }
    var tries = 0;
    (function wait() { if (window.turnstile) return cb(); if (++tries > 100) return cb(new Error('no turnstile')); setTimeout(wait, 100); })();
  }
  // Before the form: may this visitor try now? (asking doesn't count as a try)
  function askWho(errText) {
    if (st.flow === 'change') return changeForm(errText);
    if (errText) return showForm(errText);
    setCard([el('p', { cls: 'vb-note', text: 'One moment…' })]);
    call({ action: 'check' }).then(function (r) {
      if (!r.ok && r.error !== 'bad_request') { closeCard(); if (stopped(r)) return; }
      // fine, or the check itself failed: show the form (the booking checks everything again)
      say('Almost done. What cell number and first name do we have for you?');
      showForm();
    });
  }
  function showForm(errText) {
    st.token = '';
    var phone = el('input', { cls: 'vb-field', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '(847) 555-0100', id: 'vbPhone' });
    var first = el('input', { cls: 'vb-field', type: 'text', autocomplete: 'given-name', placeholder: 'First name', id: 'vbFirst' });
    if (st.phone) phone.value = st.phone;
    if (st.first) first.value = st.first;
    var ts = el('div', { cls: 'vb-ts' });
    var go = el('button', { cls: 'vb-main', type: 'button', disabled: 'disabled', text: 'Confirm booking' });
    var err = el('p', { cls: 'vb-err', role: 'alert', text: errText || '' });
    if (!errText) err.style.display = 'none';
    function ready() {
      var okNow = st.token && phone.value.replace(/\D/g, '').length >= 10 && first.value.trim();
      if (okNow) go.removeAttribute('disabled'); else go.setAttribute('disabled', 'disabled');
    }
    phone.addEventListener('input', ready); first.addEventListener('input', ready);
    go.addEventListener('click', function () { book(phone.value.trim(), first.value.trim(), go); });
    setCard([
      el('p', null, [el('strong', { text: st.service.name }), ' with ' + st.tech.tech + ', ' + longDay(st.day) + ' at ' + to12(st.time)]),
      el('label', { cls: 'vb-label', 'for': 'vbPhone', text: 'Cell phone' }), phone,
      el('label', { cls: 'vb-label', 'for': 'vbFirst', text: 'First name' }), first,
      ts, el('div', { cls: 'vb-row' }, [go]), err,
      el('p', { cls: 'vb-note', style: 'margin-top:8px' }, ['For returning clients. First visit? Book on ', galaxyLink(), ' or call ' + PHONE + '.']),
      back('Pick another time', pickTime),
    ], true);
    loadTurnstile(function (e) {
      if (e || !window.turnstile) { ts.textContent = 'The security check could not load. Please refresh the page, or call ' + PHONE + '.'; return; }
      st.tsId = window.turnstile.render(ts, {
        sitekey: SITE_KEY, theme: 'light',
        size: ts.clientWidth >= 300 ? 'flexible' : 'compact',   // flexible fills the card; compact on very narrow phones
        callback: function (t) { st.token = t; ready(); },
        'expired-callback': function () { st.token = ''; ready(); },
        'error-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
        'unsupported-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
      });
    });
  }

  // ── step 6: book ──────────────────────────────────────────────────────
  function book(phone, first, btn, extra) {
    st.phone = phone; st.first = first;
    btn.setAttribute('disabled', 'disabled'); btn.textContent = 'Booking…';
    var tokenNow = st.token; st.token = '';
    var body = { action: 'book', service_id: st.service.id, tech_id: st.tech.tech_id, date: st.day, time: st.time,
                 phone: phone, first_name: first, turnstile_token: tokenNow };
    if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    call(body).then(function (r) {
      if (r.ok) return done(r);
      var e = r.error;
      if (e === 'possible_duplicate') return dupWarn(r, phone, first);
      // Doesn't say whether that cell or name is on file
      if (e === 'no_client') return askWho('We couldn\'t book with those details. Please check the cell and first name from your last visit. First time with us? Book on our booking page or call ' + PHONE + '.');
      if (e === 'human_check_failed') return askWho('The security check didn\'t go through. Please try again.');
      if (e === 'slot_unavailable' || e === 'slot_taken') { closeCard(); say('Sorry, ' + to12(st.time) + ' was just taken. Here is what\'s still open:'); return loadTimes(st.day); }
      if (e === 'service_unavailable') { closeCard(); say('That service can\'t be booked in the chat right now. Please choose another, or call ' + PHONE + '.'); st.services = null; return start(); }
      closeCard();
      if (stopped(r)) return;
      // Galaxy or the network failed: we can't be sure what happened
      return say('I couldn\'t confirm your booking. Please call us at ' + PHONE + ' so we can check. Sorry about that!');
    });
  }
  // Same service within 10 days, or a time that overlaps one they have:
  // show it, and let them book anyway (a second visit, or someone else on
  // this cell, whose first name goes in the appointment note)
  function dupWarn(r, phone, first) {
    st.token = '';
    var list = (r.existing || []).map(function (a) {
      return el('li', null, [el('strong', { text: a.services || 'An appointment' }), (a.tech ? ' with ' + a.tech : '') + ' — ' + longDay(a.date) + ' at ' + to12(a.time)
        + (a.overlaps ? ' (same time)' : '')]);
    });
    var who = el('input', { cls: 'vb-field', type: 'text', autocomplete: 'off', maxlength: '30', placeholder: 'First name (leave blank if it\'s you)', id: 'vbFor' });
    var ts = el('div', { cls: 'vb-ts' });
    var go = el('button', { cls: 'vb-main', type: 'button', disabled: 'disabled', text: 'Yes, book it' });
    var keep = el('button', { cls: 'vb-link', type: 'button', text: 'No, keep my current one' });
    function ready() { if (st.token) go.removeAttribute('disabled'); else go.setAttribute('disabled', 'disabled'); }
    go.addEventListener('click', function () {
      var extra = { confirm_duplicate: true };
      if (who.value.trim()) extra.for_name = who.value.trim();
      book(phone, first, go, extra);
    });
    keep.addEventListener('click', function () {
      you('No, keep my current one'); closeCard(); st.time = null;
      say('No problem, nothing new was booked. To move your appointment instead, tap My appointment, then Change time.');
    });
    setCard([
      el('p', null, ['Heads up, ' + (r.first_name || first) + ', you already have:']),
      el('ul', { cls: 'vb-dups' }, list),
      el('p', null, ['Book ', el('strong', { text: st.service.name }), ' with ' + st.tech.tech + ', ' + longDay(st.day) + ' at ' + to12(st.time) + ' anyway? For example, a second visit, or for someone else using this cell.']),
      el('label', { cls: 'vb-label', 'for': 'vbFor', text: 'Who\'s it for?' }), who,
      ts, el('div', { cls: 'vb-row' }, [go]), keep,
    ], true);
    loadTurnstile(function (e) {
      if (e || !window.turnstile) { ts.textContent = 'The security check could not load. Please refresh the page, or call ' + PHONE + '.'; return; }
      st.tsId = window.turnstile.render(ts, {
        sitekey: SITE_KEY, theme: 'light',
        size: ts.clientWidth >= 300 ? 'flexible' : 'compact',
        callback: function (t) { st.token = t; ready(); },
        'expired-callback': function () { st.token = ''; ready(); },
        'error-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
        'unsupported-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
      });
    });
  }
  function done(r) {
    closeCard();
    var b = r.booked || {};
    var line = (b.service || st.service.name) + ' with ' + (b.tech || st.tech.tech) + ' on ' + longDay(b.date || st.day) + ' at ' + to12(b.time || st.time);
    if (r.practice) {
      say('✅ Practice run passed: ' + line + '. (Practice mode is on, so nothing was booked.)');
    } else {
      sayNodes([(b.for_name ? 'Booked for ' + b.for_name + ', ' : 'You\'re booked, ') + (b.first_name || st.first) + '! 🎉 ', el('strong', { text: line }), '. You\'ll get a text from us. To change or cancel, use the link in that text or call ' + PHONE + '.']);
    }
    st.time = null; st.tech = null;
  }

  // Limits and closed booking: say so plainly, with when and the phone number
  function stopped(r) {
    var e = r.error;
    if (e === 'too_many_tries') {
      var when = r.retry_at ? new Date(r.retry_at) : null;
      var at = when && !isNaN(when) ? 'at ' + when.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : 'in about an hour';
      say('For security, booking in the chat allows 3 tries per hour, and that\'s been reached. You can try again ' + at + ', or call us at ' + PHONE + ' and we\'ll book you right now.');
      return true;
    }
    if (e === 'busy') { say('We\'re getting a lot of online bookings right now. Please call us at ' + PHONE + ' and we\'ll get you in.'); return true; }
    if (e === 'already_booked') { say('You already have 3 upcoming appointments booked online. To add another, please call us at ' + PHONE + '.'); return true; }
    if (e === 'booking_off' || e === 'not_configured') { sayNodes(['Booking in the chat is closed right now. You can book on ', galaxyLink(), ' or call ' + PHONE + '.']); return true; }
    return false;
  }

  function trouble(code) {
    closeCard();
    if (code === 'booking_off' || code === 'not_configured') return sayNodes(['Booking in the chat is closed right now. You can book on ', galaxyLink(), ' or call ' + PHONE + '.']);
    say('I\'m having trouble checking times right now. Please try again in a minute, or call us at ' + PHONE + '.');
  }

  // ── "Change my appointment" (step 1: a request the front desk confirms) ──
  // After "My appointment": pick a new day and time from the same open times
  // as booking. Nothing changes in Galaxy here; the front desk moves it and
  // texts to confirm. At least 24 hours ahead (checked again by the server).
  function salonNowMins() {
    var p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    var h = 0, m = 0;
    p.forEach(function (x) { if (x.type === 'hour') h = +x.value; if (x.type === 'minute') m = +x.value; });
    return h * 60 + m;
  }
  function farEnough(a) {   // 24 hours or more away, salon time
    var today = salonToday();
    if (a.date > addDays(today, 1)) return true;
    return a.date === addDays(today, 1) && mins(a.time) >= salonNowMins();
  }
  function whenOf(a) { return longDay(a.date) + ' at ' + to12(a.time); }
  function changeNote() {
    var a = st.change && st.change.from;
    return a ? 'Please move my appointment on ' + whenOf(a) + ' to another time.' : '';
  }
  function changeButtons(list) {
    var row = el('div', { cls: 'vb-row' });
    list.forEach(function (a) {
      var label = list.length === 1 ? '🔁 Change time' : '🔁 Change ' + dayLabel(a.date, 9) + ' ' + to12(a.time);
      row.appendChild(el('button', { cls: 'vb-btn', type: 'button', text: label, on: { click: function () { you(label.replace('🔁 ', '')); changeStart(a); } } }));
    });
    setCard([row, back('No changes', function () { closeCard(); st.flow = null; say('Great, see you then! Anything else I can help with?'); })]);
  }
  function changeStart(a) {
    st.flow = 'change'; st.change = { from: a };
    if (!farEnough(a)) {
      closeCard();
      say('Your appointment is less than 24 hours away, so the front desk needs to handle that change. Tap below and they\'ll text you, or call us at ' + PHONE + '.');
      st.handoffNote = changeNote();
      return showOffer('handoff', true);
    }
    setCard([el('p', { cls: 'vb-note', text: 'One moment…' })]);
    (st.services ? Promise.resolve({ ok: true, services: st.services, techs: st.techList, bookable_through: st.through })
                 : call({ action: 'services' })).then(function (r) {
      if (!r.ok || !r.services || !r.services.length) {
        closeCard();
        say('I can\'t look up open times right now. Tap below and the front desk will help you move it, or call us at ' + PHONE + '.');
        st.handoffNote = changeNote();
        return showOffer('handoff', true);
      }
      st.services = r.services;
      if ('bookable_through' in r) st.through = r.bookable_through || '';
      if (Array.isArray(r.techs)) st.techList = r.techs.filter(function (t) { return t && t.id && t.name; });
      // One service we can book online: same service, new time. Anything else goes to the front desk.
      var names = Array.isArray(a.services) ? a.services.filter(function (x) { return typeof x === 'string' && x; }) : [];
      var svc = names.length === 1 ? st.services.filter(function (x) { return x.name.toLowerCase() === names[0].toLowerCase(); })[0] : null;
      if (!svc) {
        closeCard();
        say(names.length > 1 ? 'That appointment has more than one service, so the front desk will move it for you. Tap below and they\'ll text you.'
                             : 'The front desk will move that one for you. Tap below and they\'ll text you.');
        st.handoffNote = changeNote();
        return showOffer('handoff', true);
      }
      st.service = svc; st.day = null; st.time = null; st.tech = null; st.wantDay = null; st.wantTime = mins(a.time);
      st.allTechs = false; st.autoAll = null; st.techFirst = null; st.techFirstDays = null; st.techFirstFor = null;
      var who = typeof a.tech === 'string' && a.tech ? (st.techList || []).filter(function (t) { return t.name.toLowerCase() === a.tech.toLowerCase(); })[0] : null;
      st.onlyTech = who ? who.name : null;
      say('Sure! Let\'s find a new time for your ' + svc.name + (who ? ' with ' + who.name : '') + ' (now ' + whenOf(a) + ').');
      if (who && (svc.tech_ids || []).indexOf(who.id) >= 0) return techDaysFor(who);
      st.onlyTech = null;
      pickDay();
    });
  }
  function changeForm(errText) {
    st.token = '';
    var a = st.change.from;
    var ts = el('div', { cls: 'vb-ts' });
    var go = el('button', { cls: 'vb-main', type: 'button', disabled: 'disabled', text: 'Send change request' });
    var err = el('p', { cls: 'vb-err', role: 'alert', text: errText || '' });
    if (!errText) err.style.display = 'none';
    function ready() { if (st.token) go.removeAttribute('disabled'); else go.setAttribute('disabled', 'disabled'); }
    go.addEventListener('click', function () { changeSend(go); });
    say('Here\'s the change. I\'ll send it to the front desk to confirm.');
    setCard([
      el('p', null, ['From ', el('strong', { text: whenOf(a) })]),
      el('p', null, ['To ', el('strong', { text: st.service.name + ' with ' + (st.anyTech ? 'anyone available' : st.tech.tech) + ', ' + longDay(st.day) + ' at ' + to12(st.time) })]),
      ts, el('div', { cls: 'vb-row' }, [go]), err,
      el('p', { cls: 'vb-note', style: 'margin-top:8px', text: 'Your current appointment stays as it is until the front desk texts you to confirm the new time.' }),
      back('Pick another time', pickTime),
    ], true);
    loadTurnstile(function (e) {
      if (e || !window.turnstile) { ts.textContent = 'The security check could not load. Please refresh the page, or call ' + PHONE + '.'; return; }
      window.turnstile.render(ts, {
        sitekey: SITE_KEY, theme: 'light',
        size: ts.clientWidth >= 300 ? 'flexible' : 'compact',
        callback: function (t) { st.token = t; ready(); },
        'expired-callback': function () { st.token = ''; ready(); },
        'error-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
        'unsupported-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
      });
    });
  }
  function changeSend(btn) {
    var a = st.change.from;
    btn.setAttribute('disabled', 'disabled'); btn.textContent = 'Sending…';
    var tokenNow = st.token; st.token = '';
    call({ action: 'change_request', phone: st.phone, first_name: st.first, from_date: a.date, from_time: a.time,
           service_id: st.service.id, date: st.day, time: st.time, tech_id: st.anyTech ? '' : st.tech.tech_id,
           session_id: chatId(), turnstile_token: tokenNow }).then(function (r) {
      var e = r && r.error;
      if (r && r.ok) {
        closeCard(); st.flow = null;
        var to = longDay(st.day) + ' at ' + to12(st.time);
        if (r.open_now === false) {
          return say('Thanks, ' + st.first + '! We\'re closed right now, so the front desk will text you at ' + prettyPhone(st.phone) +
                     (r.next_open ? ' when we open ' + r.next_open : ' when we open') + ' to confirm ' + to + '. Your current appointment stays until then.');
        }
        return say('Thanks, ' + st.first + '! The front desk has your request for ' + to + ' and will text you at ' + prettyPhone(st.phone) +
                   ' to confirm, usually within 30 minutes. Your current appointment stays until then.');
      }
      if (e === 'human_check_failed') return changeForm('The security check didn\'t go through. Please try again.');
      if (e === 'slot_unavailable') { closeCard(); say('Sorry, ' + to12(st.time) + ' was just taken. Here is what\'s still open:'); return loadTimes(st.day); }
      if (e === 'same_time') { closeCard(); say('That\'s the time you already have. Pick a different one:'); return pickDay(); }
      closeCard(); st.flow = null;
      if (e === 'too_close') { st.handoffNote = changeNote(); say('Your appointment is now less than 24 hours away, so the front desk needs to handle that change. Tap below, or call ' + PHONE + '.'); return showOffer('handoff', true); }
      if (e === 'not_found') return say('I couldn\'t find that appointment anymore. It may have just changed. Please call us at ' + PHONE + '.');
      if (e === 'too_many_tries') return say('You\'ve already sent us a few requests today, and the front desk has them. For anything urgent, please call ' + PHONE + '.');
      if (e === 'change_off' || e === 'busy') return say('I can\'t send change requests right now. Please call us at ' + PHONE + ' and we\'ll move it for you.');
      return say('I couldn\'t send that right now. Please call us at ' + PHONE + ' and we\'ll move it for you.');
    });
  }

  // ── "Do I have an appointment?" ───────────────────────────────────────
  // Cell + first name and the human check; the answer is only the
  // day and time. A wrong name and "nothing booked" read the same.
  function lookupStart() {
    if (offer) { offer.remove(); offer = null; }
    st.flow = 'lookup';
    say('I can check that for you. What cell number and first name do we have for you?');
    lookupForm();
  }
  function lookupForm(errText) {
    st.token = '';
    var phone = el('input', { cls: 'vb-field', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '(847) 555-0100', id: 'vbLkPhone' });
    var first = el('input', { cls: 'vb-field', type: 'text', autocomplete: 'given-name', placeholder: 'First name', id: 'vbLkFirst' });
    if (st.phone) phone.value = st.phone;
    if (st.first) first.value = st.first;
    var ts = el('div', { cls: 'vb-ts' });
    var go = el('button', { cls: 'vb-main', type: 'button', disabled: 'disabled', text: 'Check my appointment' });
    var err = el('p', { cls: 'vb-err', role: 'alert', text: errText || '' });
    if (!errText) err.style.display = 'none';
    function ready() {
      var okNow = st.token && phone.value.replace(/\D/g, '').length >= 10 && first.value.trim();
      if (okNow) go.removeAttribute('disabled'); else go.setAttribute('disabled', 'disabled');
    }
    [phone, first].forEach(function (f) { f.addEventListener('input', ready); });
    go.addEventListener('click', function () { lookup(phone.value.trim(), first.value.trim(), go); });
    setCard([
      el('label', { cls: 'vb-label', 'for': 'vbLkPhone', text: 'Cell phone' }), phone,
      el('label', { cls: 'vb-label', 'for': 'vbLkFirst', text: 'First name' }), first,
      ts, el('div', { cls: 'vb-row' }, [go]), err,
      el('p', { cls: 'vb-note', style: 'margin-top:8px', text: 'Use the cell number and name we have on file. After checking, you can ask to move it to another time.' }),
    ], true);
    loadTurnstile(function (e) {
      if (e || !window.turnstile) { ts.textContent = 'The security check could not load. Please refresh the page, or call ' + PHONE + '.'; return; }
      window.turnstile.render(ts, {
        sitekey: SITE_KEY, theme: 'light',
        size: ts.clientWidth >= 300 ? 'flexible' : 'compact',
        callback: function (t) { st.token = t; ready(); },
        'expired-callback': function () { st.token = ''; ready(); },
        'error-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
        'unsupported-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
      });
    });
  }
  function lookup(phone, first, btn) {
    st.phone = phone; st.first = first;
    btn.setAttribute('disabled', 'disabled'); btn.textContent = 'Checking…';
    var tokenNow = st.token; st.token = '';
    call({ action: 'lookup', phone: phone, first_name: first, turnstile_token: tokenNow }).then(function (r) {
      if (r.ok) {
        closeCard();
        var list = r.appointments || [];
        if (!list.length) return notFound(phone, first);
        var when = list.map(function (a) { return longDay(a.date) + ' at ' + to12(a.time); });
        // What it's for and with whom ("Dip French, Classic Pedicure with Christina"), when Galaxy has it
        var what = list.map(function (a) {
          var svc = Array.isArray(a.services) ? a.services.filter(function (x) { return typeof x === 'string' && x; }).join(', ') : '';
          var tech = typeof a.tech === 'string' ? a.tech : '';
          return svc ? svc + (tech ? ' with ' + tech : '') : (tech ? 'with ' + tech : '');
        });
        var name = typeof r.first_name === 'string' && r.first_name.trim() ? r.first_name.trim() : '';   // the name on file
        var nodes = list.length === 1
          ? [name ? 'Hi ' + name + '! You\'re booked on ' : 'Yes! You\'re booked on ', el('strong', { text: when[0] })].concat(what[0] ? [' — ' + what[0] + '.'] : ['.'])
          : [(name ? 'Hi ' + name + '! ' : '') + 'You have ' + list.length + ' upcoming appointments:'].concat(when.map(function (w, i) { return el('div', null, ['• ', el('strong', { text: w })].concat(what[i] ? [' — ' + what[i]] : [])); }));
        st.mine = list;
        nodes.push(el('div', { style: 'margin-top:6px', text: 'Need another day or time? Tap Change time below. To cancel, use the link in your appointment text from us, or call us at ' + PHONE + '.' }));
        sayNodes(nodes);
        return changeButtons(list);
      }
      var e = r.error;
      if (e === 'human_check_failed') return lookupForm('The security check didn\'t go through. Please try again.');
      closeCard();
      if (e === 'too_many_tries') {
        var t = r.retry_at ? new Date(r.retry_at) : null;
        var at = t && !isNaN(t) ? 'at ' + t.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : 'in about an hour';
        return say('For security, checking appointments in the chat allows 5 tries per hour, and that\'s been reached. You can try again ' + at + ', or call us at ' + PHONE + '.');
      }
      if (e === 'busy') return say('Lots of people are checking right now. Please try again in a few minutes, or call us at ' + PHONE + '.');
      if (e === 'lookup_off') return say('I can\'t check appointments in the chat right now. Please call us at ' + PHONE + ' and we\'ll look it up for you.');
      return say('I couldn\'t check right now. Please call us at ' + PHONE + ' and we\'ll look it up for you.');
    });
  }

  // ── "Have the front desk contact me" (docs/victoria-handoff/plan.md) ──
  // First name, cell, what they need and call / text, after the human check.
  // The front desk is alerted (now when open, at opening when closed) and
  // calls or texts back. Nothing about the request comes back to the page.
  function chatId() {
    var id = window._vcpSession || '';
    try { id = id || sessionStorage.getItem('vcpSession') || ''; } catch (e) {}
    return /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : '';
  }
  function cell10(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    return d.length === 10 ? d : '';
  }
  function handoffStart() {
    if (offer) { offer.remove(); offer = null; }
    st.flow = 'handoff';
    say('I\'ll pass this to the front desk. Leave your first name and cell, and someone will get back to you.');
    handoffForm();
  }
  function handoffForm(errText) {
    st.token = '';
    var first = el('input', { cls: 'vb-field', type: 'text', autocomplete: 'given-name', placeholder: 'First name', id: 'vbHoFirst', maxlength: '60' });
    var phone = el('input', { cls: 'vb-field', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '(847) 555-0100', id: 'vbHoPhone' });
    var note = el('textarea', { cls: 'vb-field', id: 'vbHoNote', maxlength: '300', rows: '3', placeholder: 'What do you need? e.g. "My dip from Tuesday is lifting, can I come in for a fix?"' });
    var count = el('span', { cls: 'vb-count' });
    if (st.first) first.value = st.first;
    if (st.phone) phone.value = st.phone;
    note.value = st.handoffNote || st.hoNote || '';
    var how = st.hoHow || 'either';
    var hows = el('div', { cls: 'vb-row', role: 'group', 'aria-label': 'Call or text?' });
    [['call', '📞 Call'], ['text', '💬 Text'], ['either', 'Either']].forEach(function (o) {
      var b = el('button', { cls: 'vb-btn' + (o[0] === how ? ' on' : ''), type: 'button', text: o[1], 'aria-pressed': String(o[0] === how) });
      b.addEventListener('click', function () {
        how = o[0];
        Array.prototype.forEach.call(hows.children, function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
      });
      hows.appendChild(b);
    });
    var hint = el('p', { cls: 'vb-err', role: 'status', text: '' });
    hint.style.display = 'none';
    var ts = el('div', { cls: 'vb-ts' });
    var go = el('button', { cls: 'vb-main', type: 'button', disabled: 'disabled', text: 'Send to the front desk' });
    var err = el('p', { cls: 'vb-err', role: 'alert', text: errText || '' });
    if (!errText) err.style.display = 'none';
    function ready() {
      var digits = phone.value.replace(/\D/g, '');
      var badCell = digits.length > 0 && !cell10(phone.value) && (digits.length > 11 || document.activeElement !== phone);
      hint.textContent = badCell ? 'Please enter a 10-digit cell number.' : '';
      hint.style.display = badCell ? '' : 'none';
      count.textContent = note.value.length + '/300';
      var okNow = st.token && cell10(phone.value) && first.value.trim() && note.value.trim();
      if (okNow) go.removeAttribute('disabled'); else go.setAttribute('disabled', 'disabled');
    }
    [first, phone, note].forEach(function (f) { f.addEventListener('input', ready); f.addEventListener('blur', ready); });
    go.addEventListener('click', function () { handoffSend(first.value.trim(), phone.value.trim(), note.value.trim(), how, go); });
    setCard([
      el('label', { cls: 'vb-label', 'for': 'vbHoFirst', text: 'First name' }), first,
      el('label', { cls: 'vb-label', 'for': 'vbHoPhone', text: 'Cell phone' }), phone, hint,
      el('label', { cls: 'vb-label', 'for': 'vbHoNote' }, ['What do you need? ', count]), note,
      el('div', { cls: 'vb-label', text: 'Should we call or text you?' }), hows,
      ts, el('div', { cls: 'vb-row', style: 'margin-top:8px' }, [go]), err,
      el('p', { cls: 'vb-note', style: 'margin-top:8px', text: 'For anything urgent, please call us now at ' + PHONE + '.' }),
      back('Never mind', function () { closeCard(); st.flow = null; say('No problem! Anything else I can help with?'); }),
    ], true);
    ready();
    loadTurnstile(function (e) {
      if (e || !window.turnstile) { ts.textContent = 'The security check could not load. Please refresh the page, or call ' + PHONE + '.'; return; }
      window.turnstile.render(ts, {
        sitekey: SITE_KEY, theme: 'light',
        size: ts.clientWidth >= 300 ? 'flexible' : 'compact',
        callback: function (t) { st.token = t; ready(); },
        'expired-callback': function () { st.token = ''; ready(); },
        'error-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
        'unsupported-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
      });
    });
  }
  function handoffSend(first, phone, note, how, btn) {
    st.first = first; st.phone = phone; st.hoNote = note; st.hoHow = how;
    btn.setAttribute('disabled', 'disabled'); btn.textContent = 'Sending…';
    var tokenNow = st.token; st.token = '';
    call({ action: 'handoff', phone: phone, first_name: first, note: note, contact: how,
           session_id: chatId(), turnstile_token: tokenNow }).then(function (r) {
      var e = r && r.error;
      if (r && r.ok) {
        closeCard(); st.flow = null; st.handoffNote = ''; st.hoNote = '';
        var verb = how === 'text' ? 'text' : how === 'call' ? 'call' : 'call or text';
        var lead = (r.updated ? 'Got it, I\'ve updated your request' : 'Thanks, ' + first) + '! ';
        if (r.open_now === false) {
          return say(lead + 'We\'re closed right now, so the front desk will ' + verb + ' you at ' + prettyPhone(phone) +
                     (r.next_open ? ' when we open ' + r.next_open : ' when we open') + '. For anything urgent, call ' + PHONE + '.');
        }
        return say(lead + 'The front desk has your message and will ' + verb + ' you at ' + prettyPhone(phone) +
                   ' as soon as they can, usually within 30 minutes.');
      }
      if (e === 'human_check_failed') return handoffForm('The security check didn\'t go through. Please try again.');
      if (e === 'bad_request') return handoffForm('Please check your first name, a 10-digit cell number, and what you need.');
      closeCard(); st.flow = null;
      if (e === 'too_many_tries') return say('You\'ve already sent us a few requests today, and the front desk has them. For anything urgent, please call ' + PHONE + '.');
      if (e === 'busy' || e === 'handoff_off') return say('I can\'t pass messages to the front desk right now. Please call us at ' + PHONE + ' and we\'ll help you.');
      return say('I couldn\'t send that right now. Please call us at ' + PHONE + ' and we\'ll help you.');
    });
  }

  // ── "Tell me when there's an opening" (docs/victoria-waitlist/plan.md) ──
  // A returning client whose technician (or day) has nothing open picks the
  // service, up to 3 posted days and a time of day. Nothing is booked: the
  // front desk is alerted when a time opens and texts them. If something
  // already fits, those times are shown instead.
  var WINDOWS = [['any', 'Any time'], ['morning', 'Morning (before 12)'], ['afternoon', 'Afternoon (12–5)'], ['evening', 'Evening (after 5)']];
  function waitLabel(tech) { return 'Tell me when ' + (tech ? tech + ' has' : 'there\'s') + ' an opening'; }
  function waitlistLink(tech, main, day) {
    if (!st.waitlistOn) return null;
    return el('div', { style: 'margin-bottom:' + (main ? '10px' : '6px') }, [el('button', { cls: main ? 'vb-main' : 'vb-link', type: 'button', text: '⏳ ' + waitLabel(tech), on: { click: function () {
      you(waitLabel(tech)); st.wlTech = tech || ''; st.wlTechId = ''; st.wlDays = day ? [day] : null; st.flow = 'waitlist'; waitlistForm();
    } } })]);
  }
  function waitlistStart() {
    if (offer) { offer.remove(); offer = null; }
    st.flow = 'waitlist'; st.service = null; st.wlDays = null;
    readWishes();
    setCard([el('p', { cls: 'vb-note', text: st.services ? 'One moment…' : 'Loading services…' })]);
    (st.services ? Promise.resolve(null) : call({ action: 'services' })).then(function (r) {
      if (!st.services) {
        if (!r || !r.ok || !r.services || !r.services.length) {
          closeCard(); st.flow = null;
          return say('I can\'t take waitlist requests in the chat right now. Please call us at ' + PHONE + ' and we\'ll help you.');
        }
        keepServices(r);
      }
      if (!st.through) {
        closeCard(); st.flow = null;
        return say('Our schedule for the coming days isn\'t posted yet, so there\'s nothing to wait for. Please call us at ' + PHONE + '.');
      }
      pickService();
    });
  }
  function waitlistDays() {
    var today = salonToday(), list = [];
    for (var i = 0; i < 31 && addDays(today, i) <= st.through; i++) list.push(addDays(today, i));
    return list;
  }
  function waitlistForm(errText) {
    st.token = '';
    var techs = techsForService(), days = waitlistDays(), today = salonToday();
    if (!st.wlDays) st.wlDays = st.wantDay && days.indexOf(st.wantDay) >= 0 ? [st.wantDay] : [];
    st.wlDays = st.wlDays.filter(function (d) { return days.indexOf(d) >= 0; });
    var win = st.wlWindow || 'any';

    var who = el('select', { cls: 'vb-field', id: 'vbWlTech', 'aria-label': 'Technician' }, [el('option', { value: '', text: 'Anyone' })]);
    techs.forEach(function (t) { who.appendChild(el('option', { value: t.id, text: t.name })); });
    var wanted = String(st.wlTechId || st.wlTech || '').toLowerCase();
    techs.forEach(function (t) { if (t.id === st.wlTechId || t.name.toLowerCase() === wanted) who.value = t.id; });
    var notHere = st.wlTech && !who.value && !st.wlTechId
      ? el('p', { cls: 'vb-note', text: st.wlTech + ' doesn\'t do ' + st.service.name + ' online, so this is for anyone. You can pick someone else.' }) : null;

    var dayRow = el('div', { cls: 'vb-row', role: 'group', 'aria-label': 'Days (up to 3)' });
    var dayBtns = days.map(function (d, i) {
      var b = el('button', { cls: 'vb-btn', type: 'button', text: dayLabel(d, i) });
      b.addEventListener('click', function () {
        var at = st.wlDays.indexOf(d);
        if (at >= 0) st.wlDays.splice(at, 1); else if (st.wlDays.length < 3) st.wlDays.push(d);
        paintDays(); ready();
      });
      dayRow.appendChild(b);
      return b;
    });
    function paintDays() {
      dayBtns.forEach(function (b, i) {
        var on = st.wlDays.indexOf(days[i]) >= 0;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
        if (!on && st.wlDays.length >= 3) b.setAttribute('disabled', 'disabled'); else b.removeAttribute('disabled');
      });
    }
    var winRow = el('div', { cls: 'vb-row', role: 'group', 'aria-label': 'Time of day' });
    WINDOWS.forEach(function (o) {
      var b = el('button', { cls: 'vb-btn' + (o[0] === win ? ' on' : ''), type: 'button', text: o[1], 'aria-pressed': String(o[0] === win) });
      b.addEventListener('click', function () {
        win = o[0];
        Array.prototype.forEach.call(winRow.children, function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
      });
      winRow.appendChild(b);
    });

    var first = el('input', { cls: 'vb-field', type: 'text', autocomplete: 'given-name', placeholder: 'First name', id: 'vbWlFirst', maxlength: '60' });
    var phone = el('input', { cls: 'vb-field', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '(847) 555-0100', id: 'vbWlPhone' });
    if (st.first) first.value = st.first;
    if (st.phone) phone.value = st.phone;
    var hint = el('p', { cls: 'vb-err', role: 'status', text: '' });
    hint.style.display = 'none';
    var ts = el('div', { cls: 'vb-ts' });
    var go = el('button', { cls: 'vb-main', type: 'button', disabled: 'disabled', text: 'Add me to the waitlist' });
    var err = el('p', { cls: 'vb-err', role: 'alert', text: errText || '' });
    if (!errText) err.style.display = 'none';
    function ready() {
      var digits = phone.value.replace(/\D/g, '');
      var badCell = digits.length > 0 && !cell10(phone.value) && (digits.length > 11 || document.activeElement !== phone);
      hint.textContent = badCell ? 'Please enter a 10-digit cell number.' : '';
      hint.style.display = badCell ? '' : 'none';
      var okNow = st.token && cell10(phone.value) && first.value.trim() && st.wlDays.length;
      if (okNow) go.removeAttribute('disabled'); else go.setAttribute('disabled', 'disabled');
    }
    [first, phone].forEach(function (f) { f.addEventListener('input', ready); f.addEventListener('blur', ready); });
    go.addEventListener('click', function () {
      var t = techs.filter(function (x) { return x.id === who.value; })[0] || null;
      waitlistSend(first.value.trim(), phone.value.trim(), t, win, go);
    });
    setCard([
      el('p', { cls: 'vb-note', text: st.service.name + ' (' + st.service.minutes + ' min). Nothing is booked yet: if a time opens, the front desk texts you.' }),
      el('label', { cls: 'vb-label', 'for': 'vbWlTech', text: 'Technician' }), who, notHere,
      el('div', { cls: 'vb-label', text: 'Which days? Pick up to 3' + (st.through ? ' (our schedule is posted through ' + longDay(st.through) + ')' : '') }), dayRow,
      el('div', { cls: 'vb-label', text: 'What time of day?' }), winRow,
      el('label', { cls: 'vb-label', 'for': 'vbWlFirst', text: 'First name' }), first,
      el('label', { cls: 'vb-label', 'for': 'vbWlPhone', text: 'Cell phone' }), phone, hint,
      el('p', { cls: 'vb-note', text: 'For returning clients: use the cell number and first name we have on file.' }),
      ts, el('div', { cls: 'vb-row', style: 'margin-top:8px' }, [go]), err,
      back('Change service', function () { st.service = null; pickService(); }), el('br'),
      back('Never mind', function () { closeCard(); st.flow = null; say('No problem! Anything else I can help with?'); }),
    ], true);
    paintDays(); ready();
    loadTurnstile(function (e) {
      if (e || !window.turnstile) { ts.textContent = 'The security check could not load. Please refresh the page, or call ' + PHONE + '.'; return; }
      window.turnstile.render(ts, {
        sitekey: SITE_KEY, theme: 'light',
        size: ts.clientWidth >= 300 ? 'flexible' : 'compact',
        callback: function (t) { st.token = t; ready(); },
        'expired-callback': function () { st.token = ''; ready(); },
        'error-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
        'unsupported-callback': function () { st.token = ''; ready(); tsTrouble(ts); },
      });
    });
  }
  function daysText(list) {
    var names = list.slice().sort().map(function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }); });
    return names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];
  }
  function waitlistSend(first, phone, tech, win, btn) {
    st.first = first; st.phone = phone; st.wlWindow = win; st.wlTechId = tech ? tech.id : '';
    btn.setAttribute('disabled', 'disabled'); btn.textContent = 'Sending…';
    var tokenNow = st.token; st.token = '';
    call({ action: 'waitlist_join', phone: phone, first_name: first, service_id: st.service.id, tech_id: tech ? tech.id : undefined,
           days: st.wlDays.slice(), window: win, session_id: chatId(), turnstile_token: tokenNow }).then(function (r) {
      var e = r && r.error;
      if (r && r.ok) {
        closeCard(); st.flow = null;
        var whenWin = win === 'any' ? '' : ' in the ' + win;
        sayNodes([(r.updated ? 'Got it, I\'ve updated your waitlist request' : 'You\'re on the waitlist, ' + first) + '! If ',
                  el('strong', { text: tech ? tech.name : 'anyone' }), ' gets an opening for ' + st.service.name + ' on ' + daysText(st.wlDays) + whenWin +
                  ', the front desk will text you at ' + prettyPhone(phone) + '. Nothing is booked until they confirm it with you.']);
        st.wlDays = null; st.wlTech = ''; st.wlTechId = '';
        return;
      }
      if (e === 'slot_open' && r.slots && r.slots.length) return slotsOpen(r.slots);
      if (e === 'human_check_failed') return waitlistForm('The security check didn\'t go through. Please try again.');
      if (e === 'bad_request') return waitlistForm('Please check your first name and 10-digit cell, and pick 1 to 3 days.');
      if (e === 'bad_days') { st.wlDays = []; return waitlistForm('Those days aren\'t on our posted schedule anymore. Please pick again.'); }
      if (e === 'no_client') return waitlistForm('I couldn\'t find a client with that cell number and first name. The waitlist is for returning clients, so please check them, or call ' + PHONE + '.');
      if (e === 'tech_unavailable') { st.wlTechId = ''; st.wlTech = ''; return waitlistForm((tech ? tech.name : 'That technician') + ' doesn\'t do ' + st.service.name + ' online. Pick Anyone or someone else.'); }
      closeCard(); st.flow = null;
      if (e === 'already_waiting') return say('You\'re already on the waitlist for that. The front desk will text you if something opens.');
      if (e === 'too_many_tries') return say('You\'ve sent a few requests already. Please try again later, or call us at ' + PHONE + '.');
      if (e === 'waitlist_off' || e === 'busy') return say('I can\'t take waitlist requests right now. Please call us at ' + PHONE + ' and we\'ll help you.');
      return say('I couldn\'t add you to the waitlist right now. Please call us at ' + PHONE + ' and we\'ll help you.');
    });
  }
  // Something already fits: book it in the chat instead of waiting
  function slotsOpen(slots) {
    closeCard(); st.flow = null;
    say('Good news: something is open right now, so there\'s no need to wait. Tap one to book it:');
    var row = el('div', { cls: 'vb-row' });
    slots.forEach(function (x) {
      var i = Math.round((Date.parse(x.date + 'T12:00:00Z') - Date.parse(salonToday() + 'T12:00:00Z')) / 86400000);
      var label = dayLabel(x.date, i) + ' · ' + to12(x.time) + ' · ' + x.tech;
      row.appendChild(el('button', { cls: 'vb-btn', type: 'button', text: label, on: { click: function () {
        you(label);
        st.flow = 'book'; st.onlyTech = x.tech; st.allTechs = false; st.autoAll = null; st.wantTime = mins(x.time);
        loadTimes(x.date);
      } } }));
    });
    setCard([row, back('Never mind', function () { closeCard(); say('No problem! Anything else I can help with?'); })]);
  }

  // Nothing found: show back what they typed (typos are the usual reason),
  // offer to check again or stop, and point to Galaxy's confirmation text.
  function prettyPhone(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : String(v || '');
  }
  function notFound(phone, first) {
    sayNodes([
      'I couldn\'t find an upcoming appointment for ', el('strong', { text: first }), ' at ', el('strong', { text: prettyPhone(phone) }), '.',
      el('div', { style: 'margin-top:6px', text: 'If that\'s not exactly the cell number and first name we have on file, tap Check again to fix it.' }),
      el('div', { style: 'margin-top:6px', text: 'Tip: when you book, we text you a confirmation ("your appointment is received") with the date and time. ' +
                                                   'If you booked in the last few minutes, it may take a little while to show up here.' }),
    ]);
    var again = el('button', { cls: 'vb-btn on', type: 'button', text: '🔁 Check again' });
    var stop = el('button', { cls: 'vb-btn', type: 'button', text: 'Never mind' });
    again.addEventListener('click', function () {
      you('Check again');
      say('Sure, fix anything that\'s off and check again.');
      lookupForm();
    });
    stop.addEventListener('click', function () {
      you('Never mind');
      closeCard();
      say('No problem! Questions about an appointment? Call us at ' + PHONE + '. Anything else I can help with?');
    });
    setCard([el('div', { cls: 'vb-row' }, [again, stop])]);
  }

  // ── how the chat reaches us ───────────────────────────────────────────
  function showOffer(kind, evenWithCard) {
    var w = msgs(); if (!w || (card && !evenWithCard)) return;
    if (offer) offer.remove();
    var mine = kind === 'lookup', desk = kind === 'handoff', wait = kind === 'waitlist';
    var b = el('button', { cls: 'vb-main', type: 'button', text: wait ? '⏳ ' + waitLabel(st.wlTech) : desk ? '📞 Have the front desk contact me' : mine ? '📋 Check my appointment' : '📅 Book here in the chat' });
    b.addEventListener('click', function () {
      if (wait) { you(waitLabel(st.wlTech)); return waitlistStart(); }
      if (desk) { you('Have the front desk contact me'); return handoffStart(); }
      you(mine ? 'Check my appointment' : 'Book here in the chat'); if (mine) lookupStart(); else start();
    });
    offer = el('div', { cls: 'vb-offer' }, [b]);
    w.appendChild(offer); scroll();
  }
  var MINE = /\b(my (appointment|appt|booking|reservation)s?|(i|we) (have|had|got) (an?|any|my) (appointment|appt|booking)s?|any (appointment|appt|booking)s? (for|under|with) me|when('s| is| was) my|am i (booked|scheduled|on the (book|schedule))|did i (book|make)|check (on )?my|confirm my)\b/i;
  var MINE_REPLY = /my appointment/i;   // Victoria pointed to the "My appointment" button
  var BOOKY = /\b(book|booking|appointment|appt|schedule|reserve|available|availability|opening|openings|slot|slots|\d{1,2}(:\d{2})?\s*(am|pm))\b/i;

  // The visitor typed while a card was still open (e.g. "does Jimmy have
  // openings?" on the day step). The reply pushed the card out of sight,
  // so bring the steps back under it, using what they just said.
  function midFlow(kind) {
    var w = msgs();
    if (offer) { offer.remove(); offer = null; }
    if (kind === 'book' && st.flow === 'book' && st.service && !st.time) {
      readWishes();
      st.onlyTech = null; st.allTechs = false; st.autoAll = null;   // a tech they just named wins
      if (st.wantDay) return pickDay(), true;          // straight to that day's times
      if (st.day) { say('Here are the open times for ' + longDay(st.day) + ' again:'); return loadTimes(st.day), true; }
      return pickDay(), true;
    }
    if (w) { w.appendChild(card); scroll(); }          // keep the open card in view
    if (kind === 'lookup' && st.flow !== 'lookup') showOffer('lookup', true);
    if (kind === 'handoff' && st.flow !== 'handoff') showOffer('handoff', true);
    if (kind === 'waitlist' && st.flow !== 'waitlist') showOffer('waitlist', true);
    return kind !== 'none';
  }

  window.vBook = {
    // the chat calls this after every AI reply; the AI can only lead to the button
    // The AI chooses the button (offer: "book" | "lookup" | "none", from the
    // hidden tag n8n strips). The phrase lists below are only a backup for
    // when that answer is missing (n8n down, old workflow, no tag).
    afterReply: function (userMsg, reply, aiOffer, handoffNote, waitlistTech) {
      st.said.push(String(userMsg || ''));
      st.lastReply = String(reply || '');
      if (st.said.length > 8) st.said.shift();
      // "online": dates past the posted schedule — the Galaxy booking page
      // (renderBookingLink), since booking in the chat only covers posted days
      var online = aiOffer === 'online';
      var kind = online ? 'none'
               : aiOffer === 'book' || aiOffer === 'lookup' || aiOffer === 'handoff' || aiOffer === 'waitlist' || aiOffer === 'none' ? aiOffer
               : MINE.test(String(userMsg || '')) || MINE_REPLY.test(String(reply || '')) ? 'lookup'
               : BOOKY.test(String(userMsg || '')) || BOOKY.test(String(reply || '')) ? 'book' : 'none';
      st.turnKind = online ? 'online' : kind;
      // last turn's Galaxy link goes once this turn offers something else
      if (!online) document.querySelectorAll('.vc-slot-row').forEach(function (el) { el.remove(); });
      if (kind === 'handoff') st.handoffNote = typeof handoffNote === 'string' ? handoffNote.slice(0, 300) : '';
      // Victoria only offers the waitlist while its switch is on
      if (kind === 'waitlist') { st.waitlistOn = true; st.wlTech = typeof waitlistTech === 'string' ? waitlistTech.slice(0, 40) : ''; }
      if (card) return midFlow(kind);
      if (kind === 'lookup') showOffer('lookup');
      else if (kind === 'handoff') showOffer('handoff');
      else if (kind === 'waitlist') showOffer('waitlist');
      else if (kind === 'book') showOffer();
      else if (offer) { offer.remove(); offer = null; }   // nothing to offer: clear the last turn's button
      return kind !== 'none';
    },
    // the chat calls this instead of its "Book online" link (n8n's own
    // booking guess): this turn's choice above wins
    offer: function () { if (st.turnKind === 'online') return false; if (!st.turnKind) showOffer(); return true; },
    // A service typed while the waitlist asks "Which service is it for?" ("fill"):
    // picked like a tap; several matches → those as buttons. Nothing matched: Victoria answers.
    typed: function (text) {
      if (st.flow !== 'waitlist' || st.service || !st.services) return false;
      var t = String(text || '').toLowerCase().trim();
      var exact = st.services.filter(function (x) { return String(x.name).toLowerCase() === t; });
      st.text = ' ' + t.replace(/[^a-z0-9&+:' ]+/g, ' ') + ' ';
      var list = exact.length ? exact : likelyServices();
      if (!list.length) return false;
      you(text);
      if (list.length === 1) { st.service = list[0]; waitlistForm(); return true; }
      say('Which one?');
      var row = el('div', { cls: 'vb-row' });
      list.slice().sort(byPriceThenName).slice(0, 12).forEach(function (x) {
        row.appendChild(el('button', { cls: 'vb-btn', type: 'button', text: serviceLabel(x), on: { click: function () { chooseService(x); } } }));
      });
      setCard([row, back('Something else', allServices)]);
      return true;
    },
    start: start,
  };

  // "Book appointment" chip starts the booking steps instead of asking the AI
  var prompts = document.getElementById('vcpPrompts');
  if (prompts) prompts.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.vcp-prompt');
    var what = b && (b.getAttribute('data-prompt') || '');
    var mine = b && b.getAttribute('data-vb') === 'mine';
    if (!b || (!mine && !/book/i.test(what))) return;
    e.stopPropagation(); e.preventDefault();
    if (prompts.classList.contains('open')) { var m = document.getElementById('vcpMore'); if (m) m.click(); }
    if (mine) { you('Check my appointment'); return lookupStart(); }
    you('Book an appointment');
    start();
  }, true);

  // "My appointment" takes the second place in the row; "Check availability" moves under "More"
  if (prompts) {
    var avail = prompts.querySelector('.vcp-prompt[data-prompt*="available"]');
    var mineBtn = el('button', { cls: 'vcp-prompt', type: 'button', 'data-vb': 'mine', 'data-prompt': 'Do I have an appointment?' },
                     ['📋 ', el('span', { cls: 'vcp-lg', text: 'My appointment' }), el('span', { cls: 'vcp-sm', text: 'My appt' })]);
    if (avail) { avail.classList.add('vcp-extra'); prompts.insertBefore(mineBtn, avail); }
    else prompts.insertBefore(mineBtn, document.getElementById('vcpMore'));
  }
})();

/* ══ Victoria's greeting types itself out the first time the chat opens ══ */
(function () {
  var msg = document.getElementById('openingMsg');
  var panel = document.getElementById('vcpPanel');
  var bubble = msg && msg.querySelector('.msg-bubble');
  if (!bubble || !panel) return;
  if (window._vcpRestored) return;   // mid-conversation: the greeting is already there
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // The greeting as a list of steps: open an element, or type a piece of text into it
  var source = bubble.cloneNode(true), steps = [];
  (function plan(from, depth) {
    Array.prototype.forEach.call(from.childNodes, function (n) {
      if (n.nodeType === 3) {
        var t = n.nodeValue.replace(/\s+/g, ' ');
        if (depth === 0 && !steps.length) t = t.replace(/^ /, '');
        if (t) steps.push({ text: Array.from(t), depth: depth });
      } else if (n.nodeType === 1) {
        if (!n.childNodes.length) { steps.push({ el: n.cloneNode(false), leaf: true }); return; }   // <br>
        steps.push({ el: n.cloneNode(false) });
        plan(n, depth + 1);
        steps.push({ close: true });
      }
    });
  })(source, 0);

  var screenReader = document.createElement('span');
  screenReader.className = 'vb-sr';
  screenReader.textContent = source.textContent.replace(/\s+/g, ' ').trim();
  bubble.textContent = '';
  bubble.setAttribute('aria-hidden', 'true');
  msg.insertBefore(screenReader, bubble);

  var stack = [bubble], i = 0, c = 0, timer = null, started = false, done = false;
  function wrap() { var w = document.getElementById('vcpMessages'); if (w) w.scrollTop = w.scrollHeight; }
  function step() {
    while (i < steps.length) {
      var s = steps[i];
      if (s.el) { stack[stack.length - 1].appendChild(s.el); if (!s.leaf) stack.push(s.el); i++; continue; }
      if (s.close) { stack.pop(); i++; continue; }
      if (!s.node) { s.node = document.createTextNode(''); stack[stack.length - 1].appendChild(s.node); }
      if (c < s.text.length) {
        s.node.nodeValue += s.text[c++];
        var ch = s.text[c - 1];
        timer = setTimeout(step, ch === '.' || ch === '!' || ch === '?' ? 220 : ch === ',' ? 90 : 16);
        wrap();
        return;
      }
      i++; c = 0;
    }
    finish();
  }
  function finish() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    bubble.textContent = '';
    Array.prototype.forEach.call(source.childNodes, function (n) { bubble.appendChild(n.cloneNode(true)); });
    bubble.removeAttribute('aria-hidden');
    screenReader.remove();
    wrap();
  }
  function start() {
    if (started) return;
    started = true;
    msg.style.opacity = '1';
    setTimeout(step, 350);
  }
  // Start when the chat is first opened; finish at once if the visitor starts talking
  if (panel.classList.contains('vcp-open')) start();
  else new MutationObserver(function (m, obs) { if (panel.classList.contains('vcp-open')) { obs.disconnect(); start(); } })
    .observe(panel, { attributes: true, attributeFilter: ['class'] });
  ['vcpPrompts', 'vcpInput', 'vcpSend'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e) { e.addEventListener('pointerdown', finish, true); e.addEventListener('keydown', finish, true); }
  });
})();
})();
