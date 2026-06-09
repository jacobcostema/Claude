/* ============================================================
   FIREBASE CONNECTION
   ------------------------------------------------------------
   Paste your Firebase web-app config below to turn on the shared
   leaderboard (everyone logs into the SAME data, photos sync to
   all phones).

   How to get these values (~5 minutes, free):
     1. Go to https://console.firebase.google.com → "Add project".
     2. Once created, click the </> (web) icon to "Add app".
     3. Firebase shows a `firebaseConfig = { ... }` block — copy
        each value into the matching field below.
     4. In the left menu open "Build → Firestore Database" →
        "Create database" → start in TEST mode (fine to start;
        see README for locking it down later).

   Until real keys are pasted, the app runs in LOCAL mode
   (data stays on each phone — no shared leaderboard).
   ============================================================ */

export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};
