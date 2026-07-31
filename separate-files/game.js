/* ==========================================================================
   FREEKICK: FIFA & FREEDOM
   A self-contained retro arcade free-kick game — vanilla JS, no libraries.
   --------------------------------------------------------------------------
   Unofficial fan project. Not affiliated with FIFA or any national
   football federation. All kit art is original, generated at runtime.
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. CONFIG — projection, pitch geometry, tuning
   ========================================================================== */

const CFG = {
  /* internal render resolution (upscaled by CSS with pixelated smoothing) */
  W: 480,
  H: 270,

  /* pseudo-3D camera: z is metres from the goal line, growing toward camera.
     A long lens (camera far back) keeps near sprites from dwarfing the goal. */
  CAM_Z: 80,             // camera sits 80 m from the goal line
  CAM_REF: 58,           // reference distance -> scale 1.0 at the ball
  PPM: 31.3,             // pixels per metre at scale 1.0
  LIFT: 298.2,           // camera height in pixels
  HORIZON: -68.2,        // vanishing point (above the canvas: camera looks down)

  /* pitch geometry (metres, near enough to real laws of the game) */
  BALL_Z: 22,       // free-kick spot: comfortably outside the 16.5 m box
  GOAL_HALF: 3.66,  // half of 7.32 m
  GOAL_H: 2.44,
  GOAL_DEPTH: 1.9,
  POST_T: 0.08,
  BALL_R: 0.11,
  BOX_Z: 16.5,
  SIX_Z: 5.5,
  KEEPER_Z: 0.7,
  KICKER_Z: 23.6,
  WALL_Z: 12.85,    // 9.15 m from the ball
  WALL_H: 1.72,
  WALL_HALF: 0.75,

  /* aiming limits (metres, at the goal plane) */
  AIM_X_MAX: 5.4,
  AIM_Y_MIN: 0.14,
  AIM_Y_MAX: 3.35,
  AIM_SPEED_X: 3.1,   // m per second of held key
  AIM_SPEED_Y: 1.9,

  /* how far the taker may walk the ball along the free-kick line */
  BALL_X_MAX: 7.0,
  MOVE_SPEED: 4.6,    // m per second of held arrow key

  /* power */
  CHARGE_MS: 1150,
  IDEAL_LO: 60,
  IDEAL_HI: 80,
  MIN_POWER: 12,

  /* keeper */
  DIVE_MS: 430,

  ATTEMPTS: 3,
};

const HS_KEY = 'freekick_fifa_freedom_highscores_v1';
const PREF_KEY = 'freekick_fifa_freedom_prefs_v1';

/* ==========================================================================
   2. TEAMS — original simplified retro kits, national colour families only
   ========================================================================== */

const TEAMS = [
  {
    id: 'IND', name: 'India', flag: '🇮🇳', pattern: 'sash',
    primary: '#1b53c4', secondary: '#ff9933', accent: '#138808', trim: '#ffffff',
    numberColor: '#ffffff', gk: { primary: '#ffd23f', secondary: '#1b1b2f', accent: '#e63946' },
    chant: 'BLUE TIGERS',
  },
  {
    id: 'USA', name: 'United States', flag: '🇺🇸', pattern: 'stripes',
    primary: '#1b2a63', secondary: '#e63946', accent: '#ffffff', trim: '#ffffff',
    numberColor: '#ffffff', gk: { primary: '#37d67a', secondary: '#0a0a14', accent: '#ffd23f' },
    chant: 'STARS & STRIPES',
  },
  {
    id: 'BRA', name: 'Brazil', flag: '🇧🇷', pattern: 'trim',
    primary: '#f5d90a', secondary: '#0f8a3c', accent: '#1b53c4', trim: '#0f8a3c',
    numberColor: '#0f8a3c', gk: { primary: '#5b2ecc', secondary: '#ffffff', accent: '#f5d90a' },
    chant: 'SELECAO SAMBA',
  },
  {
    id: 'ARG', name: 'Argentina', flag: '🇦🇷', pattern: 'vstripes',
    primary: '#8fd0ee', secondary: '#ffffff', accent: '#f5d90a', trim: '#0a2a5c',
    numberColor: '#0a2a5c', gk: { primary: '#17181f', secondary: '#37d67a', accent: '#ffffff' },
    chant: 'ALBICELESTE',
  },
  {
    id: 'FRA', name: 'France', flag: '🇫🇷', pattern: 'plain',
    primary: '#1e2f7a', secondary: '#ffffff', accent: '#e63946', trim: '#ffffff',
    numberColor: '#ffffff', gk: { primary: '#f5d90a', secondary: '#1b1b2f', accent: '#ffffff' },
    chant: 'LES BLEUS',
  },
  {
    id: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', pattern: 'trim',
    primary: '#f4f4f4', secondary: '#e63946', accent: '#1b53c4', trim: '#e63946',
    numberColor: '#1b2a63', gk: { primary: '#2fbf9a', secondary: '#17181f', accent: '#ffd23f' },
    chant: 'THREE LIONS',
  },
  {
    id: 'GER', name: 'Germany', flag: '🇩🇪', pattern: 'band',
    primary: '#f4f4f4', secondary: '#17181f', accent: '#e63946', trim: '#e0b425',
    numberColor: '#17181f', gk: { primary: '#2b7de0', secondary: '#f4f4f4', accent: '#17181f' },
    chant: 'DIE MANNSCHAFT',
  },
  {
    id: 'ESP', name: 'Spain', flag: '🇪🇸', pattern: 'trim',
    primary: '#c8102e', secondary: '#f5d90a', accent: '#1b1b2f', trim: '#f5d90a',
    numberColor: '#f5d90a', gk: { primary: '#37d67a', secondary: '#0a0a14', accent: '#ffffff' },
    chant: 'LA ROJA',
  },
  {
    id: 'POR', name: 'Portugal', flag: '🇵🇹', pattern: 'halfTrim',
    primary: '#c8102e', secondary: '#0f8a3c', accent: '#f5d90a', trim: '#0f8a3c',
    numberColor: '#f5d90a', gk: { primary: '#8fd0ee', secondary: '#1b1b2f', accent: '#ffffff' },
    chant: 'SELECAO DAS QUINAS',
  },
  {
    id: 'JPN', name: 'Japan', flag: '🇯🇵', pattern: 'band',
    primary: '#1b3fa0', secondary: '#ffffff', accent: '#e63946', trim: '#ffffff',
    numberColor: '#ffffff', gk: { primary: '#ff8f2f', secondary: '#1b1b2f', accent: '#ffffff' },
    chant: 'SAMURAI BLUE',
  },
  {
    id: 'MEX', name: 'Mexico', flag: '🇲🇽', pattern: 'trim',
    primary: '#0f7a44', secondary: '#ffffff', accent: '#e63946', trim: '#ffffff',
    numberColor: '#ffffff', gk: { primary: '#f5d90a', secondary: '#17181f', accent: '#e63946' },
    chant: 'EL TRI',
  },
  {
    id: 'CAN', name: 'Canada', flag: '🇨🇦', pattern: 'sash',
    primary: '#c8102e', secondary: '#ffffff', accent: '#ffffff', trim: '#ffffff',
    numberColor: '#ffffff', gk: { primary: '#2fbf9a', secondary: '#0a0a14', accent: '#ffd23f' },
    chant: 'THE REDS',
  },
];

/* Shorts and socks are stored separately and deliberately never grass-green,
   otherwise a player's legs disappear into the pitch. */
const KIT_LOWER = {
  IND: ['#f4f4f4', '#1b53c4'],
  USA: ['#f4f4f4', '#1b2a63'],
  BRA: ['#1b53c4', '#f4f4f4'],
  ARG: ['#0a2a5c', '#f4f4f4'],
  FRA: ['#f4f4f4', '#e63946'],
  ENG: ['#1b53c4', '#f4f4f4'],
  GER: ['#17181f', '#f4f4f4'],
  ESP: ['#1b2a63', '#17181f'],
  POR: ['#17181f', '#c8102e'],
  JPN: ['#1b3fa0', '#f4f4f4'],
  MEX: ['#17181f', '#f4f4f4'],
  CAN: ['#17181f', '#c8102e'],
};

TEAMS.forEach((t) => {
  const pair = KIT_LOWER[t.id] || ['#f4f4f4', '#17181f'];
  t.shorts = pair[0];
  t.socks = pair[1];
});

const teamById = (id) => TEAMS.find((t) => t.id === id) || TEAMS[0];

/* ==========================================================================
   3. UTILITIES
   ========================================================================== */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sign = (v) => (v < 0 ? -1 : 1);

const REDUCED_MOTION = (() => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
})();

/* Pseudo-3D projection ---------------------------------------------------- */

function persp(z) {
  const d = CFG.CAM_Z - z;
  return CFG.CAM_REF / (d < 2 ? 2 : d);
}

function proj(x, y, z) {
  const s = persp(z);
  return {
    x: CFG.W / 2 + x * s * CFG.PPM,
    y: CFG.HORIZON + CFG.LIFT * s - y * s * CFG.PPM,
    s,
  };
}

/* Ground y for a given depth (used for shadows / lines) */
const groundY = (z) => CFG.HORIZON + CFG.LIFT * persp(z);

/* ==========================================================================
   4. AUDIO — everything synthesised with the Web Audio API
   ========================================================================== */

/* Recorded samples (royalty-free), loaded from ./audio/ when present.
   Every trigger falls back to the synthesized retro sound if a file is
   missing or blocked, so the game still works as a single HTML file. */
const SAMPLE_DEFS = {
  cheer:      { src: 'audio/crowd-cheer.mp3',      vol: 0.75 },
  aww:        { src: 'audio/crowd-aww.mp3',        vol: 0.65 },
  whistle:    { src: 'audio/whistle.mp3',          vol: 0.45, maxDur: 1.6 },
  commentary: { src: 'audio/goal-commentary.mp3',  vol: 0.8 },
  music:      { src: 'audio/menu-music.mp3',       vol: 0.32, loop: true },
  ambience:   { src: 'audio/stadium-ambience.mp3', vol: 0.22, loop: true },
};

class RetroAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
    this._charge = null;
    this._crowdBase = null;
    this._noiseBuf = null;
    this.samples = {};
    this.unlocked = false;      // becomes true after the first user gesture
    this.scene = 'menu';        // 'menu' | 'match'
  }

  /* --- recorded-sample layer ------------------------------------------ */

  loadSamples() {
    Object.keys(SAMPLE_DEFS).forEach((name) => {
      const def = SAMPLE_DEFS[name];
      try {
        const el = new Audio();
        el.preload = 'auto';
        el.loop = !!def.loop;
        el.volume = def.vol;
        el.muted = this.muted;
        const entry = { el, def, ok: false, failed: false };
        el.addEventListener('canplaythrough', () => { entry.ok = true; }, { once: true });
        el.addEventListener('error', () => { entry.failed = true; }, { once: true });
        el.src = def.src;
        this.samples[name] = entry;
      } catch (_) { /* no HTMLAudio — synth only */ }
    });
  }

  /** try to play a sample; returns false so callers can fall back to synth */
  playSample(name, restart) {
    const s = this.samples[name];
    if (!s || s.failed || this.muted || !this.unlocked) return false;
    try {
      if (restart !== false) s.el.currentTime = 0;
      const p = s.el.play();
      if (p && p.catch) p.catch(() => {});
      if (s.def.maxDur) {
        clearTimeout(s.stopTimer);
        s.stopTimer = setTimeout(() => { s.el.pause(); }, s.def.maxDur * 1000);
      }
      return true;
    } catch (_) { return false; }
  }

  stopSample(name) {
    const s = this.samples[name];
    if (!s) return;
    try { s.el.pause(); s.el.currentTime = 0; } catch (_) {}
  }

  /** menu music vs stadium ambience, switched by the UI */
  setScene(scene) {
    this.scene = scene;
    if (!this.unlocked || this.muted) return;
    if (scene === 'match') {
      this.stopSample('music');
      this.playSample('ambience');
    } else {
      this.stopSample('ambience');
      this.playSample('music');
    }
  }

  /** called on the first pointer/key gesture — autoplay is legal now */
  onUserGesture() {
    this.resume();
    if (this.unlocked) return;
    this.unlocked = true;
    /* prime every element inside the trusted gesture (Safari needs this:
       one play() per element while the gesture is live unlocks it forever) */
    Object.keys(this.samples).forEach((k) => {
      const s = this.samples[k];
      if (s.failed || s.def.loop) return;   // loops start via setScene below
      try {
        const wasMuted = s.el.muted;
        s.el.muted = true;
        const p = s.el.play();
        const finish = () => { s.el.pause(); s.el.currentTime = 0; s.el.muted = wasMuted; };
        if (p && p.then) p.then(finish).catch(() => { s.el.muted = wasMuted; });
        else finish();
      } catch (_) {}
    });
    this.setScene(this.scene);
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.75;
      this.master.connect(this.ctx.destination);
      this._noiseBuf = this._makeNoise(2.2);
      this.ready = true;
    } catch (_) {
      this.ctx = null;
    }
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0 : 0.75, t, 0.02);
    }
    Object.keys(this.samples).forEach((k) => {
      const s = this.samples[k];
      s.el.muted = m;
      if (m && !s.def.loop) { try { s.el.pause(); } catch (_) {} }
    });
    if (!m) this.setScene(this.scene);   // resume the right background bed
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* one-shot tone with an envelope */
  tone(opts) {
    if (!this.ready || this.muted) return null;
    const o = Object.assign({
      type: 'square', freq: 440, to: null, dur: 0.12,
      gain: 0.25, attack: 0.005, delay: 0, detune: 0, sweepType: 'exp',
    }, opts);
    const t0 = this.ctx.currentTime + o.delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to !== null) {
      if (o.sweepType === 'lin') osc.frequency.linearRampToValueAtTime(o.to, t0 + o.dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    }
    if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.03);
    return osc;
  }

  /* filtered noise burst */
  noise(opts) {
    if (!this.ready || this.muted) return;
    const o = Object.assign({
      dur: 0.3, gain: 0.2, freq: 1200, q: 0.8, type: 'bandpass',
      delay: 0, sweepTo: null, attack: 0.01,
    }, opts);
    const t0 = this.ctx.currentTime + o.delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.freq, t0);
    if (o.sweepTo !== null) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.sweepTo), t0 + o.dur);
    f.Q.value = o.q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + o.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.05);
  }

  /* --- game sounds ----------------------------------------------------- */

  menuMove() { this.tone({ type: 'square', freq: 520, to: 700, dur: 0.06, gain: 0.14 }); }

  menuSelect() {
    this.tone({ type: 'square', freq: 620, dur: 0.07, gain: 0.2 });
    this.tone({ type: 'square', freq: 930, dur: 0.1, gain: 0.18, delay: 0.07 });
  }

  whistle() {
    this.tone({ type: 'triangle', freq: 2050, to: 2400, dur: 0.16, gain: 0.16 });
    this.tone({ type: 'triangle', freq: 2450, to: 2100, dur: 0.2, gain: 0.13, delay: 0.17 });
    this.noise({ freq: 2600, q: 6, dur: 0.34, gain: 0.05 });
  }

  chargeStart() {
    if (!this.ready || this.muted || this._charge) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.05);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    this._charge = { osc, g };
  }

  chargeUpdate(p) {
    if (!this._charge) return;
    const t = this.ctx.currentTime;
    this._charge.osc.frequency.setTargetAtTime(120 + p * 470, t, 0.03);
    this._charge.g.gain.setTargetAtTime(0.07 + p * 0.07, t, 0.05);
  }

  chargeStop() {
    if (!this._charge) return;
    const { osc, g } = this._charge;
    this._charge = null;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.stop(t + 0.1);
  }

  kick(power) {
    const p = clamp(power / 100, 0, 1);
    this.noise({ freq: 900 + p * 900, q: 1.1, dur: 0.1, gain: 0.26 + p * 0.14, sweepTo: 180 });
    this.tone({ type: 'square', freq: 200 + p * 150, to: 60, dur: 0.14, gain: 0.22 });
  }

  post() {
    this.tone({ type: 'square', freq: 1180, to: 620, dur: 0.2, gain: 0.3 });
    this.tone({ type: 'triangle', freq: 2360, to: 1500, dur: 0.16, gain: 0.14 });
    this.noise({ freq: 3000, q: 4, dur: 0.14, gain: 0.1 });
  }

  crossbar() {
    this.tone({ type: 'square', freq: 900, to: 480, dur: 0.26, gain: 0.3 });
    this.tone({ type: 'triangle', freq: 1800, to: 1200, dur: 0.2, gain: 0.13 });
  }

  save() {
    this.noise({ freq: 480, q: 1.2, dur: 0.22, gain: 0.24, sweepTo: 140 });
    this.tone({ type: 'square', freq: 300, to: 150, dur: 0.16, gain: 0.16 });
  }

  netSwish() { this.noise({ freq: 2400, q: 0.7, dur: 0.3, gain: 0.16, sweepTo: 500 }); }

  goal() {
    this.netSwish();
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => {
      this.tone({ type: 'square', freq: f, dur: 0.16, gain: 0.2, delay: 0.05 + i * 0.085 });
      this.tone({ type: 'triangle', freq: f * 2, dur: 0.12, gain: 0.08, delay: 0.05 + i * 0.085 });
    });
  }

  crowdCheer(strength) {
    const s = clamp(strength, 0.2, 1);
    this.noise({ freq: 700, q: 0.5, dur: 1.5 * s + 0.5, gain: 0.1 + 0.14 * s, attack: 0.14, sweepTo: 1400 });
    this.noise({ freq: 240, q: 0.4, dur: 1.2, gain: 0.06 * s, attack: 0.2 });
  }

  crowdGroan() {
    this.noise({ freq: 320, q: 0.5, dur: 0.85, gain: 0.11, attack: 0.16, sweepTo: 150 });
  }

  firework() {
    this.tone({ type: 'sine', freq: 200, to: 1400, dur: 0.22, gain: 0.07 });
    this.noise({ freq: 2200, q: 0.6, dur: 0.5, gain: 0.15, sweepTo: 300, delay: 0.2, attack: 0.005 });
  }

  fanfare(good) {
    const seq = good
      ? [392, 523, 659, 784, 1046, 1318]
      : [392, 349, 311, 262];
    seq.forEach((f, i) => {
      this.tone({ type: 'square', freq: f, dur: 0.2, gain: 0.19, delay: i * 0.13 });
      this.tone({ type: 'triangle', freq: f / 2, dur: 0.24, gain: 0.1, delay: i * 0.13 });
    });
  }

  error() { this.tone({ type: 'square', freq: 200, to: 120, dur: 0.16, gain: 0.2 }); }
}

