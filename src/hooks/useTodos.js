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
import { uuid, toDayKey, addDays } from '../lib/date';

export function useTodos(privateKey) {
  const [allTodos, setAllTodos] = useState([]);

  useEffect(() => {
    if (!isFirebaseAvailable || !privateKey) return;
    let alive = true;
    (async () => {
      const snap = await getDocs(query(todoCollection(), where('owner', '==', privateKey)));
      if (!alive) return;
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllTodos(list);
    })();
    return () => { alive = false; };
  }, [privateKey]);

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

  const getDayLists = useCallback(
    (day) => {
      const todos = allTodos
        .filter((t) => t.day === day && !t.del)
        .sort((a, b) => {
          const pd = (b.priority || 0) - (a.priority || 0);
          return pd !== 0 ? pd : (a.seq || 0) - (b.seq || 0);
        });
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

  /**
   * repeat: 'daily' | 'weekly' | 'monthly'
   * repeatParam:
   *   daily   → null  (오늘부터 30일)
   *   weekly  → 요일 숫자 0=일 1=월 … 6=토 (12주)
   *   monthly → 일 숫자 1-31 (12개월)
   */
  const addRecurringTodo = useCallback(
    (day, text, repeat, repeatParam) => {
      if (!text.trim()) return;
      const startDate = new Date(day + 'T00:00');
      const newItems = [];

      const makeItem = (targetDay) => {
        const id = uuid();
        return { id, day: targetDay, text, del: false, seq: maxSeq(targetDay, false) + 1, owner: privateKey };
      };

      if (repeat === 'daily') {
        for (let i = 0; i < 30; i++) {
          newItems.push(makeItem(toDayKey(addDays(startDate, i))));
        }
      } else if (repeat === 'weekly') {
        const targetDow = repeatParam ?? 1;
        const startDow = startDate.getDay();
        const daysUntil = (targetDow - startDow + 7) % 7;
        const first = addDays(startDate, daysUntil);
        for (let i = 0; i < 12; i++) {
          newItems.push(makeItem(toDayKey(addDays(first, i * 7))));
        }
      } else if (repeat === 'monthly') {
        const targetDate = repeatParam ?? 1;
        const y = startDate.getFullYear();
        const m = startDate.getMonth();
        for (let i = 0; i < 12; i++) {
          const d = new Date(y, m + i, targetDate);
          if (d.getDate() !== targetDate) continue; // 해당 월에 없는 날짜 (예: 2월 31일)
          newItems.push(makeItem(toDayKey(d)));
        }
      }

      newItems.forEach((item) => {
        if (isFirebaseAvailable) setDoc(doc(db, 'todo', item.id), item);
      });
      setAllTodos((prev) => [...prev, ...newItems]);
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

  const restoreTodo = useCallback(
    (id) => {
      setAllTodos((prev) => {
        const target = prev.find((t) => t.id === id);
        if (!target) return prev;
        const seq = maxSeq(target.day, false) + 1;
        if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { del: false, seq });
        return prev.map((t) => (t.id === id ? { ...t, del: false, seq } : t));
      });
    },
    [maxSeq]
  );

  const updateText = useCallback((id, text) => {
    setAllTodos((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
    if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { text });
  }, []);

  const reorder = useCallback((orderedIds) => {
    setAllTodos((prev) => {
      const seqById = new Map(orderedIds.map((id, i) => [id, i + 1]));
      orderedIds.forEach((id, i) => {
        if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { seq: i + 1 });
      });
      return prev.map((t) => (seqById.has(t.id) ? { ...t, seq: seqById.get(t.id) } : t));
    });
  }, []);

  const setPriority = useCallback((id, priority) => {
    setAllTodos((prev) => prev.map((t) => (t.id === id ? { ...t, priority } : t)));
    if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { priority });
  }, []);

  const moveToDay = useCallback((id, newDay) => {
    setAllTodos((prev) => prev.map((t) => (t.id === id ? { ...t, day: newDay } : t)));
    if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { day: newDay });
  }, []);

  const setReminder = useCallback((id, time) => {
    const value = time || null;
    setAllTodos((prev) => prev.map((t) => (t.id === id ? { ...t, reminder: value } : t)));
    if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { reminder: value });
  }, []);

  return {
    allTodos,
    checkMap,
    getDayLists,
    addTodo,
    addRecurringTodo,
    finishTodo,
    deleteTodo,
    restoreTodo,
    updateText,
    reorder,
    setPriority,
    moveToDay,
    setReminder,
  };
}
