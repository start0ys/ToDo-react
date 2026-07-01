import { useEffect, useMemo, useState } from 'react';
import Clock from './components/Clock.jsx';
import CalendarPanel from './components/CalendarPanel.jsx';
import TodoPanel from './components/TodoPanel.jsx';
import EventModal from './components/EventModal.jsx';
import { getPrivateKey, setPrivateKey } from './lib/privateKey.js';
import { useTodos } from './hooks/useTodos.js';
import { useSchedules } from './hooks/useSchedules.js';
import { toDayKey, uuid } from './lib/date.js';
import { textColor } from './lib/color.js';

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

  const todos = useTodos(privateKey);
  const { schedules, saveAll } = useSchedules(privateKey);

  useEffect(() => {
    window.AndroidApp?.savePrivateKey?.(privateKey);
  }, [privateKey]);

  // 브라우저 알림 권한 요청 및 스케줄링
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!todos.allTodos?.length) return;
    const today = toDayKey(new Date());
    const now = new Date();
    const timers = [];

    todos.allTodos.forEach((todo) => {
      if (!todo.reminder || todo.del || todo.day !== today) return;
      const [h, m] = todo.reminder.split(':');
      const reminderDate = new Date();
      reminderDate.setHours(Number(h), Number(m), 0, 0);
      const ms = reminderDate - now;
      if (ms > 0) {
        timers.push(
          setTimeout(() => {
            if (Notification.permission === 'granted') {
              new Notification('📌 할 일 알림', {
                body: todo.text.replace(/#[^\s#]+/g, '').trim(),
                icon: '/favicon.ico',
              });
            }
          }, ms)
        );
      }
    });

    return () => timers.forEach(clearTimeout);
  }, [todos.allTodos]);

  // 캘린더 일정 알림 스케줄링
  useEffect(() => {
    if (!schedules.length) return;
    const timers = [];
    const now = Date.now();

    schedules.forEach((event) => {
      if (!event.reminder) return;
      const startMs = new Date(event.start).getTime();
      if (isNaN(startMs)) return;
      const fireAt = startMs - event.reminder * 60 * 1000;
      const delay = fireAt - now;
      // 미래 7일 이내의 알림만 스케줄링
      if (delay > 0 && delay < 7 * 24 * 60 * 60 * 1000) {
        timers.push(
          setTimeout(() => {
            if (Notification.permission === 'granted') {
              const mins = event.reminder;
              const label =
                mins >= 1440 ? '1일' : mins >= 60 ? `${mins / 60}시간` : `${mins}분`;
              new Notification(`📅 ${label} 후 일정`, {
                body: event.title,
                icon: '/favicon.ico',
              });
            }
          }, delay)
        );
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
