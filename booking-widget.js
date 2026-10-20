/*!
 * Salon Genie Booking Widget v1.0
 * Drop-in floating booking button for any salon website.
 *
 * USAGE — add these 2 lines before </body>:
 *
 *   <script>
 *     window.SG_BOOKING = {
 *       businessId:  'YOUR_BUSINESS_UUID',
 *       supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
 *       supabaseKey: 'YOUR_ANON_KEY',
 *       salonName:   'Victoria Nails',     // optional — shown in widget header
 *       accentColor: '#C4856A',            // optional — defaults to blush
 *       position:    'bottom-right',       // optional — bottom-right | bottom-left
 *     };
 *   </script>
 *   <script src="/booking-widget.js"></script>
 */

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────
  const CFG = Object.assign({
    businessId:   '',
    supabaseUrl:  '',
    supabaseKey:  '',
    salonName:    'Book an Appointment',
    accentColor:  '#C4856A',
    accentAmber:  '#C4993A',
    teal:         '#3D7A72',
    position:     'bottom-right',
    hideLauncher: false,  // true = hide the bubble, rely on external trigger
  }, window.SG_BOOKING || {});

  if (!CFG.businessId || !CFG.supabaseUrl || !CFG.supabaseKey) {
    console.warn('[SalonGenie] Missing required config: businessId, supabaseUrl, supabaseKey');
    return;
  }

  // ── State ───────────────────────────────────────────────
  const S = {
    open: false,
    step: 0,           // 0=mode, 1=service, 2=tech, 3=datetime, 4=info, 5=confirm
    mode: null,        // 'full' | 'request'
    services: null,
    technicians: null,
    sel: {
      service: null,
      tech: null,       // null = any
      date: null,
      time: null,
    },
    takenSlots: [],
    calYear:  new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    sb: null,
    loading: false,
  };

  // ── Helpers ─────────────────────────────────────────────
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function fmt12(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  function fmtDate(d) {
    if (!d) return '';
    return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  }

  const MONTHS = ['January','February','March','April','May','June','July',
                  'August','September','October','November','December'];
  const DOW    = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function svcIcon(name) {
    const lc = (name||'').toLowerCase();
    const map = { mani:'💅', pedi:'🦶', gel:'✨', fill:'💎', nail:'💅',
                  wax:'🌸', brow:'🪮', lash:'👁', massage:'💆', facial:'🧖' };
    return Object.entries(map).find(([k]) => lc.includes(k))?.[1] || '💅';
  }

  // ── CSS (injected once) ─────────────────────────────────
  function injectCSS() {
    if (document.getElementById('sg-widget-css')) return;
    const a = CFG.accentColor;
    const am = CFG.accentAmber;
    const tl = CFG.teal;
    const style = document.createElement('style');
    style.id = 'sg-widget-css';
    style.textContent = `
/* ── Launcher bubble ── */
#sg-launcher {
  position: fixed;
  ${CFG.position === 'bottom-left' ? 'left:24px;' : 'right:24px;'}
  bottom: 24px;
  width: 58px; height: 58px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${a}, ${am});
  border: none; cursor: pointer;
  box-shadow: 0 6px 24px rgba(196,133,106,0.45);
  display: flex; align-items: center; justify-content: center;
  z-index: 999998;
  transition: transform 0.25s cubic-bezier(.175,.885,.32,1.275), box-shadow 0.2s;
  font-size: 22px;
  color: white;
  font-family: sans-serif;
}
#sg-launcher:hover { transform: scale(1.1); box-shadow: 0 8px 32px rgba(196,133,106,0.55); }
#sg-launcher.open  { transform: scale(0.92) rotate(45deg); }

#sg-launcher-badge {
  position: absolute;
  top: -2px; right: -2px;
  width: 18px; height: 18px;
  background: #C45A4A;
  border-radius: 50%;
  border: 2px solid white;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 700;
  color: white; line-height: 1;
}

/* ── Panel ── */
#sg-panel {
  position: fixed;
  ${CFG.position === 'bottom-left' ? 'left:16px;' : 'right:16px;'}
  bottom: 92px;
  width: 380px;
  max-height: 82vh;
  background: #FDFAF6;
  border-radius: 20px;
  box-shadow: 0 24px 80px rgba(28,24,20,0.22), 0 0 0 1px rgba(0,0,0,0.08);
  z-index: 999999;
  display: flex; flex-direction: column;
  overflow: hidden;
  transform: scale(0.9) translateY(20px);
  transform-origin: ${CFG.position === 'bottom-left' ? 'left' : 'right'} bottom;
  opacity: 0;
  pointer-events: none;
  transition: transform 0.28s cubic-bezier(.175,.885,.32,1.275), opacity 0.22s ease;
}
#sg-panel.open {
  transform: scale(1) translateY(0);
  opacity: 1;
  pointer-events: all;
}
@media (max-width: 440px) {
  #sg-panel {
    left: 8px !important; right: 8px !important;
    width: auto;
    bottom: 80px;
    max-height: 88vh;
    border-radius: 18px;
  }
}

/* ── Panel header ── */
.sg-head {
  background: linear-gradient(135deg, #18120E 0%, #3D2416 60%, #7A4828 100%);
  padding: 16px 18px 14px;
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0;
  position: relative;
}
.sg-head::after {
  content: '✦';
  position: absolute; right: 52px; top: -8px;
  font-size: 60px; color: rgba(196,133,106,0.08);
  pointer-events: none; line-height: 1;
}
.sg-head-left { display: flex; align-items: center; gap: 10px; }
.sg-head-gem {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, ${a}, ${am});
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: white; flex-shrink: 0;
}
.sg-head-name {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 15px; font-style: italic;
  color: #F7F3EE; font-weight: normal;
}
.sg-head-sub { font-size: 10px; color: rgba(247,243,238,0.45); letter-spacing: 1px; text-transform: uppercase; margin-top: 1px; }
.sg-close-btn {
  width: 28px; height: 28px;
  border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.08);
  color: rgba(247,243,238,0.7);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 14px; line-height: 1;
  transition: background 0.15s;
  flex-shrink: 0;
}
.sg-close-btn:hover { background: rgba(255,255,255,0.16); color: white; }

/* ── Progress bar ── */
.sg-progress {
  background: #F5F0E8; padding: 10px 16px; flex-shrink: 0;
  border-bottom: 1px solid rgba(0,0,0,0.07);
}
.sg-steps { display: flex; align-items: center; gap: 0; }
.sg-step  { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1; position: relative; }
.sg-step:not(:last-child)::after {
  content: ''; position: absolute;
  top: 10px; left: 50%; width: 100%; height: 1px;
  background: #EDE6D8; transition: background 0.3s; z-index: 0;
}
.sg-step.done:not(:last-child)::after { background: ${tl}; }
.sg-step-dot {
  width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid #EDE6D8; background: #FDFAF6;
  display: flex; align-items: center; justify-content: center;
  font-size: 8px; font-weight: 700; color: #A89A8E;
  position: relative; z-index: 1; transition: all 0.2s;
}
.sg-step.active .sg-step-dot { border-color: ${a}; background: ${a}; color: white; }
.sg-step.done   .sg-step-dot { border-color: ${tl}; background: ${tl}; color: white; }
.sg-step-lbl { font-size: 9px; color: #A89A8E; white-space: nowrap; }
.sg-step.active .sg-step-lbl { color: ${a}; }

/* ── Body ── */
.sg-body {
  flex: 1; overflow-y: auto; padding: 18px 16px 16px;
  display: flex; flex-direction: column; gap: 0;
  scroll-behavior: smooth;
}
.sg-body::-webkit-scrollbar { width: 4px; }
.sg-body::-webkit-scrollbar-track { background: transparent; }
.sg-body::-webkit-scrollbar-thumb { background: #EDE6D8; border-radius: 4px; }

/* Section title */
.sg-section-title {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 18px; color: #1C1814;
  margin-bottom: 4px; font-weight: normal;
}
.sg-section-sub { font-size: 12px; color: #A89A8E; margin-bottom: 16px; line-height: 1.5; }

/* ── Mode cards ── */
.sg-mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px; }
.sg-mode-card {
  padding: 16px 12px; border-radius: 13px;
  border: 2px solid rgba(0,0,0,0.08);
  background: white; cursor: pointer;
  text-align: center; transition: all 0.18s;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.sg-mode-card:hover { border-color: ${a}; background: rgba(196,133,106,0.06); }
.sg-mode-card .sg-mode-icon { font-size: 26px; }
.sg-mode-card .sg-mode-name { font-size: 13px; font-weight: 600; color: #1C1814; }
.sg-mode-card .sg-mode-desc { font-size: 11px; color: #A89A8E; line-height: 1.4; }

/* ── Service list ── */
.sg-svc-list { display: flex; flex-direction: column; gap: 8px; }
.sg-svc-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 12px;
  border: 2px solid rgba(0,0,0,0.07);
  background: white; cursor: pointer;
  transition: all 0.15s; box-shadow: 0 1px 4px rgba(28,24,20,0.05);
}
.sg-svc-item:hover { border-color: ${a}; transform: translateX(2px); }
.sg-svc-item.selected { border-color: ${a}; background: rgba(196,133,106,0.07); }
.sg-svc-emoji { font-size: 22px; flex-shrink: 0; }
.sg-svc-info  { flex: 1; min-width: 0; }
.sg-svc-name  { font-size: 13px; font-weight: 600; color: #1C1814; }
.sg-svc-meta  { font-size: 11px; color: #A89A8E; margin-top: 1px; }
.sg-svc-price { font-family: Georgia, serif; font-size: 16px; color: ${a}; flex-shrink: 0; }
.sg-svc-check {
  width: 20px; height: 20px; border-radius: 50%;
  background: ${a}; color: white;
  display: none; align-items: center; justify-content: center;
  font-size: 10px; flex-shrink: 0;
}
.sg-svc-item.selected .sg-svc-check { display: flex; }

/* ── Tech grid ── */
.sg-tech-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sg-tech-card {
  padding: 14px 8px; border-radius: 12px;
  border: 2px solid rgba(0,0,0,0.07);
  background: white; cursor: pointer;
  text-align: center; transition: all 0.15s;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.sg-tech-card:hover  { border-color: ${a}; }
.sg-tech-card.selected { border-color: ${a}; background: rgba(196,133,106,0.07); }
.sg-tech-avatar {
  width: 48px; height: 48px; border-radius: 50%;
  background: #F5F0E8;
  display: flex; align-items: center; justify-content: center;
  font-family: Georgia, serif; font-size: 20px; color: #6A6058;
  overflow: hidden;
}
.sg-tech-avatar img { width: 100%; height: 100%; object-fit: cover; }
.sg-tech-name { font-size: 11px; font-weight: 600; color: #1C1814; line-height: 1.2; }

/* ── Calendar ── */
.sg-cal { background: white; border-radius: 13px; border: 1px solid rgba(0,0,0,0.08); padding: 14px; margin-bottom: 14px; }
.sg-cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.sg-cal-nav-btn {
  width: 28px; height: 28px; border-radius: 7px;
  border: 1px solid rgba(0,0,0,0.1); background: #FDFAF6;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 14px; color: #6A6058; transition: all 0.15s;
}
.sg-cal-nav-btn:hover { border-color: ${a}; color: ${a}; }
.sg-cal-month { font-family: Georgia, serif; font-size: 14px; color: #1C1814; }
.sg-cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; }
.sg-cal-dow { font-size: 9px; font-weight: 700; letter-spacing: 0.3px; color: #A89A8E; text-align: center; padding: 3px 0; text-transform: uppercase; }
.sg-cal-day {
  aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  border-radius: 7px; font-size: 12px; font-weight: 500; color: #1C1814;
  cursor: pointer; transition: all 0.13s; position: relative;
}
.sg-cal-day:hover:not(.sg-disabled):not(.sg-other) { background: rgba(196,133,106,0.12); }
.sg-cal-day.sg-today  { font-weight: 700; color: ${a}; }
.sg-cal-day.sg-sel    { background: ${a}; color: white; border-radius: 8px; }
.sg-cal-day.sg-disabled { opacity: 0.25; cursor: default; }
.sg-cal-day.sg-other   { opacity: 0.2; cursor: default; }

/* Time slots */
.sg-times { display: grid; grid-template-columns: repeat(3,1fr); gap: 6px; max-height: 180px; overflow-y: auto; margin-bottom: 4px; }
.sg-time {
  padding: 8px 4px; border-radius: 9px;
  border: 1.5px solid rgba(0,0,0,0.09); background: white;
  font-size: 12px; font-weight: 600; color: #1C1814;
  text-align: center; cursor: pointer; transition: all 0.13s;
}
.sg-time:hover       { border-color: ${a}; color: ${a}; }
.sg-time.sg-time-sel { background: ${a}; border-color: ${a}; color: white; }
.sg-time.sg-taken    { opacity: 0.3; cursor: not-allowed; text-decoration: line-through; }
.sg-no-times { font-size: 12px; color: #A89A8E; text-align: center; padding: 16px 0; }

/* ── Client form ── */
.sg-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.sg-label { font-size: 10px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #6A6058; }
.sg-input {
  padding: 11px 12px; border-radius: 10px;
  border: 1.5px solid rgba(0,0,0,0.11); background: white;
  font-size: 14px; color: #1C1814; outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
  font-family: inherit; width: 100%;
}
.sg-input:focus { border-color: ${a}; box-shadow: 0 0 0 3px rgba(196,133,106,0.14); }
.sg-input::placeholder { color: #C8BEB8; }
.sg-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

/* ── Request form ── */
.sg-request-form { display: flex; flex-direction: column; }

/* ── Confirmation ── */
.sg-confirm {
  text-align: center; padding: 8px 0 16px;
}
.sg-confirm-icon {
  width: 64px; height: 64px; border-radius: 50%;
  background: linear-gradient(135deg, ${a}, ${am});
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; margin: 0 auto 16px;
  box-shadow: 0 8px 24px rgba(196,133,106,0.35);
  animation: sg-pop .4s cubic-bezier(.175,.885,.32,1.275) both;
}
@keyframes sg-pop { from { transform:scale(0.5); opacity:0; } to { transform:scale(1); opacity:1; } }
.sg-confirm-title { font-family: Georgia, serif; font-size: 22px; color: #1C1814; margin-bottom: 6px; font-weight: normal; }
.sg-confirm-sub   { font-size: 12px; color: #6A6058; margin-bottom: 18px; line-height: 1.6; }
.sg-confirm-card  {
  background: white; border: 1px solid rgba(0,0,0,0.08);
  border-radius: 13px; padding: 14px 16px; text-align: left;
  box-shadow: 0 4px 16px rgba(28,24,20,0.08); margin-bottom: 14px;
}
.sg-confirm-row {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06); gap: 12px;
  font-size: 12px;
}
.sg-confirm-row:last-child { border-bottom: none; }
.sg-confirm-key { color: #A89A8E; text-transform: uppercase; letter-spacing: 0.6px; font-size: 10px; font-weight: 600; }
.sg-confirm-val { color: #1C1814; font-weight: 600; text-align: right; }

/* ── Nav buttons ── */
.sg-footer {
  padding: 12px 16px; border-top: 1px solid rgba(0,0,0,0.07);
  display: flex; justify-content: space-between; align-items: center;
  flex-shrink: 0; background: #FDFAF6;
}
.sg-btn-back {
  height: 38px; padding: 0 16px; border-radius: 10px;
  border: 1.5px solid rgba(0,0,0,0.11); background: white;
  color: #6A6058; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.sg-btn-back:hover { border-color: ${a}; color: ${a}; }
.sg-btn-next {
  height: 42px; padding: 0 22px; border-radius: 11px;
  border: none; background: ${a}; color: white;
  font-size: 14px; font-weight: 600;
  cursor: pointer; transition: all 0.18s;
  box-shadow: 0 4px 14px rgba(196,133,106,0.3);
  display: flex; align-items: center; gap: 6px;
}
.sg-btn-next:hover    { background: #B5745A; transform: translateY(-1px); }
.sg-btn-next:disabled { background: #EDE6D8; color: #A89A8E; box-shadow: none; cursor: not-allowed; transform: none; }

/* ── Spinner / Skeleton ── */
.sg-spinner {
  width: 28px; height: 28px; border-radius: 50%;
  border: 3px solid #EDE6D8; border-top-color: ${a};
  animation: sg-spin 0.7s linear infinite; margin: 24px auto;
}
@keyframes sg-spin { to { transform: rotate(360deg); } }
.sg-skel {
  background: linear-gradient(90deg, #F5F0E8 25%, #EDE6D8 50%, #F5F0E8 75%);
  background-size: 200% 100%; border-radius: 10px;
  animation: sg-shim 1.3s infinite;
}
@keyframes sg-shim { to { background-position: -200% 0; } }

/* ── Status ── */
.sg-status {
  padding: 10px 12px; border-radius: 9px; font-size: 12px;
  font-weight: 500; margin-top: 10px; display: none; line-height: 1.4;
}
.sg-status.ok  { background: rgba(61,122,114,0.1); color: #2A5E58; }
.sg-status.err { background: rgba(196,90,74,0.08); color: #9B3A2E; }
`;
    document.head.appendChild(style);
  }

  // ── Supabase client ─────────────────────────────────────
  async function initSb() {
    if (S.sb) return S.sb;
    if (!window.supabase?.createClient) {
      await new Promise((res, rej) => {
        const scr = document.createElement('script');
        scr.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        scr.onload = res; scr.onerror = rej;
        document.head.appendChild(scr);
      });
    }
    S.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
    return S.sb;
  }

  // ── Widget DOM ──────────────────────────────────────────
  function buildWidget() {
    // Launcher bubble (hidden when hideLauncher:true)
    const launcher = document.createElement('button');
    launcher.id = 'sg-launcher';
    launcher.setAttribute('aria-label', 'Book appointment');
    launcher.innerHTML = `<div id="sg-launcher-badge" style="display:none;">1</div>✦`;
    launcher.addEventListener('click', togglePanel);
    if (CFG.hideLauncher) {
      launcher.style.cssText = 'display:none!important';
    }
    document.body.appendChild(launcher);

    // Expose global open/close so external buttons can trigger the panel
    window.sgOpenBooking  = () => { if (!S.open) togglePanel(); };
    window.sgCloseBooking = () => { if ( S.open) togglePanel(); };

    // Panel
    const panel = document.createElement('div');
    panel.id = 'sg-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Book appointment');
    panel.innerHTML = `
      <div class="sg-head">
        <div class="sg-head-left">
          <div class="sg-head-gem">✦</div>
          <div>
            <div class="sg-head-name">${esc(CFG.salonName)}</div>
            <div class="sg-head-sub">Online Booking</div>
          </div>
        </div>
        <button class="sg-close-btn" id="sg-close" aria-label="Close">✕</button>
      </div>
      <div class="sg-progress" id="sg-progress" style="display:none;">
        <div class="sg-steps" id="sg-steps"></div>
      </div>
      <div class="sg-body" id="sg-body"></div>
      <div class="sg-footer" id="sg-footer"></div>
    `;
    document.body.appendChild(panel);

    document.getElementById('sg-close').addEventListener('click', togglePanel);

    // Close on outside click
    document.addEventListener('click', e => {
      if (S.open && !panel.contains(e.target) && e.target !== launcher) {
        togglePanel();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && S.open) togglePanel();
    });
  }

  function togglePanel() {
    const launcher = document.getElementById('sg-launcher');
    const panel    = document.getElementById('sg-panel');
    S.open = !S.open;
    launcher.classList.toggle('open', S.open);
    panel.classList.toggle('open', S.open);
    if (S.open && S.step === 0) renderModeSelect();
  }

  // ── Progress bar ────────────────────────────────────────
  function renderProgress() {
    const prog  = document.getElementById('sg-progress');
    const steps = document.getElementById('sg-steps');
    if (S.step === 0 || S.step === 5) { prog.style.display = 'none'; return; }
    prog.style.display = 'block';
    const labels = ['Service', 'Tech', 'Date', 'Info'];
    steps.innerHTML = labels.map((l, i) => {
      const n = i + 1;
      const cls = n < S.step ? 'sg-step done' : n === S.step ? 'sg-step active' : 'sg-step';
      const dot = n < S.step ? '✓' : String(n);
      return `<div class="${cls}"><div class="sg-step-dot">${dot}</div><div class="sg-step-lbl">${l}</div></div>`;
    }).join('');
  }

  // ── Footer buttons ──────────────────────────────────────
  function renderFooter(backLabel, nextLabel, nextId, backId, nextDisabled = false) {
    const footer = document.getElementById('sg-footer');
    footer.innerHTML = '';
    if (backLabel) {
      const b = document.createElement('button');
      b.className = 'sg-btn-back'; b.id = backId || 'sg-back';
      b.textContent = backLabel;
      footer.appendChild(b);
    } else {
      footer.appendChild(document.createElement('div'));
    }
    if (nextLabel) {
      const n = document.createElement('button');
      n.className = 'sg-btn-next'; n.id = nextId || 'sg-next';
      n.textContent = nextLabel; n.disabled = nextDisabled;
      footer.appendChild(n);
    }
  }

  // ── STEP 0: Mode select ─────────────────────────────────
  function renderModeSelect() {
    S.step = 0;
    renderProgress();
    document.getElementById('sg-footer').innerHTML = '';
    document.getElementById('sg-body').innerHTML = `
      <div class="sg-section-title">How would you like to book?</div>
      <div class="sg-section-sub">Choose the option that works best for you.</div>
      <div class="sg-mode-grid">
        <div class="sg-mode-card" id="sg-mode-full">
          <div class="sg-mode-icon">📅</div>
          <div class="sg-mode-name">Book now</div>
          <div class="sg-mode-desc">Pick service, technician &amp; time — instant confirmation</div>
        </div>
        <div class="sg-mode-card" id="sg-mode-req">
          <div class="sg-mode-icon">📝</div>
          <div class="sg-mode-name">Request a time</div>
          <div class="sg-mode-desc">Tell us what you need — we'll call to confirm</div>
        </div>
      </div>
    `;
    document.getElementById('sg-mode-full')?.addEventListener('click', () => {
      S.mode = 'full';
      loadAndRenderServices();
    });
    document.getElementById('sg-mode-req')?.addEventListener('click', () => {
      S.mode = 'request';
      renderRequestForm();
    });
  }

  // ── STEP 1: Services ────────────────────────────────────
  async function loadAndRenderServices() {
    S.step = 1;
    renderProgress();
    document.getElementById('sg-body').innerHTML = `
      <div class="sg-section-title">Choose a service</div>
      <div class="sg-section-sub">What would you like today?</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div class="sg-skel" style="height:60px;"></div>
        <div class="sg-skel" style="height:60px;"></div>
        <div class="sg-skel" style="height:60px;"></div>
      </div>
    `;
    renderFooter('← Back', 'Next: Technician →', 'sg-next-svc', 'sg-back-mode', true);
    document.getElementById('sg-back-mode')?.addEventListener('click', renderModeSelect);

    if (!S.services) {
      try {
        const sb = await initSb();
        const { data } = await sb.schema('salon').from('service_catalog')
          .select('id, name, description, price, duration_minutes, category_name')
          .eq('business_id', CFG.businessId)
          .order('name');
        S.services = data || [];
      } catch (e) {
        document.getElementById('sg-body').innerHTML += `<div class="sg-status err" style="display:block;">Could not load services. Please try again.</div>`;
        return;
      }
    }

    const body = document.getElementById('sg-body');
    body.innerHTML = `
      <div class="sg-section-title">Choose a service</div>
      <div class="sg-section-sub">What would you like today?</div>
      <div class="sg-svc-list" id="sg-svc-list">
        ${S.services.map(s => `
          <div class="sg-svc-item" data-id="${s.id}">
            <div class="sg-svc-emoji">${svcIcon(s.name)}</div>
            <div class="sg-svc-info">
              <div class="sg-svc-name">${esc(s.name)}</div>
              <div class="sg-svc-meta">${s.duration_minutes ? s.duration_minutes + ' min' : ''}${s.duration_minutes && s.description ? ' · ' : ''}${s.description ? esc(s.description.slice(0,40)) + (s.description.length>40?'…':'') : ''}</div>
            </div>
            ${s.price ? `<div class="sg-svc-price">$${Number(s.price).toFixed(0)}</div>` : ''}
            <div class="sg-svc-check">✓</div>
          </div>
        `).join('')}
      </div>
    `;

    body.querySelectorAll('.sg-svc-item').forEach(el => {
      el.addEventListener('click', () => {
        body.querySelectorAll('.sg-svc-item').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        S.sel.service = S.services.find(s => s.id === el.dataset.id);
        const nextBtn = document.getElementById('sg-next-svc');
        if (nextBtn) nextBtn.disabled = false;
      });
    });

    document.getElementById('sg-next-svc')?.addEventListener('click', () => {
      if (S.sel.service) loadAndRenderTechs();
    });
  }

  // ── STEP 2: Technicians ─────────────────────────────────
  async function loadAndRenderTechs() {
    S.step = 2;
    renderProgress();
    document.getElementById('sg-body').innerHTML = `
      <div class="sg-section-title">Pick your technician</div>
      <div class="sg-section-sub">Or let us assign the next available.</div>
      <div class="sg-tech-grid">
        <div class="sg-skel" style="height:100px;border-radius:12px;"></div>
        <div class="sg-skel" style="height:100px;border-radius:12px;"></div>
        <div class="sg-skel" style="height:100px;border-radius:12px;"></div>
      </div>
    `;
    renderFooter('← Service', 'Next: Date & Time →', 'sg-next-tech', 'sg-back-svc');
    document.getElementById('sg-back-svc')?.addEventListener('click', loadAndRenderServices);

    if (!S.technicians) {
      try {
        const sb = await initSb();
        const { data } = await sb.schema('salon').from('employees')
          .select('id, full_name, display_name, role, photo_url')
          .eq('business_id', CFG.businessId)
          .order('full_name');
        const techRoles = new Set(['nail tech','technician','tech','nail technician','stylist','manager','']);
        S.technicians = (data || []).filter(e => techRoles.has((e.role||'').toLowerCase()));
      } catch (_) { S.technicians = []; }
    }

    const body = document.getElementById('sg-body');
    const anyAvatar = `<div class="sg-tech-avatar" style="font-size:22px;">⚡</div>`;
    const techCards = S.technicians.map(t => {
      const name = t.display_name || t.full_name || 'Tech';
      const avatar = t.photo_url
        ? `<div class="sg-tech-avatar"><img src="${esc(t.photo_url)}" alt="${esc(name)}" loading="lazy"></div>`
        : `<div class="sg-tech-avatar">${esc(name[0]?.toUpperCase() || 'T')}</div>`;
      return `<div class="sg-tech-card" data-tid="${t.id}">${avatar}<div class="sg-tech-name">${esc(name)}</div></div>`;
    }).join('');

    body.innerHTML = `
      <div class="sg-section-title">Pick your technician</div>
      <div class="sg-section-sub">Or let us assign the next available.</div>
      <div class="sg-tech-grid" id="sg-tech-grid">
        <div class="sg-tech-card sg-tech-any selected" data-tid="any">${anyAvatar}<div class="sg-tech-name">Next Available</div></div>
        ${techCards}
      </div>
    `;

    // Pre-select "any"
    S.sel.tech = null;
    const nextBtn = document.getElementById('sg-next-tech');
    if (nextBtn) nextBtn.disabled = false;

    body.querySelectorAll('.sg-tech-card').forEach(el => {
      el.addEventListener('click', () => {
        body.querySelectorAll('.sg-tech-card').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        S.sel.tech = el.dataset.tid === 'any'
          ? null
          : S.technicians.find(t => t.id === el.dataset.tid) || null;
        if (nextBtn) nextBtn.disabled = false;
      });
    });

    document.getElementById('sg-next-tech')?.addEventListener('click', renderCalendar);
  }

  // ── STEP 3: Calendar + time slots ──────────────────────
  function renderCalendar() {
    S.step = 3;
    renderProgress();
    const body = document.getElementById('sg-body');

    function buildCalHTML() {
      const { calYear: y, calMonth: m } = S;
      const firstDay = new Date(y, m, 1).getDay();
      const days     = new Date(y, m + 1, 0).getDate();
      const today    = new Date(); today.setHours(0,0,0,0);
      let html = DOW.map(d => `<div class="sg-cal-dow">${d}</div>`).join('');
      for (let i = 0; i < firstDay; i++) html += `<div class="sg-cal-day sg-other"></div>`;
      for (let d = 1; d <= days; d++) {
        const date   = new Date(y, m, d);
        const isPast = date < today;
        const isFar  = date > new Date(today.getTime() + 90*86400000);
        const isSun  = date.getDay() === 0;
        const isSel  = S.sel.date && date.getTime() === S.sel.date.getTime();
        const cls = ['sg-cal-day',
          isPast || isFar || isSun ? 'sg-disabled' : '',
          date.getTime() === today.getTime() ? 'sg-today' : '',
          isSel ? 'sg-sel' : '',
        ].filter(Boolean).join(' ');
        html += `<div class="${cls}" data-d="${date.toISOString().slice(0,10)}">${d}</div>`;
      }
      return html;
    }

    body.innerHTML = `
      <div class="sg-section-title">Choose a date</div>
      <div class="sg-cal" id="sg-cal">
        <div class="sg-cal-nav">
          <button class="sg-cal-nav-btn" id="sg-cal-prev">‹</button>
          <div class="sg-cal-month" id="sg-cal-month">${MONTHS[S.calMonth]} ${S.calYear}</div>
          <button class="sg-cal-nav-btn" id="sg-cal-next">›</button>
        </div>
        <div class="sg-cal-grid" id="sg-cal-grid">${buildCalHTML()}</div>
      </div>
      <div id="sg-time-heading" style="font-size:12px;font-weight:600;color:#6A6058;margin-bottom:10px;">Select a date to see available times</div>
      <div class="sg-times" id="sg-times"></div>
      <div class="sg-status" id="sg-cal-status"></div>
    `;

    renderFooter('← Technician', 'Next: Your Info →', 'sg-next-time', 'sg-back-tech', true);
    document.getElementById('sg-back-tech')?.addEventListener('click', loadAndRenderTechs);

    function attachDayClicks() {
      document.getElementById('sg-cal-grid')?.querySelectorAll('.sg-cal-day:not(.sg-disabled):not(.sg-other)').forEach(el => {
        el.addEventListener('click', () => {
          S.sel.date = new Date(el.dataset.d + 'T00:00:00');
          S.sel.time = null;
          const nb = document.getElementById('sg-next-time');
          if (nb) nb.disabled = true;
          document.getElementById('sg-cal-grid').innerHTML = buildCalHTML();
          attachDayClicks();
          loadSlots();
        });
      });
    }
    attachDayClicks();

    document.getElementById('sg-cal-prev')?.addEventListener('click', () => {
      if (S.calMonth === 0) { S.calYear--; S.calMonth = 11; }
      else S.calMonth--;
      document.getElementById('sg-cal-month').textContent = `${MONTHS[S.calMonth]} ${S.calYear}`;
      document.getElementById('sg-cal-grid').innerHTML = buildCalHTML();
      attachDayClicks();
    });

    document.getElementById('sg-cal-next')?.addEventListener('click', () => {
      if (S.calMonth === 11) { S.calYear++; S.calMonth = 0; }
      else S.calMonth++;
      document.getElementById('sg-cal-month').textContent = `${MONTHS[S.calMonth]} ${S.calYear}`;
      document.getElementById('sg-cal-grid').innerHTML = buildCalHTML();
      attachDayClicks();
    });
  }

  async function loadSlots() {
    if (!S.sel.date) return;
    const timesEl  = document.getElementById('sg-times');
    const heading  = document.getElementById('sg-time-heading');
    const d = S.sel.date;
    const dateStr = d.toISOString().slice(0, 10);
    heading.textContent = d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
    timesEl.innerHTML = `<div class="sg-spinner"></div>`;

    try {
      const sb = await initSb();
      let q = sb.schema('salon').from('appointments')
        .select('start_time').eq('business_id', CFG.businessId)
        .gte('start_time', `${dateStr}T00:00:00`)
        .lte('start_time', `${dateStr}T23:59:59`)
        .neq('status', 'cancelled');
      if (S.sel.tech?.id) q = q.eq('technician_id', S.sel.tech.id);
      const { data } = await q;
      S.takenSlots = (data || []).map(a => a.start_time?.slice(11,16));
    } catch (_) { S.takenSlots = []; }

    const now = new Date();
    const slots = [];
    for (let h = 9; h < 19; h++) {
      for (let m = 0; m < 60; m += 30) {
        slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      }
    }

    timesEl.innerHTML = slots.map(t => {
      const [h, m] = t.split(':').map(Number);
      const slotDate = new Date(d); slotDate.setHours(h, m, 0, 0);
      const past   = slotDate <= now;
      const taken  = S.takenSlots.includes(t);
      const sel    = S.sel.time === t;
      const cls = ['sg-time', (past||taken)?'sg-taken':'', sel?'sg-time-sel':''].filter(Boolean).join(' ');
      return `<div class="${cls}" data-t="${t}" ${(past||taken)?'aria-disabled="true"':''}>${fmt12(t)}</div>`;
    }).join('');

    timesEl.querySelectorAll('.sg-time:not(.sg-taken)').forEach(el => {
      el.addEventListener('click', () => {
        timesEl.querySelectorAll('.sg-time').forEach(e => e.classList.remove('sg-time-sel'));
        el.classList.add('sg-time-sel');
        S.sel.time = el.dataset.t;
        const nb = document.getElementById('sg-next-time');
        if (nb) nb.disabled = false;
      });
    });

    if (slots.every(t => S.takenSlots.includes(t))) {
      timesEl.innerHTML = `<div class="sg-no-times">No open slots this day — try another date.</div>`;
    }

    document.getElementById('sg-next-time')?.addEventListener('click', renderInfoForm);
  }

  // ── STEP 4: Client info ─────────────────────────────────
  function renderInfoForm() {
    S.step = 4;
    renderProgress();
    const body = document.getElementById('sg-body');
    body.innerHTML = `
      <div class="sg-section-title">Your details</div>
      <div class="sg-section-sub">We'll send confirmation to your phone.</div>
      <div class="sg-row2">
        <div class="sg-field"><label class="sg-label">First name *</label><input class="sg-input" id="sg-first" type="text" placeholder="Jenny" autocomplete="given-name"/></div>
        <div class="sg-field"><label class="sg-label">Last name *</label><input class="sg-input" id="sg-last"  type="text" placeholder="Nguyen" autocomplete="family-name"/></div>
      </div>
      <div class="sg-field"><label class="sg-label">Phone *</label><input class="sg-input" id="sg-phone" type="tel" placeholder="(847) 555-1234" autocomplete="tel"/></div>
      <div class="sg-field"><label class="sg-label">Email <span style="font-weight:400;text-transform:none;letter-spacing:0;">(optional)</span></label><input class="sg-input" id="sg-email" type="email" placeholder="you@example.com" autocomplete="email"/></div>
      <div class="sg-field"><label class="sg-label">Notes <span style="font-weight:400;text-transform:none;letter-spacing:0;">(optional)</span></label><input class="sg-input" id="sg-notes" type="text" placeholder="Preferences, allergies…"/></div>
      <div class="sg-status" id="sg-info-status"></div>
    `;

    renderFooter('← Date & Time', 'Confirm Booking →', 'sg-confirm-btn', 'sg-back-dt', true);
    document.getElementById('sg-back-dt')?.addEventListener('click', renderCalendar);

    // Phone format
    document.getElementById('sg-phone')?.addEventListener('input', e => {
      const d = e.target.value.replace(/\D/g,'').slice(0,10);
      let fmt = d;
      if (d.length > 6) fmt = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
      else if (d.length > 3) fmt = `(${d.slice(0,3)}) ${d.slice(3)}`;
      else if (d.length > 0) fmt = `(${d}`;
      e.target.value = fmt;
      checkInfoValid();
    });

    function checkInfoValid() {
      const first = document.getElementById('sg-first')?.value.trim();
      const last  = document.getElementById('sg-last')?.value.trim();
      const phone = document.getElementById('sg-phone')?.value.replace(/\D/g,'');
      const nb = document.getElementById('sg-confirm-btn');
      if (nb) nb.disabled = !(first && last && phone && phone.length >= 10);
    }

    ['sg-first','sg-last'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', checkInfoValid);
    });

    document.getElementById('sg-confirm-btn')?.addEventListener('click', submitBooking);
  }

  // ── STEP 5: Submit + confirm ────────────────────────────
  async function submitBooking() {
    const btn = document.getElementById('sg-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Booking…'; }

    const first = document.getElementById('sg-first')?.value.trim();
    const last  = document.getElementById('sg-last')?.value.trim();
    const phone = document.getElementById('sg-phone')?.value.replace(/\D/g,'');
    const email = document.getElementById('sg-email')?.value.trim() || null;
    const notes = document.getElementById('sg-notes')?.value.trim() || null;

    try {
      const sb = await initSb();
      const d = S.sel.date;
      const [h, m] = S.sel.time.split(':').map(Number);
      const startTime = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);

      // Upsert customer
      let customerId = null;
      try {
        const { data: ex } = await sb.schema('salon').from('customers')
          .select('id').eq('business_id', CFG.businessId).eq('phone', phone).maybeSingle();
        if (ex?.id) {
          customerId = ex.id;
        } else {
          const { data: nc } = await sb.schema('salon').from('customers')
            .insert({ business_id: CFG.businessId, full_name: `${first} ${last}`, phone, email })
            .select('id').single();
          customerId = nc?.id || null;
        }
      } catch (_) {}

      const { error } = await sb.schema('salon').from('appointments').insert({
        business_id:      CFG.businessId,
        customer_id:      customerId,
        customer_name:    `${first} ${last}`,
        client_phone:     phone,
        customer_email:   email,
        service_id:       S.sel.service?.id || null,
        service_summary:  S.sel.service?.name || 'Appointment',
        technician_id:    S.sel.tech?.id || null,
        technician_name:  S.sel.tech ? (S.sel.tech.display_name || S.sel.tech.full_name) : null,
        start_time:       startTime.toISOString(),
        duration_minutes: S.sel.service?.duration_minutes || 60,
        status:           'pending',
        notes,
        source:           'widget',
      });

      if (error) throw error;
      renderConfirmation(first, last);

    } catch (err) {
      console.error('[SalonGenie widget]', err);
      const statusEl = document.getElementById('sg-info-status');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = 'sg-status err';
        statusEl.textContent = '❌ Could not save booking. Please try again or call us.';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Confirm Booking →'; }
    }
  }

  function renderConfirmation(first) {
    S.step = 5;
    renderProgress();
    const d    = S.sel.date;
    const tech = S.sel.tech;
    const svc  = S.sel.service;
    const dateStr = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });

    document.getElementById('sg-body').innerHTML = `
      <div class="sg-confirm">
        <div class="sg-confirm-icon">✨</div>
        <div class="sg-confirm-title">You're all set, ${esc(first)}!</div>
        <div class="sg-confirm-sub">Your appointment has been requested.<br>We'll confirm it shortly.</div>
        <div class="sg-confirm-card">
          <div class="sg-confirm-row"><div class="sg-confirm-key">Service</div><div class="sg-confirm-val">${esc(svc?.name || '—')}</div></div>
          <div class="sg-confirm-row"><div class="sg-confirm-key">With</div><div class="sg-confirm-val">${tech ? esc(tech.display_name || tech.full_name) : 'Next available'}</div></div>
          <div class="sg-confirm-row"><div class="sg-confirm-key">Date</div><div class="sg-confirm-val">${dateStr}</div></div>
          <div class="sg-confirm-row"><div class="sg-confirm-key">Time</div><div class="sg-confirm-val">${fmt12(S.sel.time)}</div></div>
          ${svc?.price ? `<div class="sg-confirm-row"><div class="sg-confirm-key">Est. price</div><div class="sg-confirm-val">$${Number(svc.price).toFixed(0)}</div></div>` : ''}
        </div>
        <div style="font-size:11px;color:#A89A8E;line-height:1.6;">Arrive 5 min early. To cancel, please call us directly.</div>
      </div>
    `;

    const footer = document.getElementById('sg-footer');
    footer.innerHTML = '';
    const nb = document.createElement('button');
    nb.className = 'sg-btn-next';
    nb.style.cssText = 'margin:0 auto;';
    nb.textContent = 'Book another →';
    nb.addEventListener('click', () => {
      // Reset
      S.step = 0; S.mode = null; S.sel = { service:null, tech:null, date:null, time:null };
      S.takenSlots = [];
      renderModeSelect();
    });
    footer.appendChild(nb);
  }

  // ── Request form (simple mode) ──────────────────────────
  function renderRequestForm() {
    S.step = 0;
    renderProgress();
    document.getElementById('sg-body').innerHTML = `
      <div class="sg-section-title">Request an appointment</div>
      <div class="sg-section-sub">We'll call or text you to confirm a time.</div>
      <div class="sg-row2">
        <div class="sg-field"><label class="sg-label">First name *</label><input class="sg-input" id="rq-first" type="text" placeholder="Jenny"/></div>
        <div class="sg-field"><label class="sg-label">Last name *</label><input class="sg-input" id="rq-last" type="text" placeholder="Nguyen"/></div>
      </div>
      <div class="sg-field"><label class="sg-label">Phone *</label><input class="sg-input" id="rq-phone" type="tel" placeholder="(847) 555-1234"/></div>
      <div class="sg-field"><label class="sg-label">Service wanted</label><input class="sg-input" id="rq-svc" type="text" placeholder="e.g. Gel manicure, full set…"/></div>
      <div class="sg-field"><label class="sg-label">Preferred time</label><input class="sg-input" id="rq-pref" type="text" placeholder="e.g. Saturday afternoon, weekdays after 5pm…"/></div>
      <div class="sg-field"><label class="sg-label">Notes</label><input class="sg-input" id="rq-notes" type="text" placeholder="Allergies, preferences…"/></div>
      <div class="sg-status" id="rq-status"></div>
    `;

    renderFooter('← Back', 'Send Request →', 'rq-submit', 'rq-back', false);

    document.getElementById('rq-phone')?.addEventListener('input', e => {
      const d = e.target.value.replace(/\D/g,'').slice(0,10);
      let fmt = d;
      if (d.length > 6) fmt = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
      else if (d.length > 3) fmt = `(${d.slice(0,3)}) ${d.slice(3)}`;
      else if (d.length > 0) fmt = `(${d}`;
      e.target.value = fmt;
    });

    document.getElementById('rq-back')?.addEventListener('click', renderModeSelect);

    document.getElementById('rq-submit')?.addEventListener('click', async () => {
      const first   = document.getElementById('rq-first')?.value.trim();
      const last    = document.getElementById('rq-last')?.value.trim();
      const phone   = document.getElementById('rq-phone')?.value.replace(/\D/g,'');
      const svc     = document.getElementById('rq-svc')?.value.trim() || null;
      const pref    = document.getElementById('rq-pref')?.value.trim() || null;
      const notes   = document.getElementById('rq-notes')?.value.trim() || null;
      const statusEl = document.getElementById('rq-status');

      if (!first || !last || !phone || phone.length < 10) {
        if (statusEl) { statusEl.style.display='block'; statusEl.className='sg-status err'; statusEl.textContent='Please fill in your name and phone number.'; }
        return;
      }

      const btn = document.getElementById('rq-submit');
      if (btn) { btn.disabled=true; btn.textContent='⏳ Sending…'; }

      try {
        const sb = await initSb();
        let customerId = null;
        try {
          const { data: ex } = await sb.schema('salon').from('customers')
            .select('id').eq('business_id', CFG.businessId).eq('phone', phone).maybeSingle();
          if (ex?.id) { customerId = ex.id; }
          else {
            const { data: nc } = await sb.schema('salon').from('customers')
              .insert({ business_id: CFG.businessId, full_name: `${first} ${last}`, phone })
              .select('id').single();
            customerId = nc?.id || null;
          }
        } catch (_) {}

        const { error } = await sb.schema('salon').from('appointments').insert({
          business_id:     CFG.businessId,
          customer_id:     customerId,
          customer_name:   `${first} ${last}`,
          client_phone:    phone,
          service_summary: svc || 'Appointment request',
          status:          'request',
          notes:           [pref ? `Preferred: ${pref}` : '', notes||''].filter(Boolean).join(' | ') || null,
          source:          'widget',
          start_time:      new Date(Date.now() + 86400000).toISOString(),
        });

        if (error) throw error;

        document.getElementById('sg-body').innerHTML = `
          <div class="sg-confirm" style="padding-top:20px;">
            <div class="sg-confirm-icon">✅</div>
            <div class="sg-confirm-title">Request sent!</div>
            <div class="sg-confirm-sub">Thanks ${esc(first)}! We'll call or text you to confirm a time.<br>Talk soon! 💅</div>
          </div>
        `;
        document.getElementById('sg-footer').innerHTML = '';

      } catch (err) {
        console.error('[SalonGenie widget]', err);
        if (statusEl) { statusEl.style.display='block'; statusEl.className='sg-status err'; statusEl.textContent='Could not send. Please try again or call us.'; }
        if (btn) { btn.disabled=false; btn.textContent='Send Request →'; }
      }
    });
  }

  // ── Init ────────────────────────────────────────────────
  function init() {
    injectCSS();
    buildWidget();
    // Show badge after 3s (only if launcher is visible)
    if (!CFG.hideLauncher) {
      setTimeout(() => {
        const badge = document.getElementById('sg-launcher-badge');
        if (badge && !S.open) badge.style.display = 'flex';
      }, 3000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
