/* ==========================================================================
   KICKOFF 2026 — event UI
   event-ui.js
   --------------------------------------------------------------------------
   Screens and controls layered on top of the base UI:
     • team grid limited to the eight tournament teams
     • an instructions screen between registration and kick-off
     • global leaderboard with PLAYERS / TEAMS / BRACKET views
     • organiser panel: Create Match, hand over, close, confirm who advances
     • Supabase connection settings
   ========================================================================== */
'use strict';

(function patchUI() {
  const U = UI.prototype;

  /* ==========================================================================
     1. TEAM GRID — only the eight KICKOFF 2026 teams
     ========================================================================== */

  U.buildTeamGrid = function () {
    const frag = document.createDocumentFragment();
    eventTeams().forEach((t, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'team-card';
      const id = 'team_' + t.id;
      wrap.innerHTML =
        '<input type="radio" name="team" id="' + id + '" value="' + t.id + '"' +
        (i === 0 ? ' checked' : '') + ' aria-label="' + t.name + '">' +
        '<label class="team-face" for="' + id + '">' +
        '<span class="flag" aria-hidden="true">' + t.flag + '</span>' +
        '<span class="tname">' + t.name.toUpperCase() + '</span>' +
        '<span class="swatch" aria-hidden="true">' +
        '<i style="background:' + t.primary + '"></i>' +
        '<i style="background:' + t.secondary + '"></i>' +
        '<i style="background:' + t.accent + '"></i>' +
        '</span></label>';
      frag.appendChild(wrap);
    });
    this.el.teamGrid.appendChild(frag);

    $$('input[name="team"]', this.el.teamGrid).forEach((r) => {
      r.addEventListener('change', () => {
        this.selectedTeam = r.value;
        this.g.state = S.TEAM_SELECT;
        AUDIO.onUserGesture();
        AUDIO.menuMove();
        this.refreshPreview();
        this.syncMatchNotice();
        Prefs.merge({ team: r.value });
      });
      r.addEventListener('focus', () => { this.g.state = S.TEAM_SELECT; });
    });
    this.selectedTeam = EVENT_TEAM_IDS[0];
    this.refreshPreview();
  };

  /** tells the player which team the organiser has shooting right now */
  U.syncMatchNotice = function () {
    const el = $('matchNotice');
    if (!el) return;
    const m = TOURNEY.liveMatch;
    if (!m) {
      el.className = 'match-notice';
      el.innerHTML = '<b>PRACTICE MODE</b> — no match is live. Your score still goes to the global leaderboard.';
      return;
    }
    const cur = teamById(m.currentTeam);
    const next = teamById(m.currentTeam === m.teamA ? m.teamB : m.teamA);
    const mine = this.selectedTeam === m.currentTeam;
    el.className = 'match-notice' + (mine ? ' ok' : ' warn');
    el.innerHTML =
      '<b>' + roundLabel(m.round) + '</b> &nbsp;·&nbsp; NOW SHOOTING: <b>' + cur.name.toUpperCase() +
      '</b> &nbsp;·&nbsp; UP NEXT: ' + next.name.toUpperCase() +
      (mine ? '' : '<br><b>Heads up:</b> you picked ' + teamById(this.selectedTeam).name.toUpperCase() +
        ', so your score counts on the leaderboard but not toward this match.');
  };

  /* ==========================================================================
     2. REGISTRATION -> INSTRUCTIONS -> GAME
     ========================================================================== */

  const origTryStart = U.tryStart;
  U.tryStart = function () {
    if (!this.validateName()) {
      AUDIO.onUserGesture();
      AUDIO.error();
      this.el.name.focus();
      this.say('A player name is required before the match can start.');
      return;
    }
    /* hold the details and show the instructions first */
    this.pending = {
      name: this.el.name.value.trim().slice(0, 24).toUpperCase(),
      teamId: this.selectedTeam,
    };
    Prefs.merge({ name: this.pending.name, team: this.pending.teamId });
    AUDIO.onUserGesture();
    AUDIO.menuSelect();
    this.showInstructions();
  };

  U.showInstructions = function () {
    const p = this.pending;
    const t = teamById(p.teamId);
    const who = $('insWho');
    if (who) {
      who.innerHTML = '<b>' + escapeHtml(p.name) + '</b> &nbsp;playing for&nbsp; ' +
        '<span class="ins-team"><span class="chip" style="background:' + t.primary + '"></span>' +
        t.flag + ' ' + t.name.toUpperCase() + '</span>';
    }
    const m = TOURNEY.liveMatch;
    const ctx = $('insMatch');
    if (ctx) {
      ctx.textContent = m
        ? roundLabel(m.round) + ' — ' + teamById(m.teamA).name.toUpperCase() + ' vs ' + teamById(m.teamB).name.toUpperCase()
        : 'Practice mode — no live match';
    }
    this.showScreen('instructions');
    this.g.setState(S.REGISTER);
    const b = $('btnBeginChallenge');
    if (b) setTimeout(() => b.focus(), 60);
  };

  U.beginChallenge = function () {
    const p = this.pending;
    if (!p) { this.showScreen('register'); return; }
    AUDIO.onUserGesture();
    AUDIO.menuSelect();
    this.showScreen('game');
    this.hideBanner();
    this.g.startMatch(p.name, p.teamId);
    this.refreshPreview();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  };

  /* ==========================================================================
     3. HUD ADDITIONS — shot clock, round, opponent, projected rank
     ========================================================================== */

  U.syncClock = function (clock) {
    const el = $('hudClock');
    if (!el) return;
    const s = clock.seconds;
    el.textContent = s + 's';
    el.classList.toggle('urgent', clock.left <= EVENT.WARN_AT && clock.left > 0);
    el.classList.toggle('dead', clock.expired);
  };

  const origSyncHud = U.syncHud;
  U.syncHud = function () {
    origSyncHud.call(this);
    const m = TOURNEY.liveMatch;
    const rd = $('hudRound');
    if (rd) rd.textContent = m ? roundLabel(m.round) : 'PRACTICE';
    const opp = $('hudOpponent');
    if (opp) {
      if (m) {
        const mine = this.g.player.teamId;
        const other = mine === m.teamA ? m.teamB : (mine === m.teamB ? m.teamA : null);
        opp.textContent = other ? 'vs ' + teamById(other).name.toUpperCase()
          : teamById(m.teamA).name.toUpperCase() + ' v ' + teamById(m.teamB).name.toUpperCase();
      } else opp.textContent = '—';
    }
    const rank = $('hudRank');
    if (rank) {
      const projected = this.projectedRank(this.g.board.score);
      rank.textContent = projected ? '#' + projected : '—';
    }
  };

  /** where this score would sit on the cached leaderboard */
  U.projectedRank = function (score) {
    const rows = this.cachedScores;
    if (!rows || !rows.length) return null;
    let better = 0;
    rows.forEach((r) => { if ((r.score || 0) > score) better++; });
    return better + 1;
  };

  /* ==========================================================================
     4. RESULTS — submission status
     ========================================================================== */

  U.syncSubmit = function (state, err) {
    const el = $('submitStatus');
    if (!el) return;
    el.className = 'submit-status ' + state;
    if (state === 'sending') el.textContent = 'Submitting your score to the global leaderboard…';
    else if (state === 'sent') el.textContent = '✔ Score submitted to the global leaderboard.';
    else if (state === 'offline') {
      el.textContent = BACKEND.online
        ? '⚠ Saved on this device — the leaderboard server did not respond.'
        : '⚠ Saved on this device. No leaderboard server is connected yet.';
    } else if (state === 'failed') {
      el.textContent = '⚠ Could not reach the leaderboard' + (err ? ' (' + err + ')' : '') + '. Score saved locally.';
    } else el.textContent = '';
  };

  const origShowResults = U.showResults;
  U.showResults = function (board, rating, rank, table, id) {
    origShowResults.call(this, board, rating, rank, table, id);
    const tm = $('rTime');
    if (tm) tm.textContent = (this.g.eventTimeMs / 1000).toFixed(1) + 's';
    const missed = board.history.filter((h) => h.outcome === 'timeout').length;
    const to = $('rTimeouts');
    if (to) to.textContent = String(missed);
  };

  /* ==========================================================================
     5. LEADERBOARD — players / teams / bracket
     ========================================================================== */

  U.openLeaderboard = function (returnTo) {
    this.lbReturn = returnTo || 'welcome';
    this.showScreen('leaderboard');
    this.g.setState(S.HIGH_SCORES);
    this.refreshLeaderboard();
  };

  U.setLbTab = function (tab) {
    this.lbTab = tab;
    $$('.lb-tab').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.lb-view').forEach((v) => v.classList.toggle('active', v.dataset.view === tab));
  };

  U.refreshLeaderboard = function () {
    const status = $('lbStatus');
    if (status) status.textContent = 'Loading…';
    return BACKEND.fetchScores().then(({ rows, offline }) => {
      this.cachedScores = rows;
      if (status) {
        status.textContent = offline
          ? (BACKEND.online ? 'Offline — showing scores saved on this device.'
                            : 'Local mode — connect Supabase in the organiser panel for a shared leaderboard.')
          : 'Live — ' + rows.length + ' result' + (rows.length === 1 ? '' : 's') + ' from the global leaderboard.';
        status.className = 'lb-status ' + (offline ? 'offline' : 'live');
      }
      this.renderPlayerBoard(rows);
      this.renderTeamBoard(rows);
      this.renderBracket(rows);
      return rows;
    });
  };

  U.renderPlayerBoard = function (rows) {
    const body = $('lbPlayersBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td class="hs-empty" colspan="7">NO SCORES YET — BE THE FIRST TO PLAY!</td></tr>';
      return;
    }
    const me = this.g.player.name;
    body.innerHTML = rows.slice(0, 100).map((r, i) => {
      const t = teamById(r.team_id);
      const mine = me && r.player_name === me ? ' class="me"' : '';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      return '<tr' + mine + '>' +
        '<td class="num">' + medal + '</td>' +
        '<td>' + escapeHtml(r.player_name) + '</td>' +
        '<td><span class="chip" style="background:' + t.primary + '"></span>' +
             escapeHtml(r.team_name || t.name).toUpperCase() + '</td>' +
        '<td class="num">' + (r.goals || 0) + '/' + (r.attempts || 3) + '</td>' +
        '<td class="num">' + (r.score || 0) + '</td>' +
        '<td class="num">' + ((r.time_ms || 0) / 1000).toFixed(1) + 's</td>' +
        '<td>' + (r.round_id ? roundLabel(r.round_id) : '—') + '</td>' +
        '</tr>';
    }).join('');
  };

  U.renderTeamBoard = function (rows) {
    const body = $('lbTeamsBody');
    if (!body) return;
    const st = TOURNEY.standings(rows);
    body.innerHTML = st.map((s, i) => {
      const opp = s.opponent ? teamById(s.opponent).name.toUpperCase() : '—';
      const resClass = s.result === 'WON' ? 'won' : s.result === 'LOST' ? 'lost'
        : s.result === 'PLAYING NOW' ? 'live' : '';
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td><span class="chip" style="background:' + s.primary + '"></span>' + s.flag + ' ' + s.name.toUpperCase() + '</td>' +
        '<td class="num">' + s.players + '</td>' +
        '<td class="num">' + s.goals + '</td>' +
        '<td class="num">' + s.total + '</td>' +
        '<td class="num">' + s.avg + '</td>' +
        '<td>' + opp + '</td>' +
        '<td>' + (s.round ? roundLabel(s.round) : '—') + '</td>' +
        '<td class="' + resClass + '">' + (s.result || '—') + '</td>' +
        '<td>' + (s.qualified ? '<b class="yes">✔ THROUGH</b>' : '—') + '</td>' +
        '</tr>';
    }).join('');
  };

  U.renderBracket = function (rows) {
    const host = $('lbBracket');
    if (!host) return;
    const champ = TOURNEY.state.champion;
    let html = '';
    if (champ) {
      const c = teamById(champ);
      html += '<div class="champ-banner">🏆 CHAMPION: ' + c.flag + ' ' + c.name.toUpperCase() + '</div>';
    }
    html += ROUNDS.map((rd) => {
      const ms = TOURNEY.matches.filter((m) => m.round === rd.id);
      const cards = ms.length ? ms.map((m) => {
        const A = teamById(m.teamA), B = teamById(m.teamB);
        const tot = TOURNEY.matchTotals(m, rows);
        const live = m.status === 'live';
        const winA = m.winner === m.teamA, winB = m.winner === m.teamB;
        return '<div class="bracket-match' + (live ? ' live' : '') + '">' +
          '<div class="bm-round">' + (live ? 'LIVE — ' + teamById(m.currentTeam).name.toUpperCase() + ' SHOOTING' : 'FINAL SCORE') + '</div>' +
          '<div class="bm-row' + (winA ? ' win' : '') + '">' +
            '<span class="chip" style="background:' + A.primary + '"></span>' +
            '<span class="bm-name">' + A.name.toUpperCase() + '</span>' +
            '<span class="bm-score">' + tot.a + '</span></div>' +
          '<div class="bm-row' + (winB ? ' win' : '') + '">' +
            '<span class="chip" style="background:' + B.primary + '"></span>' +
            '<span class="bm-name">' + B.name.toUpperCase() + '</span>' +
            '<span class="bm-score">' + tot.b + '</span></div>' +
        '</div>';
      }).join('') : '<div class="bracket-empty">No matches created yet</div>';
      return '<div class="bracket-round"><h4>' + rd.label + '</h4>' + cards + '</div>';
    }).join('');
    host.innerHTML = html;
  };

  /* ==========================================================================
     6. ORGANISER PANEL
     ========================================================================== */

  /* The organiser dashboard opens directly — no passcode. To gate it later,
     set EVENT.ADMIN_PASSCODE and restore a check here. */
  U.openAdmin = function () {
    AUDIO.menuSelect();
    this.adminUnlocked = true;
    this.showScreen('admin');
    this.g.setState(S.HIGH_SCORES);
    this.syncAdminLock();
    this.refreshAdmin();
  };

  U.syncAdminLock = function () {
    const lock = $('admLock'), body = $('admBody');
    if (lock) lock.style.display = 'none';
    if (body) body.style.display = 'block';
  };

  /** in-page message line, replacing window.alert */
  U.admSay = function (text, kind) {
    const el = $('admMsg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'adm-msg' + (kind ? ' ' + kind : '');
    if (text) {
      clearTimeout(this._admMsgT);
      this._admMsgT = setTimeout(() => { el.textContent = ''; el.className = 'adm-msg'; }, 5000);
    }
  };

  /**
   * Two-step confirm on the button itself, replacing window.confirm.
   * First click arms it, second click within 4s runs the action.
   */
  U.armConfirm = function (btn, label, action) {
    if (btn.dataset.armed === '1') {
      clearTimeout(btn._armT);
      btn.dataset.armed = '0';
      btn.textContent = btn.dataset.orig || label;
      action();
      return;
    }
    btn.dataset.orig = btn.textContent;
    btn.dataset.armed = '1';
    btn.textContent = 'SURE? CLICK AGAIN';
    AUDIO.menuMove();
    clearTimeout(btn._armT);
    btn._armT = setTimeout(() => {
      btn.dataset.armed = '0';
      btn.textContent = btn.dataset.orig;
    }, 4000);
  };

  U.refreshAdmin = function () {
    /* round selector drives which teams are eligible */
    const roundSel = $('admRound');
    if (roundSel && !roundSel.options.length) {
      roundSel.innerHTML = ROUNDS.map((r) => '<option value="' + r.id + '">' + r.label + '</option>').join('');
    }
    this.fillTeamSelects();

    /* backend fields */
    const u = $('admUrl'), k = $('admKey');
    if (u && !u.value) u.value = BACKEND.cfg.url || '';
    if (k && !k.value) k.value = BACKEND.cfg.anonKey || '';
    const bs = $('admBackendStatus');
    if (bs) {
      bs.textContent = BACKEND.online
        ? 'Connected to ' + BACKEND.cfg.url
        : 'Not connected — scores are saved on this device only.';
      bs.className = 'adm-status ' + (BACKEND.online ? 'live' : 'offline');
    }

    BACKEND.fetchScores().then(({ rows }) => {
      this.cachedScores = rows;
      this.renderLiveMatchPanel(rows);
      this.renderAdminMatches(rows);
    });
  };

  U.fillTeamSelects = function () {
    const roundSel = $('admRound');
    const round = roundSel ? roundSel.value : 'R1';
    const eligible = TOURNEY.eligible(round);
    const opts = (sel) => {
      if (!sel) return;
      const keep = sel.value;
      sel.innerHTML = '<option value="">— select team —</option>' +
        eligible.map((id) => {
          const t = teamById(id);
          return '<option value="' + id + '">' + t.flag + ' ' + t.name + '</option>';
        }).join('');
      if (eligible.indexOf(keep) >= 0) sel.value = keep;
    };
    opts($('admTeamA'));
    opts($('admTeamB'));
    const hint = $('admEligibleHint');
    if (hint) {
      hint.textContent = round === 'R1'
        ? 'All eight teams are eligible in the first round.'
        : eligible.length
          ? eligible.length + ' team(s) have advanced and can be picked: ' +
            eligible.map((id) => teamById(id).name).join(', ')
          : 'No teams have advanced to this round yet — close the previous round\'s matches and confirm the winners first.';
    }
  };

  U.renderLiveMatchPanel = function (rows) {
    const host = $('admLive');
    if (!host) return;
    const m = TOURNEY.liveMatch;
    if (!m) {
      host.innerHTML = '<p class="small muted">No match is live. Create one above — until then players are in practice mode.</p>';
      return;
    }
    const A = teamById(m.teamA), B = teamById(m.teamB);
    const tot = TOURNEY.matchTotals(m, rows);
    const cur = teamById(m.currentTeam);
    const nxt = teamById(m.currentTeam === m.teamA ? m.teamB : m.teamA);
    host.innerHTML =
      '<div class="adm-live-head">' + roundLabel(m.round) + ' — LIVE</div>' +
      '<div class="adm-live-grid">' +
        '<div class="adm-live-team' + (m.currentTeam === m.teamA ? ' now' : '') + '">' +
          '<span class="chip" style="background:' + A.primary + '"></span>' + A.name.toUpperCase() +
          '<b>' + tot.a + '</b><span class="pl">' + tot.playersA + ' player(s)</span></div>' +
        '<div class="adm-live-team' + (m.currentTeam === m.teamB ? ' now' : '') + '">' +
          '<span class="chip" style="background:' + B.primary + '"></span>' + B.name.toUpperCase() +
          '<b>' + tot.b + '</b><span class="pl">' + tot.playersB + ' player(s)</span></div>' +
      '</div>' +
      '<p class="small">Now shooting: <b>' + cur.name.toUpperCase() + '</b> · Up next: <b>' + nxt.name.toUpperCase() + '</b></p>' +
      '<div class="row" style="justify-content:flex-start">' +
        '<button class="btn alt" id="admSwitch" type="button">HAND OVER TO ' + nxt.name.toUpperCase() + '</button>' +
        '<button class="btn danger" id="admClose" type="button">CLOSE MATCH</button>' +
      '</div>';

    const sw = $('admSwitch');
    if (sw) sw.onclick = () => {
      TOURNEY.switchTeam(m.id);
      AUDIO.menuSelect();
      this.refreshAdmin();
      this.syncMatchNotice();
      this.syncHud();
    };
    const cl = $('admClose');
    if (cl) cl.onclick = () => this.armConfirm(cl, 'CLOSE MATCH', () => this.closeLiveMatch(m, tot));
  };

  U.closeLiveMatch = function (m, tot) {
    const A = teamById(m.teamA), B = teamById(m.teamB);
    TOURNEY.closeMatch(m.id, tot);
    AUDIO.menuSelect();
    this.admSay('Match closed — ' + A.name + ' ' + tot.a + ' : ' + tot.b + ' ' + B.name +
      '. Now confirm who advances.', 'ok');
    this.refreshAdmin();
    this.syncMatchNotice();
  };

  U.renderAdminMatches = function (rows) {
    const host = $('admMatches');
    if (!host) return;
    if (!TOURNEY.matches.length) {
      host.innerHTML = '<p class="small muted">No matches yet.</p>';
      return;
    }
    host.innerHTML = TOURNEY.matches.slice().reverse().map((m) => {
      const A = teamById(m.teamA), B = teamById(m.teamB);
      const tot = TOURNEY.matchTotals(m, rows);
      const decided = !!m.winner;
      const tie = m.status === 'closed' && !m.winner;
      let actions = '';
      if (m.status === 'closed') {
        actions =
          '<button class="btn alt tiny" data-adv="' + m.id + '" data-team="' + m.teamA + '">' +
            (m.winner === m.teamA ? '✔ ' : '') + A.name.toUpperCase() + ' ADVANCES</button>' +
          '<button class="btn alt tiny" data-adv="' + m.id + '" data-team="' + m.teamB + '">' +
            (m.winner === m.teamB ? '✔ ' : '') + B.name.toUpperCase() + ' ADVANCES</button>' +
          '<button class="btn alt tiny" data-reopen="' + m.id + '">REOPEN</button>';
      }
      actions += '<button class="btn danger tiny" data-del="' + m.id + '">DELETE</button>';
      return '<div class="adm-match' + (m.status === 'live' ? ' live' : '') + '">' +
        '<div class="am-top"><b>' + roundLabel(m.round) + '</b> · ' +
          (m.status === 'live' ? '<span class="live-dot">LIVE</span>' : 'CLOSED') +
          (tie ? ' · <span class="tie">DRAW — pick who advances</span>' : '') +
          (decided ? ' · advances: <b>' + teamById(m.winner).name.toUpperCase() + '</b>' : '') +
        '</div>' +
        '<div class="am-score">' + A.name.toUpperCase() + ' <b>' + tot.a + '</b> — <b>' + tot.b + '</b> ' + B.name.toUpperCase() + '</div>' +
        '<div class="am-actions">' + actions + '</div>' +
      '</div>';
    }).join('');

    $$('[data-adv]', host).forEach((b) => {
      b.onclick = () => {
        TOURNEY.advance(b.dataset.adv, b.dataset.team);
        AUDIO.menuSelect();
        this.refreshAdmin();
      };
    });
    $$('[data-reopen]', host).forEach((b) => {
      b.onclick = () => {
        if (TOURNEY.liveMatch) {
          this.admSay('Close the live match before reopening another.', 'warn');
          return;
        }
        TOURNEY.reopenMatch(b.dataset.reopen);
        this.admSay('Match reopened — it is live again.', 'ok');
        this.refreshAdmin();
        this.syncMatchNotice();
      };
    });
    $$('[data-del]', host).forEach((b) => {
      b.onclick = () => this.armConfirm(b, 'DELETE', () => {
        TOURNEY.deleteMatch(b.dataset.del);
        this.admSay('Match deleted. Player scores are untouched.', 'ok');
        this.refreshAdmin();
        this.syncMatchNotice();
      });
    });
  };

  /* ==========================================================================
     7. WIRING
     ========================================================================== */

  const origBind = U.bindButtons;
  U.bindButtons = function () {
    origBind.call(this);
    const g = this.g;
    const click = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

    /* instructions screen */
    click('btnBeginChallenge', () => this.beginChallenge());
    click('btnInsBack', () => {
      AUDIO.menuSelect();
      this.showScreen('register');
      g.setState(S.REGISTER);
    });

    /* leaderboard */
    click('btnWelcomeScores', () => { AUDIO.onUserGesture(); this.openLeaderboard('welcome'); });
    click('btnResultScores', () => this.openLeaderboard('results'));
    click('btnLbBack', () => {
      AUDIO.menuSelect();
      const back = this.lbReturn === 'results' ? 'results' : 'welcome';
      this.showScreen(back);
      g.setState(back === 'results' ? S.FINAL_RESULTS : S.WELCOME);
    });
    click('btnLbRefresh', () => { AUDIO.menuMove(); this.refreshLeaderboard(); });
    $$('.lb-tab').forEach((b) => {
      b.addEventListener('click', () => { AUDIO.menuMove(); this.setLbTab(b.dataset.tab); });
    });

    /* in-game leaderboard peek */
    click('btnHudBoard', () => this.openLeaderboard('welcome'));

    /* organiser */
    click('btnWelcomeAdmin', () => { AUDIO.onUserGesture(); this.openAdmin(); });
    click('btnAdmBack', () => {
      AUDIO.menuSelect();
      this.showScreen('welcome');
      g.setState(S.WELCOME);
    });
    const roundSel = $('admRound');
    if (roundSel) roundSel.addEventListener('change', () => this.fillTeamSelects());

    click('btnAdmCreate', () => {
      const a = $('admTeamA').value, b = $('admTeamB').value, r = $('admRound').value;
      if (!a || !b) { this.admSay('Pick both teams first.', 'warn'); return; }
      try {
        TOURNEY.createMatch(a, b, r);
        AUDIO.menuSelect();
        this.admSay(roundLabel(r) + ' started — ' + teamById(a).name + ' shoots first.', 'ok');
        this.refreshAdmin();
        this.syncMatchNotice();
      } catch (err) { this.admSay(err.message, 'warn'); }
    });

    click('btnAdmSaveBackend', () => {
      const url = $('admUrl').value, key = $('admKey').value;
      BACKEND.saveConfig(url, key);
      const bs = $('admBackendStatus');
      if (bs) { bs.textContent = 'Testing connection…'; bs.className = 'adm-status'; }
      BACKEND.testConnection().then((res) => {
        if (bs) {
          bs.textContent = res.ok
            ? '✔ Connected — the leaderboard is now shared across devices.'
            : '✖ Could not connect: ' + res.error;
          bs.className = 'adm-status ' + (res.ok ? 'live' : 'offline');
        }
        this.refreshLeaderboard();
      });
    });

    const dis = $('btnAdmDisconnect');
    if (dis) dis.addEventListener('click', () => this.armConfirm(dis, 'DISCONNECT', () => {
      BACKEND.clearConfig();
      $('admUrl').value = '';
      $('admKey').value = '';
      this.admSay('Disconnected — scores now save on this device only.', 'ok');
      this.refreshAdmin();
    }));

    const rst = $('btnAdmResetTourney');
    if (rst) rst.addEventListener('click', () => this.armConfirm(rst, 'RESET BRACKET', () => {
      TOURNEY.reset();
      this.admSay('Bracket reset. Player scores are untouched.', 'ok');
      this.refreshAdmin();
      this.syncMatchNotice();
    }));

    click('btnAdmCopySql', () => {
      const sql = $('admSql');
      if (!sql) return;
      const text = sql.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          const b = $('btnAdmCopySql');
          if (b) { b.textContent = '✔ COPIED'; setTimeout(() => { b.textContent = 'COPY SQL'; }, 1600); }
        }).catch(() => {});
      }
    });
  };

  /* ==========================================================================
     8. BOOT-TIME EVENT SETUP
     ========================================================================== */

  const origHydrate = U.hydrate;
  U.hydrate = function (prefs) {
    /* register the screens this layer adds so showScreen() manages them */
    this.screens.instructions = $('screen-instructions');
    this.screens.leaderboard = $('screen-leaderboard');
    this.screens.admin = $('screen-admin');

    origHydrate.call(this, prefs);
    this.lbTab = 'players';
    this.cachedScores = [];
    this.adminUnlocked = true;
    this.setLbTab('players');

    /* pull the shared bracket, then paint everything that depends on it */
    BACKEND.fetchTournament().then(({ state }) => {
      TOURNEY.load(state);
      this.syncMatchNotice();
      this.syncHud();
      this.refreshLeaderboard();
    });

    /* brand the welcome screen for the event */
    const brand = $('eventBrand');
    if (brand) brand.textContent = EVENT.BRAND + ' — HFI INTERNAL TOURNAMENT';
  };
})();