const AUDIO = new RetroAudio();

/* ==========================================================================
   5. HIGH-SCORE STORAGE
   ========================================================================== */

class HighScores {
  constructor(key, limit) {
    this.key = key;
    this.limit = limit || 10;
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter((r) => r && typeof r.score === 'number').slice(0, 50);
    } catch (_) {
      return [];
    }
  }

  save(list) {
    try { localStorage.setItem(this.key, JSON.stringify(list.slice(0, this.limit))); }
    catch (_) { /* storage blocked (private mode) — scores just won't persist */ }
  }

  /** returns { rank, table } — rank is 1-based, or -1 if it missed the table */
  add(entry) {
    const list = this.load();
    const row = {
      id: 'r' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
      name: String(entry.name || 'PLAYER').slice(0, 14),
      team: entry.team,
      teamName: entry.teamName,
      score: Math.round(entry.score),
      goals: entry.goals,
      attempts: entry.attempts,
      date: entry.date,
    };
    list.push(row);
    list.sort((a, b) => (b.score - a.score) || (b.goals - a.goals));
    const trimmed = list.slice(0, this.limit);
    this.save(trimmed);
    const idx = trimmed.findIndex((r) => r.id === row.id);
    return { rank: idx < 0 ? -1 : idx + 1, table: trimmed, id: row.id };
  }

  clear() { this.save([]); }
}

const HS = new HighScores(HS_KEY, 10);

/* Small prefs store (mute + last player/team) ---------------------------- */

const Prefs = {
  read() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; }
    catch (_) { return {}; }
  },
  write(obj) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(obj)); } catch (_) {}
  },
  merge(patch) { this.write(Object.assign(this.read(), patch)); },
};

/* ==========================================================================
   6. JERSEY ART — original pixel kits drawn procedurally
   ========================================================================== */

/**
 * Draws a chunky pixel-art jersey on a canvas. Pure geometry, no assets.
 * Grid is 24 x 24 "pixels" scaled to fill the canvas.
 */
function drawJersey(canvas, team, number) {
  const ctx = canvas.getContext('2d');
  const GRID = 24;
  const px = Math.floor(Math.min(canvas.width, canvas.height) / GRID);
  const ox = Math.floor((canvas.width - px * GRID) / 2);
  const oy = Math.floor((canvas.height - px * GRID) / 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const P = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x * px, oy + y * px, w * px, h * px);
  };

  /* backdrop grid for the retro "sprite sheet" feel */
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if ((x + y) % 2 === 0) P(x, y, 1, 1, '#141430');
    }
  }

  const body = { x: 6, y: 5, w: 12, h: 13 };

  /* sleeves */
  P(3, 5, 3, 5, team.secondary);
  P(18, 5, 3, 5, team.secondary);
  /* torso base */
  P(body.x, body.y, body.w, body.h, team.primary);

  /* pattern */
  switch (team.pattern) {
    case 'vstripes':
      for (let i = 0; i < 6; i++) P(body.x + i * 2, body.y, 1, body.h, team.secondary);
      break;
    case 'stripes':
      for (let i = 0; i < 4; i++) P(body.x, body.y + 2 + i * 3, body.w, 1, team.secondary);
      break;
    case 'sash':
      for (let i = 0; i < 12; i++) {
        const yy = body.y + Math.floor(i * (body.h - 3) / 11);
        P(body.x + i, yy, 2, 2, team.secondary);
      }
      P(body.x, body.y + body.h - 2, body.w, 2, team.accent);
      break;
    case 'band':
      P(body.x, body.y + 5, body.w, 2, team.secondary);
      P(body.x, body.y + 7, body.w, 1, team.accent);
      P(body.x, body.y + 8, body.w, 1, team.trim);
      break;
    case 'halfTrim':
      P(body.x, body.y, body.w, 2, team.secondary);
      P(body.x + body.w - 3, body.y, 3, body.h, team.secondary);
      break;
    case 'trim':
    default:
      P(body.x, body.y, body.w, 1, team.trim);
      P(body.x, body.y + body.h - 2, body.w, 2, team.trim);
      break;
  }

  /* collar + shoulder flashes */
  P(10, 4, 4, 2, team.trim);
  P(11, 5, 2, 1, '#0a0a14');
  P(3, 9, 3, 1, team.accent);
  P(18, 9, 3, 1, team.accent);

  /* squad number, kept low so it never fights the collar */
  ctx.fillStyle = team.numberColor;
  ctx.font = 'bold ' + (px * 5) + 'px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), ox + 12 * px, oy + 12.5 * px);

  /* chunky outlines */
  ctx.strokeStyle = '#0a0a14';
  ctx.lineWidth = px;
  ctx.strokeRect(ox + body.x * px + px / 2, oy + body.y * px + px / 2, body.w * px - px, body.h * px - px);
  ctx.strokeRect(ox + 3 * px + px / 2, oy + 5 * px + px / 2, 3 * px - px, 5 * px - px);
  ctx.strokeRect(ox + 18 * px + px / 2, oy + 5 * px + px / 2, 3 * px - px, 5 * px - px);

  /* shorts + socks below the shirt */
  const shortCol = team.shorts || '#f4f4f4';
  P(7, 18, 10, 5, shortCol);
  P(7, 18, 10, 1, team.primary);
  P(11, 18, 2, 5, team.accent);
  ctx.strokeRect(ox + 7 * px + px / 2, oy + 18 * px + px / 2, 10 * px - px, 5 * px - px);
}

/* ==========================================================================
   7. BALL — arcade flight along a scripted arc, then free physics
   ========================================================================== */

class Ball {
  constructor() { this.reset(); }

  reset() {
    this.x = 0;
    this.y = CFG.BALL_R;
    this.z = CFG.BALL_Z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.mode = 'idle';        // idle | flight | free | stopped
    this.t = 0;
    this.dur = 1;
    this.shot = null;
    this.spin = 0;
    this.spinRate = 0;
    this.crossed = false;      // has it reached the goal plane?
    this.trail = [];
  }

  /**
   * Launch. `shot` carries impact point, arc, curve and duration.
   */
  launch(shot) {
    this.shot = shot;
    this.mode = 'flight';
    this.t = 0;
    this.dur = shot.duration;
    this.crossed = false;
    this.spinRate = 9 + shot.power / 100 * 16;
    this.trail.length = 0;
  }

  /** analytic position along the scripted arc, t in 0..1 */
  sample(t) {
    const s = this.shot;
    const tt = clamp(t, 0, 1.4);
    const z = CFG.BALL_Z * (1 - tt);
    const curveOff = s.curve * Math.sin(Math.PI * clamp(tt, 0, 1));
    const x = lerp(s.startX || 0, s.impactX, tt) + curveOff;
    const arc = s.arc * Math.sin(Math.PI * Math.pow(clamp(tt, 0, 1), 0.92));
    const y = lerp(CFG.BALL_R, s.impactY, tt) + arc;
    return { x, y, z };
  }

  update(dt) {
    this.spin += this.spinRate * dt;

    if (this.mode === 'flight') {
      this.t += dt / this.dur;
      const p = this.sample(this.t);
      this.x = p.x; this.y = p.y; this.z = p.z;
      if (this.y < CFG.BALL_R) this.y = CFG.BALL_R;
    } else if (this.mode === 'free') {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      this.vy -= 13.5 * dt;
      this.vx *= (1 - 0.55 * dt);
      this.vz *= (1 - 0.55 * dt);
      if (this.y <= CFG.BALL_R) {
        this.y = CFG.BALL_R;
        if (Math.abs(this.vy) > 0.7) {
          this.vy = -this.vy * 0.42;
          this.vx *= 0.78;
          this.vz *= 0.78;
          this.spinRate *= 0.7;
          return 'bounce';
        }
        this.vy = 0;
        this.vx *= (1 - 2.2 * dt);
        this.vz *= (1 - 2.2 * dt);
        if (Math.abs(this.vx) + Math.abs(this.vz) < 0.35) this.mode = 'stopped';
      }
    }

    /* motion trail */
    if (this.mode === 'flight' || this.mode === 'free') {
      this.trail.push({ x: this.x, y: this.y, z: this.z });
      if (this.trail.length > 9) this.trail.shift();
    }
    return null;
  }

  /** convert the scripted arc's instantaneous velocity into free physics */
  goFree() {
    const t = clamp(this.t, 0, 1);
    const h = 0.02;
    const a = this.sample(Math.max(0, t - h));
    const b = this.sample(t + h);
    const inv = 1 / (2 * h * this.dur);
    this.vx = (b.x - a.x) * inv;
    this.vy = (b.y - a.y) * inv;
    this.vz = (b.z - a.z) * inv;
    this.mode = 'free';
  }

  get scale() { return persp(this.z); }
  get radiusPx() { return Math.max(2, CFG.BALL_R * this.scale * CFG.PPM); }
}

/* ==========================================================================
   8. GOALKEEPER — sway, read the shot, dive, react late sometimes
   ========================================================================== */

const KEEPER_POSES = ['idle', 'ready', 'diveLeft', 'diveRight', 'jump', 'catch', 'deflect', 'beaten', 'celebrate'];

class Keeper {
  constructor() { this.reset(); }

  reset() {
    this.x = 0;
    this.z = CFG.KEEPER_Z;
    this.pose = 'idle';
    this.swayT = Math.random() * 6;
    this.baseX = 0;
    this.plan = null;
    this.timer = 0;
    this.diveP = 0;
    this.dir = 0;
    this.armY = 1.0;
    this.celebT = 0;
    this.eased = 0;
    this.result = null;
  }

  setReady() { this.pose = 'ready'; }

  /** idle / pre-kick sway */
  updateIdle(dt) {
    this.swayT += dt;
    /* quantised to 8 fps for the limited-animation retro feel */
    const q = Math.floor(this.swayT * 8) / 8;
    this.baseX = Math.sin(q * 1.7) * 0.42 + Math.sin(q * 0.63) * 0.16;
    this.x = this.baseX;
    this.diveP = 0;
    this.dir = 0;
  }

