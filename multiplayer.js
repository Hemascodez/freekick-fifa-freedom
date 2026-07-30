/* ==========================================================================
   FREEKICK — FRIENDLY MATCH (private rooms)
   multiplayer.js
   --------------------------------------------------------------------------
   Discord-style play with friends: one person creates a room, everyone else
   joins with a 4-letter code (or the share link), and players take their
   three free kicks in turn while the whole room watches the scoreboard
   update live.

   Turn model: a turn is one player's full set of three kicks. That keeps the
   single-striker feel of a free kick (nobody shoots simultaneously) and maps
   exactly onto the existing three-kick match.

   Transport: Supabase REST, polled once a second. For a turn-based shootout
   that reads as live. With no backend configured it falls back to HOT-SEAT
   mode — everyone plays on one device, passing it around.
   ========================================================================== */
'use strict';

const ROOM = {
  POLL_MS: 1000,
  CODE_LEN: 4,
  ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',   // no I/O/0/1 lookalikes
  MAX_PLAYERS: 8,
  KEY_ME: 'freekick_client_id_v1',
  KEY_LOCAL_ROOM: 'freekick_local_room_v1',
};

/** a stable per-browser id so a player can rejoin after a refresh */
function myClientId() {
  try {
    let id = localStorage.getItem(ROOM.KEY_ME);
    if (!id) {
      id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem(ROOM.KEY_ME, id);
    }
    return id;
  } catch (_) {
    return 'c' + Math.random().toString(36).slice(2, 10);
  }
}

function makeRoomCode() {
  let s = '';
  for (let i = 0; i < ROOM.CODE_LEN; i++) {
    s += ROOM.ALPHABET[Math.floor(Math.random() * ROOM.ALPHABET.length)];
  }
  return s;
}

/* ==========================================================================
   ROOM STORE — Supabase when connected, localStorage for hot-seat
   ========================================================================== */

class RoomStore {
  constructor() { this.me = myClientId(); }

  get online() { return BACKEND.online; }

  _blank(code, hostName) {
    return {
      code,
      host: this.me,
      status: 'lobby',            // lobby | playing | done
      turn: 0,                    // index into players
      players: [],
      createdAt: new Date().toISOString(),
      hostName: hostName || '',
    };
  }

  /* ---- local (hot-seat) ------------------------------------------------ */

  _readLocal() {
    try { return JSON.parse(localStorage.getItem(ROOM.KEY_LOCAL_ROOM)) || null; }
    catch (_) { return null; }
  }

  _writeLocal(state) {
    try { localStorage.setItem(ROOM.KEY_LOCAL_ROOM, JSON.stringify(state)); } catch (_) {}
    return state;
  }

  /* ---- remote ---------------------------------------------------------- */

  async _get(code) {
    const rows = await BACKEND._fetch(
      'rooms?select=*&code=eq.' + encodeURIComponent(code) + '&limit=1',
      { headers: BACKEND._headers() });
    return (Array.isArray(rows) && rows[0]) ? rows[0].state : null;
  }

  async _put(state) {
    await BACKEND._fetch('rooms?on_conflict=code', {
      method: 'POST',
      headers: BACKEND._headers({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ code: state.code, state, updated_at: new Date().toISOString() }),
    });
    return state;
  }

  /* ---- public API ------------------------------------------------------ */

  async create(hostName) {
    const state = this._blank(makeRoomCode(), hostName);
    if (!this.online) return this._writeLocal(state);
    for (let tries = 0; tries < 5; tries++) {
      const existing = await this._get(state.code).catch(() => null);
      if (!existing) return this._put(state);
      state.code = makeRoomCode();          // collision, try another
    }
    throw new Error('Could not allocate a room code — please try again.');
  }

  async fetch(code) {
    if (!this.online) {
      const local = this._readLocal();
      return (local && local.code === code) ? local : null;
    }
    return this._get(code);
  }

  async save(state) {
    state.updatedAt = new Date().toISOString();
    if (!this.online) return this._writeLocal(state);
    return this._put(state);
  }
}

const ROOMS = new RoomStore();

/* ==========================================================================
   ROOM SESSION — the client's view of a room, kept fresh by polling
   ========================================================================== */

class RoomSession {
  constructor() {
    this.state = null;
    this.code = null;
    this.timer = null;
    this.onChange = null;
    this.lastJson = '';
    this.error = null;
  }

  get active() { return !!this.state; }
  get me() { return ROOMS.me; }
  get isHost() { return !!this.state && this.state.host === this.me; }
  get players() { return (this.state && this.state.players) || []; }
  get myPlayer() { return this.players.find((p) => p.id === this.me) || null; }
  get currentPlayer() { return this.players[this.state ? this.state.turn : 0] || null; }
  get isMyTurn() {
    const c = this.currentPlayer;
    return !!c && c.id === this.me && this.state.status === 'playing' && !c.done;
  }
  /** hot-seat: everyone shares one browser, so "my turn" is whoever is up */
  get hotSeat() { return !ROOMS.online; }

  get shareLink() {
    const base = location.href.split('?')[0].split('#')[0];
    return base + '?room=' + this.code;
  }

