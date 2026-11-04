/*
  Production wiring around the canvas page: consent banner, analytics (dataLayer), lead submission.
  Loaded before canvas-runtime.js; the runtime calls SSCAP.decorate(vals) on every render so the
  canvas form handlers can be wrapped without editing the design file.
*/
(function () {
  'use strict';
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var params = new URLSearchParams(location.search);

  /* ---------- consent + analytics (vendor-agnostic dataLayer) ---------- */
  window.dataLayer = window.dataLayer || [];
  var consent = store.get('sscap_consent'); // 'granted' | 'denied' | null
  var listeners = [];
  var SSCAP = window.SSCAP = window.SSCAP || {};
  SSCAP.onConsent = function (fn) { listeners.push(fn); if (consent === 'granted') fn(); };
  SSCAP.track = function (event, p) {
    if (consent !== 'granted') return;
    window.dataLayer.push(Object.assign({ event: event }, p || {}));
    if (window.gtag) window.gtag('event', event, p || {});
    if (window.clarity) window.clarity('event', event);
  };

  /* ---------- Google Analytics 4 (loads only after the visitor accepts analytics) ---------- */
  // GA4 web stream Measurement ID (GA4 › Admin › Data streams). Set it back to G-XXXXXXXXXX to turn GA4 off.
  var GA_MEASUREMENT_ID = 'G-29SGQNFMTN';
  SSCAP.onConsent(function () {
    if (!/^G-[A-Z0-9]+$/.test(GA_MEASUREMENT_ID) || GA_MEASUREMENT_ID === 'G-XXXXXXXXXX' || window.gtag) return;
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, { page_title: 'SSCAP landing page', content_group: 'SSCAP' });
    var s = document.createElement('script'); s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
    document.head.appendChild(s);
  });

  /* ---------- Microsoft Clarity heatmaps + session recordings (also only after consent) ---------- */
  // Clarity project ID (clarity.microsoft.com › Settings › Overview). Set it to '' to turn Clarity off.
  var CLARITY_PROJECT_ID = 'z7ijqjvm9b';
  SSCAP.onConsent(function () {
    if (!/^[a-z0-9]+$/.test(CLARITY_PROJECT_ID) || window.clarity) return;
    window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    window.clarity('consent');
    window.clarity('set', 'page', 'sscap-landing');
    var s = document.createElement('script'); s.async = true;
    s.src = 'https://www.clarity.ms/tag/' + CLARITY_PROJECT_ID;
    document.head.appendChild(s);
  });
  function banner() { return document.getElementById('consent'); }
  function setConsent(v) {
    consent = v; store.set('sscap_consent', v); banner().hidden = true;
    window.dataLayer.push({ event: 'consent_update', analytics_storage: v });
    if (v === 'granted') listeners.forEach(function (fn) { fn(); });
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (!consent) banner().hidden = false;
    document.getElementById('consent-yes').addEventListener('click', function () { setConsent('granted'); });
    document.getElementById('consent-no').addEventListener('click', function () { setConsent('denied'); });
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-consent-reopen], a[href="#demo"], a[href$=".pdf"], a[href*="/book/"], button.m-explore, .see-arrow');
    if (!t) return;
    if (t.hasAttribute('data-consent-reopen')) { banner().hidden = false; document.getElementById('consent-yes').focus(); }
    else if (t.getAttribute('href') === '#demo') SSCAP.track('cta_click', { location: t.textContent.trim().slice(0, 40) });
    else if (t.classList.contains('m-explore')) SSCAP.track('explore_map');
    else if (t.classList.contains('see-arrow')) SSCAP.track('carousel_arrow', { direction: t.classList.contains('see-next') ? 'next' : 'previous' });
    else if (/\/book\//.test(t.getAttribute('href'))) SSCAP.track('booking_calendar_open', { location: t.closest('.m-modal') ? 'hero' : 'booking-section' });
    else SSCAP.track('file_download', { file: t.getAttribute('href') });
  });

  /* ---------- scroll depth and section views (each sent once per page view, after consent) ---------- */
  // sections are looked up on every check because the canvas renderer can replace their nodes
  var SECTIONS = [['problem-h2', 'problem'], ['see-h2', 'see_it'], ['how-h2', 'how_it_works'], ['book-h2', 'booking'], ['faq-h2', 'faq'], ['cta-h2', 'final_cta']];
  var DEPTHS = [25, 50, 75, 90, 100];
  var seen = {}, reached = {}, queued = false, pending = [];
  // views before the visitor answers the banner are held in memory and sent only if they accept
  function send(ev, p) { if (consent === 'granted') SSCAP.track(ev, p); else if (consent !== 'denied') pending.push([ev, p]); }
  function checkScroll() {
    queued = false;
    if (consent === 'denied') return;
    var vh = window.innerHeight, docH = document.documentElement.scrollHeight;
    var pct = docH > vh ? Math.round((window.scrollY + vh) / docH * 100) : 100;
    DEPTHS.forEach(function (d) { if (pct >= d && !reached[d]) { reached[d] = true; send('scroll_depth', { percent: d }); } });
    // a section counts as viewed once 40% of the viewport (or half the section, if shorter) shows it
    SECTIONS.forEach(function (s, i) {
      if (seen[s[1]]) return;
      var el = document.querySelector('section[aria-labelledby="' + s[0] + '"]'); if (!el) return;
      var r = el.getBoundingClientRect(), visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (visible >= Math.min(vh * 0.4, r.height * 0.5)) { seen[s[1]] = true; send('section_view', { section: s[1], section_index: i + 1 }); }
    });
  }
  function queueScroll() { if (!queued) { queued = true; requestAnimationFrame(checkScroll); } }
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', queueScroll);
  SSCAP.onConsent(function () { pending.splice(0).forEach(function (e) { SSCAP.track(e[0], e[1]); }); queueScroll(); });

  /* ---------- attribution kept with the lead ---------- */
  var attribution = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
    var v = params.get(k) || store.get('sscap_' + k); if (v) { attribution[k] = v; store.set('sscap_' + k, v); }
  });
  attribution.referrer = document.referrer || '';
  attribution.landing_page = location.href.split('#')[0];
  var shownAt = Date.now();

  /**
   * submitLead(payload) — the single integration point. [CONFIRM CRM]
   * HubSpot Forms API: POST https://api.hsforms.com/submissions/v3/integration/submit/{portalId}/{formGuid}
   *   body { fields: Object.entries(payload).map(([name, value]) => ({ name, value: String(value) })),
   *          context: { pageUri: payload.landing_page, pageName: document.title },
   *          legalConsentOptions: { consent: { consentToProcess: true, text: 'We use your information only to arrange your demo.',
   *            communications: [{ value: payload.casl_consent === 'yes', subscriptionTypeId: 0, text: 'I agree to receive emails from Smart City Water about SSCAP.' }] } } }
   * WordPress: POST to admin-ajax.php / a REST route with the same JSON.
   */
  var LEAD_ENDPOINT = '/api/sscap-lead'; // placeholder
  SSCAP.submitLead = function (payload) {
    return fetch(LEAD_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res; });
  };

  function failNote(form, show) {
    var n = form.querySelector('.lead-fail');
    if (!show) { if (n) n.remove(); return; }
    if (!n) {
      n = document.createElement('p'); n.className = 'lead-fail'; n.setAttribute('role', 'alert');
      n.style.cssText = 'grid-column: 1 / -1; margin: 0; font-size: 14px; color: var(--err)';
      form.appendChild(n);
    }
    n.textContent = "We couldn't send your request. Check your connection and try again, or email solutions@smartcitywater.ca.";
  }

  // wraps the canvas form handlers: real validation, the lead POST, then the canvas thank-you state
  SSCAP.decorate = function (vals) {
    var done = vals.submit;
    if (typeof done !== 'function' || done._wired) return;
    vals.submit = function (e) {
      e.preventDefault();
      var form = e.currentTarget || e.target;
      var email = form.querySelector('input[type="email"]');
      if (email && email.getAttribute('aria-invalid') === 'true') { email.focus(); return; }
      if (!form.checkValidity()) {
        var bad = form.querySelector(':invalid'); if (bad) bad.focus();
        form.reportValidity(); SSCAP.track('form_field_error', { field: bad && bad.name }); return;
      }
      // a filled honeypot or a submit within 3 s of load is treated as a bot: show thanks, send nothing
      var trap = form.querySelector('[name="company_website"]');
      if ((trap && trap.value) || Date.now() - shownAt < 3000) { done(e); return; }
      var payload = Object.assign({ form: form.closest('.m-modal') ? 'contact-us' : 'demo-section' }, attribution);
      new FormData(form).forEach(function (v, k) { if (k !== 'company_website') payload[k] = v; });
      payload.casl_consent = payload.casl_consent ? 'yes' : 'no';
      var btn = form.querySelector('[type="submit"]'); if (btn) btn.disabled = true;
      failNote(form, false);
      SSCAP.submitLead(payload).then(function () {
        SSCAP.track('generate_lead', { form: payload.form });
        done(e);
      }).catch(function () {
        failNote(form, true);
        SSCAP.track('lead_submit_error');
      }).then(function () { if (btn) btn.disabled = false; });
    };
    vals.submit._wired = true;
  };
})();
