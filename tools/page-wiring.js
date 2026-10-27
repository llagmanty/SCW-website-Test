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
  SSCAP.track = function (event, p) { if (consent === 'granted') window.dataLayer.push(Object.assign({ event: event }, p || {})); };
  // Hook: load GTM / analytics vendor here once consent is granted, e.g.
  // SSCAP.onConsent(function () { var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-XXXX'; document.head.appendChild(s); });
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
    var t = e.target.closest && e.target.closest('[data-consent-reopen], a[href="#demo"], a[href$=".pdf"]');
    if (!t) return;
    if (t.hasAttribute('data-consent-reopen')) { banner().hidden = false; document.getElementById('consent-yes').focus(); }
    else if (t.getAttribute('href') === '#demo') SSCAP.track('cta_click', { location: t.textContent.trim().slice(0, 40) });
    else SSCAP.track('file_download', { file: t.getAttribute('href') });
  });

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
      var payload = Object.assign({ form: form.closest('.m-modal') ? 'hero-modal' : 'demo-section' }, attribution);
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