  /**
   * Decide the dive the instant the ball is struck.
   * impact = final ball position at the goal plane; power 0..100.
   */
  decide(impact, power) {
    const pn = clamp(power / 100, 0, 1);
    const ax = Math.abs(impact.x);
    const cornerness = clamp((ax - 1.0) / 2.6, 0, 1);
    const trulyHigh = impact.y > 1.28;

    /* how well the keeper reads it: corners + pace make it much harder */
    this.pn = pn;
    let read = 0.78 - 0.30 * cornerness - 0.38 * pn + rand(-0.10, 0.12);
    read = clamp(read, 0.05, 0.95);
    const readsIt = Math.random() < read;

    let dir, type;
    if (readsIt) {
      dir = ax < 0.9 ? 0 : sign(impact.x);
      type = dir === 0 ? (trulyHigh ? 'jump' : 'stay') : (trulyHigh ? 'diveHigh' : 'diveLow');
    } else {
      const r = Math.random();
      if (r < 0.18) { dir = 0; type = Math.random() < 0.5 ? 'stay' : 'jump'; }
      else {
        dir = Math.random() < 0.5 ? -1 : 1;
        type = Math.random() < 0.55 ? 'diveLow' : 'diveHigh';
      }
    }

    const late = Math.random() < 0.14;
    this.plan = {
      dir, type, readsIt, late,
      reaction: rand(0.07, 0.24) + (late ? rand(0.18, 0.30) : 0),
      diveDur: CFG.DIVE_MS / 1000 * rand(0.92, 1.1),
      startX: this.baseX,
    };
    this.timer = 0;
    return this.plan;
  }

  /** run the dive animation while the ball is airborne */
  updateDive(dt) {
    if (!this.plan) return;
    this.timer += dt;
    const p = this.plan;
    const el = this.timer - p.reaction;
    this.diveP = clamp(el / p.diveDur, 0, 1);
    /* ease-out so the keeper snaps then stretches */
    const e = 1 - Math.pow(1 - this.diveP, 2.1);
    this.dir = p.dir;

    if (p.type === 'diveLow' || p.type === 'diveHigh') {
      const reach = p.type === 'diveLow' ? 2.95 : 2.65;
      this.x = p.startX + p.dir * e * reach * 0.72;
      this.pose = p.dir < 0 ? 'diveLeft' : 'diveRight';
      this.armY = p.type === 'diveLow' ? 0.5 : 1.7;
    } else if (p.type === 'jump') {
      this.x = p.startX;
      this.pose = 'jump';
      this.armY = 1.9;
    } else {
      this.x = p.startX + Math.sin(this.timer * 9) * 0.12 * (1 - e);
      this.pose = 'ready';
      this.armY = 1.0;
    }
    this.eased = e;
  }

  /** effective hand/body reach at the goal plane, in metres */
  reachBox() {
    const p = this.plan;
    if (!p) return { x0: this.x - 0.9, x1: this.x + 0.9, y0: 0, y1: 1.7 };
    const e = this.eased || 0;
    /* a slow ball gives the keeper extra time to adjust his hands */
    const slow = (1 - (this.pn === undefined ? 0.7 : this.pn)) * 0.30;
    if (p.type === 'stay') {
      return { x0: this.x - 0.95 - slow, x1: this.x + 0.95 + slow, y0: 0, y1: 1.78 + slow };
    }
    if (p.type === 'jump') {
      const g = 0.55 + 0.5 * e;
      return { x0: this.x - (1.05 + slow) * g, x1: this.x + (1.05 + slow) * g, y0: 0.42, y1: 0.9 + 1.6 * e };
    }
    const reach = p.type === 'diveLow' ? 2.95 : 2.65;
    const hand = p.startX + p.dir * e * reach;
    const pad = 0.52 + slow;
    const x0 = Math.min(p.startX, hand) - pad;
    const x1 = Math.max(p.startX, hand) + pad;
    if (p.type === 'diveLow') return { x0, x1, y0: 0, y1: 1.08 };
    return { x0, x1, y0: 0.72, y1: 2.36 };
  }

  /** true if the keeper gets a hand to the ball; small fumble chance */
  tryStop(bx, by) {
    const b = this.reachBox();
    const inX = bx > b.x0 && bx < b.x1;
    const inY = by > b.y0 - CFG.BALL_R && by < b.y1 + CFG.BALL_R;
    if (!(inX && inY)) return false;
    if (Math.random() > 0.93) return false;   // it squirms through his hands
    return true;
  }
}

/* ==========================================================================
   9. KICKER — the taker, with a short run-up and follow-through
   ========================================================================== */

class Kicker {
  constructor() { this.reset(); }

  reset() {
    this.pose = 'idle';
    this.z = CFG.KICKER_Z;
    this.x = -0.75;
    this.t = 0;
    this.strideT = Math.random() * 4;
  }

  setPose(p) { this.pose = p; this.t = 0; }

  update(dt) {
    this.t += dt;
    this.strideT += dt;
    if (this.pose === 'runup') {
      const k = clamp(this.t / 0.34, 0, 1);
      this.x += (0.41 / 0.34) * dt * (k < 1 ? 1 : 0);
      this.z = lerp(CFG.KICKER_Z, CFG.BALL_Z + 0.55, k);
    } else if (this.pose === 'kick' && this.t > 0.16) {
      this.pose = 'follow';
      this.t = 0;
    }
  }
}

/* ==========================================================================
   10. PARTICLES — confetti, fireworks, starbursts, sparks, net ripple
   ========================================================================== */

class Particles {
  constructor() { this.list = []; this.bursts = []; }

  clear() { this.list.length = 0; this.bursts.length = 0; }

  get budget() { return REDUCED_MOTION ? 0.35 : 1; }

  add(p) {
    if (this.list.length > 460) return;
    this.list.push(p);
  }

  spark(sx, sy, n, colors, speed) {
    n = Math.round(n * this.budget);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(speed * 0.35, speed);
      this.add({
        kind: 'spark', x: sx, y: sy,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: rand(0.25, 0.6), age: 0, g: 120,
        c: pick(colors), size: randInt(1, 2),
      });
    }
  }

  starburst(sx, sy) {
    this.add({ kind: 'star', x: sx, y: sy, life: 0.55, age: 0, r: 6, c: '#fff6d8' });
  }

  confetti(count) {
    count = Math.round(count * this.budget);
    const cols = ['#ff9933', '#ffffff', '#138808', '#1b53c4', '#e63946', '#ffd23f', '#4ea8ff'];
    for (let i = 0; i < count; i++) {
      this.add({
        kind: 'confetti',
        x: rand(0, CFG.W), y: rand(-60, -4),
        vx: rand(-14, 14), vy: rand(28, 70),
        life: rand(2.2, 4.0), age: 0,
        c: pick(cols), size: randInt(2, 3), phase: rand(0, 6.28), spin: rand(3, 9),
      });
    }
  }

  /** schedule a firework shell that explodes after a delay */
  firework(delay) {
    this.bursts.push({
      delay, t: 0,
      x: rand(CFG.W * 0.12, CFG.W * 0.88),
      y: rand(24, 96),
      c: pick([
        ['#ff9933', '#ffffff', '#138808'],
        ['#e63946', '#ffffff', '#1b53c4'],
        ['#ffd23f', '#fff6d8', '#ff7a2f'],
        ['#4ea8ff', '#ffffff', '#6cff8a'],
      ]),
      done: false,
    });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) { this.list.splice(i, 1); continue; }
      if (p.kind === 'spark') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      } else if (p.kind === 'confetti') {
        p.phase += p.spin * dt;
        p.x += p.vx * dt + Math.sin(p.phase) * 22 * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 'star') {
        p.r += 150 * dt;
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      if (b.t >= b.delay) {
        this.spark(b.x, b.y, 26, b.c, 130);
        this.starburst(b.x, b.y);
        AUDIO.firework();
        this.bursts.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    for (const p of this.list) {
      const k = 1 - p.age / p.life;
      if (p.kind === 'star') {
        ctx.save();
        ctx.globalAlpha = clamp(k, 0, 1) * 0.9;
        ctx.strokeStyle = p.c;
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r0 = p.r * 0.35, r1 = p.r;
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0);
          ctx.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1);
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      ctx.globalAlpha = k > 0.35 ? 1 : k / 0.35;
      ctx.fillStyle = p.c;
      const s = p.size || 2;
      if (p.kind === 'confetti') {
        const squash = Math.abs(Math.cos(p.phase));
        ctx.fillRect(Math.round(p.x), Math.round(p.y), s, Math.max(1, Math.round(s * squash + 1)));
      } else {
        ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
      }
      ctx.globalAlpha = 1;
    }
  }
}

/* ==========================================================================
   11. RENDERER — everything drawn with canvas primitives, no image files
   ========================================================================== */

const SKY_TOP = '#0b0f2a';
const SKY_BOT = '#1d2a52';

