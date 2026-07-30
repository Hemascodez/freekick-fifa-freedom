
/* ==========================================================================
   17. UI — screens, HUD, meters, banners, high-score table
   ========================================================================== */

class UI {
  constructor(game) {
    this.g = game;
    this.screens = {
      welcome: $('screen-welcome'),
      register: $('screen-register'),
      game: $('screen-game'),
      results: $('screen-results'),
      highscores: $('screen-highscores'),
    };
    this.el = {
      name: $('inpName'),
      nameHint: $('nameHint'),
      teamGrid: $('teamGrid'),
      jersey: $('jerseyCanvas'),
      previewName: $('previewName'),
      previewSub: $('previewSub'),
      btnStart: $('btnStart'),
      hudName: $('hudName'),
      hudTeam: $('hudTeam'),
      hudChip: $('hudTeamChip'),
      hudScore: $('hudScore'),
      hudGoals: $('hudGoals'),
      hudAttempt: $('hudAttempt'),
      pips: $('kickPips'),
      powerWrap: $('powerWrap'),
      powerFill: $('powerFill'),
      powerNotch: $('powerNotch'),
      powerPct: $('powerPct'),
      aimBar: $('aimBar'),
      aimSide: $('aimSide'),
      aimHeight: $('aimHeight'),
      banner: $('banner'),
      bannerText: $('bannerText'),
      bannerSub: $('bannerSub'),
      bannerPts: $('bannerPts'),
      bannerCont: $('bannerCont'),
      tip: $('tip'),
      touch: $('touch'),
      btnMute: $('btnMute'),
      rName: $('rName'),
      rTeam: $('rTeam'),
      rScore: $('rScore'),
      rGoals: $('rGoals'),
      rating: $('ratingLine'),
      resultMsg: $('resultMsg'),
      newHigh: $('newHighTag'),
      hsBody: $('hsBody'),
      hsCaption: $('hsCaption'),
      live: $('liveRegion'),
    };
    this.selectedTeam = TEAMS[0].id;
    this.buildTeamGrid();
    this.bindButtons();
    this.showScreen('welcome');
    this.detectTouch();
    /* keep the ideal-power zone in the CSS band in sync with CFG */
    const ideal = $('powerIdeal');
    if (ideal) {
      ideal.style.left = CFG.IDEAL_LO + '%';
      ideal.style.width = (CFG.IDEAL_HI - CFG.IDEAL_LO) + '%';
    }
  }

  /* ---- screens -------------------------------------------------------- */

  showScreen(key) {
    Object.keys(this.screens).forEach((k) => {
      const el = this.screens[k];
      if (el) el.classList.toggle('active', k === key);
    });
    document.body.classList.toggle('playing', key === 'game');
  }

  say(msg) { if (this.el.live) this.el.live.textContent = msg; }

  /* ---- registration --------------------------------------------------- */

