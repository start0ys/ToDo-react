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
import { scheduleNotification, getPermissionState } from './lib/notification.js';

const mode = new URLSearchParams(location.search).get('mode') || '';

// 위젯 모드에서 배경을 카드와 동일하게 하여 flat하게 표시
if (mode === '01' || mode === '02') {
  document.documentElement.classList.add('widget-page');
}

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
  const [showRepeatModal, setShowRepeatModal] = useState(false);

  const viewMode = mode === '01' ? 'calendar' : mode === '02' ? 'todo' : null;
  const isCalendarWidget = viewMode === 'calendar';
  const isTodoWidget = viewMode === 'todo';
  const isWidget = viewMode !== null;

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
    if (window.innerWidth <= 900) {
      document.getElementById('todo-panel')?.scrollIntoView({ behavior: 'smooth' });
    }
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
    <div className={`app${isWidget ? ' widget-mode' : ''}`}>
      {/* 좌상단: 반복 할일 관리 */}
      {!isWidget && (
        <div className="topbar-left">
          <button
            className={`repeat-mgr-btn${todos.recurringGroups.length > 0 ? ' has-groups' : ''}`}
            onClick={() => setShowRepeatModal(true)}
            title="반복 할일 관리"
          >
            🔁
          </button>
        </div>
      )}

      {/* 우상단: 키 · 테마 */}
      {!isWidget && (
        <div className="topbar">
          <button className="key-btn" onClick={changeKey} title="Private Key 변경">
            🔑
          </button>
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="테마 전환"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      )}

      {!isWidget && <Clock onGoToday={handleGoToday} />}

      <div className={`layout${isCalendarWidget ? ' view-mode widget-calendar' : isTodoWidget ? ' view-mode widget-todo' : ''}`}>
        {!isTodoWidget && (
          <CalendarPanel
            schedules={schedules}
            checkMap={todos.checkMap}
            viewMode={isCalendarWidget}
            selectedDay={selectedDay}
            navigateTo={navigateTo}
            onNavigated={() => setNavigateTo(null)}
            onSelectDate={handleSelectDate}
            onEventClick={handleEventClick}
            onAdd={openAddModal}
            onGoToday={handleGoToday}
            onEventDrop={handleEventDrop}
            getDayLists={todos.getDayLists}
          />
        )}

        {!isCalendarWidget && (
          <TodoPanel
            selectedDay={selectedDay}
            todos={todos}
            onSelectDay={isTodoWidget ? undefined : (day) => { setSelectedDay(day); setNavigateTo(day); }}
            viewMode={isTodoWidget}
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

      {showRepeatModal && (
        <div className="modal-overlay" onClick={() => setShowRepeatModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowRepeatModal(false)}>✕</button>
            <h3 className="modal-title">🔁 반복 할일 관리</h3>
            <div className="repeat-modal-list">
              {todos.recurringGroups.length === 0 ? (
                <p className="repeat-modal-empty">반복 설정된 할 일이 없습니다.</p>
              ) : (
                todos.recurringGroups.map((g) => {
                  const label = g.text.replace(/#[^\s#]+/g, '').trim() || g.text;
                  return (
                    <div key={g.repeatId} className="repeat-modal-item">
                      <div className="repeat-modal-item-info">
                        <span className="repeat-modal-item-text">{label}</span>
                        <span className="repeat-modal-item-meta">
                          {g.count}개 · {g.days[0]} ~ {g.days[g.days.length - 1]}
                        </span>
                      </div>
                      <button
                        className="repeat-modal-del-btn"
                        onClick={() => {
                          if (confirm(`"${label}" 반복 할 일 전체(${g.count}개)를 삭제하시겠습니까?`)) {
                            todos.deleteRecurring(g.repeatId);
                          }
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