class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.cv.width = CFG.W;
    this.cv.height = CFG.H;
    this.ctx = this.cv.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.crowd = [];
    this.flags = [];
    this.lights = [];
    this.buildStadium(TEAMS[0]);
    this.bannerScroll = 0;
    this.netWave = 0;
    this.netHit = { x: 0, y: 0, t: 0 };
    this.shake = 0;
    this.flashT = 0;
    this.flashColor = '#ffffff';
  }

  /* ---- static stadium furniture, rebuilt when the team changes -------- */

  buildStadium(team) {
    const base = ['#e8e2cf', '#c9c2ad', '#8d8a9e', '#5c5f78', '#f0a1a8', '#f3d089', '#a7d5f5', '#b8e3bd', '#3f4260'];
    const themed = [team.primary, team.secondary, team.accent, '#ff9933', '#ffffff', '#138808', '#1b53c4', '#e63946'];
    const pool = base.concat(themed, themed);

    this.crowd = [];
    const tiers = [
      { y0: 16, y1: 56, step: 4, rowH: 5 },
      { y0: 58, y1: 88, step: 4, rowH: 5 },
      { y0: 90, y1: 111, step: 4, rowH: 5 },
    ];
    for (const t of tiers) {
      for (let y = t.y0; y < t.y1; y += t.rowH) {
        const off = (y % (t.rowH * 2) === 0) ? 0 : 2;
        for (let x = -2 + off; x < CFG.W + 2; x += t.step) {
          if (Math.random() < 0.06) continue;      // empty seats
          this.crowd.push({
            x, y,
            c: pool[Math.floor(Math.random() * pool.length)],
            phase: Math.random() * 6.283,
            rate: 0.7 + Math.random() * 0.8,
          });
        }
      }
    }

    /* waving flags along the top of the stand */
    const flagSets = [
      ['#ff9933', '#ffffff', '#138808'],           // India
      ['#e63946', '#ffffff', '#1b2a63'],           // USA
      [team.primary, team.secondary, team.accent], // player's team
      ['#ffd23f', '#ffffff', '#4ea8ff'],
    ];
    this.flags = [];
    for (let i = 0; i < 13; i++) {
      this.flags.push({
        x: 12 + i * 38 + randInt(-5, 5),
        y: randInt(20, 30),
        cols: flagSets[i % flagSets.length],
        phase: Math.random() * 6.283,
        h: randInt(9, 12),
      });
    }

    this.lights = [
      { x: 52, y: 4 }, { x: 168, y: 2 }, { x: 312, y: 2 }, { x: 428, y: 4 },
    ];
  }

  /* ---- helpers -------------------------------------------------------- */

  px(x, y, w, h, c) {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  text(str, x, y, opts) {
    const o = Object.assign({ size: 7, color: '#fff6d8', align: 'center', bold: true, shadow: '#0a0a14' }, opts);
    const ctx = this.ctx;
    ctx.font = (o.bold ? 'bold ' : '') + o.size + 'px "Courier New", monospace';
    ctx.textAlign = o.align;
    ctx.textBaseline = 'middle';
    if (o.shadow) { ctx.fillStyle = o.shadow; ctx.fillText(str, x + 1, y + 1); }
    ctx.fillStyle = o.color;
    ctx.fillText(str, x, y);
  }

  kick(amount) { if (!REDUCED_MOTION) this.shake = Math.max(this.shake, amount); }

  flash(color, dur) { this.flashColor = color; this.flashT = REDUCED_MOTION ? 0 : dur; }

  rippleNet(x, y) { this.netHit = { x, y, t: 0.6 }; }

  /* ---- stadium -------------------------------------------------------- */

  drawSky(time) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, 114);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(1, SKY_BOT);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, 114);

    /* floodlights + glow */
    for (const L of this.lights) {
      const flick = 0.82 + 0.18 * Math.sin(time * 7 + L.x);
      const rg = ctx.createRadialGradient(L.x, L.y + 6, 1, L.x, L.y + 6, 62);
      rg.addColorStop(0, 'rgba(255,252,220,' + (0.5 * flick).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,252,220,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(L.x - 62, L.y - 10, 124, 90);
      /* pylon head */
      this.px(L.x - 13, L.y, 26, 6, '#2a2a44');
      for (let i = 0; i < 5; i++) {
        this.px(L.x - 11 + i * 5, L.y + 1, 4, 4, i % 2 ? '#fffbdc' : '#fff2a8');
      }
      this.px(L.x - 1, L.y + 6, 2, 8, '#20203a');
    }
  }

  drawStands(time) {
    const ctx = this.ctx;
    /* stand shell */
    this.px(0, 12, CFG.W, 101, '#2b2b52');
    /* tier separators */
    this.px(0, 56, CFG.W, 2, '#1a1a34');
    this.px(0, 88, CFG.W, 2, '#1a1a34');
    /* roof shadow */
    const g = ctx.createLinearGradient(0, 12, 0, 40);
    g.addColorStop(0, 'rgba(0,0,0,.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 12, CFG.W, 30);

    /* crowd — limited animation, quantised to 8 fps */
    const q = Math.floor(time * 8);
    for (const p of this.crowd) {
      const bob = Math.sin(q * 0.55 * p.rate + p.phase) > 0.15 ? -1 : 0;
      this.px(p.x, p.y + bob, 3, 3, p.c);
      this.px(p.x, p.y + 3 + bob, 3, 1, 'rgba(0,0,0,.35)');
    }

    /* waving flags */
    for (const f of this.flags) {
      const w = Math.sin(time * 2.6 + f.phase);
      this.px(f.x, f.y, 1, f.h + 6, '#d8d8e8');
      const bands = f.cols.length;
      const bh = Math.max(2, Math.floor(f.h / bands));
      for (let b = 0; b < bands; b++) {
        const skew = Math.round(w * 2 + Math.sin(time * 3.4 + b) * 1.2);
        this.px(f.x + 1 + skew, f.y + b * bh, 11, bh, f.cols[b]);
      }
    }
  }

  drawBoards(time, team) {
    const ctx = this.ctx;
    /* advertising hoardings behind the goal */
    this.px(0, 113, CFG.W, 19, '#101028');
    this.px(0, 113, CFG.W, 2, '#3a3a6a');
    this.px(0, 130, CFG.W, 2, '#07070f');

    const msgs = [
      'KICKOFF 2026  —  HFI FREEDOM CUP',
      'FOOTBALL UNITES US',
      'PLAY FREE, PLAY TOGETHER',
      'KICKOFF 2026  —  HFI FREEDOM CUP',
      team.name.toUpperCase() + '  •  ' + team.chant,
    ];
    const strip = msgs.join('   ★   ') + '   ★   ';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 115, CFG.W, 15);
    ctx.clip();
    ctx.font = 'bold 8px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const wid = ctx.measureText(strip).width;
    const off = -((time * 26) % wid);
    for (let k = 0; k < 3; k++) {
      const x = off + k * wid;
      if (x > CFG.W) break;
      ctx.fillStyle = '#0a0a14';
      ctx.fillText(strip, x + 1, 123.5);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(strip, x, 122.5);
    }
    ctx.restore();

    /* flag-coloured board lighting */
    const stripes = [
      ['#ff9933', 0.00, 0.14], ['#ffffff', 0.14, 0.24], ['#138808', 0.24, 0.34],
      ['#1b2a63', 0.52, 0.66], ['#ffffff', 0.66, 0.78], ['#e63946', 0.78, 0.94],
    ];
    for (const [c, a, b] of stripes) {
      this.px(CFG.W * a, 131, CFG.W * (b - a), 2, c);
    }
  }

  drawPitch() {
    const ctx = this.ctx;
    /* grass mowing stripes, drawn as depth bands */
    /* backfill so no seam shows between the hoardings and the turf */
    ctx.fillStyle = '#256d31';
    ctx.fillRect(0, 131, CFG.W, 18);

    const bands = [];
    for (let z = -4; z <= 40; z += 2.6) bands.push(z);
    for (let i = 0; i < bands.length - 1; i++) {
      const yA = groundY(bands[i]);
      const yB = groundY(bands[i + 1]);
      const dark = i % 2 === 0;
      ctx.fillStyle = dark ? '#2a7f39' : '#33933f';
      ctx.fillRect(0, Math.round(yA), CFG.W, Math.ceil(yB - yA) + 1);
    }

    /* subtle low-res texture speckle */
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 150; i++) {
      const y = 140 + Math.random() * (CFG.H - 140);
      this.px(Math.random() * CFG.W, y, 2, 1, Math.random() < 0.5 ? '#ffffff' : '#000000');
    }
    ctx.globalAlpha = 1;

    /* --- markings --- */
    const line = 'rgba(240,255,240,.9)';
    const hline = (z, w) => {
      const y = groundY(z);
      this.px(0, y - (w || 1), CFG.W, w || 1, line);
    };
    hline(0, 2);              // goal line
    hline(CFG.SIX_Z, 1);      // six-yard box line
    hline(CFG.BOX_Z, 2);      // penalty-area line

    /* penalty spot */
    const ps = proj(0, 0, 11);
    this.px(ps.x - 1.5, ps.y - 1, 3, 2, line);

    /* free-kick line: dashed, straight through the ball */
    const fy = groundY(CFG.BALL_Z);
    for (let x = 0; x < CFG.W; x += 12) this.px(x, fy - 1, 7, 1, 'rgba(255,255,255,.55)');

    /* 9.15 m defensive arc in front of the ball */
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    let first = true;
    for (let a = -78; a <= 78; a += 6) {
      const r = a * Math.PI / 180;
      const p = proj(Math.sin(r) * 9.15, 0, CFG.BALL_Z - Math.cos(r) * 9.15);
      if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---- goal ----------------------------------------------------------- */

  drawGoalNet(time) {
    const ctx = this.ctx;
    const H = CFG.GOAL_H, GH = CFG.GOAL_HALF, D = CFG.GOAL_DEPTH;

    const fTL = proj(-GH, H, 0), fTR = proj(GH, H, 0);
    const fBL = proj(-GH, 0, 0), fBR = proj(GH, 0, 0);
    const bTL = proj(-GH, H, -D), bTR = proj(GH, H, -D);
    const bBL = proj(-GH, 0, -D), bBR = proj(GH, 0, -D);

    /* goal mouth shading */
    ctx.fillStyle = 'rgba(8,12,20,.42)';
    ctx.beginPath();
    ctx.moveTo(fTL.x, fTL.y); ctx.lineTo(fTR.x, fTR.y);
    ctx.lineTo(fBR.x, fBR.y); ctx.lineTo(fBL.x, fBL.y);
    ctx.closePath(); ctx.fill();

    /* net ripple offset */
    this.netWave = time;
    const ripple = (px2, py) => {
      if (this.netHit.t <= 0) return 0;
      const d = Math.hypot(px2 - this.netHit.x, py - this.netHit.y);
      const k = clamp(1 - d / 46, 0, 1) * (this.netHit.t / 0.6);
      return Math.sin(d * 0.45 - (0.6 - this.netHit.t) * 26) * 3.4 * k;
    };

    ctx.strokeStyle = 'rgba(232,240,255,.42)';
    ctx.lineWidth = 1;

    /* back net mesh */
    const cols = 16, rows = 8;
    for (let i = 0; i <= cols; i++) {
      const k = i / cols;
      const xTop = lerp(bTL.x, bTR.x, k), xBot = lerp(bBL.x, bBR.x, k);
      ctx.beginPath();
      for (let j = 0; j <= rows; j++) {
        const m = j / rows;
        const x = lerp(xTop, xBot, m);
        const y = lerp(lerp(bTL.y, bTR.y, k), lerp(bBL.y, bBR.y, k), m);
        const r = ripple(x, y);
        if (j === 0) ctx.moveTo(x + r, y); else ctx.lineTo(x + r, y);
      }
      ctx.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      const m = j / rows;
      ctx.beginPath();
      for (let i = 0; i <= cols; i++) {
        const k = i / cols;
        const xTop = lerp(bTL.x, bTR.x, k), xBot = lerp(bBL.x, bBR.x, k);
        const x = lerp(xTop, xBot, m);
        const y = lerp(lerp(bTL.y, bTR.y, k), lerp(bBL.y, bBR.y, k), m);
        const r = ripple(x, y);
        if (i === 0) ctx.moveTo(x + r, y); else ctx.lineTo(x + r, y);
      }
      ctx.stroke();
    }

    /* side nets */
    ctx.strokeStyle = 'rgba(232,240,255,.3)';
    for (let j = 0; j <= 5; j++) {
      const m = j / 5;
      ctx.beginPath();
      ctx.moveTo(lerp(fTL.x, fBL.x, m), lerp(fTL.y, fBL.y, m));
      ctx.lineTo(lerp(bTL.x, bBL.x, m), lerp(bTL.y, bBL.y, m));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lerp(fTR.x, fBR.x, m), lerp(fTR.y, fBR.y, m));
      ctx.lineTo(lerp(bTR.x, bBR.x, m), lerp(bTR.y, bBR.y, m));
      ctx.stroke();
    }
    /* roof net */
    for (let i = 0; i <= 6; i++) {
      const k = i / 6;
      ctx.beginPath();
      ctx.moveTo(lerp(fTL.x, fTR.x, k), lerp(fTL.y, fTR.y, k));
      ctx.lineTo(lerp(bTL.x, bTR.x, k), lerp(bTL.y, bTR.y, k));
      ctx.stroke();
    }
  }

  drawGoalFrame() {
    const GH = CFG.GOAL_HALF, H = CFG.GOAL_H;
    const tl = proj(-GH, H, 0), tr = proj(GH, H, 0);
    const bl = proj(-GH, 0, 0), br = proj(GH, 0, 0);
    const w = Math.max(2, Math.round(CFG.POST_T * persp(0) * CFG.PPM * 2.2));

    /* posts (chunky outline + highlight, retro style) */
    this.px(tl.x - w / 2 - 1, tl.y - 1, w + 2, bl.y - tl.y + 2, '#0a0a14');
    this.px(tr.x - w / 2 - 1, tr.y - 1, w + 2, br.y - tr.y + 2, '#0a0a14');
    this.px(tl.x - w / 2, tl.y, w, bl.y - tl.y, '#ffffff');
    this.px(tr.x - w / 2, tr.y, w, br.y - tr.y, '#ffffff');
    this.px(tl.x - w / 2, tl.y, 1, bl.y - tl.y, '#c9d4e8');
    this.px(tr.x + w / 2 - 1, tr.y, 1, br.y - tr.y, '#c9d4e8');
    /* crossbar */
    this.px(tl.x - w / 2 - 1, tl.y - w / 2 - 1, tr.x - tl.x + w + 2, w + 2, '#0a0a14');
    this.px(tl.x - w / 2, tl.y - w / 2, tr.x - tl.x + w, w, '#ffffff');
    this.px(tl.x - w / 2, tl.y + w / 2 - 1, tr.x - tl.x + w, 1, '#b9c4d8');
  }

  /* ---- sprites -------------------------------------------------------- */

  /** shadow ellipse on the grass */
  shadow(x, z, scaleW) {
    const p = proj(x, 0, z);
    const s = p.s;
    const w = (scaleW || 0.55) * s * CFG.PPM;
    const h = Math.max(1.2, w * 0.34);
    this.ctx.fillStyle = 'rgba(0,0,0,.32)';
    this.ctx.beginPath();
    this.ctx.ellipse(p.x, p.y, w, h, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /**
   * Pixel footballer. Drawn in a 16-wide x 26-tall local grid, then scaled.
   * pose: idle | ready | runup | kick | follow | celebrate | dejected | wall
   */
  drawPlayer(x, z, kit, pose, t, flip) {
    const p = proj(x, 0, z);
    const s = p.s;
    /* the sprite grid spans rows 6..27; 21 rows === 1.82 m */
    const BASE = 6, ROWS = 21;
    const unit = (1.82 * s * CFG.PPM) / ROWS;
    if (unit < 0.35) return;
    const dir = flip ? -1 : 1;

    /* gy counts UPWARD from the boots, so a rect's top edge is gy + gh */
    const P = (gx, gy, gw, gh, c) => {
      const left = p.x + (gx - 8) * unit * dir - (dir < 0 ? gw * unit : 0);
      this.px(left, p.y - (gy - BASE + gh) * unit, gw * unit, gh * unit, c);
    };
    const OUT = '#0a0a14';
    const skin = kit.skin || '#c98a5a';

    /* animation frame (limited, 8 fps) */
    const f = Math.floor(t * 8) % 4;
    let legL = 0, legR = 0, armL = 0, armR = 0, lean = 0, bodyY = 0, headY = 0;

    switch (pose) {
      case 'runup':
        legL = f === 0 ? -3 : f === 1 ? 0 : f === 2 ? 3 : 0;
        legR = -legL; armL = -legL; armR = legL; lean = 1;
        break;
      case 'kick':
        legL = 6; legR = -2; armL = -4; armR = 3; lean = 2; bodyY = -1;
        break;
      case 'follow':
        legL = 4; legR = -1; armL = -3; armR = 4; lean = 3;
        break;
      case 'celebrate':
        armL = -7; armR = -7; bodyY = f % 2 === 0 ? -2 : 0; headY = -1;
        break;
      case 'dejected':
        armL = 2; armR = 2; bodyY = 1; headY = 1; lean = -1;
        break;
      case 'wall':
        armL = 1; armR = 1; legL = -1; legR = 1;
        break;
      case 'ready':
        legL = -1; legR = 1; armL = -1; armR = 1;
        bodyY = f === 1 || f === 3 ? -1 : 0;
        break;
      default:
        bodyY = f === 2 ? -1 : 0;
    }

    /* legs (shorts colour then skin) */
    P(5, 8 + legL * 0.5, 3, 8 - Math.abs(legL) * 0.2, skin);
    P(8, 8 + legR * 0.5, 3, 8 - Math.abs(legR) * 0.2, skin);
    P(5, 12, 3, 5, kit.shorts);
    P(8, 12, 3, 5, kit.shorts);
    /* boots */
    P(4, 6 + legL * 0.5, 4, 2, '#17181f');
    P(8, 6 + legR * 0.5, 4, 2, '#17181f');
    /* socks */
    P(5, 8 + legL * 0.5, 3, 3, kit.socks);
    P(8, 8 + legR * 0.5, 3, 3, kit.socks);

    /* torso */
    P(4, 16 + bodyY + lean * 0.2, 8, 7, kit.shirt);
    /* torso pattern accents */
    if (kit.pattern === 'vstripes') {
      for (let i = 0; i < 4; i++) P(4 + i * 2, 16 + bodyY, 1, 7, kit.shirt2);
    } else if (kit.pattern === 'stripes' || kit.pattern === 'band') {
      P(4, 19 + bodyY, 8, 1, kit.shirt2);
      P(4, 21 + bodyY, 8, 1, kit.accent);
    } else if (kit.pattern === 'sash') {
      P(4, 16 + bodyY, 2, 2, kit.shirt2);
      P(6, 18 + bodyY, 2, 2, kit.shirt2);
      P(8, 20 + bodyY, 2, 2, kit.shirt2);
      P(10, 21 + bodyY, 2, 2, kit.shirt2);
    } else {
      P(4, 22 + bodyY, 8, 1, kit.shirt2);
    }
    /* arms */
    P(2, 17 + bodyY + armL, 2, 6, kit.shirt2);
    P(12, 17 + bodyY + armR, 2, 6, kit.shirt2);
    P(2, 15 + bodyY + armL, 2, 2, skin);
    P(12, 15 + bodyY + armR, 2, 2, skin);

    /* head */
    P(6, 23 + bodyY + headY, 4, 4, skin);
    P(6, 26 + bodyY + headY, 4, 1, kit.hair || '#241a12');
    P(6, 25 + bodyY + headY, 1, 1, kit.hair || '#241a12');
    P(9, 25 + bodyY + headY, 1, 1, kit.hair || '#241a12');
    /* eye dot */
    P(8, 24 + bodyY + headY, 1, 1, OUT);
  }

  /**
   * Goalkeeper sprite with distinct poses (idle/ready/dive/jump/catch/etc).
   */
  drawKeeper(k, kit, t) {
    const p = proj(k.x, 0, k.z);
    const s = p.s;
    const BASE = 0, ROWS = 21;
    const unit = (1.88 * s * CFG.PPM) / ROWS;
    if (unit < 0.35) return;
    const skin = '#d09a68';
    const glove = '#f4f4f4';
    const gloveHot = k.result === 'catch' ? '#6cff8a' : k.result === 'deflect' ? '#8fd0ee' : glove;
    const f = Math.floor(t * 8) % 4;
    const pose = k.pose;
    const e = k.eased || 0;

    /* gy counts upward from the boots; mirrored horizontally by `d` */
    const P = (gx, gy, gw, gh, c, d) => {
      const m = d || 1;
      const left = p.x + (gx - 8) * unit * m - (m < 0 ? gw * unit : 0);
      this.px(left, p.y - (gy - BASE + gh) * unit, gw * unit, gh * unit, c);
    };

    /* ---- airborne / sprawled: a genuinely horizontal keeper ---- */
    const isDive = pose === 'diveLeft' || pose === 'diveRight';
    if (isDive || pose === 'beaten') {
      const d = pose === 'beaten' ? (k.dir || 1) : (pose === 'diveLeft' ? -1 : 1);
      const high = isDive && k.plan && k.plan.type === 'diveHigh';
      /* height of the body above the turf */
      const h = pose === 'beaten' ? 1 : (high ? 2 + 8 * e : 1 + 3.2 * e);
      /* trailing legs */
      P(1, h, 5, 3, kit.socks, d);
      P(0, h, 2, 3, '#17181f', d);
      P(5, h - 0.4, 4, 4, kit.shorts, d);
      /* torso */
      P(8, h, 7, 5, kit.shirt, d);
      P(8, h + 3, 7, 1, kit.shirt2, d);
      P(8, h, 7, 1, kit.accent, d);
      /* head, tucked forward */
      P(14, h + 3, 4, 4, skin, d);
      P(14, h + 6, 4, 1, '#1d1710', d);
      P(17, h + 4, 1, 1, '#0a0a14', d);
      /* outstretched arms + gloves — the part that reaches the ball */
      const stretch = 4 + 4 * e;
      P(15, h + 1, stretch, 2, kit.shirt2, d);
      P(15 + stretch, h + 1, 3, 3, gloveHot, d);
      P(15 + stretch, h + 1, 3, 1, '#c8ccd8', d);
      return;
    }

    /* ---- upright poses: idle / ready / jump / catch / deflect / celebrate ---- */
    let lift = 0, spread = 0, armUp = 0;
    if (pose === 'jump') { lift = e * 6; armUp = 6; spread = 1; }
    else if (pose === 'catch') { armUp = 3; }
    else if (pose === 'deflect') { armUp = 5; spread = 2; }
    else if (pose === 'celebrate') { armUp = 7; lift = f % 2 === 0 ? 1.5 : 0; spread = 3; }
    else if (pose === 'ready') { spread = 2; armUp = (f === 1 || f === 3 ? 1 : 0); }
    else { armUp = f === 2 ? 1 : 0; }

    const yb = lift;

    /* boots + legs */
    P(4 - spread * 0.4, yb, 4, 2, '#17181f');
    P(8 + spread * 0.4, yb, 4, 2, '#17181f');
    P(5 - spread * 0.4, yb + 2, 3, 4, kit.socks);
    P(8 + spread * 0.4, yb + 2, 3, 4, kit.socks);
    P(5 - spread * 0.3, yb + 5, 3, 5, kit.shorts);
    P(8 + spread * 0.3, yb + 5, 3, 5, kit.shorts);

    /* torso */
    P(4, yb + 9, 8, 8, kit.shirt);
    P(4, yb + 12, 8, 1, kit.shirt2);
    P(4, yb + 9, 8, 1, kit.accent);

    /* arms + gloves */
    const armBase = yb + 11 + armUp;
    P(2, armBase, 2, 5, kit.shirt2);
    P(12, armBase, 2, 5, kit.shirt2);
    P(1, armBase + 4, 3, 3, gloveHot);
    P(12, armBase + 4, 3, 3, gloveHot);

    /* head */
    P(6, yb + 17, 4, 4, skin);
    P(6, yb + 20, 4, 1, '#1d1710');
    P(8, yb + 18, 1, 1, '#0a0a14');
  }

  /* ---- ball ----------------------------------------------------------- */

  drawBall(ball) {
    const ctx = this.ctx;
    /* trail */
    for (let i = 0; i < ball.trail.length; i++) {
      const tp = ball.trail[i];
      const q = proj(tp.x, tp.y, tp.z);
      const r = Math.max(1, CFG.BALL_R * q.s * CFG.PPM * (0.4 + 0.5 * i / ball.trail.length));
      ctx.globalAlpha = 0.10 + 0.16 * (i / ball.trail.length);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ground shadow */
    const gp = proj(ball.x, 0, ball.z);
    const gs = gp.s;
    const lift = clamp((ball.y - CFG.BALL_R) / 2.6, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.34 * (1 - lift * 0.7)).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(gp.x, gp.y, Math.max(1.4, 0.24 * gs * CFG.PPM * (1 - lift * 0.35)),
      Math.max(0.8, 0.09 * gs * CFG.PPM), 0, 0, Math.PI * 2);
    ctx.fill();

    /* the ball itself */
    const p = proj(ball.x, ball.y, ball.z);
    const r = ball.radiusPx;
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    /* rotating pentagon spots */
    const spots = 3;
    for (let i = 0; i < spots; i++) {
      const a = ball.spin + i * (Math.PI * 2 / spots);
      const rr = r * 0.45;
      const sx = p.x + Math.cos(a) * rr;
      const sy = p.y + Math.sin(a) * rr * 0.85;
      ctx.fillStyle = '#17181f';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.7, r * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }
    /* highlight */
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath();
    ctx.arc(p.x - r * 0.32, p.y - r * 0.34, Math.max(0.6, r * 0.22), 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---- aiming overlay ------------------------------------------------- */

  drawAim(aim, power, showGuide, time, ballX) {
    const ctx = this.ctx;
    const bx = ballX || 0;
    const p = proj(aim.x, aim.y, 0);

    /* dotted trajectory guide (deliberately approximate) */
    if (showGuide) {
      const arc = 0.34 + aim.y * 0.42 + clamp(power / 100, 0, 1) * 0.5;
      const curve = (aim.x - bx) * 0.30;
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      for (let i = 1; i <= 15; i++) {
        const t = i / 16;
        const z = CFG.BALL_Z * (1 - t);
        const x = lerp(bx, aim.x, t) + curve * Math.sin(Math.PI * t);
        const y = lerp(CFG.BALL_R, aim.y, t) + arc * Math.sin(Math.PI * Math.pow(t, 0.92));
        const q = proj(x, y, z);
        const sz = i > 12 ? 2 : 3;
        ctx.globalAlpha = 0.5 + 0.5 * (i / 16);
        ctx.fillStyle = '#0a0a14';
        ctx.fillRect(Math.round(q.x - sz / 2) - 1, Math.round(q.y - sz / 2) - 1, sz + 2, sz + 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(q.x - sz / 2), Math.round(q.y - sz / 2), sz, sz);
      }
      ctx.globalAlpha = 1;
    }

    /* reticle: chunky animated crosshair */
    const blink = Math.floor(time * 6) % 2 === 0;
    const col = Math.abs(aim.x) > CFG.GOAL_HALF || aim.y > CFG.GOAL_H ? '#ff6b78' : '#ffd23f';
    const R = 7;
    ctx.strokeStyle = '#0a0a14';
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x - R, p.y - R, R * 2, R * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p.x - R, p.y - R, R * 2, R * 2);
    if (blink) {
      this.px(p.x - 1, p.y - R - 4, 2, 4, col);
      this.px(p.x - 1, p.y + R, 2, 4, col);
      this.px(p.x - R - 4, p.y - 1, 4, 2, col);
      this.px(p.x + R, p.y - 1, 4, 2, col);
    }
    this.px(p.x - 1, p.y - 1, 2, 2, '#ffffff');
  }

  /* ---- screen effects ------------------------------------------------- */

  beginFrame(dt) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CFG.W, CFG.H);
    if (this.shake > 0.01) {
      this.shake *= Math.pow(0.001, dt);
      const a = this.shake;
      ctx.translate(Math.round(rand(-a, a)), Math.round(rand(-a, a)));
    } else this.shake = 0;
    if (this.netHit.t > 0) this.netHit.t -= dt;
    if (this.flashT > 0) this.flashT -= dt;
  }

  endFrame() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flashT > 0) {
      ctx.globalAlpha = clamp(this.flashT * 2.2, 0, 0.55);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.globalAlpha = 1;
    }
    /* vignette + stadium light bloom */
    const g = ctx.createRadialGradient(CFG.W / 2, CFG.H * 0.42, CFG.H * 0.25, CFG.W / 2, CFG.H * 0.5, CFG.W * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
  }
}

