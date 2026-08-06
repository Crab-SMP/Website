(function () {
  'use strict';

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

  ready(function () {
    var loading = document.getElementById('loading');
    if (loading) {
      var hideLoader = function () {
        if (loading.dataset.hidden) return;
        loading.dataset.hidden = '1';
        loading.style.transition = 'opacity 0.45s ease';
        loading.style.opacity = '0';
        setTimeout(function () { loading.style.display = 'none'; }, 480);
      };
      if (document.readyState === 'complete') setTimeout(hideLoader, 650);
      else window.addEventListener('load', function () { setTimeout(hideLoader, 650); });
      setTimeout(hideLoader, 4000);
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

    // Mouse-parallax on the hero background: the image drifts a few pixels
    // opposite the cursor so it reads as sitting behind the foreground UI.
    (function heroParallax() {
      var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var finePointer = !window.matchMedia || window.matchMedia('(pointer: fine)').matches;
      if (reduceMotion || !finePointer) return;

      var layers = document.querySelectorAll('.hero-bg-img, .vx-hero-bg');
      if (!layers.length) return;

      var STRENGTH = 16; // max px drift from center
      var EASE = 0.08;
      var targetX = 0, targetY = 0, curX = 0, curY = 0, raf = null;

      function onMove(e) {
        var hero = document.querySelector('.hero-section');
        if (!hero) return;
        var rect = hero.getBoundingClientRect();
        if (e.clientY < rect.top || e.clientY > rect.bottom) return;
        targetX = ((e.clientX - rect.left) / rect.width - 0.5) * STRENGTH;
        targetY = ((e.clientY - rect.top) / rect.height - 0.5) * STRENGTH;
        if (!raf) raf = requestAnimationFrame(tick);
      }

      function tick() {
        curX += (targetX - curX) * EASE;
        curY += (targetY - curY) * EASE;
        var transform = 'scale(1.06) translate(' + (-curX).toFixed(2) + 'px, ' + (-curY).toFixed(2) + 'px)';
        layers.forEach(function (l) { l.style.transform = transform; });
        if (Math.abs(targetX - curX) > 0.05 || Math.abs(targetY - curY) > 0.05) {
          raf = requestAnimationFrame(tick);
        } else {
          raf = null;
        }
      }

      window.addEventListener('mousemove', onMove, { passive: true });
    })();

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
    }

    var splash = document.querySelector('.hero-splash');
    if (splash) {
      var splashes = [
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

    var storeDialog = document.getElementById('store-dialog');
    if (storeDialog && storeDialog.showModal) {
      document.querySelectorAll('a[href^="https://store.crabsmp.net"]').forEach(function (link) {
        if (storeDialog.contains(link)) return;
        link.addEventListener('click', function (e) {
          e.preventDefault();
          storeDialog.showModal();
        });
      });
      storeDialog.querySelectorAll('[data-dialog-close]').forEach(function (btn) {
        btn.addEventListener('click', function () { storeDialog.close(); });
      });
      var storeGo = document.getElementById('store-dialog-go');
      if (storeGo) {
        storeGo.addEventListener('click', function () { storeDialog.close(); });
      }
      storeDialog.addEventListener('click', function (e) {
        if (e.target === storeDialog) storeDialog.close();
      });
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

    var faders = document.querySelectorAll('.fade-up');
    if (faders.length) {
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('in-view');
              io.unobserve(entry.target);
            }
          });
        }, { threshold: 0.12 });
        faders.forEach(function (el) { io.observe(el); });
      } else {
        faders.forEach(function (el) { el.classList.add('in-view'); });
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

    var INTRO_SEEN_KEY = 'crab-intro-seen';

    function introSeen() {
      try { return localStorage.getItem(INTRO_SEEN_KEY) === '1'; }
      catch (e) { return false; }
    }
    function markIntroSeen() {
      try { localStorage.setItem(INTRO_SEEN_KEY, '1'); } catch (e) {}
    }

    function resetIntro(intro) {
      intro.classList.remove('is-finishing', 'is-done');
      intro.querySelectorAll('.intro-welcome, .intro-logo, .intro-word')
        .forEach(function (n) { n.classList.remove('is-in', 'is-out'); });
    }

    function startIntro(intro) {
      markIntroSeen();
      resetIntro(intro);
      runIntro(intro);
    }

    var intro = document.getElementById('site-intro');
    if (intro) {
      var forceIntro = false;
      try { forceIntro = new URLSearchParams(location.search).get('intro') === '1'; }
      catch (e) {}

      if (forceIntro && window.history && history.replaceState) {
        history.replaceState(null, '', location.pathname + location.hash);
      }

      if (forceIntro || !introSeen()) {
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
      var docEl   = document.documentElement;
      var welcome = intro.querySelector('.intro-welcome');
      var logo    = intro.querySelector('.intro-logo');
      var words   = intro.querySelectorAll('.intro-word');
      var skipBtn = intro.querySelector('.intro-skip');
      var loader  = document.getElementById('loading');

      var reduced = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

      if (reduced) {
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
