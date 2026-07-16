import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

const flagKey = (uid) => `migrated:${uid}`;

/**
 * 기존 privateKey 기반 데이터를 로그인 계정(uid)으로 1회 이전한다.
 *  - calendar/{pk}  → calendar/{uid}  (대상이 없을 때만 복사)
 *  - todo(owner:pk) → todo(owner:uid) (문서 ID=uuid 유지, owner 필드만 갱신, 배치)
 *  - meta/{pk}      → meta/{uid}      (대상이 없을 때만 복사)
 * 원본은 지우지 않는다(롤백 안전). uid당 최초 1회만 실행되며, 부분 실패 시
 * 플래그를 남기지 않아 다음 로그인 때 자동 재시도한다(모든 단계가 멱등).
 */
export async function migratePrivateKeyToUid(privateKey, uid) {
  if (!db || !privateKey || !uid || privateKey === uid) return;
  if (localStorage.getItem(flagKey(uid))) return;

  try {
    // 1) calendar 단일 문서 복사
    const srcCal = await getDoc(doc(db, 'calendar', privateKey));
    if (srcCal.exists()) {
      const dstCal = await getDoc(doc(db, 'calendar', uid));
      if (!dstCal.exists()) {
        await setDoc(doc(db, 'calendar', uid), { ...srcCal.data(), owner: uid });
      }
    }

    // 2) todo owner 갱신 (Firestore 배치는 500건 제한 → 청크 분할)
    const snap = await getDocs(query(collection(db, 'todo'), where('owner', '==', privateKey)));
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db);
      docs.slice(i, i + 450).forEach((d) => batch.update(d.ref, { owner: uid }));
      await batch.commit();
    }

    // 3) meta 문서 복사
    const srcMeta = await getDoc(doc(db, 'meta', privateKey));
    if (srcMeta.exists()) {
      const dstMeta = await getDoc(doc(db, 'meta', uid));
      if (!dstMeta.exists()) await setDoc(doc(db, 'meta', uid), srcMeta.data());
    }

    localStorage.setItem(flagKey(uid), '1');
  } catch (e) {
    console.error('[migrate] 데이터 이전 실패(다음 로그인 때 재시도):', e);
  }
}
