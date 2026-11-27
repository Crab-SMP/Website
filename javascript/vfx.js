(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function sfx(name, opts) { return window.CrabSFX ? window.CrabSFX.play(name, opts) : null; }

  var DPR_CAP = 2;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }
  function easeOutCubic(t) { t = 1 - t; return 1 - t * t * t; }
  function easeInCubic(t) { return t * t * t; }
  function pick(list) { return list[(Math.random() * list.length) | 0]; }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function Layer(canvas, draw, onResize) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.draw = draw;
    this.onResize = onResize;
    this.dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    this.w = 0;
    this.h = 0;
    this.onScreen = true;
    this.raf = 0;
    this.last = 0;
    this.awake = true;

    var self = this;
    this.frame = function (now) { self.step(now); };

    this.resize();
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { self.resize(); }).observe(canvas);
    } else {
      window.addEventListener('resize', function () { self.resize(); });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        self.onScreen = entries[0].isIntersecting;
        self.kick();
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () { self.kick(); });
  }

  Layer.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    if (this.onResize) this.onResize(this.w, this.h);
    this.kick();
  };

  Layer.prototype.kick = function () {
    var should = this.awake && this.onScreen && !document.hidden;
    if (should && !this.raf) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.frame);
    } else if (!should && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  };

  Layer.prototype.wake = function () { this.awake = true; this.kick(); };

  Layer.prototype.step = function (now) {
    this.raf = 0;
    var dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 1 / 60;
    this.last = now;
    var more = this.draw(dt, now);
    if (more === false) { this.awake = false; return; }
    this.kick();
  };

  Layer.prototype.snap = function (v) { return Math.round(v * this.dpr) / this.dpr; };

  var PRESETS = {
    dust: {
      density: 1 / 9500,
      colours: ['#fff4d6', '#fff4d6', '#fff4d6', '#ffe7a8', '#ffd98a'],
      sizes: [2, 2, 2, 3, 3, 4],
      rise: [5, 16],
      sway: [6, 22],
      alpha: [0.18, 0.75],
      sparkle: 0.06,
      repel: 110
    },
    embers: {
      density: 1 / 7000,
      colours: ['#f1543f', '#e23b2c', '#ff7d68', '#ffaa00', '#ffcf3a'],
      sizes: [2, 2, 3, 3, 4],
      rise: [22, 62],
      sway: [8, 26],
      alpha: [0.3, 0.9],
      sparkle: 0.03,
      repel: 90,
      fadeTop: true
    },
    ash: {
      density: 1 / 12000,
      colours: ['#8e2118', '#c0301f', '#6b1a12', '#f1543f'],
      sizes: [2, 2, 3],
      rise: [6, 18],
      sway: [10, 30],
      alpha: [0.25, 0.7],
      sparkle: 0,
      repel: 80
    },
    stars: {
      density: 1 / 5200,
      colours: ['#f5f5f6', '#f5f5f6', '#dfe6ff', '#fff4c2', '#ffcf3a'],
      sizes: [2, 2, 2, 2, 3],
      rise: [0.6, 2.4],
      sway: [0, 3],
      alpha: [0.25, 0.95],
      sparkle: 0.1,
      repel: 70
    }
  };

  function motes(canvas, presetName, options) {
    if (!canvas || reduceMotion) return null;
    var cfg = PRESETS[presetName] || PRESETS.dust;
    var opts = options || {};
    var list = [];
    var pointer = { x: -9999, y: -9999, active: false };
    var tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    var pageTop = 0;
    var pageLeft = 0;
    var t = 0;

    function spawn(p, w, h, anywhere) {
      p.z = Math.random();
      p.size = cfg.sizes[Math.min(cfg.sizes.length - 1, (p.z * cfg.sizes.length) | 0)];
      p.baseX = rand(0, w);
      p.y = anywhere ? rand(0, h) : h + rand(4, 40);
      p.vy = -lerp(cfg.rise[0], cfg.rise[1], p.z) * rand(0.8, 1.2);
      p.swayA = rand(cfg.sway[0], cfg.sway[1]);
      p.swayF = rand(0.12, 0.32);
      p.phase = rand(0, Math.PI * 2);
      p.alpha = lerp(cfg.alpha[0], cfg.alpha[1], p.z) * rand(0.7, 1);
      p.tw = rand(0.8, 2.2);
      p.rgb = hexToRgb(pick(cfg.colours));
      p.sparkle = Math.random() < cfg.sparkle;
      p.ox = 0;
      p.oy = 0;
      return p;
    }

    function fill(w, h) {
      var want = Math.round(w * h * cfg.density * (opts.scale || 1));
      want = clamp(want, 12, opts.max || 220);
      while (list.length < want) list.push(spawn({}, w, h, true));
      if (list.length > want) list.length = want;
      var r = canvas.getBoundingClientRect();
      pageTop = r.top + (window.scrollY || window.pageYOffset);
      pageLeft = r.left;
    }

    var layer = new Layer(canvas, function (dt) {
      var ctx = layer.ctx;
      var w = layer.w;
      var h = layer.h;
      t += dt;
      ctx.clearRect(0, 0, w, h);

      tilt.x += (tilt.tx - tilt.x) * (1 - Math.exp(-dt * 3));
      tilt.y += (tilt.ty - tilt.y) * (1 - Math.exp(-dt * 3));

      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        p.y += p.vy * dt;
        if (p.y < -12) spawn(p, w, h, false);

        var x = p.baseX + Math.sin(t * p.swayF * Math.PI * 2 * 0.25 + p.phase) * p.swayA;
        x += tilt.x * (6 + p.z * 22);
        var y = p.y + tilt.y * (4 + p.z * 14);

        if (pointer.active && cfg.repel) {
          var dx = x - pointer.x;
          var dy = y - pointer.y;
          var d2 = dx * dx + dy * dy;
          var r = cfg.repel;
          if (d2 < r * r && d2 > 0.01) {
            var d = Math.sqrt(d2);
            var f = (1 - d / r) * 26 * (0.4 + p.z);
            p.ox += ((dx / d) * f - p.ox) * (1 - Math.exp(-dt * 6));
            p.oy += ((dy / d) * f - p.oy) * (1 - Math.exp(-dt * 6));
          } else {
            p.ox *= Math.exp(-dt * 2.2);
            p.oy *= Math.exp(-dt * 2.2);
          }
        } else {
          p.ox *= Math.exp(-dt * 2.2);
          p.oy *= Math.exp(-dt * 2.2);
        }
        x += p.ox;
        y += p.oy;

        var a = p.alpha * (0.62 + 0.38 * Math.sin(t * p.tw + p.phase));
        if (cfg.fadeTop) a *= clamp(y / (h * 0.55), 0, 1);
        if (a <= 0.01) continue;

        var s = p.size;
        var sx = layer.snap(x);
        var sy = layer.snap(y);
        var c = p.rgb;
        if (p.sparkle) {
          var pulse = 0.5 + 0.5 * Math.sin(t * p.tw * 1.3 + p.phase);
          ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.min(1, a * 1.3).toFixed(3) + ')';
          ctx.fillRect(sx, sy, s, s);
          if (pulse > 0.35) {
            ctx.fillRect(sx - s, sy, s, s);
            ctx.fillRect(sx + s, sy, s, s);
            ctx.fillRect(sx, sy - s, s, s);
            ctx.fillRect(sx, sy + s, s, s);
          }
          if (pulse > 0.8) {
            ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a * 0.55).toFixed(3) + ')';
            ctx.fillRect(sx - s * 2, sy, s, s);
            ctx.fillRect(sx + s * 2, sy, s, s);
            ctx.fillRect(sx, sy - s * 2, s, s);
            ctx.fillRect(sx, sy + s * 2, s, s);
          }
        } else {
          ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')';
          ctx.fillRect(sx, sy, s, s);
        }
      }
      return true;
    }, fill);

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      window.addEventListener('pointermove', function (e) {
        var scrollY = window.scrollY || window.pageYOffset;
        pointer.x = e.clientX - pageLeft;
        pointer.y = e.clientY + scrollY - pageTop;
        pointer.active = pointer.y > -40 && pointer.y < layer.h + 40;
        tilt.tx = clamp(e.clientX / window.innerWidth - 0.5, -0.5, 0.5) * 2;
        tilt.ty = clamp(e.clientY / window.innerHeight - 0.5, -0.5, 0.5) * 2;
      }, { passive: true });
      document.addEventListener('pointerleave', function () { pointer.active = false; });
    }

    return layer;
  }

  var BURSTS = {
    heart:  { colours: ['#e8262a', '#ff5555', '#9f1519', '#ffc8c8'], count: 26, speed: [90, 300], up: 160, gravity: 900, life: [0.5, 1.0], sizes: [3, 4, 5] },
    gold:   { colours: ['#ffcf3a', '#fff4c2', '#ffaa00', '#ffffff'], count: 22, speed: [40, 190], up: 220, gravity: -40, life: [0.6, 1.2], sizes: [2, 3, 3, 4] },
    xp:     { colours: ['#7dea2a', '#b8ff6e', '#ffff55', '#d5ff3a'], count: 14, speed: [60, 190], up: 240, gravity: 380, life: [0.55, 0.95], sizes: [3, 4, 4, 5] },
    spark:  { colours: ['#ffffff', '#f5f5f6', '#ffd9d9'], count: 16, speed: [60, 220], up: 80, gravity: 500, life: [0.3, 0.6], sizes: [2, 3] },
    dust:   { colours: ['#6b6c74', '#45464f', '#2c2d34', '#9a9ba3'], count: 20, speed: [30, 150], up: 60, gravity: 700, life: [0.5, 0.9], sizes: [2, 3, 4] }
  };

  function burstInto(list, x, y, name, extra) {
    var b = BURSTS[name] || BURSTS.spark;
    var n = Math.round(b.count * ((extra && extra.scale) || 1));
    for (var i = 0; i < n; i++) {
      var ang = rand(0, Math.PI * 2);
      var sp = rand(b.speed[0], b.speed[1]);
      list.push({
        x: x + rand(-4, 4),
        y: y + rand(-4, 4),
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - b.up * rand(0.5, 1),
        g: b.gravity,
        life: rand(b.life[0], b.life[1]),
        age: 0,
        size: pick(b.sizes),
        rgb: hexToRgb(pick(b.colours))
      });
    }
  }

  function stepBursts(layer, list, dt) {
    var ctx = layer.ctx;
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      p.age += dt;
      if (p.age >= p.life) { list.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.vx *= Math.exp(-dt * 1.4);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      var k = p.age / p.life;
      var s = Math.max(1, Math.round(p.size * (1 - k * 0.7)));
      if (!p.css) p.css = 'rgb(' + p.rgb[0] + ',' + p.rgb[1] + ',' + p.rgb[2] + ')';
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.fillStyle = p.css;
      ctx.fillRect(layer.snap(p.x - s / 2), layer.snap(p.y - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
    return list.length > 0;
  }

  function fx(canvas) {
    if (!canvas || reduceMotion) return null;
    var list = [];
    var layer = new Layer(canvas, function (dt) {
      layer.ctx.clearRect(0, 0, layer.w, layer.h);
      return stepBursts(layer, list, dt);
    });
    layer.awake = false;
    layer.kick();
    return {
      layer: layer,
      burst: function (x, y, name, extra) {
        burstInto(list, x, y, name, extra);
        layer.wake();
      }
    };
  }

  var popLayer = null;
  var popList = [];
  function pop(clientX, clientY, name, extra) {
    if (reduceMotion) return;
    if (!popLayer) {
      var c = document.createElement('canvas');
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:320';
      document.body.appendChild(c);
      popLayer = new Layer(c, function (dt) {
        popLayer.ctx.clearRect(0, 0, popLayer.w, popLayer.h);
        return stepBursts(popLayer, popList, dt);
      });
    }
    burstInto(popList, clientX, clientY, name || 'xp', extra);
    popLayer.wake();
  }

  var TRAIL = { rate: 70, sizes: [2, 2, 4, 4, 6], spread: 0.22, behind: 0.4, drift: 10, rise: -30, life: [0.9, 1.8] };

  function mix(rgb, to, k) {
    return rgb.map(function (c) { return Math.round(lerp(c, to, k)); });
  }

  function trail(canvas, items) {
    if (!canvas || reduceMotion) return null;
    var list = [];
    var orbit = null;
    var depth = 0;
    var emitters = items.map(function (el) {
      var rgb = hexToRgb(getComputedStyle(el).getPropertyValue('--tier').trim());
      return { el: el, size: 0, carry: 0, x: 0, y: 0, colours: [rgb, rgb, mix(rgb, 255, 0.5), mix(rgb, 0, 0.35)] };
    });

    var layer = new Layer(canvas, function (dt) {
      var w = layer.w;
      var h = layer.h;
      layer.ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < emitters.length; i++) {
        var e = emitters[i];
        var m = new DOMMatrix(getComputedStyle(e.el).transform);
        var p = orbit.transformPoint(new DOMPoint(m.m41, m.m42, 0));
        var k = depth / (depth - p.z);
        var x = w / 2 + p.x * k;
        var y = h / 2 + p.y * k;
        var dx = x - e.x;
        var dy = y - e.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var back = e.size * TRAIL.behind * k / len;
        var r = e.size * TRAIL.spread * k;
        e.x = x;
        e.y = y;
        for (e.carry += TRAIL.rate * dt; e.carry >= 1; e.carry--) {
          list.push({
            x: x - dx * back + rand(-r, r),
            y: y - dy * back + rand(-r, r),
            vx: rand(-TRAIL.drift, TRAIL.drift),
            vy: rand(-TRAIL.drift, TRAIL.drift),
            g: TRAIL.rise,
            life: rand(TRAIL.life[0], TRAIL.life[1]),
            age: 0,
            size: Math.max(2, Math.round(pick(TRAIL.sizes) * k)),
            rgb: pick(e.colours)
          });
        }
      }
      stepBursts(layer, list, dt);
      return true;
    }, function () {
      orbit = new DOMMatrix(getComputedStyle(items[0].parentNode).transform);
      depth = parseFloat(getComputedStyle(canvas.parentNode).perspective);
      emitters.forEach(function (e) { e.size = e.el.offsetWidth; });
    });
    return layer;
  }

  var T = {
    resolveFrom: 1380,
    resolveTo:   1850,
    glintFrom:   1700,
    glintTo:     2450,
    tagFrom:     1880,
    tagGap:      170,
    crack:       2800,
    crackDur:    300,
    shatterDur:  1500
  };

  function intro(root, hooks) {
    hooks = hooks || {};
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    var BG = '#100f12';
    var W = 0;
    var H = 0;
    var logo = new Image();
    logo.src = root.getAttribute('data-logo') || 'media/logo.png';

    var words = ['ALL.', 'FOR.', 'YOU.'];
    var wordColours = ['#f5f5f6', '#f5f5f6', '#f1543f'];

    var L, lx, ly, cell, tagSize, tagY, wordX, wordW;
    var particles = [];
    var glintBuf = null;
    var cracks = null;
    var tiles = null;
    var debris = [];
    var snap = null;
    var origin = null;

    var start = 0;
    var crackAt = T.crack;
    var crackDur = T.crackDur;
    var shatterAt = 0;
    var shattered = false;
    var finished = false;
    var raf = 0;

    var heard = {};
    var swell = null;
    function beat(name, at, t) {
      if (heard[name] || t < at) return false;
      heard[name] = true;
      return t - at < 120;
    }

    function sizeCanvas() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
    }

    function sn(v) { return Math.round(v * dpr) / dpr; }

    function layout() {
      L = Math.round(clamp(Math.min(W, H) * 0.46, 168, 340));
      tagSize = Math.round(clamp(L * 0.15, 24, 48));
      lx = Math.round(W / 2 - L / 2);
      ly = Math.round(H / 2 - L / 2 - tagSize * 0.9);
      tagY = ly + L + Math.round(tagSize * 1.25);
      origin = { x: W / 2, y: ly + L / 2 };

      ctx.font = tagSize + 'px MinecraftTen, Mojangles, monospace';
      var gap = tagSize * 0.5;
      wordW = words.map(function (w) { return ctx.measureText(w).width; });
      var total = wordW.reduce(function (a, b) { return a + b; }, 0) + gap * (words.length - 1);
      wordX = [];
      var x = W / 2 - total / 2;
      for (var i = 0; i < words.length; i++) { wordX.push(x); x += wordW[i] + gap; }
    }

    function sample() {
      var grid = W < 700 ? 38 : 46;
      cell = Math.max(3, Math.floor(L / grid));
      var n = Math.floor(L / cell);
      var off = document.createElement('canvas');
      off.width = L;
      off.height = L;
      var octx = off.getContext('2d');
      octx.drawImage(logo, 0, 0, L, L);
      var data;
      try { data = octx.getImageData(0, 0, L, L).data; } catch (e) { data = null; }
      particles = [];
      if (!data) return;
      var reach = Math.max(W, H);
      for (var gy = 0; gy < n; gy++) {
        for (var gx = 0; gx < n; gx++) {
          var px = Math.min(L - 1, (gx * cell + cell / 2) | 0);
          var py = Math.min(L - 1, (gy * cell + cell / 2) | 0);
          var idx = (py * L + px) * 4;
          if (data[idx + 3] < 150) continue;
          var ang = rand(0, Math.PI * 2);
          var dist = reach * rand(0.55, 0.95);
          var tx = lx + gx * cell;
          var ty = ly + gy * cell;
          var fromCentre = Math.hypot(tx - (lx + L / 2), ty - (ly + L / 2)) / (L * 0.7);
          particles.push({
            tx: tx,
            ty: ty,
            sx: W / 2 + Math.cos(ang) * dist,
            sy: H / 2 + Math.sin(ang) * dist,
            delay: rand(0, 330) + fromCentre * 260,
            dur: rand(820, 1080),
            curve: rand(-1, 1) * 110,
            c: 'rgb(' + data[idx] + ',' + data[idx + 1] + ',' + data[idx + 2] + ')'
          });
        }
      }
      glintBuf = document.createElement('canvas');
      glintBuf.width = Math.round(L * dpr);
      glintBuf.height = Math.round(L * dpr);
    }

    function drawBackdrop(glow) {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      if (glow > 0) {
        var g = ctx.createRadialGradient(W / 2, ly + L / 2, 0, W / 2, ly + L / 2, L * 1.25);
        g.addColorStop(0, 'rgba(226, 59, 44, ' + (0.16 * glow).toFixed(3) + ')');
        g.addColorStop(0.55, 'rgba(226, 59, 44, ' + (0.05 * glow).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(226, 59, 44, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }

    function drawMosaic(t, alpha) {
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        var k = (t - p.delay) / p.dur;
        if (k <= 0) continue;
        k = Math.min(1, k);
        var e = easeOutExpo(k);
        var dx = p.tx - p.sx;
        var dy = p.ty - p.sy;
        var len = Math.hypot(dx, dy) || 1;
        var bend = Math.sin(Math.PI * e) * p.curve;
        var x = p.sx + dx * e + (-dy / len) * bend;
        var y = p.sy + dy * e + (dx / len) * bend;
        ctx.globalAlpha = Math.min(1, k * 5) * alpha;
        ctx.fillStyle = p.c;
        ctx.fillRect(sn(x), sn(y), cell, cell);
      }
      ctx.globalAlpha = 1;
    }

    function drawGlint(k) {
      var g = glintBuf.getContext('2d');
      var s = glintBuf.width;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, s, s);
      g.drawImage(logo, 0, 0, s, s);
      g.globalCompositeOperation = 'source-in';
      var c = lerp(-0.6, 1.6, easeOutCubic(k)) * s;
      var band = s * 0.34;
      var grad = g.createLinearGradient(c - band, -band * 0.6, c + band, band * 0.6);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.42, 'rgba(214,190,255,0.55)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.58, 'rgba(214,190,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      g.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.sin(Math.PI * k) * 0.9;
      ctx.drawImage(glintBuf, lx, ly, L, L);
      ctx.restore();
    }

    function drawTagline(t) {
      ctx.font = tagSize + 'px MinecraftTen, Mojangles, monospace';
      ctx.textBaseline = 'alphabetic';
      var shadow = Math.max(2, Math.round(tagSize * 0.08));
      for (var i = 0; i < words.length; i++) {
        var k = clamp((t - (T.tagFrom + i * T.tagGap)) / 420, 0, 1);
        if (k <= 0) continue;
        var e = easeOutCubic(k);
        var y = sn(tagY + (1 - e) * 14);
        var x = sn(wordX[i]);
        ctx.globalAlpha = e;
        ctx.fillStyle = '#000';
        ctx.fillText(words[i], x + shadow, y + shadow);
        ctx.fillStyle = wordColours[i];
        ctx.fillText(words[i], x, y);
      }
      ctx.globalAlpha = 1;
    }

    function makeCracks(o) {
      var reach = Math.hypot(Math.max(o.x, W - o.x), Math.max(o.y, H - o.y));
      var segs = [];
      var branches = 9;
      function walk(x, y, ang, length, depth, startLen) {
        var travelled = 0;
        while (travelled < length) {
          var step = rand(22, 46);
          ang += Math.random() < 0.18 ? rand(-0.6, 0.6) : rand(-0.14, 0.14);
          var nx = x + Math.cos(ang) * step;
          var ny = y + Math.sin(ang) * step;
          segs.push({ x0: x, y0: y, x1: nx, y1: ny, at: startLen + travelled, depth: depth });
          travelled += step;
          x = nx;
          y = ny;
          if (depth === 0 && Math.random() < 0.22) {
            walk(x, y, ang + (Math.random() < 0.5 ? -1 : 1) * rand(0.6, 1.1), rand(50, 150), 1, startLen + travelled);
          }
          if (x < -40 || y < -40 || x > W + 40 || y > H + 40) break;
        }
      }
      for (var i = 0; i < branches; i++) {
        walk(o.x, o.y, (i / branches) * Math.PI * 2 + rand(-0.3, 0.3), reach * rand(0.65, 1), 0, 0);
      }
      return { segs: segs, reach: reach };
    }

    function pixelLine(x0, y0, x1, y1, size) {
      var len = Math.hypot(x1 - x0, y1 - y0);
      var n = Math.max(1, Math.ceil(len / (size * 0.75)));
      for (var i = 0; i <= n; i++) {
        var k = i / n;
        var x = Math.round((x0 + (x1 - x0) * k) / size) * size;
        var y = Math.round((y0 + (y1 - y0) * k) / size) * size;
        ctx.fillRect(x, y, size, size);
      }
    }

    function drawCracks(k) {
      var shown = easeOutCubic(k) * cracks.reach;
      var base = W < 700 ? 4 : 5;
      for (var pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass === 0 ? 'rgba(255, 236, 230, 0.13)' : 'rgba(0, 0, 0, 0.94)';
        for (var i = 0; i < cracks.segs.length; i++) {
          var s = cracks.segs[i];
          if (s.at > shown) continue;
          var segLen = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
          var part = clamp((shown - s.at) / segLen, 0, 1);
          var sz = Math.max(2, base - Math.floor((s.at / cracks.reach) * 3) - (s.depth ? 1 : 0));
          var off = pass === 0 ? Math.max(1, sz - 2) : 0;
          pixelLine(s.x0 + off, s.y0 + off, s.x0 + (s.x1 - s.x0) * part + off, s.y0 + (s.y1 - s.y0) * part + off, sz);
        }
      }
    }

    function beginShatter(now) {
      shattered = true;
      shatterAt = now;
      snap = document.createElement('canvas');
      snap.width = canvas.width;
      snap.height = canvas.height;
      snap.getContext('2d').drawImage(canvas, 0, 0);

      var size = W < 700 ? 38 : 54;
      var cols = Math.ceil(W / size);
      var rows = Math.ceil(H / size);
      var maxD = Math.hypot(Math.max(origin.x, W - origin.x), Math.max(origin.y, H - origin.y));
      tiles = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var cx = c * size + size / 2;
          var cy = r * size + size / 2;
          var dx = cx - origin.x;
          var dy = cy - origin.y;
          var d = Math.hypot(dx, dy) || 1;
          var near = 1 - d / maxD;
          tiles.push({
            sx: c * size, sy: r * size, size: size,
            x: cx, y: cy,
            vx: (dx / d) * rand(80, 300) * (0.5 + near) + rand(-30, 30),
            vy: -rand(80, 300) * (0.4 + near * 0.8),
            rot: 0,
            vr: rand(-4.5, 4.5),
            delay: (d / maxD) * 360 + rand(0, 70),
            gone: false
          });
        }
      }
      for (var i = 0; i < cracks.segs.length; i += 3) {
        var s = cracks.segs[i];
        if (Math.random() < 0.5) continue;
        debris.push({
          x: s.x1, y: s.y1,
          vx: rand(-160, 160), vy: rand(-320, -60),
          size: pick([2, 3, 3, 4]),
          c: pick(['#e23b2c', '#2c2d34', '#45464f', '#f5f5f6', '#8e2118']),
          life: rand(0.6, 1.1), age: 0
        });
      }
      root.classList.add('is-shattering');
      if (swell) swell.stop(0.08);
      sfx('shatter', { x: origin.x });
      sfx('debris', { delay: 0.25 });
      if (hooks.onShatter) setTimeout(hooks.onShatter, 60);
    }

    var lastShatter = 0;
    function drawShatter(now) {
      var t = now - shatterAt;
      var dt = lastShatter ? Math.min((now - lastShatter) / 1000, 0.05) : 1 / 60;
      lastShatter = now;
      ctx.clearRect(0, 0, W, H);
      var alive = 0;
      var G = 3000;
      for (var i = 0; i < tiles.length; i++) {
        var p = tiles[i];
        if (p.gone) continue;
        alive++;
        var local = (t - p.delay) / 1000;
        var x = p.x;
        var y = p.y;
        var rot = 0;
        var scale = 1;
        var alpha = 1;
        if (local > 0) {
          x = p.x + p.vx * local;
          y = p.y + p.vy * local + 0.5 * G * local * local;
          rot = p.vr * local;
          scale = Math.max(0.25, 1 - local * 1.15);
          alpha = Math.max(0, 1 - local * 1.35);
          if (alpha <= 0 || y - p.size > H + 20) { p.gone = true; continue; }
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        if (rot) ctx.rotate(rot);
        if (scale !== 1) ctx.scale(scale, scale);
        ctx.drawImage(snap, p.sx * dpr, p.sy * dpr, p.size * dpr, p.size * dpr, -p.size / 2, -p.size / 2, p.size, p.size);
        if (local > 0) {
          ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.22, local * 0.6).toFixed(3) + ')';
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = 2;
          ctx.strokeRect(-p.size / 2 + 1, -p.size / 2 + 1, p.size - 2, p.size - 2);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      for (var j = debris.length - 1; j >= 0; j--) {
        var d = debris[j];
        d.age += dt;
        if (d.age > d.life) { debris.splice(j, 1); continue; }
        d.vy += 1400 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        ctx.globalAlpha = 1 - d.age / d.life;
        ctx.fillStyle = d.c;
        ctx.fillRect(sn(d.x), sn(d.y), d.size, d.size);
      }
      ctx.globalAlpha = 1;
      if (t < 90) {
        ctx.fillStyle = 'rgba(255,255,255,' + (0.06 * (1 - t / 90)).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      return alive > 0 && t < T.shatterDur + 700;
    }

    function frame(now) {
      raf = 0;
      if (finished) return;
      if (!start) start = now;
      var t = now - start;

      if (shattered) {
        if (drawShatter(now)) raf = requestAnimationFrame(frame);
        else finish();
        return;
      }

      var glow = clamp((t - 250) / 1300, 0, 1);
      drawBackdrop(glow);

      var shake = { x: 0, y: 0 };
      var crackK = (t - crackAt) / crackDur;
      if (crackK > 0) {
        var amp = 5 * (1 - clamp(crackK, 0, 1));
        shake.x = rand(-amp, amp);
        shake.y = rand(-amp, amp);
      }
      ctx.save();
      ctx.translate(shake.x, shake.y);

      var hand = clamp((t - T.resolveFrom) / (T.resolveTo - T.resolveFrom), 0, 1);
      if (hand < 1) drawMosaic(t, 1 - hand);
      if (hand > 0) {
        ctx.globalAlpha = hand;
        ctx.drawImage(logo, lx, ly, L, L);
        ctx.globalAlpha = 1;
      }
      var gk = (t - T.glintFrom) / (T.glintTo - T.glintFrom);
      if (gk > 0 && gk < 1 && glintBuf) drawGlint(gk);
      drawTagline(t);
      if (crackK > 0) drawCracks(clamp(crackK, 0, 1));
      ctx.restore();

      if (beat('resolve', T.resolveFrom, t)) sfx('resolve', { x: W / 2 });
      if (beat('glint', T.glintFrom, t)) sfx('glint');
      for (var w = 0; w < words.length; w++) {
        if (beat('word' + w, T.tagFrom + w * T.tagGap, t)) {
          sfx('word', { x: wordX[w] + wordW[w] / 2, last: w === words.length - 1 });
        }
      }
      if (crackK > 0 && !heard.crack) {
        heard.crack = true;
        sfx('crack', { x: origin.x });
      }

      if (crackK >= 1) beginShatter(now);
      raf = requestAnimationFrame(frame);
    }

    function finish() {
      if (finished) return;
      finished = true;
      if (swell) swell.stop(0.2);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (hooks.onDone) hooks.onDone();
    }

    function onResize() {
      if (hooks.onShatter && !shattered) hooks.onShatter();
      finish();
    }

    function skip(x, y) {
      if (finished || shattered) return;
      if (!start) {
        ready = true;
        clearTimeout(giveUp);
        if (hooks.onShatter) hooks.onShatter();
        finish();
        return;
      }
      var now = performance.now();
      var t = now - start;
      if (t >= crackAt) return;
      if (typeof x === 'number') origin = { x: x, y: y };
      start = now - Math.max(t, T.tagFrom + T.tagGap * 3 + 420);
      crackAt = now - start;
      crackDur = 170;
      cracks = makeCracks(origin);
      if (swell) swell.stop(0.1);
    }

    function begin() {
      sizeCanvas();
      layout();
      sample();
      cracks = makeCracks(origin);
      window.addEventListener('resize', onResize);
      raf = requestAnimationFrame(frame);
      swell = sfx('assemble');
    }

    var ready = false;
    var giveUp = setTimeout(function () {
      if (ready) return;
      ready = true;
      if (hooks.onShatter) hooks.onShatter();
      finish();
    }, 2500);
    var fontsReady = document.fonts && document.fonts.load
      ? document.fonts.load('40px MinecraftTen').catch(function () {})
      : Promise.resolve();
    var logoReady = logo.decode
      ? logo.decode().catch(function () {})
      : new Promise(function (res) { logo.onload = res; logo.onerror = res; });
    Promise.all([fontsReady, logoReady]).then(function () {
      if (ready) return;
      ready = true;
      clearTimeout(giveUp);
      if (!logo.naturalWidth) { if (hooks.onShatter) hooks.onShatter(); finish(); return; }
      begin();
    });

    return { skip: skip, finish: finish };
  }

  window.CrabVFX = {
    reduceMotion: reduceMotion,
    motes: motes,
    fx: fx,
    pop: pop,
    trail: trail,
    intro: intro,
    Layer: Layer
  };
})();
