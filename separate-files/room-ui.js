/* ==========================================================================
   FREEKICK — FRIENDLY MATCH UI
   room-ui.js
   --------------------------------------------------------------------------
   Screens for private rooms: create/join, the lobby, the live turn order and
   standings, and the winner. Also adds the three play modes on the title
   screen (solo / team / friends).
   ========================================================================== */
'use strict';

(function patchRoomUI() {
  const U = UI.prototype;

  /* ==========================================================================
     1. PLAY MODES
     ========================================================================== */

  /** solo | team | room — decides where a finished score is sent */
  U.setMode = function (mode) {
    this.g.mode = mode;
    const notice = $('matchNotice');
    if (notice) notice.style.display = mode === 'team' ? '' : 'none';
  };

  U.openRegister = function (mode) {
    this.setMode(mode);
    AUDIO.onUserGesture();
    AUDIO.menuSelect();
    this.showScreen('register');
    this.g.setState(S.REGISTER);
    this.syncMatchNotice();
    setTimeout(() => this.el.name.focus(), 60);
  };

  /* ==========================================================================
     2. ROOM SCREEN
     ========================================================================== */

  U.openRoom = function () {
    AUDIO.onUserGesture();
    AUDIO.menuSelect();
    this.setMode('room');
    this.showScreen('room');
    this.g.setState(S.HIGH_SCORES);
    this.buildRoomTeamGrid();

    const t = $('roomTransport');
    if (t) {
      t.textContent = ROOMS.online
        ? 'Connected — friends can join from any device using the code or link.'
        : 'HOT-SEAT MODE — no leaderboard server is connected, so everyone plays on this device, passing it around. Connect Supabase in the organiser panel for play across devices.';
      t.className = 'small ' + (ROOMS.online ? 'muted' : 'warn-text');
    }

    const nameField = $('roomName');
    if (nameField && !nameField.value) {
      nameField.value = (Prefs.read().name || '');
    }
    SESSION.onChange = () => this.renderRoom();
    this.renderRoom();
  };

  U.buildRoomTeamGrid = function () {
    const host = $('roomTeamGrid');
    if (!host || host.dataset.built === '1') return;
    host.dataset.built = '1';
    host.innerHTML = eventTeams().map((t, i) =>
      '<div class="team-card">' +
      '<input type="radio" name="roomTeam" id="rteam_' + t.id + '" value="' + t.id + '"' +
      (i === 0 ? ' checked' : '') + ' aria-label="' + t.name + '">' +
      '<label class="team-face" for="rteam_' + t.id + '">' +
      '<span class="flag" aria-hidden="true">' + t.flag + '</span>' +
      '<span class="tname">' + t.name.toUpperCase() + '</span>' +
      '<span class="swatch" aria-hidden="true">' +
      '<i style="background:' + t.primary + '"></i>' +
      '<i style="background:' + t.secondary + '"></i>' +
      '<i style="background:' + t.accent + '"></i>' +
      '</span></label></div>').join('');
    $$('input[name="roomTeam"]', host).forEach((r) => {
      r.addEventListener('change', () => { AUDIO.menuMove(); });
    });
  };

  U.roomTeam = function () {
    const picked = document.querySelector('input[name="roomTeam"]:checked');
    return picked ? picked.value : EVENT_TEAM_IDS[0];
  };

  U.roomSay = function (text, kind, which) {
    const el = $(which || 'roomMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'adm-msg' + (kind ? ' ' + kind : '');
    if (text) {
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.textContent = ''; el.className = 'adm-msg'; }, 5000);
    }
  };

  /* ---- render ---------------------------------------------------------- */

  U.renderRoom = function () {
    const entry = $('roomEntry'), inside = $('roomInside');
    if (!SESSION.active) {
      if (entry) entry.style.display = '';
      if (inside) inside.style.display = 'none';
      return;
    }
    if (entry) entry.style.display = 'none';
    if (inside) inside.style.display = '';

    const st = SESSION.state;
    const code = $('roomCodeOut');
    if (code) code.textContent = SESSION.code;
    const hint = $('roomShareHint');
    if (hint) hint.textContent = ROOMS.online ? SESSION.shareLink : 'Hot-seat: pass this device around.';

    /* state line */
    const line = $('roomState');
    const cur = SESSION.currentPlayer;
    if (line) {
      if (st.status === 'lobby') {
        line.className = 'room-state lobby';
        line.textContent = st.players.length + ' player' + (st.players.length === 1 ? '' : 's') + ' in the room' +
          (SESSION.isHost ? ' — you are the host. Press KICK OFF when everyone is in.'
                          : ' — waiting for the host to start.');
      } else if (st.status === 'playing' && cur) {
        const mine = SESSION.isMyTurn || (SESSION.hotSeat && !cur.done);
        line.className = 'room-state ' + (mine ? 'yourturn' : 'waiting');
        line.textContent = mine
          ? (SESSION.hotSeat ? cur.name + ' — you\'re up! Take your 3 free kicks.' : "YOUR TURN — take your 3 free kicks!")
          : 'Waiting for ' + cur.name + ' to finish their 3 kicks…';
      } else if (st.status === 'done') {
        const w = SESSION.winner;
        line.className = 'room-state done';
        line.textContent = w ? '🏆 ' + w.name + ' wins with ' + w.score + ' points!' : 'Match finished — it\'s a tie!';
      }
    }

    /* standings */
    const body = $('roomPlayersBody');
    if (body) {
      const order = st.status === 'lobby' ? st.players : SESSION.standings;
      body.innerHTML = order.map((p, i) => {
        const t = teamById(p.teamId);
        const isCur = cur && p.id === cur.id && st.status === 'playing';
        const meRow = p.id === SESSION.me && !SESSION.hotSeat;
        const status = p.done ? '✔ done'
          : isCur ? '<b class="live-dot">SHOOTING</b>'
          : st.status === 'lobby' ? (p.id === st.host ? 'host' : 'ready') : 'waiting';
        return '<tr' + (meRow ? ' class="me"' : '') + '>' +
          '<td class="num">' + (st.status === 'lobby' ? i + 1 : (p.done ? i + 1 : '–')) + '</td>' +
          '<td>' + escapeHtml(p.name) + '</td>' +
          '<td><span class="chip" style="background:' + t.primary + '"></span>' + t.flag + '</td>' +
          '<td class="num">' + (p.done ? p.goals + '/3' : '–') + '</td>' +
          '<td class="num">' + (p.done ? p.score : '–') + '</td>' +
          '<td class="num">' + (p.done ? (p.timeMs / 1000).toFixed(1) + 's' : '–') + '</td>' +
          '<td>' + status + '</td></tr>';
      }).join('');
    }

    /* actions */
    const acts = $('roomActions');
    if (!acts) return;
    let html = '';
    if (st.status === 'lobby') {
      if (SESSION.isHost) html += '<button class="btn big" id="btnRoomStart" type="button">KICK OFF ▶</button>';
      if (SESSION.hotSeat) html += '<button class="btn alt" id="btnRoomAddSeat" type="button">+ ADD ANOTHER PLAYER</button>';
    } else if (st.status === 'playing') {
      const mine = SESSION.isMyTurn || (SESSION.hotSeat && cur && !cur.done);
      if (mine) html += '<button class="btn big" id="btnRoomTakeTurn" type="button">TAKE MY 3 KICKS ▶</button>';
      else html += '<button class="btn alt" id="btnRoomRefresh" type="button">↻ REFRESH</button>';
    } else if (st.status === 'done') {
      if (SESSION.isHost) html += '<button class="btn big" id="btnRoomAgain" type="button">↻ REMATCH</button>';
    }
    html += '<button class="btn alt" id="btnRoomLeave" type="button">LEAVE ROOM</button>';
    acts.innerHTML = html;

    const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    on('btnRoomStart', () => {
      SESSION.start().then(() => { AUDIO.menuSelect(); this.renderRoom(); })
        .catch((e) => this.roomSay(e.message, 'warn', 'roomMsg2'));
    });
    on('btnRoomAddSeat', () => {
      SESSION.stopPolling();
      this.pendingSeat = true;
      const entry2 = $('roomEntry'), inside2 = $('roomInside');
      if (entry2) entry2.style.display = '';
      if (inside2) inside2.style.display = 'none';
      const f = $('roomName');
      if (f) { f.value = ''; f.focus(); }
      $('roomCode').value = SESSION.code;
      this.roomSay('Type the next player\'s name, pick their kit, then press JOIN.', 'ok');
    });
    on('btnRoomTakeTurn', () => this.startRoomTurn());
    on('btnRoomRefresh', () => { SESSION.poll(); AUDIO.menuMove(); });
    on('btnRoomAgain', () => {
      SESSION.reset().then(() => { AUDIO.menuSelect(); this.renderRoom(); });
    });
    on('btnRoomLeave', () => {
      SESSION.leave().then(() => { this.renderRoom(); });
    });
  };

  /** the current player plays their three kicks */
  U.startRoomTurn = function () {
    const cur = SESSION.currentPlayer;
    if (!cur) return;
    this.setMode('room');
    this.pending = { name: cur.name, teamId: cur.teamId };
    this.showInstructions();
  };

  /** called by multiplayer.js once a turn's score is in */
  U.showRoom = function () {
    this.showScreen('room');
    this.g.setState(S.HIGH_SCORES);
    SESSION.onChange = () => this.renderRoom();
    this.renderRoom();
  };

  /* ==========================================================================
     3. WIRING
     ========================================================================== */

  const origBind = U.bindButtons;
  U.bindButtons = function () {
    origBind.call(this);
    const click = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

    /* the three play modes */
    const solo = $('btnPlay');
    if (solo) {
      const fresh = solo.cloneNode(true);      // drop the base handler
      solo.parentNode.replaceChild(fresh, solo);
      fresh.addEventListener('click', () => this.openRegister('solo'));
    }
    click('btnPlayTeam', () => this.openRegister('team'));
    click('btnPlayFriends', () => this.openRoom());

    /* create / join */
    click('btnRoomCreate', () => {
      const name = String(($('roomName') || {}).value || '').trim().slice(0, 24).toUpperCase();
      if (!name) { this.roomSay('Enter your name first.', 'warn'); return; }
      Prefs.merge({ name });
      AUDIO.onUserGesture();
      SESSION.create(name, this.roomTeam())
        .then(() => { AUDIO.menuSelect(); this.renderRoom(); })
        .catch((e) => this.roomSay(e.message, 'warn'));
    });

    click('btnRoomJoin', () => {
      const name = String(($('roomName') || {}).value || '').trim().slice(0, 24).toUpperCase();
      const code = String(($('roomCode') || {}).value || '').trim().toUpperCase();
      if (!name) { this.roomSay('Enter a name for this player.', 'warn'); return; }
      if (!code) { this.roomSay('Enter the room code.', 'warn'); return; }
      Prefs.merge({ name });
      AUDIO.onUserGesture();
      SESSION.join(code, name, this.roomTeam())
        .then(() => {
          AUDIO.menuSelect();
          this.pendingSeat = false;
          SESSION.onChange = () => this.renderRoom();
          this.renderRoom();
        })
        .catch((e) => this.roomSay(e.message, 'warn'));
    });

    const codeField = $('roomCode');
    if (codeField) {
      codeField.addEventListener('input', () => {
        codeField.value = codeField.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      });
      codeField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const b = $('btnRoomJoin'); if (b) b.click(); }
      });
    }

    click('btnRoomCopy', () => {
      const text = ROOMS.online ? SESSION.shareLink : 'Room code: ' + SESSION.code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          this.roomSay('Invite copied — send it to your friends.', 'ok', 'roomMsg2');
        }).catch(() => this.roomSay(text, 'ok', 'roomMsg2'));
      } else this.roomSay(text, 'ok', 'roomMsg2');
    });

    click('btnRoomBack', () => {
      AUDIO.menuSelect();
      SESSION.stopPolling();
      this.showScreen('welcome');
      this.g.setState(S.WELCOME);
    });
  };

  /* ==========================================================================
     4. BOOT — register the screen, honour ?room=CODE invite links
     ========================================================================== */

  const origHydrate = U.hydrate;
  U.hydrate = function (prefs) {
    this.screens.room = $('screen-room');
    origHydrate.call(this, prefs);
    this.g.mode = 'solo';

    let code = null;
    try { code = new URLSearchParams(location.search).get('room'); } catch (_) {}
    if (code) {
      setTimeout(() => {
        this.openRoom();
        const f = $('roomCode');
        if (f) f.value = String(code).toUpperCase().slice(0, 4);
        this.roomSay('Invite detected — enter your name and press JOIN.', 'ok');
        const n = $('roomName');
        if (n) n.focus();
      }, 120);
    }
  };
})();

/* Solo vs team routing lives in event.js submitEventScore, which checks
   game.mode directly — a wrapper here could not stop its live-match
   fallback from re-attaching the match id. */
