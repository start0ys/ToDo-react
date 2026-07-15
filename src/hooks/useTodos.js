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
import { schedulePush, cancelPush, reminderToDate } from '../lib/onesignal';

// 할일 텍스트에서 태그(#foo)를 제거한 알림 본문
const reminderBody = (text) => (text || '').replace(/#[^\s#]+/g, '').trim();

export function useTodos(privateKey) {
  const [allTodos, setAllTodos] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isFirebaseAvailable || !privateKey) {
      setLoaded(true);
      return;
    }
    let alive = true;
    (async () => {
      const snap = await getDocs(query(todoCollection(), where('owner', '==', privateKey)));
      if (!alive) return;
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllTodos(list);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [privateKey]);

  // 자동 이관: 전날 carryOver=true이고 미완료(del=false)인 항목만 오늘로 복사
  // 전날 기준: 완료된 항목이나 그 이전 날짜 항목은 이관 대상에서 제외
  useEffect(() => {
    if (!loaded) return;

    const today = toDayKey(new Date());
    const yesterday = toDayKey(addDays(new Date(), -1));

    // 오늘 이미 있는 활성 항목의 텍스트 집합 (동일 텍스트 중복 이관 방지)
    const todayActiveTexts = new Set(
      allTodos.filter((t) => t.day === today && !t.del).map((t) => t.text)
    );

    // 전날 항목 중 carryOver=true이고 미완료인 것만 수집 (같은 텍스트 중복 제거)
    const seenTexts = new Set();
    const toCarry = allTodos.filter((t) => {
      if (!t.carryOver || t.del || t.day !== yesterday) return false;
      if (todayActiveTexts.has(t.text) || seenTexts.has(t.text)) return false;
      seenTexts.add(t.text);
      return true;
    });

    if (toCarry.length === 0) return;

    const todayMaxSeq = allTodos
      .filter((t) => t.day === today && !t.del)
      .reduce((m, t) => Math.max(m, t.seq || 0), 0);
    let seq = todayMaxSeq;
    const copies = toCarry.map((t) => {
      const id = uuid();
      const copy = { id, day: today, text: t.text, del: false, seq: ++seq, owner: t.owner, carryOver: true };
      if (t.priority) copy.priority = t.priority;
      return copy;
    });
    setAllTodos((prev) => [...prev, ...copies]);
    if (isFirebaseAvailable) {
      copies.forEach((copy) => setDoc(doc(db, 'todo', copy.id), copy));
    }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const recurringGroups = useMemo(() => {
    const groups = {};
    for (const t of allTodos) {
      if (!t.repeatId) continue;
      if (!groups[t.repeatId]) {
        groups[t.repeatId] = { repeatId: t.repeatId, text: t.text, days: [] };
      }
      groups[t.repeatId].days.push(t.day);
    }
    return Object.values(groups).map((g) => ({
      ...g,
      days: g.days.sort(),
      count: g.days.length,
    }));
  }, [allTodos]);

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

      const repeatId = uuid();
      const makeItem = (targetDay) => {
        const id = uuid();
        return { id, day: targetDay, text, del: false, seq: maxSeq(targetDay, false) + 1, owner: privateKey, repeatId };
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
        // 완료된 할일은 알림 불필요 → 예약 취소
        if (target.pushId) cancelPush(target.pushId);
        const patch = { del: true, seq, ...(target.pushId && { pushId: null }) };
        if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), patch);
        return prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      });
    },
    [maxSeq]
  );

  const deleteTodo = useCallback((id) => {
    setAllTodos((prev) => {
      const target = prev.find((t) => t.id === id);
      if (target?.pushId) cancelPush(target.pushId);
      return prev.filter((t) => t.id !== id);
    });
    if (isFirebaseAvailable) deleteDoc(doc(db, 'todo', id));
  }, []);

  const deleteRecurring = useCallback((repeatId) => {
    setAllTodos((prev) => {
      const toDelete = prev.filter((t) => t.repeatId === repeatId);
      const deleteIds = new Set(toDelete.map((t) => t.id));
      toDelete.forEach((t) => {
        if (t.pushId) cancelPush(t.pushId);
        if (isFirebaseAvailable) deleteDoc(doc(db, 'todo', t.id));
      });
      return prev.filter((t) => !deleteIds.has(t.id));
    });
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

  // 기존 예약 취소 후, reminder/day 기준으로 예약 푸시 재등록.
  // 반환된 pushId를 상태·Firestore에 저장해 멀티기기 중복 예약을 방지한다.
  const syncReminderPush = useCallback(
    async (todo, nextReminder, nextDay) => {
      if (todo?.pushId) cancelPush(todo.pushId);
      const fireAt = reminderToDate(nextDay ?? todo?.day, nextReminder);
      const pushId = fireAt
        ? await schedulePush('📌 할 일 알림', reminderBody(todo?.text), fireAt, privateKey)
        : null;

      setAllTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, pushId } : t)));
      if (isFirebaseAvailable) updateDoc(doc(db, 'todo', todo.id), { pushId });
    },
    [privateKey]
  );

  const moveToDay = useCallback(
    (id, newDay) => {
      const target = allTodos.find((t) => t.id === id);
      setAllTodos((prev) => prev.map((t) => (t.id === id ? { ...t, day: newDay } : t)));
      if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { day: newDay });
      // 날짜가 바뀌면 알림 발송 시각도 달라지므로 예약을 다시 등록
      if (target?.reminder) syncReminderPush(target, target.reminder, newDay);
    },
    [allTodos, syncReminderPush]
  );

  const setReminder = useCallback(
    (id, time) => {
      const value = time || null;
      const target = allTodos.find((t) => t.id === id);
      setAllTodos((prev) => prev.map((t) => (t.id === id ? { ...t, reminder: value } : t)));
      if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { reminder: value });
      if (target) syncReminderPush(target, value, target.day);
    },
    [allTodos, syncReminderPush]
  );

  const setCarryOver = useCallback((id, value) => {
    const flag = value || null;
    setAllTodos((prev) => prev.map((t) => (t.id === id ? { ...t, carryOver: flag } : t)));
    if (isFirebaseAvailable) updateDoc(doc(db, 'todo', id), { carryOver: flag });
  }, []);

  return {
    allTodos,
    recurringGroups,
    checkMap,
    getDayLists,
    addTodo,
    addRecurringTodo,
    finishTodo,
    deleteTodo,
    deleteRecurring,
    restoreTodo,
    updateText,
    reorder,
    setPriority,
    moveToDay,
    setReminder,
    setCarryOver,
  };
}
