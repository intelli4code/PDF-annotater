import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

declare const __firebase_config: any;
declare const __initial_auth_token: string;

const firebaseConfig = typeof window !== 'undefined' && typeof __firebase_config !== 'undefined' 
  ? __firebase_config 
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

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
