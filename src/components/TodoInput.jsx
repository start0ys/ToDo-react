import { useRef, useState } from 'react';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function TodoInput({ onAdd, onAddRecurring, selectedDay }) {
  const [value, setValue] = useState('');
  const [repeat, setRepeat] = useState('none');
  const [weekDay, setWeekDay] = useState(1);
  const [monthDay, setMonthDay] = useState(1);
  const inputRef = useRef(null);

  if (typeof window !== 'undefined') {
    window.__focusTodoInput = () => inputRef.current?.focus();
  }

  const submit = () => {
    if (!value.trim()) return;
    if (repeat !== 'none' && onAddRecurring) {
      const param = repeat === 'weekly' ? weekDay : repeat === 'monthly' ? monthDay : null;
      onAddRecurring(selectedDay, value, repeat, param);
    } else {
      onAdd(value);
    }
    setValue('');
    setRepeat('none');
  };

  return (
    <div className={`todo-input-row${repeat !== 'none' ? ' has-repeat' : ''}`}>
      {/* 텍스트 입력 */}
      <input
        ref={inputRef}
        className="todo-input"
        type="text"
        placeholder="📝 할 일을 입력하고 Enter"
        enterKeyHint="done"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyUp={(e) => { if (e.key === 'Enter') submit(); }}
      />

      {/* 반복 세부 선택 (매주 요일 / 매월 일) */}
      {repeat === 'weekly' && (
        <select
          className="todo-repeat-sub"
          value={weekDay}
          onChange={(e) => setWeekDay(Number(e.target.value))}
          title="요일 선택"
        >
          {WEEKDAYS.map((d, i) => (
            <option key={i} value={i}>{d}</option>
          ))}
        </select>
      )}
      {repeat === 'monthly' && (
        <select
          className="todo-repeat-sub"
          value={monthDay}
          onChange={(e) => setMonthDay(Number(e.target.value))}
          title="날짜 선택"
        >
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d}일</option>
          ))}
        </select>
      )}

      {/* 반복 종류 선택 */}
      <select
        className="todo-repeat-select"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        title="반복 설정"
      >
        <option value="none">반복</option>
        <option value="daily">매일</option>
        <option value="weekly">매주</option>
        <option value="monthly">매월</option>
      </select>

    </div>
  );
}
