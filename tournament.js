/* ==========================================================================
   FREEKICK — PRIVATE TOURNAMENTS
   tournament.js
   --------------------------------------------------------------------------
   A simple two-role flow for Team Match:

     ORGANISER  creates a tournament (name, access code, teams, format,
                max players per team), then creates matches — each with its
                own room code — and watches a dashboard.
     PLAYER     finds the tournament, enters the access code, picks their
                match, enters the room code, types their name, picks one of
                the two teams in that match, and joins.

   Storage: reuses the existing `rooms` table (code TEXT primary key, state
   JSONB), so no new SQL is needed. Tournaments are rows with
   state.kind === 'tournament'; match rooms are rows with kind === 'match'
   and are driven by the same RoomSession as Play With Friends.

   PRIVACY, STATED HONESTLY: the browser talks to Supabase with a public anon
   key and the table policies allow public read. The access code is stored as
   a hash so the plain code is not sitting in the row, and codes gate every
   screen — but a determined person with developer tools could still read
   other rows. Treat tournaments as private-by-convention, not secret. Real
   enforcement would need server-side auth.
   ========================================================================== */
'use strict';

const TOURNEY_FORMATS = [
  { id: 'friendly',     label: 'Friendly / Normal Match' },
  { id: 'league',       label: 'League' },
  { id: 'playoffs',     label: 'Playoffs' },
  { id: 'quarterfinal', label: 'Quarterfinal' },
  { id: 'semifinal',    label: 'Semifinal' },
  { id: 'final',        label: 'Final' },
];

const formatLabel = (id) => {
  const f = TOURNEY_FORMATS.find((x) => x.id === id);
  return f ? f.label : (id || 'Match');
};

const TCFG = {
  ID_LEN: 5,           // public tournament id (the row key)
  ROOM_LEN: 6,         // per-match room code
  CODE_MIN: 4,         // organiser's access code
  CODE_MAX: 12,
  MAX_PER_TEAM: 12,
  ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
};

