/* ==========================================================================
   KICKOFF 2026 — event layer
   event.js
   --------------------------------------------------------------------------
   Adds, on top of the base game:
     • the eight KICKOFF 2026 teams
     • a 20-second shot clock per attempt (timeout = missed attempt)
     • an 8 -> 4 -> 2 -> champion tournament bracket
     • a global leaderboard backed by Supabase, with a localStorage fallback

   PRIVACY: no employee names are stored in this file and no fixed player
   roster exists anywhere in the project. Players type their own name each
   time they play, and only what the leaderboard needs is ever submitted.

   Loads after game.js but before boot(), so all patches are live before the
   Game object is constructed.
   ========================================================================== */
'use strict';

/* ==========================================================================
   1. THE EIGHT TEAMS
   ========================================================================== */

const EVENT_TEAM_IDS = ['GER', 'ESP', 'JPN', 'FRA', 'POR', 'BRA', 'NOR', 'ENG'];

/* Norway is not in the base kit list — add it (red, with white and navy). */
if (!TEAMS.some((t) => t.id === 'NOR')) {
  const nor = {
    id: 'NOR', name: 'Norway', flag: '🇳🇴', pattern: 'band',
    primary: '#c8102e', secondary: '#ffffff', accent: '#00205b', trim: '#ffffff',
    numberColor: '#ffffff',
    gk: { primary: '#00c389', secondary: '#0a0a14', accent: '#ffffff' },
    chant: 'THE LIONS',
    shorts: '#00205b', socks: '#ffffff',
  };
  TEAMS.push(nor);
}

/** the ordered list of teams that take part in the tournament */
function eventTeams() {
  return EVENT_TEAM_IDS.map((id) => teamById(id));
}

const ROUNDS = [
  { id: 'R1',    label: 'FIRST ROUND', slots: 8 },
  { id: 'SEMI',  label: 'SEMIFINAL',   slots: 4 },
  { id: 'FINAL', label: 'FINAL',       slots: 2 },
];

const roundLabel = (id) => (ROUNDS.find((r) => r.id === id) || { label: id }).label;

/* ==========================================================================
   2. CONFIG / CONSTANTS
   ========================================================================== */

const EVENT = {
  SHOT_CLOCK: 20,             // seconds allowed per attempt
  WARN_AT: 5,                 // countdown turns urgent here
  BRAND: 'KICKOFF 2026',
  BACKEND_KEY: 'kickoff2026_backend_v1',
  TOURNEY_KEY: 'kickoff2026_tournament_v1',
  LOCAL_SCORES_KEY: 'kickoff2026_scores_local_v1',
  ADMIN_KEY: 'kickoff2026_admin_unlocked_v1',
  /* An organiser gate, not real security — it only keeps players from
     wandering into the admin screen during the event. Anything genuinely
     protected would need server-side auth. */
  ADMIN_PASSCODE: 'HFI2026',
};

/* ==========================================================================
   3. SHOT CLOCK
   ========================================================================== */

class ShotClock {
  constructor(seconds) {
    this.limit = seconds;
    this.reset();
  }

  reset() {
    this.left = this.limit;
    this.running = false;
    this.expired = false;
    this.used = 0;
    this._lastBeep = null;
  }

  start() {
    if (this.expired) return;
    this.running = true;
  }

  stop() { this.running = false; }

  /** returns true on the frame the clock runs out */
  tick(dt) {
    if (!this.running || this.expired) return false;
    this.left -= dt;
    this.used += dt;
    if (this.left <= EVENT.WARN_AT) {
      const whole = Math.ceil(this.left);
      if (whole !== this._lastBeep && whole > 0) {
        this._lastBeep = whole;
        AUDIO.tone({ type: 'square', freq: 880, dur: 0.07, gain: 0.12 });
      }
    }
    if (this.left <= 0) {
      this.left = 0;
      this.running = false;
      this.expired = true;
      return true;
    }
    return false;
  }

  get seconds() { return Math.max(0, Math.ceil(this.left)); }
  get fraction() { return clamp(this.left / this.limit, 0, 1); }
}

