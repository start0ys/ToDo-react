import { useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import googleCalendarPlugin from '@fullcalendar/google-calendar';
import koLocale from '@fullcalendar/core/locales/ko';
import { googleApiKey } from '../lib/firebase.js';
import { toDayKey } from '../lib/date.js';
import './calendar.css';

const HOLIDAY_CAL_ID = 'ko.south_korea#holiday@group.v.calendar.google.com';

export default function CalendarPanel({
  schedules,
  checkMap,
  viewMode,
  onSelectDate,
  onEventClick,
  onAdd,
  onChangeKey,
  onEventDrop,
}) {
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
    ? { left: 'title', center: '', right: 'today' }
    : { left: 'add key', center: 'title', right: 'today prev,next' };

  return (
    <div className={`card calendar-card${viewMode ? ' view-mode' : ''}`}>
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin, googleCalendarPlugin]}
        initialView="dayGridMonth"
        locale={koLocale}
        googleCalendarApiKey={googleApiKey || undefined}
        headerToolbar={headerToolbar}
        customButtons={{
          add: { text: '추가', click: onAdd },
          key: { text: 'PrivateKey', click: onChangeKey },
        }}
        height="auto"
        expandRows
        editable={!viewMode}
        selectable={!viewMode}
        nowIndicator
        dayMaxEvents
        longPressDelay={100}
        eventSources={eventSources}
        dayCellContent={(arg) => arg.dayNumberText.replace('일', '')}
        dayCellClassNames={(arg) => {
          const state = checkMap[toDayKey(arg.date)];
          return state === 'finish' ? ['has-finish'] : state === 'todo' ? ['has-todo'] : [];
        }}
        select={(arg) => onSelectDate(toDayKey(arg.start), arg)}
        dateClick={(arg) => onSelectDate(arg.dateStr, { ...arg, startStr: arg.dateStr, allDay: arg.allDay })}
        eventClick={(arg) => {
          arg.jsEvent.preventDefault();
          onEventClick(arg.event);
        }}
        eventDrop={(arg) => onEventDrop(arg.event, arg.revert)}
      />
    </div>
  );
}