function randCode(n, alphabet) {
  const a = alphabet || TCFG.ALPHABET;
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/** FNV-1a — obfuscation so the plain access code isn't stored in the row.
    Not a security boundary: short codes are trivially brute-forced. */
function hashCode(str) {
  let h = 0x811c9dc5;
  const s = String(str).trim().toUpperCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return 'h' + h.toString(36);
}

/* ==========================================================================
   STORE — tournaments and match rooms in the shared `rooms` table
   ========================================================================== */

class TournamentStore {
  get online() { return BACKEND.online; }
  get me() { return ROOMS.me; }

  /* ---- local fallback so the flow works with no backend --------------- */

  _localAll() {
    try { return JSON.parse(localStorage.getItem('freekick_tournaments_v1')) || {}; }
    catch (_) { return {}; }
  }

  _localWrite(all) {
    try { localStorage.setItem('freekick_tournaments_v1', JSON.stringify(all)); } catch (_) {}
  }

  /* ---- remote --------------------------------------------------------- */

  async _put(state) {
    if (!this.online) {
      const all = this._localAll();
      all[state.id] = state;
      this._localWrite(all);
      return state;
    }
    await BACKEND._fetch('rooms?on_conflict=code', {
      method: 'POST',
      headers: BACKEND._headers({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ code: state.id, state, updated_at: new Date().toISOString() }),
    });
    return state;
  }

  async get(id) {
    if (!id) return null;
    if (!this.online) return this._localAll()[String(id).toUpperCase()] || null;
    const rows = await BACKEND._fetch(
      'rooms?select=state&code=eq.' + encodeURIComponent(String(id).toUpperCase()) + '&limit=1',
      { headers: BACKEND._headers() });
    const st = (Array.isArray(rows) && rows[0]) ? rows[0].state : null;
    return (st && st.kind === 'tournament') ? st : null;
  }

  /** every open tournament, newest first — names only, codes stay hashed */
  async list() {
    if (!this.online) {
      return Object.values(this._localAll())
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    const rows = await BACKEND._fetch(
      'rooms?select=code,state,updated_at&state->>kind=eq.tournament&order=updated_at.desc&limit=60',
      { headers: BACKEND._headers() });
    return (Array.isArray(rows) ? rows : []).map((r) => r.state).filter(Boolean);
  }

  async save(state) {
    state.updatedAt = new Date().toISOString();
    return this._put(state);
  }

  /* ---- create --------------------------------------------------------- */

  async create({ name, accessCode, teams, format, maxPerTeam }) {
    name = String(name || '').trim();
    if (name.length < 3) throw new Error('Give the tournament a name (at least 3 characters).');
    const code = String(accessCode || '').trim().toUpperCase();
    if (code.length < TCFG.CODE_MIN) {
      throw new Error('Access code must be at least ' + TCFG.CODE_MIN + ' characters.');
    }
    if (code.length > TCFG.CODE_MAX) throw new Error('Access code is too long.');
    if (!Array.isArray(teams) || teams.length < 2) throw new Error('Pick at least two teams.');
    const cap = clamp(parseInt(maxPerTeam, 10) || 3, 1, TCFG.MAX_PER_TEAM);

    /* a free row key */
    let id = randCode(TCFG.ID_LEN);
    for (let i = 0; i < 6; i++) {
      const clash = await this.get(id).catch(() => null);
      if (!clash) break;
      id = randCode(TCFG.ID_LEN);
    }

    const state = {
      kind: 'tournament',
      id,
      name,
      codeHash: hashCode(code),
      format: format || 'friendly',
      teams: teams.slice(),
      maxPerTeam: cap,
      organiserId: this.me,
      matches: [],
      advanced: [],
      champion: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this._put(state);
    return state;
  }

  checkCode(state, entered) {
    return !!state && state.codeHash === hashCode(entered);
  }

  isOrganiser(state) { return !!state && state.organiserId === this.me; }

  /* ---- matches -------------------------------------------------------- */

  /**
   * Creates a match inside a tournament and its own room row, so players can
   * join with the room code alone once they are past the tournament gate.
   */
  async createMatch(state, { teamA, teamB, stage, maxPerTeam, rounds }) {
    if (!teamA || !teamB) throw new Error('Pick both teams.');
    if (teamA === teamB) throw new Error('A team cannot play itself.');
    const cap = clamp(parseInt(maxPerTeam, 10) || state.maxPerTeam || 3, 1, TCFG.MAX_PER_TEAM);
    const rN = clamp(parseInt(rounds, 10) || 1, 1, 10);

    let roomCode = randCode(TCFG.ROOM_LEN);
    for (let i = 0; i < 6; i++) {
      const clash = await ROOMS.fetch(roomCode).catch(() => null);
      if (!clash) break;
      roomCode = randCode(TCFG.ROOM_LEN);
    }

    const match = {
      id: 'mt' + Date.now() + randCode(3),
      roomCode,
      teamA, teamB,
      stage: stage || state.format || 'friendly',
      maxPerTeam: cap,
      rounds: rN,
      status: 'upcoming',        // upcoming | live | done
      winner: null,
      totals: null,
      createdAt: new Date().toISOString(),
    };
    state.matches.push(match);
    await this.save(state);

    /* the playable room, pre-seeded with both teams */
    const room = {
      kind: 'match',
      code: roomCode,
      status: 'lobby',
      turn: 0,
      players: [],
      seq: 0,
      host: state.organiserId,
      tournamentId: state.id,
      tournamentName: state.name,
      matchId: match.id,
      teamA, teamB,
      maxPerTeam: cap,
      stage: match.stage,
      rounds: rN,
      round: 1,
      bonus: {},
      createdAt: new Date().toISOString(),
    };
    await ROOMS.save(room);
    return match;
  }

  matchById(state, id) { return (state.matches || []).find((m) => m.id === id) || null; }

  /** pull every match room so the dashboard can show live scores */
  async fetchMatchRooms(state) {
    const out = {};
    for (const m of (state.matches || [])) {
      try {
        const r = await ROOMS.fetch(m.roomCode);
        if (r) out[m.id] = r;
      } catch (_) { /* keep going; one bad row shouldn't blank the board */ }
    }
    return out;
  }

  /** team totals for one match room */
  static totalsFor(room) {
    const t = { a: 0, b: 0, aGoals: 0, bGoals: 0, aPlayers: 0, bPlayers: 0 };
    if (!room) return t;
    (room.players || []).forEach((p) => {
      if (p.teamId === room.teamA) { t.a += p.score || 0; t.aGoals += p.goals || 0; t.aPlayers++; }
      else if (p.teamId === room.teamB) { t.b += p.score || 0; t.bGoals += p.goals || 0; t.bPlayers++; }
    });
    return t;
  }

  async setMatchStatus(state, matchId, status) {
    const m = this.matchById(state, matchId);
    if (!m) return null;
    m.status = status;
    await this.save(state);
    return m;
  }

  async closeMatch(state, matchId, totals) {
    const m = this.matchById(state, matchId);
    if (!m) return null;
    m.status = 'done';
    m.totals = totals;
    m.closedAt = new Date().toISOString();
    if (!m.winner) {
      if (totals.a !== totals.b) m.winner = totals.a > totals.b ? m.teamA : m.teamB;
      else if (totals.aGoals !== totals.bGoals) m.winner = totals.aGoals > totals.bGoals ? m.teamA : m.teamB;
    }
    await this.save(state);
    return m;
  }

  async advance(state, matchId, teamId) {
    const m = this.matchById(state, matchId);
    if (!m) return null;
    m.winner = teamId;
    if (!Array.isArray(state.advanced)) state.advanced = [];
    if (state.advanced.indexOf(teamId) < 0) state.advanced.push(teamId);
    if (m.stage === 'final') state.champion = teamId;
    await this.save(state);
    return m;
  }

  async deleteMatch(state, matchId) {
    const i = (state.matches || []).findIndex((m) => m.id === matchId);
    if (i < 0) return false;
    state.matches.splice(i, 1);
    await this.save(state);
    return true;
  }
}

const TSTORE = new TournamentStore();

/* ==========================================================================
   ROOM SESSION — joining a tournament match room
   ========================================================================== */

(function extendSessionForMatches() {
  const S2 = RoomSession.prototype;

  /** true when the current room belongs to a tournament match */
  Object.defineProperty(S2, 'isMatchRoom', {
    get() { return !!(this.state && this.state.kind === 'match'); },
  });

  Object.defineProperty(S2, 'teamIds', {
    get() {
      if (!this.isMatchRoom) return null;
      return [this.state.teamA, this.state.teamB];
    },
  });

  /** how many have already taken a seat for a given team */
  S2.teamCount = function (teamId) {
    return this.players.filter((p) => p.teamId === teamId).length;
  };

  /**
   * Join a tournament match: the team must be one of the two playing, and the
   * organiser's per-team cap is enforced.
   */
  S2.joinMatch = async function (roomCode, name, teamId) {
    const code = String(roomCode || '').trim().toUpperCase();
    if (!code) throw new Error('Enter the match room code.');
    if (!String(name || '').trim()) throw new Error('Enter your name.');

    const st = await ROOMS.fetch(code);
    if (!st) throw new Error('No match room called "' + code + '". Check the code with your organiser.');
    if (st.kind !== 'match') throw new Error('That code is not a match room.');
    if (st.status === 'done') throw new Error('That match has already finished.');
    if (teamId !== st.teamA && teamId !== st.teamB) {
      throw new Error('Pick one of the two teams playing this match.');
    }

    const already = ROOMS.online ? (st.players || []).find((p) => p.id === ROOMS.me) : null;
    if (already) {
      already.name = name;                       // rejoining after a refresh
      already.teamId = teamId;
    } else {
      const cap = st.maxPerTeam || 3;
      const taken = (st.players || []).filter((p) => p.teamId === teamId).length;
      if (taken >= cap) {
        throw new Error(teamById(teamId).name + ' is full (' + cap + ' player' + (cap === 1 ? '' : 's') + ').');
      }
      if (st.status === 'playing') throw new Error('That match has already kicked off.');
      st.seq = (st.seq || (st.players || []).length) + 1;
      const id = ROOMS.online ? ROOMS.me : ROOMS.me + '_s' + st.seq;
      st.players = st.players || [];
      st.players.push({
        id, name: String(name).trim().slice(0, 24).toUpperCase(), teamId,
        score: 0, goals: 0, timeMs: 0, attempts: 0, left: CFG.ATTEMPTS,
        status: 'waiting', done: false, kicks: [],
      });
    }
    await ROOMS.save(st);
    this._adopt(st);
    return st;
  };

  /** team totals for the live scoreboard */
  S2.matchTotals = function () {
    return TournamentStore.totalsFor(this.state);
  };
})();
