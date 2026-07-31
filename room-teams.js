/* ==========================================================================
   FREEKICK — TEAM-VS-TEAM ROOMS
   room-teams.js
   --------------------------------------------------------------------------
   Upgrades BOTH room types (private rooms and tournament match rooms) to the
   same team-versus-team structure. Nothing is removed — the existing room
   screen, spectators on the pitch and live scoreboard all still work.

   What this adds:
     • the host picks the two competing teams when creating a private room
     • joiners may only choose one of those two teams
     • turns alternate between the teams (next player is from the other side)
     • a 10-second "NAME, it's your turn!" prompt; miss it and the turn is
       skipped and 2 points go to the opposing team
     • team totals (including skip bonuses) shown live
     • a reusable confirmation pop-up and copy-to-clipboard buttons
   ========================================================================== */
'use strict';

const TURN = {
  ACCEPT_SECONDS: 10,      // time to press PLAY before the turn is skipped
  SKIP_BONUS: 2,           // points awarded to the opposing team on a skip
  FALLBACK_GRACE: 6,       // other clients step in this many seconds later
  TICK_MS: 200,
};

(function roomTeams() {
  const S2 = RoomSession.prototype;
  const U = UI.prototype;

  /* ==========================================================================
     1. SESSION — team awareness, alternating turns, skips
     ========================================================================== */

  /** true for any room that has two competing teams */
  Object.defineProperty(S2, 'isTeamRoom', {
    configurable: true,
    get() { return !!(this.state && this.state.teamA && this.state.teamB); },
  });

  S2.otherTeam = function (teamId) {
    if (!this.isTeamRoom) return null;
    return teamId === this.state.teamA ? this.state.teamB : this.state.teamA;
  };

  /** the next player to shoot — from the opposite team where possible */
  function nextTurnIndex(state, lastTeam) {
    const players = state.players || [];
    const pending = players.map((p, i) => ({ p, i })).filter((x) => !x.p.done);
    if (!pending.length) return -1;
    if (lastTeam) {
      const opp = pending.find((x) => x.p.teamId !== lastTeam);
      if (opp) return opp.i;
    }
    return pending[0].i;
  }

  function stampTurn(state) {
    state.turnStartedAt = Date.now();
    const cur = (state.players || [])[state.turn];
    if (cur) { cur.started = false; cur.status = 'up'; }
  }

  /**
   * Hand over to the next player, or roll into the next round. A round is one
   * full pass through the whole roster — once every player has taken their
   * turn, the round ends. If more rounds remain, everyone's per-round flags
   * reset (cumulative scores are kept) and the next round begins; otherwise
   * the match is done.
   */
  function handOver(state, lastTeam) {
    const idx = nextTurnIndex(state, lastTeam);
    if (idx >= 0) { state.turn = idx; stampTurn(state); return; }
    const rounds = state.rounds || 1;
    const round = state.round || 1;
    if (round < rounds) {
      state.round = round + 1;
      (state.players || []).forEach((p) => {
        p.done = false; p.started = false; p.skipped = false;
        p.status = 'waiting'; p.attempts = 0; p.left = CFG.ATTEMPTS;
      });
      state.turn = 0;
      stampTurn(state);
    } else {
      state.status = 'done';
    }
  }

  /* kick-off stamps the first turn */
  const origStart = S2.start;
  S2.start = async function () {
    if (!this.state) return;
    if (!(this.state.players || []).length) throw new Error('Nobody has joined yet.');
    this.state.status = 'playing';
    this.state.round = this.state.round || 1;
    this.state.turn = 0;
    stampTurn(this.state);
    await this.push();
  };

  /* finishing a turn banks the round's points and hands over */
  S2.submitTurn = async function (result) {
    if (!this.state) return;
    const cur = this.currentPlayer;
    if (!cur) return;
    /* score/goals accumulate across rounds */
    cur.total = (cur.total || 0) + (result.score || 0);
    cur.totalGoals = (cur.totalGoals || 0) + (result.goals || 0);
    cur.turns = (cur.turns || 0) + 1;
    cur.score = cur.total;
    cur.goals = cur.totalGoals;
    cur.timeMs = (cur.timeMs || 0) + Math.round(result.timeMs || 0);
    cur.kicks = result.kicks || [];
    cur.attempts = CFG.ATTEMPTS;
    cur.left = 0;
    cur.done = true;
    cur.status = 'finished';
    handOver(this.state, this.isTeamRoom ? cur.teamId : null);
    await this.push();
  };

  /** the player didn't press PLAY in time */
  S2.skipTurn = async function () {
    if (!this.state || this.state.status !== 'playing') return;
    const cur = this.currentPlayer;
    if (!cur || cur.done || cur.started) return;
    cur.done = true;
    cur.status = 'skipped';
    cur.skipped = true;
    cur.left = 0;
    cur.score = cur.total || 0;            // keep whatever they've banked
    cur.goals = cur.totalGoals || 0;
    if (this.isTeamRoom) {
      const opp = this.otherTeam(cur.teamId);
      this.state.bonus = this.state.bonus || {};
      this.state.bonus[opp] = (this.state.bonus[opp] || 0) + TURN.SKIP_BONUS;
    }
    handOver(this.state, this.isTeamRoom ? cur.teamId : null);
    await this.push();
  };

  /** the current player accepted their turn — stops the countdown everywhere */
  S2.acceptTurn = async function () {
    if (!this.state) return;
    const cur = this.currentPlayer;
    if (!cur) return;
    cur.started = true;
    cur.status = 'playing';
    await this.push();
  };

  /** seconds left to press PLAY (negative once past the deadline) */
  S2.turnSecondsLeft = function () {
    if (!this.state || !this.state.turnStartedAt) return TURN.ACCEPT_SECONDS;
    const gone = (Date.now() - this.state.turnStartedAt) / 1000;
    return TURN.ACCEPT_SECONDS - gone;
  };

  /** totals per team, including points gifted by skipped turns */
  S2.matchTotals = function () {
    const st = this.state;
    const t = { a: 0, b: 0, aGoals: 0, bGoals: 0, aPlayers: 0, bPlayers: 0, aBonus: 0, bBonus: 0 };
    if (!st) return t;
    (st.players || []).forEach((p) => {
      if (p.teamId === st.teamA) { t.a += p.score || 0; t.aGoals += p.goals || 0; t.aPlayers++; }
      else if (p.teamId === st.teamB) { t.b += p.score || 0; t.bGoals += p.goals || 0; t.bPlayers++; }
    });
    const bonus = st.bonus || {};
    t.aBonus = bonus[st.teamA] || 0;
    t.bBonus = bonus[st.teamB] || 0;
    t.a += t.aBonus;
    t.b += t.bBonus;
    return t;
  };

  /** winning side once everyone has shot */
  S2.teamWinner = function () {
    if (!this.isTeamRoom || !this.state || this.state.status !== 'done') return null;
    const t = this.matchTotals();
    if (t.a === t.b) return null;
    return t.a > t.b ? this.state.teamA : this.state.teamB;
  };

  /* ==========================================================================
     2. CREATING A TEAM-VS-TEAM PRIVATE ROOM
     ========================================================================== */

  S2.createTeamRoom = async function (name, teamA, teamB, myTeam, rounds) {
    if (!teamA || !teamB) throw new Error('Pick both competing teams.');
    if (teamA === teamB) throw new Error('Pick two different teams.');
    if (myTeam !== teamA && myTeam !== teamB) throw new Error('Pick which of the two teams you are on.');
    const st = await ROOMS.create(name);
    st.seq = 1;
    st.teamA = teamA;
    st.teamB = teamB;
    st.bonus = {};
    st.rounds = clamp(parseInt(rounds, 10) || 1, 1, 10);
    st.round = 1;
    const id = ROOMS.online ? ROOMS.me : ROOMS.me + '_s1';
    st.players = [{
      id, name, teamId: myTeam, score: 0, goals: 0, timeMs: 0,
      attempts: 0, left: CFG.ATTEMPTS, status: 'waiting', done: false, kicks: [],
    }];
    st.host = id;
    await ROOMS.save(st);
    this._adopt(st);
    return st;
  };

  /* ==========================================================================
     3. SHARED UI HELPERS — pop-up + copy buttons
     ========================================================================== */

  /** a small confirmation pop-up; resolves when dismissed */
  U.popup = function (title, lines, opts) {
    const o = opts || {};
    const host = $('popup');
    if (!host) { return; }
    const body = Array.isArray(lines) ? lines : [lines];
    host.innerHTML =
      '<div class="popup-card" role="dialog" aria-modal="true" aria-label="' + escapeHtml(title) + '">' +
        '<div class="popup-title">' + (o.icon || '✔') + ' ' + escapeHtml(title) + '</div>' +
        '<div class="popup-body">' + body.join('') + '</div>' +
        '<button class="btn" id="popupOk" type="button">' + (o.ok || 'GOT IT') + '</button>' +
      '</div>';
    host.classList.add('show');
    const close = () => {
      host.classList.remove('show');
      host.innerHTML = '';
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', onKey);
    const ok = $('popupOk');
    if (ok) { ok.onclick = close; setTimeout(() => ok.focus(), 40); }
    host.onclick = (e) => { if (e.target === host) close(); };
  };

  /** markup for a code with a copy button beside it */
  U.codeWithCopy = function (code, label) {
    return '<span class="code-copy">' +
      '<b class="code-out">' + escapeHtml(code) + '</b>' +
      '<button class="copy-btn" type="button" data-copy="' + escapeHtml(code) + '"' +
        ' title="Copy ' + escapeHtml(label || 'code') + '" aria-label="Copy ' + escapeHtml(label || 'code') + '">⧉</button>' +
      '</span>';
  };

  /* one delegated handler covers every copy button on every screen */
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('.copy-btn') : null;
    if (!b) return;
    const text = b.dataset.copy || '';
    const done = () => {
      const old = b.textContent;
      b.textContent = '✔';
      b.classList.add('copied');
      setTimeout(() => { b.textContent = old; b.classList.remove('copied'); }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else done();
  });

  /* ==========================================================================
     4. ROOM SCREEN — team pickers, turn prompt, team totals
     ========================================================================== */

  /** the two team selects shown when creating a private room */
  U.buildRoomTeamPickers = function () {
    const a = $('roomTeamA'), b = $('roomTeamB');
    if (!a || a.options.length) return;
    const opts = '<option value="">— team —</option>' + TEAMS.map((t) =>
      '<option value="' + t.id + '">' + t.flag + ' ' + t.name + '</option>').join('');
    a.innerHTML = opts;
    b.innerHTML = opts;
    a.value = 'IND';
    b.value = 'USA';
    const sync = () => { AUDIO.menuMove(); this.renderRoomSideChoice(); };
    a.addEventListener('change', sync);
    b.addEventListener('change', sync);
    this.renderRoomSideChoice();
  };

  /** the kit grid becomes "which of these two are you on?" */
  U.renderRoomSideChoice = function (pair, note) {
    const host = $('roomTeamGrid');
    if (!host) return;
    let ids = pair;
    if (!ids) {
      const a = $('roomTeamA'), b = $('roomTeamB');
      ids = [a ? a.value : '', b ? b.value : ''].filter(Boolean);
    }
    if (ids.length !== 2) {
      host.innerHTML = '<p class="small muted">Pick the two competing teams above.</p>';
      return;
    }
    host.dataset.built = '1';
    host.innerHTML = ids.map((id, i) => {
      const t = teamById(id);
      return '<div class="team-card">' +
        '<input type="radio" name="roomTeam" id="rteam_' + t.id + '" value="' + t.id + '"' +
          (i === 0 ? ' checked' : '') + ' aria-label="' + t.name + '">' +
        '<label class="team-face" for="rteam_' + t.id + '">' +
          '<span class="flag" aria-hidden="true">' + t.flag + '</span>' +
          '<span class="tname">' + t.name.toUpperCase() + '</span>' +
          '<span class="swatch" aria-hidden="true">' +
            '<i style="background:' + t.primary + '"></i>' +
            '<i style="background:' + t.secondary + '"></i>' +
            '<i style="background:' + t.accent + '"></i>' +
          '</span>' +
        '</label></div>';
    }).join('');
    $$('input[name="roomTeam"]', host).forEach((r) =>
      r.addEventListener('change', () => AUDIO.menuMove()));
    const hint = $('roomSideHint');
    if (hint) hint.textContent = note || '';
  };

  /** looking up a typed room code so the joiner sees the right two teams */
  U.lookupRoom = function (code) {
    code = String(code || '').trim().toUpperCase();
    if (code.length < 4) return;
    if (this._lookedUp === code) return;
    this._lookedUp = code;
    ROOMS.fetch(code).then((st) => {
      if (!st) { this.roomSay('No room with that code yet.', 'warn'); return; }
      if (st.teamA && st.teamB) {
        const A = teamById(st.teamA), B = teamById(st.teamB);
        this.renderRoomSideChoice([st.teamA, st.teamB],
          'Room found — ' + A.name.toUpperCase() + ' vs ' + B.name.toUpperCase() + '. Pick your side.');
        const cr = $('roomCreateBlock');
        if (cr) cr.style.display = 'none';       // joining, not creating
        this.roomSay('Room found: ' + A.name + ' vs ' + B.name + '.', 'ok');
      }
    }).catch(() => {});
  };

  /* ---- the "it's your turn" prompt ------------------------------------- */

  U.renderTurnPrompt = function () {
    const host = $('turnPrompt');
    if (!host) return;
    const st = SESSION.state;
    const onRoom = $('screen-room') && $('screen-room').classList.contains('active');
    if (!SESSION.active || !st || st.status !== 'playing' || !onRoom) {
      host.classList.remove('show');
      return;
    }
    const cur = SESSION.currentPlayer;
    if (!cur) { host.classList.remove('show'); return; }
    const mine = SESSION.hotSeat ? true : cur.id === SESSION.me;
    const t = teamById(cur.teamId);
    const secs = Math.max(0, Math.ceil(SESSION.turnSecondsLeft()));
    const nextP = (st.players || []).filter((p) => !p.done && p.id !== cur.id)
      .find((p) => p.teamId !== cur.teamId) ||
      (st.players || []).filter((p) => !p.done && p.id !== cur.id)[0];

    host.classList.add('show');
    host.className = 'turn-prompt show ' + (mine ? 'mine' : 'watching') + (secs <= 3 ? ' urgent' : '');
    host.innerHTML =
      '<div class="tp-line">' +
        (mine ? escapeHtml(cur.name) + ', IT&rsquo;S YOUR TURN!' : escapeHtml(cur.name) + ' IS UP') +
      '</div>' +
      '<div class="tp-team"><span class="rb-chip" style="background:' + t.primary + '"></span>' +
        t.name.toUpperCase() + '</div>' +
      (cur.started
        ? '<div class="tp-sub">Taking their 3 free kicks…</div>'
        : '<div class="tp-count' + (secs <= 3 ? ' urgent' : '') + '">' + secs + 's</div>' +
          '<div class="tp-sub">' + (mine
            ? 'Press PLAY within ' + TURN.ACCEPT_SECONDS + 's or your turn is skipped and ' +
              TURN.SKIP_BONUS + ' points go to ' + teamById(SESSION.otherTeam(cur.teamId) || cur.teamId).name.toUpperCase() + '.'
            : 'Waiting for them to press PLAY…') + '</div>' +
          (mine ? '<button class="btn big" id="btnTurnPlay" type="button">▶ PLAY NOW</button>' : '')) +
      (nextP ? '<div class="tp-next">NEXT: ' + escapeHtml(nextP.name) + ' (' +
        teamById(nextP.teamId).name.toUpperCase() + ')</div>' : '');

    const play = $('btnTurnPlay');
    if (play) play.onclick = () => {
      AUDIO.menuSelect();
      SESSION.acceptTurn().then(() => this.startRoomTurn());
    };
  };

  /* ---- the countdown loop --------------------------------------------- */

  U.startTurnWatch = function () {
    if (this.turnWatch) return;
    this.turnWatch = setInterval(() => {
      const st = SESSION.state;
      if (!SESSION.active || !st) return;
      const onRoom = $('screen-room') && $('screen-room').classList.contains('active');
      if (onRoom) this.renderTurnPrompt();
      if (st.status !== 'playing') return;
      const cur = SESSION.currentPlayer;
      if (!cur || cur.done || cur.started) return;
      const left = SESSION.turnSecondsLeft();
      const mine = SESSION.hotSeat ? true : cur.id === SESSION.me;
      /* the player on the clock skips at zero; anyone else steps in later so a
         closed browser can never stall the match */
      const due = mine ? 0 : -TURN.FALLBACK_GRACE;
      if (left <= due && !this._skipping) {
        this._skipping = true;
        SESSION.skipTurn()
          .then(() => {
            AUDIO.tone({ type: 'square', freq: 240, to: 120, dur: 0.35, gain: 0.2 });
            this.renderRoom();
          })
          .finally(() => { this._skipping = false; });
      }
    }, TURN.TICK_MS);
  };

  /* ==========================================================================
     5. HOOK INTO THE EXISTING ROOM SCREEN
     ========================================================================== */

  const origRenderRoom = U.renderRoom;
  U.renderRoom = function () {
    origRenderRoom.call(this);
    if (!SESSION.active) return;
    this.startTurnWatch();
    this.renderTurnPrompt();
    this.renderRoomTeamBar();
  };

  /** live team-vs-team score strip above the standings table */
  U.renderRoomTeamBar = function () {
    const host = $('roomTeamBar');
    if (!host) return;
    if (!SESSION.isTeamRoom) { host.innerHTML = ''; host.classList.remove('show'); return; }
    const st = SESSION.state;
    const A = teamById(st.teamA), B = teamById(st.teamB);
    const t = SESSION.matchTotals();
    const w = SESSION.teamWinner();
    const rounds = st.rounds || 1;
    const roundTxt = rounds > 1 ? 'ROUND<br>' + (st.round || 1) + '/' + rounds : 'VS';
    host.classList.add('show');
    host.innerHTML =
      '<div class="tb-side' + (t.a >= t.b ? ' lead' : '') + (w === st.teamA ? ' won' : '') + '">' +
        '<span class="rb-chip" style="background:' + A.primary + '"></span>' +
        '<span class="tb-name">' + A.flag + ' ' + A.name.toUpperCase() + '</span>' +
        '<b>' + t.a + '</b>' +
        '<em>' + t.aGoals + 'G · ' + t.aPlayers + 'p' + (t.aBonus ? ' · +' + t.aBonus + ' bonus' : '') + '</em>' +
      '</div>' +
      '<div class="tb-vs">' + roundTxt + '</div>' +
      '<div class="tb-side' + (t.b > t.a ? ' lead' : '') + (w === st.teamB ? ' won' : '') + '">' +
        '<span class="rb-chip" style="background:' + B.primary + '"></span>' +
        '<span class="tb-name">' + B.flag + ' ' + B.name.toUpperCase() + '</span>' +
        '<b>' + t.b + '</b>' +
        '<em>' + t.bGoals + 'G · ' + t.bPlayers + 'p' + (t.bBonus ? ' · +' + t.bBonus + ' bonus' : '') + '</em>' +
      '</div>';
  };

  /* ---- rebind create / join for team rooms --------------------------- */

  const origBind = U.bindButtons;
  U.bindButtons = function () {
    origBind.call(this);

    /* CREATE: now needs both teams plus the host's side */
    const c = $('btnRoomCreate');
    if (c) {
      const fresh = c.cloneNode(true);
      c.parentNode.replaceChild(fresh, c);
      fresh.addEventListener('click', () => {
        const name = String(($('roomName') || {}).value || '').trim().slice(0, 24).toUpperCase();
        if (!name) { this.roomSay('Enter your name first.', 'warn'); return; }
        const a = $('roomTeamA').value, b = $('roomTeamB').value;
        const rounds = $('roomRounds') ? $('roomRounds').value : 1;
        const picked = document.querySelector('input[name="roomTeam"]:checked');
        Prefs.merge({ name });
        AUDIO.onUserGesture();
        SESSION.createTeamRoom(name, a, b, picked ? picked.value : a, rounds)
          .then(() => {
            AUDIO.menuSelect();
            const A = teamById(a), B = teamById(b);
            const rN = SESSION.state.rounds || 1;
            this.popup('Room Created', [
              '<p>Share this code with your friends:</p>',
              '<p class="popup-code">' + this.codeWithCopy(SESSION.code, 'room code') + '</p>',
              '<p class="small muted">' + A.name.toUpperCase() + ' vs ' + B.name.toUpperCase() +
                ' — friends pick one of these two teams when they join.</p>',
              '<p class="small muted">' + rN + ' round' + (rN === 1 ? '' : 's') +
                ' · every player takes 3 kicks each round.</p>',
            ], { icon: '👥' });
            this.renderRoom();
          })
          .catch((e) => { AUDIO.error(); this.roomSay(e.message, 'warn'); });
      });
    }

    /* JOIN: look the room up so only its two teams are offered */
    const j = $('btnRoomJoin');
    if (j) {
      const fresh = j.cloneNode(true);
      j.parentNode.replaceChild(fresh, j);
      fresh.addEventListener('click', () => {
        const name = String(($('roomName') || {}).value || '').trim().slice(0, 24).toUpperCase();
        const code = String(($('roomCode') || {}).value || '').trim().toUpperCase();
        if (!name) { this.roomSay('Enter a name for this player.', 'warn'); return; }
        if (!code) { this.roomSay('Enter the room code.', 'warn'); return; }
        const picked = document.querySelector('input[name="roomTeam"]:checked');
        Prefs.merge({ name });
        AUDIO.onUserGesture();
        const teamId = picked ? picked.value : null;
        const go = SESSION.isTeamRoomCode !== false && teamId
          ? SESSION.joinMatch(code, name, teamId).catch((err) => {
              /* a plain room without teams still accepts the old join */
              if (/not a match room/i.test(err.message)) return SESSION.join(code, name, teamId);
              throw err;
            })
          : SESSION.join(code, name, teamId);
        go.then(() => {
          AUDIO.menuSelect();
          this.pendingSeat = false;
          SESSION.onChange = () => this.renderRoom();
          this.renderRoom();
        }).catch((e) => { AUDIO.error(); this.roomSay(e.message, 'warn'); });
      });
    }

    /* widen the code field to 6 and look the room up as it's typed */
    const cf = $('roomCode');
    if (cf) {
      const fresh = cf.cloneNode(true);
      cf.parentNode.replaceChild(fresh, cf);
      fresh.addEventListener('input', () => {
        fresh.value = fresh.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (fresh.value.length >= 4) this.lookupRoom(fresh.value);
      });
      fresh.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const b = $('btnRoomJoin'); if (b) b.click(); }
      });
    }
  };

  /* build the pickers whenever the friendly room screen opens */
  const origOpenRoom = U.openRoom;
  U.openRoom = function () {
    origOpenRoom.call(this);
    const cr = $('roomCreateBlock');
    if (cr) cr.style.display = '';
    this._lookedUp = null;
    this.buildRoomTeamPickers();
  };

  /* ==========================================================================
     6. STANDINGS ROWS — show kicks taken and skipped turns
     ========================================================================== */

  const origRenderRoom2 = U.renderRoom;
  U.renderRoom = function () {
    origRenderRoom2.call(this);
    if (!SESSION.active) return;
    const body = $('roomPlayersBody');
    const st = SESSION.state;
    if (!body || !st) return;
    const cur = SESSION.currentPlayer;
    const order = st.status === 'lobby' ? st.players : SESSION.standings;
    body.innerHTML = order.map((p, i) => {
      const t = teamById(p.teamId);
      const isCur = cur && p.id === cur.id && st.status === 'playing';
      const meRow = p.id === SESSION.me && !SESSION.hotSeat;
      const status = p.skipped ? '<b class="skip-tag">SKIPPED</b>'
        : p.done ? '✔ finished'
        : isCur ? (p.started ? '<b class="live-dot">SHOOTING</b>' : '<b class="up-tag">ON THE CLOCK</b>')
        : st.status === 'lobby' ? (p.id === st.host ? 'host' : 'ready')
        : 'waiting';
      const kicks = p.done ? (p.skipped ? '0/3' : CFG.ATTEMPTS + '/' + CFG.ATTEMPTS)
        : (p.attempts || 0) + '/' + CFG.ATTEMPTS;
      return '<tr' + (meRow ? ' class="me"' : '') + '>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td><span class="chip" style="background:' + t.primary + '"></span>' + t.flag + '</td>' +
        '<td class="num">' + (p.goals || 0) + '</td>' +
        '<td class="num">' + (p.score || 0) + '</td>' +
        '<td class="num">' + kicks + '</td>' +
        '<td>' + status + '</td></tr>';
    }).join('');
  };
})();
