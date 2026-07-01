import { useEffect, useState } from 'react';
import { toKoDateFull, toClock } from '../lib/date.js';

export default function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="clock">
      <div className="date">{toKoDateFull(now)}</div>
      <div className="time">{toClock(now)}</div>
    </div>
  );
}
