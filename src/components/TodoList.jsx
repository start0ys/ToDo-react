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

export default function TodoList({ title, icon, accent, type, items, onAction, onEdit, onReorder }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    onReorder(next);
  };

  return (
    <div className="todo-col">
      <div className="todo-col-title" style={{ color: accent }}>
        <span className="todo-col-icon">{icon}</span>
        {title}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="todo-items">
            {items.length === 0 && <div className="todo-empty">비어 있음</div>}
            {items.map((item) => (
              <TodoItem
                key={item.id}
                item={item}
                type={type}
                icon={icon}
                accent={accent}
                onAction={onAction}
                onEdit={onEdit}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
