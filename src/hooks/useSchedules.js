import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isFirebaseAvailable } from '../lib/firebase';

/**
 * 기존 calendar 컬렉션 스키마 유지:
 * 문서ID = privateKey, { schedules: JSON 문자열, owner }
 * 일정 전체를 한 문서에 JSON 으로 통째 저장한다.
 */
export function useSchedules(privateKey) {
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    if (!isFirebaseAvailable || !privateKey) return;
    let alive = true;
    (async () => {
      const snap = await getDoc(doc(db, 'calendar', privateKey));
      if (!alive) return;
      if (snap.exists()) {
        try {
          setSchedules(JSON.parse(snap.data().schedules || '[]'));
        } catch {
          setSchedules([]);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [privateKey]);

  const persist = useCallback(
    (next) => {
      if (!isFirebaseAvailable || !privateKey) return;
      setDoc(doc(db, 'calendar', privateKey), {
        schedules: JSON.stringify(next),
        owner: privateKey,
      });
    },
    [privateKey]
  );

  const saveAll = useCallback(
    (updater) => {
      setSchedules((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        persist(next);
        return next;
      });
    },
    [persist]
  );

  return { schedules, saveAll };
}
