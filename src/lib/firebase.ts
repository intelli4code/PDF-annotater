import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "./firebase-config";

declare const __initial_auth_token: string;

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

if (typeof window !== 'undefined' && typeof __initial_auth_token !== 'undefined') {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      signInWithCustomToken(auth, __initial_auth_token).catch((error) => {
        console.error("Error signing in with custom token:", error);
      });
    }
  });
}

export { app, auth, db };
