/* ==========================================================================
   FREEKICK — LIVE UPDATES OVER WEBSOCKETS
   realtime.js
   --------------------------------------------------------------------------
   Replaces second-by-second polling with an actual WebSocket so a match feels
   live. It speaks Supabase Realtime's Phoenix-channel protocol directly — no
   SDK, no build step, still one static file.

   How it works:
     • one socket to  wss://<project>.supabase.co/realtime/v1/websocket
     • each room joins a BROADCAST channel named  room:<CODE>
     • after any client writes room state it broadcasts a tiny "sync" nudge
     • every other client hears it in ~50ms and re-reads the row immediately

   Why broadcast rather than Postgres change-feeds: broadcast needs no database
   configuration at all (no publication/replication SQL), so it works on a
   fresh project with just the anon key. The REST row stays the source of
   truth, so a dropped socket can never corrupt a match.

   Fallback: polling never goes away — it just slows to a 5s safety net while
   the socket is healthy, and returns to 1s if the socket drops. So the game
   still works on locked-down networks that block WebSockets.
   ========================================================================== */
'use strict';

const RT = {
  HEARTBEAT_MS: 25000,
  RECONNECT_MIN: 1000,
  RECONNECT_MAX: 15000,
  POLL_FAST: 1000,      // no socket: poll like before
  POLL_SLOW: 5000,      // socket healthy: just a safety net
};

class Realtime {
  constructor() {
    this.ws = null;
    this.ref = 0;
    this.topics = new Map();     // topic -> { joined, handlers[] }
    this.status = 'idle';        // idle | connecting | open | closed | unsupported
    this.retry = RT.RECONNECT_MIN;
    this.hb = null;
    this.onStatus = null;
    this.lastError = null;
  }

  get connected() { return this.status === 'open'; }

  socketUrl() {
    const cfg = BACKEND.cfg || {};
    if (!cfg.url || !cfg.anonKey) return null;
    const base = String(cfg.url).replace(/^http/, 'ws').replace(/\/+$/, '');
    return base + '/realtime/v1/websocket?apikey=' + encodeURIComponent(cfg.anonKey) + '&vsn=1.0.0';
  }

  connect() {
    if (typeof WebSocket === 'undefined') { this._set('unsupported'); return; }
    if (this.ws && (this.status === 'open' || this.status === 'connecting')) return;
    const url = this.socketUrl();
    if (!url) { this._set('idle'); return; }

    this._set('connecting');
    let ws;
    try { ws = new WebSocket(url); }
    catch (err) { this.lastError = err.message; this._set('closed'); this._scheduleReconnect(); return; }
    this.ws = ws;

    ws.onopen = () => {
      this.retry = RT.RECONNECT_MIN;
      this._set('open');
      this._startHeartbeat();
      /* (re)join every topic we care about */
      this.topics.forEach((t, topic) => { t.joined = false; this._join(topic); });
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg || !msg.topic) return;
      if (msg.event === 'phx_reply') {
        const t = this.topics.get(msg.topic);
        if (t && msg.payload && msg.payload.status === 'ok') {
          /* the join for this topic is live; publishes will now fan out */
          t.joined = true;
          if (this.onStatus) { try { this.onStatus(this.status); } catch (_) {} }
        }
        return;
      }
      if (msg.event === 'broadcast') {
        const t = this.topics.get(msg.topic);
        if (!t) return;
        const inner = msg.payload && msg.payload.payload ? msg.payload.payload : {};
        const evName = msg.payload && msg.payload.event ? msg.payload.event : '';
        t.handlers.forEach((fn) => { try { fn(evName, inner); } catch (_) {} });
      }
    };

    ws.onerror = () => { this.lastError = 'socket error'; };

    ws.onclose = () => {
      this._stopHeartbeat();
      this.topics.forEach((t) => { t.joined = false; });
      if (this.status !== 'unsupported') this._set('closed');
      this._scheduleReconnect();
    };
  }

  disconnect() {
    this._stopHeartbeat();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch (_) {} }
    this.ws = null;
    this.topics.clear();
    this._set('idle');
  }

  _set(s) {
    if (this.status === s) return;
    this.status = s;
    if (this.onStatus) { try { this.onStatus(s); } catch (_) {} }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (!this.topics.size) return;               // nothing to listen for
    const wait = this.retry;
    this.retry = Math.min(RT.RECONNECT_MAX, Math.round(this.retry * 1.8));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, wait);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.hb = setInterval(() => {
      this._send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++this.ref) });
    }, RT.HEARTBEAT_MS);
  }

  _stopHeartbeat() {
    if (this.hb) { clearInterval(this.hb); this.hb = null; }
  }

  _send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; }
    catch (_) { return false; }
  }

  _join(topic) {
    this._send({
      topic,
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { self: false, ack: false },
          presence: { key: '' },
        },
      },
      ref: String(++this.ref),
    });
  }

  /** listen on a channel; returns an unsubscribe function */
  subscribe(name, handler) {
    const topic = 'realtime:' + name;
    let t = this.topics.get(topic);
    if (!t) { t = { joined: false, handlers: [] }; this.topics.set(topic, t); }
    t.handlers.push(handler);
    this.connect();
    if (this.connected && !t.joined) this._join(topic);
    return () => {
      const cur = this.topics.get(topic);
      if (!cur) return;
      cur.handlers = cur.handlers.filter((h) => h !== handler);
      if (!cur.handlers.length) {
        this._send({ topic, event: 'phx_leave', payload: {}, ref: String(++this.ref) });
        this.topics.delete(topic);
      }
    };
  }

  /** tell everyone else on a channel that something changed */
  publish(name, event, payload) {
    const topic = 'realtime:' + name;
    return this._send({
      topic,
      event: 'broadcast',
      payload: { type: 'broadcast', event: event, payload: payload || {} },
      ref: String(++this.ref),
    });
  }
}

