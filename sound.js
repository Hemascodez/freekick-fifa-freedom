/* ==========================================================================
   FREEKICK — sound layer fixes
   sound.js
   --------------------------------------------------------------------------
   • adds the room-join sting
   • a mute button that is visible on every screen, not just in-game
   • a click sound on every button
   • unlocks audio on the first interaction anywhere (autoplay rules)
   • one-time reset of a stale "muted" preference
   ========================================================================== */
'use strict';

/* the shimmering level-up sting for someone joining a room */
SAMPLE_DEFS.join = { src: 'audio/join-room.mp3', vol: 0.6 };

(function soundFixes() {

  /* ---- a short UI click ------------------------------------------------ */

  RetroAudio.prototype.uiClick = function () {
    this.tone({ type: 'square', freq: 1180, to: 1500, dur: 0.035, gain: 0.09 });
  };

  /* ---- one-time reset of a stale mute preference -----------------------
     Earlier automated testing persisted muted:true into localStorage, which
     left the game silent on load. Clear it once, then respect the user's
     choice from that point on. */
  const SOUND_RESET_KEY = 'freekick_sound_reset_v2';
  try {
    if (!localStorage.getItem(SOUND_RESET_KEY)) {
      const p = Prefs.read();
      if (p.muted) { delete p.muted; Prefs.write(p); }
      localStorage.setItem(SOUND_RESET_KEY, '1');
    }
  } catch (_) { /* private mode — nothing to clear */ }

  /* ---- UI patches ----------------------------------------------------- */

  const U = UI.prototype;

  /** keep the in-game and always-on mute buttons in step */
  const origSyncMute = U.syncMute;
  U.syncMute = function (m) {
    origSyncMute.call(this, m);
    const g = $('btnMuteGlobal');
    if (g) {
      g.textContent = m ? '🔇' : '🔊';
      g.classList.toggle('off', m);
      g.setAttribute('aria-pressed', m ? 'true' : 'false');
      g.setAttribute('aria-label', m ? 'Sound is off. Turn sound on' : 'Sound is on. Mute sound');
      g.title = m ? 'Sound off — click to unmute (M)' : 'Sound on — click to mute (M)';
    }
  };

  const origBind = U.bindButtons;
  U.bindButtons = function () {
    origBind.call(this);

    const gm = $('btnMuteGlobal');
    if (gm) {
      gm.addEventListener('click', (e) => {
        e.stopPropagation();
        AUDIO.onUserGesture();
        this.g.toggleMute();
      });
    }

    /* Every button makes a click, and every interaction unlocks audio.
       Capture phase so it fires before the button's own handler. */
    document.addEventListener('pointerdown', (e) => {
      AUDIO.onUserGesture();
      const b = e.target && e.target.closest && e.target.closest('button, .team-face, .mode-card');
      if (b && !b.disabled) AUDIO.uiClick();
    }, true);

    /* keyboard users get the unlock too */
    window.addEventListener('keydown', () => AUDIO.onUserGesture(), { capture: true });
  };

  /* ---- room join sting ------------------------------------------------- */

  if (typeof RoomSession !== 'undefined') {
    const origJoin = RoomSession.prototype.join;
    RoomSession.prototype.join = function (code, name, teamId) {
      return origJoin.call(this, code, name, teamId).then((st) => {
        if (!AUDIO.playSample('join')) {
          /* synth fallback: a rising shimmer */
          [784, 988, 1319, 1568].forEach((f, i) =>
            AUDIO.tone({ type: 'triangle', freq: f, dur: 0.16, gain: 0.16, delay: i * 0.07 }));
        }
        return st;
      });
    };

    const origCreate = RoomSession.prototype.create;
    RoomSession.prototype.create = function (name, teamId) {
      return origCreate.call(this, name, teamId).then((st) => {
        if (!AUDIO.playSample('join')) {
          [784, 988, 1319, 1568].forEach((f, i) =>
            AUDIO.tone({ type: 'triangle', freq: f, dur: 0.16, gain: 0.16, delay: i * 0.07 }));
        }
        return st;
      });
    };
  }

  /* ---- announce new arrivals to everyone already in the room ---------- */

  if (typeof RoomSession !== 'undefined') {
    const origPoll = RoomSession.prototype.poll;
    RoomSession.prototype.poll = async function () {
      const before = this.players.length;
      const wasStatus = this.state && this.state.status;
      await origPoll.call(this);
      /* somebody new appeared in the room */
      if (this.players.length > before) {
        if (!AUDIO.playSample('join')) AUDIO.menuSelect();
      }
      /* the host just kicked the match off */
      if (wasStatus === 'lobby' && this.state && this.state.status === 'playing') {
        if (!AUDIO.playSample('whistle')) AUDIO.whistle();
      }
    };
  }
})();