  async create(name, teamId) {
    const st = await ROOMS.create(name);
    st.players = [{ id: ROOMS.me, name, teamId, score: 0, goals: 0, timeMs: 0, done: false, kicks: [] }];
    await ROOMS.save(st);
    this._adopt(st);
    return st;
  }

  async join(code, name, teamId) {
    code = String(code || '').trim().toUpperCase();
    if (!code) throw new Error('Enter a room code.');
    const st = await ROOMS.fetch(code);
    if (!st) throw new Error('No room called "' + code + '". Check the code with your friends.');
    if (st.status === 'done') throw new Error('That match has already finished.');

    const mine = st.players.find((p) => p.id === ROOMS.me);
    if (mine) {                       // rejoining after a refresh
      mine.name = name; mine.teamId = teamId;
    } else {
      if (st.status === 'playing') throw new Error('That match has already kicked off.');
      if (st.players.length >= ROOM.MAX_PLAYERS) throw new Error('That room is full (' + ROOM.MAX_PLAYERS + ' players).');
      /* hot-seat rooms live in one browser, so every seat shares a client id */
      const id = ROOMS.online ? ROOMS.me : ROOMS.me + '_' + (st.players.length + 1);
      st.players.push({ id, name, teamId, score: 0, goals: 0, timeMs: 0, done: false, kicks: [] });
    }
    await ROOMS.save(st);
    this._adopt(st);
    return st;
  }

  _adopt(st) {
    this.state = st;
    this.code = st.code;
    this.lastJson = JSON.stringify(st);
    this.startPolling();
  }

  /* ---- host actions ---------------------------------------------------- */

  async start() {
    if (!this.state) return;
    if (this.state.players.length < 1) throw new Error('Nobody has joined yet.');
    this.state.status = 'playing';
    this.state.turn = 0;
    await this.push();
  }

  async reset() {
    if (!this.state) return;
    this.state.status = 'lobby';
    this.state.turn = 0;
    this.state.players.forEach((p) => {
      p.score = 0; p.goals = 0; p.timeMs = 0; p.done = false; p.kicks = [];
    });
    await this.push();
  }

  /* ---- a player finishing their three kicks --------------------------- */

  async submitTurn(result) {
    if (!this.state) return;
    const cur = this.currentPlayer;
    if (!cur) return;
    cur.score = result.score;
    cur.goals = result.goals;
    cur.timeMs = Math.round(result.timeMs);
    cur.kicks = result.kicks;
    cur.done = true;
    /* hand over to the next player who hasn't finished */
    const next = this.state.players.findIndex((p) => !p.done);
    if (next < 0) this.state.status = 'done';
    else this.state.turn = next;
    await this.push();
  }

  async leave() {
    this.stopPolling();
    if (this.state) {
      const i = this.state.players.findIndex((p) => p.id === this.me);
      /* only prune from a lobby — mid-match removal would break the order */
      if (i >= 0 && this.state.status === 'lobby') {
        this.state.players.splice(i, 1);
        if (this.state.host === this.me && this.state.players.length) {
          this.state.host = this.state.players[0].id;
        }
        await ROOMS.save(this.state).catch(() => {});
      }
    }
    this.state = null;
    this.code = null;
  }

  async push() {
    if (!this.state) return;
    try {
      await ROOMS.save(this.state);
      this.error = null;
    } catch (err) {
      this.error = err.message;
    }
    this.lastJson = JSON.stringify(this.state);
    if (this.onChange) this.onChange(this.state);
  }

  /* ---- polling --------------------------------------------------------- */

  startPolling() {
    this.stopPolling();
    this.timer = setInterval(() => this.poll(), ROOM.POLL_MS);
  }

  stopPolling() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  async poll() {
    if (!this.code) return;
    try {
      const st = await ROOMS.fetch(this.code);
      if (!st) return;
      const json = JSON.stringify(st);
      if (json === this.lastJson) return;
      /* never clobber our own in-flight turn with a stale read */
      this.lastJson = json;
      this.state = st;
      this.error = null;
      if (this.onChange) this.onChange(st);
    } catch (err) {
      this.error = err.message;
    }
  }

  /** standings, best first */
  get standings() {
    return this.players.slice().sort((a, b) =>
      (b.score - a.score) || (b.goals - a.goals) || (a.timeMs - b.timeMs));
  }

  get winner() {
    const s = this.standings;
    if (!s.length || this.state.status !== 'done') return null;
    if (s.length > 1 && s[0].score === s[1].score && s[0].goals === s[1].goals) return null;  // tie
    return s[0];
  }
}

const SESSION = new RoomSession();

/* ==========================================================================
   GAME PATCHES — route a finished match back into the room
   ========================================================================== */

(function patchForRooms() {
  const G = Game.prototype;

  const origEnd = G.endMatch;
  G.endMatch = function () {
    /* friendly matches don't feed the tournament leaderboard */
    if (this.mode === 'room' && SESSION.active) {
      const rating = this.board.rating;
      this.ui.showResults(this.board, rating, -1, [], null);
      this.setState(S.FINAL_RESULTS);
      SESSION.submitTurn({
        score: this.board.score,
        goals: this.board.goals,
        timeMs: this.eventTimeMs,
        kicks: this.board.history.map((h) => ({ o: h.outcome, p: h.points })),
      }).then(() => this.ui.showRoom());
      return;
    }
    return origEnd.call(this);
  };
})();
