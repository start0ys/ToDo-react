import { initializeApp } from 'firebase/app';
import { getFirestore, collection } from 'firebase/firestore';

// 기존 keys.js(FIREBASE_CONFIG)를 Vite 환경변수로 대체.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// 키가 비어 있으면 Firebase 미사용 모드(로컬 전용)로 동작.
export const isFirebaseAvailable = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const googleApiKey = import.meta.env.VITE_GOOGLE_API_KEY || '';

let db = null;
if (isFirebaseAvailable) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

export { db };

// 기존 스키마 유지: 컬렉션 이름 'todo', 'calendar'
export const todoCollection = () => (db ? collection(db, 'todo') : null);
export const calendarCollection = () => (db ? collection(db, 'calendar') : null);
