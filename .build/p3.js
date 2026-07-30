
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
      { y0: 16, y1: 58, step: 4, rowH: 5 },
      { y0: 60, y1: 92, step: 4, rowH: 5 },
      { y0: 94, y1: 116, step: 4, rowH: 5 },
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
        y: randInt(6, 13),
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
    const g = ctx.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, SKY_TOP);
    g.addColorStop(1, SKY_BOT);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, 120);

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
    this.px(0, 12, CFG.W, 106, '#2b2b52');
    /* tier separators */
    this.px(0, 58, CFG.W, 3, '#1a1a34');
    this.px(0, 92, CFG.W, 3, '#1a1a34');
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
    this.px(0, 118, CFG.W, 12, '#101028');
    this.px(0, 118, CFG.W, 2, '#3a3a6a');
    this.px(0, 129, CFG.W, 2, '#07070f');

    const msgs = [
      'FREEDOM CUP  —  INDIA × USA',
      'FOOTBALL UNITES US',
      'PLAY FREE, PLAY TOGETHER',
      'FREEDOM CUP  —  INDIA × USA',
      team.name.toUpperCase() + '  •  ' + team.chant,
    ];
    const strip = msgs.join('   ★   ') + '   ★   ';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 119, CFG.W, 11);
    ctx.clip();
    ctx.font = 'bold 8px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const wid = ctx.measureText(strip).width;
    let off = -((time * 26) % wid);
    for (let k = 0; k < 3; k++) {
      const x = off + k * wid;
      if (x > CFG.W) break;
      ctx.fillStyle = '#0a0a14';
      ctx.fillText(strip, x + 1, 125.5);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(strip, x, 124.5);
    }
    ctx.restore();

    /* flag-coloured board lighting */
    const stripes = [
      ['#ff9933', 0.00, 0.14], ['#ffffff', 0.14, 0.24], ['#138808', 0.24, 0.34],
      ['#1b2a63', 0.52, 0.66], ['#ffffff', 0.66, 0.78], ['#e63946', 0.78, 0.94],
    ];
    for (const [c, a, b] of stripes) {
      this.px(CFG.W * a, 130, CFG.W * (b - a), 2, c);
    }
  }

  drawPitch() {
    const ctx = this.ctx;
    /* grass mowing stripes, drawn as depth bands */
    const bands = [];
    for (let z = -5; z <= 34; z += 2.6) bands.push(z);
    for (let i = 0; i < bands.length - 1; i++) {
      const yA = groundY(bands[i]);
      const yB = groundY(bands[i + 1]);
      const dark = i % 2 === 0;
      ctx.fillStyle = dark ? '#2a7f39' : '#33933f';
      ctx.fillRect(0, Math.round(yA), CFG.W, Math.ceil(yB - yA) + 1);
    }
    /* far grass strip behind the boards */
    ctx.fillStyle = '#256d31';
    ctx.fillRect(0, 131, CFG.W, Math.round(groundY(-5)) - 131 + 1);

    /* subtle low-res texture speckle */
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 150; i++) {
      const y = 134 + Math.random() * (CFG.H - 134);
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
    const unit = (1.82 * s * CFG.PPM) / 26;    // 1.82 m tall over 26 rows
    if (unit < 0.35) return;
    const ctx = this.ctx;
    const dir = flip ? -1 : 1;

    const P = (gx, gy, gw, gh, c) => {
      this.px(p.x + (gx - 8) * unit * dir - (dir < 0 ? gw * unit : 0), p.y - (26 - gy) * unit, gw * unit, gh * unit, c);
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
    const unit = (1.88 * s * CFG.PPM) / 26;
    const ctx = this.ctx;
    const P = (gx, gy, gw, gh, c) => {
      this.px(p.x + (gx - 8) * unit, p.y - (26 - gy) * unit, gw * unit, gh * unit, c);
    };
    const skin = '#d09a68';
    const f = Math.floor(t * 8) % 4;
    const pose = k.pose;
    const e = k.eased || 0;

    /* dive tilt: shift the whole body horizontally and drop it */
    let tilt = 0, drop = 0, spread = 0, armUp = 0;
    if (pose === 'diveLeft' || pose === 'diveRight') {
      const d = pose === 'diveLeft' ? -1 : 1;
      tilt = d * e * 5;
      drop = (k.plan && k.plan.type === 'diveLow') ? e * 9 : e * 4;
      spread = e * 6 * d;
      armUp = (k.plan && k.plan.type === 'diveHigh') ? -4 : 2;
    } else if (pose === 'jump') {
      drop = -e * 7;
      armUp = -6;
    } else if (pose === 'catch') {
      armUp = -1;
    } else if (pose === 'beaten') {
      drop = 8; tilt = k.dir * 5;
    } else if (pose === 'celebrate') {
      armUp = -7;
      drop = f % 2 === 0 ? -2 : 0;
    } else if (pose === 'ready') {
      spread = 2;
      armUp = -2 + (f === 1 || f === 3 ? -1 : 0);
    } else {
      armUp = f === 2 ? -1 : 0;
    }

    const yb = 8 - drop;

    /* legs */
    P(5 + tilt - spread * 0.4, yb, 3, 9, kit.socks);
    P(8 + tilt + spread * 0.4, yb, 3, 9, kit.socks);
    P(5 + tilt - spread * 0.4, yb + 5, 3, 5, kit.shorts);
    P(8 + tilt + spread * 0.4, yb + 5, 3, 5, kit.shorts);
    P(4 + tilt - spread * 0.4, yb - 1, 4, 2, '#17181f');
    P(8 + tilt + spread * 0.4, yb - 1, 4, 2, '#17181f');

    /* torso */
    P(4 + tilt, 15 - drop, 8, 8, kit.shirt);
    P(4 + tilt, 18 - drop, 8, 1, kit.shirt2);
    P(4 + tilt, 21 - drop, 8, 1, kit.accent);

    /* arms — this is what actually "reaches" visually */
    const reachL = pose === 'diveLeft' ? -6 - e * 5 : (pose === 'jump' ? -4 : -2);
    const reachR = pose === 'diveRight' ? 6 + e * 5 : (pose === 'jump' ? 4 : 2);
    P(4 + tilt + reachL, 17 - drop + armUp, 3, 3, kit.shirt2);
    P(2 + tilt + reachL, 16 - drop + armUp, 3, 3, '#f2f2f2');   // glove
    P(9 + tilt + reachR, 17 - drop + armUp, 3, 3, kit.shirt2);
    P(11 + tilt + reachR, 16 - drop + armUp, 3, 3, '#f2f2f2');  // glove

    /* head */
    P(6 + tilt, 22 - drop, 4, 4, skin);
    P(6 + tilt, 25 - drop, 4, 1, '#1d1710');
    P(8 + tilt, 23 - drop, 1, 1, '#0a0a14');
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

  drawAim(aim, power, showGuide, time) {
    const ctx = this.ctx;
    const p = proj(aim.x, aim.y, 0);

    /* dotted trajectory guide (deliberately approximate) */
    if (showGuide) {
      const arc = 0.34 + aim.y * 0.42 + clamp(power / 100, 0, 1) * 0.5;
      const curve = -aim.x * 0.28;
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      for (let i = 1; i <= 15; i++) {
        const t = i / 16;
        const z = CFG.BALL_Z * (1 - t);
        const x = lerp(0, aim.x, t) + curve * Math.sin(Math.PI * t);
        const y = lerp(CFG.BALL_R, aim.y, t) + arc * Math.sin(Math.PI * Math.pow(t, 0.92));
        const q = proj(x, y, z);
        const sz = i > 11 ? 1 : 2;
        ctx.globalAlpha = 0.28 + 0.5 * (i / 16);
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
