/* ==========================================================================
   FREEKICK — LIVE ROOM PLAY
   room-live.js
   --------------------------------------------------------------------------
   Everything that makes a friendly match feel shared:
     • every player in the room is drawn beside the pitch as a spectator,
       with a nameplate showing name, kit, score and status
     • the active shooter is highlighted; everyone else waits in a side zone
     • a live scoreboard panel next to the field, ranked, updating after
       every single attempt (not just at the end of a turn)
     • a final results screen with rankings, team totals and a winner
   ========================================================================== */
'use strict';

(function roomLive() {

  /* ==========================================================================
     1. PER-ATTEMPT LIVE SYNC
     ========================================================================== */

  /** push my running progress so the rest of the room sees it immediately */
  RoomSession.prototype.updateProgress = function (patch) {
    if (!this.state) return Promise.resolve();
    const cur = this.currentPlayer;
    if (!cur) return Promise.resolve();
    Object.assign(cur, patch);
    return this.push();
  };

  const G = Game.prototype;

  /* after every attempt in a room match, publish the running total */
  const origFinish = G.finishShot;
  G.finishShot = function (res) {
    origFinish.call(this, res);
    if (this.mode === 'room' && SESSION.active) {
      SESSION.updateProgress({
        score: this.board.score,
        goals: this.board.goals,
        attempts: this.board.attempt,
        left: this.board.kicksLeft,
        status: this.board.kicksLeft > 0 ? 'playing' : 'finished',
        lastOutcome: res.outcome,
      }).then(() => this.ui.renderRoomScoreboard());
      this.ui.renderRoomScoreboard();
    }
  };

  /* the moment a turn begins, mark the shooter as live */
  const origStart = G.startMatch;
  G.startMatch = function (name, teamId) {
    const r = origStart.call(this, name, teamId);
    if (this.mode === 'room' && SESSION.active) {
      SESSION.updateProgress({ status: 'playing', left: CFG.ATTEMPTS, attempts: 0 });
      this.ui.renderRoomScoreboard();
    }
    return r;
  };

  /* ==========================================================================
     2. SPECTATORS ON THE FIELD
     ========================================================================== */

  /**
   * Waiting players stand in two arcs behind the free-kick spot, well clear
   * of the ball and the shooting lane so they never block the view.
   */
  function spectatorSpot(i, total) {
    const side = i % 2 === 0 ? -1 : 1;          // alternate left / right
    const rank = Math.floor(i / 2);
    return {
      x: side * (4.6 + rank * 1.9),
      z: CFG.BALL_Z + 1.6 + (rank % 2) * 1.5,
    };
  }

  const origDraw = G.draw;
  G.draw = function (dt) {
    origDraw.call(this, dt);
    if (this.mode !== 'room' || !SESSION.active) return;
    if (!IN_MATCH[this.state] && this.state !== S.FINAL_RESULTS) return;

    const R = this.renderer;
    const cur = SESSION.currentPlayer;
    const others = SESSION.players.filter((p) => !cur || p.id !== cur.id);

    others.forEach((p, i) => {
      const spot = spectatorSpot(i, others.length);
      const t = teamById(p.teamId);
      const kit = {
        shirt: t.primary, shirt2: t.secondary, accent: t.accent,
        shorts: t.shorts, socks: t.socks, pattern: t.pattern,
        skin: '#c98a5a', hair: '#241a12',
      };
      R.shadow(spot.x, spot.z, 0.55);
      const pose = p.status === 'finished' ? 'idle' : 'ready';
      R.drawPlayer(spot.x, spot.z, kit, pose, this.time + i * 0.7, spot.x > 0);
    });
  };

  /* ==========================================================================
     3. LIVE SCOREBOARD BESIDE THE FIELD
     ========================================================================== */

  const U = UI.prototype;

  /**
   * Nameplates are real DOM text, positioned as a percentage of the canvas
   * box, so they stay pin-sharp at any scale and need no per-frame updates.
   */
  U.renderSpectatorLabels = function () {
    const host = $('specLabels');
    if (!host) return;
    const on = this.g.mode === 'room' && SESSION.active &&
               (IN_MATCH[this.g.state] || this.g.state === S.FINAL_RESULTS);
    if (!on) { host.innerHTML = ''; return; }

    const cur = SESSION.currentPlayer;
    const others = SESSION.players.filter((p) => !cur || p.id !== cur.id);
    host.innerHTML = others.map((p, i) => {
      const spot = spectatorSpot(i, others.length);
      const q = proj(spot.x, 2.5, spot.z);
      const t = teamById(p.teamId);
      const state = (p.status === 'finished' || p.done) ? 'finished'
        : p.status === 'playing' ? 'playing' : 'waiting';
      const meta = state === 'finished' ? (p.score || 0) + ' PTS · ' + (p.goals || 0) + 'G'
        : state === 'playing' ? 'SHOOTING' : 'WAITING';
      return '<div class="spec-label ' + state + '" style="left:' +
        (q.x / CFG.W * 100).toFixed(2) + '%;top:' + (q.y / CFG.H * 100).toFixed(2) +
        '%;border-top-color:' + t.primary + '">' +
        '<span class="sl-name">' + escapeHtml(p.name) + '</span>' +
        '<span class="sl-meta">' + meta + '</span></div>';
    }).join('');
  };

  /** a clear statement of whose turn it is, for shooter and spectators alike */
  U.renderTurnBanner = function () {
    const el = $('turnBanner');
    if (!el) return;
    const st = SESSION.state;
    /* stand down while the big result banner is on screen, or they collide */
    const on = this.g.mode === 'room' && SESSION.active && st && st.status === 'playing' &&
               this.g.state !== S.RESULT &&
               (IN_MATCH[this.g.state] || this.g.state === S.FINAL_RESULTS);
    el.classList.toggle('show', !!on);
    if (!on) return;

    const cur = SESSION.currentPlayer;
    if (!cur) { el.classList.remove('show'); return; }
    const mine = SESSION.hotSeat ? true : cur.id === SESSION.me;
    const t = teamById(cur.teamId);
    const left = typeof cur.left === 'number' ? cur.left : CFG.ATTEMPTS;
    const queue = SESSION.players.filter((p) => !p.done && p.id !== cur.id);
    const nextUp = queue.length ? queue[0].name : null;

    el.className = 'turn-banner show ' + (mine ? 'mine' : 'watching');
    el.innerHTML = (mine ? "YOUR TURN — " + escapeHtml(cur.name) : escapeHtml(cur.name) + "'S TURN") +
      '<span class="tb-sub">' + t.name.toUpperCase() + ' · ' + left + ' kick' + (left === 1 ? '' : 's') + ' left' +
      (mine ? '' : ' · you are watching') +
      (nextUp ? ' · next: ' + escapeHtml(nextUp) : '') + '</span>';
  };

  U.renderRoomScoreboard = function () {
    const panel = $('roomBoard');
    if (!panel) return;
    const show = this.g.mode === 'room' && SESSION.active;
    panel.classList.toggle('show', !!show);
    if (!show) return;

    const cur = SESSION.currentPlayer;
    const rows = SESSION.standings.map((p, i) => {
      const t = teamById(p.teamId);
      const isCur = cur && p.id === cur.id;
      const status = p.status === 'finished' || p.done ? 'FINISHED'
        : isCur ? 'PLAYING NOW'
        : p.status === 'playing' ? 'PLAYING' : 'WAITING';
      const left = (p.done || p.status === 'finished') ? 0
        : (typeof p.left === 'number' ? p.left : CFG.ATTEMPTS);
      return '<li class="rb-row' + (isCur ? ' now' : '') + '">' +
        '<span class="rb-rank">' + (i + 1) + '</span>' +
        '<span class="rb-chip" style="background:' + t.primary + '"></span>' +
        '<span class="rb-name">' + escapeHtml(p.name) +
          '<em>' + t.name.toUpperCase() + '</em></span>' +
        '<span class="rb-nums">' +
          '<b>' + (p.score || 0) + '</b>' +
          '<em>' + (p.goals || 0) + 'G · ' + left + ' left</em>' +
        '</span>' +
        '<span class="rb-status ' + status.toLowerCase().replace(/ /g, '-') + '">' + status + '</span>' +
        '</li>';
    }).join('');

    panel.innerHTML =
      '<div class="rb-head">ROOM ' + SESSION.code + ' · LIVE</div>' +
      '<ol class="rb-list">' + rows + '</ol>';

    this.renderSpectatorLabels();
    this.renderTurnBanner();
  };

  /* keep it in step with the room and with the HUD */
  const origSyncHud = U.syncHud;
  U.syncHud = function () {
    origSyncHud.call(this);
    this.renderRoomScoreboard();
  };

  /* state changes flip the banner between "your turn" and the result */
  const origOnState = U.onState;
  U.onState = function (st) {
    origOnState.call(this, st);
    if (this.g.mode === 'room') { this.renderTurnBanner(); this.renderSpectatorLabels(); }
  };

  const origRenderRoom = U.renderRoom;
  U.renderRoom = function () {
    origRenderRoom.call(this);
    this.renderRoomScoreboard();
    if (SESSION.active && SESSION.state && SESSION.state.status === 'done') {
      this.renderRoomFinal();
    }
  };

  /* ==========================================================================
     4. FINAL ROOM RESULTS
     ========================================================================== */

  U.renderRoomFinal = function () {
    const host = $('roomFinal');
    if (!host) return;
    const st = SESSION.state;
    if (!st || st.status !== 'done') { host.innerHTML = ''; host.classList.remove('show'); return; }

    const board = SESSION.standings;
    const winner = SESSION.winner;

    /* team totals: several players may share a kit */
    const teams = {};
    board.forEach((p) => {
      const t = teamById(p.teamId);
      const e = teams[p.teamId] || (teams[p.teamId] = { name: t.name, flag: t.flag, primary: t.primary, total: 0, goals: 0, players: 0 });
      e.total += p.score || 0;
      e.goals += p.goals || 0;
      e.players += 1;
    });
    const teamRows = Object.values(teams).sort((a, b) => b.total - a.total);
    const topTeam = teamRows[0];
    const teamTie = teamRows.length > 1 && teamRows[1].total === topTeam.total;

    host.classList.add('show');
    host.innerHTML =
      '<div class="rf-title">🏁 FINAL RESULTS</div>' +
      (winner
        ? '<div class="rf-winner">🏆 ' + escapeHtml(winner.name) + ' WINS — ' + winner.score + ' PTS · ' + winner.goals + '/3 GOALS</div>'
        : '<div class="rf-winner tie">IT\'S A TIE AT THE TOP!</div>') +
      '<div class="rf-cols">' +
        '<div><h4>PLAYER RANKINGS</h4><ol class="rf-list">' +
          board.map((p) => {
            const t = teamById(p.teamId);
            return '<li><span class="rb-chip" style="background:' + t.primary + '"></span>' +
              escapeHtml(p.name) + ' <em>' + t.name.toUpperCase() + '</em>' +
              '<b>' + (p.score || 0) + '</b><span class="rf-g">' + (p.goals || 0) + '/3</span></li>';
          }).join('') +
        '</ol></div>' +
        '<div><h4>TEAM TOTALS</h4><ol class="rf-list">' +
          teamRows.map((t) =>
            '<li><span class="rb-chip" style="background:' + t.primary + '"></span>' +
            t.flag + ' ' + t.name.toUpperCase() +
            ' <em>' + t.players + 'p</em><b>' + t.total + '</b>' +
            '<span class="rf-g">' + t.goals + 'G</span></li>').join('') +
        '</ol></div>' +
      '</div>' +
      '<div class="rf-team">' +
        (teamTie ? 'TEAM RESULT: DRAW' : 'WINNING TEAM: ' + topTeam.flag + ' ' + topTeam.name.toUpperCase() + ' (' + topTeam.total + ' PTS)') +
      '</div>';
  };

  /* ==========================================================================
     5. HIDE THE BOARD OUTSIDE ROOM PLAY
     ========================================================================== */

  const origSetMode = U.setMode;
  U.setMode = function (mode) {
    origSetMode.call(this, mode);
    const panel = $('roomBoard');
    if (panel && mode !== 'room') panel.classList.remove('show');
    if (mode !== 'room') {
      const lb = $('specLabels'); if (lb) lb.innerHTML = '';
      const tb = $('turnBanner'); if (tb) tb.classList.remove('show');
    }
  };
})();
