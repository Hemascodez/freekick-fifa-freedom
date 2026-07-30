
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

      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': this.held.left = true; break;
        case 'ArrowRight': case 'd': case 'D': this.held.right = true; break;
        case 'ArrowUp': case 'w': case 'W': this.held.up = true; break;
        case 'ArrowDown': case 's': case 'S': this.held.down = true; break;
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
        case 'ArrowLeft': case 'a': case 'A': this.held.left = false; break;
        case 'ArrowRight': case 'd': case 'D': this.held.right = false; break;
        case 'ArrowUp': case 'w': case 'W': this.held.up = false; break;
        case 'ArrowDown': case 's': case 'S': this.held.down = false; break;
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
    this.aim = { x: 0, y: 1.1 };
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
      shorts: t.trim === '#ffffff' ? '#f0f0f0' : t.trim,
      socks: t.secondary, pattern: t.pattern,
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
    AUDIO.whistle();
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
    this.aim = { x: rand(-0.4, 0.4), y: 1.1 };
    this.power = 0;
    this.lastResult = null;
    this.celebrating = false;
    this.wallX = rand(-1.7, 1.7);
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
      aimX: this.aim.x,
      aimY: this.aim.y,
      impactX,
      impactY,
      arc: 0.34 + this.aim.y * 0.42 + pn * 0.5,
      curve: -this.aim.x * 0.28 + rand(-0.12, 0.12),
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
        AUDIO.crowdGroan();
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
      AUDIO.crowdGroan();
      return;
    }

    /* --- missed the frame entirely --- */
    if (Math.abs(bx) > GH) {
      b.goFree();
      this.finishShot({
        outcome: 'wide', bx, by, power, viaPost: false,
        title: 'WIDE!', sub: 'DRAGGED IT PAST THE POST', tone: 'bad',
      });
      AUDIO.crowdGroan();
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
      AUDIO.crowdGroan();
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

    if (strong || Math.random() < 0.45) {
      k.pose = 'deflect';
      b.vx = (k.dir || (Math.random() < 0.5 ? -1 : 1)) * rand(3, 8);
      b.vy = rand(1.5, 4.5);
      b.vz = Math.abs(b.vz) * 0.35 + rand(1.5, 4);
      const hp = proj(b.x, b.y, 0);
      this.fx.spark(hp.x, hp.y, 10, ['#ffffff', '#8fd0ee'], 80);
    } else {
      k.pose = 'catch';
      b.mode = 'stopped';
      b.vx = b.vy = b.vz = 0;
    }
    AUDIO.save();
    AUDIO.crowdCheer(0.35);
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
    AUDIO.crowdCheer(1);
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
    if (h.left) { this.aim.x -= CFG.AIM_SPEED_X * dt; moved = true; }
    if (h.right) { this.aim.x += CFG.AIM_SPEED_X * dt; moved = true; }
    if (h.up) { this.aim.y += CFG.AIM_SPEED_Y * dt; moved = true; }
    if (h.down) { this.aim.y -= CFG.AIM_SPEED_Y * dt; moved = true; }
    this.aim.x = clamp(this.aim.x, -CFG.AIM_X_MAX, CFG.AIM_X_MAX);
    this.aim.y = clamp(this.aim.y, CFG.AIM_Y_MIN, CFG.AIM_Y_MAX);
    if (moved) this.ui.syncAim(this.aim, this.power);
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
        AUDIO.crowdGroan();
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
      AUDIO.crowdCheer(1);
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
    const showMatch = IN_MATCH[this.state] || this.state === S.FINAL_RESULTS;

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
      R.drawAim(this.aim, this.power, true, this.time);
    }

    /* attempt caption burned into the pitch during READY */
    if (this.state === S.READY) {
      R.text('ATTEMPT ' + (this.board.attempt + 1) + ' OF ' + CFG.ATTEMPTS, CFG.W / 2, 150, { size: 11, color: '#ffd23f' });
      R.text('AIM WITH ARROWS  •  HOLD SPACE FOR POWER', CFG.W / 2, 164, { size: 7, color: '#fff6d8' });
    }

    this.fx.draw(R.ctx);
    R.endFrame();
  }
}