/* ==========================================================================
   4. BACKEND — Supabase REST, with a localStorage fallback
   ========================================================================== */

class EventBackend {
  constructor() {
    this.cfg = this.readConfig();
    this.online = !!(this.cfg.url && this.cfg.anonKey);
    this.lastError = null;
  }

  readConfig() {
    try { return JSON.parse(localStorage.getItem(EVENT.BACKEND_KEY)) || {}; }
    catch (_) { return {}; }
  }

  saveConfig(url, anonKey) {
    const cfg = { url: String(url || '').replace(/\/+$/, ''), anonKey: String(anonKey || '').trim() };
    try { localStorage.setItem(EVENT.BACKEND_KEY, JSON.stringify(cfg)); } catch (_) {}
    this.cfg = cfg;
    this.online = !!(cfg.url && cfg.anonKey);
    return this.online;
  }

  clearConfig() {
    try { localStorage.removeItem(EVENT.BACKEND_KEY); } catch (_) {}
    this.cfg = {};
    this.online = false;
  }

  _headers(extra) {
    return Object.assign({
      'apikey': this.cfg.anonKey,
      'Authorization': 'Bearer ' + this.cfg.anonKey,
      'Content-Type': 'application/json',
    }, extra || {});
  }

  async _fetch(path, opts) {
    const res = await fetch(this.cfg.url + '/rest/v1/' + path, opts);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + ' ' + body.slice(0, 180));
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /* ---- local mirror so the event still runs if the network dies -------- */

  _localScores() {
    try { return JSON.parse(localStorage.getItem(EVENT.LOCAL_SCORES_KEY)) || []; }
    catch (_) { return []; }
  }

  _saveLocalScores(list) {
    try { localStorage.setItem(EVENT.LOCAL_SCORES_KEY, JSON.stringify(list.slice(-500))); } catch (_) {}
  }

  /* ---- scores --------------------------------------------------------- */

