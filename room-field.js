/* ==========================================================================
   FREEKICK — LIVE MATCH ON THE FIELD
   room-field.js
   --------------------------------------------------------------------------
   Keeps the whole Private Room / Team Match experience ON the football field
   instead of a separate panel. Once a match kicks off, everyone sits on the
   pitch: the shooter takes their kicks, everyone else spectates the scene with
   name-plates, a compact top-right leaderboard, and turn overlays drawn right
   over the field.

   Nothing here removes the room panel — it remains the lobby (join, pick your
   side, wait for kick-off). This layer only takes over once play begins.

   Loads after room-ui / room-live / room-teams so its wrappers sit outermost.
   ========================================================================== */
'use strict';

(function roomField() {
  const U = UI.prototype;
  const G = Game.prototype;

  /* ==========================================================================
     1. INSTRUCTIONS — shown once ever, then remembered
     ========================================================================== */

  const prevShowInstructions = U.showInstructions;
  U.showInstructions = function () {
    const seen = !!Prefs.read().instructionsSeen;
    if (seen) { this.beginChallenge(); return; }   // straight into the kicks
    Prefs.merge({ instructionsSeen: true });
    prevShowInstructions.call(this);
  };

  /* ==========================================================================
     2. MOVING EVERYONE ONTO THE FIELD ONCE PLAY BEGINS
     ========================================================================== */

  U.enterFieldSpectate = function () {
    this.setMode('room');
    if (!$('screen-game').classList.contains('active')) this.showScreen('game');
    if (!IN_MATCH[this.g.state]) this.g.setState(S.SPECTATE);
    this.g.ui.syncHud();
    this.renderRoomScoreboard();
    this.renderFieldOverlay();
  };

  /** called on every room update; decides whether to sit on the field */
  U.maybeEnterField = function () {
    if (this.g.mode !== 'room' || !SESSION.active) return;
    const st = SESSION.state;
    if (!st) return;
    if (st.status === 'lobby') return;                 // lobby stays on the panel
    if (this._shootingTurn) { this.renderFieldOverlay(); return; }  // I'm mid-kicks
    if (IN_MATCH[this.g.state]) return;                // safety: a live state is running
    this.enterFieldSpectate();
  };

  /* fold the field logic into the existing room render pass */
  const prevRenderRoom = U.renderRoom;
  U.renderRoom = function () {
    prevRenderRoom.call(this);
    this.maybeEnterField();
  };

  /* keep the field overlay's countdown ticking with the turn watch */
  const prevTurnPrompt = U.renderTurnPrompt;
  U.renderTurnPrompt = function () {
    prevTurnPrompt.call(this);
    this.renderFieldOverlay();
  };

  /* ==========================================================================
     3. THE FIELD OVERLAY — turn accept, watching, next player, final
     ========================================================================== */

  U.renderFieldOverlay = function () {
    const host = $('fieldOverlay');
    if (!host) return;
    const onField = $('screen-game') && $('screen-game').classList.contains('active');
    const st = SESSION.state;

    if (!onField || this.g.mode !== 'room' || !SESSION.active || !st) {
      host.classList.remove('show'); host.innerHTML = ''; return;
    }

    /* ---- match over: standings + winner + celebration ---- */
    if (st.status === 'done') {
      host.className = 'field-overlay show done';
      host.innerHTML = this.fieldFinalHtml();
      this.wireFieldFinal();
      this.celebrateWinner();
      return;
    }

    if (st.status !== 'playing') { host.classList.remove('show'); host.innerHTML = ''; return; }
    this._celebrated = false;   // a fresh/continuing match can celebrate again later

    const cur = SESSION.currentPlayer;
    if (!cur) { host.classList.remove('show'); host.innerHTML = ''; return; }
    const mine = SESSION.hotSeat ? true : cur.id === SESSION.me;

    /* the shooter, once they've started, gets a clear field — they're playing */
    if (cur.started && (mine || this._shootingTurn)) { host.classList.remove('show'); host.innerHTML = ''; return; }

    const t = teamById(cur.teamId);
    const secs = Math.max(0, Math.ceil(SESSION.turnSecondsLeft()));
    const nextP = (st.players || []).filter((p) => !p.done && p.id !== cur.id)
      .find((p) => SESSION.isTeamRoom ? p.teamId !== cur.teamId : true) ||
      (st.players || []).filter((p) => !p.done && p.id !== cur.id)[0];
    const nextLine = nextP
      ? '<div class="fo-next">NEXT: ' + escapeHtml(nextP.name) + ' · ' + teamById(nextP.teamId).name.toUpperCase() + '</div>'
      : '<div class="fo-next">LAST TURN OF THE MATCH</div>';

    const urgent = secs <= 3;
    host.className = 'field-overlay show ' + (mine ? 'mine' : 'watching') + (urgent ? ' urgent' : '');

    if (cur.started) {
      /* someone else is taking their kicks */
      host.innerHTML =
        '<div class="fo-card watching">' +
          '<div class="fo-line">' + escapeHtml(cur.name) + ' IS SHOOTING</div>' +
          '<div class="fo-team"><span class="rb-chip" style="background:' + t.primary + '"></span>' + t.name.toUpperCase() + '</div>' +
          '<div class="fo-sub">Watch the live scores update top-right.</div>' +
          nextLine +
        '</div>';
      return;
    }

    /* a turn is waiting to be accepted */
    const opp = SESSION.otherTeam ? SESSION.otherTeam(cur.teamId) : null;
    host.innerHTML =
      '<div class="fo-card">' +
        '<div class="fo-line">' + (mine ? escapeHtml(cur.name) + ', IT&rsquo;S YOUR TURN!' : escapeHtml(cur.name) + ' IS UP') + '</div>' +
        '<div class="fo-team"><span class="rb-chip" style="background:' + t.primary + '"></span>' + t.name.toUpperCase() + '</div>' +
        '<div class="fo-count' + (urgent ? ' urgent' : '') + '">' + secs + 's</div>' +
        (mine
          ? '<button class="btn big" id="btnFieldPlay" type="button">▶ PLAY</button>' +
            '<div class="fo-sub">Press PLAY within ' + TURN.ACCEPT_SECONDS + 's or your turn is skipped' +
              (opp ? ' and ' + TURN.SKIP_BONUS + ' points go to ' + teamById(opp).name.toUpperCase() : '') + '.</div>'
          : '<div class="fo-sub">Waiting for ' + escapeHtml(cur.name) + ' to press PLAY…</div>') +
        nextLine +
      '</div>';

    const play = $('btnFieldPlay');
    if (play) play.onclick = () => {
      AUDIO.menuSelect();
      this._shootingTurn = true;
      SESSION.acceptTurn().then(() => {
        host.classList.remove('show');
        this.startRoomTurn();
      });
    };
  };

  U.fieldFinalHtml = function () {
    const st = SESSION.state;
    const board = SESSION.standings;
    let html = '<div class="fo-card final">';
    if (SESSION.isTeamRoom) {
      const A = teamById(st.teamA), B = teamById(st.teamB);
      const t = SESSION.matchTotals();
      const w = SESSION.teamWinner();
      html += '<div class="fo-line">' + (w ? teamById(w).flag + ' ' + teamById(w).name.toUpperCase() + ' WIN!' : 'IT&rsquo;S A DRAW!') + '</div>' +
        '<div class="fo-teamscore">' +
          '<span' + (w === st.teamA ? ' class="win"' : '') + '>' + A.name.toUpperCase() + ' <b>' + t.a + '</b></span>' +
          '<span class="fo-vs">vs</span>' +
          '<span' + (w === st.teamB ? ' class="win"' : '') + '>' + B.name.toUpperCase() + ' <b>' + t.b + '</b></span>' +
        '</div>';
    } else {
      const w = SESSION.winner;
      html += '<div class="fo-line">' + (w ? '🏆 ' + escapeHtml(w.name) + ' WINS!' : 'FULL TIME') + '</div>';
    }
    html += '<ol class="fo-rank">' + board.map((p) => {
      const t = teamById(p.teamId);
      return '<li><span class="rb-chip" style="background:' + t.primary + '"></span>' +
        escapeHtml(p.name) + ' <em>' + t.name.toUpperCase() + '</em>' +
        '<b>' + (p.score || 0) + '</b><span class="fo-g">' + (p.goals || 0) + 'G' +
        (p.skipped ? ' · skipped' : '') + '</span></li>';
    }).join('') + '</ol>';
    html += '<div class="fo-actions">' +
      (SESSION.isHost ? '<button class="btn" id="btnFieldAgain" type="button">↻ REMATCH</button>' : '') +
      '<button class="btn alt" id="btnFieldLeave" type="button">LEAVE</button>' +
      '</div></div>';
    return html;
  };

  /** fireworks, confetti and a crowd roar for the winners — fired once */
  U.celebrateWinner = function () {
    if (this._celebrated) return;
    this._celebrated = true;
    const g = this.g;
    const w = SESSION.isTeamRoom ? SESSION.teamWinner() : (SESSION.winner ? SESSION.winner.teamId : null);
    /* tint the confetti toward the winning team's colours */
    if (g.fx) {
      g.fx.confetti(220);
      for (let i = 0; i < 8; i++) g.fx.firework(0.15 + i * 0.4);
    }
    if (g.renderer && g.renderer.flash) g.renderer.flash('#ffffff', 0.18);
    if (!AUDIO.playSample('cheer')) AUDIO.crowdCheer(1);
    AUDIO.fanfare(true);
    void w;
  };

  U.wireFieldFinal = function () {
    const again = $('btnFieldAgain');
    if (again) again.onclick = () => {
      AUDIO.menuSelect();
      SESSION.reset().then(() => { this._shootingTurn = false; this.showRoom(); });
    };
    const leave = $('btnFieldLeave');
    if (leave) leave.onclick = () => {
      AUDIO.menuSelect();
      SESSION.leave().then(() => {
        this._shootingTurn = false;
        this.showScreen('welcome');
        this.g.setState(S.WELCOME);
        this.refreshLeaderboard();
      });
    };
  };

  /* ==========================================================================
     4. TURN LIFECYCLE — begin on the field, hand over on the field
     ========================================================================== */

  /* startRoomTurn already sets pending + shows the (now once-only) how-to card;
     mark that I'm the one shooting so polls don't yank me into spectate */
  const prevStartRoomTurn = U.startRoomTurn;
  U.startRoomTurn = function () {
    this._shootingTurn = true;
    prevStartRoomTurn.call(this);
  };

  /* after my three kicks, stay on the field and hand over — never bounce to
     the room panel */
  const prevEnd = G.endMatch;
  G.endMatch = function () {
    if (this.mode === 'room' && SESSION.active) {
      const payload = {
        score: this.board.score,
        goals: this.board.goals,
        timeMs: this.eventTimeMs || 0,
        kicks: this.board.history.map((h) => ({ o: h.outcome, p: h.points })),
      };
      this.setState(S.SPECTATE);                 // back to watching immediately
      SESSION.submitTurn(payload).then(() => {
        this.ui._shootingTurn = false;
        this.ui.enterFieldSpectate();            // shows "next player" / final overlay
      });
      return;
    }
    return prevEnd.call(this);
  };
})();
