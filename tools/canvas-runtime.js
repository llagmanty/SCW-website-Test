/*
  Canvas runtime: renders the design canvas (design/sscap.dc.html) as a live page.

  The canvas is an HTML template with {{holes}}, <sc-for list as> and <sc-if value> blocks,
  driven by a `Component` class whose renderVals() returns the values for the holes.
  This file compiles the template once into a Preact view and re-renders it whenever the
  component calls setState(). Preact diffs the DOM, so the map, form fields and focus survive.

  Expects: window.preact, window.SSCAP_CANVAS = { template, script, props }, and #sscap-root.
*/
(function () {
  'use strict';
  var h = preact.h, render = preact.render;
  var C = window.SSCAP_CANVAS;

  // ---------- template → view ----------
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g, ONLY_HOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;
  function get(scope, path) {
    var parts = path.split('.'), v = scope;
    for (var i = 0; i < parts.length && v != null; i++) v = v[parts[i]];
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) { var v = get(scope, p); return v == null ? '' : String(v); });
  }
  function value(str, scope) {
    var m = ONLY_HOLE.exec(str);
    return m ? get(scope, m[1]) : (str.indexOf('{{') >= 0 ? interp(str, scope) : str);
  }

  // compile a DOM node into a function(scope) → vnode | vnode[] | string
  function compile(node) {
    if (node.nodeType === 3) {
      var text = node.nodeValue;
      return text.indexOf('{{') < 0 ? function () { return text; } : function (s) { return interp(text, s); };
    }
    if (node.nodeType !== 1) return null;
    var tag = node.localName;
    var kids = compileChildren(node.content || node);
    if (tag === 'sc-for') {
      var list = node.getAttribute('list'), as = node.getAttribute('as');
      return function (s) {
        var items = value(list, s) || [], out = [];
        for (var i = 0; i < items.length; i++) {
          var s2 = Object.create(s); s2[as] = items[i];
          out.push(kids(s2));
        }
        return out;
      };
    }
    if (tag === 'sc-if') {
      var cond = node.getAttribute('value');
      return function (s) { return value(cond, s) ? kids(s) : null; };
    }
    var attrs = [];
    for (var i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i];
      if (a.name.indexOf('hint-') === 0) continue;
      attrs.push([a.name, a.value]);
    }
    return function (s) {
      var props = {};
      for (var j = 0; j < attrs.length; j++) {
        var name = attrs[j][0], v = value(attrs[j][1], s);
        if (name === 'ref') { if (typeof v === 'function') props.ref = v; continue; }
        if (name.slice(0, 2) === 'on' && typeof v !== 'function') continue;
        props[name] = v;
      }
      return h(tag, props, kids(s));
    };
  }
  function compileChildren(parent) {
    var fns = [];
    for (var c = parent.firstChild; c; c = c.nextSibling) { var f = compile(c); if (f) fns.push(f); }
    return function (s) { var out = []; for (var i = 0; i < fns.length; i++) out.push(fns[i](s)); return out; };
  }

  var tpl = document.createElement('template');
  tpl.innerHTML = C.template;
  var view = compileChildren(tpl.content);

  // ---------- component ----------
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var root = document.getElementById('sscap-root'), comp, queued = false;
  function paint() {
    queued = false;
    var vals = comp.renderVals();
    if (window.SSCAP && SSCAP.decorate) SSCAP.decorate(vals, comp);
    render(view(vals), root);
  }
  function schedule() { if (!queued) { queued = true; Promise.resolve().then(paint); } }

  window.DCLogic = function DCLogic() { this.state = {}; this.props = {}; };
  DCLogic.prototype.setState = function (o) {
    var before = this.state.theme;
    this.state = Object.assign({}, this.state, typeof o === 'function' ? o(this.state, this.props) : o);
    if (this.state.theme !== before) applyTheme(this.state.theme);
    schedule();
  };
  DCLogic.prototype.forceUpdate = schedule;

  function applyTheme(t) {
    var dark = t === 'dark';
    store.set('sscap_theme', dark ? 'dark' : 'light');
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    var m = document.getElementById('meta-theme'); if (m) m.content = dark ? '#131314' : '#F8F9FC';
  }

  var Component = new Function(C.script + '\nreturn Component;')();
  comp = new Component();
  comp.props = C.props || {};
  comp.state = comp.state || {};
  if (store.get('sscap_theme') === 'dark') comp.state.theme = 'dark';
  paint();
})();
