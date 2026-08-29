(function () {
  'use strict';

  /* Tell the stylesheet scripting is alive. Every rule that hides something
     on its way in is scoped to html.js, so if this file fails to parse or is
     blocked, nothing is ever hidden and the pages stay readable. */
  var docEl = document.documentElement;
  docEl.classList.add('js');

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var CLICK_SOUND_SRC = '';
  var VOLUME          = 0.55;

  var audioCtx   = null;
  var fileBuffer = null;
  var audioReady = false;

  function initAudio() {
    if (audioReady) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    audioReady = true;
    if (CLICK_SOUND_SRC) {
      fetch(CLICK_SOUND_SRC)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (data) { return audioCtx.decodeAudioData(data); })
        .then(function (buf) { fileBuffer = buf; })
        .catch(function () { fileBuffer = null; });
    }
  }

  function synthClick() {
    var t = audioCtx.currentTime;
    var pitch = 0.9 + Math.random() * 0.2;

    var osc  = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(150 * pitch, t + 0.06);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.30 * VOLUME, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.12);

    var len   = Math.floor(audioCtx.sampleRate * 0.03);
    var buf   = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    var ch    = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    var noise = audioCtx.createBufferSource();
    noise.buffer = buf;
    var hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1900;
    var nGain = audioCtx.createGain();
    nGain.gain.setValueAtTime(0.15 * VOLUME, t);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    noise.connect(hp).connect(nGain).connect(audioCtx.destination);
    noise.start(t);
    noise.stop(t + 0.04);
  }

  function playFile() {
    var src = audioCtx.createBufferSource();
    src.buffer = fileBuffer;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    var g = audioCtx.createGain();
    g.gain.value = VOLUME;
    src.connect(g).connect(audioCtx.destination);
    src.start();
  }

  function playClick() {
    if (!audioReady) initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    try {
      if (fileBuffer) playFile();
      else synthClick();
    } catch (e) {}
  }

  var INTERACTIVE = 'a, button, summary, .mc-btn, [role="button"], [data-sound]';

  function pressable(target) {
    if (!target || !target.closest) return null;
    var el = target.closest(INTERACTIVE);
    if (!el || el.classList.contains('no-sound') || el.disabled) return null;
    return el;
  }

  document.addEventListener('pointerdown', function (e) {
    if (pressable(e.target)) playClick();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    if (pressable(e.target)) playClick();
  }, true);

  window.CrabSound = { play: playClick };

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  /* ── Motion plumbing ──────────────────────────────────────────────────*/

  /* Stamps a --step index onto a list of elements. The stylesheet turns that
     into a transition-delay, which is why no page hard-codes one. The cap
     stops a long list from ending on a delay you can sit and wait through. */
  function stagger(nodes, cap) {
    var limit = cap == null ? 5 : cap;
    Array.prototype.forEach.call(nodes, function (node, i) {
      node.style.setProperty('--step', Math.min(i, limit));
    });
  }

  /* One rAF loop for everything that reads the scroll position. Handlers
     register once and run at most once per frame no matter how many scroll
     events fired, so reading scrollY can never turn into a per-event pile of
     layout work. Each is handed the current offset, and none of them may
     write to the DOM in a way that forces a synchronous layout. */
  var scrollTasks  = [];
  var scrollQueued = false;

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
  window.addEventListener('resize', requestScrollFrame, { passive: true });

  /* Page measurements, taken once and reused by every scroll handler.

     Reading scrollHeight or offsetHeight inside the frame loop would force a
     layout on every frame of every scroll, and worse, it would do it right
     after the scroll animator has written a new position — the read-after-
     write pattern that produces exactly the stutter this is all meant to
     avoid. Instead they are measured when something can actually have
     changed: on resize, and whenever the body's box changes size, which
     covers images finishing, the status panel filling in, and the rules tabs
     swapping between panels of different heights. */
  var metrics = { travel: 0, heroHeight: 0 };

  function measure() {
    var hero = document.querySelector('.hero-section');
    metrics.travel = Math.max(0, docEl.scrollHeight - window.innerHeight);
    metrics.heroHeight = hero ? hero.offsetHeight : 0;
    requestScrollFrame();
  }

  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if ('ResizeObserver' in window && document.body) {
    new ResizeObserver(measure).observe(document.body);
  }

  /* The hero holds its entrance until the curtain is gone, so it is not
     spent behind the loader or the intro. The timeout is a backstop: if a
     stalled image or a thrown error means nothing ever calls this, the hero
     appears anyway rather than staying blank. */
  var readyMarked = false;
  function markReady() {
    if (readyMarked) return;
    /* Never spend the entrance behind the intro curtain. The intro calls
       back here itself the moment it lifts, so nothing is lost by waiting. */
    if (docEl.classList.contains('intro-playing')) return;
    readyMarked = true;
    docEl.classList.add('is-ready');
  }
  setTimeout(markReady, 8000);

  ready(function () {
    measure();

    var loading = document.getElementById('loading');
    if (loading) {
      var hideLoader = function () {
        if (loading.dataset.hidden) return;
        loading.dataset.hidden = '1';
        loading.style.transition = 'opacity 0.45s ease';
        loading.style.opacity = '0';
        setTimeout(function () { loading.style.display = 'none'; }, 480);
        /* Hand over part-way through the fade rather than after it, so the
           hero is already moving as the loader clears instead of the two
           reading as separate events. */
        setTimeout(markReady, 220);
      };
      if (document.readyState === 'complete') setTimeout(hideLoader, 650);
      else window.addEventListener('load', function () { setTimeout(hideLoader, 650); });
      setTimeout(hideLoader, 4000);
    } else {
      markReady();
    }

    /* Hero entrance: the children come up in DOM order. The splash tag is
       left out because it is absolutely positioned and runs its own bob, so
       it takes a plain fade in the stylesheet instead. */
    var heroContent = document.querySelector('.hero-content');
    if (heroContent) {
      stagger(heroContent.querySelectorAll(':scope > *:not(.hero-splash)'), 8);
    }

    // Hero background slideshow: crossfades through media/slideshow/ every 4s.
    (function heroSlideshow() {
      var containers = document.querySelectorAll('.hero-bg-img');
      if (!containers.length) return;

      var FILES = ['slide1.webp', 'slide2.webp', 'slide3.webp', 'slide4.webp'];

      containers.forEach(function (container) {
        var slides = FILES.map(function (file, i) {
          var slide = document.createElement('div');
          slide.className = 'hero-bg-slide' + (i === 0 ? ' is-active' : '');
          slide.style.backgroundImage = "url('media/slideshow/" + file + "')";
          container.appendChild(slide);
          return slide;
        });
        if (slides.length < 2) return;

        var index = 0;
        setInterval(function () {
          slides[index].classList.remove('is-active');
          index = (index + 1) % slides.length;
          slides[index].classList.add('is-active');
        }, 4000);
      });
    })();

    /* ── Hero backdrop ────────────────────────────────────────────────────
       Two inputs, one shared set of custom properties. Neither writes
       `transform` directly: the stylesheet composes --par-x/--par-y (cursor)
       and --scroll-y (parallax) into a single transform, so the two can run
       at once without overwriting each other. */
    var heroSection = document.querySelector('.hero-section');
    var heroLayers  = document.querySelectorAll('.hero-bg-img, .vx-hero-bg');

    function setHeroVar(name, value) {
      for (var i = 0; i < heroLayers.length; i++) {
        heroLayers[i].style.setProperty(name, value);
      }
    }

    /* The backdrop drifts a few pixels away from the cursor, so it reads as
       sitting behind the foreground rather than pasted onto it. Pointer only:
       on a touch screen there is no hover to respond to. */
    if (heroSection && heroLayers.length && !reduceMotion &&
        (!window.matchMedia || window.matchMedia('(pointer: fine)').matches)) {
      (function heroPointerDrift() {
        var STRENGTH = 18;   // px of travel, edge to edge
        var EASE     = 0.08;
        var targetX = 0, targetY = 0, curX = 0, curY = 0, raf = null;

        function onMove(e) {
          var rect = heroSection.getBoundingClientRect();
          if (e.clientY < rect.top || e.clientY > rect.bottom) return;
          targetX = ((e.clientX - rect.left) / rect.width  - 0.5) * STRENGTH;
          targetY = ((e.clientY - rect.top)  / rect.height - 0.5) * STRENGTH;
          if (!raf) raf = requestAnimationFrame(tick);
        }

        function tick() {
          curX += (targetX - curX) * EASE;
          curY += (targetY - curY) * EASE;
          setHeroVar('--par-x', (-curX).toFixed(2) + 'px');
          setHeroVar('--par-y', (-curY).toFixed(2) + 'px');
          raf = (Math.abs(targetX - curX) > 0.05 || Math.abs(targetY - curY) > 0.05)
            ? requestAnimationFrame(tick)
            : null;
        }

        window.addEventListener('mousemove', onMove, { passive: true });
      })();
    }

    /* Scroll parallax: the backdrop is held back so it falls behind the page
       as you leave the hero. RATE is deliberately low — the stylesheet hides
       9% of the image past each edge, and the drift has to stay inside that
       or a bare edge swings into view at the bottom of a tall hero. */
    if (heroSection && heroLayers.length && !reduceMotion) {
      onScroll(function heroScrollDrift(y) {
        if (!metrics.heroHeight || y > metrics.heroHeight) return;  // hero is gone
        setHeroVar('--scroll-y', (y * 0.07).toFixed(2) + 'px');
      });
    }

    var siteHeader = document.getElementById('site-header');

    /* ── Smooth scrolling ─────────────────────────────────────────────────
       Every way of moving the page — wheel, trackpad, keyboard, anchor link —
       feeds one animator that chases a target position instead of jumping to
       it. Nothing else in the file may call window.scrollTo; go through
       glideTo/glideBy or the two will fight over the scroll position.

       The animator eases exponentially: each frame it closes a share of the
       remaining gap, so it starts fast and settles gently, and it never has
       to know how far it is going. RESPONSE is that easing expressed as a
       time constant — the time to cover about 63% of whatever gap is left.
       Lower is tighter, higher is floatier.

       The one thing worth understanding before tuning it: input devices do
       not all want the same number. A notched mouse wheel delivers a few big
       discrete jumps and wants a long glide to smooth them into travel. A
       trackpad has already been smoothed by the OS, arriving as a dense
       stream of small deltas with its own momentum — pile a long glide on top
       of that and you get the floaty, swimming lag people mean when they call
       a site scroll-jacked. It needs only enough smoothing to sand off the
       residual stepping, which is why it gets a much shorter constant rather
       than being left alone. Same system, different response.            */
    (function scrolling() {
      var RESPONSE_WHEEL   = 165;  // ms — notched wheel: a long, deliberate glide
      var RESPONSE_PRECISE = 70;   // ms — trackpad: smooth the steps, don't add drag
      var RESPONSE_KEY     = 150;  // ms — arrows and paging
      var RESPONSE_ANCHOR  = 210;  // ms — jumping to a section

      var current     = window.scrollY || window.pageYOffset;
      var target      = current;
      var response    = RESPONSE_WHEEL;
      var lastTime    = 0;
      var lastWritten = current;
      var raf         = null;

      function clamp(v) { return Math.max(0, Math.min(metrics.travel, v)); }

      function tick(now) {
        /* Integrate over the real frame time. A fixed per-frame fraction is
           not a speed: without this the page would glide more than twice as
           fast on a 144Hz display as on a 60Hz one, and drift out of sync
           with every CSS transition on the page. The clamp keeps a
           backgrounded tab from resuming with one enormous catch-up step. */
        var dt = lastTime ? Math.min(now - lastTime, 64) : 16.7;
        lastTime = now;

        current += (target - current) * (1 - Math.exp(-dt / response));

        if (Math.abs(target - current) < 0.5) {
          current  = target;
          lastTime = 0;
          raf      = null;
        } else {
          raf = requestAnimationFrame(tick);
        }

        window.scrollTo(0, current);
        /* Record where the page actually ended up, not where we asked it to
           go. The browser may clamp or round the request, and the difference
           is how the scroll listener below tells its own writes apart from
           everybody else's. */
        lastWritten = window.scrollY || window.pageYOffset;
      }

      function glideTo(v, tau) {
        var dest = clamp(v);

        /* Reduced motion asks for the page to move exactly as far as the OS
           says and no further. Land on it immediately. */
        if (reduceMotion) {
          if (raf) { cancelAnimationFrame(raf); raf = null; }
          current = target = dest;
          window.scrollTo(0, current);
          return;
        }

        response = tau;
        target   = dest;
        if (!raf) {
          lastTime = 0;
          raf = requestAnimationFrame(tick);
        }
      }

      function glideBy(delta, tau) { glideTo(target + delta, tau); }

      window.addEventListener('scroll', function () {
        var y = window.scrollY || window.pageYOffset;

        /* Idle: the browser is doing the scrolling — a scrollbar drag, find
           in page, restoring position on back. Our idea of where the page
           sits is stale, so re-read it and let the next glide start from
           where the page actually is rather than snapping back. */
        if (!raf) {
          current = target = y;
          lastWritten = y;
          return;
        }

        /* Mid-glide, and the page has jumped somewhere we did not put it:
           find in page, an anchor restored on back, a scrollbar grabbed
           while the glide was still running. Holding our own number would
           drag the page straight back off whatever it just jumped to.

           So absorb the difference into both ends. The glide carries on at
           the same speed with the same distance left to run, just measured
           from where the page now is.

           Only real jumps qualify. Scroll anchoring also nudges the position
           as the header condenses, but it does so in sub-pixel steps spread
           across that transition, well under this threshold — those are left
           to be overwritten, which is what makes the header shrink smoothly
           instead of the page appearing to slide back up under it. */
        if (Math.abs(y - lastWritten) > 1) {
          var shift = y - lastWritten;
          current += shift;
          target  += shift;
          lastWritten = y;
        }
      }, { passive: true });

      docEl.classList.add('has-smooth-scroll');

      /* ── Anchor jumps ────────────────────────────────────────────────── */

      document.addEventListener('click', function (e) {
        var link = e.target.closest && e.target.closest('a[href^="#"]');
        if (!link) return;
        var hash = link.getAttribute('href');
        if (!hash || hash.length < 2) return;
        var dest;
        try { dest = document.querySelector(hash); } catch (err) { return; }
        if (!dest) return;
        e.preventDefault();

        /* The sticky header would otherwise cover the top of the target,
           which is the whole reason this is not left to the browser. */
        var offset = (siteHeader ? siteHeader.offsetHeight : 0) + 14;

        current = window.scrollY || window.pageYOffset;
        glideTo(dest.getBoundingClientRect().top + current - offset, RESPONSE_ANCHOR);

        /* Keep the URL honest without letting the browser also jump to the
           fragment, which would undo the glide we just started. */
        if (window.history && history.pushState) history.pushState(null, '', hash);
      });

      /* Reduced motion: the wheel and the keyboard go straight back to the
         browser, which already moves the page exactly as far as the OS says
         and no further. Anchor links still work — glideTo lands on them
         immediately rather than gliding. */
      if (reduceMotion) return;

      /* Anything with its own scrollbar keeps its own wheel and keys. The
         result is cached by node: during a gesture the target does not
         change, so this walks the tree once per gesture rather than once per
         event, which matters now that trackpads fire a dense stream. */
      var cachedNode = null;
      var cachedAnswer = false;

      function scrollsItself(node) {
        if (node === cachedNode) return cachedAnswer;
        cachedNode = node;
        cachedAnswer = false;
        while (node && node !== document.body && node.nodeType === 1) {
          if (node.scrollHeight > node.clientHeight + 1) {
            var overflow = getComputedStyle(node).overflowY;
            if (overflow === 'auto' || overflow === 'scroll') {
              cachedAnswer = true;
              break;
            }
          }
          node = node.parentNode;
        }
        return cachedAnswer;
      }

      /* ── Wheel and trackpad ──────────────────────────────────────────── */

      /* deltaMode 1 and 2 report lines and pages and only ever come from a
         real wheel. In pixel mode a notch is one large whole number, where a
         trackpad ramps through a stream of small, often fractional ones. */
      function isNotchedWheel(e) {
        if (e.deltaMode !== 0) return true;
        var d = Math.abs(e.deltaY);
        return d >= 50 && d % 1 === 0;
      }

      function pixelsFor(e) {
        if (e.deltaMode === 1) return e.deltaY * 40;                 // lines
        if (e.deltaMode === 2) return e.deltaY * window.innerHeight; // pages
        return e.deltaY;
      }

      /* One trackpad-looking event marks the whole gesture as precise. A
         flick ramps up through small deltas and can pass through notch-sized
         whole numbers at its peak, and switching response half way through a
         gesture is far more noticeable than picking either one and holding
         it. */
      var preciseUntil = 0;

      window.addEventListener('wheel', function (e) {
        if (e.ctrlKey || e.defaultPrevented) return;             // pinch zoom
        /* Sideways gestures belong to the browser: on a trackpad that is the
           back/forward swipe, and swallowing it would break navigation. */
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        if (scrollsItself(e.target)) return;

        if (!isNotchedWheel(e)) preciseUntil = e.timeStamp + 350;

        e.preventDefault();
        glideBy(
          pixelsFor(e),
          e.timeStamp < preciseUntil ? RESPONSE_PRECISE : RESPONSE_WHEEL
        );
      }, { passive: false });

      /* ── Keyboard ────────────────────────────────────────────────────── */

      /* Paging and arrowing glide too, so keyboard scrolling matches the rest
         of the site instead of teleporting. Held keys repeat into the same
         target and come out as continuous travel.

         Everything that might want the key for itself is skipped: form
         fields, anything editable, buttons and links (Space and Enter
         activate those), an open dialog, and any inner scroller. */
      var KEEPS_ITS_KEYS =
        'input, textarea, select, button, a, [contenteditable], [role="button"]';

      document.addEventListener('keydown', function (e) {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target && e.target.closest && e.target.closest(KEEPS_ITS_KEYS)) return;
        if (document.querySelector('dialog[open]')) return;
        if (scrollsItself(e.target)) return;

        var page = window.innerHeight * 0.9;
        var step = null;

        switch (e.key) {
          case 'ArrowDown': step = 90;    break;
          case 'ArrowUp':   step = -90;   break;
          case 'PageDown':  step = page;  break;
          case 'PageUp':    step = -page; break;
          case ' ':         step = e.shiftKey ? -page : page; break;
          case 'Home':      e.preventDefault(); glideTo(0, RESPONSE_ANCHOR); return;
          case 'End':       e.preventDefault(); glideTo(metrics.travel, RESPONSE_ANCHOR); return;
          default: return;
        }

        e.preventDefault();
        glideBy(step, RESPONSE_KEY);
      });
    })();

    /* ── Header ───────────────────────────────────────────────────────────
       Tightens once the page has moved, and its bottom edge doubles as a
       progress bar. Both are one custom property or class per frame, with no
       measurement beyond what the shared loop already did. */
    onScroll(function headerState(y) {
      if (siteHeader) siteHeader.classList.toggle('is-scrolled', y > 40);
      docEl.style.setProperty(
        '--scroll-progress',
        metrics.travel > 0 ? Math.min(1, y / metrics.travel).toFixed(4) : '0'
      );
    });

    var header = document.getElementById('site-header');
    var toggle = document.querySelector('.header-mobile-toggle');
    if (header && toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      var setMenu = function (open) {
        header.classList.toggle('navigation-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.innerHTML = open
          ? '<i class="fa-solid fa-xmark"></i><span class="visually-hidden">Close menu</span>'
          : '<i class="fa-solid fa-bars"></i><span class="visually-hidden">Open menu</span>';
      };
      toggle.addEventListener('click', function () {
        setMenu(!header.classList.contains('navigation-open'));
      });

      header.querySelectorAll('nav a').forEach(function (a) {
        a.addEventListener('click', function () { setMenu(false); });
      });

      /* Reuse the stagger index so the stacked menu deals its items out
         rather than dropping the whole list in at once. */
      stagger(header.querySelectorAll('nav ul > li'), 12);
    }

    /* The splash is picked here rather than written into the markup so it
       changes on every load, the way the title screen's does. A page whose
       splash should be about that page rather than the server carries its own
       pipe-separated list in data-splashes; the store does. */
    var splash = document.querySelector('.hero-splash');
    if (splash) {
      var own = splash.getAttribute('data-splashes');
      var splashes = own ? own.split('|') : [
        'Free to play!',
        'Crabtastic!',
        'Fight for hearts!',
        'Watch your back!',
        'Free starter kit!',
        'Now with bounties!',
        'Claim your land!',
        'All. For. You.',
        '100% Bedrock!',
        'Also try the Nether!'
      ];
      splash.textContent = splashes[Math.floor(Math.random() * splashes.length)];
    }

    function legacyCopy(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }

    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      var original = btn.innerHTML;
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy');
        var feedback = function () {
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
          btn.classList.add('is-success');
          setTimeout(function () {
            btn.innerHTML = original;
            btn.classList.remove('is-success');
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(feedback, function () {
            legacyCopy(text); feedback();
          });
        } else {
          legacyCopy(text); feedback();
        }
      });
    });

    var tabBtns = document.querySelectorAll('.rules-tab-btn');
    if (tabBtns.length) {
      tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          tabBtns.forEach(function (b) {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });
          document.querySelectorAll('.rules-body').forEach(function (body) {
            body.classList.remove('active');
          });
          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
          var panel = document.getElementById('tab-' + btn.dataset.tab);
          if (panel) panel.classList.add('active');
        });
      });
    }

    /* ── Reveal on scroll ─────────────────────────────────────────────────
       Elements are counted per parent, so each grid restarts its stagger at
       zero instead of every card on the page sharing one delay that keeps
       growing the further down you read.

       The observer drops each element the moment it lands. These are
       entrances, not a loop — nothing should replay because you scrolled
       back up past it. */
    var revealables = document.querySelectorAll('[data-reveal], .fade-up, .section-head');
    if (revealables.length) {
      var parents = [];
      var counts  = [];

      Array.prototype.forEach.call(revealables, function (el) {
        var group = parents.indexOf(el.parentNode);
        if (group === -1) {
          parents.push(el.parentNode);
          counts.push(0);
          group = parents.length - 1;
        }
        el.style.setProperty('--step', Math.min(counts[group]++, 5));
      });

      /* An entrance is over once it has played, so the element gives the
         hook back. Until it does, the reveal rule's transition is the most
         specific one on the element and every later transform it runs — a
         card lifting under the cursor, most of all — inherits the entrance's
         --dur-stage and moves like treacle. Handing the element back to its
         own stylesheet is what keeps hovers snappy on a revealed card.

         The wait is a timer rather than transitionend: the entrance animates
         two properties, an element that is scrolled past while still hidden
         may never fire the event at all, and a stray cleanup is harmless
         where a missed one is not. It covers the longest entrance the scale
         allows — --dur-stage plus the deepest stagger step — with room over. */
      var REVEAL_SETTLE_MS = 1200;

      function releaseReveal(el) {
        /* A section heading keeps everything it was given. It is hidden by
           its own class rather than by a hook that can be taken away, and
           the rule under the headline and the eyebrow's block both key off
           .is-revealed staying put — take it back and the heading vanishes
           and its rule collapses. It has nothing hover-driven to protect. */
        if (!el.hasAttribute('data-reveal') && !el.classList.contains('fade-up')) return;
        el.removeAttribute('data-reveal');
        el.classList.remove('fade-up', 'is-revealed');
        el.style.removeProperty('--step');
      }

      function reveal(el) {
        el.classList.add('is-revealed');
        setTimeout(function () { releaseReveal(el); }, REVEAL_SETTLE_MS);
      }

      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            reveal(entry.target);
            io.unobserve(entry.target);
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        Array.prototype.forEach.call(revealables, function (el) { io.observe(el); });
      } else {
        Array.prototype.forEach.call(revealables, function (el) { reveal(el); });
      }
    }

    var statusPanel = document.getElementById('status-panel');
    if (statusPanel) {
      var panelDot        = document.getElementById('panel-dot');
      var panelText       = document.getElementById('panel-text');
      var panelSub        = document.getElementById('panel-sub');
      var playerWrap      = document.getElementById('player-count-wrap');
      var playerCount     = document.getElementById('player-count');
      var heroStatusStat  = document.getElementById('hero-status-stat');
      var heroStatusVal   = document.getElementById('hero-status-val');
      var checked         = document.getElementById('last-checked-text');
      var spinner         = document.getElementById('status-spinner');

      if (spinner) spinner.classList.add('spinning');

      fetch('https://api.mcsrvstat.us/bedrock/3/play.crabsmp.net')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var now    = new Date();
          var time   = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          var online = data && data.online === true;

          if (checked) checked.textContent = 'Last checked at ' + time;
          if (spinner) spinner.classList.remove('spinning');

          if (online) {
            statusPanel.classList.add('panel-online');
            if (panelDot)  panelDot.className  = 'status-panel-dot dot-online';
            if (panelText) panelText.textContent = 'Server is Online';
            if (panelSub)  panelSub.textContent  = 'CrabSMP is up and accepting players. Connect to play.crabsmp.net on port 19132.';
            if (heroStatusVal)  heroStatusVal.textContent  = 'Online';
            if (heroStatusStat) heroStatusStat.className   = 'status-hero-stat stat-online';
            if (data.players && playerWrap && playerCount) {
              playerCount.textContent = data.players.online + ' / ' + data.players.max;
              playerWrap.classList.add('is-visible');
              playerWrap.removeAttribute('aria-hidden');
            }
          } else {
            statusPanel.classList.add('panel-offline');
            if (panelDot)  panelDot.className  = 'status-panel-dot dot-offline';
            if (panelText) panelText.textContent = 'Server is Offline';
            if (panelSub)  panelSub.textContent  = 'CrabSMP appears to be down right now. Check our Discord for updates.';
            if (heroStatusVal)  heroStatusVal.textContent  = 'Offline';
            if (heroStatusStat) heroStatusStat.className   = 'status-hero-stat stat-offline';
          }
        })
        .catch(function () {
          if (spinner) spinner.classList.remove('spinning');
          if (checked) checked.textContent = 'Check failed';
          if (panelText) panelText.textContent = 'Status Unknown';
          if (panelSub)  panelSub.textContent  = 'Could not reach the status API. Try again shortly.';
          if (heroStatusVal) heroStatusVal.textContent = '?';
        });
    }

    function resetIntro(intro) {
      intro.classList.remove('is-finishing', 'is-done');
      intro.querySelectorAll('.intro-welcome, .intro-logo, .intro-word')
        .forEach(function (n) { n.classList.remove('is-in', 'is-out'); });
    }

    function startIntro(intro) {
      rememberIntro();
      resetIntro(intro);
      runIntro(intro);
    }

    /* The welcome is a greeting, not a toll gate: it plays once, the first
       time someone lands on the home page, and localStorage remembers that
       so every visit after it — and every refresh — goes straight to the
       page. It only exists on the home page to begin with, so moving around
       the site never puts a curtain in front of a click.

       Storage is read through try/catch because it throws outright rather
       than returning null in a locked-down browser. A failed read means the
       intro simply plays again, which is the harmless direction to fail in;
       a failed write means the same thing next visit.

       ?intro=1 forces it regardless, which is what the Replay Intro link in
       the footer of the other pages points at. On this page that link is
       handled below without a reload. Skip, a click, Escape, Enter or Space
       all still cut it short. */
    var INTRO_SEEN_KEY = 'crab-intro-seen';

    function introSeen() {
      try { return window.localStorage.getItem(INTRO_SEEN_KEY) === '1'; }
      catch (e) { return false; }
    }

    function rememberIntro() {
      try { window.localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch (e) {}
    }

    var intro = document.getElementById('site-intro');
    if (intro) {
      if (/[?&]intro=1(?:&|$)/.test(window.location.search) || !introSeen()) {
        startIntro(intro);
      } else {
        intro.classList.add('is-done');
      }
    }

    document.querySelectorAll('[data-replay-intro]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var localIntro = document.getElementById('site-intro');
        if (localIntro) {
          e.preventDefault();
          startIntro(localIntro);
        }
      });
    });

    window.CrabIntro = {
      replay: function () {
        var el = document.getElementById('site-intro');
        if (el) startIntro(el);
      }
    };

    function runIntro(intro) {
      var welcome = intro.querySelector('.intro-welcome');
      var logo    = intro.querySelector('.intro-logo');
      var words   = intro.querySelectorAll('.intro-word');
      var skipBtn = intro.querySelector('.intro-skip');
      var loader  = document.getElementById('loading');

      docEl.classList.add('intro-playing');

      var timers   = [];
      var finished = false;
      function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

      function finish() {
        if (finished) return;
        finished = true;
        timers.forEach(clearTimeout);

        if (loader) loader.style.display = 'none';

        var done = function () {
          intro.classList.add('is-done');
          docEl.classList.remove('intro-playing');
          /* The curtain is up: now the hero is worth animating in. */
          markReady();
        };
        intro.addEventListener('transitionend', function onEnd(e) {
          if (e.target !== intro) return;
          intro.removeEventListener('transitionend', onEnd);
          done();
        });
        setTimeout(done, 700);
        intro.classList.add('is-finishing');
      }

      if (skipBtn) skipBtn.addEventListener('click', finish);
      intro.addEventListener('pointerdown', function (e) {
        if (e.target !== skipBtn) finish();
      });
      document.addEventListener('keydown', function (e) {
        if (finished) return;
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish();
      });

      if (reduceMotion) {
        welcome.classList.add('is-in');
        logo.classList.add('is-in');
        words.forEach(function (w) { w.classList.add('is-in'); });
        at(2200, finish);
        return;
      }

      at(250,  function () { welcome.classList.add('is-in'); });
      at(800,  function () { logo.classList.add('is-in'); });

      at(2400, function () {
        welcome.classList.add('is-out');
        logo.classList.add('is-out');
      });

      at(3050, function () { words[0].classList.add('is-in'); });
      at(3600, function () { words[1].classList.add('is-in'); });
      at(4150, function () { words[2].classList.add('is-in'); });

      at(5600, finish);
    }
  });
})();
