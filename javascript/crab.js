/* ══════════════════════════════════════════════════════════════════════════
   CrabSMP — behaviour.

   One deferred script shared by every page. Each feature looks for the
   elements it needs and returns early when they are absent, so the status
   page's code costs nothing on the home page. Keep that shape: never assume
   an element exists.

   sfx.js and vfx.js load first and put the sound engine on window.CrabSFX
   and the particle engine on window.CrabVFX; this file uses them where
   they are present and does without where they are not.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var docEl = document.documentElement;
  /* html.js is set by a one-line script in each page's head so nothing
     flashes before this file runs; html.crab says this file did run, and
     switches off the CSS failsafe that would otherwise reveal everything. */
  docEl.classList.add('js', 'crab');

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var VFX = window.CrabVFX || null;
  var SFX = window.CrabSFX || null;

  /* A sound, if there is a sound engine; nothing otherwise. */
  function sound(name, opts) { return SFX ? SFX.play(name, opts) : null; }
  function note(step, opts) { return SFX ? SFX.note(step, opts) : null; }
  /* Run fn now, or when the visitor comes back to this tab: a link that
     opened in a new one has taken them away before a sound could land. */
  function whenSeen(fn) {
    if (!document.hidden) { fn(); return; }
    document.addEventListener('visibilitychange', function back() {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', back);
      setTimeout(fn, 300);
    });
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* The device pixel ratio, for the CSS that snaps pixel art to whole
     device pixels. It changes when a window moves between screens. */
  function writeDpr() { docEl.style.setProperty('--dpr', String(window.devicePixelRatio || 1)); }
  writeDpr();

  function store(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }
  var local = store('localStorage');
  var session = store('sessionStorage');
  function readJSON(s, key) {
    if (!s) return null;
    try { return JSON.parse(s.getItem(key)); } catch (e) { return null; }
  }
  function writeJSON(s, key, value) {
    if (!s) return;
    try { s.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ── The frame loop for scroll ────────────────────────────────────────
     Everything that reads the scroll position registers here and runs at
     most once per frame, however many scroll events fired. Handlers are
     handed the offset and must not measure: page geometry is read in
     measure(), on resize and whenever the body changes size, and cached.
     Measuring in the loop would force a layout every frame, right after
     the scroll animator has written a new position — the read-after-write
     pattern that causes the stutter this is all here to avoid.          */
  var scrollTasks = [];
  var scrollQueued = false;
  var viewH = window.innerHeight;

  function runScrollTasks() {
    scrollQueued = false;
    var y = window.scrollY || window.pageYOffset;
    for (var i = 0; i < scrollTasks.length; i++) scrollTasks[i](y);
  }
  function requestScrollFrame() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(runScrollTasks);
  }
  function onScroll(fn) {
    scrollTasks.push(fn);
    requestScrollFrame();
  }
  window.addEventListener('scroll', requestScrollFrame, { passive: true });

  var metrics = { travel: 0 };
  var measureTasks = [];
  function onMeasure(fn) { measureTasks.push(fn); }

  /* Where an element sits in the document, read once per measure. */
  function docTop(el) {
    var r = el.getBoundingClientRect();
    return r.top + (window.scrollY || window.pageYOffset);
  }

  var measureQueued = false;
  function measure() {
    measureQueued = false;
    viewH = window.innerHeight;
    metrics.travel = Math.max(0, docEl.scrollHeight - viewH);
    for (var i = 0; i < measureTasks.length; i++) measureTasks[i]();
    requestScrollFrame();
  }
  function requestMeasure() {
    if (measureQueued) return;
    measureQueued = true;
    requestAnimationFrame(measure);
  }
  window.addEventListener('resize', function () { writeDpr(); requestMeasure(); });
  window.addEventListener('load', requestMeasure);
  if ('ResizeObserver' in window) {
    ready(function () { new ResizeObserver(requestMeasure).observe(document.body); });
  }

  /* ── Moving or still ──────────────────────────────────────────────────
     While the page is moving, html.is-scrolling zeroes every hover lift
     (see --lift in main.css). Written twice per gesture, not per frame. */
  var stillTimer = null;
  window.addEventListener('scroll', function () {
    if (!docEl.classList.contains('is-scrolling')) docEl.classList.add('is-scrolling');
    clearTimeout(stillTimer);
    stillTimer = setTimeout(function () { docEl.classList.remove('is-scrolling'); }, 140);
  }, { passive: true });

  /* ── Starting gun ─────────────────────────────────────────────────────
     html.is-ready sets the page's entrance going. It waits while the intro
     is up, so the hero is not spent behind the curtain; the intro fires it
     itself as the screen shatters. The timeout is a backstop against a
     stalled image or an error leaving the page blank.                  */
  var readyMarked = false;
  var readyHooks = [];
  function whenReady(fn) { if (readyMarked) fn(); else readyHooks.push(fn); }
  function whenShown(fn) {
    if (!document.prerendering) { fn(); return; }
    document.addEventListener('prerenderingchange', function () { fn(); }, { once: true });
  }
  function markReady(force) {
    if (readyMarked) return;
    if (document.prerendering) { whenShown(function () { markReady(force); }); return; }
    if (!force && docEl.classList.contains('has-intro')) return;
    readyMarked = true;
    docEl.classList.add('is-ready');
    readyHooks.forEach(function (fn) { fn(); });
    readyHooks = [];
  }
  setTimeout(function () { markReady(true); }, 7000);

  /* ── Words ────────────────────────────────────────────────────────────
     Split a heading or statement into words so they can move one at a
     time. The heading keeps its full text as its accessible name, and the
     pieces are hidden from assistive tech, so a screen reader hears one
     sentence rather than a word at a time.                             */
  function splitWords(el, className) {
    if (el.getAttribute('data-split-done')) return [];
    el.setAttribute('data-split-done', '1');
    var label = el.textContent.replace(/\s+/g, ' ').trim();
    var out = [];
    var index = 0;
    function walk(node, into) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var parts = child.textContent.split(/(\s+)/);
          parts.forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { into.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span');
            w.className = className;
            var inner = document.createElement('span');
            inner.textContent = part;
            w.appendChild(inner);
            w.style.setProperty('--w', String(index));
            w.style.setProperty('--i', String(index));
            index++;
            into.appendChild(w);
            out.push(w);
          });
        } else if (child.nodeType === 1) {
          var clone = child.cloneNode(false);
          into.appendChild(clone);
          walk(child, clone);
        }
      });
    }
    var frag = document.createElement('span');
    frag.setAttribute('aria-hidden', 'true');
    walk(el, frag);
    el.textContent = '';
    el.appendChild(frag);
    /* A heading can take its name from aria-label; a paragraph cannot, so
       it carries a hidden copy of its sentence for assistive tech instead. */
    if (/^H[1-6]$/.test(el.tagName)) {
      el.setAttribute('aria-label', label);
    } else {
      var spoken = document.createElement('span');
      spoken.className = 'visually-hidden';
      spoken.textContent = label;
      el.appendChild(spoken);
    }
    return out;
  }

  /* ── Toasts ───────────────────────────────────────────────────────────
     Feedback in the shape of an advancement: slides in top right, holds,
     slides away. The region is a polite live region so the text is read
     out without stealing focus.                                        */
  var toastBox = null;
  function toast(title, text, icon) {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'toasts';
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastBox);
    }
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML =
      '<span class="toast__icon"><img alt="" src="' + (icon || 'media/icons/glyph/star.png') + '"></span>' +
      '<span class="toast__title"></span><span class="toast__text"></span>';
    el.querySelector('.toast__title').textContent = title;
    el.querySelector('.toast__text').textContent = text || '';
    toastBox.appendChild(el);
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add('is-in'); });
    });
    sound('toast', { x: window.innerWidth - 140 });
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 420);
    }, 3200);
  }
  window.CrabToast = toast;


  /* ── Smooth scrolling ─────────────────────────────────────────────────
     Every way of moving the page — wheel, trackpad, keyboard, anchor —
     feeds one animator that chases a target position instead of jumping
     to it. Nothing else may call window.scrollTo; use glideTo / glideBy or
     the two will fight over the scroll position.

     The animator eases exponentially over real frame time. RESPONSE is
     that easing as a time constant: roughly how long it takes to cover 63%
     of the gap left. Input devices do not all want the same number. A
     notched wheel delivers a few big jumps and wants a long glide; a
     trackpad has already been smoothed by the OS and needs only enough to
     sand off residual steps — pile a long glide on top of that and you get
     the swimming lag people mean by scroll-jacked. Test any change with a
     real wheel and a real trackpad.                                     */
  var glideTo = function (v) { window.scrollTo(0, v); };

  function initSmoothScroll() {
    var RESPONSE_WHEEL   = 165;
    var RESPONSE_PRECISE = 70;
    var RESPONSE_KEY     = 150;
    var RESPONSE_ANCHOR  = 210;

    var current     = window.scrollY || window.pageYOffset;
    var target      = current;
    var response    = RESPONSE_WHEEL;
    var lastTime    = 0;
    var lastWritten = current;
    var raf         = null;

    /* A glide to an element, rather than to a number. If the page changes
       height while it is in flight — an image arriving below the fold, the
       Discord card filling in — the destination moves with the element. The
       re-aim happens in the measure pass, which only runs when something
       actually changed size, so the frame loop still never reads layout. */
    var aimAt       = null;
    var aimOffset   = 0;
    onMeasure(function () {
      if (!raf || !aimAt) return;
      target = clampY(docTop(aimAt) - aimOffset);
    });

    function clampY(v) { return Math.max(0, Math.min(metrics.travel, v)); }

    /* The glide carries a fractional position but only asks for whole
       device pixels. Most of the site is pixel art at a fixed scale, and
       landing it on a half pixel makes the renderer resample it differently
       every frame — the button outlines crawl and everything shimmers. */
    function writeScroll(v) {
      var dpr = window.devicePixelRatio || 1;
      window.scrollTo(0, Math.round(v * dpr) / dpr);
    }

    function tick(now) {
      var dt = lastTime ? Math.min(now - lastTime, 64) : 16.7;
      lastTime = now;
      current += (target - current) * (1 - Math.exp(-dt / response));
      if (Math.abs(target - current) < 0.5) {
        current = target;
        lastTime = 0;
        raf = null;
        aimAt = null;
      } else {
        raf = requestAnimationFrame(tick);
      }
      writeScroll(current);
      lastWritten = window.scrollY || window.pageYOffset;
    }

    /* Starting from rest, take the page's position from the page itself.
       A scroll the browser made — a scrollbar flick, find in page — only
       reports its event on the next frame, so a glide that starts in the
       same frame would otherwise begin from a stale position, and then
       mistake the browser's own move for an outside jump and chase it. */
    function syncIfIdle() {
      if (raf) return;
      current = target = lastWritten = window.scrollY || window.pageYOffset;
    }

    function to(v, tau) {
      var dest = clampY(v);
      if (reduceMotion) {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        current = target = dest;
        writeScroll(current);
        return;
      }
      response = tau || RESPONSE_ANCHOR;
      target = dest;
      if (!raf) {
        lastTime = 0;
        raf = requestAnimationFrame(tick);
      }
    }
    function by(delta, tau) { aimAt = null; syncIfIdle(); to(target + delta, tau); }
    glideTo = function (v, tau) { aimAt = null; syncIfIdle(); to(v, tau); };

    window.addEventListener('scroll', function () {
      var y = window.scrollY || window.pageYOffset;
      /* Idle: the browser moved the page (scrollbar, find in page, back).
         Adopt its position so the next glide starts from where it is. */
      if (!raf) {
        current = target = y;
        lastWritten = y;
        return;
      }
      /* Mid-glide and the page jumped somewhere we did not put it: absorb
         the difference into both ends rather than dragging it back. Only
         real jumps count — sub-pixel nudges are left to be overwritten. */
      if (Math.abs(y - lastWritten) > 1) {
        var shift = y - lastWritten;
        current += shift;
        /* Clamped, so an absorbed jump can never leave the glide chasing a
           point past the end of the page. */
        target = clampY(target + shift);
        lastWritten = y;
      }
    }, { passive: true });

    docEl.classList.add('has-smooth-scroll');

    /* "/", "/index.html" and "/about" versus "/about.html" are the same
       page: the live host serves clean URLs, the files are .html. */
    function samePath(a, b) {
      function norm(p) { return p.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/$/, ''); }
      return norm(a) === norm(b);
    }

    document.addEventListener('click', function (e) {
      var link = e.target.closest && e.target.closest('a[href*="#"]');
      if (!link || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var url;
      try { url = new URL(link.href, location.href); } catch (err) { return; }
      if (url.origin !== location.origin || !samePath(url.pathname, location.pathname) ||
          !url.hash || url.hash.length < 2) return;
      var dest;
      try { dest = document.querySelector(url.hash); } catch (err) { return; }
      if (!dest) return;
      e.preventDefault();
      var bar = $('.topbar');
      var offset = (bar ? bar.offsetHeight : 0) + 12;
      syncIfIdle();
      current = window.scrollY || window.pageYOffset;
      aimAt = dest;
      aimOffset = offset;
      to(dest.getBoundingClientRect().top + current - offset, RESPONSE_ANCHOR);
      if (window.history && history.pushState) history.pushState(null, '', url.hash);
      /* Move focus with the view, for keyboard and screen reader users. */
      if (!dest.hasAttribute('tabindex')) dest.setAttribute('tabindex', '-1');
      dest.focus({ preventScroll: true });
    });

    if (reduceMotion) return;

    var cachedNode = null;
    var cachedAnswer = false;
    function scrollsItself(node) {
      if (node === cachedNode) return cachedAnswer;
      cachedNode = node;
      cachedAnswer = false;
      while (node && node !== document.body && node.nodeType === 1) {
        if (node.scrollHeight > node.clientHeight + 1) {
          var overflow = getComputedStyle(node).overflowY;
          if (overflow === 'auto' || overflow === 'scroll') { cachedAnswer = true; break; }
        }
        node = node.parentNode;
      }
      return cachedAnswer;
    }

    function isNotchedWheel(e) {
      if (e.deltaMode !== 0) return true;
      var d = Math.abs(e.deltaY);
      return d >= 50 && d % 1 === 0;
    }
    function pixelsFor(e) {
      if (e.deltaMode === 1) return e.deltaY * 40;
      if (e.deltaMode === 2) return e.deltaY * window.innerHeight;
      return e.deltaY;
    }
    var preciseUntil = 0;

    window.addEventListener('wheel', function (e) {
      if (e.ctrlKey || e.defaultPrevented) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (scrollsItself(e.target)) return;
      if (docEl.classList.contains('has-intro')) { e.preventDefault(); return; }
      if (!isNotchedWheel(e)) preciseUntil = e.timeStamp + 350;
      e.preventDefault();
      by(pixelsFor(e), e.timeStamp < preciseUntil ? RESPONSE_PRECISE : RESPONSE_WHEEL);
    }, { passive: false });

    var KEEPS_ITS_KEYS = 'input, textarea, select, button, a, [contenteditable], [role="button"], [role="tab"]';
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target && e.target.closest && e.target.closest(KEEPS_ITS_KEYS)) return;
      if (document.querySelector('dialog[open]') || docEl.classList.contains('has-intro')) return;
      if (scrollsItself(e.target)) return;
      var page = window.innerHeight * 0.9;
      var step = null;
      switch (e.key) {
        case 'ArrowDown': step = 90; break;
        case 'ArrowUp':   step = -90; break;
        case 'PageDown':  step = page; break;
        case 'PageUp':    step = -page; break;
        case ' ':         step = e.shiftKey ? -page : page; break;
        case 'Home':      e.preventDefault(); to(0, RESPONSE_ANCHOR); return;
        case 'End':       e.preventDefault(); to(metrics.travel, RESPONSE_ANCHOR); return;
        default: return;
      }
      e.preventDefault();
      by(step, RESPONSE_KEY);
    });
  }

  function initTopbar() {
    var bar = $('.topbar');
    if (!bar) return;
    var solid = false;
    onScroll(function (y) {
      var s = y > 24;
      if (s !== solid) { solid = s; bar.classList.toggle('is-scrolled', s); }
    });
  }

  /* ── The sound of scrolling ───────────────────────────────────────────
     Moving the page moves air: every frame the page moves, its speed goes
     to the sound engine, which turns it into a rush that follows the
     scroll (sfx.js).                                                    */
  function initScrollSound() {
    if (!SFX) return;
    var lastY = window.scrollY || window.pageYOffset;
    var lastT = 0;
    onScroll(function (y) {
      var now = performance.now();
      var dt = (now - lastT) / 1000;
      if (lastT && dt > 0 && dt < 0.25) SFX.scroll((y - lastY) / dt);
      lastY = y;
      lastT = now;
    });
  }

  function initMenu() {
    var bar = $('.topbar');
    var toggle = $('.topbar__menu');
    var nav = $('.topbar__nav');
    if (!bar || !toggle || !nav) return;
    var open = false;
    function setMenu(on) {
      if (on === open) return;
      open = on;
      bar.classList.toggle('is-open', on);
      toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    toggle.addEventListener('click', function () { setMenu(!open); });
    $$('a', nav).forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (open && e.key === 'Escape') {
        setMenu(false);
        toggle.focus();
      }
    });
    document.addEventListener('pointerdown', function (e) {
      if (open && !bar.contains(e.target)) setMenu(false);
    });
    var wide = window.matchMedia ? window.matchMedia('(min-width: 1001px)') : null;
    if (wide) {
      var close = function () { if (wide.matches) setMenu(false); };
      if (wide.addEventListener) wide.addEventListener('change', close);
      else if (wide.addListener) wide.addListener(close);
    }
    window.addEventListener('pageshow', function () { setMenu(false); });
  }

  /* ── Copy ─────────────────────────────────────────────────────────────
     [data-copy] copies its value. The control flips to its success state
     for a moment (the .swap markup holds both states, so nothing resizes),
     a toast confirms it, and a little burst of experience orbs goes up
     where it was pressed, with the sound of picking them up.           */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
    }
    legacyCopy(text);
    return Promise.resolve();
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function initCopy() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-copy]');
      if (!btn) return;
      e.preventDefault();
      var text = btn.getAttribute('data-copy');
      var rect = btn.getBoundingClientRect();
      var x = e.clientX || rect.left + rect.width / 2;
      var y = e.clientY || rect.top + rect.height / 2;
      copyText(text).then(function () {
        btn.classList.add('is-success');
        clearTimeout(btn._copyTimer);
        btn._copyTimer = setTimeout(function () {
          btn.classList.remove('is-success');
        }, 1600);
        toast(btn.getAttribute('data-toast-title') || 'Copied to clipboard',
          btn.getAttribute('data-toast') || text,
          btn.getAttribute('data-toast-icon') || 'media/icons/glyph/tpa.png');
        if (VFX) VFX.pop(x, y, 'xp');
        sound('xp', { x: x });
      });
    });
  }

  /* ── Reveals ──────────────────────────────────────────────────────────
     [data-reveal] arrives as it scrolls into view. Counting within each
     parent restarts the stagger for every row instead of one delay that
     grows down the page. [data-split] headings also rise word by word,
     each with a plucked note a step higher than the heading before, so
     reading down a page climbs a scale. Entrances play once; a moment
     later the element gives its transform back so hover motion is not
     fighting a held entrance.                                         */
  function initReveals() {
    $$('[data-split]').forEach(function (el) { splitWords(el, 'split-w'); });

    var items = $$('[data-reveal]');
    var headings = items.filter(function (el) { return el.hasAttribute('data-split'); });
    var parents = [];
    var counts = [];
    items.forEach(function (el) {
      var group = parents.indexOf(el.parentNode);
      if (group === -1) {
        parents.push(el.parentNode);
        counts.push(0);
        group = parents.length - 1;
      }
      el.style.setProperty('--step', String(Math.min(counts[group]++, 6)));
    });
    $$('[data-enter]').forEach(function (el, i) {
      if (!el.style.getPropertyValue('--step')) el.style.setProperty('--step', String(i));
    });

    function reveal(el, heard) {
      el.classList.add('is-revealed');
      el.dispatchEvent(new CustomEvent('crab:reveal'));
      if (el.hasAttribute('data-split')) {
        if (heard) {
          var r = el.getBoundingClientRect();
          sound('heading', { step: -3 + headings.indexOf(el), x: r.left + r.width / 2 });
        }
        return;
      }
      /* Once the entrance has fully landed — its own stagger plus the
         longest transition — drop the hook, so the element's own, quicker
         hover transitions apply again. */
      var step = parseInt(el.style.getPropertyValue('--step'), 10) || 0;
      setTimeout(function () {
        el.removeAttribute('data-reveal');
        el.style.removeProperty('--step');
      }, 1400 + step * 80);
    }
    window.CrabReveal = reveal;

    if (!('IntersectionObserver' in window) || reduceMotion) {
      items.forEach(reveal);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        reveal(entry.target, true);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function (el) { io.observe(el); });
  }

  /* Run fn once el is revealed (or straight away if it has no reveal). */
  function onReveal(el, fn) {
    if (!el.hasAttribute('data-reveal') || el.classList.contains('is-revealed') || reduceMotion) {
      if (!('IntersectionObserver' in window) || reduceMotion) { fn(); return; }
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        fn();
      }, { threshold: 0.3 });
      io.observe(el);
      return;
    }
    el.addEventListener('crab:reveal', function once() {
      el.removeEventListener('crab:reveal', once);
      fn();
    });
  }

  /* ── Splash ───────────────────────────────────────────────────────────
     The yellow line beside the logo, picked fresh on every load the way
     the title screen's is. A page can bring its own list in
     data-splashes, pipe separated.                                    */
  function initSplash() {
    var splash = $('.splash');
    if (!splash) return;
    var own = splash.getAttribute('data-splashes');
    var list = own ? own.split('|') : [
      'Free to play!',
      'Crabtastic!',
      'Fight for hearts!',
      'Watch your back!',
      'Free starter kit!',
      'Now with bounties!',
      'Claim your land!',
      'All. For. You.',
      '100% Bedrock!',
      'Also try the Nether!',
      'Not pay to win!',
      'Hearts are earned!'
    ];
    splash.textContent = list[Math.floor(Math.random() * list.length)];
  }

  /* ── Tabs ─────────────────────────────────────────────────────────────
     Any [role="tablist"] with [role="tab"] buttons pointing at panels by
     aria-controls. Arrow keys move between tabs. A segmented control
     (.seg) also slides its highlight to the chosen option.            */
  function initTabs() {
    $$('[role="tablist"]').forEach(function (list) {
      var tabs = $$('[role="tab"]', list);
      if (!tabs.length) return;

      function select(tab, focus) {
        tabs.forEach(function (t, i) {
          var on = t === tab;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.tabIndex = on ? 0 : -1;
          var panel = document.getElementById(t.getAttribute('aria-controls'));
          if (panel) panel.hidden = !on;
          if (on) list.style.setProperty('--seg-i', String(i));
        });
        list.style.setProperty('--seg-n', String(tabs.length));
        if (focus) tab.focus();
        list.dispatchEvent(new CustomEvent('crab:tab', { detail: tab }));
        requestMeasure();
      }

      tabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { select(tab); });
        tab.addEventListener('keydown', function (e) {
          var n = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
          if (e.key === 'Home') n = 0;
          if (e.key === 'End') n = tabs.length - 1;
          if (n === null) return;
          e.preventDefault();
          select(tabs[n], true);
        });
      });

      /* The join picker guesses your device. Consoles announce themselves
         in their browsers' user agents; everything else is PC or mobile. */
      var start = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
      if (list.hasAttribute('data-detect')) {
        var ua = navigator.userAgent || '';
        var consoleTab = $('[data-platform="console"]', list);
        if (consoleTab && /Xbox|PlayStation|Nintendo/i.test(ua)) start = consoleTab;
      }
      select(start);
    });
  }

  /* ── Hero ─────────────────────────────────────────────────────────────
     The hero's progress off the top of the screen, 0 to 1, drives the
     photo drifting down and closing in while the copy lifts away. The
     pointer tilts the world a few pixels. All of it is custom properties
     the stylesheet composes into a single transform per layer — never
     write style.transform on these from here, or one effect will quietly
     delete the other.                                                 */
  function initHero() {
    var heroes = $$('.hero, .page-hero');
    if (!heroes.length) return;
    heroes.forEach(function (hero) {
      var top = 0;
      var height = 1;
      var last = -1;
      onMeasure(function () {
        top = docTop(hero);
        height = hero.offsetHeight || 1;
      });
      if (reduceMotion) return;
      onScroll(function (y) {
        var p = clamp((y - top) / height, 0, 1);
        if (Math.abs(p - last) < 0.001) return;
        last = p;
        hero.style.setProperty('--hero-p', p.toFixed(4));
      });
    });

    var world = $('.hero__world');
    if (!world || reduceMotion || !finePointer) return;
    var heroEl = world.closest('.hero');
    var heroBottom = Infinity;
    onMeasure(function () { heroBottom = heroEl ? docTop(heroEl) + heroEl.offsetHeight : Infinity; });
    var px = 0, py = 0, tx = 0, ty = 0, raf = null, lastT = 0;
    function tick(now) {
      var dt = lastT ? Math.min(now - lastT, 64) : 16;
      lastT = now;
      var k = 1 - Math.exp(-dt / 260);
      px += (tx - px) * k;
      py += (ty - py) * k;
      world.style.setProperty('--px', px.toFixed(4));
      world.style.setProperty('--py', py.toFixed(4));
      if (Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001) raf = requestAnimationFrame(tick);
      else { raf = null; lastT = 0; }
    }
    window.addEventListener('pointermove', function (e) {
      /* Past the hero there is nothing to lean: skip the style writes. */
      if ((window.scrollY || window.pageYOffset) > heroBottom) return;
      tx = clamp(e.clientX / window.innerWidth * 2 - 1, -1, 1);
      ty = clamp(e.clientY / window.innerHeight * 2 - 1, -1, 1);
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
  }

  /* ── Statement ────────────────────────────────────────────────────────
     A paragraph that lights up word by word as it scrolls through the
     screen. One custom property per frame — --lit, how many words are
     lit — and the stylesheet works out each word's brightness from its
     own index, so the loop never touches the words themselves.        */
  function initStatement() {
    $$('[data-words]').forEach(function (el) {
      var words = splitWords(el, 'lw');
      if (!words.length) return;
      el.style.setProperty('--n', String(words.length));
      if (reduceMotion) { el.style.setProperty('--lit', String(words.length + 2)); return; }
      var top = 0;
      var height = 1;
      var last = -1;
      onMeasure(function () {
        top = docTop(el);
        height = el.offsetHeight || 1;
      });
      onScroll(function (y) {
        /* Starts lighting as the paragraph enters the lower part of the
           screen and finishes once it has climbed into the upper third. */
        var start = top - viewH * 0.82;
        var end = top + height - viewH * 0.38;
        var p = clamp((y - start) / Math.max(1, end - start), 0, 1);
        var lit = p * (words.length + 1.5);
        if (Math.abs(lit - last) < 0.02) return;
        last = lit;
        el.style.setProperty('--lit', lit.toFixed(3));
      });
    });
  }

  /* ── The lifesteal story ──────────────────────────────────────────────
     A stage that plays the game's whole loop on a heart bar by itself, as
     soon as it is on screen: you start with ten, a kill steals one, a death
     gives one away, lose them all and you are out, a teammate spends a Soul
     Bottle, and you climb to thirty.

     Everything on the stage is a pure function of how far through the
     story the clock is, and render() draws it. The clock runs while the
     stage is in view, waits when it is not, and starts over the next time
     it comes in after finishing. The particle bursts fire only when a
     threshold is crossed going forwards, because a heart shattering in
     reverse is not a thing.                                           */
  function initStory() {
    var section = $('[data-story]');
    if (!section) return;
    var heartsEl = $('[data-hearts]', section);
    var steps = $$('.story__step', section);
    var pips = $$('.story__pip', section);
    var fly = $('.story__fly', section);
    var stage = $('.story__stage', section);
    var canvas = $('.story__fx', section);
    if (!heartsEl || !steps.length) return;

    var N = 30;
    var hearts = [];
    var states = [];
    for (var i = 0; i < N; i++) {
      var h = document.createElement('span');
      h.className = 'heart';
      h.setAttribute('data-state', i < 10 ? 'full' : 'hidden');
      heartsEl.appendChild(h);
      hearts.push(h);
      states.push(h.getAttribute('data-state'));
    }

    if (reduceMotion) { section.classList.add('is-static'); return; }

    var burst = VFX && canvas ? VFX.fx(canvas) : null;
    var geo = { pos: [], stageL: 0, stageW: 0, stageH: 0 };
    onMeasure(function () {
      var s = stage.getBoundingClientRect();
      geo.stageL = s.left;
      geo.stageW = s.width;
      geo.stageH = s.height;
      geo.pos = hearts.map(function (el) {
        var r = el.getBoundingClientRect();
        return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
      });
    });

    var STEPS = steps.length;
    var lastFly = null;
    var cur = -1;
    var lastP = -1;
    var fired = {};

    /* Where each heart drains in step three — the same numbers statesFor
       uses — and each one's burst, made once rather than every frame. */
    var DRAIN_AT = [];
    var drainBurst = [];
    for (var d = 0; d < 10; d++) {
      DRAIN_AT.push(0.06 + (9 - d) * 0.064);
      drainBurst.push((function (k) { return function () { burstAt(k, 'heart', 0.55); }; })(d));
    }

    /* A phone on its side has no room for the stage — the hearts, the
       caption and the HUD cannot share 390 pixels — so short screens get
       the steps in order, the way reduced motion does. Turning the phone
       back upright brings the stage back. */
    var shortScreen = window.matchMedia ? window.matchMedia('(max-height: 520px)') : null;
    var staticMode = false;
    function applyMode() {
      staticMode = !!(shortScreen && shortScreen.matches);
      section.classList.toggle('is-static', staticMode);
      section.classList.toggle('is-live', !staticMode);
      if (staticMode) {
        for (var i = 0; i < N; i++) {
          var st = i < 10 ? 'full' : 'hidden';
          hearts[i].setAttribute('data-state', st);
          states[i] = st;
        }
        steps.forEach(function (el) { el.classList.remove('is-active'); });
        section.classList.remove('is-dead', 'is-full', 'is-bottle');
        if (fly) fly.classList.remove('is-on');
        cur = -1;
        lastP = -1;
        vars = {};
        classes = {};
        lastFly = null;
      }
      requestMeasure();
    }

    /* Every write is skipped when nothing changed: a style write is a
       style recalculation, and this runs every frame of the section. */
    var vars = {};
    var classes = {};
    applyMode();
    function modeChanged() {
      applyMode();
      if (staticMode) pause();
      else { rewind(); if (seen >= SHOW_AT) run(); }
    }
    if (shortScreen) {
      if (shortScreen.addEventListener) shortScreen.addEventListener('change', modeChanged);
      else if (shortScreen.addListener) shortScreen.addListener(modeChanged);
    }
    function setVar(name, value) {
      if (vars[name] === value) return;
      vars[name] = value;
      section.style.setProperty(name, value);
    }
    function setClass(name, on) {
      if (classes[name] === on) return;
      classes[name] = on;
      section.classList.toggle(name, on);
    }

    /* A burst belongs to one point in the story. It re-arms only once the
       story is back before that point, and it plays only when the point is
       crossed going forwards at the clock's pace, so a restart marks every
       point as not yet reached without a sound. */
    function fire(key, reached, play, fn) {
      if (!reached) { fired[key] = false; return; }
      if (fired[key]) return;
      fired[key] = true;
      if (play) fn();
    }
    function burstAt(i, preset, scale) {
      if (!burst || !geo.pos[i]) return;
      burst.burst(geo.pos[i].x, geo.pos[i].y, preset, { scale: scale || 1 });
    }
    /* Where a heart is across the screen, for placing its sound. */
    function heartX(i) {
      return geo.pos[i] ? geo.stageL + geo.pos[i].x : window.innerWidth / 2;
    }
    function stealBurst()  { burstAt(10, 'gold', 0.8); sound('steal', { x: heartX(10) }); }
    function loseBurst()   { burstAt(10, 'heart', 0.9); sound('lose', { x: heartX(10) }); }
    function deadBurst()   { for (var q = 0; q < 10; q += 3) burstAt(q, 'dust', 0.6); sound('death'); }
    function reviveBurst() { for (var r = 0; r < 10; r += 2) burstAt(r, 'gold', 0.6); sound('totem'); }
    function thirtyBurst() { for (var q = 20; q < 30; q += 3) burstAt(q, 'gold', 0.5); sound('levelup'); }
    function bottleSound() { sound('beacon'); }
    function enchantSound() { sound('enchant'); }

    /* The story is heard as well as seen, by the same rule as the bursts.
       Hearts filling climb the scale from left to right, hearts draining
       step down it, gold hearts come back as bells; the turns of the story
       (a kill, a death, elimination, the bottle, the revive, thirty) each
       have their own sound above. */
    function heartSound(i, from, to) {
      if (to === 'full' && from === 'empty') {
        note(i < 10 ? i : 5 + Math.round((i - 10) * 0.55), { inst: 'pling', x: heartX(i), gain: 0.8 });
      } else if (to === 'flash') {
        sound('hurt', cur === 3 ? { x: heartX(i), step: 9 - i, gain: 0.6 } : { x: heartX(i) });
      } else if (to === 'gold' && cur === 4) {
        note(i, { inst: 'bell', x: heartX(i), gain: 0.7 });
      }
    }

    /* Which state each heart is in, for step s at local progress t. */
    function statesFor(s, t) {
      var out = [];
      for (var i = 0; i < N; i++) out.push('hidden');
      var k;
      if (s === 0) {
        for (k = 0; k < 10; k++) out[k] = t > 0.05 + k * 0.045 ? 'full' : 'empty';
      } else if (s === 1) {
        for (k = 0; k < 10; k++) out[k] = 'full';
        if (t > 0.08) out[10] = 'empty';
        if (t > 0.66) out[10] = t < 0.76 ? 'gold' : 'full';
      } else if (s === 2) {
        for (k = 0; k < 11; k++) out[k] = 'full';
        if (t > 0.3) out[10] = 'flash';
        if (t > 0.4) out[10] = 'empty';
        if (t > 0.78) out[10] = 'hidden';
      } else if (s === 3) {
        for (k = 0; k < 10; k++) {
          var at = 0.06 + (9 - k) * 0.064;
          out[k] = t < at ? 'full' : t < at + 0.03 ? 'flash' : 'empty';
        }
        if (t > 0.78) for (k = 0; k < 10; k++) out[k] = 'dead';
      } else if (s === 4) {
        for (k = 0; k < 10; k++) {
          var back = 0.32 + k * 0.045;
          out[k] = t < 0.22 ? 'dead' : t < back ? 'empty' : t < 0.86 ? 'gold' : 'full';
        }
      } else {
        for (k = 0; k < 10; k++) out[k] = 'full';
        for (k = 10; k < N; k++) out[k] = t > 0.04 + (k - 10) * 0.034 ? 'full' : 'empty';
      }
      return out;
    }

    function render(p) {
      var f = p * STEPS;
      var s = Math.min(STEPS - 1, Math.floor(f));
      var t = clamp(f - s, 0, 1);
      var forward = p >= lastP;

      if (s !== cur) {
        steps.forEach(function (el, i) { el.classList.toggle('is-active', i === s); });
        pips.forEach(function (el, i) { el.classList.toggle('is-on', i <= s); });
        section.setAttribute('data-at', String(s));
        cur = s;
      }

      /* Bursts and sounds: forwards, once per crossing. */
      var play = forward && lastP >= 0 && p - lastP < 0.04;

      var want = statesFor(s, t);
      for (var i = 0; i < N; i++) {
        if (want[i] !== states[i]) {
          if (play) heartSound(i, states[i], want[i]);
          hearts[i].setAttribute('data-state', want[i]);
          states[i] = want[i];
        }
      }

      /* The heart in flight: in from the right on a kill, off to the left
         on a death. */
      var flyOn = false;
      var fx = 0, fy = 0, target = geo.pos[10] || { x: 0, y: 0 };
      if (s === 1 && t > 0.14 && t < 0.68) {
        var a = (t - 0.14) / 0.54;
        var e = 1 - Math.pow(1 - a, 3);
        fx = (geo.stageW + 60) + (target.x - geo.stageW - 60) * e;
        fy = target.y - Math.sin(Math.PI * e) * geo.stageH * 0.14;
        flyOn = true;
      } else if (s === 2 && t > 0.4 && t < 0.8) {
        var b = (t - 0.4) / 0.4;
        var e2 = b * b;
        fx = target.x + (-60 - target.x) * e2;
        fy = target.y - Math.sin(Math.PI * b) * geo.stageH * 0.12;
        flyOn = true;
      }
      if (fly) {
        if (flyOn !== lastFly) { fly.classList.toggle('is-on', flyOn); lastFly = flyOn; }
        if (flyOn) fly.style.transform = 'translate3d(' + fx.toFixed(1) + 'px,' + fy.toFixed(1) + 'px,0) translate(-50%,-50%)';
      }

      setClass('is-dead', (s === 3 && t > 0.78) || (s === 4 && t < 0.22));
      setClass('is-bottle', s === 4 && t > 0.06 && t < 0.36);
      setClass('is-full', s === STEPS - 1 && t > 0.72);

      fire('steal', s > 1 || (s === 1 && t > 0.66), play, stealBurst);
      fire('lose', s > 2 || (s === 2 && t > 0.4), play, loseBurst);
      for (var k = 0; k < 10; k++) {
        fire('drain' + k, s > 3 || (s === 3 && t > DRAIN_AT[k] + 0.03), play, drainBurst[k]);
      }
      fire('dead', s > 3 || (s === 3 && t > 0.78), play, deadBurst);
      fire('bottle', s > 4 || (s === 4 && t > 0.08), play, bottleSound);
      fire('revive', s > 4 || (s === 4 && t > 0.34), play, reviveBurst);
      fire('full', s === 5 && t > 0.72, play, enchantSound);
      fire('thirty', s === 5 && t > 0.9, play, thirtyBurst);
      lastP = p;
    }

    /* The clock. Each step runs as long as it takes to read its line and
       watch what happens to the bar. */
    var LENGTHS = [2200, 2400, 2300, 3000, 2800, 2600];
    var TOTAL = LENGTHS.reduce(function (a, b) { return a + b; }, 0);
    var clock = 0;
    var raf = null;
    var lastNow = 0;
    var seen = 0;
    var SHOW_AT = 0.55;   // how much of the stage must be on screen to start
    var HIDE_AT = 0.2;    // and how little before it waits

    function progressAt(ms) {
      var s = 0;
      var from = 0;
      while (s < STEPS - 1 && ms >= from + LENGTHS[s]) { from += LENGTHS[s]; s++; }
      return (s + clamp((ms - from) / LENGTHS[s], 0, 1)) / STEPS;
    }
    function frame(now) {
      var dt = lastNow ? Math.min(now - lastNow, 64) : 16;
      lastNow = now;
      clock = Math.min(TOTAL, clock + dt);
      render(progressAt(clock));
      raf = clock < TOTAL ? requestAnimationFrame(frame) : null;
    }
    function run() {
      if (raf || staticMode || clock >= TOTAL) return;
      lastNow = 0;
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }
    function rewind() {
      pause();
      clock = 0;
      render(0);
    }

    if (!('IntersectionObserver' in window)) { section.classList.add('is-static'); return; }
    if (!staticMode) render(0);
    new IntersectionObserver(function (entries) {
      seen = entries[entries.length - 1].intersectionRatio;
      if (staticMode) return;
      if (seen >= SHOW_AT) run();
      else if (seen < HIDE_AT) {
        pause();
        /* Finished and out of sight: ready to play again on the way back. */
        if (clock >= TOTAL && seen === 0) rewind();
      }
    }, { threshold: [0, HIDE_AT, SHOW_AT] }).observe(stage);
  }

  /* ── Counters ─────────────────────────────────────────────────────────
     [data-count] numbers run up from zero when they come into view, fast
     then settling, and land exactly on the figure in the markup. Each
     change of figure ticks, a little higher as it goes, so the run is
     heard slowing to its stop. */
  function countUp(el, to, dur) {
    var from = 0;
    var fmt = el.getAttribute('data-format');
    var suffix = el.getAttribute('data-suffix') || '';
    function show(v) {
      var n = Math.round(v);
      var text = fmt === 'k' && n >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K' : n.toLocaleString('en-GB');
      el.textContent = text + suffix;
    }
    if (reduceMotion) { show(to); return; }
    var t0 = 0;
    var shown = '';
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2;
    function tick(now) {
      if (!t0) t0 = now;
      var k = Math.min(1, (now - t0) / dur);
      show(from + (to - from) * (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)));
      if (el.textContent !== shown) {
        if (shown) sound('tick', { k: k, x: x });
        shown = el.textContent;
      }
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  window.CrabCount = countUp;

  function initCounters() {
    $$('[data-count]').forEach(function (el) {
      var to = parseFloat(el.getAttribute('data-count'));
      if (isNaN(to)) return;
      var host = el.closest('[data-reveal]') || el;
      onReveal(host, function () { countUp(el, to, 1600); });
    });
  }

  /* ── Bento tiles ──────────────────────────────────────────────────────
     Small scenes inside the feature tiles that play when their tile comes
     into view: a chat log filling in, the engine booting, an experience
     bar filling, the platforms taking turns. The engine's checks come up
     as eight-bit notes climbing to ready, chat lines arrive with a blip
     (a join with a chime), and the bar fills with orbs to a level.      */
  function initBento() {
    $$('[data-sequence]').forEach(function (list) {
      var items = $$(':scope > *', list);
      var gap = parseInt(list.getAttribute('data-sequence'), 10) || 700;
      var boot = list.classList.contains('boot');
      var chat = list.classList.contains('chat');
      list.classList.add('is-waiting');
      var host = list.closest('[data-reveal]') || list;
      onReveal(host, function () {
        items.forEach(function (item, i) {
          setTimeout(function () {
            item.classList.add('is-in');
            /* Heard only when it is seen happening: with reduced motion
               the lines are all simply there. */
            if (reduceMotion) return;
            var r = item.getBoundingClientRect();
            var x = r.left + r.width / 2;
            if (boot) note(5 + i, { inst: 'bit', x: x, gain: 0.8 });
            else if (chat && item.classList.contains('chat__system')) note(8, { inst: 'pling', x: x, gain: 0.6 });
            else if (chat) sound('chat', { x: x });
          }, 350 + i * gap);
        });
      });
    });

    $$('[data-xpfill]').forEach(function (el) {
      var host = el.closest('[data-reveal]') || el;
      onReveal(host, function () {
        el.classList.add('is-full');
        if (reduceMotion) return;
        /* The fill takes 1.7s after a 0.2s wait (index.css); orbs land
           along it, left to right, and the last one levels up. */
        var r = el.getBoundingClientRect();
        for (var i = 0; i < 7; i++) {
          (function (k) {
            setTimeout(function () {
              sound('xp', { x: r.left + r.width * (0.15 + k * 0.12) });
            }, 260 + k * 150);
          })(i);
        }
        setTimeout(function () { sound('levelup', { x: r.left + r.width }); }, 1500);
      });
    });

    $$('[data-cycle]').forEach(function (list) {
      var items = $$(':scope > *', list);
      if (items.length < 2) return;
      var i = 0;
      var timer = null;
      function tick() {
        items.forEach(function (el, j) { el.classList.toggle('is-on', j === i); });
        i = (i + 1) % items.length;
      }
      tick();
      if (reduceMotion || !('IntersectionObserver' in window)) return;
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && !timer) timer = setInterval(tick, 1300);
        else if (!entries[0].isIntersecting && timer) { clearInterval(timer); timer = null; }
      }).observe(list);
    });
  }

  /* ── Live data ────────────────────────────────────────────────────────
     Two sources: the game server itself and the Discord widget. Answers
     are kept for two minutes in session storage so moving between pages
     does not ask again; the status page always asks afresh. The live line
     in the top bar and the hero shows the best thing available — players
     in game if the server answers, members online in Discord if not — and
     nothing at all rather than a number that is wrong.                 */
  var LIVE_TTL = 120000;
  var DISCORD_API = 'https://discord.com/api/guilds/1440040951547691109/widget.json';

  /* The server runs on NetherNet, which is WebRTC, not the RakNet UDP ping
     the public status services (mcstatus.io, mcsrvstat.us) send, so they
     call it offline whatever it is doing. NetherNet servers also answer a
     plain HTTP GET at /v1/join, on the game's own port, with their name,
     version and player count, no session needed (Mojang's NetherNet
     onboarding guide). Any answer proves the server is up. No answer is
     reported as unknown, never as offline: a missing answer can be the
     server, the network, or the host's CORS header, and the page cannot
     tell which.                                                       */
  var SERVER = 'play.crabsmp.net:19132';
  var STATUS_URL = 'https://' + SERVER + '/v1/join';

  function serverState(d) {
    var name = typeof d.name === 'string' ? d.name.replace(/§./g, '').trim() : '';
    return {
      online: true,
      players: typeof d.players === 'number' ? { online: d.players, max: d.maxPlayers } : null,
      version: typeof d.version === 'string' ? d.version : null,
      motd: name ? [name] : null,
      at: Date.now()
    };
  }

  function getJSON(url) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl && setTimeout(function () { ctl.abort(); }, 10000);
    return fetch(url, { credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { clearTimeout(timer); return d; },
        function (e) { clearTimeout(timer); throw e; });
  }

  function pingServer() {
    return getJSON(STATUS_URL).then(serverState);
  }

  /* A cached answer, or a new one. Callers that ask while a request is
     already out share it: it is as fresh as anything they could start. */
  var pending = {};
  function cached(key, load, fresh) {
    var hit = readJSON(session, 'crab-live-' + key);
    if (!fresh && hit && Date.now() - hit.t < LIVE_TTL) return Promise.resolve(hit.v);
    if (!pending[key]) {
      var settle = function () { delete pending[key]; };
      pending[key] = load().then(function (v) {
        writeJSON(session, 'crab-live-' + key, { t: Date.now(), v: v });
        return v;
      });
      pending[key].then(settle, settle);
    }
    return pending[key];
  }

  function getServer(fresh) {
    return cached('server', pingServer, fresh);
  }

  function getDiscord() {
    return cached('discord', function () {
      return getJSON(DISCORD_API).then(function (d) {
        var members = (d && d.members) || [];
        var order = { online: 0, idle: 1, dnd: 2 };
        var rank = function (m) { return order.hasOwnProperty(m.status) ? order[m.status] : 3; };
        members = members.slice().sort(function (a, b) { return rank(a) - rank(b); });
        return {
          name: d && d.name || '',
          presence: d && typeof d.presence_count === 'number' ? d.presence_count : null,
          avatars: members.slice(0, 14).map(function (m) {
            return { url: m.avatar_url, status: m.status, name: m.username };
          })
        };
      });
    });
  }

  function initLive() {
    var targets = $$('[data-live]');
    if (!targets.length) return;
    function show(count, what) {
      var html = '<span class="dot dot--on" aria-hidden="true"></span><span><b>' +
        count.toLocaleString('en-GB') + '</b> ' + what + '</span>';
      targets.forEach(function (el) {
        el.innerHTML = html;
        el.hidden = false;
        el.classList.add('is-live');
      });
    }
    // Only the newest answer may paint: a Discord fallback still on its
    // way must not land on top of a fresher "playing now".
    var turn = 0;
    function fromDiscord() {
      var mine = ++turn;
      return getDiscord().then(function (d) {
        if (mine === turn && d.presence) show(d.presence, 'online in Discord');
      });
    }
    function fromServer(s) {
      if (s.online && s.players && s.players.online > 0) {
        turn++;
        show(s.players.online, 'playing now');
      } else {
        return fromDiscord();
      }
    }
    getServer().then(fromServer, fromDiscord).catch(function () {});
    // The status page pings every minute; keep the line in step with it.
    document.addEventListener('crab:server', function (e) {
      Promise.resolve(fromServer(e.detail)).catch(function () {});
    });
  }

  /* ── Discord ──────────────────────────────────────────────────────────
     The community section draws its own widget from Discord's public
     JSON rather than embedding Discord's iframe: the live count, and the
     faces of people online right now.                                 */
  function initDiscord() {
    var box = $('[data-discord]');
    if (!box) return;
    var count = $('[data-discord-count]', box);
    var faces = $('[data-discord-faces]', box);
    getDiscord().then(function (d) {
      if (count && d.presence) {
        var live = count.closest('[data-discord-live]');
        if (live) live.hidden = false;
        var host = count.closest('[data-reveal]') || count;
        onReveal(host, function () { countUp(count, d.presence, 1400); });
      }
      if (faces && d.avatars.length) {
        d.avatars.forEach(function (m, i) {
          var span = document.createElement('span');
          span.className = 'face face--' + m.status;
          span.style.setProperty('--i', String(i));
          var img = document.createElement('img');
          img.src = m.url;
          img.alt = '';
          img.loading = 'lazy';
          img.referrerPolicy = 'no-referrer';
          img.width = 40;
          img.height = 40;
          span.appendChild(img);
          faces.appendChild(span);
        });
        faces.hidden = false;
        requestAnimationFrame(function () { faces.classList.add('is-in'); });
      }
    }).catch(function () { box.classList.add('is-offline'); });
  }

  /* ── Status page ──────────────────────────────────────────────────────
     Draws the server the way the game's server list does: icon, name,
     message of the day, player count and signal bars. Every check pings
     play.crabsmp.net:19132 afresh — on arrival, every minute while the
     page is in view, on coming back to the tab, and on demand.

     The first check and every Refresh are heard: a ping going out, then
     a chime for online, a low fall for offline. The checks the page makes
     by itself stay quiet unless the answer changed.                   */
  var STATUS_EVERY = 60000;

  function initStatus() {
    var card = $('[data-status]');
    if (!card) return;
    var stateText = $('[data-status-text]', card);
    var sub = $('[data-status-sub]');
    var players = $('[data-status-players]', card);
    var motd = $('[data-status-motd]', card);
    var checked = $('[data-status-checked]');
    var refresh = $('[data-status-refresh]');
    var versionEl = $('[data-status-version]');
    var motdIdle = motd ? motd.textContent : '';
    var busy = false;
    var last = 0;
    var loud = false;
    var said = null;

    function cardX() {
      var r = card.getBoundingClientRect();
      return r.left + r.width / 2;
    }

    function state(name, label) {
      card.classList.remove('is-checking', 'is-online', 'is-offline', 'is-unknown');
      card.classList.add('is-' + name);
      if (stateText) stateText.textContent = label;
      if (loud || (said && said !== name)) sound(name, { x: cardX() });
      said = name;
    }

    function paint(s) {
      var time = new Date(s.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      if (checked) checked.textContent = 'Checked at ' + time;
      if (s.online) {
        state('online', 'Online');
        if (players) players.textContent = s.players ? s.players.online + '/' + s.players.max : '—';
        if (motd) motd.textContent = s.motd && s.motd.length ? s.motd.join('\n') : motdIdle;
        if (sub) sub.textContent = 'CrabSMP is up and taking players. See you in there.';
      } else {
        state('offline', 'Offline');
        if (players) players.textContent = '—';
        if (motd) motd.textContent = motdIdle;
        if (sub) sub.textContent = 'The server is not answering right now. Updates go out on Discord first.';
      }
      if (versionEl && s.version) versionEl.textContent = s.version;
      document.dispatchEvent(new CustomEvent('crab:server', { detail: s }));
    }

    function fail() {
      state('unknown', 'Unknown');
      if (players) players.textContent = '—';
      if (motd) motd.textContent = motdIdle;
      if (sub) sub.textContent = 'Could not get an answer from the server. Try again in a moment.';
      if (checked) checked.textContent = 'Check failed';
    }

    function check(heard) {
      if (busy) return;
      busy = true;
      loud = !!heard;
      last = Date.now();
      card.classList.add('is-checking');
      if (refresh) refresh.classList.add('is-spinning');
      if (loud) sound('ping', { x: cardX() });
      var done = function () {
        busy = false;
        loud = false;
        setTimeout(function () { if (refresh) refresh.classList.remove('is-spinning'); }, 400);
      };
      getServer(true).then(paint, fail).then(done, done);
    }

    check(true);
    setInterval(function () { if (!document.hidden) check(false); }, STATUS_EVERY);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Date.now() - last >= STATUS_EVERY) check(false);
    });
    if (refresh) refresh.addEventListener('click', function () { check(true); });
  }

  /* ── Votes ────────────────────────────────────────────────────────────
     Each site takes one vote a day. The page remembers when you last
     opened each one, ticks it off, and counts down to when it is open
     again. It lives in this browser only; the real record is the site's. */
  var VOTE_KEY = 'crab-votes';
  var DAY = 24 * 60 * 60 * 1000;

  function initVotes() {
    var rows = $$('[data-vote]');
    if (!rows.length) return;
    var meter = $('[data-vote-meter]');
    var meterText = $('[data-vote-count]');
    var saved = readJSON(local, VOTE_KEY) || {};

    function left(ms) {
      var h = Math.floor(ms / 3600000);
      var m = Math.floor((ms % 3600000) / 60000);
      return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
    }

    function paint() {
      var now = Date.now();
      var done = 0;
      rows.forEach(function (row) {
        var id = row.getAttribute('data-vote');
        var at = saved[id];
        var wait = at ? at + DAY - now : 0;
        var on = wait > 0;
        row.classList.toggle('is-voted', on);
        var status = $('[data-vote-status]', row);
        if (status) status.textContent = on ? 'Voted · again in ' + left(wait) : 'Ready to vote';
        if (on) done++;
      });
      if (meter) meter.style.setProperty('--done', String(done));
      if (meterText) meterText.textContent = String(done);
      $$('.vote-meter__pip').forEach(function (pip, i) { pip.classList.toggle('is-on', i < done); });
    }

    rows.forEach(function (row) {
      var link = $('a[href]', row);
      if (!link) return;
      link.addEventListener('click', function (e) {
        var id = row.getAttribute('data-vote');
        var before = rows.filter(function (r2) { return r2.classList.contains('is-voted'); }).length;
        saved[id] = Date.now();
        writeJSON(local, VOTE_KEY, saved);
        paint();
        var r = link.getBoundingClientRect();
        var x = e.clientX || r.left + r.width / 2;
        if (VFX) VFX.pop(x, e.clientY || r.top, 'xp');
        /* Orbs for a vote; the last site of the day is a level. The vote
           opens in a new tab, so the level waits for the visitor to come
           back to this one. */
        sound('xp', { x: x });
        var after = rows.filter(function (r2) { return r2.classList.contains('is-voted'); }).length;
        if (after === rows.length && before < rows.length) {
          setTimeout(function () { whenSeen(function () { sound('levelup'); }); }, 320);
        }
        toast('Vote opened', (row.getAttribute('data-name') || 'Site') + ' · come back in 24 hours', 'media/icons/glyph/star.png');
      });
    });
    paint();
    setInterval(paint, 30000);
  }

  /* ── Cosmetics ────────────────────────────────────────────────────────
     The store's cosmetic grid filters by tier. Filtering is a state the
     grid is in rather than items being removed, so a hidden tile keeps its
     place and they fade instead of jumping.                           */
  function initCosmetics() {
    var bar = $('[data-filter-bar]');
    var grid = $('[data-filter-grid]');
    if (!bar || !grid) return;
    var buttons = $$('[data-filter]', bar);
    var tiles = $$('[data-tier]', grid);
    buttons.forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        var f = btn.getAttribute('data-filter');
        buttons.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
        bar.style.setProperty('--seg-i', String(i));
        var order = ['plus', 'extra', 'demon'];
        tiles.forEach(function (tile) {
          var t = tile.getAttribute('data-tier');
          /* Each tier includes the ones below it, the way the ranks do. */
          var show = f === 'all' || order.indexOf(t) <= order.indexOf(f);
          tile.classList.toggle('is-dim', !show);
        });
      });
    });
    bar.style.setProperty('--seg-n', String(buttons.length));
  }

  /* ── Tilt ─────────────────────────────────────────────────────────────
     [data-tilt] cards lean a few degrees towards the pointer and a sheen
     follows it, like turning an item card in your hand. Pointer devices
     only, and only while the pointer is over the card.                */
  function initTilt() {
    if (reduceMotion || !finePointer) return;
    $$('[data-tilt]').forEach(function (card) {
      var raf = null;
      var tx = 0, ty = 0, cx = 0, cy = 0, mx = 50, my = 50;
      var rect = null;
      function tick() {
        cx += (tx - cx) * 0.18;
        cy += (ty - cy) * 0.18;
        card.style.setProperty('--rx', cx.toFixed(3) + 'deg');
        card.style.setProperty('--ry', cy.toFixed(3) + 'deg');
        card.style.setProperty('--mx', mx.toFixed(1) + '%');
        card.style.setProperty('--my', my.toFixed(1) + '%');
        if (Math.abs(tx - cx) > 0.01 || Math.abs(ty - cy) > 0.01) raf = requestAnimationFrame(tick);
        else raf = null;
      }
      card.addEventListener('pointerenter', function () { rect = card.getBoundingClientRect(); card.classList.add('is-tilting'); });
      /* The page scrolling under a still pointer moves the card; measure
         it again at the next move rather than tilt against where it was. */
      window.addEventListener('scroll', function () { rect = null; }, { passive: true });
      card.addEventListener('pointermove', function (e) {
        if (!rect) rect = card.getBoundingClientRect();
        var x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        var y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
        var max = parseFloat(card.getAttribute('data-tilt')) || 5;
        ty = (x - 0.5) * 2 * max;
        tx = (0.5 - y) * 2 * max;
        mx = x * 100;
        my = y * 100;
        if (!raf) raf = requestAnimationFrame(tick);
      });
      card.addEventListener('pointerleave', function () {
        tx = 0; ty = 0; rect = null;
        card.classList.remove('is-tilting');
        if (!raf) raf = requestAnimationFrame(tick);
      });
    });
  }

  /* ── Contents ─────────────────────────────────────────────────────────
     A long document's table of contents marks the section being read. */
  function initToc() {
    var toc = $('[data-toc]');
    if (!toc) return;
    var links = $$('a[href^="#"]', toc);
    var items = links.map(function (a) {
      return { a: a, el: document.getElementById(a.getAttribute('href').slice(1)), top: 0 };
    }).filter(function (it) { return it.el; });
    if (!items.length) return;
    onMeasure(function () {
      items.forEach(function (it) { it.top = docTop(it.el); });
    });
    /* The section being read is the last one whose top has passed a reading
       line a third of the way down the screen. */
    var current = null;
    onScroll(function (y) {
      var line = y + viewH * 0.32;
      var on = items[0];
      for (var i = 0; i < items.length; i++) {
        if (items[i].top <= line) on = items[i];
      }
      if (on === current) return;
      if (current) current.a.removeAttribute('aria-current');
      on.a.setAttribute('aria-current', 'true');
      current = on;
    });
  }

  /* ── Ambient particles ────────────────────────────────────────────────
     Any canvas marked data-motes gets a drifting particle field. */
  function initAmbient() {
    if (!VFX) return;
    $$('canvas[data-motes]').forEach(function (c) {
      var small = window.innerWidth < 700;
      VFX.motes(c, c.getAttribute('data-motes'), { scale: small ? 0.7 : 1, max: small ? 60 : 200 });
    });
  }

  /* ── Intro ────────────────────────────────────────────────────────────
     The welcome plays on the first visit to the home page; the head of the
     page decided that before first paint by setting html.has-intro, reading
     the same key this writes. ?intro=1 plays it regardless, which is what
     Replay intro points at from other pages. Skip, a click, Escape, Enter
     or Space all cut it short.

     While it is up the rest of the page is inert, so Tab cannot wander
     into links hidden behind it.                                      */
  var INTRO_KEY = 'crab-intro-v2';

  function initIntro() {
    var root = document.getElementById('intro');

    $$('[data-replay-intro]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (!root) return;
        e.preventDefault();
        glideTo(0, 1);
        playIntro(root);
      });
    });

    if (!root || !docEl.classList.contains('has-intro')) {
      if (root) root.hidden = true;
      markReady();
      return;
    }
    whenShown(function () { playIntro(root); });
  }

  function playIntro(root) {
    if (local) { try { local.setItem(INTRO_KEY, '1'); } catch (e) {} }
    docEl.classList.add('has-intro');
    root.hidden = false;
    root.classList.remove('is-shattering', 'is-done', 'is-still');
    root.classList.add('is-playing');
    var shelved = $$('body > *').filter(function (el) {
      return el !== root && el.tagName !== 'SCRIPT' && !el.inert;
    });
    shelved.forEach(function (el) { el.inert = true; });
    /* Everything else is inert, so Tab lands on Skip by itself; Escape,
       Enter and Space skip from anywhere. */
    var skipBtn = $('.intro__skip', root);

    var done = false;
    var control = null;
    var shattered = false;

    function reveal() {
      if (shattered) return;
      shattered = true;
      shelved.forEach(function (el) { el.inert = false; });
      docEl.classList.remove('has-intro');
      markReady(true);
      requestMeasure();
    }
    function end() {
      if (done) return;
      done = true;
      reveal();
      root.classList.add('is-done');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(function () {
        root.classList.remove('is-playing');
        root.hidden = true;
      }, 450);
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        skip();
      }
    }
    function skip(x, y) {
      if (control) control.skip(x, y);
      else end();
    }

    document.addEventListener('keydown', onKey, true);
    root.onpointerdown = function (e) {
      if (e.target.closest('.intro__skip')) return;
      skip(e.clientX, e.clientY);
    };
    if (skipBtn) skipBtn.onclick = function () { skip(); };

    if (!VFX || reduceMotion) {
      /* No particles and no breaking glass: the mark, held for a moment,
         then the page. */
      root.classList.add('is-still');
      setTimeout(end, reduceMotion ? 1400 : 600);
      return;
    }
    control = VFX.intro(root, { onShatter: reveal, onDone: end });
  }

  /* ── Boot ─────────────────────────────────────────────────────────────
     Last in the file on purpose: a deferred script runs once the document
     is already interactive, so ready() calls straight through, and every
     variable the features rely on has to be initialised before it does. */
  ready(function () {
    measure();

    /* Warm the pressed and hovered button faces. A border-image swapped in
       on :hover that has never been fetched paints one frame of bare
       button before it lands. */
    ['red', 'blue', 'green', 'gold', 'dark', 'purple'].forEach(function (skin) {
      ['unchecked_hover', 'default'].forEach(function (face) {
        new Image().src = 'media/ui/buttons/' + skin + '/' + face + '.png';
      });
    });

    initSmoothScroll();
    initTopbar();
    initScrollSound();
    initMenu();
    initCopy();
    initReveals();
    initSplash();
    initTabs();
    initHero();
    initStatement();
    initStory();
    initCounters();
    initBento();
    initLive();
    initDiscord();
    initStatus();
    initVotes();
    initCosmetics();
    initTilt();
    initToc();
    initAmbient();
    initIntro();
  });
})();