const LIVE = new Realtime();

/* ==========================================================================
   WIRING — rooms and the organiser dashboard ride the socket
   ========================================================================== */

(function wireRealtime() {
  const S2 = RoomSession.prototype;

  /* ---- a room subscribes on adopt, unsubscribes on leave -------------- */

  const origAdopt = S2._adopt;
  S2._adopt = function (st) {
    origAdopt.call(this, st);
    this._liveJoin();
  };

  S2._liveJoin = function () {
    if (!this.code) return;
    if (this._liveOff && this._liveCode === this.code) return;   // already on it
    if (this._liveOff) { this._liveOff(); this._liveOff = null; }
    if (!BACKEND.online) return;                                  // hot-seat: no socket
    this._liveCode = this.code;
    this._liveOff = LIVE.subscribe('room:' + this.code, (ev, payload) => {
      const g = window.FREEKICK;
      /* watch the friend's ball fly, then hear the verdict */
      if (ev === 'kick') { if (g && g.playRemoteKick) g.playRemoteKick(payload); return; }
      if (ev === 'shot') { if (g && g.ui.showRemoteShot) g.ui.showRemoteShot(payload); this.poll(); return; }
      /* somebody changed the room — read it now rather than on the next tick */
      this.poll();
    });
    this._retune();
  };

  /** slow the poll down while the socket is healthy */
  S2._retune = function () {
    const want = LIVE.connected ? RT.POLL_SLOW : RT.POLL_FAST;
    if (this._pollEvery === want) return;
    this._pollEvery = want;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.poll(), want);
    }
  };

  const origStartPolling = S2.startPolling;
  S2.startPolling = function () {
    this.stopPolling();
    const every = LIVE.connected ? RT.POLL_SLOW : RT.POLL_FAST;
    this._pollEvery = every;
    this.timer = setInterval(() => this.poll(), every);
  };

  const origLeave = S2.leave;
  S2.leave = function () {
    if (this._liveOff) { this._liveOff(); this._liveOff = null; this._liveCode = null; }
    return origLeave.call(this);
  };

  /* ---- every write nudges the other clients --------------------------- */

  const origPush = S2.push;
  S2.push = async function () {
    const r = await origPush.call(this);
    if (this.code && BACKEND.online) {
      LIVE.publish('room:' + this.code, 'sync', { at: Date.now(), by: this.me });
    }
    return r;
  };

  /* ---- the dashboard listens to its tournament ------------------------ */

  const U = UI.prototype;

  const origOpenDash = U.openDash;
  U.openDash = function (state) {
    origOpenDash.call(this, state);
    const st = this.tstate;
    if (!st || !BACKEND.online) return;
    if (this._dashOff) { this._dashOff(); this._dashOff = null; }
    this._dashOff = LIVE.subscribe('tourney:' + st.id, () => this.refreshDash(true));
    /* match rooms broadcast on their own channels, so follow each of them too */
    this._dashRoomOffs = (this._dashRoomOffs || []);
    this._dashRoomOffs.forEach((off) => off());
    this._dashRoomOffs = (st.matches || []).map((m) =>
      LIVE.subscribe('room:' + m.roomCode, () => this.refreshDash(true)));
  };

  /* keep the tournament channel fed when the organiser changes something */
  if (typeof TournamentStore !== 'undefined') {
    const origSave = TournamentStore.prototype.save;
    TournamentStore.prototype.save = async function (state) {
      const r = await origSave.call(this, state);
      if (state && state.id && BACKEND.online) {
        LIVE.publish('tourney:' + state.id, 'sync', { at: Date.now() });
      }
      return r;
    };
  }

  /* ---- retune polling whenever the socket state flips ----------------- */

  LIVE.onStatus = () => {
    if (SESSION && SESSION.active) SESSION._retune();
    const el = document.getElementById('liveBadge');
    if (!el) return;
    const s = LIVE.status;
    const live = s === 'open';
    el.className = 'live-badge ' + (live ? 'on' : 'off');
    el.textContent = live ? '⚡ LIVE' : (s === 'connecting' ? '… CONNECTING' : '◌ POLLING');
    el.title = live
      ? 'Real-time updates over WebSocket'
      : 'WebSocket unavailable — falling back to polling every second';
  };
})();
