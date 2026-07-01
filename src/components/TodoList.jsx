import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import TodoItem from './TodoItem.jsx';

export default function TodoList({
  title,
  icon,
  accent,
  type,
  items,
  onAction,
  onRestore,
  onEdit,
  onReorder,
  onPriority,
  onMove,
  onReminder,
  onCarryOver,
  emptyMessage,
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [plainView, setPlainView] = useState(false);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    onReorder(next);
  };

  return (
    <div className={`todo-col${plainView ? ' plain-view' : ''}`}>
      <div className="todo-col-title" style={{ color: accent }}>
        <span className="todo-col-icon">{icon}</span>
        {title}
        {type === 'finish' && (
          <button
            className={`finish-view-toggle${plainView ? ' active' : ''}`}
            title={plainView ? '줄긋기 보기' : '일반 보기'}
            onClick={() => setPlainView((v) => !v)}
          >
            <span className="finish-view-toggle-s">S</span>
          </button>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="todo-items">
            {items.length === 0 && (
              <div className="todo-empty">{emptyMessage || '비어 있음'}</div>
            )}
            {items.map((item) => (
              <TodoItem
                key={item.id}
                item={item}
                type={type}
                icon={icon}
                accent={accent}
                onAction={onAction}
                onRestore={onRestore}
                onEdit={onEdit}
                onPriority={onPriority}
                onMove={onMove}
                onReminder={onReminder}
                onCarryOver={onCarryOver}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
