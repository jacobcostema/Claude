# 🏆 Player Accountability Tracker

A lightweight, mobile-first web app for keeping athletes accountable over the
summer. Players log daily check-ins across nutrition, training, hydration and
sleep — and **must upload a photo as proof to bank the points**. A weekly
leaderboard keeps everyone competing.

The app runs as a static site (no build step) and stores shared data in
**Firebase Firestore**, so every player logs into ONE combined leaderboard and
photos sync to all phones in real time. Until Firebase keys are added it falls
back to **local mode** (data per-phone) so it still works for testing.

## 🔗 The link to send players

Once Pages is turned on (one-time, below), the app is live at:

```
https://jacobcostema.github.io/Claude/
```

### Turn on hosting (one-time, ~30 seconds — only the repo owner can do this)
1. Open the repo on GitHub → **Settings** → **Pages** (left sidebar).
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. **Branch:** pick `claude/player-accountability-tracker-sa2b1k`, folder **`/ (root)`**, then **Save**.
4. Wait ~1 minute, refresh the Pages settings page — it'll show the live URL above.

After that, every push to the branch republishes automatically. (GitHub's
automation isn't permitted to enable Pages for you the first time, which is why
this one click is manual.)

## ⚙️ One-time setup to turn on the shared leaderboard (~5 min)

1. Go to <https://console.firebase.google.com> → **Add project** (any name, you
   can skip Google Analytics).
2. In the project, click the **`</>` (web)** icon to "Add app", give it a
   nickname, register it. Firebase shows a `firebaseConfig = { ... }` block.
3. Copy each value into the matching field in **`config.js`** in this repo.
4. In the left menu: **Build → Firestore Database → Create database**. Start in
   **test mode** to get going (lock it down later — see "Securing it" below).
5. Commit `config.js`. GitHub Actions redeploys; the link now shares data.

After step 5, every phone that opens the link sees the same players, check-ins,
photos and leaderboard.

### How players use it
- Open the link, tap ⚙️ → add themselves (or you pre-add the whole roster).
- On their own phone they tap 👤 next to their name to mark "this is me".
- **Log** tab → pick a category → snap the required photo → confirm → points banked.
- **Board** tab → the shared weekly leaderboard.

## Categories (and points)

| Category            | Points | Per day | Photo required |
|---------------------|:------:|:-------:|:--------------:|
| 🍳 Pre-Training Meal | 10     | 1       | ✅ |
| 🍗 Post-Training Meal| 10     | 1       | ✅ |
| 💪 Workout Session   | 15     | 1       | ✅ |
| 🥩 Protein Intake    | 10     | 1       | ✅ |
| 💧 Water Bottle      | 3      | 4       | ✅ |
| 😴 Sleep Check-In    | 10     | 1       | ✅ |

**Category rules (shown as subnotes in the app):**
- 🥩 **Protein** — goal is 1g of protein per lb of body weight.
- 💧 **Water** — one log = one finished 32 oz bottle (4/day ≈ a gallon).
- 😴 **Sleep** — 7.5 hr minimum; proof = a screenshot of a sleep tracker or the phone's bedtime/alarm screen.

Edit the `CATEGORIES` array at the top of `app.js` to change points, add
categories, set per-day limits, or toggle the photo requirement.

## Features
- **Photo-gated points** — photos are compressed/resized client-side (≈800px,
  JPEG) so they stay well under Firestore's 1 MB/doc limit, no separate photo
  storage/billing needed.
- **Real-time shared leaderboard** with week navigation (Monday-based weeks).
- **Live connection pill** in the header: `● Live` (shared) vs `● Local only`.
- **Per-player category breakdown**, **Today** progress bar, full **History**.

## Securing it (recommended before wide rollout)

Test mode lets anyone read/write. For a roster of teenagers that's usually fine
short-term, but to lock it down go to **Firestore → Rules**. A simple option is
to keep it open only to your group, or add Firebase Anonymous Auth and require
`request.auth != null`. Ask and I can wire that up.

## Files
- `index.html` — markup, tabs, header
- `styles.css` — mobile-first dark theme
- `app.js` — logic + data layer (Firestore with localStorage fallback)
- `config.js` — paste your Firebase keys here
- `.nojekyll` — tells GitHub Pages to serve files as-is
