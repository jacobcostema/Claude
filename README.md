# 🏆 Player Accountability Tracker

A lightweight, mobile-first web app for keeping athletes accountable over the
summer. Players log daily check-ins across nutrition, training, hydration and
sleep — and **must upload a photo as proof to bank the points**. A weekly
leaderboard keeps everyone competing.

This is a **zero-dependency prototype**: plain HTML/CSS/JS, no build step, no
server required. Data is stored in the browser via `localStorage`, so you can
open it and start using it immediately.

## Quick start

Just open `index.html` in a browser. For phones, serve it on your network:

```bash
# from this folder
python3 -m http.server 8000
# then visit http://<your-computer-ip>:8000 on your phone
```

1. Tap the ⚙️ in the header to add your players.
2. Use the **Log** tab to record a check-in — pick a category, snap the photo, confirm.
3. Check **Today** for daily progress, **Board** for the weekly leaderboard, and **History** for the full photo log.

## Categories (and points)

| Category            | Points | Per day | Photo required |
|---------------------|:------:|:-------:|:--------------:|
| 🍳 Pre-Training Meal | 10     | 1       | ✅ |
| 🍗 Post-Training Meal| 10     | 1       | ✅ |
| 💪 Workout Session   | 15     | 2       | ✅ |
| 🥩 Protein Intake    | 10     | 1       | ✅ |
| 💧 Water Bottle      | 5      | 4       | ✅ |
| 😴 Sleep Check-In    | 10     | 1       | ✅ |

Tweak these in the `CATEGORIES` array at the top of `app.js` — change points,
add categories, set how many times per day each can be logged, or toggle the
photo requirement.

## Features

- **Photo-gated points** — photos are compressed/resized client-side before storage so you don't blow past the localStorage limit.
- **Weekly leaderboard** with week navigation (Monday-based weeks).
- **Per-player category breakdown** so you can see where each athlete is strong or slacking.
- **Today view** with a daily points-progress bar.
- **Full history** with tappable photo proof.
- Works offline; installable feel on mobile.

## Current limitations (it's a starting point)

- Data lives in **one browser** — players each have their own local copy; it is
  not yet shared across devices. The leaderboard reflects whatever was logged on
  that device.
- No authentication.

## Going multi-device (recommended next step)

To make this a true shared tracker (everyone logs on their phone, one combined
leaderboard), swap the `load`/`save` functions in `app.js` for a backend. Good
no-/low-code options:

- **Firebase** (Firestore + Storage for photos) — fastest path to real-time shared data.
- **Supabase** — Postgres + storage, generous free tier.
- A small **Node/Express + SQLite** API if you want to self-host.

The data model is intentionally simple — `players` and `entries` (each entry
has `playerId`, `category`, `points`, `photo`, `timestamp`) — so it maps
directly onto any of these.

## Files

- `index.html` — markup and tab structure
- `styles.css` — mobile-first dark theme
- `app.js` — all logic (state, rendering, photo handling, leaderboard)
