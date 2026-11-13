/* ═══════════════════════════════════════════════════════════════════
   Website contact forms → Salon Genie (contact.html, about.html).
   Sends to the Supabase function website-contact, which stores the
   message in salon.website_messages and alerts the salon (managers, and
   the front desk on shift), at once while open or at opening otherwise.

   window.vnContact.check(el, { onReady, onError }) → { token(), reset() }
     renders Cloudflare's "are you human" check (same key as the chat)
   window.vnContact.send({ name, email, phone, contact, service, message, token })
     → Promise of { ok, open_now, next_open, contact } or { ok: false, error }
═══════════════════════════════════════════════════════════════════ */
(function () {
  var FN = 'https://pbojacnagutipfhcxltj.supabase.co/functions/v1/website-contact';
  var BIZ = '0af9e368-f488-449b-8013-7f44361be462';
  var SITE_KEY = '0x4AAAAAAFWHTVtszh0YkqvD';

  function loadTurnstile(cb) {
    if (window.turnstile) return cb();
    // the chat may already be loading the same script
    if (!document.getElementById('vbTsScript') && !document.getElementById('cfTsScript')) {
      var s = document.createElement('script');
      s.id = 'cfTsScript';
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      document.head.appendChild(s);
    }
    var tries = 0;
    (function wait() {
      if (window.turnstile) return cb();
      if (++tries > 100) return cb(new Error('no turnstile'));
      setTimeout(wait, 100);
    })();
  }

  function check(el, opts) {
    opts = opts || {};
    var token = '', id = null;
    loadTurnstile(function (e) {
      if (e || !window.turnstile) { if (opts.onError) opts.onError(); return; }
      id = window.turnstile.render(el, {
        sitekey: SITE_KEY, theme: 'light',
        size: el.clientWidth >= 300 ? 'flexible' : 'compact',
        callback: function (t) { token = t; if (opts.onReady) opts.onReady(); },
        'expired-callback': function () { token = ''; },
        'error-callback': function () { token = ''; if (opts.onError) opts.onError(); },
      });
    });
    return {
      token: function () { return token; },
      reset: function () { token = ''; if (window.turnstile && id !== null) window.turnstile.reset(id); },
    };
  }

  function send(f) {
    return fetch(FN, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: BIZ, name: f.name || '', email: f.email || '', phone: f.phone || '',
        contact: f.contact || 'email', service: f.service || '', message: f.message || '',
        page: location.pathname, turnstile_token: f.token || '',
      }),
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'server_error' }; }); })
      .catch(function () { return { ok: false, error: 'network' }; });
  }

  // What the visitor sees after it went through
  function thanks(first, r, contact) {
    var how = contact === 'call' ? 'call you' : contact === 'text' ? 'text you'
            : contact === 'either' ? 'call or text you' : 'reply by email';
    return r.open_now
      ? 'Thanks, ' + first + '! We have your message and will ' + how + ' within one business day.'
      : 'Thanks, ' + first + "! We're closed right now, so we'll " + how + ' after we open' + (r.next_open ? ' (' + r.next_open + ')' : '') + '.';
  }

  // What went wrong, in words the visitor can act on
  function problem(e) {
    return e === 'human_check_failed' ? "The security check didn't go through. Please try it again, then send."
         : e === 'bad_request' ? 'Please check your name, email and message.'
         : e === 'too_many_tries' || e === 'busy' ? "We've received a lot of messages. Please call or text us at (847) 931-9359."
         : "Sorry, your message couldn't be sent. Please call or text us at (847) 931-9359.";
  }

  window.vnContact = { check: check, send: send, thanks: thanks, problem: problem };
})();