/* ==========================================================================
   12. DOM HELPERS
   ========================================================================== */

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

/* roughly-normal noise in [-1, 1] */
function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

/* ==========================================================================
   13. GAME STATES
   ========================================================================== */

const S = {
  WELCOME: 'WELCOME',
  REGISTER: 'REGISTER',
  TEAM_SELECT: 'TEAM_SELECT',
  READY: 'READY',
  AIMING: 'AIMING',
  CHARGING: 'CHARGING',
  FLIGHT: 'FLIGHT',
  RESULT: 'RESULT',
  NEXT_ATTEMPT: 'NEXT_ATTEMPT',
  FINAL_RESULTS: 'FINAL_RESULTS',
  HIGH_SCORES: 'HIGH_SCORES',
  SPECTATE: 'SPECTATE',        // watching a room match on the field, no input
};

const IN_MATCH = { READY: 1, AIMING: 1, CHARGING: 1, FLIGHT: 1, RESULT: 1, NEXT_ATTEMPT: 1 };

const RATINGS = [
  { goals: 0, label: 'ROOKIE', msg: 'Every legend misses their first few. Get back on the training pitch — the Freedom Cup is waiting.' },
  { goals: 1, label: 'RISING STAR', msg: 'One on the board! The crowd sees the talent. Keep bending them into the corners.' },
  { goals: 2, label: 'FREE-KICK SPECIALIST', msg: 'Two from three — the keeper is having nightmares. Dead-ball duty is officially yours.' },
  { goals: 3, label: 'FREEDOM CUP CHAMPION', msg: 'A perfect hat-trick of free kicks! The whole stadium is on its feet. Football unites us!' },
];

/* ==========================================================================
   14. SCORE MANAGEMENT
   ========================================================================== */

class ScoreBoard {
  constructor() { this.reset(); }

  reset() {
    this.score = 0;
    this.goals = 0;
    this.attempt = 0;              // completed attempts
    this.history = [];
  }

  get kicksLeft() { return CFG.ATTEMPTS - this.attempt; }

  /** returns { points, breakdown[] } */
  award(outcome, bx, by, power, viaPost) {
    const parts = [];
    let pts = 0;
    if (outcome === 'goal') {
      const corner = Math.abs(bx) > 2.2;
      if (viaPost) { pts = 200; parts.push('POST & IN +200'); }
      else if (corner && by > 1.5) { pts = 175; parts.push('TOP CORNER +175'); }
      else if (corner && by < 0.95) { pts = 125; parts.push('BOTTOM CORNER +125'); }
      else { pts = 100; parts.push('GOAL +100'); }
      if (power >= CFG.IDEAL_LO && power <= CFG.IDEAL_HI) { pts += 50; parts.push('PERFECT POWER +50'); }
      this.goals++;
    }
    this.score += pts;
    return { points: pts, breakdown: parts };
  }

  record(entry) { this.history.push(entry); this.attempt++; }

  get rating() { return RATINGS[clamp(this.goals, 0, 3)]; }
}

/* ==========================================================================
   15. INPUT — keyboard + touch, state-gated
   ========================================================================== */

class Input {
  constructor(game) {
    this.game = game;
    this.held = { left: false, right: false, up: false, down: false };
    this.kickHeld = false;
    this._bind();
  }

  _bind() {
    const g = this.game;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) { this._maybePreventScroll(e); return; }
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');

      /* global toggles that work anywhere except while typing */
      if (!typing) {
        const k = e.key.toLowerCase();
        if (k === 'm') { g.toggleMute(); this._maybePreventScroll(e); return; }
        if (k === 'r' && IN_MATCH[g.state]) { g.restartMatch(); this._maybePreventScroll(e); return; }
      }

      if (typing) {
        if (e.key === 'Enter' && g.state === S.REGISTER) { e.preventDefault(); g.ui.tryStart(); }
        return;
      }

      /* spectators watch the field but drive nothing (mute/restart handled above) */
      if (g.state === S.SPECTATE) { this._maybePreventScroll(e); return; }

