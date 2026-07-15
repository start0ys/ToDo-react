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
import { initOneSignal, schedulePush, cancelPush, reminderToDate } from './lib/onesignal.js';

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

  // OneSignal 초기화 + privateKey를 external_id로 등록 (멀티기기 알림 묶기).
  // 예약 발송은 setReminder/일정 저장 시점에 서버(OneSignal)로 등록되므로
  // 여기서 setTimeout 스케줄링은 하지 않는다.
  useEffect(() => {
    if (privateKey) initOneSignal(privateKey);
  }, [privateKey]);

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

  const handleSaveEvent = async (title, color, reminder) => {
    if (!title) return;
    const base = editingEvent || pendingSelection;
    if (!base) return;
    const oldId = editingEvent?.id;

    // 수정 시 기존 예약 취소
    const oldPushId = editingEvent?.extendedProps?.pushId;
    if (oldPushId) cancelPush(oldPushId);

    const startStr = base.startStr ?? base.start;
    // 일정 시작일 당일 reminder("HH:MM")에 알림 예약
    let pushId = null;
    if (reminder) {
      const fireAt = reminderToDate(toDayKey(new Date(startStr)), reminder);
      pushId = await schedulePush('📅 일정 알림', title, fireAt, privateKey);
    }

    const newEvent = {
      id: uuid(),
      title,
      start: startStr,
      end: base.endStr ?? base.end,
      allDay: base.allDay,
      color,
      textColor: textColor(color),
      ...(reminder != null && { reminder }),
      ...(pushId && { pushId }),
    };
    saveAll((prev) => [...prev.filter((s) => s.id !== oldId), newEvent]);
    closeModal();
  };

  const handleDeleteEvent = () => {
    if (!editingEvent) return;
    if (!confirm(`${editingEvent.title} 을 제거 하시겠습니까?`)) return;
    if (editingEvent.extendedProps?.pushId) cancelPush(editingEvent.extendedProps.pushId);
    saveAll((prev) => prev.filter((s) => s.id !== editingEvent.id));
    closeModal();
  };

  const handleEventDrop = async (event, revert) => {
    if (!confirm(`${event.title} 을 이동하시겠습니까?`)) {
      revert();
      return;
    }
    // 날짜가 바뀌면 알림 시각도 달라지므로 예약을 다시 등록
    const reminder = event.extendedProps?.reminder;
    let pushId = event.extendedProps?.pushId ?? null;
    if (reminder) {
      if (pushId) cancelPush(pushId);
      const fireAt = reminderToDate(toDayKey(new Date(event.startStr)), reminder);
      pushId = await schedulePush('📅 일정 알림', event.title, fireAt, privateKey);
    }
    saveAll((prev) =>
      prev.map((s) =>
        s.id === event.id
          ? { ...s, start: event.startStr, end: event.endStr, allDay: event.allDay, pushId }
          : s
      )
    );
  };

  const changeKey = () => {
    const next = prompt(`PrivateKey는 일정 및 Todo 데이터를 구분하는 고유 키입니다.
동일한 PrivateKey를 사용하는 기기에서는 같은 일정과 Todo를 조회하고 저장할 수 있습니다.

현재 PrivateKey: ${privateKey}

다른 기기와 데이터를 동기화하려면 동일한 PrivateKey를 입력하세요.
변경하지 않으려면 [취소]를 눌러주세요.`);
    console.log(privateKey);
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
