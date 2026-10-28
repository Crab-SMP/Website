(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  var docEl = document.documentElement;
  var KEY = 'crab-sound';
  var WOKE = 'crab-sound-woke';
  var CLICK_SRC = 'media/audio/click.mp3';
  var MASTER = 0.8;
  var MAX_VOICES = 40;

  function noop() {}
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function storage(kind) { try { return window[kind]; } catch (e) { return null; } }
  var local = storage('localStorage');
  var session = storage('sessionStorage');
  function read(s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function write(s, k, v) {
    try { if (s) { if (v == null) s.removeItem(k); else s.setItem(k, v); } } catch (e) {}
  }

  var enabled = read(local, KEY) !== 'off';
  var activated = false;
  var ran = false;
  var ctx = null;
  var live = null;
  var clickBuf = null;

  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) {}

  var PENTA = [0, 2, 4, 7, 9];
  function freq(step) {
    step = Math.round(step);
    var k = ((step % 5) + 5) % 5;
    return 369.99 * Math.pow(2, (step - k) / 5 + PENTA[k] / 12);
  }

  function build(c, metered) {
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    var out = c.createGain();
    out.gain.value = MASTER;
    out.connect(comp);
    var meter = null;
    if (metered) {
      meter = c.createAnalyser();
      meter.fftSize = 128;
      meter.minDecibels = -80;
      meter.maxDecibels = -20;
      meter.smoothingTimeConstant = 0.5;
      comp.connect(meter);
      meter.connect(c.destination);
    } else {
      comp.connect(c.destination);
    }
    var verb = c.createConvolver();
    verb.buffer = cave(c);
    verb.connect(out);
    return { c: c, out: out, verb: verb, meter: meter, noise: whiteNoise(c) };
  }

  function cave(c) {
    var rate = c.sampleRate;
    var n = Math.floor(rate * 1.5);
    var buf = c.createBuffer(2, n, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var lp = 0;
      for (var i = 0; i < n; i++) {
        var t = i / rate;
        lp += 0.3 * (Math.random() * 2 - 1 - lp);
        d[i] = lp * Math.exp(-t * 4.2) * Math.min(1, t / 0.006);
      }
    }
    return buf;
  }

  function whiteNoise(c) {
    var n = c.sampleRate * 2;
    var buf = c.createBuffer(1, n, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function voice(bus, o, spec) {
    var c = bus.c;
    var t = c.currentTime + 0.01 + (o.delay || 0);
    var fade = c.createGain();
    fade.connect(bus.out);
    var wet = o.wet != null ? o.wet : spec.wet || 0;
    if (wet) {
      var send = c.createGain();
      send.gain.value = wet;
      fade.connect(send);
      send.connect(bus.verb);
    }
    var dest = c.createGain();
    dest.gain.value = (spec.gain == null ? 1 : spec.gain) * (o.gain == null ? 1 : o.gain);
    var pan = panOf(o);
    if (pan && c.createStereoPanner) {
      var p = c.createStereoPanner();
      p.pan.value = pan;
      dest.connect(p);
      p.connect(fade);
    } else {
      dest.connect(fade);
    }
    var semis = o.drift != null ? o.drift : spec.drift != null ? spec.drift : 0.4;
    return {
      bus: bus, c: c, t: t, o: o, dest: dest, fade: fade, pan: pan,
      p: (o.pitch || 1) * Math.pow(2, rand(-semis, semis) / 12)
    };
  }

  function panOf(o) {
    var pan = o.pan;
    if (pan == null && typeof o.x === 'number') pan = (o.x / Math.max(1, window.innerWidth)) * 2 - 1;
    return pan ? clamp(pan, -1, 1) * 0.7 : 0;
  }

  function spot(v, pan) {
    var c = v.c;
    var g = c.createGain();
    g.gain.value = v.dest.gain.value;
    g.connect(v.fade);
    if (!c.createStereoPanner) return g;
    var p = c.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(g);
    return p;
  }

  function filter(v, type, f, q) {
    var n = v.c.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q == null ? 0.7 : q;
    n.connect(v.dest);
    return n;
  }

  function shape(param, t, a, peak, d) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(0, t + a, d / 5);
  }

  function tone(v, o) {
    var c = v.c;
    var t = v.t + (o.at || 0);
    var a = o.a || 0.002;
    var osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || a + o.d));
    var g = c.createGain();
    shape(g.gain, t, a, o.g, o.d);
    osc.connect(g);
    g.connect(o.to || v.dest);
    osc.start(t);
    osc.stop(t + a + o.d * 1.5 + 0.02);
  }

  function hiss(v, o) {
    var c = v.c;
    var t = v.t + (o.at || 0);
    var a = o.a || 0.002;
    var src = c.createBufferSource();
    src.buffer = v.bus.noise;
    src.loop = true;
    var f = c.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + a + o.d);
    f.Q.value = o.q == null ? 1 : o.q;
    var g = c.createGain();
    shape(g.gain, t, a, o.g, o.d);
    src.connect(f);
    f.connect(g);
    g.connect(o.to || v.dest);
    src.start(t, rand(0, 1.8));
    src.stop(t + a + o.d * 1.5 + 0.02);
  }

  var INST = {
    harp: function (v, f, at, g) {
      tone(v, { type: 'triangle', f: f, at: at, a: 0.003, d: 0.9, g: 0.2 * g });
      tone(v, { f: f * 2, at: at, a: 0.002, d: 0.35, g: 0.07 * g });
      tone(v, { f: f * 3, at: at, a: 0.001, d: 0.12, g: 0.025 * g });
    },
    pling: function (v, f, at, g) {
      tone(v, { f: f, at: at, a: 0.002, d: 1.2, g: 0.16 * g });
      tone(v, { f: f * 2.003, at: at, a: 0.001, d: 0.55, g: 0.07 * g });
      tone(v, { f: f * 4.007, at: at, a: 0.001, d: 0.16, g: 0.035 * g });
    },
    bell: function (v, f, at, g) {
      tone(v, { f: f * 2, at: at, a: 0.001, d: 1.1, g: 0.1 * g });
      tone(v, { f: f * 5.43, at: at, a: 0.001, d: 0.3, g: 0.03 * g });
      tone(v, { f: f * 8.9, at: at, a: 0.001, d: 0.1, g: 0.012 * g });
    },
    bit: function (v, f, at, g) {
      tone(v, { type: 'square', f: f, at: at, a: 0.002, d: 0.26, g: 0.18 * g, to: filter(v, 'lowpass', 3800) });
    },
    bass: function (v, f, at, g) {
      tone(v, { type: 'triangle', f: f, at: at, a: 0.004, d: 0.55, g: 0.3 * g });
      tone(v, { f: f * 2, at: at, a: 0.002, d: 0.16, g: 0.08 * g });
    }
  };

  function brass(v, f, at, d, g) {
    var c = v.c;
    var t = v.t + at;
    var lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.8;
    lp.frequency.setValueAtTime(f * 1.2, t);
    lp.frequency.linearRampToValueAtTime(f * 6, t + 0.03);
    lp.frequency.setTargetAtTime(f * 1.8, t + 0.04, d / 3);
    lp.connect(v.dest);
    tone(v, { type: 'sawtooth', f: f, at: at, a: 0.008, d: d, g: g * 0.45, to: lp });
    tone(v, { f: f, at: at, a: 0.004, d: d, g: g });
  }

  function knock(v, at, k) {
    hiss(v, { at: at, a: 0.001, d: 0.045, g: 0.3 * k, type: 'bandpass', f: 720 * v.p, q: 2.4 });
    hiss(v, { at: at, a: 0.001, d: 0.012, g: 0.12 * k, type: 'highpass', f: 2500, q: 0.7 });
    tone(v, { at: at, f: 170 * v.p, f2: 110 * v.p, a: 0.002, d: 0.07, g: 0.28 * k });
  }

  function creak(v, at, d, f0, f1, g) {
    var c = v.c;
    var t = v.t + at;
    var body = c.createBiquadFilter();
    body.type = 'bandpass';
    body.frequency.value = 950 * v.p;
    body.Q.value = 5;
    var chop = c.createGain();
    chop.gain.value = 0.55;
    var lfo = c.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 26;
    var depth = c.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth);
    depth.connect(chop.gain);
    body.connect(chop);
    chop.connect(v.dest);
    tone(v, { type: 'sawtooth', f: f0 * v.p, f2: f1 * v.p, glide: d, at: at, a: 0.03, d: d, g: g, to: body });
    lfo.start(t);
    lfo.stop(t + d * 1.6 + 0.05);
  }

  function sparkle(v, n, from, to, low, g) {
    for (var i = 0; i < n; i++) {
      tone(v, {
        f: freq(low + Math.floor(rand(0, 6))), at: rand(from, to),
        a: 0.001, d: rand(0.05, 0.14), g: g * rand(0.4, 1), to: spot(v, rand(-0.8, 0.8))
      });
    }
  }

  var combo = { n: 0, at: 0 };

  var SOUNDS = {
    click: { len: 0.35, gain: 0.47, wet: 0.03, drift: 0.3, gap: 25, make: function (v) {
      if (clickBuf) {
        var s = v.c.createBufferSource();
        s.buffer = clickBuf;
        s.playbackRate.value = v.p;
        s.connect(v.dest);
        s.start(v.t);
        return;
      }
      hiss(v, { a: 0.001, d: 0.012, g: 0.5, type: 'bandpass', f: 3300 * v.p, q: 1.2 });
      tone(v, { type: 'triangle', f: 1500 * v.p, f2: 1100 * v.p, a: 0.001, d: 0.035, g: 0.22 });
      tone(v, { f: 190 * v.p, f2: 120 * v.p, a: 0.001, d: 0.045, g: 0.3 });
    } },

    note: { len: 1.8, gain: 0.21, wet: 0.16, drift: 0, minor: true, make: function (v) {
      (INST[v.o.inst] || INST.harp)(v, freq(v.o.step || 0) * v.p, 0, 1);
    } },

    xp: { len: 0.7, gain: 0.16, wet: 0.14, drift: 0, gap: 40,
      prepare: function (o, now) {
        combo.n = now - combo.at < 1400 ? combo.n + 1 : 0;
        combo.at = now;
        if (o.step == null) o.step = combo.n;
        if (!o.step && o.drift == null) o.drift = 1;
      },
      make: function (v) {
        var f = freq(10 + Math.min(7, v.o.step || 0)) * v.p;
        tone(v, { f: f, a: 0.001, d: 0.32, g: 0.26 });
        tone(v, { f: f * 2.76, a: 0.001, d: 0.1, g: 0.06 });
        tone(v, { f: f * 0.5, a: 0.002, d: 0.07, g: 0.05 });
      } },

    levelup: { len: 2.2, gain: 0.21, wet: 0.3, drift: 0.15, gap: 400, make: function (v) {
      [0, 2, 3, 5].forEach(function (s, i) {
        brass(v, freq(5 + s) * v.p, i * 0.075, i === 3 ? 1.1 : 0.3, i === 3 ? 0.2 : 0.15);
      });
      INST.bell(v, freq(10) * v.p, 0.225, 0.5);
    } },

    heading: { len: 1.4, gain: 0.19, wet: 0.2, drift: 0, gap: 250, make: function (v) {
      var step = v.o.step || 0;
      hiss(v, { a: 0.12, d: 0.3, g: 0.05, type: 'lowpass', f: 260, f2: 1300, q: 0.6 });
      INST.harp(v, freq(step), 0.05, 0.8);
      INST.harp(v, freq(step - 5), 0.05, 0.5);
    } },

    chat: { len: 0.25, gain: 0.25, wet: 0.04, drift: 1, gap: 60, minor: true, make: function (v) {
      tone(v, { f: 620 * v.p, f2: 880 * v.p, glide: 0.04, a: 0.002, d: 0.06, g: 0.16 });
    } },

    toast: { len: 0.6, gain: 0.46, wet: 0.1, drift: 0.6, gap: 120, make: function (v) {
      hiss(v, { a: 0.08, d: 0.2, g: 0.1, type: 'bandpass', f: 520 * v.p, f2: 2600 * v.p, q: 0.9 });
      hiss(v, { at: 0.03, a: 0.05, d: 0.14, g: 0.035, type: 'highpass', f: 5200, q: 0.5 });
    } },

    tick: { len: 0.12, gain: 0.78, drift: 0, gap: 45, minor: true, make: function (v) {
      var f = freq(8 + Math.round((v.o.k || 0) * 8));
      tone(v, { type: 'square', f: f, a: 0.001, d: 0.02, g: 0.035, to: filter(v, 'lowpass', 3500) });
    } },

    chestOpen: { len: 0.8, gain: 0.46, wet: 0.1, drift: 0.8, gap: 80, make: function (v) {
      knock(v, 0, 0.8);
      creak(v, 0.035, 0.34, 100, 150, 0.12);
    } },
    chestClose: { len: 0.7, gain: 0.42, wet: 0.12, drift: 0.8, gap: 80, make: function (v) {
      creak(v, 0, 0.16, 150, 110, 0.08);
      knock(v, 0.13, 1.1);
    } },

    on: { len: 1.6, gain: 0.2, wet: 0.2, drift: 0, make: function (v) {
      INST.pling(v, freq(5), 0, 0.8);
      INST.pling(v, freq(8), 0.09, 0.8);
    } },

    ping: { len: 1.1, gain: 0.3, wet: 0.35, drift: 0.1, gap: 300, make: function (v) {
      tone(v, { f: 1318 * v.p, a: 0.003, d: 0.32, g: 0.1 });
      tone(v, { f: 2637 * v.p, a: 0.002, d: 0.07, g: 0.025 });
    } },
    online: { len: 1.8, gain: 0.25, wet: 0.2, drift: 0, gap: 300, make: function (v) {
      INST.pling(v, freq(3), 0, 0.8);
      INST.pling(v, freq(5), 0.11, 0.9);
    } },
    offline: { len: 1.4, gain: 0.3, wet: 0.15, drift: 0, gap: 300, make: function (v) {
      INST.bass(v, freq(-5), 0, 0.9);
      INST.bass(v, freq(-7), 0.14, 0.9);
    } },
    unknown: { len: 0.6, gain: 0.29, wet: 0.1, drift: 0, gap: 300, make: function (v) {
      INST.bit(v, freq(0), 0, 0.7);
    } },

    hurt: { len: 0.4, gain: 0.32, wet: 0.06, drift: 0.8, gap: 30, make: function (v) {
      var k = Math.pow(2, -(v.o.step || 0) / 12);
      tone(v, { f: 150 * v.p, f2: 70 * v.p, glide: 0.1, a: 0.002, d: 0.14, g: 0.34 });
      hiss(v, { a: 0.001, d: 0.05, g: 0.18, type: 'bandpass', f: 850 * v.p, q: 1 });
      tone(v, { type: 'square', f: 440 * v.p * k, f2: 150 * v.p * k, glide: 0.12, a: 0.002, d: 0.12, g: 0.05, to: filter(v, 'lowpass', 2400) });
    } },
    steal: { len: 1.6, gain: 0.23, wet: 0.2, drift: 0, gap: 200, make: function (v) {
      INST.pling(v, freq(3), 0, 0.8);
      INST.pling(v, freq(5), 0.08, 0.9);
      INST.bell(v, freq(10), 0.08, 0.35);
    } },
    lose: { len: 1.4, gain: 0.34, wet: 0.14, drift: 0, gap: 200, make: function (v) {
      INST.pling(v, freq(2), 0, 0.7);
      INST.pling(v, freq(-2), 0.1, 0.7);
      hiss(v, { a: 0.02, d: 0.3, g: 0.06, type: 'bandpass', f: 1800, f2: 400, q: 0.8 });
    } },
    death: { len: 2.6, gain: 0.33, wet: 0.28, drift: 0.3, gap: 500, make: function (v) {
      tone(v, { f: 92 * v.p, f2: 32 * v.p, glide: 0.9, a: 0.004, d: 1.0, g: 0.5 });
      hiss(v, { a: 0.004, d: 0.7, g: 0.22, type: 'lowpass', f: 320, q: 0.6 });
      INST.bass(v, freq(-10), 0.02, 1);
      var dark = filter(v, 'lowpass', 420);
      tone(v, { type: 'sawtooth', f: freq(-10), at: 0.04, a: 0.08, d: 1.3, g: 0.06, to: dark });
      tone(v, { type: 'sawtooth', f: freq(-10) * 1.06, at: 0.04, a: 0.08, d: 1.3, g: 0.05, to: dark });
    } },
    beacon: { len: 2.4, gain: 0.54, wet: 0.35, drift: 0.2, gap: 500, make: function (v) {
      var c = v.c;
      var lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 2;
      lp.frequency.setValueAtTime(160, v.t);
      lp.frequency.exponentialRampToValueAtTime(1900, v.t + 0.8);
      lp.frequency.exponentialRampToValueAtTime(500, v.t + 1.8);
      lp.connect(v.dest);
      tone(v, { type: 'sawtooth', f: 55 * v.p, f2: 110 * v.p, glide: 0.8, a: 0.25, d: 1.3, g: 0.13, to: lp });
      tone(v, { type: 'sawtooth', f: 55.6 * v.p, f2: 111 * v.p, glide: 0.8, a: 0.25, d: 1.3, g: 0.13, to: lp });
      tone(v, { f: 220 * v.p, f2: 440 * v.p, glide: 0.7, a: 0.2, d: 1.0, g: 0.08 });
      hiss(v, { at: 0.2, a: 0.4, d: 0.8, g: 0.025, type: 'highpass', f: 4200, q: 0.5 });
    } },
    totem: { len: 2.4, gain: 0.41, wet: 0.36, drift: 0, gap: 500, make: function (v) {
      hiss(v, { a: 0.35, d: 0.4, g: 0.1, type: 'bandpass', f: 300, f2: 3400, q: 0.8 });
      [0, 2, 3, 5].forEach(function (s, i) { INST.pling(v, freq(s), 0.12 + i * 0.045, 0.55); });
      sparkle(v, 8, 0.2, 0.9, 12, 0.05);
    } },
    enchant: { len: 2.2, gain: 0.72, wet: 0.4, drift: 0, gap: 500, make: function (v) {
      for (var i = 0; i < 8; i++) INST.bell(v, freq(5 + i), i * 0.05, 0.3);
      hiss(v, { a: 0.2, d: 0.6, g: 0.02, type: 'highpass', f: 6000, q: 0.5 });
    } },

    assemble: { len: 2.1, gain: 0.62, wet: 0.25, drift: 0, make: function (v) {
      hiss(v, { a: 1.25, d: 0.12, g: 0.09, type: 'lowpass', f: 180, f2: 3200, q: 1.2 });
      tone(v, { f: 55, a: 1.2, d: 0.25, g: 0.16 });
      for (var i = 0; i < 44; i++) {
        var k = i / 43;
        tone(v, {
          f: freq(12 + Math.floor(rand(0, 8))), at: 0.8 + k * 0.85 + rand(-0.05, 0.05),
          a: 0.001, d: rand(0.03, 0.07), g: rand(0.012, 0.03), to: spot(v, rand(-1, 1) * (1 - k * 0.75))
        });
      }
    } },
    resolve: { len: 2.2, gain: 0.27, wet: 0.3, drift: 0, make: function (v) {
      tone(v, { f: 110, f2: 52, glide: 0.25, a: 0.003, d: 0.4, g: 0.3 });
      hiss(v, { a: 0.002, d: 0.08, g: 0.1, type: 'lowpass', f: 900, q: 0.7 });
      INST.harp(v, freq(-5), 0, 0.7);
      INST.harp(v, freq(-2), 0.02, 0.6);
      INST.harp(v, freq(0), 0.04, 0.6);
      INST.pling(v, freq(5), 0.06, 0.4);
    } },
    glint: { len: 1.6, gain: 0.9, wet: 0.35, drift: 0, make: function (v) {
      for (var i = 0; i < 10; i++) {
        var k = i / 9;
        tone(v, { f: freq(10 + i), at: k * 0.7, a: 0.001, d: 0.12, g: 0.03, to: spot(v, -0.7 + k * 1.4) });
      }
      var air = spot(v, -0.7);
      if (air.pan) {
        air.pan.setValueAtTime(-0.7, v.t);
        air.pan.linearRampToValueAtTime(0.7, v.t + 0.75);
      }
      hiss(v, { a: 0.25, d: 0.5, g: 0.03, type: 'highpass', f: 5500, q: 0.5, to: air });
    } },
    word: { len: 1.6, gain: 0.26, wet: 0.2, drift: 0.2, make: function (v) {
      var big = v.o.last;
      tone(v, { f: 98 * v.p, f2: 46 * v.p, glide: 0.22, a: 0.002, d: big ? 0.5 : 0.3, g: big ? 0.5 : 0.38 });
      hiss(v, { a: 0.001, d: 0.07, g: big ? 0.26 : 0.2, type: 'lowpass', f: 1100, q: 0.7 });
      hiss(v, { a: 0.001, d: 0.015, g: 0.09, type: 'bandpass', f: 3200, q: 1.2 });
      INST.bass(v, freq(big ? -5 : -10), 0, 0.9);
      if (big) {
        INST.pling(v, freq(5), 0.01, 0.5);
        INST.pling(v, freq(8), 0.03, 0.35);
      }
    } },
    crack: { len: 1.4, gain: 0.38, wet: 0.2, drift: 0.3, make: function (v) {
      hiss(v, { a: 0.0005, d: 0.03, g: 0.45, type: 'highpass', f: 2200, q: 0.7 });
      for (var i = 0; i < 8; i++) {
        hiss(v, {
          at: Math.pow(i / 7, 1.4) * 0.28, a: 0.0005, d: rand(0.01, 0.03), g: 0.28 * (1 - i / 9),
          type: 'bandpass', f: rand(1300, 4200), q: 3, to: spot(v, v.pan + rand(-0.4, 0.4))
        });
      }
      hiss(v, { a: 0.02, d: 0.45, g: 0.3, type: 'lowpass', f: 190, q: 0.8 });
      tone(v, { f: 48, a: 0.01, d: 0.4, g: 0.28 });
    } },
    shatter: { len: 2.6, gain: 0.45, wet: 0.3, drift: 0.2, make: function (v) {
      tone(v, { f: 78 * v.p, f2: 36 * v.p, glide: 0.5, a: 0.002, d: 0.65, g: 0.55 });
      hiss(v, { a: 0.002, d: 0.38, g: 0.36, type: 'lowpass', f: 420, q: 0.7 });
      for (var i = 0; i < 12; i++) {
        hiss(v, {
          at: rand(0, 0.2), a: 0.001, d: rand(0.03, 0.08), g: rand(0.1, 0.24),
          type: 'bandpass', f: rand(500, 2600), q: 1.5, to: spot(v, rand(-0.8, 0.8))
        });
      }
      for (var j = 0; j < 16; j++) {
        tone(v, { f: rand(2500, 7000), at: rand(0.01, 0.55), a: 0.001, d: rand(0.04, 0.2), g: rand(0.015, 0.06), to: spot(v, rand(-1, 1)) });
      }
    } },
    debris: { len: 1.8, gain: 1, wet: 0.2, drift: 0.2, make: function (v) {
      hiss(v, { a: 0.15, d: 0.9, g: 0.08, type: 'bandpass', f: 1800, f2: 280, q: 0.7 });
      for (var i = 0; i < 12; i++) {
        var k = i / 11;
        hiss(v, {
          at: 0.1 + k * k * 1.1, a: 0.001, d: 0.03, g: 0.08 * (1 - k * 0.7),
          type: 'bandpass', f: rand(700, 1600), q: 2, to: spot(v, rand(-0.9, 0.9))
        });
      }
    } }
  };

  var lastAt = {};
  var voices = 0;

  function play(name, o) {
    var spec = SOUNDS[name];
    if (!spec || !enabled || document.hidden || !ready()) return null;
    o = o || {};
    var now = Date.now();
    if (spec.gap && lastAt[name] && now - lastAt[name] < spec.gap) return null;
    if (spec.minor && voices >= MAX_VOICES) return null;
    lastAt[name] = now;
    if (spec.prepare) spec.prepare(o, now);
    if (window.__crabSfxLog) window.__crabSfxLog.push(name);
    var v = voice(live, o, spec);
    spec.make(v);
    voices++;
    setTimeout(function () {
      voices--;
      try { v.fade.disconnect(); } catch (e) {}
    }, (spec.len + (o.delay || 0)) * 1000 + 150);
    wakeMeter();
    return {
      stop: function (sec) {
        var g = v.fade.gain;
        var now2 = v.c.currentTime;
        g.cancelScheduledValues(now2);
        g.setValueAtTime(g.value, now2);
        g.linearRampToValueAtTime(0, now2 + (sec || 0.12));
      }
    };
  }

  var AIR = 0.07;
  var air = null;
  var airHush = 0;
  var airDrop = 0;

  function scroll(speed) {
    if (!enabled || document.hidden || !ctx || ctx.state !== 'running') return;
    var s = clamp((Math.abs(speed) - 600) / 5000, 0, 1);
    if (!air) {
      if (s < 0.02) return;
      air = makeAir();
    }
    var now = ctx.currentTime;
    air.level.gain.setTargetAtTime(Math.pow(s, 0.9) * AIR, now, 0.06);
    air.band.frequency.setTargetAtTime(300 + s * 1400, now, 0.08);
    clearTimeout(airHush);
    airHush = setTimeout(function () {
      if (air) air.level.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
    }, 90);
    clearTimeout(airDrop);
    airDrop = setTimeout(dropAir, 3000);
    wakeMeter();
  }

  function makeAir() {
    if (window.__crabSfxLog) window.__crabSfxLog.push('air');
    var c = ctx;
    var merge = c.createChannelMerger(2);
    var srcs = [0, 1].map(function (ch) {
      var s = c.createBufferSource();
      s.buffer = live.noise;
      s.loop = true;
      s.connect(merge, 0, ch);
      s.start(0, ch * 0.9);
      return s;
    });
    var band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.value = 300;
    var soft = c.createBiquadFilter();
    soft.type = 'lowpass';
    soft.frequency.value = 3500;
    soft.Q.value = 0.5;
    var level = c.createGain();
    level.gain.value = 0;
    merge.connect(band);
    band.connect(soft);
    soft.connect(level);
    level.connect(live.out);
    return { srcs: srcs, band: band, level: level };
  }

  function dropAir() {
    if (!air) return;
    var a = air;
    air = null;
    a.level.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    setTimeout(function () {
      a.srcs.forEach(function (s) { try { s.stop(); } catch (e) {} });
      try { a.level.disconnect(); } catch (e) {}
    }, 400);
  }

  function ready() {
    if (!ctx) {
      if (!activated) return false;
      make(true);
      if (!ctx) return false;
    }
    if (ctx.state === 'running') return true;
    if (ctx.state !== 'closed' && (activated || ran)) { resume(); return true; }
    return false;
  }

  var early = false;

  function make(inPress) {
    var c;
    try { c = new AC({ latencyHint: 'interactive' }); } catch (e) {
      try { c = new AC(); } catch (e2) { return; }
    }
    ctx = c;
    early = !inPress;
    live = build(c, true);
    c.onstatechange = function () {
      if (c === ctx && c.state === 'running') ran = true;
    };
    if (c.state === 'running') ran = true;
    if (inPress) {
      try {
        var s = c.createBufferSource();
        s.buffer = c.createBuffer(1, 1, c.sampleRate);
        s.connect(c.destination);
        s.start(0);
      } catch (e) {}
    }
  }

  function discard() {
    var old = ctx;
    ctx = null;
    live = null;
    air = null;
    bins = null;
    clearTimeout(airHush);
    clearTimeout(airDrop);
    try { if (old) old.close(); } catch (e) {}
  }

  function resume() {
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    var r = ctx.resume();
    if (r && r.catch) r.catch(noop);
  }

  var remembered = false;

  function wake() {
    activated = true;
    if (!enabled) return;
    if (!remembered) {
      remembered = true;
      write(session, WOKE, '1');
    }
    if (ctx && early && ctx.state !== 'running') discard();
    if (!ctx) make(true);
    resume();
  }

  if (location.protocol !== 'file:' && window.fetch && OAC) {
    var fetchClick = function () {
      fetch(CLICK_SRC).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.arrayBuffer();
      }).then(function (bytes) {
        var dec = new OAC(1, 1, 44100);
        return new Promise(function (res, rej) { dec.decodeAudioData(bytes, res, rej); });
      }).then(function (buf) { clickBuf = buf; }).catch(noop);
    };
    if (document.readyState === 'complete') setTimeout(fetchClick, 0);
    else window.addEventListener('load', function () { setTimeout(fetchClick, 0); });
  }

  var pool = [];
  var turn = 0;
  function elementClick() {
    if (!window.Audio) return;
    if (!pool.length) {
      for (var i = 0; i < 3; i++) {
        var el = new Audio(CLICK_SRC);
        el.preload = 'auto';
        el.volume = 0.5;
        pool.push(el);
      }
    }
    var a = pool[turn];
    turn = (turn + 1) % pool.length;
    if (window.__crabSfxLog) window.__crabSfxLog.push('click-element');
    try {
      a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = false;
      a.playbackRate = Math.pow(2, rand(-0.3, 0.3) / 12);
      a.currentTime = 0;
      var r = a.play();
      if (r && r.catch) r.catch(noop);
    } catch (e) {}
    pulse(0.7);
  }

  function click(o) {
    if (!enabled) return;
    if (clickBuf && ctx && ctx.state === 'running') play('click', o);
    else elementClick();
  }

  var PRESSABLE = 'a, button, summary, .mc-btn, [role="button"], [role="tab"], [data-sound]';

  function pressable(target) {
    if (!target || !target.closest) return null;
    var el = target.closest(PRESSABLE);
    if (!el || el.tagName === 'SUMMARY' || el.classList.contains('no-sound') || el.disabled ||
        el.getAttribute('aria-disabled') === 'true' || el.getAttribute('data-sound') === 'none') return null;
    return el;
  }

  function centreX(el) {
    var r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  }

  document.addEventListener('pointerdown', function (e) {
    wake();
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (e.button !== 0) return;
    if (pressable(e.target)) click({ x: e.clientX });
  }, true);
  document.addEventListener('pointerup', function (e) {
    wake();
    if (!e.pointerType || e.pointerType === 'mouse') return;
    if (pressable(e.target)) click({ x: e.clientX });
  }, true);
  ['mousedown', 'mouseup', 'click', 'touchend'].forEach(function (type) {
    document.addEventListener(type, wake, true);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') wake();
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    var el = pressable(e.target);
    if (!el || (e.key === ' ' && el.tagName === 'A')) return;
    click({ x: centreX(el) });
  }, true);

  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d || d.tagName !== 'DETAILS') return;
    var r = d.getBoundingClientRect();
    play(d.open ? 'chestOpen' : 'chestClose', { x: r.left + Math.min(60, r.width / 2) });
  }, true);

  document.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (document.hidden) { if (ctx.state === 'running') ctx.suspend(); }
    else if (enabled && (activated || ran)) resume();
  });

  var toggles = [];

  function setOn(on) {
    on = !!on;
    if (on === enabled) return;
    enabled = on;
    write(local, KEY, on ? null : 'off');
    docEl.classList.toggle('sound-off', !on);
    paintToggles();
    if (on) {
      wake();
      var t = toggles[0];
      play('on', t ? { x: centreX(t.btn) } : {});
    } else if (ctx && ctx.state === 'running') {
      ctx.suspend();
    }
  }

  function paintToggles() {
    toggles.forEach(function (t) {
      t.btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-sound-toggle]'), function (btn) {
    toggles.push({ btn: btn, bars: Array.prototype.slice.call(btn.querySelectorAll('.sound__bars i')), h: [] });
    btn.addEventListener('click', function () { setOn(!enabled); });
  });
  docEl.classList.toggle('sound-off', !enabled);
  paintToggles();

  var metering = 0;
  var loudAt = 0;
  var bump = 0;
  var bumpAt = 0;
  var bins = null;

  function wakeMeter() {
    if (metering || !toggles.length) return;
    loudAt = performance.now();
    metering = requestAnimationFrame(meterFrame);
  }

  function pulse(k) {
    bump = k;
    bumpAt = performance.now();
    wakeMeter();
  }

  function band(a, b) {
    var s = 0;
    for (var i = a; i < b; i++) s += bins[i];
    return s / ((b - a) * 255);
  }

  function meterFrame(now) {
    metering = 0;
    var lv = [0, 0, 0];
    var m = live && live.meter;
    if (m && ctx.state === 'running') {
      if (!bins) bins = new Uint8Array(m.frequencyBinCount);
      m.getByteFrequencyData(bins);
      lv = [band(0, 3), band(3, 10), band(10, 32)];
    }
    var b = bump * Math.max(0, 1 - (now - bumpAt) / 200);
    lv = [Math.max(lv[0], b), Math.max(lv[1], b * 0.8), Math.max(lv[2], b * 0.6)];
    if (lv[0] + lv[1] + lv[2] > 0.06) loudAt = now;
    var resting = now - loudAt > 240 || !enabled;
    toggles.forEach(function (t) {
      t.bars.forEach(function (bar, i) {
        var h = resting ? 0 : 2 + 2 * Math.round(clamp(lv[i] * 1.3, 0, 1) * 3);
        if (t.h[i] === h) return;
        t.h[i] = h;
        bar.style.transform = h ? 'scaleY(' + h / 8 + ')' : '';
      });
    });
    if (!resting) metering = requestAnimationFrame(meterFrame);
  }

  var LEAD = 0.3;
  function render(name, o, seconds) {
    var spec = SOUNDS[name];
    if (!spec || !OAC) return Promise.reject(new Error('cannot render ' + name));
    o = o || {};
    o.delay = (o.delay || 0) + LEAD;
    var c = new OAC(2, Math.ceil(44100 * (LEAD + (seconds || spec.len + 0.6))), 44100);
    var v = voice(build(c, false), o, spec);
    spec.make(v);
    return c.startRendering();
  }

  window.CrabSFX = {
    play: play,
    note: function (step, o) {
      o = o || {};
      o.step = step;
      return play('note', o);
    },
    click: click,
    scroll: scroll,
    on: function () { return enabled; },
    set: setOn,
    toggle: function () { setOn(!enabled); },
    render: render,
    names: Object.keys(SOUNDS)
  };
  window.CrabSound = { play: function () { click({}); } };

  function startEarly() {
    var policy = navigator.getAutoplayPolicy ? navigator.getAutoplayPolicy('audiocontext') : 'allowed';
    if (!enabled || ctx || !read(session, WOKE) || policy !== 'allowed') return;
    make(false);
    setTimeout(function () {
      if (ctx && early && !activated && ctx.state !== 'running') discard();
    }, 800);
  }

  if (document.prerendering) document.addEventListener('prerenderingchange', startEarly, { once: true });
  else startEarly();
})();
