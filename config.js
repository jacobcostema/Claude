/* ============================================================
   FIREBASE CONNECTION
   ------------------------------------------------------------
   These keys connect the app to your shared Firestore database
   so every player logs into ONE leaderboard. A Firebase web
   apiKey is not a secret — it's safe in client-side code; your
   data is protected by Firestore security rules.

   To change projects, replace the values below with the block
   from: Firebase console → ⚙️ Project settings → Your apps → Config.
   ============================================================ */

export const firebaseConfig = {
  apiKey: "AIzaSyDXY05D_GA7YxYThpnwEzVc5jX_41dYZjo",
  authDomain: "tracker-7676c.firebaseapp.com",
  projectId: "tracker-7676c",
  storageBucket: "tracker-7676c.firebasestorage.app",
  messagingSenderId: "82524910690",
  appId: "1:82524910690:web:c749f818394a443cf6cd3b",
  measurementId: "G-3HCSD47VTM",
};
