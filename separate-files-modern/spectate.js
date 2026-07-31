/* ==========================================================================
   FREEKICK — LIVE SHOT ANNOUNCEMENTS
   spectate.js
   --------------------------------------------------------------------------
   So nobody is blind while a friend is shooting.

   The moment a player finishes a kick, a tiny message goes out over the
   WebSocket and every other screen shows a big, plain-English announcement:

       ⚽  GOAL!            ANANYA SCORES FOR INDIA!      +225
       🧤  SAVED!           THE KEEPER STOPS ANANYA
       😖  MISSED!          ANANYA PUT IT WIDE

   A goal brings confetti, fireworks and a crowd roar; a miss brings the groan.
   Under it sits a one-line running summary (kick 2 of 3 · 1 goal · 225 pts)
   so anyone glancing at the screen instantly knows what is going on.

   Why announcements rather than replaying the ball flight: this is far easier
   to read at a glance across a room of people, it cannot desync, and it works
   even on a poor connection. The scoreboard remains the source of truth.
   ========================================================================== */
'use strict';

(function spectate() {
  const G = Game.prototype;
  const U = UI.prototype;

  const HOLD_MS = 2600;        // how long an announcement stays up

  /* ==========================================================================
     1. WHAT HAPPENED, IN PLAIN WORDS
     ========================================================================== */

  function describe(p) {
    const who = (p.name || 'PLAYER').toUpperCase();
    const team = p.teamName ? p.teamName.toUpperCase() : '';
    const o = p.outcome;

    if (o === 'goal') {
      const flavour = p.corner === 'top' ? who + ' — TOP CORNER!'
        : p.corner === 'bottom' ? who + ' — BOTTOM CORNER!'
        : p.viaPost ? who + ' — OFF THE POST AND IN!'
        : p.power >= 92 ? who + ' — WHAT A STRIKE!'
        : who + ' SCORES FOR ' + team + '!';
      return { icon: '⚽', head: 'GOAL!', line: flavour, tone: 'goal' };
    }
    if (o === 'save') return { icon: '🧤', head: 'SAVED!', line: 'THE KEEPER STOPS ' + who, tone: 'save' };
    if (o === 'wide') return { icon: '😖', head: 'MISSED!', line: who + ' PUT IT WIDE', tone: 'bad' };
    if (o === 'over') return { icon: '🚀', head: 'OVER THE BAR!', line: who + ' BLASTED IT TOO HIGH', tone: 'bad' };
    if (o === 'post') return { icon: '😫', head: 'SO CLOSE!', line: who + ' HIT THE POST', tone: 'bad' };
    if (o === 'bar') return { icon: '😫', head: 'CROSSBAR!', line: who + ' RATTLED THE BAR', tone: 'bad' };
    if (o === 'wall') return { icon: '🧱', head: 'BLOCKED!', line: 'THE WALL STOPPED ' + who, tone: 'bad' };
    if (o === 'timeout') return { icon: '⏰', head: 'TOO SLOW!', line: who + ' RAN OUT OF TIME', tone: 'bad' };
    if (o === 'weak') return { icon: '😅', head: 'TOO SOFT!', line: who + "'S KICK DIDN'T REACH", tone: 'bad' };
    return { icon: '•', head: 'NO GOAL', line: who + ' DIDN\'T SCORE', tone: 'bad' };
  }

  /* ==========================================================================
     2. THE SHOOTER TELLS EVERYONE
     ========================================================================== */

  const prevFinish = G.finishShot;
  G.finishShot = function (res) {
    prevFinish.call(this, res);
    if (this.mode !== 'room' || !SESSION.active || !BACKEND.online) return;
    if (typeof LIVE === 'undefined' || !LIVE.connected) return;
    const me = SESSION.currentPlayer;
    if (!me) return;
    const corner = res.outcome === 'goal' && Math.abs(res.bx) > 2.2
      ? (res.by > 1.5 ? 'top' : res.by < 0.95 ? 'bottom' : null) : null;
    LIVE.publish('room:' + SESSION.code, 'shot', {
      by: me.id,
      name: me.name,
      teamId: me.teamId,
      teamName: (teamById(me.teamId) || {}).name || '',
      outcome: res.outcome,
      points: res.points || 0,
      power: Math.round(res.power || 0),
      viaPost: !!res.viaPost,
      corner: corner,
      kickNo: this.board.attempt,
      kicksTotal: CFG.ATTEMPTS,
      goals: this.board.goals,
      turnScore: this.board.score,
      totalScore: (me.total || 0) + this.board.score,
      round: SESSION.state ? (SESSION.state.round || 1) : 1,
    });
  };

  /* ==========================================================================
     3. EVERYONE ELSE SEES IT
     ========================================================================== */

  U.showRemoteShot = function (p) {
    const host = $('shotFlash');
    if (!host) return;
    /* never announce my own kick back at me */
    if (p.by && p.by === SESSION.me && !SESSION.hotSeat) return;

    const d = describe(p);
    const t = teamById(p.teamId) || { primary: '#ffd23f', flag: '' };
    const summary = 'KICK ' + (p.kickNo || 1) + ' OF ' + (p.kicksTotal || 3) +
      ' · ' + (p.goals || 0) + ' goal' + ((p.goals || 0) === 1 ? '' : 's') +
      ' · ' + (p.totalScore || 0) + ' pts';

    host.className = 'shot-flash show ' + d.tone;
    host.innerHTML =
      '<div class="sf-card" style="border-top-color:' + t.primary + '">' +
        '<div class="sf-icon">' + d.icon + '</div>' +
        '<div class="sf-head">' + d.head + '</div>' +
        '<div class="sf-line">' + escapeHtml(d.line) + '</div>' +
        (p.points > 0 ? '<div class="sf-points">+' + p.points + ' POINTS</div>' : '') +
        '<div class="sf-summary">' + t.flag + ' ' + escapeHtml(summary) + '</div>' +
      '</div>';

    /* celebrate or commiserate */
    const g = this.g;
    if (p.outcome === 'goal') {
      if (g.fx) {
        g.fx.confetti(90);
        g.fx.firework(0.05);
        g.fx.firework(0.35);
      }
      if (g.renderer) { g.renderer.flash('#ffffff', 0.14); g.renderer.kick(4); }
      if (!AUDIO.playSample('cheer')) AUDIO.crowdCheer(0.9);
      AUDIO.goal();
    } else if (p.outcome === 'save') {
      AUDIO.save();
      if (!AUDIO.playSample('aww')) AUDIO.crowdGroan();
    } else {
      if (!AUDIO.playSample('aww')) AUDIO.crowdGroan();
      if (g.renderer) g.renderer.flash('#ff5d73', 0.10);
    }

    clearTimeout(this._sfTimer);
    this._sfTimer = setTimeout(() => {
      host.classList.remove('show');
      host.innerHTML = '';
    }, HOLD_MS);

    /* keep the numbers honest even if the poll hasn't landed yet */
    this.renderRoomScoreboard();
  };
})();

