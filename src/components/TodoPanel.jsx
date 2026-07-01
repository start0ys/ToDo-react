import { useMemo, useState } from 'react';
import TodoInput from './TodoInput.jsx';
import TodoList from './TodoList.jsx';
import { getWeekDays, toDayKey } from '../lib/date.js';
import './todo.css';

const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function parseTags(text) {
  return (text.match(/#[^\s#]+/g) || []).map((t) => t.slice(1));
}

function koDate(dayKey) {
  const [y, m, d] = dayKey.split('-');
  return `${y}년 ${m}월 ${d}일`;
}

function WeeklyView({ weekDays, getDayLists, selectedDay, onSelectDay }) {
  return (
    <div className="weekly-view">
      {weekDays.map((day) => {
        const { todos, finishes } = getDayLists(day);
        const total = todos.length + finishes.length;
        const pct = total > 0 ? Math.round((finishes.length / total) * 100) : 0;
        const isToday = day === toDayKey(new Date());
        const isSelected = day === selectedDay;
        const dow = new Date(day + 'T00:00').getDay();
        return (
          <div
            key={day}
            className={`weekly-col${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
            onClick={() => onSelectDay(day)}
          >
            <div className="weekly-pct-label">{total > 0 ? `${pct}%` : ''}</div>
            <div className="weekly-bar-track">
              <div className="weekly-bar-fill" style={{ height: `${pct}%` }} />
            </div>
            <div className="weekly-day-label">{DAY_KO[dow]}</div>
            <div className="weekly-date-label">{day.slice(8)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function TodoPanel({ selectedDay, todos, onSelectDay }) {
  const { todos: todoItems, finishes } = todos.getDayLists(selectedDay);
  const [showWeekly, setShowWeekly] = useState(false);
  const [activeTag, setActiveTag] = useState(null);

  const weekDays = useMemo(() => getWeekDays(selectedDay), [selectedDay]);

  // 현재 날짜 태그 수집
  const allTags = useMemo(() => {
    const tags = new Set();
    [...todoItems, ...finishes].forEach((t) => parseTags(t.text).forEach((tag) => tags.add(tag)));
    return [...tags];
  }, [todoItems, finishes]);

  // 태그 필터
  const filteredTodos = activeTag
    ? todoItems.filter((t) => parseTags(t.text).includes(activeTag))
    : todoItems;
  const filteredFinishes = activeTag
    ? finishes.filter((t) => parseTags(t.text).includes(activeTag))
    : finishes;

  // 완료율
  const total = todoItems.length + finishes.length;
  const pct = total > 0 ? Math.round((finishes.length / total) * 100) : 0;

  return (
    <div id="todo-panel" className="card todo-card">
      <div className="todo-head">
        {/* 날짜 + 주간 뷰 토글 */}
        <div className="todo-date-row">
          <span className="todo-date-spacer" />
          <div className="todo-date">{koDate(selectedDay)}</div>
          <button
            className={`weekly-toggle-btn${showWeekly ? ' active' : ''}`}
            onClick={() => setShowWeekly((v) => !v)}
            title="주간 요약"
          >
            📊 주간
          </button>
        </div>

        {/* 주간 뷰 */}
        {showWeekly && (
          <WeeklyView
            weekDays={weekDays}
            getDayLists={todos.getDayLists}
            selectedDay={selectedDay}
            onSelectDay={onSelectDay}
          />
        )}

        {/* 진행 바 */}
        {total > 0 && (
          <div className="todo-progress-wrap">
            <div className="todo-progress-track">
              <div className="todo-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="todo-progress-label">{finishes.length}/{total} 완료</span>
          </div>
        )}

        {/* 반복 설정 + 입력창 */}
        <TodoInput
          onAdd={(text) => todos.addTodo(selectedDay, text)}
          onAddRecurring={todos.addRecurringTodo}
          selectedDay={selectedDay}
        />
      </div>

      {/* 태그 필터 */}
      {allTags.length > 0 && (
        <div className="tag-filter-row">
          {allTags.map((tag) => (
            <button
              key={tag}
              className={`tag-chip${activeTag === tag ? ' active' : ''}`}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      <div className="todo-lists">
        <TodoList
          title="To Do List"
          icon="✓"
          accent="var(--success)"
          type="todo"
          items={filteredTodos}
          onAction={todos.finishTodo}
          onEdit={todos.updateText}
          onReorder={todos.reorder}
          onPriority={todos.setPriority}
          onMove={todos.moveToDay}
          onReminder={todos.setReminder}
          emptyMessage={activeTag ? `#${activeTag} 태그 없음` : '😊 할 일이 없어요!'}
        />
        <TodoList
          title="Finish List"
          icon="✕"
          accent="var(--danger)"
          type="finish"
          items={filteredFinishes}
          onAction={todos.deleteTodo}
          onRestore={todos.restoreTodo}
          onEdit={todos.updateText}
          onReorder={todos.reorder}
          emptyMessage={activeTag ? `#${activeTag} 태그 없음` : '아직 완료한 일이 없어요'}
        />
      </div>
    </div>
  );
}