      switch (e.key) {
        case 'ArrowLeft': this.held.left = true; break;
        case 'ArrowRight': this.held.right = true; break;
        case 'ArrowUp': this.held.up = true; break;
        case 'ArrowDown': this.held.down = true; break;
        case ' ': case 'Spacebar':
          this.kickHeld = true;
          g.onChargeStart();
          break;
        case 'Enter':
          g.onContinue();
          break;
        default: break;
      }
      this._maybePreventScroll(e);
    });

    window.addEventListener('keyup', (e) => {
      switch (e.key) {
        case 'ArrowLeft': this.held.left = false; break;
        case 'ArrowRight': this.held.right = false; break;
        case 'ArrowUp': this.held.up = false; break;
        case 'ArrowDown': this.held.down = false; break;
        case ' ': case 'Spacebar':
          if (this.kickHeld) { this.kickHeld = false; this.game.onChargeRelease(); }
          break;
        default: break;
      }
    });

    /* if the tab loses focus mid-charge, don't leave keys stuck down */
    window.addEventListener('blur', () => {
      this.held.left = this.held.right = this.held.up = this.held.down = false;
      if (this.kickHeld) { this.kickHeld = false; this.game.onChargeRelease(); }
    });

    this._bindTouch();
  }

  _maybePreventScroll(e) {
    const scrollKeys = [' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (scrollKeys.indexOf(e.key) >= 0 && IN_MATCH[this.game.state]) e.preventDefault();
  }

  _bindTouch() {
    const g = this.game;
    const holdBtn = (el, on, off) => {
      if (!el) return;
      const start = (e) => { e.preventDefault(); on(); };
      const end = (e) => { e.preventDefault(); off(); };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('pointerleave', end);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    holdBtn($('tLeft'), () => { this.held.left = true; }, () => { this.held.left = false; });
    holdBtn($('tRight'), () => { this.held.right = true; }, () => { this.held.right = false; });
    holdBtn($('tUp'), () => { this.held.up = true; }, () => { this.held.up = false; });
    holdBtn($('tDown'), () => { this.held.down = true; }, () => { this.held.down = false; });
    holdBtn($('tKick'),
      () => {
        if (g.state === S.RESULT) { g.onContinue(); return; }
        this.kickHeld = true; g.onChargeStart();
      },
      () => {
        if (this.kickHeld) { this.kickHeld = false; g.onChargeRelease(); }
      });

    /* tapping the pitch also continues after a result */
    const stage = $('stage');
    if (stage) {
      stage.addEventListener('pointerdown', (e) => {
        if (g.state === S.RESULT && e.target === stage) g.onContinue();
      });
    }

    this._bindPointerAim();
  }

  /**
   * Mouse / trackpad / touch-drag aiming.
   * The pointer position over the canvas is unprojected onto the goal plane
   * (z = 0) and becomes the aim point directly — point at the corner, kick.
   */
  _bindPointerAim() {
    const g = this.game;
    const field = $('field');
    if (!field) return;

    const toAim = (e) => {
      const r = field.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      /* the canvas is object-fit friendly: it always fills the stage 1:1 */
      const cx = (e.clientX - r.left) / r.width * CFG.W;
      const cy = (e.clientY - r.top) / r.height * CFG.H;
      const s = persp(0);
      /* invert proj() at the goal plane */
      const x = (cx - CFG.W / 2) / (s * CFG.PPM);
      const y = (CFG.HORIZON + CFG.LIFT * s - cy) / (s * CFG.PPM);
      return { x, y };
    };

    const aimFrom = (e) => {
      if (g.state !== S.AIMING && g.state !== S.CHARGING) return;
      const a = toAim(e);
      if (!a) return;
      g.aim.x = clamp(a.x, -CFG.AIM_X_MAX, CFG.AIM_X_MAX);
      g.aim.y = clamp(a.y, CFG.AIM_Y_MIN, CFG.AIM_Y_MAX);
      g.ui.syncAim(g.aim, g.power);
    };

    field.addEventListener('pointermove', aimFrom);
    field.addEventListener('pointerdown', (e) => {
      /* a click/tap on the pitch also wakes AIMING from READY */
      if (g.state === S.READY) { g.setState(S.AIMING); }
      aimFrom(e);
    });
  }
}

/* ==========================================================================
   16. GAME
   ========================================================================== */

class Game {
  constructor() {
    this.state = S.WELCOME;
    this.ball = new Ball();
    this.keeper = new Keeper();
    this.kicker = new Kicker();
    this.fx = new Particles();
    this.board = new ScoreBoard();
    this.renderer = new Renderer($('field'));
    this.ui = new UI(this);
    this.input = new Input(this);

    this.player = { name: '', teamId: TEAMS[0].id, number: 10 };
    this.aim = { x: 0, y: 1.35 };
    this.ballX = 0;
    this.wallJitter = 0;
    this.power = 0;
    this.chargeStart = 0;
    this.time = 0;
    this.stateT = 0;
    this.lastResult = null;
    this.wallX = 0;
    this.muted = false;
    this.celebrating = false;
    this.fireworkT = 0;

    const prefs = Prefs.read();
    if (typeof prefs.muted === 'boolean') this.setMuted(prefs.muted, true);
    this.ui.hydrate(prefs);

    this._raf = this._loop.bind(this);
    this.lastTS = 0;
    requestAnimationFrame(this._raf);
  }

  /* ---- team / kit ----------------------------------------------------- */

  get team() { return teamById(this.player.teamId); }

  get outfieldKit() {
    const t = this.team;
    return {
      shirt: t.primary, shirt2: t.secondary, accent: t.accent,
      shorts: t.shorts, socks: t.socks, pattern: t.pattern,
      skin: '#c98a5a', hair: '#241a12',
    };
  }

  get keeperKit() {
    const g = this.team.gk;
    return {
      shirt: g.primary, shirt2: g.secondary, accent: g.accent,
      shorts: g.secondary, socks: g.primary, pattern: 'band',
    };
  }

  /* ---- state ---------------------------------------------------------- */

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    this.ui.onState(s);
  }

  /* ---- match lifecycle ------------------------------------------------ */

  startMatch(name, teamId) {
    this.player.name = name;
    this.player.teamId = teamId;
    this.player.number = randInt(7, 11);
    this.board.reset();
    this.renderer.buildStadium(this.team);
    this.fx.clear();
    this.ui.syncHud();
    AUDIO.resume();
    if (!AUDIO.playSample('whistle')) AUDIO.whistle();
    AUDIO.crowdCheer(0.5);
    this.beginAttempt();
  }

  restartMatch() {
    AUDIO.menuSelect();
    this.board.reset();
    this.fx.clear();
    this.ui.syncHud();
    this.beginAttempt();
  }

  beginAttempt() {
    this.ball.reset();
    this.keeper.reset();
    this.keeper.setReady();
    this.kicker.reset();
    this.kicker.setPose('idle');
    this.aim = { x: rand(-0.4, 0.4), y: 1.35 };
    this.power = 0;
    this.lastResult = null;
    this.celebrating = false;
    this.ballX = 0;
    this.wallJitter = rand(-0.7, 0.7);
    this.wallX = this.wallJitter;
    this.ui.syncHud();
    this.setState(S.READY);
  }

  /* ---- charging & kicking -------------------------------------------- */

  onChargeStart() {
    if (this.state === S.READY) { this.setState(S.AIMING); return; }
    if (this.state !== S.AIMING) return;
    this.power = 0;
    this.chargeStart = this.time;
    this.setState(S.CHARGING);
    AUDIO.resume();
    AUDIO.chargeStart();
  }

  onChargeRelease() {
    if (this.state !== S.CHARGING) return;
    AUDIO.chargeStop();
    this.kick(this.power);
  }

  onContinue() {
    if (this.state === S.RESULT) {
      this.setState(S.NEXT_ATTEMPT);
      return;
    }
    if (this.state === S.READY) this.setState(S.AIMING);
  }

  kick(power) {
    const pn = clamp(power / 100, 0, 1);
    this.kicker.setPose('kick');
    AUDIO.kick(power);
    this.renderer.kick(2 + pn * 5);

    if (power < CFG.MIN_POWER) {
      /* barely made contact — the ball trickles forward */
      this.ball.mode = 'free';
      this.ball.vx = rand(-0.6, 0.6);
      this.ball.vy = 0.4;
      this.ball.vz = -rand(3, 5.5);
      this.ball.spinRate = 5;
      this.finishShot({
        outcome: 'weak', bx: 0, by: 0, power, viaPost: false,
        title: 'TOO WEAK!', sub: 'THE BALL NEVER REACHED THE GOAL', tone: 'bad',
      });
      return;
    }

    const spread = 0.085 + Math.pow(Math.max(0, pn - 0.5) / 0.5, 2) * 1.05;
    const impactX = this.aim.x + gauss() * spread * 1.25;
    const impactY = clamp(this.aim.y + gauss() * spread * 0.85, 0.05, 4.4);

    const shot = {
      power,
      startX: this.ballX,
      aimX: this.aim.x,
      aimY: this.aim.y,
      impactX,
      impactY,
      arc: 0.34 + this.aim.y * 0.42 + pn * 0.5,
      /* the swerve bulges away from the straight line between the ball and
         the target, so it bends around the wall and back in */
      curve: (this.aim.x - this.ballX) * 0.30 + rand(-0.12, 0.12),
      duration: lerp(1.42, 0.66, pn),
    };
    this.ball.launch(shot);
    this.keeper.decide({ x: impactX, y: impactY }, power);
    this.wallChecked = false;
    this.setState(S.FLIGHT);
  }

  /* ---- shot resolution ----------------------------------------------- */

  resolveGoalPlane() {
    const b = this.ball;
    const bx = b.shot.impactX;
    const by = b.shot.impactY;
    const power = b.shot.power;
    const GH = CFG.GOAL_HALF, GHT = CFG.GOAL_H;
    const frameTol = CFG.BALL_R + CFG.POST_T;

    const distPost = Math.abs(Math.abs(bx) - GH);
    const distBar = Math.abs(by - GHT);
    const hitsPost = distPost <= frameTol && by < GHT + frameTol;
    const hitsBar = distBar <= frameTol && Math.abs(bx) < GH + frameTol;

    /* --- woodwork --- */
    if (hitsPost || hitsBar) {
      const isPost = hitsPost && (!hitsBar || distPost <= distBar);
      if (isPost) {
        AUDIO.post();
        this.renderer.kick(4);
        this.renderer.flash('#ffd23f', 0.12);
        const pp = proj(sign(bx) * GH, by, 0);
        this.fx.spark(pp.x, pp.y, 12, ['#ffffff', '#ffd23f'], 90);
        const goesIn = Math.random() < 0.34;
        b.goFree();
        if (goesIn) {
          b.vx = -sign(bx) * rand(1.6, 3.4);
          b.vz = b.vz * 0.7;
          b.vy = Math.max(b.vy * 0.5, -1.5);
          const stopped = this.keeper.tryStop(bx - sign(bx) * 0.5, by);
          if (stopped) {
            this.doSave(true);
            return;
          }
          this.doGoal(bx - sign(bx) * 0.6, by, power, true);
          return;
        }
        b.vx = -sign(bx) * rand(3.5, 7);
        b.vz = Math.abs(b.vz) * 0.4 + 1.5;
        b.vy = Math.max(1.2, Math.abs(b.vy) * 0.5);
        this.finishShot({
          outcome: 'post', bx, by, power, viaPost: false,
          title: 'OFF THE POST!', sub: 'INCHES FROM GLORY', tone: 'bad',
        });
        if (!AUDIO.playSample('aww')) AUDIO.crowdGroan();
        return;
      }
      /* crossbar */
      AUDIO.crossbar();
      this.renderer.kick(4.5);
      this.renderer.flash('#ffd23f', 0.12);
      const bp = proj(bx, GHT, 0);
      this.fx.spark(bp.x, bp.y, 14, ['#ffffff', '#ffd23f'], 95);
      b.goFree();
      b.vy = -Math.abs(b.vy) - 2.2;
      b.vz = Math.abs(b.vz) * 0.42 + 1.2;
      b.vx *= 0.5;
      this.finishShot({
        outcome: 'bar', bx, by, power, viaPost: false,
        title: 'CROSSBAR!', sub: power > 88 ? 'TOO MUCH POWER ON IT' : 'THE WOODWORK SAVES THE KEEPER', tone: 'bad',
      });
      if (!AUDIO.playSample('aww')) AUDIO.crowdGroan();
      return;
    }

    /* --- missed the frame entirely --- */
    if (Math.abs(bx) > GH) {
      b.goFree();
      this.finishShot({
        outcome: 'wide', bx, by, power, viaPost: false,
        title: 'WIDE!', sub: 'DRAGGED IT PAST THE POST', tone: 'bad',
      });
      if (!AUDIO.playSample('aww')) AUDIO.crowdGroan();
      return;
    }
    if (by > GHT) {
      b.goFree();
      const tooHot = power > 88;
      this.finishShot({
        outcome: 'over', bx, by, power, viaPost: false,
        title: tooHot ? 'TOO MUCH POWER!' : 'OVER THE BAR!',
        sub: tooHot ? 'THAT ONE IS STILL CLIMBING' : 'LEANED BACK TOO FAR',
        tone: 'bad',
      });
      if (!AUDIO.playSample('aww')) AUDIO.crowdGroan();
      return;
    }

    /* --- on target: can the keeper get there? --- */
    if (this.keeper.tryStop(bx, by)) {
      this.doSave(false);
      return;
    }
    this.doGoal(bx, by, power, false);
  }

  doSave(afterPost) {
    const b = this.ball;
    const power = b.shot.power;
    const strong = power > 62;
    const k = this.keeper;
    if (b.mode === 'flight') b.goFree();

    const dived = k.pose === 'diveLeft' || k.pose === 'diveRight';
    if (strong || Math.random() < 0.45) {
      k.result = 'deflect';
      if (!dived) k.pose = 'deflect';
      b.vx = (k.dir || (Math.random() < 0.5 ? -1 : 1)) * rand(3, 8);
      b.vy = rand(1.5, 4.5);
      b.vz = Math.abs(b.vz) * 0.35 + rand(1.5, 4);
      const hp = proj(b.x, b.y, 0);
      this.fx.spark(hp.x, hp.y, 10, ['#ffffff', '#8fd0ee'], 80);
    } else {
      k.result = 'catch';
      if (!dived) k.pose = 'catch';
      b.mode = 'stopped';
      b.vx = b.vy = b.vz = 0;
    }
    AUDIO.save();
    if (!AUDIO.playSample('aww')) AUDIO.crowdCheer(0.35);
    this.renderer.kick(3);
    this.kicker.setPose('dejected');

    const titles = k.pose === 'catch'
      ? ['SAVED!', 'SAFE HANDS!', 'CLAIMED!']
      : ['SAVED!', 'GREAT SAVE!', 'DEFLECTED!', 'DENIED!'];
    this.finishShot({
      outcome: 'save', bx: b.shot.impactX, by: b.shot.impactY, power, viaPost: afterPost,
      title: pick(titles),
      sub: k.plan && k.plan.late ? 'A LATE HAND — SOMEHOW HE GOT THERE' : 'THE KEEPER GUESSED RIGHT',
      tone: 'save',
      keeperCelebrates: true,
    });
  }

  doGoal(bx, by, power, viaPost) {
    const b = this.ball;
    if (b.mode === 'flight') b.goFree();
    this.keeper.pose = 'beaten';

    const corner = Math.abs(bx) > 2.2;
    let title = 'GOAL!';
    let sub = 'THE NET BULGES!';
    if (viaPost) { title = 'OFF THE POST... AND IN!'; sub = 'THE WOODWORK IS ON YOUR SIDE'; }
    else if (corner && by > 1.5) { title = 'TOP CORNER!'; sub = 'UNSTOPPABLE PLACEMENT'; }
    else if (corner && by < 0.95) { title = 'BOTTOM CORNER!'; sub = 'RIGHT INTO THE SIDE NETTING'; }
    else if (power >= 92) { title = 'AMAZING STRIKE!'; sub = 'THAT NEARLY BURST THE NET'; }
    else if (power >= CFG.IDEAL_LO && power <= CFG.IDEAL_HI) { title = 'SWEET STRIKE!'; sub = 'PERFECT CONNECTION'; }

    AUDIO.goal();
    if (!AUDIO.playSample('cheer')) AUDIO.crowdCheer(1);
    AUDIO.playSample('commentary');
    this.renderer.kick(5);
    this.renderer.flash('#ffffff', 0.16);
    const gp = proj(bx, by, 0);
    this.renderer.rippleNet(gp.x, gp.y);
    this.fx.starburst(gp.x, gp.y);
    this.fx.spark(gp.x, gp.y, 26, ['#ffffff', '#ffd23f', '#6cff8a'], 120);
    this.fx.confetti(150);
    this.celebrating = true;
    this.fireworkT = 0;
    this.kicker.setPose('celebrate');

    this.finishShot({ outcome: 'goal', bx, by, power, viaPost, title, sub, tone: 'goal' });
  }

  /** shared tail of every outcome: score it, record it, show the banner */
  finishShot(res) {
    const awarded = this.board.award(res.outcome, res.bx, res.by, res.power, res.viaPost);
    res.points = awarded.points;
    res.breakdown = awarded.breakdown;
    res.attempt = this.board.attempt + 1;
    this.board.record(res);
    this.lastResult = res;
    if (res.outcome !== 'goal' && res.outcome !== 'save') this.kicker.setPose('dejected');
    if (res.keeperCelebrates) this.keeper.celebT = 0;
    this.ui.syncHud();
    this.ui.showBanner(res, this.board.kicksLeft);
    this.setState(S.RESULT);
  }

  /* ---- per-frame updates -------------------------------------------- */

  updateAim(dt) {
    const h = this.input.held;
    let moved = false;

    /* ← → walk the taker (and the ball) along the free-kick line */
    if (h.left) { this.ballX -= CFG.MOVE_SPEED * dt; moved = true; }
    if (h.right) { this.ballX += CFG.MOVE_SPEED * dt; moved = true; }
    this.ballX = clamp(this.ballX, -CFG.BALL_X_MAX, CFG.BALL_X_MAX);

    /* ↑ ↓ nudge the target height for keyboard-only players */
    if (h.up) { this.aim.y += CFG.AIM_SPEED_Y * dt; moved = true; }
    if (h.down) { this.aim.y -= CFG.AIM_SPEED_Y * dt; moved = true; }
    this.aim.y = clamp(this.aim.y, CFG.AIM_Y_MIN, CFG.AIM_Y_MAX);
    this.aim.x = clamp(this.aim.x, -CFG.AIM_X_MAX, CFG.AIM_X_MAX);

    if (moved) {
      this.ball.x = this.ballX;
      this.kicker.x = this.ballX - 0.75;
      /* the defence re-sets its wall between the ball and the goal */
      this.wallX = clamp(this.ballX * 0.55 + this.wallJitter, -3.2, 3.2);
      this.ui.syncAim(this.aim, this.power);
    }
  }

  updateFlight(dt) {
    const b = this.ball;
    const ev = b.update(dt);
    if (ev === 'bounce') AUDIO.noise({ freq: 260, q: 1.4, dur: 0.1, gain: 0.1, sweepTo: 110 });

    /* keeper reacts while the ball travels */
    this.keeper.updateDive(dt);

    /* the defensive wall */
    if (!this.wallChecked && b.z <= CFG.WALL_Z) {
      this.wallChecked = true;
      const dx = Math.abs(b.x - this.wallX);
      if (dx < CFG.WALL_HALF + CFG.BALL_R && b.y < CFG.WALL_H) {
        AUDIO.noise({ freq: 420, q: 1.2, dur: 0.16, gain: 0.22, sweepTo: 130 });
        if (!AUDIO.playSample('aww')) AUDIO.crowdGroan();
        this.renderer.kick(3);
        b.goFree();
        b.vx = (b.x - this.wallX) * 3 + rand(-2, 2);
        b.vz = Math.abs(b.vz) * 0.3 + 2;
        b.vy = rand(1, 3);
        const wp = proj(b.x, b.y, CFG.WALL_Z);
        this.fx.spark(wp.x, wp.y, 10, ['#ffffff', '#c9d4e8'], 70);
        this.finishShot({
          outcome: 'wall', bx: b.shot.impactX, by: b.shot.impactY, power: b.shot.power, viaPost: false,
          title: 'BLOCKED BY THE WALL!', sub: 'LIFT IT OVER OR BEND IT AROUND', tone: 'bad',
        });
        return;
      }
    }

    /* reached the goal plane? */
    if (b.mode === 'flight' && b.t >= 1) {
      b.t = 1;
      const p = b.sample(1);
      b.x = p.x; b.y = p.y; b.z = 0;
      this.resolveGoalPlane();
    }
  }

  updateResultAnim(dt) {
    const b = this.ball;
    b.update(dt);
    this.keeper.updateDive(dt);

    /* keeper celebration once the ball is dead */
    if (this.lastResult && this.lastResult.outcome === 'save') {
      this.keeper.celebT += dt;
      if (this.keeper.celebT > 0.7 && this.keeper.pose !== 'celebrate') this.keeper.pose = 'celebrate';
    }

    /* ball dying in the net */
    if (this.lastResult && this.lastResult.outcome === 'goal') {
      if (b.z < -(CFG.GOAL_DEPTH - 0.35)) {
        b.z = -(CFG.GOAL_DEPTH - 0.35);
        if (b.mode !== 'stopped') {
          const gp = proj(b.x, b.y, 0);
          this.renderer.rippleNet(gp.x, gp.y);
          AUDIO.netSwish();
        }
        b.vz = -b.vz * 0.2;
        b.vx *= 0.4;
        if (Math.abs(b.vz) < 0.6 && b.y <= CFG.BALL_R + 0.02) b.mode = 'stopped';
      }
      /* rolling fireworks during the celebration */
      this.fireworkT -= dt;
      if (this.fireworkT <= 0) {
        this.fx.firework(rand(0.02, 0.25));
        this.fireworkT = rand(0.35, 0.8);
      }
    }
    if (b.z < -CFG.GOAL_DEPTH - 6 || b.z > CFG.BALL_Z + 12) b.mode = 'stopped';
  }

  /* ---- main loop ---------------------------------------------------- */

  _loop(ts) {
    requestAnimationFrame(this._raf);
    if (!this.lastTS) this.lastTS = ts;
    let dt = (ts - this.lastTS) / 1000;
    this.lastTS = ts;
    if (dt > 0.05) dt = 0.05;         // clamp big frame gaps
    if (dt <= 0) return;
    this.time += dt;
    this.stateT += dt;

    switch (this.state) {
      case S.READY:
        this.keeper.updateIdle(dt);
        this.kicker.update(dt);
        if (this.stateT > 1.1) this.setState(S.AIMING);
        break;

      case S.AIMING:
        this.keeper.updateIdle(dt);
        this.kicker.update(dt);
        this.updateAim(dt);
        break;

      case S.CHARGING: {
        this.keeper.updateIdle(dt);
        this.kicker.update(dt);
        this.updateAim(dt);
        const held = (this.time - this.chargeStart) * 1000;
        this.power = clamp(held / CFG.CHARGE_MS * 100, 0, 100);
        AUDIO.chargeUpdate(this.power / 100);
        this.ui.syncPower(this.power);
        this.ui.syncAim(this.aim, this.power);
        break;
      }

      case S.FLIGHT:
        this.kicker.update(dt);
        this.updateFlight(dt);
        break;

      case S.RESULT:
        this.kicker.update(dt);
        this.updateResultAnim(dt);
        break;

      case S.NEXT_ATTEMPT:
        if (this.board.attempt >= CFG.ATTEMPTS) this.endMatch();
        else this.beginAttempt();
        break;

      case S.SPECTATE:
        /* watching a room match: keep the scene alive, take no input */
        this.keeper.updateIdle(dt);
        this.kicker.update(dt);
        break;

      default:
        /* menus: keep the crowd alive behind the panels */
        this.keeper.updateIdle(dt);
        break;
    }

    this.fx.update(dt);
    this.draw(dt);
  }

  endMatch() {
    const rating = this.board.rating;
    const entry = {
      name: this.player.name,
      team: this.player.teamId,
      teamName: this.team.name,
      score: this.board.score,
      goals: this.board.goals,
      attempts: CFG.ATTEMPTS,
      date: new Date().toISOString().slice(0, 10),
    };
    const { rank, table, id } = HS.add(entry);
    AUDIO.fanfare(this.board.goals >= 2);
    if (this.board.goals >= 2) {
      this.fx.confetti(200);
      for (let i = 0; i < 6; i++) this.fx.firework(0.2 + i * 0.42);
      if (!AUDIO.playSample('cheer')) AUDIO.crowdCheer(1);
    }
    this.ui.showResults(this.board, rating, rank, table, id);
    this.setState(S.FINAL_RESULTS);
  }

  /* ---- sound --------------------------------------------------------- */

  setMuted(m, silent) {
    this.muted = m;
    AUDIO.setMuted(m);
    Prefs.merge({ muted: m });
    this.ui.syncMute(m);
    if (!silent && !m) AUDIO.menuSelect();
  }

  toggleMute() { AUDIO.resume(); this.setMuted(!this.muted); }

  /* ---- drawing ------------------------------------------------------- */

  draw(dt) {
    const R = this.renderer;
    R.beginFrame(dt);
    R.drawSky(this.time);
    R.drawStands(this.time);
    R.drawBoards(this.time, this.team);
    R.drawPitch();
    R.drawGoalNet(this.time);

    const b = this.ball;
    const showMatch = IN_MATCH[this.state] || this.state === S.FINAL_RESULTS || this.state === S.SPECTATE;

    /* keeper sits just in front of the goal line */
    R.shadow(this.keeper.x, this.keeper.z, 0.62);
    R.drawKeeper(this.keeper, this.keeperKit, this.time);
    R.drawGoalFrame();

    /* depth order between the wall, the ball and the taker */
    const drawWall = () => {
      if (!showMatch) return;
      const kit = {
        shirt: '#e8e8f0', shirt2: '#b9bfd0', accent: '#6d6d92',
        shorts: '#2a2a44', socks: '#e8e8f0', pattern: 'plain',
        skin: '#b8794c', hair: '#1d1710',
      };
      for (let i = -1; i <= 1; i++) {
        const x = this.wallX + i * 0.62;
        R.shadow(x, CFG.WALL_Z, 0.5);
        R.drawPlayer(x, CFG.WALL_Z, kit, 'wall', this.time + i * 0.3, i > 0);
      }
    };

    const drawTaker = () => {
      if (!showMatch) return;
      R.shadow(this.kicker.x, this.kicker.z, 0.6);
      R.drawPlayer(this.kicker.x, this.kicker.z, this.outfieldKit, this.kicker.pose, this.kicker.t + this.kicker.strideT, false);
    };

    if (b.z > CFG.WALL_Z) { drawWall(); if (showMatch) R.drawBall(b); }
    else { if (showMatch) R.drawBall(b); drawWall(); }
    drawTaker();

    /* aiming overlay */
    if (this.state === S.AIMING || this.state === S.CHARGING) {
      R.drawAim(this.aim, this.power, true, this.time, this.ballX);
    }

    /* attempt caption burned into the pitch during READY */
    if (this.state === S.READY) {
      R.text('ATTEMPT ' + (this.board.attempt + 1) + ' OF ' + CFG.ATTEMPTS, CFG.W / 2, 62, { size: 12, color: '#ffd23f' });
      R.text('← → MOVE  •  AIM WITH MOUSE  •  HOLD SPACE TO KICK', CFG.W / 2, 76, { size: 7, color: '#fff6d8' });
    }

    this.fx.draw(R.ctx);
    R.endFrame();
  }
}

