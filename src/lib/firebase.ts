import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "./firebase-config";

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

const signIn = async () => {
  try {
    await signInAnonymously(auth);
  } catch (error) {
    console.error("Error signing in anonymously:", error);
  }
};

export { app, auth, db, signIn };