  /** @returns {Promise<{ok:boolean, offline:boolean, error?:string}>} */
  async submitScore(entry) {
    const row = {
      player_name: String(entry.name).slice(0, 40),
      team_id: entry.teamId,
      team_name: entry.teamName,
      goals: entry.goals,
      attempts: entry.attempts,
      score: entry.score,
      time_ms: Math.round(entry.timeMs),
      round_id: entry.roundId || null,
      match_id: entry.matchId || null,
    };
    /* always keep a local copy first — the event must never lose a score */
    const local = this._localScores();
    local.push(Object.assign({ id: 'local_' + Date.now() + '_' + randInt(100, 999), created_at: new Date().toISOString() }, row));
    this._saveLocalScores(local);

    if (!this.online) return { ok: true, offline: true };
    try {
      await this._fetch('scores', {
        method: 'POST',
        headers: this._headers({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify(row),
      });
      return { ok: true, offline: false };
    } catch (err) {
      this.lastError = err.message;
      return { ok: false, offline: true, error: err.message };
    }
  }

  /** all scores, newest-safe, sorted best first */
  async fetchScores() {
    if (this.online) {
      try {
        const rows = await this._fetch(
          'scores?select=*&order=score.desc,time_ms.asc&limit=500',
          { headers: this._headers() });
        if (Array.isArray(rows)) return { rows, offline: false };
      } catch (err) { this.lastError = err.message; }
    }
    const rows = this._localScores().slice().sort(
      (a, b) => (b.score - a.score) || (a.time_ms - b.time_ms));
    return { rows, offline: true };
  }

  /* ---- matches / bracket ---------------------------------------------- */

  async fetchTournament() {
    if (this.online) {
      try {
        const rows = await this._fetch(
          'tournament?select=*&order=updated_at.desc&limit=1',
          { headers: this._headers() });
        if (Array.isArray(rows) && rows[0] && rows[0].state) {
          return { state: rows[0].state, offline: false };
        }
      } catch (err) { this.lastError = err.message; }
    }
    try {
      const raw = localStorage.getItem(EVENT.TOURNEY_KEY);
      return { state: raw ? JSON.parse(raw) : null, offline: true };
    } catch (_) { return { state: null, offline: true }; }
  }

  async saveTournament(state) {
    try { localStorage.setItem(EVENT.TOURNEY_KEY, JSON.stringify(state)); } catch (_) {}
    if (!this.online) return { ok: true, offline: true };
    try {
      /* single-row table keyed on id = 1, upserted */
      await this._fetch('tournament?on_conflict=id', {
        method: 'POST',
        headers: this._headers({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ id: 1, state, updated_at: new Date().toISOString() }),
      });
      return { ok: true, offline: false };
    } catch (err) {
      this.lastError = err.message;
      return { ok: false, offline: true, error: err.message };
    }
  }

  async testConnection() {
    if (!this.online) return { ok: false, error: 'No URL / key saved yet.' };
    try {
      await this._fetch('scores?select=id&limit=1', { headers: this._headers() });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  }
}

const BACKEND = new EventBackend();

/* ==========================================================================
   5. TOURNAMENT
   ========================================================================== */

class Tournament {
  constructor() { this.state = Tournament.blank(); }

  static blank() {
    return {
      brand: EVENT.BRAND,
      teams: EVENT_TEAM_IDS.slice(),
      matches: [],        // {id, round, teamA, teamB, status, currentTeam, winner, closedAt}
      advanced: { R1: [], SEMI: [], FINAL: [] },
      champion: null,
      updatedAt: new Date().toISOString(),
    };
  }

  load(state) {
    this.state = Object.assign(Tournament.blank(), state || {});
    if (!this.state.advanced) this.state.advanced = { R1: [], SEMI: [], FINAL: [] };
    if (!Array.isArray(this.state.matches)) this.state.matches = [];
    return this.state;
  }

  get matches() { return this.state.matches; }

  /** the match currently accepting scores, if any */
  get liveMatch() { return this.state.matches.find((m) => m.status === 'live') || null; }

  matchById(id) { return this.state.matches.find((m) => m.id === id) || null; }

  createMatch(teamA, teamB, round) {
    if (teamA === teamB) throw new Error('A team cannot play itself.');
    if (this.liveMatch) throw new Error('Close the current match before starting another.');
    const m = {
      id: 'm' + Date.now(),
      round,
      teamA, teamB,
      status: 'live',
      currentTeam: teamA,       // team A shoots first, then team B
      winner: null,
      createdAt: new Date().toISOString(),
      closedAt: null,
    };
    this.state.matches.push(m);
    this.touch();
    return m;
  }

  /** hand over from the first team to the opposing team */
  switchTeam(matchId) {
    const m = this.matchById(matchId);
    if (!m || m.status !== 'live') return null;
    m.currentTeam = m.currentTeam === m.teamA ? m.teamB : m.teamA;
    this.touch();
    return m;
  }

  closeMatch(matchId, totals) {
    const m = this.matchById(matchId);
    if (!m) return null;
    m.status = 'closed';
    m.closedAt = new Date().toISOString();
    m.scoreA = totals.a;
    m.scoreB = totals.b;
    m.winner = totals.a === totals.b ? null : (totals.a > totals.b ? m.teamA : m.teamB);
    this.touch();
    return m;
  }

  /** organiser confirms who goes through (handles draws explicitly) */
  advance(matchId, teamId) {
    const m = this.matchById(matchId);
    if (!m) return null;
    m.winner = teamId;
    const bucket = this.state.advanced[m.round] || (this.state.advanced[m.round] = []);
    if (bucket.indexOf(teamId) < 0) bucket.push(teamId);
    if (m.round === 'FINAL') this.state.champion = teamId;
    this.touch();
    return m;
  }

  reopenMatch(matchId) {
    const m = this.matchById(matchId);
    if (!m || this.liveMatch) return null;
    m.status = 'live';
    m.closedAt = null;
    this.touch();
    return m;
  }

  deleteMatch(matchId) {
    const i = this.state.matches.findIndex((m) => m.id === matchId);
    if (i < 0) return false;
    const m = this.state.matches[i];
    Object.keys(this.state.advanced).forEach((r) => {
      this.state.advanced[r] = this.state.advanced[r].filter((t) => t !== m.winner || r !== m.round);
    });
    if (this.state.champion === m.winner && m.round === 'FINAL') this.state.champion = null;
    this.state.matches.splice(i, 1);
    this.touch();
    return true;
  }

  /** which teams are eligible to be picked for a given round */
  eligible(round) {
    if (round === 'R1') return this.state.teams.slice();
    if (round === 'SEMI') return (this.state.advanced.R1 || []).slice();
    return (this.state.advanced.SEMI || []).slice();
  }

  touch() {
    this.state.updatedAt = new Date().toISOString();
    BACKEND.saveTournament(this.state);
  }

  reset() {
    this.state = Tournament.blank();
    this.touch();
  }

  /** aggregate player scores into per-team standings */
  standings(scoreRows) {
    const byTeam = {};
    this.state.teams.forEach((id) => {
      const t = teamById(id);
      byTeam[id] = {
        teamId: id, name: t.name, primary: t.primary, flag: t.flag,
        players: 0, total: 0, goals: 0, avg: 0,
        opponent: null, round: null, result: null, qualified: false,
      };
    });
    (scoreRows || []).forEach((r) => {
      const s = byTeam[r.team_id];
      if (!s) return;
      s.players += 1;
      s.total += (r.score || 0);
      s.goals += (r.goals || 0);
    });
    Object.values(byTeam).forEach((s) => {
      s.avg = s.players ? Math.round(s.total / s.players) : 0;
    });

    /* attach match context: newest match a team appears in wins */
    this.state.matches.slice().reverse().forEach((m) => {
      [[m.teamA, m.teamB], [m.teamB, m.teamA]].forEach(([self, other]) => {
        const s = byTeam[self];
        if (!s || s.round) return;
        s.opponent = other;
        s.round = m.round;
        if (m.status === 'closed') {
          s.result = m.winner === self ? 'WON' : (m.winner ? 'LOST' : 'DRAW');
        } else {
          s.result = m.currentTeam === self ? 'PLAYING NOW' : 'UP NEXT';
        }
      });
    });
    Object.keys(this.state.advanced).forEach((r) => {
      (this.state.advanced[r] || []).forEach((id) => {
        if (byTeam[id]) byTeam[id].qualified = true;
      });
    });
    return Object.values(byTeam).sort((a, b) => b.total - a.total);
  }

  /** totals for one match, from the raw score rows */
  matchTotals(match, scoreRows) {
    let a = 0, b = 0, pa = 0, pb = 0;
    (scoreRows || []).forEach((r) => {
      if (r.match_id !== match.id) return;
      if (r.team_id === match.teamA) { a += r.score || 0; pa++; }
      else if (r.team_id === match.teamB) { b += r.score || 0; pb++; }
    });
    return { a, b, playersA: pa, playersB: pb };
  }
}

const TOURNEY = new Tournament();

/* ==========================================================================
   6. GAME PATCHES — shot clock, timeout, event submission
   ========================================================================== */

(function patchGame() {
  const G = Game.prototype;

  /* ---- constructor tail: create the clock and load event state -------- */
  const origInit = G.setMuted;   // any early method works as an init hook
  let inited = false;
  G.setMuted = function (m, silent) {
    if (!inited) {
      inited = true;
      this.clock = new ShotClock(EVENT.SHOT_CLOCK);
      this.eventTimeMs = 0;
      this.submitState = 'idle';
    }
    return origInit.call(this, m, silent);
  };

  /* ---- fresh attempt resets the clock -------------------------------- */
  const origBegin = G.beginAttempt;
  G.beginAttempt = function () {
    origBegin.call(this);
    if (this.clock) this.clock.reset();
  };

  /* ---- a new match resets the accumulated time ------------------------ */
  const origStart = G.startMatch;
  G.startMatch = function (name, teamId) {
    this.eventTimeMs = 0;
    this.submitState = 'idle';
    this.matchId = TOURNEY.liveMatch ? TOURNEY.liveMatch.id : null;
    this.roundId = TOURNEY.liveMatch ? TOURNEY.liveMatch.round : null;
    if (this.clock) this.clock.reset();
    return origStart.call(this, name, teamId);
  };

  const origRestart = G.restartMatch;
  G.restartMatch = function () {
    this.eventTimeMs = 0;
    this.submitState = 'idle';
    if (this.clock) this.clock.reset();
    return origRestart.call(this);
  };

  /* ---- the clock runs during AIMING and CHARGING only ---------------- */
  const origUpdateAim = G.updateAim;
  G.updateAim = function (dt) {
    origUpdateAim.call(this, dt);
    if (!this.clock) return;
    this.clock.start();
    if (this.clock.tick(dt)) this.onShotClockExpired();
    this.ui.syncClock(this.clock);
  };

  /* ---- kicking stops the clock and banks the time ------------------- */
  const origKick = G.kick;
  G.kick = function (power) {
    if (this.clock) {
      this.clock.stop();
      this.eventTimeMs += this.clock.used * 1000;
      this.ui.syncClock(this.clock);
    }
    return origKick.call(this, power);
  };

  /** the attempt is forfeited when the shot clock hits zero */
  G.onShotClockExpired = function () {
    if (this.state !== S.AIMING && this.state !== S.CHARGING) return;
    AUDIO.chargeStop();
    this.eventTimeMs += this.clock.used * 1000;
    this.input.kickHeld = false;
    this.ball.mode = 'stopped';
    this.kicker.setPose('dejected');
    if (!AUDIO.playSample('aww')) AUDIO.crowdGroan();
    AUDIO.tone({ type: 'square', freq: 220, to: 110, dur: 0.4, gain: 0.22 });
    this.renderer.flash('#ff5d73', 0.14);
    this.finishShot({
      outcome: 'timeout', bx: 0, by: 0, power: 0, viaPost: false,
      title: "TIME'S UP!",
      sub: 'NO KICK TAKEN — ATTEMPT FORFEITED',
      tone: 'bad',
    });
  };

  /* ---- end of match: submit to the global leaderboard ---------------- */
  const origEnd = G.endMatch;
  G.endMatch = function () {
    origEnd.call(this);
    this.submitEventScore();
  };

  G.submitEventScore = function () {
    const live = TOURNEY.liveMatch;
    const entry = {
      name: this.player.name,
      teamId: this.player.teamId,
      teamName: this.team.name,
      goals: this.board.goals,
      attempts: CFG.ATTEMPTS,
      score: this.board.score,
      timeMs: this.eventTimeMs,
      roundId: this.roundId || (live ? live.round : null),
      matchId: this.matchId || (live ? live.id : null),
    };
    this.submitState = 'sending';
    this.ui.syncSubmit('sending');
    BACKEND.submitScore(entry).then((res) => {
      this.submitState = res.ok ? (res.offline ? 'offline' : 'sent') : 'failed';
      this.ui.syncSubmit(this.submitState, res.error);
      this.ui.refreshLeaderboard();
    });
  };
})();

/* ==========================================================================
   7. HUD / RENDER PATCHES — draw the countdown on the pitch
   ========================================================================== */

(function patchRenderer() {
  const origDraw = Game.prototype.draw;
  Game.prototype.draw = function (dt) {
    origDraw.call(this, dt);
    const c = this.clock;
    if (!c) return;
    const showing = this.state === S.AIMING || this.state === S.CHARGING;
    if (!showing && !c.expired) return;

    const R = this.renderer;
    const ctx = R.ctx;
    const urgent = c.left <= EVENT.WARN_AT;

    /* countdown bar just under the HUD */
    const w = 150, x = (CFG.W - w) / 2, y = 30;
    ctx.fillStyle = 'rgba(6,10,22,.72)';
    ctx.fillRect(x - 2, y - 2, w + 4, 9);
    ctx.fillStyle = urgent ? '#ff5d73' : '#ffd23f';
    ctx.fillRect(x, y, w * c.fraction, 5);
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1.5, y - 1.5, w + 3, 8);

    if (showing) {
      const pulse = urgent && Math.floor(this.time * 6) % 2 === 0;
      R.text(c.seconds + 's', CFG.W / 2, 22,
        { size: urgent ? 13 : 11, color: pulse ? '#ffffff' : (urgent ? '#ff5d73' : '#ffd23f') });
    }
  };
})();