/* ==========================================================================
   17. UI — screens, HUD, meters, banners, high-score table
   ========================================================================== */

class UI {
  constructor(game) {
    this.g = game;
    this.screens = {
      welcome: $('screen-welcome'),
      register: $('screen-register'),
      game: $('screen-game'),
      results: $('screen-results'),
      highscores: $('screen-highscores'),
    };
    this.el = {
      name: $('inpName'),
      nameHint: $('nameHint'),
      teamGrid: $('teamGrid'),
      jersey: $('jerseyCanvas'),
      previewName: $('previewName'),
      previewSub: $('previewSub'),
      btnStart: $('btnStart'),
      hudName: $('hudName'),
      hudTeam: $('hudTeam'),
      hudChip: $('hudTeamChip'),
      hudScore: $('hudScore'),
      hudGoals: $('hudGoals'),
      hudAttempt: $('hudAttempt'),
      pips: $('kickPips'),
      powerWrap: $('powerWrap'),
      powerFill: $('powerFill'),
      powerNotch: $('powerNotch'),
      powerPct: $('powerPct'),
      aimBar: $('aimBar'),
      aimSide: $('aimSide'),
      aimHeight: $('aimHeight'),
      aimPos: $('aimPos'),
      banner: $('banner'),
      bannerText: $('bannerText'),
      bannerSub: $('bannerSub'),
      bannerPts: $('bannerPts'),
      bannerCont: $('bannerCont'),
      tip: $('tip'),
      touch: $('touch'),
      btnMute: $('btnMute'),
      rName: $('rName'),
      rTeam: $('rTeam'),
      rScore: $('rScore'),
      rGoals: $('rGoals'),
      rating: $('ratingLine'),
      resultMsg: $('resultMsg'),
      newHigh: $('newHighTag'),
      hsBody: $('hsBody'),
      hsCaption: $('hsCaption'),
      live: $('liveRegion'),
    };
    this.selectedTeam = TEAMS[0].id;
    this.buildTeamGrid();
    this.bindButtons();
    this.showScreen('welcome');
    this.detectTouch();
    /* keep the ideal-power zone in the CSS band in sync with CFG */
    const ideal = $('powerIdeal');
    if (ideal) {
      ideal.style.left = CFG.IDEAL_LO + '%';
      ideal.style.width = (CFG.IDEAL_HI - CFG.IDEAL_LO) + '%';
    }
  }

  /* ---- screens -------------------------------------------------------- */

