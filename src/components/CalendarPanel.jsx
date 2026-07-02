import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import googleCalendarPlugin from '@fullcalendar/google-calendar';
import koLocale from '@fullcalendar/core/locales/ko';
import { googleApiKey } from '../lib/firebase.js';
import { toDayKey } from '../lib/date.js';
import './calendar.css';

const HOLIDAY_CAL_ID = 'ko.south_korea#holiday@group.v.calendar.google.com';
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const THIS_YEAR = new Date().getFullYear();

export default function CalendarPanel({
  schedules,
  checkMap,
  viewMode,
  selectedDay,
  navigateTo,
  onNavigated,
  onSelectDate,
  onEventClick,
  onAdd,
  onGoToday,
  onEventDrop,
  getDayLists,
}) {
  const calendarRef = useRef(null);
  const pickerRef = useRef(null);
  const touchStartX = useRef(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(THIS_YEAR);
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const eventSources = useMemo(() => {
    const sources = [{ events: schedules }];
    if (googleApiKey) {
      sources.push({
        googleCalendarId: HOLIDAY_CAL_ID,
        className: 'holiday',
        color: 'transparent',
        textColor: '#FF0000',
      });
    }
    return sources;
  }, [schedules]);

  const headerToolbar = viewMode
    ? { left: 'title', center: '', right: 'myToday' }
    : { left: 'add', center: 'title', right: 'myToday prev,next' };

  // 외부에서 특정 날짜로 달력 이동 (검색 등)
  useEffect(() => {
    if (!navigateTo) return;
    calendarRef.current?.getApi().gotoDate(navigateTo);
    onNavigated?.();
  }, [navigateTo, onNavigated]);

  // 키보드 단축키: ← → 월 이동, T 오늘
  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      const api = calendarRef.current?.getApi();
      if (!api) return;
      if (e.key === 'ArrowLeft') api.prev();
      if (e.key === 'ArrowRight') api.next();
      if (e.key === 't' || e.key === 'T') api.today();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const openPicker = () => {
    setPickerYear(currentDate.getFullYear());
    setPickerMonth(currentDate.getMonth());
    setShowPicker(true);
  };

  const applyPicker = () => {
    calendarRef.current?.getApi().gotoDate(new Date(pickerYear, pickerMonth, 1));
    setShowPicker(false);
  };

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => {
      if (!pickerRef.current?.contains(e.target) && !e.target.closest('.fc-toolbar-title')) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  // 모바일 스와이프
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      const api = calendarRef.current?.getApi();
      if (diff < 0) api?.next();
      else api?.prev();
    }
    touchStartX.current = null;
  };

  return (
    <div
      className={`card calendar-card${viewMode ? ' view-mode' : ''}`}
      onClick={(e) => {
        if (!viewMode && e.target.closest('.fc-toolbar-title')) openPicker();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {showPicker && (
        <div ref={pickerRef} className="cal-picker-popup">
          <select value={pickerYear} onChange={(e) => setPickerYear(Number(e.target.value))}>
            {Array.from({ length: 11 }, (_, i) => THIS_YEAR - 5 + i).map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <select value={pickerMonth} onChange={(e) => setPickerMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>
          <button className="cal-picker-go" onClick={applyPicker}>이동</button>
          <button className="cal-picker-close" onClick={() => setShowPicker(false)}>✕</button>
        </div>
      )}

      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, interactionPlugin, googleCalendarPlugin]}
        initialView="dayGridMonth"
        locale={koLocale}
        googleCalendarApiKey={googleApiKey || undefined}
        headerToolbar={headerToolbar}
        customButtons={{
          add: { text: '추가', click: onAdd },
          myToday: { text: '오늘', click: onGoToday },
        }}
        height={isMobile ? 'auto' : '100%'}
        expandRows={!isMobile}
        editable={!viewMode}
        selectable={!viewMode}
        nowIndicator
        dayMaxEvents={3}
        longPressDelay={100}
        eventSources={eventSources}
        dayCellContent={(arg) => {
          const key = toDayKey(arg.date);
          let tooltip = '';
          if (getDayLists) {
            const { todos, finishes } = getDayLists(key);
            const parts = [];
            if (todos.length) parts.push(`할 일 ${todos.length}개`);
            if (finishes.length) parts.push(`완료 ${finishes.length}개`);
            if (parts.length) tooltip = parts.join(' / ');
          }
          const text = arg.dayNumberText.replace('일', '');
          return tooltip
            ? { html: `<span title="${tooltip}">${text}</span>` }
            : text;
        }}
        dayCellClassNames={(arg) => {
          const key = toDayKey(arg.date);
          const classes = [];
          const state = checkMap[key];
          if (state === 'finish') classes.push('has-finish');
          else if (state === 'todo') classes.push('has-todo');
          if (selectedDay && key === selectedDay) classes.push('fc-day-selected');
          return classes;
        }}
        select={(arg) => onSelectDate(toDayKey(arg.start), arg)}
        dateClick={(arg) => onSelectDate(arg.dateStr, { ...arg, startStr: arg.dateStr, allDay: arg.allDay })}
        eventClick={(arg) => {
          arg.jsEvent.preventDefault();
          onEventClick(arg.event);
        }}
        eventDrop={(arg) => onEventDrop(arg.event, arg.revert)}
        datesSet={(info) => setCurrentDate(info.view.currentStart)}
      />
    </div>
  );
}
