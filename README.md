# ⚽ FREEKICK — KICKOFF 2026

A retro-arcade **free-kick game** that runs entirely in the browser. Three kicks, one
goalkeeper, one Freedom Cup. No build step, no libraries, no external assets — every
pixel of the stadium, every sprite and every sound is generated at runtime.

> **Disclaimer:** This is an unofficial fan project and is **not affiliated with FIFA or
> any national football federation.** Team names refer to national sides only; all kits,
> characters and artwork are original simplified designs created for this project.

---

## ▶ Play

| File | What it is |
|------|------------|
| **`index.html`** | **Retro UI (the final version)** — early-2000s arcade menus with a chunky pixel-art pitch and CRT scanlines during the match. *This is the default page when hosted.* |
| **`modern.html`** | Alternative **modern UI** — deep-navy `.io`-arcade look, violet gradient buttons, smooth high-res pitch. |

Both are **fully self-contained single files**. Download either one, double-click it, and
it opens in Chrome, Edge, Firefox or Safari. Works completely offline.

### Also included

- `separate-files/` — the retro build split into `index.html` + `style.css` + `game.js`
- `separate-files-modern/` — the modern build split into `index.html` + `style-modern.css` + `game.js` + `theme-modern.js`

The split folders and the single files are generated from the same sources, so they always
behave identically. Rebuild with:

```bash
python3 .build/build.py
```

---

## 🏆 KICKOFF 2026 — event mode

Built for the HFI internal tournament, and it works unchanged for a public release.

### The eight teams

Germany · Spain · Japan · France · Portugal · Brazil · Norway · England

Taken from the `KICKOFF 2026 (Team Selection)` sheet — **team names only**. No employee
names live anywhere in this project.

### Player flow

1. Enter your name (required) → 2. pick one of the eight teams → 3. read the instructions →
4. take 3 free kicks, each with a **20-second shot clock** → 5. see your result →
6. score is submitted to the global leaderboard → 7. view rankings, team totals and the bracket.

If the shot clock reaches zero before you kick, the attempt is **recorded as missed** with
0 points — same as a save or a wide shot.

### Tournament structure

**First round (8 teams) → Semifinal (4) → Final (2) → Champion.**

Teams don't play simultaneously. The organiser starts a match, one team's players take their
kicks, the organiser hands over, then the second team plays. The **higher combined player
score wins** and the organiser confirms who advances.

### Organiser panel

Reachable from **⚙ ORGANISER** on the title screen. Passcode: `HFI2026` — change it in
`event.js` (`EVENT.ADMIN_PASSCODE`).

| Control | What it does |
|---|---|
| **Create match** | Pick round + both teams. Team 1 shoots first. |
| **Hand over** | Switches the live match to the opposing team. |
| **Close match** | Freezes the totals; no further scores count toward it. |
| **X advances** | Confirms who goes through (also settles a draw). |
| **Reopen / Delete** | Fix mistakes. Player scores are never deleted. |
| **Reset bracket** | Clears all matches; leaderboard scores survive. |

Semifinal and Final team pickers only offer teams that have actually advanced.

### Leaderboard

Three views, live throughout the event:

- **PLAYERS** — rank, name, team, goals, score, time taken, round
- **TEAMS** — players completed, goals, combined + average score, opponent, round, result, qualified
- **TOURNAMENT** — the bracket with live match scores and the champion

---

## 🔌 Connecting the shared leaderboard (Supabase)

Without this, the game still works — scores just stay on each device. For one shared
leaderboard across everyone's laptops and phones:

**1.** Create a free project at <https://supabase.com>.

**2.** In the Supabase **SQL Editor**, run the schema from the organiser panel
(**⚙ ORGANISER → Shared leaderboard → First-time setup → COPY SQL**). It creates a
`scores` table and a single-row `tournament` table, and enables the read/insert policies
an open leaderboard needs.

**3.** In Supabase go to **Project Settings → API** and copy the **Project URL** and the
**anon public** key.

**4.** Paste both into the organiser panel and press **SAVE & TEST**. A green
confirmation means every device now shares one leaderboard.

Do this on each device that will host a play station (the settings are stored per browser),
or bake them into `event.js` if you'd rather not repeat it.

> **Security note, honestly stated:** the anon key is visible to anyone who opens the page,
> and the policies above allow anyone to add scores and edit the bracket. That's the right
> trade-off for an open internal event, but don't reuse that Supabase project for anything
> confidential. The organiser passcode is a convenience gate, not real security.

### Hosting the game itself

Everything is static, so **GitHub Pages / Netlify / Cloudflare Pages all work** — the
Supabase database is what makes the leaderboard shared, so no server of your own is needed.
Follow the GitHub Pages steps below.

---

## 🎮 Controls

