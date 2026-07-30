
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
    const x = lerp(0, s.impactX, tt) + curveOff;
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
    let read = 0.74 - 0.30 * cornerness - 0.24 * pn + rand(-0.10, 0.12);
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
    if (p.type === 'stay') {
      return { x0: this.x - 0.95, x1: this.x + 0.95, y0: 0, y1: 1.78 };
    }
    if (p.type === 'jump') {
      const g = 0.55 + 0.5 * e;
      return { x0: this.x - 1.05 * g, x1: this.x + 1.05 * g, y0: 0.42, y1: 0.9 + 1.6 * e };
    }
    const reach = p.type === 'diveLow' ? 2.95 : 2.65;
    const hand = p.startX + p.dir * e * reach;
    const pad = 0.52;
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
      this.x = lerp(-0.75, -0.34, k);
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