/* ==========================================================================
   4. WATCHING THE ACTUAL KICK
   The shooter sends the handful of numbers that define the shot; every other
   browser redraws the identical ball flight with the same physics, so you
   really do watch your friend take the kick — then the announcement above
   lands as the ball arrives.
   ========================================================================== */

(function watchTheKick() {
  const G = Game.prototype;

  /* ---- the shooter publishes the shot as it leaves the boot ---------- */

  const prevKick = G.kick;
  G.kick = function (power) {
    const r = prevKick.call(this, power);
    if (this.mode !== 'room' || !SESSION.active || !BACKEND.online) return r;
    if (typeof LIVE === 'undefined' || !LIVE.connected) return r;
    const me = SESSION.currentPlayer;
    const sh = this.ball.shot;
    if (!me) return r;
    LIVE.publish('room:' + SESSION.code, 'kick', {
      by: me.id,
      name: me.name,
      teamId: me.teamId,
      ballX: this.ballX || 0,
      wallX: this.wallX || 0,
      /* the whole shot, in eight numbers */
      shot: sh ? {
        impactX: +sh.impactX.toFixed(3),
        impactY: +sh.impactY.toFixed(3),
        arc: +sh.arc.toFixed(3),
        curve: +sh.curve.toFixed(3),
        duration: +sh.duration.toFixed(3),
        power: Math.round(sh.power),
      } : null,
      /* and how the keeper committed, so his dive matches too */
      keeper: this.keeper.plan ? {
        dir: this.keeper.plan.dir,
        type: this.keeper.plan.type,
        reaction: +this.keeper.plan.reaction.toFixed(3),
        diveDur: +this.keeper.plan.diveDur.toFixed(3),
        startX: +this.keeper.plan.startX.toFixed(3),
      } : null,
    });
    return r;
  };

  /* ---- watchers rebuild the scene and play it ------------------------ */

  G.playRemoteKick = function (p) {
    if (this.state !== S.SPECTATE) return;                 /* only watchers */
    if (p.by && p.by === SESSION.me && !SESSION.hotSeat) return;
    if (!p.shot) return;                                   /* weak/timeout: banner only */

    /* dress the pitch as the shooter */
    const t = teamById(p.teamId);
    if (t) { this.player.teamId = p.teamId; this.player.name = p.name; }
    this.ballX = p.ballX || 0;
    this.wallX = p.wallX || 0;

    this.ball.reset();
    this.ball.x = this.ballX;
    this.kicker.reset();
    this.kicker.x = this.ballX - 0.75;
    this.kicker.setPose('kick');
    this.keeper.reset();
    this.keeper.setReady();

    this.ball.launch(p.shot);
    if (p.keeper) { this.keeper.plan = p.keeper; this.keeper.timer = 0; }

    this.remoteShot = p;
    this.remoteHold = 0;
    AUDIO.kick(p.shot.power);
    this.renderer.kick(2 + clamp(p.shot.power / 100, 0, 1) * 5);
    this.ui.syncHud();
  };

  /** advance a watched shot; mirrors the real flight, minus scoring */
  G.updateRemoteFlight = function (dt) {
    const b = this.ball;
    b.update(dt);
    this.keeper.updateDive(dt);
    this.kicker.update(dt);

    if (b.mode === 'flight' && b.t >= 1) {
      b.t = 1;
      const pos = b.sample(1);
      b.x = pos.x; b.y = pos.y; b.z = 0;
      b.goFree();
      /* woodwork and net sounds so it lands with some weight */
      const gh = CFG.GOAL_HALF, tol = CFG.BALL_R + CFG.POST_T;
      if (Math.abs(Math.abs(b.x) - gh) <= tol) AUDIO.post();
      else if (Math.abs(b.y - CFG.GOAL_H) <= tol) AUDIO.crossbar();
      else if (Math.abs(b.x) < gh && b.y < CFG.GOAL_H) {
        const gp = proj(b.x, b.y, 0);
        this.renderer.rippleNet(gp.x, gp.y);
        AUDIO.netSwish();
      }
    }

    /* let the ball settle, then hand the pitch back to the idle scene */
    if (b.mode === 'stopped' || b.z < -CFG.GOAL_DEPTH - 4 || b.z > CFG.BALL_Z + 8) {
      this.remoteHold += dt;
      if (this.remoteHold > 1.6) this.clearRemoteShot();
    }
  };

  G.clearRemoteShot = function () {
    this.remoteShot = null;
    this.remoteHold = 0;
    this.ball.reset();
    this.keeper.reset();
    this.keeper.setReady();
    this.kicker.reset();
    this.kicker.setPose('idle');
  };
})();
