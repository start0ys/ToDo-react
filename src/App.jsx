import { useEffect, useMemo, useState, useCallback } from 'react';
import Clock from './components/Clock.jsx';
import CalendarPanel from './components/CalendarPanel.jsx';
import TodoPanel from './components/TodoPanel.jsx';
import EventModal from './components/EventModal.jsx';
import { getPrivateKey, setPrivateKey } from './lib/privateKey.js';
import { useTodos } from './hooks/useTodos.js';
import { useSchedules } from './hooks/useSchedules.js';
import { toDayKey, uuid } from './lib/date.js';
import { textColor } from './lib/color.js';
import { scheduleNotification, getPermissionState, requestPermission } from './lib/notification.js';

const mode = new URLSearchParams(location.search).get('mode') || '';

function useTheme() {
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem('todoTheme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('todoTheme', theme);
  }, [theme]);
  return [theme, setTheme];
}

export default function App() {
  const [privateKey, setKey] = useState(() => getPrivateKey());
  const [theme, setTheme] = useTheme();
  const [selectedDay, setSelectedDay] = useState(() => toDayKey(new Date()));
  const [navigateTo, setNavigateTo] = useState(null);
  const [notifPerm, setNotifPerm] = useState(() => getPermissionState());

  const handleNotifClick = useCallback(async () => {
    const state = getPermissionState();
    if (state === 'unsupported') {
      alert('이 브라우저는 알림을 지원하지 않습니다.');
    } else if (state === 'denied') {
      alert('알림이 차단되어 있습니다.\n브라우저 주소창 왼쪽 🔒 아이콘 → 알림 → 허용으로 변경 후 새로고침해주세요.');
    } else if (state === 'granted') {
      alert('알림이 허용되어 있습니다. ✅');
    } else {
      const granted = await requestPermission();
      setNotifPerm(granted ? 'granted' : 'denied');
    }
  }, []);

  const todos = useTodos(privateKey);
  const { schedules, saveAll } = useSchedules(privateKey);

  useEffect(() => {
    window.AndroidApp?.savePrivateKey?.(privateKey);
  }, [privateKey]);

  // 할 일 알림 스케줄링 (권한이 있을 때만 동작)
  useEffect(() => {
    if (!todos.allTodos?.length || getPermissionState() !== 'granted') return;
    const today = toDayKey(new Date());
    const now = Date.now();
    const timers = [];

    todos.allTodos.forEach((todo) => {
      if (!todo.reminder || todo.del || todo.day !== today) return;
      const [h, m] = todo.reminder.split(':');
      const fireDate = new Date();
      fireDate.setHours(Number(h), Number(m), 0, 0);
      const delay = fireDate.getTime() - now;
      if (delay > 0) {
        timers.push(
          scheduleNotification(
            '📌 할 일 알림',
            todo.text.replace(/#[^\s#]+/g, '').trim(),
            delay
          )
        );
      }
    });

    return () => timers.forEach(clearTimeout);
  }, [todos.allTodos]);

  // 캘린더 일정 알림 스케줄링 — reminder는 "HH:MM" 절대시각 (7일 이내만)
  useEffect(() => {
    if (!schedules.length || getPermissionState() !== 'granted') return;
    const now = Date.now();
    const timers = [];

    schedules.forEach((event) => {
      if (!event.reminder || typeof event.reminder !== 'string') return;
      const eventStart = new Date(event.start);
      if (isNaN(eventStart.getTime())) return;
      const [h, m] = event.reminder.split(':');
      // 이벤트 시작일 당일 HH:MM 에 알림
      const fireDate = new Date(
        eventStart.getFullYear(),
        eventStart.getMonth(),
        eventStart.getDate(),
        Number(h),
        Number(m),
        0, 0
      );
      const delay = fireDate.getTime() - now;
      if (delay > 0 && delay < 7 * 24 * 60 * 60 * 1000) {
        timers.push(scheduleNotification(`📅 일정 알림`, event.title, delay));
      }
    });

    return () => timers.forEach(clearTimeout);
  }, [schedules]);

  // 'N' 키로 입력창 포커스
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'n' || e.key === 'N') {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        window.__focusTodoInput?.();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);

  const isViewMode = mode === '01';

  const handleSelectDate = (dayKey, selection) => {
    setSelectedDay(dayKey);
    setPendingSelection(selection || null);
    if (window.innerWidth <= 900) {
      document.getElementById('todo-panel')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleGoToday = () => {
    const today = toDayKey(new Date());
    setSelectedDay(today);
    setNavigateTo(today);
  };

  const openAddModal = () => {
    if (!pendingSelection) return;
    setEditingEvent(null);
    setModalOpen(true);
  };

  const handleEventClick = (event) => {
    if (event.classNames?.includes('holiday')) return;
    setEditingEvent(event);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEvent(null);
  };

  const handleSaveEvent = (title, color, reminder) => {
    if (!title) return;
    const base = editingEvent || pendingSelection;
    if (!base) return;
    const oldId = editingEvent?.id;
    const newEvent = {
      id: uuid(),
      title,
      start: base.startStr ?? base.start,
      end: base.endStr ?? base.end,
      allDay: base.allDay,
      color,
      textColor: textColor(color),
      ...(reminder != null && { reminder }),
    };
    saveAll((prev) => [...prev.filter((s) => s.id !== oldId), newEvent]);
    closeModal();
  };

  const handleDeleteEvent = () => {
    if (!editingEvent) return;
    if (!confirm(`${editingEvent.title} 을 제거 하시겠습니까?`)) return;
    saveAll((prev) => prev.filter((s) => s.id !== editingEvent.id));
    closeModal();
  };

  const handleEventDrop = (event, revert) => {
    if (!confirm(`${event.title} 을 이동하시겠습니까?`)) {
      revert();
      return;
    }
    saveAll((prev) =>
      prev.map((s) =>
        s.id === event.id ? { ...s, start: event.startStr, end: event.endStr, allDay: event.allDay } : s
      )
    );
  };

  const changeKey = () => {
    const next = prompt(`현재 privateKey는 ${privateKey} 입니다.\n변경을 원하시면 privateKey를 입력해주세요.`);
    if (next) {
      setPrivateKey(next);
      location.reload();
    }
  };

  const modalInitial = useMemo(
    () => ({
      title: editingEvent?.title || '',
      color: editingEvent?.backgroundColor || '#3788d8',
      reminder: editingEvent?.extendedProps?.reminder ?? null,
    }),
    [editingEvent]
  );

  return (
    <div className="app">
      <div className="topbar">
        {!isViewMode && (
          <button className="key-btn" onClick={changeKey} title="Private Key 변경">
            🔑
          </button>
        )}
        {!isViewMode && (
          <button
            className={`notif-btn notif-${notifPerm}`}
            onClick={handleNotifClick}
            title={
              notifPerm === 'granted' ? '알림 허용됨' :
              notifPerm === 'denied'  ? '알림 차단됨 — 클릭하여 안내 보기' :
              '알림 권한 요청'
            }
          >
            {notifPerm === 'granted' ? '🔔' : '🔕'}
          </button>
        )}
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="테마 전환"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      <Clock onGoToday={handleGoToday} />

      <div className={`layout${isViewMode ? ' view-mode' : ''}`}>
        <CalendarPanel
          schedules={schedules}
          checkMap={todos.checkMap}
          viewMode={isViewMode}
          selectedDay={selectedDay}
          navigateTo={navigateTo}
          onNavigated={() => setNavigateTo(null)}
          onSelectDate={handleSelectDate}
          onEventClick={handleEventClick}
          onAdd={openAddModal}
          onEventDrop={handleEventDrop}
          getDayLists={todos.getDayLists}
        />

        {!isViewMode && (
          <TodoPanel
            selectedDay={selectedDay}
            todos={todos}
            onSelectDay={(day) => { setSelectedDay(day); setNavigateTo(day); }}
          />
        )}
      </div>

      {modalOpen && (
        <EventModal
          initial={modalInitial}
          isEdit={Boolean(editingEvent)}
          onConfirm={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