  buildTeamGrid() {
    const frag = document.createDocumentFragment();
    TEAMS.forEach((t, i) => {
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
        AUDIO.resume();
        AUDIO.menuMove();
        this.refreshPreview();
        Prefs.merge({ team: r.value });
      });
      r.addEventListener('focus', () => { this.g.state = S.TEAM_SELECT; });
    });
    this.refreshPreview();
  }

  refreshPreview() {
    const t = teamById(this.selectedTeam);
    const num = this.g && this.g.player && this.g.player.number ? this.g.player.number : 10;
    drawJersey(this.el.jersey, t, num);
    this.el.previewName.textContent = t.name.toUpperCase();
    this.el.previewSub.textContent = t.chant + '  •  KIT #' + num;
    if (this.el.hudChip) this.el.hudChip.style.background = t.primary;
  }

  hydrate(prefs) {
    if (prefs.name && this.el.name) this.el.name.value = prefs.name;
    if (prefs.team) {
      const r = $('team_' + prefs.team);
      if (r) { r.checked = true; this.selectedTeam = prefs.team; this.refreshPreview(); }
    }
    this.validateName();
    this.renderHighScores(HS.load(), null);
  }

  validateName() {
    const v = (this.el.name.value || '').trim();
    const ok = v.length >= 1;
    this.el.btnStart.disabled = !ok;
    this.el.nameHint.textContent = ok
      ? 'READY, ' + v.toUpperCase().slice(0, 14) + '. PICK YOUR TEAM AND KICK OFF!'
      : 'ENTER A PLAYER NAME TO UNLOCK START GAME.';
    return ok;
  }

  tryStart() {
    if (!this.validateName()) {
      AUDIO.resume();
      AUDIO.error();
      this.el.name.focus();
      this.say('A player name is required before the match can start.');
      return;
    }
    const name = this.el.name.value.trim().slice(0, 14).toUpperCase();
    Prefs.merge({ name, team: this.selectedTeam });
    AUDIO.resume();
    AUDIO.menuSelect();
    this.showScreen('game');
    this.hideBanner();
    this.g.startMatch(name, this.selectedTeam);
    this.refreshPreview();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  /* ---- buttons -------------------------------------------------------- */

  bindButtons() {
    const g = this.g;
    const click = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

    click('btnPlay', () => {
      AUDIO.resume(); AUDIO.menuSelect();
      this.showScreen('register');
      g.setState(S.REGISTER);
      setTimeout(() => this.el.name.focus(), 60);
    });

    click('btnWelcomeScores', () => {
      AUDIO.resume(); AUDIO.menuSelect();
      this.renderHighScores(HS.load(), null);
      this.hsReturn = 'welcome';
      this.showScreen('highscores');
      g.setState(S.HIGH_SCORES);
    });

    click('btnStart', () => this.tryStart());

    click('btnBackWelcome', () => {
      AUDIO.menuSelect();
      this.showScreen('welcome');
      g.setState(S.WELCOME);
    });

    this.el.name.addEventListener('input', () => {
      this.g.state = S.REGISTER;
      this.validateName();
    });

    click('btnMute', () => g.toggleMute());
    click('btnQuit', () => {
      AUDIO.menuSelect();
      this.hideBanner();
      this.showScreen('welcome');
      g.setState(S.WELCOME);
    });

    click('btnAgain', () => {
      AUDIO.menuSelect();
      this.showScreen('game');
      this.hideBanner();
      g.restartMatch();
    });

    click('btnChangeTeam', () => {
      AUDIO.menuSelect();
      this.showScreen('register');
      g.setState(S.TEAM_SELECT);
      const first = $$('input[name="team"]', this.el.teamGrid)[0];
      if (first) setTimeout(() => first.focus(), 60);
    });

    click('btnChangePlayer', () => {
      AUDIO.menuSelect();
      this.el.name.value = '';
      this.validateName();
      this.showScreen('register');
      g.setState(S.REGISTER);
      setTimeout(() => this.el.name.focus(), 60);
    });

    click('btnResultScores', () => {
      AUDIO.menuSelect();
      this.hsReturn = 'results';
      this.renderHighScores(HS.load(), this.lastHsId);
      this.showScreen('highscores');
      g.setState(S.HIGH_SCORES);
    });

    click('btnHsBack', () => {
      AUDIO.menuSelect();
      const back = this.hsReturn === 'results' ? 'results' : 'welcome';
      this.showScreen(back);
      g.setState(back === 'results' ? S.FINAL_RESULTS : S.WELCOME);
    });

    click('btnHsClear', () => {
      HS.clear();
      AUDIO.error();
      this.lastHsId = null;
      this.renderHighScores([], null);
      this.say('High score table cleared.');
    });
  }

  detectTouch() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch) this.el.touch.classList.add('show');
    const t = $('btnTouchToggle');
    if (t) {
      t.addEventListener('click', () => {
        this.el.touch.classList.toggle('show');
        AUDIO.menuMove();
        t.setAttribute('aria-pressed', this.el.touch.classList.contains('show') ? 'true' : 'false');
      });
      t.setAttribute('aria-pressed', isTouch ? 'true' : 'false');
    }
  }

  /* ---- HUD ------------------------------------------------------------ */

  syncHud() {
    const g = this.g, b = g.board, t = g.team;
    this.el.hudName.textContent = g.player.name || 'PLAYER';
    this.el.hudTeam.textContent = t.name.toUpperCase();
    this.el.hudChip.style.background = t.primary;
    this.el.hudScore.textContent = String(b.score).padStart(4, '0');
    this.el.hudGoals.textContent = b.goals + '/' + CFG.ATTEMPTS;
    this.el.hudAttempt.textContent = Math.min(b.attempt + 1, CFG.ATTEMPTS) + '/' + CFG.ATTEMPTS;

    let pips = '';
    for (let i = 0; i < CFG.ATTEMPTS; i++) {
      const h = b.history[i];
      const cls = h ? (h.outcome === 'goal' ? 'live' : 'used') : '';
      const label = h ? (h.outcome === 'goal' ? 'goal' : 'no goal') : 'remaining';
      pips += '<i class="' + cls + '" title="Kick ' + (i + 1) + ': ' + label + '"></i>';
    }
    this.el.pips.innerHTML = pips;
  }

  syncMute(m) {
    const b = this.el.btnMute;
    if (!b) return;
    b.textContent = m ? '♪ OFF' : '♪ ON';
    b.classList.toggle('off', m);
    b.setAttribute('aria-pressed', m ? 'true' : 'false');
    b.setAttribute('aria-label', m ? 'Sound is muted. Unmute sound' : 'Sound is on. Mute sound');
  }

  syncPower(p) {
    this.el.powerFill.style.width = p + '%';
    this.el.powerNotch.style.left = p + '%';
    this.el.powerPct.textContent = Math.round(p) + '%';
  }

  syncAim(aim, power) {
    const side = aim.x < -0.6 ? 'LEFT' : aim.x > 0.6 ? 'RIGHT' : 'CENTRE';
    const dist = Math.abs(aim.x) > CFG.GOAL_HALF ? ' (OUTSIDE!)' : '';
    const h = aim.y > 1.6 ? 'HIGH' : aim.y < 0.8 ? 'LOW' : 'MID';
    this.el.aimSide.textContent = side + dist;
    this.el.aimHeight.textContent = h;
  }

  /* ---- per-state chrome ---------------------------------------------- */

  onState(s) {
    const e = this.el;
    e.powerWrap.classList.toggle('show', s === S.CHARGING || s === S.AIMING);
    e.aimBar.classList.toggle('show', s === S.AIMING || s === S.CHARGING);

    if (s === S.AIMING) {
      this.syncPower(0);
      this.tip('AIM WITH ← → ↑ ↓   •   HOLD SPACE TO CHARGE');
      this.syncAim(this.g.aim, 0);
    } else if (s === S.CHARGING) {
      this.tip('RELEASE SPACE TO SHOOT!');
    } else if (s === S.READY) {
      this.hideBanner();
      this.syncPower(0);
      this.tip('');
    } else if (s === S.FLIGHT) {
      this.tip('');
    } else if (s === S.RESULT) {
      /* banner handles messaging */
    } else {
      this.tip('');
    }
    if (s !== S.RESULT) this.hideBanner();
  }

  tip(msg) {
    if (!msg) { this.el.tip.classList.remove('show'); return; }
    this.el.tip.textContent = msg;
    this.el.tip.classList.add('show');
  }

  /* ---- result banner -------------------------------------------------- */

  showBanner(res, kicksLeft) {
    const e = this.el;
    e.bannerText.textContent = res.title;
    e.bannerText.className = res.tone === 'goal' ? 'goal' : res.tone === 'save' ? 'save' : 'bad';
    e.bannerSub.textContent = res.sub;
    e.bannerPts.textContent = res.points > 0
      ? res.breakdown.join('   ') + '   =   +' + res.points + ' PTS'
      : 'NO POINTS  •  SCORE ' + this.g.board.score;
    e.bannerCont.textContent = kicksLeft > 0
      ? 'PRESS ENTER  •  ' + kicksLeft + ' KICK' + (kicksLeft === 1 ? '' : 'S') + ' LEFT'
      : 'PRESS ENTER FOR FINAL RESULTS';
    e.banner.classList.add('show');
    this.say(res.title + ' ' + res.sub + '. ' + (res.points > 0 ? res.points + ' points.' : 'No points.') +
      ' ' + kicksLeft + ' kicks remaining.');
  }

  hideBanner() { this.el.banner.classList.remove('show'); }

  /* ---- results screen ------------------------------------------------- */

  showResults(board, rating, rank, table, id) {
    const e = this.el;
    const t = this.g.team;
    e.rName.textContent = this.g.player.name;
    e.rTeam.textContent = t.name.toUpperCase();
    e.rScore.textContent = String(board.score).padStart(4, '0');
    e.rGoals.textContent = board.goals + ' / ' + CFG.ATTEMPTS;
    e.rating.textContent = rating.label;
    e.resultMsg.textContent = rating.msg;
    e.newHigh.classList.toggle('show', rank === 1);
    e.newHigh.textContent = rank === 1 ? '★ NEW HIGH SCORE ★' : '';
    this.lastHsId = id;
    this.renderHighScores(table, id);
    this.hideBanner();
    this.showScreen('results');
    this.say('Final results. ' + this.g.player.name + ' scored ' + board.goals + ' of ' + CFG.ATTEMPTS +
      ' with ' + board.score + ' points. Rating: ' + rating.label + '.');
    const btn = $('btnAgain');
    if (btn) setTimeout(() => btn.focus(), 80);
  }

  /* ---- high scores ---------------------------------------------------- */

  renderHighScores(list, highlightId) {
    const body = this.el.hsBody;
    if (!body) return;
    if (!list || !list.length) {
      body.innerHTML = '<tr><td class="hs-empty" colspan="6">NO SCORES YET — BE THE FIRST CHAMPION!</td></tr>';
      if (this.el.hsCaption) this.el.hsCaption.textContent = 'TOP 10 — SAVED ON THIS DEVICE';
      return;
    }
    const rows = list.map((r, i) => {
      const t = teamById(r.team);
      const me = highlightId && r.id === highlightId ? ' class="me"' : '';
      return '<tr' + me + '>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td>' + escapeHtml(r.name) + '</td>' +
        '<td><span class="chip" style="background:' + t.primary + '"></span>' +
        escapeHtml(r.teamName || t.name).toUpperCase() + '</td>' +
        '<td class="num">' + r.score + '</td>' +
        '<td class="num">' + r.goals + '/' + (r.attempts || CFG.ATTEMPTS) + '</td>' +
        '<td>' + escapeHtml(r.date || '') + '</td>' +
        '</tr>';
    }).join('');
    body.innerHTML = rows;
    if (this.el.hsCaption) {
      this.el.hsCaption.textContent = 'TOP ' + list.length + ' — SAVED ON THIS DEVICE';
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ==========================================================================
   18. BOOT
   ========================================================================== */

let GAME = null;

function boot() {
  try {
    GAME = new Game();
    window.FREEKICK = GAME;      // handy for debugging in the console
  } catch (err) {
    /* never leave a blank screen — tell the player what happened */
    const host = $('screen-welcome') || document.body;
    const p = document.createElement('p');
    p.style.color = '#ff8f9a';
    p.style.padding = '1em';
    p.textContent = 'Startup error: ' + (err && err.message ? err.message : err);
    host.appendChild(p);
    throw err;
  }

  /* first gesture unlocks the Web Audio context on every browser */
  const unlock = () => { AUDIO.resume(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  /* stop the page rubber-banding while playing on mobile */
  document.addEventListener('touchmove', (e) => {
    if (document.body.classList.contains('playing')) e.preventDefault();
  }, { passive: false });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
