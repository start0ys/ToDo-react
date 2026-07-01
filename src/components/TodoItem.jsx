import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function TodoItem({ item, type, icon, accent, onAction, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const commit = () => {
    setEditing(false);
    const text = draft.trim();
    if (text && text !== item.text) onEdit(item.id, text);
    else setDraft(item.text);
  };

  return (
    <div ref={setNodeRef} style={style} className="todo-item">
      {editing ? (
        <input
          className="todo-item-edit"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyUp={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(item.text);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span
          className="todo-item-text"
          onDoubleClick={() => {
            setDraft(item.text);
            setEditing(true);
          }}
          {...attributes}
          {...listeners}
        >
          {item.text}
        </span>
      )}
      <button
        className="todo-item-action"
        style={{ color: accent }}
        title={type === 'todo' ? '완료' : '삭제'}
        onClick={() => onAction(item.id)}
      >
        {icon}
      </button>
    </div>
  );
}
