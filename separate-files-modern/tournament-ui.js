/* ==========================================================================
   FREEKICK — TOURNAMENT UI
   tournament-ui.js
   --------------------------------------------------------------------------
   Team Match, in plain steps:

     ROLE  →  ORGANISER: create tournament → dashboard → create matches
           →  PLAYER:    pick tournament → access code → pick match →
                         room code → name → team → join the live room

   One decision per screen, and nothing shown that the person can't act on.
   ========================================================================== */
'use strict';

(function tournamentUI() {
  const U = UI.prototype;

  /* anyone already in a match room may start it, so a missing organiser can
     never deadlock a match at an event */
  Object.defineProperty(RoomSession.prototype, 'isHost', {
    configurable: true,
    get() {
      if (!this.state) return false;
      if (this.state.kind === 'match') return true;
      return this.hotSeat || this.state.host === this.me;
    },
  });

  /* ==========================================================================
     1. ROLE PICKER
     ========================================================================== */

  U.openTeamRole = function () {
    AUDIO.onUserGesture();
    AUDIO.menuSelect();
    this.showScreen('teamrole');
    this.g.setState(S.HIGH_SCORES);
  };

  /* ==========================================================================
     2. ORGANISER — create a tournament
     ========================================================================== */

  U.openOrgCreate = function () {
    AUDIO.menuSelect();
    this.showScreen('orgcreate');
    this.buildOrgTeamGrid();
    const fmt = $('orgFormat');
    if (fmt && !fmt.options.length) {
      fmt.innerHTML = TOURNEY_FORMATS.map((f) =>
        '<option value="' + f.id + '">' + f.label + '</option>').join('');
    }
    const code = $('orgCode');
    if (code && !code.value) code.value = randCode(5);
    this.orgSay('');
    setTimeout(() => { const n = $('orgName'); if (n) n.focus(); }, 60);
  };

  U.buildOrgTeamGrid = function () {
    const host = $('orgTeamGrid');
    if (!host || host.dataset.built) return;
    host.dataset.built = '1';
    host.innerHTML = TEAMS.map((t) =>
      '<div class="team-card">' +
        '<input type="checkbox" name="orgTeam" id="oteam_' + t.id + '" value="' + t.id + '">' +
        '<label class="team-face" for="oteam_' + t.id + '">' +
          '<span class="flag" aria-hidden="true">' + t.flag + '</span>' +
          '<span class="tname">' + t.name.toUpperCase() + '</span>' +
          '<span class="swatch" aria-hidden="true">' +
            '<i style="background:' + t.primary + '"></i>' +
            '<i style="background:' + t.secondary + '"></i>' +
            '<i style="background:' + t.accent + '"></i>' +
          '</span>' +
        '</label>' +
      '</div>').join('');
    $$('input[name="orgTeam"]', host).forEach((c) => {
      c.addEventListener('change', () => { AUDIO.menuMove(); this.syncOrgCount(); });
    });
    this.syncOrgCount();
  };

  U.orgTeams = function () {
    return $$('input[name="orgTeam"]:checked').map((c) => c.value);
  };

  U.syncOrgCount = function () {
    const el = $('orgTeamCount');
    if (el) {
      const n = this.orgTeams().length;
      el.textContent = n + ' team' + (n === 1 ? '' : 's') + ' selected' + (n < 2 ? ' — pick at least 2' : '');
      el.className = 'small ' + (n < 2 ? 'muted' : 'ok-text');
    }
  };

  U.orgSay = function (text, kind) {
    const el = $('orgMsg');
    if (el) { el.textContent = text || ''; el.className = 'adm-msg' + (kind ? ' ' + kind : ''); }
  };

  U.doCreateTournament = function () {
    const name = $('orgName').value;
    const code = $('orgCode').value;
    const format = $('orgFormat').value;
    const cap = $('orgMaxPerTeam').value;
    const teams = this.orgTeams();
    this.orgSay('Creating…');
    TSTORE.create({ name, accessCode: code, teams, format, maxPerTeam: cap })
      .then((state) => {
        this.tstate = state;
        this.enteredCode = String(code).trim().toUpperCase();
        AUDIO.menuSelect();
        this.openDash(state);
      })
      .catch((err) => { AUDIO.error(); this.orgSay(err.message, 'warn'); });
  };

  /* ==========================================================================
     3. ORGANISER — dashboard
     ========================================================================== */

  U.openDash = function (state) {
    this.tstate = state || this.tstate;
    if (!this.tstate) { this.openTeamRole(); return; }
    this.showScreen('tdash');
    this.g.setState(S.HIGH_SCORES);
    this.buildDashPickers();
    this.refreshDash();
    if (this.dashTimer) clearInterval(this.dashTimer);
    /* live-ish dashboard: re-read the rooms every 2s while it's on screen */
    this.dashTimer = setInterval(() => {
      if (!$('screen-tdash').classList.contains('active')) { clearInterval(this.dashTimer); this.dashTimer = null; return; }
      this.refreshDash(true);
    }, 2000);
  };

  U.buildDashPickers = function () {
    const st = this.tstate;
    const a = $('dashTeamA'), b = $('dashTeamB'), stg = $('dashStage'), cap = $('dashCap');
    const opts = '<option value="">— team —</option>' + st.teams.map((id) => {
      const t = teamById(id);
      return '<option value="' + id + '">' + t.flag + ' ' + t.name + '</option>';
    }).join('');
    if (a) a.innerHTML = opts;
    if (b) b.innerHTML = opts;
    if (stg) {
      stg.innerHTML = TOURNEY_FORMATS.map((f) =>
        '<option value="' + f.id + '"' + (f.id === st.format ? ' selected' : '') + '>' + f.label + '</option>').join('');
    }
    if (cap && !cap.value) cap.value = st.maxPerTeam;
  };

  U.dashSay = function (text, kind) {
    const el = $('dashMsg');
    if (el) { el.textContent = text || ''; el.className = 'adm-msg' + (kind ? ' ' + kind : ''); }
  };

  U.refreshDash = function (quiet) {
    const st = this.tstate;
    if (!st) return;
    const head = $('dashHead');
    if (head) {
      head.innerHTML =
        '<div class="dash-name">' + escapeHtml(st.name) + '</div>' +
        '<div class="dash-meta">' +
          '<span class="fmt-badge kicks">' + formatLabel(st.format) + '</span>' +
          '<span>TOURNAMENT ID ' + this.codeWithCopy(st.id, 'tournament ID') + '</span>' +
          '<span>ACCESS CODE ' + (this.enteredCode
            ? this.codeWithCopy(this.enteredCode, 'access code')
            : '<b class="code-out">••••</b>') + '</span>' +
          '<span>' + st.teams.length + ' teams · max ' + st.maxPerTeam + '/team</span>' +
        '</div>' +
        (st.champion
          ? '<div class="champ-banner">🏆 WINNER: ' + teamById(st.champion).flag + ' ' + teamById(st.champion).name.toUpperCase() + '</div>'
          : '');
    }

    TSTORE.fetchMatchRooms(st).then((rooms) => {
      this.dashRooms = rooms;
      this.renderDashMatches(rooms);
    }).catch(() => { if (!quiet) this.dashSay('Could not refresh match scores.', 'warn'); });
  };

  U.renderDashMatches = function (rooms) {
    const host = $('dashMatches');
    const st = this.tstate;
    if (!host || !st) return;
    if (!st.matches.length) {
      host.innerHTML = '<p class="small muted">No matches yet. Create the first one above — you can add more as the tournament goes on.</p>';
      return;
    }

    host.innerHTML = st.matches.slice().reverse().map((m) => {
      const A = teamById(m.teamA), B = teamById(m.teamB);
      const room = rooms[m.id];
      const tot = TournamentStore.totalsFor(room);
      const live = room && room.status === 'playing';
      const done = m.status === 'done' || (room && room.status === 'done');
      const joined = room ? (room.players || []).length : 0;
      const statusTxt = done ? 'FINISHED' : live ? 'LIVE' : 'WAITING FOR PLAYERS';
      const winA = m.winner === m.teamA, winB = m.winner === m.teamB;

      const board = room && joined
        ? '<ol class="dash-lb">' + (room.players || []).slice()
            .sort((p, q) => (q.score - p.score) || (q.goals - p.goals))
            .map((p) => {
              const t = teamById(p.teamId);
              const stt = (p.done || p.status === 'finished') ? 'FINISHED'
                : (room.players[room.turn] && room.players[room.turn].id === p.id && live) ? 'PLAYING NOW'
                : 'WAITING';
              return '<li><span class="rb-chip" style="background:' + t.primary + '"></span>' +
                escapeHtml(p.name) + ' <em>' + t.name.toUpperCase() + '</em>' +
                '<b>' + (p.score || 0) + '</b>' +
                '<span class="rf-g">' + (p.goals || 0) + 'G · ' + (p.attempts || 0) + '/3</span>' +
                '<span class="dash-st ' + stt.toLowerCase().replace(/ /g, '-') + '">' + stt + '</span></li>';
            }).join('') + '</ol>'
        : '<p class="small muted">Nobody has joined yet.</p>';

      let actions = '';
      if (!done) {
        actions += '<button class="btn alt tiny" data-start="' + m.id + '">START MATCH</button>' +
                   '<button class="btn danger tiny" data-close="' + m.id + '">CLOSE MATCH</button>';
      }
      if (done || m.winner) {
        actions += '<button class="btn alt tiny" data-adv="' + m.id + '" data-team="' + m.teamA + '">' +
                     (winA ? '✔ ' : '') + A.name.toUpperCase() + ' ADVANCES</button>' +
                   '<button class="btn alt tiny" data-adv="' + m.id + '" data-team="' + m.teamB + '">' +
                     (winB ? '✔ ' : '') + B.name.toUpperCase() + ' ADVANCES</button>';
      }
      actions += '<button class="btn danger tiny" data-del="' + m.id + '">DELETE</button>';

      return '<div class="dash-match' + (live ? ' live' : '') + (done ? ' done' : '') + '">' +
        '<div class="dm-top">' +
          '<b>' + formatLabel(m.stage) + '</b>' +
          '<span class="dm-status ' + statusTxt.toLowerCase().replace(/ /g, '-') + '">' + statusTxt + '</span>' +
          '<span class="dm-room">ROOM ' + this.codeWithCopy(m.roomCode, 'room code') + '</span>' +
          '<span class="small muted">' + joined + '/' + (m.maxPerTeam * 2) + ' players · max ' + m.maxPerTeam + '/team</span>' +
        '</div>' +
        '<div class="dm-score">' +
          '<span class="' + (winA ? 'win' : '') + '"><span class="rb-chip" style="background:' + A.primary + '"></span>' +
            A.name.toUpperCase() + ' <b>' + tot.a + '</b> <em>' + tot.aGoals + 'G · ' + tot.aPlayers + 'p</em></span>' +
          '<span class="dm-vs">vs</span>' +
          '<span class="' + (winB ? 'win' : '') + '"><span class="rb-chip" style="background:' + B.primary + '"></span>' +
            B.name.toUpperCase() + ' <b>' + tot.b + '</b> <em>' + tot.bGoals + 'G · ' + tot.bPlayers + 'p</em></span>' +
        '</div>' +
        (m.winner ? '<p class="small">Advancing: <b>' + teamById(m.winner).name.toUpperCase() + '</b></p>' : '') +
        board +
        '<div class="am-actions">' + actions + '</div>' +
      '</div>';
    }).join('');

    /* wire the row actions */
    const st2 = st;
    $$('[data-start]', host).forEach((b) => {
      b.onclick = async () => {
        const m = TSTORE.matchById(st2, b.dataset.start);
        const room = (this.dashRooms || {})[m.id];
        if (!room || !(room.players || []).length) { this.dashSay('Nobody has joined that room yet.', 'warn'); return; }
        room.status = 'playing';
        room.turn = 0;
        await ROOMS.save(room);
        await TSTORE.setMatchStatus(st2, m.id, 'live');
        AUDIO.menuSelect();
        this.dashSay('Match started — players can shoot now.', 'ok');
        this.refreshDash(true);
      };
    });
    $$('[data-close]', host).forEach((b) => {
      b.onclick = () => this.armConfirm(b, 'CLOSE MATCH', async () => {
        const m = TSTORE.matchById(st2, b.dataset.close);
        const room = (this.dashRooms || {})[m.id];
        const tot = TournamentStore.totalsFor(room);
        if (room) { room.status = 'done'; await ROOMS.save(room); }
        await TSTORE.closeMatch(st2, m.id, tot);
        AUDIO.menuSelect();
        this.dashSay('Match closed. Now confirm who advances.', 'ok');
        this.refreshDash(true);
      });
    });
    $$('[data-adv]', host).forEach((b) => {
      b.onclick = async () => {
        await TSTORE.advance(st2, b.dataset.adv, b.dataset.team);
        AUDIO.menuSelect();
        this.dashSay(teamById(b.dataset.team).name + ' advances.', 'ok');
        this.refreshDash(true);
      };
    });
    $$('[data-del]', host).forEach((b) => {
      b.onclick = () => this.armConfirm(b, 'DELETE', async () => {
        await TSTORE.deleteMatch(st2, b.dataset.del);
        this.dashSay('Match deleted.', 'ok');
        this.refreshDash(true);
      });
    });
  };

  U.doCreateMatch = function () {
    const st = this.tstate;
    const a = $('dashTeamA').value, b = $('dashTeamB').value;
    const stage = $('dashStage').value, cap = $('dashCap').value;
    const rounds = 1;   // team matches are a single round by design
    TSTORE.createMatch(st, { teamA: a, teamB: b, stage, maxPerTeam: cap, rounds })
      .then((m) => {
        AUDIO.menuSelect();
        const A = teamById(m.teamA), B = teamById(m.teamB);
        /* clear confirmation, so the organiser knows it saved and can add another */
        this.popup('Match Created', [
          '<p><b>' + A.flag + ' ' + escapeHtml(A.name.toUpperCase()) + ' vs ' +
            B.flag + ' ' + escapeHtml(B.name.toUpperCase()) + '</b></p>',
          '<p class="small muted">' + formatLabel(m.stage) + ' · max ' + m.maxPerTeam + ' players per team</p>',
          '<p>Match room code:</p>',
          '<p class="popup-code">' + this.codeWithCopy(m.roomCode, 'room code') + '</p>',
          '<p class="small muted">Share the tournament access code <b>' +
            escapeHtml(this.enteredCode || '') + '</b> and this room code with those players.</p>',
        ], { icon: '⚽', ok: 'CREATE ANOTHER' });
        this.resetMatchForm();
        this.dashSay('Match created — room code ' + m.roomCode + '.', 'ok');
        this.refreshDash(true);
      })
      .catch((err) => { AUDIO.error(); this.dashSay(err.message, 'warn'); });
  };

  /** blank the create-match fields so the next match starts clean */
  U.resetMatchForm = function () {
    const a = $('dashTeamA'), b = $('dashTeamB'), stg = $('dashStage'), cap = $('dashCap');
    if (a) a.value = '';
    if (b) b.value = '';
    if (stg && this.tstate) stg.value = this.tstate.format;
    if (cap && this.tstate) cap.value = this.tstate.maxPerTeam;
    if (a) a.focus();
  };

  /* ==========================================================================
     4. PLAYER — find a tournament, then a match
     ========================================================================== */

  U.openPlayerBrowse = function () {
    AUDIO.menuSelect();
    this.showScreen('tjoin');
    this.showJoinStep(1);
    this.loadTournamentList();
  };

  U.showJoinStep = function (n) {
    [1, 2].forEach((i) => {
      const el = $('joinStep' + i);
      if (el) el.style.display = (i === n) ? '' : 'none';
    });
    this.joinSay('');
  };

  U.joinSay = function (text, kind) {
    const el = $('joinMsg');
    if (el) { el.textContent = text || ''; el.className = 'adm-msg' + (kind ? ' ' + kind : ''); }
  };

  U.loadTournamentList = function () {
    const host = $('joinList');
    if (host) host.innerHTML = '<p class="small muted">Loading tournaments…</p>';
    TSTORE.list().then((list) => {
      this.tlist = list;
      if (!host) return;
      if (!list.length) {
        host.innerHTML = '<p class="small muted">No tournaments yet. Ask your organiser to create one.</p>';
        return;
      }
      host.innerHTML = list.map((t) =>
        '<button class="join-tile" type="button" data-tid="' + t.id + '">' +
          '<span class="jt-name">' + escapeHtml(t.name) + '</span>' +
          '<span class="jt-meta">' + formatLabel(t.format) + ' · ' + t.teams.length + ' teams · ' +
            (t.matches || []).length + ' match(es)</span>' +
          '<span class="jt-id">ID ' + t.id + '</span>' +
        '</button>').join('');
      $$('[data-tid]', host).forEach((b) => {
        b.onclick = () => this.pickTournament(b.dataset.tid);
      });
    }).catch(() => {
      if (host) host.innerHTML = '<p class="small muted">Could not load tournaments. Check your connection.</p>';
    });
  };

  U.pickTournament = function (id) {
    const t = (this.tlist || []).find((x) => x.id === id);
    if (!t) return;
    this.pendingT = t;
    AUDIO.menuMove();
    const label = $('joinPickedName');
    if (label) label.textContent = t.name;
    const gate = $('joinAccess');
    if (gate) gate.value = '';
    this.joinSay('Enter the access code your organiser gave you.');
    const wrap = $('joinGate');
    if (wrap) wrap.style.display = '';
    setTimeout(() => { if (gate) gate.focus(); }, 60);
  };

  U.submitAccessCode = function () {
    const t = this.pendingT;
    if (!t) { this.joinSay('Pick a tournament first.', 'warn'); return; }
    const entered = $('joinAccess').value;
    if (!TSTORE.checkCode(t, entered)) {
      AUDIO.error();
      this.joinSay('That access code does not match. Check with your organiser.', 'warn');
      return;
    }
    AUDIO.menuSelect();
    this.tstate = t;
    this.enteredCode = String(entered).trim().toUpperCase();
    this.showJoinStep(2);
    this.renderMatchPicker();
  };

  U.renderMatchPicker = function () {
    const st = this.tstate;
    const host = $('joinMatches');
    const head = $('joinTName');
    if (head && st) head.textContent = st.name + ' — ' + formatLabel(st.format);
    if (!host || !st) return;
    const open = (st.matches || []).filter((m) => m.status !== 'done');
    if (!open.length) {
      host.innerHTML = '<p class="small muted">No matches are open in this tournament yet. Ask your organiser to create one.</p>';
      return;
    }
    host.innerHTML = open.map((m) => {
      const A = teamById(m.teamA), B = teamById(m.teamB);
      return '<button class="join-tile" type="button" data-mid="' + m.id + '">' +
        '<span class="jt-name">' + A.flag + ' ' + A.name.toUpperCase() + ' vs ' + B.flag + ' ' + B.name.toUpperCase() + '</span>' +
        '<span class="jt-meta">' + formatLabel(m.stage) + ' · max ' + m.maxPerTeam + ' per team</span>' +
      '</button>';
    }).join('');
    $$('[data-mid]', host).forEach((b) => {
      b.onclick = () => this.pickMatch(b.dataset.mid);
    });
  };

  U.pickMatch = function (mid) {
    const st = this.tstate;
    const m = TSTORE.matchById(st, mid);
    if (!m) return;
    this.pendingM = m;
    AUDIO.menuMove();
    const A = teamById(m.teamA), B = teamById(m.teamB);
    const box = $('joinMatchForm');
    if (box) box.style.display = '';
    const title = $('joinMatchTitle');
    if (title) title.textContent = A.name.toUpperCase() + ' vs ' + B.name.toUpperCase();
    /* only the two teams in this match are offered */
    const grid = $('joinTeamPick');
    if (grid) {
      grid.innerHTML = [A, B].map((t, i) =>
        '<div class="team-card">' +
          '<input type="radio" name="joinTeam" id="jteam_' + t.id + '" value="' + t.id + '"' + (i === 0 ? ' checked' : '') + '>' +
          '<label class="team-face" for="jteam_' + t.id + '">' +
            '<span class="flag" aria-hidden="true">' + t.flag + '</span>' +
            '<span class="tname">' + t.name.toUpperCase() + '</span>' +
            '<span class="swatch" aria-hidden="true">' +
              '<i style="background:' + t.primary + '"></i>' +
              '<i style="background:' + t.secondary + '"></i>' +
              '<i style="background:' + t.accent + '"></i>' +
            '</span>' +
          '</label>' +
        '</div>').join('');
      $$('input[name="joinTeam"]', grid).forEach((r) =>
        r.addEventListener('change', () => AUDIO.menuMove()));
    }
    const rc = $('joinRoomCode');
    if (rc) rc.value = '';
    this.joinSay('Enter the room code for this match, your name, and your team.');
    setTimeout(() => { if (rc) rc.focus(); }, 60);
  };

  U.doJoinMatch = function () {
    const m = this.pendingM;
    if (!m) { this.joinSay('Pick a match first.', 'warn'); return; }
    const code = $('joinRoomCode').value;
    const name = $('joinPlayerName').value;
    const picked = document.querySelector('input[name="joinTeam"]:checked');
    const teamId = picked ? picked.value : null;
    if (!teamId) { this.joinSay('Pick your team.', 'warn'); return; }
    this.joinSay('Joining…');
    SESSION.joinMatch(code, name, teamId)
      .then(() => {
        AUDIO.menuSelect();
        Prefs.merge({ name: String(name).trim().toUpperCase() });
        this.setMode('room');
        this.showRoom();
      })
      .catch((err) => { AUDIO.error(); this.joinSay(err.message, 'warn'); });
  };

  /* ==========================================================================
     5. WIRING
     ========================================================================== */

  const origBind = U.bindButtons;
  U.bindButtons = function () {
    origBind.call(this);
    const click = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    const onEnter = (id, fn) => {
      const el = $(id);
      if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fn(); } });
    };

    /* Team Match now goes to the role picker */
    const tm = $('btnPlayTeam');
    if (tm) {
      const fresh = tm.cloneNode(true);      // drop the old bracket handler
      tm.parentNode.replaceChild(fresh, tm);
      fresh.addEventListener('click', () => this.openTeamRole());
    }

    click('btnRoleOrganiser', () => this.openOrgCreate());
    click('btnRolePlayer', () => this.openPlayerBrowse());
    click('btnRoleBack', () => { AUDIO.menuSelect(); this.showScreen('welcome'); this.g.setState(S.WELCOME); });

    click('btnOrgCreate', () => this.doCreateTournament());
    click('btnOrgBack', () => { AUDIO.menuSelect(); this.openTeamRole(); });
    click('btnOrgGenCode', () => { $('orgCode').value = randCode(5); AUDIO.menuMove(); });
    onEnter('orgName', () => this.doCreateTournament());

    click('btnDashCreateMatch', () => this.doCreateMatch());
    click('btnDashBack', () => {
      AUDIO.menuSelect();
      if (this.dashTimer) { clearInterval(this.dashTimer); this.dashTimer = null; }
      this.showScreen('welcome');
      this.g.setState(S.WELCOME);
    });
    click('btnDashRefresh', () => { AUDIO.menuMove(); this.refreshDash(); });

    click('btnJoinAccess', () => this.submitAccessCode());
    onEnter('joinAccess', () => this.submitAccessCode());
    click('btnJoinBack', () => { AUDIO.menuSelect(); this.openTeamRole(); });
    click('btnJoinStepBack', () => { AUDIO.menuSelect(); this.showJoinStep(1); });
    click('btnJoinMatch', () => this.doJoinMatch());
    onEnter('joinRoomCode', () => this.doJoinMatch());
    onEnter('joinPlayerName', () => this.doJoinMatch());
    click('btnJoinRefreshList', () => { AUDIO.menuMove(); this.loadTournamentList(); });

    /* organiser can reopen their dashboard from the role screen */
    click('btnRoleMyDash', () => {
      if (this.tstate) this.openDash(this.tstate);
      else this.showScreen('orgcreate');
    });
  };

  const origHydrate2 = U.hydrate;
  U.hydrate = function (prefs) {
    this.screens.teamrole = $('screen-teamrole');
    this.screens.orgcreate = $('screen-orgcreate');
    this.screens.tdash = $('screen-tdash');
    this.screens.tjoin = $('screen-tjoin');
    origHydrate2.call(this, prefs);
    if (prefs && prefs.name) {
      const pn = $('joinPlayerName');
      if (pn) pn.value = prefs.name;
    }
  };
})();

