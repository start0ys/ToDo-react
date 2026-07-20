import { useEffect, useMemo, useState } from 'react';
import Clock from './components/Clock.jsx';
import CalendarPanel from './components/CalendarPanel.jsx';
import TodoPanel from './components/TodoPanel.jsx';
import EventModal from './components/EventModal.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import { useAuth } from './hooks/useAuth.js';
import { migratePrivateKeyToUid } from './lib/migrate.js';
import { isFirebaseAvailable } from './lib/firebase.js';
import { useTodos } from './hooks/useTodos.js';
import { useSchedules } from './hooks/useSchedules.js';
import { toDayKey, uuid } from './lib/date.js';
import { textColor } from './lib/color.js';
import { initOneSignal, schedulePush, cancelPush, reminderToDate } from './lib/onesignal.js';
import { upsertGCalEvent, deleteGCalEvent, setGCalAccountHint, listGCalEvents, isGCalConfigured } from './lib/googleCalendar.js';

const mode = new URLSearchParams(location.search).get('mode') || '';

// 두 시각/날짜 문자열이 같은 시점을 가리키는지(형식 차이 무시). 양쪽 없으면 같다고 본다.
function sameInstant(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return !Number.isNaN(ta) && !Number.isNaN(tb) && ta === tb;
}

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
  const { user, ready, login, logout } = useAuth();
  const [bootReady, setBootReady] = useState(false);
  const uid = user?.uid ?? null;

  const [theme, setTheme] = useTheme();
  const [selectedDay, setSelectedDay] = useState(() => toDayKey(new Date()));
  const [navigateTo, setNavigateTo] = useState(null);

  // 로그인(uid) 확정 시: 기존 privateKey 데이터를 uid로 1회 이전한 뒤 데이터 로드.
  // 이전이 끝나기 전엔 dataKey=null 로 두어 hooks가 빈 상태를 먼저 읽지 않게 한다.
  useEffect(() => {
    if (!uid) { setBootReady(false); return; }
    let alive = true;
    (async () => {
      await migratePrivateKeyToUid(localStorage.getItem('todoPrivateKey'), uid);
      if (alive) setBootReady(true);
    })();
    return () => { alive = false; };
  }, [uid]);

  const dataKey = bootReady ? uid : null;
  const todos = useTodos(dataKey);
  const { schedules, saveAll } = useSchedules(dataKey);

  // 구글 캘린더에서 읽어온 일정(읽기 전용). 권한이 이미 있으면 팝업 없이 조회.
  const [googleEvents, setGoogleEvents] = useState([]);
  const [gcalRefresh, setGcalRefresh] = useState(0);
  useEffect(() => {
    if (!dataKey || !isGCalConfigured) { setGoogleEvents([]); return; }
    let alive = true;
    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 6, 1).toISOString();
    listGCalEvents(timeMin, timeMax).then((evs) => { if (alive) setGoogleEvents(evs); });
    return () => { alive = false; };
  }, [dataKey, gcalRefresh]);

  // 탭으로 돌아올 때 재조회 → 구글 캘린더에서 수정/추가한 내용을 앱에 반영(팝업 없이 무음).
  useEffect(() => {
    if (!dataKey || !isGCalConfigured) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') setGcalRefresh((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [dataKey]);

  // 내가 공유한 일정은 로컬(schedules)에도 있으므로 googleEventId로 중복 제거
  const googleOnlyEvents = useMemo(() => {
    const mine = new Set(schedules.map((s) => s.googleEventId).filter(Boolean));
    return googleEvents.filter((e) => !mine.has(e.extendedProps.googleEventId));
  }, [googleEvents, schedules]);

  // 역방향 동기화: 내가 공유한 일정을 구글에서 수정하면 그 값(제목/일시)을 로컬에 반영.
  // - 값이 실제로 다를 때만 저장하고, 저장 시 구글 값으로 맞추므로 다음 비교에서 수렴(무한루프 없음).
  // - 색상은 앱의 원래 색을 유지(구글 팔레트로 덮어써 흐려지는 것 방지).
  // - 창 밖으로 옮겨져 조회되지 않은 일정은 삭제로 오인하지 않도록 건드리지 않는다.
  useEffect(() => {
    if (!googleEvents.length) return;
    const byId = new Map(googleEvents.map((e) => [e.extendedProps.googleEventId, e]));
    let changed = false;
    const next = schedules.map((s) => {
      if (!s.googleEventId) return s;
      const g = byId.get(s.googleEventId);
      if (!g) return s;
      if (
        s.title === g.title &&
        Boolean(s.allDay) === Boolean(g.allDay) &&
        sameInstant(s.start, g.start) &&
        sameInstant(s.end, g.end)
      ) {
        return s;
      }
      changed = true;
      return { ...s, title: g.title, start: g.start, end: g.end, allDay: g.allDay };
    });
    if (changed) saveAll(next);
  }, [googleEvents, schedules, saveAll]);

  // OneSignal 초기화 + uid를 external_id로 등록 (멀티기기 알림 묶기).
  // 예약 발송은 setReminder/일정 저장 시점에 서버(OneSignal)로 등록되므로
  // 여기서 setTimeout 스케줄링은 하지 않는다.
  useEffect(() => {
    if (dataKey) initOneSignal(dataKey);
  }, [dataKey]);

  // 캘린더 권한 요청을 앱 로그인 계정으로 고정 (브라우저 기본 구글 계정과 다를 수 있음)
  useEffect(() => {
    setGCalAccountHint(user?.email || '');
  }, [user]);

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
    if (event.extendedProps?.fromGoogle) return; // 구글에서 온 읽기전용 일정은 편집 불가
    setEditingEvent(event);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEvent(null);
  };

  const handleSaveEvent = async (title, color, reminder, shared) => {
    if (!title) return;
    const base = editingEvent || pendingSelection;
    if (!base) return;
    const oldId = editingEvent?.id;

    // 수정 시 기존 예약 취소
    const oldPushId = editingEvent?.extendedProps?.pushId;
    if (oldPushId) cancelPush(oldPushId);

    const startStr = base.startStr ?? base.start;
    const endStr = base.endStr ?? base.end;
    // 일정 시작일 당일 reminder("HH:MM")에 알림 예약
    let pushId = null;
    if (reminder) {
      const fireAt = reminderToDate(toDayKey(new Date(startStr)), reminder);
      pushId = await schedulePush('📅 일정 알림', title, fireAt, dataKey);
    }

    // Google 캘린더 동기화: 공유 켜짐→upsert / 공유 해제인데 기존 연동 있음→삭제.
    // 실패해도 앱 저장은 진행한다(데이터 유실 방지).
    let googleEventId = editingEvent?.extendedProps?.googleEventId ?? null;
    if (shared) {
      try {
        googleEventId = await upsertGCalEvent({
          title, start: startStr, end: endStr, allDay: base.allDay, color, googleEventId,
        });
        setGcalRefresh((n) => n + 1); // 구글 쪽 최신 상태 반영
      } catch (e) {
        console.error('[gcal] 공유 실패:', e);
        alert('Google 캘린더 공유에 실패했습니다. 일정은 저장됩니다.');
      }
    } else if (googleEventId) {
      const removedId = googleEventId;
      setGoogleEvents((prev) => prev.filter((e) => e.extendedProps?.googleEventId !== removedId));
      try { await deleteGCalEvent(removedId); } catch (e) { console.error('[gcal] 공유 해제 실패:', e); }
      setGcalRefresh((n) => n + 1);
      googleEventId = null;
    }

    const newEvent = {
      id: uuid(),
      title,
      start: startStr,
      end: endStr,
      allDay: base.allDay,
      color,
      textColor: textColor(color),
      ...(reminder != null && { reminder }),
      ...(pushId && { pushId }),
      ...(shared && { shared: true }),
      ...(googleEventId && { googleEventId }),
    };
    saveAll((prev) => [...prev.filter((s) => s.id !== oldId), newEvent]);
    closeModal();
  };

  const handleDeleteEvent = () => {
    if (!editingEvent) return;
    if (!confirm(`${editingEvent.title} 을 제거 하시겠습니까?`)) return;
    if (editingEvent.extendedProps?.pushId) cancelPush(editingEvent.extendedProps.pushId);
    // 공유된 일정이면 Google 캘린더에서도 삭제(실패는 무시).
    const gid = editingEvent.extendedProps?.googleEventId;
    if (gid) {
      // 조회 캐시에서도 즉시 제거해 삭제가 바로 반영되도록 한다(재조회로 최종 정합성 보장).
      setGoogleEvents((prev) => prev.filter((e) => e.extendedProps?.googleEventId !== gid));
      deleteGCalEvent(gid)
        .then(() => setGcalRefresh((n) => n + 1))
        .catch((e) => console.error('[gcal] 삭제 실패:', e));
    }
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
      pushId = await schedulePush('📅 일정 알림', event.title, fireAt, dataKey);
    }
    // 공유된 일정이면 이동한 날짜를 Google 캘린더에도 반영(실패는 무시).
    const gid = event.extendedProps?.googleEventId;
    if (event.extendedProps?.shared && gid) {
      upsertGCalEvent({
        title: event.title, start: event.startStr, end: event.endStr,
        allDay: event.allDay, color: event.backgroundColor, googleEventId: gid,
      }).catch((e) => console.error('[gcal] 이동 동기화 실패:', e));
    }
    saveAll((prev) =>
      prev.map((s) =>
        s.id === event.id
          ? { ...s, start: event.startStr, end: event.endStr, allDay: event.allDay, pushId }
          : s
      )
    );
  };

  const handleLogout = () => {
    if (confirm('로그아웃 하시겠습니까?')) logout();
  };

  const modalInitial = useMemo(
    () => ({
      title: editingEvent?.title || '',
      color: editingEvent?.backgroundColor || '#3788d8',
      reminder: editingEvent?.extendedProps?.reminder ?? null,
      shared: editingEvent?.extendedProps?.shared ?? false,
    }),
    [editingEvent]
  );

  // 로그인 게이트 (Firebase 사용 시). 위젯 모드는 상호작용 로그인을 띄우지 않고
  // 기존 세션이 있으면 그대로 표시한다.
  if (isFirebaseAvailable && !ready) {
    return <div className="app-loading">불러오는 중…</div>;
  }
  if (isFirebaseAvailable && !user && !isWidget) {
    return <LoginScreen onLogin={login} />;
  }

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
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title="테마 전환"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="key-btn" onClick={handleLogout} title={`로그아웃${user?.email ? ` (${user.email})` : ''}`}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      )}

      {!isWidget && <Clock onGoToday={handleGoToday} />}

      <div className={`layout${isCalendarWidget ? ' view-mode widget-calendar' : isTodoWidget ? ' view-mode widget-todo' : ''}`}>
        {!isTodoWidget && (
          <CalendarPanel
            schedules={schedules}
            googleEvents={googleOnlyEvents}
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