  showScreen(key) {
    Object.keys(this.screens).forEach((k) => {
      const el = this.screens[k];
      if (el) el.classList.toggle('active', k === key);
    });
    document.body.classList.toggle('playing', key === 'game');
    AUDIO.setScene(key === 'game' ? 'match' : 'menu');
  }

  say(msg) { if (this.el.live) this.el.live.textContent = msg; }

  /* ---- registration --------------------------------------------------- */

  buildTeamGrid() {
    const frag = document.createDocumentFragment();
    TEAMS.forEach((t, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'team-card';
      const id = 'team_' + t.id;
      wrap.innerHTML =
        '<input type="radio" name="team" id="' + id + '" value="' + t.id + '"' +
        (i === 0 ? ' checked' : '') + ' aria-label="' + t.name + '">' +
        '<label class="team-face" for="' + id + '">' +
        '<span class="flag" aria-hidden="true">' + t.flag + '</span>' +
        '<span class="tname">' + t.name.toUpperCase() + '</span>' +
        '<span class="swatch" aria-hidden="true">' +
        '<i style="background:' + t.primary + '"></i>' +
        '<i style="background:' + t.secondary + '"></i>' +
        '<i style="background:' + t.accent + '"></i>' +
        '</span></label>';
      frag.appendChild(wrap);
    });
    this.el.teamGrid.appendChild(frag);

    $$('input[name="team"]', this.el.teamGrid).forEach((r) => {
      r.addEventListener('change', () => {
        this.selectedTeam = r.value;
        this.g.state = S.TEAM_SELECT;
        AUDIO.resume();
        AUDIO.menuMove();
        this.refreshPreview();
        Prefs.merge({ team: r.value });
      });
      r.addEventListener('focus', () => { this.g.state = S.TEAM_SELECT; });
    });
    this.refreshPreview();
  }

  refreshPreview() {
    const t = teamById(this.selectedTeam);
    const num = this.g && this.g.player && this.g.player.number ? this.g.player.number : 10;
    drawJersey(this.el.jersey, t, num);
    this.el.previewName.textContent = t.name.toUpperCase();
    this.el.previewSub.textContent = t.chant + '  •  KIT #' + num;
    if (this.el.hudChip) this.el.hudChip.style.background = t.primary;
  }

  hydrate(prefs) {
    if (prefs.name && this.el.name) this.el.name.value = prefs.name;
    if (prefs.team) {
      const r = $('team_' + prefs.team);
      if (r) { r.checked = true; this.selectedTeam = prefs.team; this.refreshPreview(); }
    }
    this.validateName();
    this.renderHighScores(HS.load(), null);
  }

  validateName() {
    const v = (this.el.name.value || '').trim();
    const ok = v.length >= 1;
    this.el.btnStart.disabled = !ok;
    this.el.nameHint.textContent = ok
      ? 'READY, ' + v.toUpperCase().slice(0, 14) + '. PICK YOUR TEAM AND KICK OFF!'
      : 'ENTER A PLAYER NAME TO UNLOCK START GAME.';
    return ok;
  }

  tryStart() {
    if (!this.validateName()) {
      AUDIO.resume();
      AUDIO.error();
      this.el.name.focus();
      this.say('A player name is required before the match can start.');
      return;
    }
    const name = this.el.name.value.trim().slice(0, 14).toUpperCase();
    Prefs.merge({ name, team: this.selectedTeam });
    AUDIO.resume();
    AUDIO.menuSelect();
    this.showScreen('game');
    this.hideBanner();
    this.g.startMatch(name, this.selectedTeam);
    this.refreshPreview();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  /* ---- buttons -------------------------------------------------------- */

  bindButtons() {
    const g = this.g;
    const click = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

    click('btnPlay', () => {
      AUDIO.resume(); AUDIO.menuSelect();
      this.showScreen('register');
      g.setState(S.REGISTER);
      setTimeout(() => this.el.name.focus(), 60);
    });

    click('btnWelcomeScores', () => {
      AUDIO.resume(); AUDIO.menuSelect();
      this.renderHighScores(HS.load(), null);
      this.hsReturn = 'welcome';
      this.showScreen('highscores');
      g.setState(S.HIGH_SCORES);
    });

    click('btnStart', () => this.tryStart());

    click('btnBackWelcome', () => {
      AUDIO.menuSelect();
      this.showScreen('welcome');
      g.setState(S.WELCOME);
    });

    this.el.name.addEventListener('input', () => {
      this.g.state = S.REGISTER;
      this.validateName();
    });

    click('btnMute', () => g.toggleMute());
    click('btnQuit', () => {
      AUDIO.menuSelect();
      this.hideBanner();
      this.showScreen('welcome');
      g.setState(S.WELCOME);
    });

    click('btnAgain', () => {
      AUDIO.menuSelect();
      this.showScreen('game');
      this.hideBanner();
      g.restartMatch();
    });

    click('btnChangeTeam', () => {
      AUDIO.menuSelect();
      this.showScreen('register');
      g.setState(S.TEAM_SELECT);
      const first = $$('input[name="team"]', this.el.teamGrid)[0];
      if (first) setTimeout(() => first.focus(), 60);
    });

    click('btnChangePlayer', () => {
      AUDIO.menuSelect();
      this.el.name.value = '';
      this.validateName();
      this.showScreen('register');
      g.setState(S.REGISTER);
      setTimeout(() => this.el.name.focus(), 60);
    });

    click('btnResultScores', () => {
      AUDIO.menuSelect();
      this.hsReturn = 'results';
      this.renderHighScores(HS.load(), this.lastHsId);
      this.showScreen('highscores');
      g.setState(S.HIGH_SCORES);
    });

    click('btnHsBack', () => {
      AUDIO.menuSelect();
      const back = this.hsReturn === 'results' ? 'results' : 'welcome';
      this.showScreen(back);
      g.setState(back === 'results' ? S.FINAL_RESULTS : S.WELCOME);
    });

    click('btnHsClear', () => {
      HS.clear();
      AUDIO.error();
      this.lastHsId = null;
      this.renderHighScores([], null);
      this.say('High score table cleared.');
    });
  }

  detectTouch() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) this.el.touch.classList.add('show');
    const t = $('btnTouchToggle');
    if (t) {
      t.addEventListener('click', () => {
        this.el.touch.classList.toggle('show');
        AUDIO.menuMove();
        t.setAttribute('aria-pressed', this.el.touch.classList.contains('show') ? 'true' : 'false');
      });
      t.setAttribute('aria-pressed', isTouch ? 'true' : 'false');
    }
  }

  /* ---- HUD ------------------------------------------------------------ */

  syncHud() {
    const g = this.g, b = g.board, t = g.team;
    this.el.hudName.textContent = g.player.name || 'PLAYER';
    this.el.hudTeam.textContent = t.name.toUpperCase();
    this.el.hudChip.style.background = t.primary;
    this.el.hudScore.textContent = String(b.score).padStart(4, '0');
    this.el.hudGoals.textContent = b.goals + '/' + CFG.ATTEMPTS;
    this.el.hudAttempt.textContent = Math.min(b.attempt + 1, CFG.ATTEMPTS) + '/' + CFG.ATTEMPTS;

    let pips = '';
    for (let i = 0; i < CFG.ATTEMPTS; i++) {
      const h = b.history[i];
      const cls = h ? (h.outcome === 'goal' ? 'live' : 'used') : '';
      const label = h ? (h.outcome === 'goal' ? 'goal' : 'no goal') : 'remaining';
      pips += '<i class="' + cls + '" title="Kick ' + (i + 1) + ': ' + label + '"></i>';
    }
    this.el.pips.innerHTML = pips;
  }

  syncMute(m) {
    const b = this.el.btnMute;
    if (!b) return;
    b.textContent = m ? '♪ OFF' : '♪ ON';
    b.classList.toggle('off', m);
    b.setAttribute('aria-pressed', m ? 'true' : 'false');
    b.setAttribute('aria-label', m ? 'Sound is muted. Unmute sound' : 'Sound is on. Mute sound');
  }

  syncPower(p) {
    this.el.powerFill.style.width = p + '%';
    this.el.powerNotch.style.left = p + '%';
    this.el.powerPct.textContent = Math.round(p) + '%';
  }

  syncAim(aim, power) {
    const side = aim.x < -0.6 ? 'LEFT' : aim.x > 0.6 ? 'RIGHT' : 'CENTRE';
    const dist = Math.abs(aim.x) > CFG.GOAL_HALF ? ' (OUTSIDE!)' : '';
    const h = aim.y > 1.6 ? 'HIGH' : aim.y < 0.8 ? 'LOW' : 'MID';
    this.el.aimSide.textContent = side + dist;
    this.el.aimHeight.textContent = h;
    if (this.el.aimPos) {
      const bx = this.g.ballX;
      this.el.aimPos.textContent = Math.abs(bx) < 0.4 ? 'CENTRE' : (bx < 0 ? 'LEFT ' : 'RIGHT ') + Math.abs(bx).toFixed(1) + 'M';
    }
  }

  /* ---- per-state chrome ---------------------------------------------- */

  onState(s) {
    const e = this.el;
    e.powerWrap.classList.toggle('show', s === S.CHARGING || s === S.AIMING);
    e.aimBar.classList.toggle('show', s === S.AIMING || s === S.CHARGING);

    if (s === S.AIMING) {
      this.syncPower(0);
      this.tip('← → MOVE   •   MOUSE/DRAG TO AIM   •   HOLD SPACE');
      this.syncAim(this.g.aim, 0);
    } else if (s === S.CHARGING) {
      this.tip('RELEASE SPACE TO SHOOT!');
    } else if (s === S.READY) {
      this.hideBanner();
      this.syncPower(0);
      this.tip('');
    } else if (s === S.FLIGHT) {
      this.tip('');
    } else if (s === S.RESULT) {
      /* banner handles messaging */
    } else {
      this.tip('');
    }
    if (s !== S.RESULT) this.hideBanner();
  }

  tip(msg) {
    if (!msg) { this.el.tip.classList.remove('show'); return; }
    this.el.tip.textContent = msg;
    this.el.tip.classList.add('show');
  }

  /* ---- result banner -------------------------------------------------- */

  showBanner(res, kicksLeft) {
    const e = this.el;
    e.bannerText.textContent = res.title;
    e.bannerText.className = res.tone === 'goal' ? 'goal' : res.tone === 'save' ? 'save' : 'bad';
    e.bannerSub.textContent = res.sub;
    e.bannerPts.textContent = res.points > 0
      ? res.breakdown.join('   ') + '   =   +' + res.points + ' PTS'
      : 'NO POINTS  •  SCORE ' + this.g.board.score;
    e.bannerCont.textContent = kicksLeft > 0
      ? 'PRESS ENTER  •  ' + kicksLeft + ' KICK' + (kicksLeft === 1 ? '' : 'S') + ' LEFT'
      : 'PRESS ENTER FOR FINAL RESULTS';
    e.banner.classList.add('show');
    this.say(res.title + ' ' + res.sub + '. ' + (res.points > 0 ? res.points + ' points.' : 'No points.') +
      ' ' + kicksLeft + ' kicks remaining.');
  }

  hideBanner() { this.el.banner.classList.remove('show'); }

  /* ---- results screen ------------------------------------------------- */

  showResults(board, rating, rank, table, id) {
    const e = this.el;
    const t = this.g.team;
    e.rName.textContent = this.g.player.name;
    e.rTeam.textContent = t.name.toUpperCase();
    e.rScore.textContent = String(board.score).padStart(4, '0');
    e.rGoals.textContent = board.goals + ' / ' + CFG.ATTEMPTS;
    e.rating.textContent = rating.label;
    e.resultMsg.textContent = rating.msg;
    e.newHigh.classList.toggle('show', rank === 1);
    e.newHigh.textContent = rank === 1 ? '★ NEW HIGH SCORE ★' : '';
    this.lastHsId = id;
    this.renderHighScores(table, id);
    this.hideBanner();
    this.showScreen('results');
    this.say('Final results. ' + this.g.player.name + ' scored ' + board.goals + ' of ' + CFG.ATTEMPTS +
      ' with ' + board.score + ' points. Rating: ' + rating.label + '.');
    const btn = $('btnAgain');
    if (btn) setTimeout(() => btn.focus(), 80);
  }

  /* ---- high scores ---------------------------------------------------- */

  renderHighScores(list, highlightId) {
    const body = this.el.hsBody;
    if (!body) return;
    if (!list || !list.length) {
      body.innerHTML = '<tr><td class="hs-empty" colspan="6">NO SCORES YET — BE THE FIRST CHAMPION!</td></tr>';
      if (this.el.hsCaption) this.el.hsCaption.textContent = 'TOP 10 — SAVED ON THIS DEVICE';
      return;
    }
    const rows = list.map((r, i) => {
      const t = teamById(r.team);
      const me = highlightId && r.id === highlightId ? ' class="me"' : '';
      return '<tr' + me + '>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td>' + escapeHtml(r.name) + '</td>' +
        '<td><span class="chip" style="background:' + t.primary + '"></span>' +
        escapeHtml(r.teamName || t.name).toUpperCase() + '</td>' +
        '<td class="num">' + r.score + '</td>' +
        '<td class="num">' + r.goals + '/' + (r.attempts || CFG.ATTEMPTS) + '</td>' +
        '<td>' + escapeHtml(r.date || '') + '</td>' +
        '</tr>';
    }).join('');
    body.innerHTML = rows;
    if (this.el.hsCaption) {
      this.el.hsCaption.textContent = 'TOP ' + list.length + ' — SAVED ON THIS DEVICE';
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ==========================================================================
   18. BOOT
   ========================================================================== */

let GAME = null;

function boot() {
  try {
    GAME = new Game();
    window.FREEKICK = GAME;      // handy for debugging in the console
  } catch (err) {
    /* never leave a blank screen — tell the player what happened */
    const host = $('screen-welcome') || document.body;
    const p = document.createElement('p');
    p.style.color = '#ff8f9a';
    p.style.padding = '1em';
    p.textContent = 'Startup error: ' + (err && err.message ? err.message : err);
    host.appendChild(p);
    throw err;
  }

  /* first gesture unlocks Web Audio + recorded samples on every browser */
  AUDIO.loadSamples();
  const unlock = () => { AUDIO.onUserGesture(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  /* stop the page rubber-banding while playing on mobile */
  document.addEventListener('touchmove', (e) => {
    if (document.body.classList.contains('playing')) e.preventDefault();
  }, { passive: false });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
