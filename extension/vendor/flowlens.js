/**
 * FlowLens tracker — drop-in behavioral capture SDK.
 *
 * Records *semantic* user interactions (what was clicked, which field was
 * filled, which page was viewed) instead of pixels or raw coordinates, and
 * ships them to a FlowLens collector as a process-mining-ready event stream.
 *
 * Usage:
 *   <script src="/tracker/flowlens.js"></script>
 *   <script>
 *     FlowLens.init({
 *       endpoint: '/api/events',
 *       app: 'invoice-approval',
 *       // optional: derive the business case id from the current URL/state
 *       caseIdFrom: () => location.hash.match(/invoice\/(\w+)/)?.[1] ?? null,
 *     });
 *   </script>
 *
 * Annotate elements for exact activity names:   <button data-flowlens="Approve invoice">
 * Field values are never recorded — only the field's label and value length.
 */
(function () {
  'use strict';

  const state = {
    config: null,
    sessionId: null,
    startedAt: 0,
    buffer: [],
    flushTimer: null,
    currentPage: null,
    // friction detection
    clickHistory: [], // {selector, ts}
    inputBursts: new Map(), // selector -> {label, startTs, lastTs, length, timer}
  };

  const FLUSH_INTERVAL_MS = 3000;
  const FLUSH_BATCH_SIZE = 25;
  const RAGE_WINDOW_MS = 1200;
  const RAGE_CLICKS = 3;
  const DEAD_CLICK_MS = 800;
  const INPUT_BURST_GAP_MS = 1500;

  // ---------------------------------------------------------------- helpers

  function uid() {
    return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** Best human-meaningful name for an element, most intentional source first. */
  function semanticLabel(el) {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (node.dataset && node.dataset.flowlens) return node.dataset.flowlens;
    }
    const aria = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'));
    if (aria) return aria.trim();
    if (el.labels && el.labels.length > 0) return el.labels[0].textContent.trim();
    if (el.placeholder) return el.placeholder.trim();
    const clickable = el.closest ? el.closest('button, a, [role="button"], label, summary') : null;
    const textSource = clickable || el;
    const text = (textSource.innerText || textSource.textContent || '').trim().replace(/\s+/g, ' ');
    if (text && text.length <= 60) return text;
    if (el.name) return el.name;
    if (el.id) return el.id;
    return null;
  }

  /** Short structural selector for dedup/grouping (not for replay). */
  function shortSelector(el) {
    const parts = [];
    let node = el;
    for (let depth = 0; node && node !== document.body && depth < 4; depth++) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(part + '#' + node.id);
        break;
      }
      if (node.classList && node.classList.length > 0) part += '.' + node.classList[0];
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join('>');
  }

  function currentPageName() {
    const c = state.config;
    if (c && typeof c.pageNameFrom === 'function') {
      try {
        const name = c.pageNameFrom();
        if (name) return name;
      } catch (_) {}
    }
    return (location.pathname + location.hash) || '/';
  }

  function currentCaseId() {
    const c = state.config;
    if (c && typeof c.caseIdFrom === 'function') {
      try {
        return c.caseIdFrom() || null;
      } catch (_) {
        return null;
      }
    }
    const el = document.querySelector('[data-flowlens-case]');
    return el ? el.dataset.flowlensCase : null;
  }

  // ---------------------------------------------------------------- pipeline

  function record(event) {
    event.ts = event.ts || Date.now();
    event.page = event.page || state.currentPage;
    event.caseId = event.caseId || currentCaseId();
    state.buffer.push(event);
    if (state.buffer.length >= FLUSH_BATCH_SIZE) flush();
  }

  function payload(events) {
    return JSON.stringify({
      session: {
        id: state.sessionId,
        app: state.config.app || 'unknown',
        startedAt: state.startedAt,
        lastSeenAt: Date.now(),
        userAgent: navigator.userAgent,
      },
      events,
    });
  }

  function flush(useBeacon) {
    if (state.buffer.length === 0) return;
    const events = state.buffer.splice(0, state.buffer.length);
    const body = payload(events);
    // Custom transport (e.g. a browser extension relaying through its
    // service worker, immune to the page's CSP) replaces fetch/beacon.
    if (typeof state.config.transport === 'function') {
      try {
        state.config.transport(body);
      } catch (_) {
        state.buffer.unshift.apply(state.buffer, events);
      }
      return;
    }
    const url = state.config.endpoint;
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(url, body);
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(function () {
      // Put events back so the next flush retries them.
      state.buffer.unshift.apply(state.buffer, events);
    });
  }

  // ---------------------------------------------------------------- capture

  function onClick(e) {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const label = semanticLabel(el);
    const selector = shortSelector(el);
    const now = Date.now();

    record({ type: 'click', label: label, selector: selector });

    // Rage click: N clicks on the same target inside the window.
    state.clickHistory.push({ selector: selector, ts: now });
    state.clickHistory = state.clickHistory.filter(function (c) {
      return now - c.ts <= RAGE_WINDOW_MS;
    });
    const sameTarget = state.clickHistory.filter(function (c) {
      return c.selector === selector;
    });
    if (sameTarget.length === RAGE_CLICKS) {
      record({ type: 'rage_click', label: label, selector: selector });
    }

    // Dead click: no DOM mutation and no navigation shortly after the click.
    const pageAtClick = location.href;
    let mutated = false;
    const observer = new MutationObserver(function () {
      mutated = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    setTimeout(function () {
      observer.disconnect();
      if (!mutated && location.href === pageAtClick) {
        record({ type: 'dead_click', label: label, selector: selector, ts: now });
      }
    }, DEAD_CLICK_MS);
  }

  function onInput(e) {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
    // Checkboxes/radios are toggles, not typing — the click event already covers them.
    if (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return;

    const selector = shortSelector(el);
    const now = Date.now();
    let burst = state.inputBursts.get(selector);
    if (!burst) {
      burst = { label: semanticLabel(el), startTs: now, lastTs: now, length: 0, timer: null };
      state.inputBursts.set(selector, burst);
    }
    burst.lastTs = now;
    burst.length = el.value ? el.value.length : 0;
    if (burst.timer) clearTimeout(burst.timer);
    burst.timer = setTimeout(function () {
      closeBurst(selector);
    }, INPUT_BURST_GAP_MS);
  }

  /** One typing burst in one field becomes one event — value never leaves the page. */
  function closeBurst(selector) {
    const burst = state.inputBursts.get(selector);
    if (!burst) return;
    state.inputBursts.delete(selector);
    if (burst.timer) clearTimeout(burst.timer);
    record({
      type: 'input',
      label: burst.label,
      selector: selector,
      valueLen: burst.length,
      durationMs: burst.lastTs - burst.startTs,
      ts: burst.startTs,
    });
  }

  function closeAllBursts() {
    Array.from(state.inputBursts.keys()).forEach(closeBurst);
  }

  function onSubmit(e) {
    const form = e.target;
    if (!(form instanceof Element)) return;
    closeAllBursts();
    record({ type: 'submit', label: semanticLabel(form) || 'form', selector: shortSelector(form) });
  }

  function onNavigation() {
    const page = currentPageName();
    if (page === state.currentPage) return;
    closeAllBursts();
    state.currentPage = page;
    record({ type: 'nav', label: page, page: page });
  }

  function hookHistory() {
    ['pushState', 'replaceState'].forEach(function (fn) {
      const original = history[fn];
      history[fn] = function () {
        const result = original.apply(this, arguments);
        onNavigation();
        return result;
      };
    });
    window.addEventListener('popstate', onNavigation);
    window.addEventListener('hashchange', onNavigation);
    // In contexts where history methods can't be patched on the page's own
    // History object (e.g. an extension content script running in the
    // isolated world), fall back to polling the URL.
    if (state.config.pollNavigation) {
      let lastHref = location.href;
      setInterval(function () {
        if (location.href !== lastHref) {
          lastHref = location.href;
          onNavigation();
        }
      }, 800);
    }
  }

  // ---------------------------------------------------------------- public

  window.FlowLens = {
    init: function (config) {
      if (state.config) return;
      state.config = config || {};
      if (!state.config.endpoint) state.config.endpoint = '/api/events';
      state.sessionId = uid();
      state.startedAt = Date.now();

      document.addEventListener('click', onClick, true);
      document.addEventListener('input', onInput, true);
      document.addEventListener('submit', onSubmit, true);
      hookHistory();
      onNavigation(); // initial page view

      state.flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
      window.addEventListener('beforeunload', function () {
        closeAllBursts();
        record({ type: 'session_end' });
        flush(true);
      });
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flush(true);
      });
    },

    /** Log a custom, exactly-named process activity from app code. */
    activity: function (name, extra) {
      record(Object.assign({ type: 'click', label: name, selector: 'custom' }, extra || {}));
    },

    flush: flush,
    _state: state,
  };
})();
