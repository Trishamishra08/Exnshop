import { initializeApp, FirebaseApp } from "firebase/app";
import { getMessaging, getToken, onMessage, Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

const isFirebaseConfigured = Boolean(firebaseConfig.projectId && firebaseConfig.apiKey && firebaseConfig.appId);

let app: FirebaseApp | undefined;
let messaging: Messaging | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    try {
      messaging = getMessaging(app);
    } catch (error) {
      console.warn("Firebase Messaging not supported in this browser:", error);
    }
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
}

export { messaging, getToken, onMessage, isFirebaseConfigured };
export default app;
