# ⚽ FREEKICK: FIFA & FREEDOM

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
2. You get **exactly three free kicks** from 22 m, with a three-man defensive wall that re-sets itself as you move.
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
| Save, miss, woodwork, wall block | 0 |

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
- Web Audio API sound design — whistle, charge-up, kick, woodwork ring, net swish, crowd, fireworks
- Procedurally drawn crowd, waving flags, floodlights, scrolling hoardings and celebration fireworks
- Accessible: keyboard-navigable menus, visible focus rings, ARIA live commentary, `prefers-reduced-motion` support

---

## 🗂 Project layout

```
index.html                 retro build (final), self-contained — the default page
modern.html                modern build, self-contained
game.js                    all game logic — states, physics, keeper, scoring, audio, UI
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