/* ==========================================================================
   HOME LEADERBOARD + TEAM TOTALS
   Appended: the universal board on the home screen, team totals inside a
   tournament match room, and the private-scores note on the instructions.
   ========================================================================== */

(function homeAndTeams() {
  const U = UI.prototype;

  /* ---- universal leaderboard on the home screen ---------------------- */

  const prevRefresh = U.refreshLeaderboard;
  U.refreshLeaderboard = function () {
    const out = prevRefresh.call(this);
    if (out && out.then) out.then((rows) => this.renderHomeBoard(rows));
    return out;
  };

  U.renderHomeBoard = function (rows) {
    const host = $('homeBoard');
    if (!host) return;
    const list = (rows || []).slice(0, 10);
    if (!list.length) {
      host.innerHTML = '<li class="hb-empty">No scores yet — play a solo challenge to open the board.</li>';
      return;
    }
    host.innerHTML = list.map((r, i) => {
      const t = teamById(r.team_id);
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      return '<li><span class="hb-rank">' + medal + '</span>' +
        '<span class="rb-chip" style="background:' + t.primary + '"></span>' +
        '<span class="hb-name">' + escapeHtml(r.player_name) + '</span>' +
        '<span class="hb-team">' + escapeHtml(r.team_name || t.name).toUpperCase() + '</span>' +
        '<b class="hb-score">' + (r.score || 0) + '</b>' +
        '<span class="hb-goals">' + (r.goals || 0) + 'G</span></li>';
    }).join('');
  };

  /* ---- team totals header inside a tournament match room ------------- */

  const prevBoard = U.renderRoomScoreboard;
  U.renderRoomScoreboard = function () {
    prevBoard.call(this);
    const panel = $('roomBoard');
    if (!panel || !panel.classList.contains('show')) return;
    if (!SESSION.isMatchRoom) return;
    const st = SESSION.state;
    const A = teamById(st.teamA), B = teamById(st.teamB);
    const tot = SESSION.matchTotals();
    const head = document.createElement('div');
    head.className = 'rb-teams';
    head.innerHTML =
      '<span class="' + (tot.a >= tot.b ? 'lead' : '') + '">' +
        '<span class="rb-chip" style="background:' + A.primary + '"></span>' + A.name.toUpperCase() +
        ' <b>' + tot.a + '</b></span>' +
      '<span class="' + (tot.b > tot.a ? 'lead' : '') + '">' +
        '<span class="rb-chip" style="background:' + B.primary + '"></span>' + B.name.toUpperCase() +
        ' <b>' + tot.b + '</b></span>';
    const first = panel.firstChild;
    panel.insertBefore(head, first ? first.nextSibling : null);
  };

  /* ---- instructions: team-match scores are private ------------------- */

  const prevIns = U.showInstructions;
  U.showInstructions = function () {
    prevIns.call(this);
    const list = $('insList');
    if (!list) return;
    const last = list.lastElementChild;
    if (!last) return;
    if (this.g.mode === 'room' && SESSION.isMatchRoom) {
      last.innerHTML = 'Your score stays <b>private to this match</b> — it counts toward your team&rsquo;s total on the match leaderboard, not the universal board.';
    } else if (this.g.mode === 'room') {
      last.innerHTML = 'Your score stays <b>private to this room</b> — friendly games don&rsquo;t touch the universal leaderboard.';
    } else {
      last.innerHTML = 'Your <b>total score is added to the universal leaderboard</b>.';
    }
  };
})();
