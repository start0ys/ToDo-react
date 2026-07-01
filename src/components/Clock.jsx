import { useEffect, useState } from 'react';
import { toKoDateFull, toClock } from '../lib/date.js';

export default function Clock({ onGoToday }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="clock"
      onClick={onGoToday}
      title={onGoToday ? '오늘로 이동' : undefined}
      style={onGoToday ? { cursor: 'pointer' } : undefined}
    >
      <div className="date">{toKoDateFull(now)}</div>
      <div className="time">{toClock(now)}</div>
    </div>
  );
}
