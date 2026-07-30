/* ==========================================================================
   FREEKICK: FIFA & FREEDOM  —  MODERN theme patch
   theme-modern.js
   --------------------------------------------------------------------------
   Loads AFTER game.js but BEFORE boot() (which waits for DOMContentLoaded),
   so every override below is in place by the time the Renderer is created.

   Nothing about gameplay, physics, scoring or input is touched here — this
   file only replaces how the pitch is painted:
     • 2x internal resolution with antialiasing instead of pixel upscaling
     • smooth gradient turf, glass hoardings, bloomed floodlights
     • rounded-corner sprites and a modern aiming reticle
   ========================================================================== */
'use strict';

(function modernTheme() {
  if (typeof Renderer === 'undefined') return;

  const R = Renderer.prototype;
  const SCALE = 2;                       // render at 960x540, display smooth

  const PAL = {
    skyTop: '#050d1a',
    skyBot: '#14284a',
    stand: '#0f2038',
    standHi: '#16304f',
    grassFar: '#1d7038',
    grassNear: '#37a352',
    line: 'rgba(255,255,255,.92)',
    violet: '#7d5cff',
    violetSoft: 'rgba(125,92,255,.30)',
  };

  /* ---- helpers --------------------------------------------------------- */

  function roundPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  /* soft-cornered replacement for px(), used only while drawing characters */
  function softPx(x, y, w, h, c) {
    const ctx = this.ctx;
    const ww = Math.max(0.6, w), hh = Math.max(0.6, h);
    ctx.fillStyle = c;
    roundPath(ctx, x, y, ww, hh, Math.min(ww, hh) * 0.34);
    ctx.fill();
  }

  /** run a drawing method with rounded rectangles instead of hard pixels */
  function softened(name) {
    const original = R[name];
    R[name] = function () {
      this.px = softPx;
      try { return original.apply(this, arguments); }
      finally { delete this.px; }
    };
  }

  /* ---- frame setup: high-res + antialiased ----------------------------- */

  R.beginFrame = function (dt) {
    const ctx = this.ctx;
    if (!this._hiRes) {
      this.cv.width = CFG.W * SCALE;
      this.cv.height = CFG.H * SCALE;
      this._hiRes = true;
    }
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, CFG.W, CFG.H);

    if (this.shake > 0.01) {
      this.shake *= Math.pow(0.001, dt);
      const a = this.shake;
      ctx.translate(rand(-a, a), rand(-a, a));
    } else {
      this.shake = 0;
    }
    if (this.netHit.t > 0) this.netHit.t -= dt;
    if (this.flashT > 0) this.flashT -= dt;
  };

  R.endFrame = function () {
    const ctx = this.ctx;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

    if (this.flashT > 0) {
      ctx.globalAlpha = clamp(this.flashT * 2.0, 0, 0.5);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.globalAlpha = 1;
    }

    /* cinematic vignette + a violet wash along the bottom */
    const v = ctx.createRadialGradient(CFG.W / 2, CFG.H * 0.44, CFG.H * 0.30,
                                       CFG.W / 2, CFG.H * 0.52, CFG.W * 0.76);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(2,8,18,.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    const b = ctx.createLinearGradient(0, CFG.H - 60, 0, CFG.H);
    b.addColorStop(0, 'rgba(125,92,255,0)');
    b.addColorStop(1, 'rgba(125,92,255,.14)');
    ctx.fillStyle = b;
    ctx.fillRect(0, CFG.H - 60, CFG.W, 60);
  };

  /* ---- typography on canvas ------------------------------------------- */

  R.text = function (str, x, y, opts) {
    const o = Object.assign({ size: 8, color: '#ffffff', align: 'center', bold: true, shadow: 'rgba(0,0,0,.6)' }, opts);
    const ctx = this.ctx;
    ctx.font = (o.bold ? '800 ' : '600 ') + o.size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = o.align;
    ctx.textBaseline = 'middle';
    if (o.shadow) {
      ctx.save();
      ctx.shadowColor = o.shadow;
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = o.color;
      ctx.fillText(str, x, y);
      ctx.restore();
    }
    ctx.fillStyle = o.color;
    ctx.fillText(str, x, y);
  };

  /* ---- sky + floodlight bloom ----------------------------------------- */

  R.drawSky = function (time) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, 118);
    g.addColorStop(0, PAL.skyTop);
    g.addColorStop(0.65, '#0d1c34');
    g.addColorStop(1, PAL.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.W, 118);

    for (const L of this.lights) {
      const flick = 0.9 + 0.1 * Math.sin(time * 3 + L.x);
      const rg = ctx.createRadialGradient(L.x, L.y + 8, 1, L.x, L.y + 8, 84);
      rg.addColorStop(0, 'rgba(214,232,255,' + (0.34 * flick).toFixed(3) + ')');
      rg.addColorStop(0.45, 'rgba(150,180,255,' + (0.10 * flick).toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(120,150,255,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(L.x - 84, L.y - 14, 168, 120);

      /* slim modern rig */
      ctx.fillStyle = '#0a1526';
      roundPath(ctx, L.x - 15, L.y, 30, 7, 3.5);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = 'rgba(236,245,255,' + (0.75 * flick).toFixed(2) + ')';
        roundPath(ctx, L.x - 12 + i * 6.6, L.y + 1.4, 4.6, 4.2, 1.6);
        ctx.fill();
      }
      ctx.fillStyle = '#0a1526';
      ctx.fillRect(L.x - 1, L.y + 7, 2, 8);
    }
  };

  /* ---- stands + crowd -------------------------------------------------- */

  R.drawStands = function (time) {
    const ctx = this.ctx;

    const g = ctx.createLinearGradient(0, 12, 0, 113);
    g.addColorStop(0, PAL.stand);
    g.addColorStop(0.55, PAL.standHi);
    g.addColorStop(1, '#0c1c31');
    ctx.fillStyle = g;
    ctx.fillRect(0, 12, CFG.W, 101);

    /* tier gaps as soft dark bands */
    ctx.fillStyle = 'rgba(3,10,20,.55)';
    ctx.fillRect(0, 55, CFG.W, 3);
    ctx.fillRect(0, 87, CFG.W, 3);

    /* roof shade */
    const rs = ctx.createLinearGradient(0, 12, 0, 46);
    rs.addColorStop(0, 'rgba(0,0,0,.62)');
    rs.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rs;
    ctx.fillRect(0, 12, CFG.W, 34);

    /* crowd — soft dots, still limited to 8 fps for that arcade cadence */
    const q = Math.floor(time * 8);
    for (const p of this.crowd) {
      const bob = Math.sin(q * 0.55 * p.rate + p.phase) > 0.15 ? -1 : 0;
      ctx.fillStyle = p.c;
      ctx.globalAlpha = 0.72;
      roundPath(ctx, p.x, p.y + bob, 3, 3.2, 1.5);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* haze so the crowd reads as background, not noise */
    const hz = ctx.createLinearGradient(0, 12, 0, 113);
    hz.addColorStop(0, 'rgba(10,22,40,.46)');
    hz.addColorStop(1, 'rgba(10,22,40,.14)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, 12, CFG.W, 101);

    /* flags */
    for (const f of this.flags) {
      const w = Math.sin(time * 2.6 + f.phase);
      ctx.fillStyle = 'rgba(226,236,255,.75)';
      ctx.fillRect(f.x, f.y, 1, f.h + 7);
      const bands = f.cols.length;
      const bh = Math.max(2, f.h / bands);
      for (let b = 0; b < bands; b++) {
        const skew = w * 2.2 + Math.sin(time * 3.4 + b) * 1.2;
        ctx.fillStyle = f.cols[b];
        ctx.globalAlpha = 0.92;
        ctx.fillRect(f.x + 1 + skew, f.y + b * bh, 11, bh);
      }
      ctx.globalAlpha = 1;
    }
  };

  /* ---- hoardings ------------------------------------------------------- */

  R.drawBoards = function (time, team) {
    const ctx = this.ctx;

    const g = ctx.createLinearGradient(0, 113, 0, 132);
    g.addColorStop(0, '#152a4a');
    g.addColorStop(1, '#0a1526');
    ctx.fillStyle = g;
    ctx.fillRect(0, 113, CFG.W, 19);
    ctx.fillStyle = 'rgba(125,92,255,.30)';
    ctx.fillRect(0, 113, CFG.W, 1.4);

    const msgs = [
      'KICKOFF 2026 — HFI FREEDOM CUP',
      'FOOTBALL UNITES US',
      'PLAY FREE, PLAY TOGETHER',
      'KICKOFF 2026 — HFI FREEDOM CUP',
      team.name.toUpperCase() + ' • ' + team.chant,
    ];
    const strip = msgs.join('   ✦   ') + '   ✦   ';

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 114, CFG.W, 17);
    ctx.clip();
    ctx.font = '800 8px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const wid = ctx.measureText(strip).width;
    const off = -((time * 26) % wid);
    for (let k = 0; k < 3; k++) {
      const x = off + k * wid;
      if (x > CFG.W) break;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillText(strip, x, 123.4);
      ctx.fillStyle = 'rgba(233,240,255,.94)';
      ctx.fillText(strip, x, 122.4);
    }
    ctx.restore();

    /* flag-tinted light spill along the base */
    const stripes = [
      ['#ff9933', 0.00, 0.14], ['#ffffff', 0.14, 0.24], ['#138808', 0.24, 0.34],
      ['#1b2a63', 0.52, 0.66], ['#ffffff', 0.66, 0.78], ['#e63946', 0.78, 0.94],
    ];
    ctx.globalAlpha = 0.55;
    for (const [c, a, b] of stripes) {
      ctx.fillStyle = c;
      ctx.fillRect(CFG.W * a, 131, CFG.W * (b - a), 1.8);
    }
    ctx.globalAlpha = 1;
  };

  /* ---- turf ------------------------------------------------------------ */

  R.drawPitch = function () {
    const ctx = this.ctx;

    /* base turf gradient: hazier far away, richer near the camera */
    const g = ctx.createLinearGradient(0, 132, 0, CFG.H);
    g.addColorStop(0, PAL.grassFar);
    g.addColorStop(0.45, '#2a8c45');
    g.addColorStop(1, PAL.grassNear);
    ctx.fillStyle = g;
    ctx.fillRect(0, 131, CFG.W, CFG.H - 131);

    /* mown stripes as gentle alpha bands in depth */
    for (let z = -4, i = 0; z <= 40; z += 2.6, i++) {
      if (i % 2) continue;
      const yA = groundY(z), yB = groundY(z + 2.6);
      ctx.fillStyle = 'rgba(255,255,255,.045)';
      ctx.fillRect(0, yA, CFG.W, Math.max(1, yB - yA));
    }

    /* markings */
    const hline = (z, w) => {
      const y = groundY(z);
      ctx.fillStyle = PAL.line;
      ctx.fillRect(0, y - w, CFG.W, w);
    };
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,.35)';
    ctx.shadowBlur = 3;
    hline(0, 1.8);
    hline(CFG.SIX_Z, 1.2);
    hline(CFG.BOX_Z, 1.6);
    ctx.restore();

    /* penalty spot */
    const ps = proj(0, 0, 11);
    ctx.fillStyle = PAL.line;
    ctx.beginPath();
    ctx.ellipse(ps.x, ps.y, 2.2, 1, 0, 0, Math.PI * 2);
    ctx.fill();

    /* free-kick line through the ball */
    const fy = groundY(CFG.BALL_Z);
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(0, fy - 1);
    ctx.lineTo(CFG.W, fy - 1);
    ctx.stroke();

    /* 9.15 m defensive arc */
    ctx.strokeStyle = 'rgba(255,255,255,.42)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    let first = true;
    for (let a = -78; a <= 78; a += 4) {
      const r = a * Math.PI / 180;
      const p = proj(Math.sin(r) * 9.15, 0, CFG.BALL_Z - Math.cos(r) * 9.15);
      if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };

  /* ---- goal frame ------------------------------------------------------ */

  R.drawGoalFrame = function () {
    const ctx = this.ctx;
    const GH = CFG.GOAL_HALF, H = CFG.GOAL_H;
    const tl = proj(-GH, H, 0), tr = proj(GH, H, 0);
    const bl = proj(-GH, 0, 0), br = proj(GH, 0, 0);
    const w = Math.max(2.4, CFG.POST_T * persp(0) * CFG.PPM * 2.6);

    const post = (x, yTop, yBot) => {
      const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, '#c9d6ea');
      g.addColorStop(0.42, '#ffffff');
      g.addColorStop(1, '#93a4bd');
      ctx.fillStyle = g;
      roundPath(ctx, x - w / 2, yTop, w, yBot - yTop, w * 0.42);
      ctx.fill();
    };

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    post(tl.x, tl.y, bl.y);
    post(tr.x, tr.y, br.y);

    /* crossbar */
    const cg = ctx.createLinearGradient(0, tl.y - w / 2, 0, tl.y + w / 2);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(1, '#9dadc4');
    ctx.fillStyle = cg;
    roundPath(ctx, tl.x - w / 2, tl.y - w / 2, (tr.x - tl.x) + w, w, w * 0.42);
    ctx.fill();
    ctx.restore();
  };

  /* ---- ball ------------------------------------------------------------ */

  const origBall = R.drawBall;
  R.drawBall = function (ball) {
    origBall.call(this, ball);
    /* extra rim light so the ball pops against bright turf */
    const p = proj(ball.x, ball.y, ball.z);
    const r = ball.radiusPx;
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = Math.max(0.5, r * 0.16);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.94, -2.4, -0.4);
    ctx.stroke();
  };

  /* ---- aiming reticle -------------------------------------------------- */

  R.drawAim = function (aim, power, showGuide, time, ballX) {
    const ctx = this.ctx;
    const bx = ballX || 0;
    const p = proj(aim.x, aim.y, 0);
    const outside = Math.abs(aim.x) > CFG.GOAL_HALF || aim.y > CFG.GOAL_H;
    const col = outside ? '#ff5d73' : '#2ee06a';

    if (showGuide) {
      const arc = 0.34 + aim.y * 0.42 + clamp(power / 100, 0, 1) * 0.5;
      const curve = (aim.x - bx) * 0.30;
      for (let i = 1; i <= 20; i++) {
        const t = i / 21;
        const z = CFG.BALL_Z * (1 - t);
        const x = lerp(bx, aim.x, t) + curve * Math.sin(Math.PI * t);
        const y = lerp(CFG.BALL_R, aim.y, t) + arc * Math.sin(Math.PI * Math.pow(t, 0.92));
        const q = proj(x, y, z);
        const rr = lerp(2.4, 1.0, i / 21);
        ctx.globalAlpha = 0.25 + 0.6 * (i / 21);
        ctx.fillStyle = i > 16 ? col : '#ffffff';
        ctx.beginPath();
        ctx.arc(q.x, q.y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* target ring with rotating ticks */
    const pulse = 1 + Math.sin(time * 5) * 0.06;
    const Rr = 8 * pulse;
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Rr, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = time * 1.4 + i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * (Rr + 2.5), p.y + Math.sin(a) * (Rr + 2.5));
      ctx.lineTo(p.x + Math.cos(a) * (Rr + 6), p.y + Math.sin(a) * (Rr + 6));
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  };

  /* ---- rounded characters --------------------------------------------- */

  softened('drawPlayer');
  softened('drawKeeper');

  /* ---- jersey preview: soft corners, no dither grid -------------------- */

  if (typeof window.drawJersey === 'function' || typeof drawJersey === 'function') {
    const origJersey = drawJersey;
    window.drawJersey = function (canvas, team, number) {
      origJersey(canvas, team, number);
      /* round the card corners by masking the outer edge */
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = '#fff';
      roundPath(ctx, 0, 0, canvas.width, canvas.height, canvas.width * 0.12);
      ctx.fill();
      ctx.restore();
    };
  }
})();
