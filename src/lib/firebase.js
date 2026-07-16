import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, setPersistence, indexedDBLocalPersistence } from 'firebase/auth';

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

let app = null;
let db = null;
let auth = null;
if (isFirebaseAvailable) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  // 로그인 세션을 브라우저(indexedDB)에 지속 저장 → 재실행/탭 종료에도 유지
  // (명시적 로그아웃 전까지). 실패해도 앱이 깨지지 않도록 catch.
  setPersistence(auth, indexedDBLocalPersistence).catch(() => {});
}

export { app, db, auth };

// Google 로그인 공급자 (스코프 추가는 캘린더 연동 도입 시)
export const googleProvider = new GoogleAuthProvider();

// 기존 스키마 유지: 컬렉션 이름 'todo', 'calendar'. 문서 키는 로그인 uid 기준.
export const todoCollection = () => (db ? collection(db, 'todo') : null);
export const calendarCollection = () => (db ? collection(db, 'calendar') : null);
export const metaDoc = (uid) => (db ? doc(db, 'meta', uid) : null);
