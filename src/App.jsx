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

  const todos = useTodos(privateKey);
  const { schedules, saveAll } = useSchedules(privateKey);

  // 안드로이드 WebView 브리지: privateKey 를 네이티브에 저장(위젯 공유). 일반 브라우저에선 무시.
  useEffect(() => {
    window.AndroidApp?.savePrivateKey?.(privateKey);
  }, [privateKey]);

  // 모달 상태: pendingSelection(새 일정 범위) / editingEvent(기존 일정 수정)
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);

  const isViewMode = mode === '01';

  const handleSelectDate = (dayKey, selection) => {
    setSelectedDay(dayKey);
    setPendingSelection(selection || null);
    // 모바일: TODO 영역으로 스크롤 (기존 동작 보존)
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

  // 일정 저장 (생성/수정 공통): 기존 id 제거 후 새로 추가하는 기존 로직 유지
  const handleSaveEvent = (title, color) => {
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
    const next = prompt(
      `현재 privateKey는 ${privateKey} 입니다.\n변경을 원하시면 privateKey를 입력해주세요.`
    );
    if (next) {
      setPrivateKey(next);
      location.reload();
    }
  };

  const modalInitial = useMemo(
    () => ({
      title: editingEvent?.title || '',
      color: editingEvent?.backgroundColor || '#3788d8',
    }),
    [editingEvent]
  );

  return (
    <div className="app">
      <div className="topbar">
        <span />
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="테마 전환"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      <Clock />

      <div className={`layout${isViewMode ? ' view-mode' : ''}`}>
        <CalendarPanel
          schedules={schedules}
          checkMap={todos.checkMap}
          viewMode={isViewMode}
          onSelectDate={handleSelectDate}
          onEventClick={handleEventClick}
          onAdd={openAddModal}
          onChangeKey={changeKey}
          onEventDrop={handleEventDrop}
        />

        {!isViewMode && (
          <TodoPanel selectedDay={selectedDay} todos={todos} />
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