| Input | Action |
|-------|--------|
| `←` `→` | **Move the player** (and the ball) along the free-kick line |
| **Mouse / trackpad / touch-drag** | **Aim** — point anywhere in or around the goal |
| `↑` `↓` | Fine-tune the aim height from the keyboard |
| `SPACE` (hold, then release) | Charge power, release to kick |
| `ENTER` | Continue after a kick |
| `R` | Restart the match |
| `M` | Mute / unmute |

Moving along the line changes the angle: walk wide and the wall no longer covers
the whole goal, but the shot comes in from a sharper angle.

On phones and tablets an on-screen D-pad and a **HOLD KICK** button appear automatically.
On desktop you can toggle them with the **TOUCH** button in the HUD.

---

## 🥅 How it plays

1. Enter a player name (required) and pick one of **12 national teams**.
2. You get **exactly three free kicks** from 22 m, each on a **20-second shot clock**, with a three-man defensive wall that re-sets itself as you move.
3. Walk the line with `←` `→`, aim with the mouse, then hold `SPACE` to charge.
4. The keeper reads the shot, dives, and sometimes reacts late.

**Aim for the corners.** The scoring rewards it:

| Result | Points |
|--------|--------|
| Normal goal | 100 |
| Bottom-corner goal | 125 |
| Top-corner goal | 175 |
| Goal after hitting the post | 200 |
| Perfect power (60–80% zone) | **+50 bonus** |
| Save, miss, woodwork, wall block, timed out | 0 |

Power matters in both directions: **low power** gives the keeper more time to adjust, while
**maximum power** loses accuracy and invites the crossbar. The 60–80% band is the sweet spot.

**Ratings:** 0 goals → *Rookie* · 1 → *Rising Star* · 2 → *Free-Kick Specialist* · 3 → *Freedom Cup Champion*

Top-ten high scores (name, team, score, goals, date) are saved with `localStorage` and
survive a refresh.

---

## 🌐 Host it free on GitHub Pages

Because the game is one static file with no backend, GitHub Pages hosts it for free.

### 1. Sign in to GitHub from your terminal

```bash
gh auth login
```

### 2. Create the repo and push

```bash
git remote add origin https://github.com/<your-username>/freekick-fifa-freedom.git
git branch -M main
git push -u origin main
```

Or let the GitHub CLI create it for you in one step:

```bash
gh repo create freekick-fifa-freedom --public --source=. --remote=origin --push
```

### 3. Turn on Pages

```bash
gh api -X POST repos/<your-username>/freekick-fifa-freedom/pages \
  -f "source[branch]=main" -f "source[path]=/"
```

Or in the browser: **Settings → Pages → Source: Deploy from a branch → `main` / `/root` → Save.**

Your game goes live in a minute or two at:

```
https://<your-username>.github.io/freekick-fifa-freedom/
```

`index.html` (the retro UI, the final version) is served automatically, and the modern
skin sits at `/modern.html`.

> The repo must be **public** for Pages to work on a free GitHub account.

### Other free options

| Host | How |
|------|-----|
| **Netlify Drop** | Drag the project folder onto <https://app.netlify.com/drop> — instant URL, no account needed to try. |
| **Cloudflare Pages** | Connect the GitHub repo; no build command, output directory `/`. |
| **Vercel** | Import the repo, framework preset **Other**, no build command. |

---

## ✨ Features

- Pseudo-3D pitch with perspective projection — the ball scales and curves as it travels
- Arcade ball physics: scripted swerving arc, then free physics for rebounds and bounces
- Goalkeeper AI with reaction delay, occasional late dives, catches, deflections and fumbles
- Collision on the posts, crossbar, keeper and defensive wall (post rebounds can still go in)
- Recorded stadium audio (royalty-free): menu music, looping crowd ambience, kickoff whistle, goal commentary, cheers and groans — with full synthesized fallback if `audio/` is missing, so the single HTML file still works alone
- Web Audio API sound design — charge-up, kick, woodwork ring, net swish, fireworks
- Procedurally drawn crowd, waving flags, floodlights, scrolling hoardings and celebration fireworks
- Accessible: keyboard-navigable menus, visible focus rings, ARIA live commentary, `prefers-reduced-motion` support

---

## 🗂 Project layout

```
index.html                 retro build (final) — the default page
audio/                     recorded sound effects (optional; synth fallback without it)
modern.html                modern build, self-contained
game.js                    core game — states, physics, keeper, scoring, audio, UI
event.js                   KICKOFF 2026: 8 teams, shot clock, bracket, Supabase client
event-ui.js                event screens — instructions, leaderboard, organiser panel
style.css                  retro skin
style-modern.css           modern skin
theme-modern.js            renderer overrides for the modern look (visuals only)
separate-files/            retro, split into three files
separate-files-modern/     modern, split into four files
.build/                    HTML template + build script
```

`theme-modern.js` touches **only** rendering — no gameplay, physics, scoring or input
logic is duplicated between the two themes.

---

Built with vanilla HTML, CSS and JavaScript. No frameworks, no dependencies.
