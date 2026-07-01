import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, todoCollection, isFirebaseAvailable } from '../lib/firebase';
import { uuid } from '../lib/date';

/**
 * 기존 todo 컬렉션 스키마 유지:
 * { id, day, text, del, seq, owner }
 * 사용자의 모든 TODO를 한 번 로드해 메모리에서 파생 계산한다.
 */
export function useTodos(privateKey) {
  const [allTodos, setAllTodos] = useState([]);

  // 최초 1회 전체 로드
  useEffect(() => {
    if (!isFirebaseAvailable || !privateKey) return;
    let alive = true;
    (async () => {
      const snap = await getDocs(query(todoCollection(), where('owner', '==', privateKey)));
      if (!alive) return;
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllTodos(list);
    })();
    return () => {
      alive = false;
    };
  }, [privateKey]);

  // 날짜별 완료 상태 맵 (달력 점 표시용): day -> 'finish' | 'todo'
  const checkMap = useMemo(() => {
    const byDay = {};
    for (const t of allTodos) {
      if (!t.day) continue;
      (byDay[t.day] ||= []).push(t);
    }
    const map = {};
    for (const [day, list] of Object.entries(byDay)) {
      map[day] = list.every((t) => t.del) ? 'finish' : 'todo';
    }
    return map;
  }, [allTodos]);

  // 특정 날짜의 todo/finish 목록 (seq 정렬)
  const getDayLists = useCallback(
    (day) => {
      const todos = allTodos
        .filter((t) => t.day === day && !t.del)
        .sort((a, b) => (a.seq || 0) - (b.seq || 0));
      const finishes = allTodos
        .filter((t) => t.day === day && t.del)
        .sort((a, b) => (a.seq || 0) - (b.seq || 0));
      return { todos, finishes };
    },
    [allTodos]
  );

  const maxSeq = useCallback(
    (day, del) =>
      allTodos
        .filter((t) => t.day === day && Boolean(t.del) === del)
        .reduce((m, t) => Math.max(m, t.seq || 0), 0),
    [allTodos]
  );

  const addTodo = useCallback(
    (day, text) => {
      if (!text.trim()) return;
      const id = uuid();
      const data = { id, day, text, del: false, seq: maxSeq(day, false) + 1, owner: privateKey };
      setAllTodos((prev) => [...prev, data]);
      if (isFirebaseAvailable) setDoc(doc(db, 'todo', id), data);
    },
    [privateKey, maxSeq]
  );

  const finishTodo = useCallback(
    (id) => {
      setAllTodos((prev) => {
        const target = prev.find((t) => t.id === id);
        if (!target) return prev;
        const seq = maxSeq(target.day, true) + 1;
        if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { del: true, seq });
        return prev.map((t) => (t.id === id ? { ...t, del: true, seq } : t));
      });
    },
    [maxSeq]
  );

  const deleteTodo = useCallback((id) => {
    setAllTodos((prev) => prev.filter((t) => t.id !== id));
    if (isFirebaseAvailable) deleteDoc(doc(db, 'todo', id));
  }, []);

  const updateText = useCallback((id, text) => {
    setAllTodos((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
    if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { text });
  }, []);

  // 드래그 정렬: 같은 그룹 내 seq 재부여
  const reorder = useCallback((orderedIds) => {
    setAllTodos((prev) => {
      const seqById = new Map(orderedIds.map((id, i) => [id, i + 1]));
      orderedIds.forEach((id, i) => {
        if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { seq: i + 1 });
      });
      return prev.map((t) => (seqById.has(t.id) ? { ...t, seq: seqById.get(t.id) } : t));
    });
  }, []);

  return { checkMap, getDayLists, addTodo, finishTodo, deleteTodo, updateText, reorder };
}
