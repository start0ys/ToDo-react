import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getPermissionState } from '../lib/notification.js';
import { ensurePushPermission } from '../lib/onesignal.js';
import TimePicker from './TimePicker.jsx';

function parseTags(text) {
  return (text.match(/#[^\s#]+/g) || []).map((t) => t.slice(1));
}
function stripTags(text) {
  return text.replace(/#[^\s#]+/g, '').trim();
}
function nextFiveMin() {
  const d = new Date();
  d.setSeconds(0, 0);
  const rem = d.getMinutes() % 5;
  d.setMinutes(d.getMinutes() + (rem === 0 ? 5 : 5 - rem));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function TodoItem({
  item, type,
  onAction, onRestore, onEdit, onPriority, onMove, onReminder, onCarryOver,
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(item.text);
  const [editDay, setEditDay] = useState(item.day || '');
  const [fading,  setFading]  = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showMoveInput, setShowMoveInput] = useState(false);
  const moveInputRef = useRef(null);

  const bellRef = useRef(null);

  useEffect(() => {
    if (showMoveInput && moveInputRef.current) {
      moveInputRef.current.focus();
      try { moveInputRef.current.showPicker?.(); } catch (_) {}
    }
  }, [showMoveInput]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const startEdit = () => { setDraft(item.text); setEditDay(item.day || ''); setEditing(true); };

  const commit = () => {
    setEditing(false);
    const text = draft.trim();
    if (text && text !== item.text) onEdit(item.id, text);
    else setDraft(item.text);
    if (editDay && editDay !== item.day && onMove) onMove(item.id, editDay);
  };

  const handleComplete = () => {
    if (fading) return;
    setFading(true);
    setTimeout(() => onAction(item.id), 300);
  };

  const openPicker = async () => {
    if (getPermissionState() === 'denied') {
      alert('알림이 차단되어 있습니다.\n브라우저 주소창 🔒 → 알림 → 허용 후 새로고침해주세요.');
      return;
    }
    const granted = await ensurePushPermission();
    if (!granted) return;
    setShowPicker(true);
  };

  const clearReminder = (e) => {
    e?.preventDefault();
    if (onReminder) onReminder(item.id, null);
    setShowPicker(false);
  };

  const tags        = parseTags(item.text);
  const visibleText = stripTags(item.text) || item.text;
  const priority    = item.priority || 0;

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`todo-item${fading ? ' fading-out' : ''}${priority === 2 ? ' priority-urgent' : ''}`}
      >
        {/* 우선순위 점 */}
        {type === 'todo' && onPriority && (
          <button
            className={`priority-dot p${priority}`}
            title={['기본', '중요', '긴급'][priority]}
            onClick={(e) => { e.stopPropagation(); onPriority(item.id, (priority + 1) % 3); }}
          />
        )}

        {/* 드래그 핸들 */}
        <span className="drag-handle" {...attributes} {...listeners}>⠿</span>

        {/* 체크박스 */}
        {type === 'todo' && (
          <button className={`todo-check-btn${fading ? ' checked' : ''}`} title="완료" onClick={handleComplete} />
        )}

        {/* 텍스트 / 편집 */}
        {editing ? (
          <div className="todo-edit-wrap">
            <input
              className="todo-item-edit"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyUp={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') { setDraft(item.text); setEditing(false); }
              }}
            />
            {type === 'todo' && onMove && (
              <input type="date" className="todo-item-date-edit" value={editDay} onChange={(e) => setEditDay(e.target.value)} />
            )}
          </div>
        ) : (
          <div className="todo-text-wrap" onDoubleClick={startEdit}>
            <span className={`todo-item-text${type === 'finish' ? ' done' : ''}`}>{visibleText}</span>
            {tags.length > 0 && (
              <div className="item-tags">
                {tags.map((tag) => <span key={tag} className="item-tag">#{tag}</span>)}
              </div>
            )}
          </div>
        )}

        {/* 이관 · 날짜 이동 버튼 (todo) */}
        {type === 'todo' && (
          <>
            {onCarryOver && (
              <button
                className={`todo-carryover-btn${item.carryOver ? ' active' : ''}`}
                title={item.carryOver ? '자동 이관 해제' : '다음날 자동 이관'}
                onClick={(e) => { e.stopPropagation(); onCarryOver(item.id, !item.carryOver); }}
              >↩</button>
            )}
            {onMove && (
              <button
                className="todo-move-btn"
                title="날짜 이동"
                onClick={(e) => { e.stopPropagation(); setShowMoveInput((v) => !v); }}
              >📅</button>
            )}
          </>
        )}

        {/* 알림 (todo) */}
        {type === 'todo' && (
          <div className="reminder-wrap">
            {item.reminder ? (
              <div className="reminder-badge">
                <button ref={bellRef} className="reminder-badge-time" onClick={openPicker} title="알림 시간 변경">
                  🔔 {item.reminder}
                </button>
                <button className="reminder-badge-clear" onMouseDown={clearReminder} title="알림 삭제">✕</button>
              </div>
            ) : (
              <button ref={bellRef} className="reminder-btn" title="알림 설정" onClick={openPicker}>🔕</button>
            )}
          </div>
        )}

        {/* 복원 (finish) */}
        {type === 'finish' && onRestore && (
          <button className="todo-item-restore" title="할 일로 복원" onClick={() => onRestore(item.id)}>↺</button>
        )}

        {/* 삭제 (finish) */}
        {type === 'finish' && (
          <button className="todo-item-action" title="삭제" onClick={() => onAction(item.id)}>✕</button>
        )}
      </div>

      {/* 드럼 시간 선택 팝업 */}
      {showPicker && (
        <TimePicker
          value={item.reminder || nextFiveMin()}
          anchorEl={bellRef.current}
          onConfirm={(t) => { if (onReminder) onReminder(item.id, t); setShowPicker(false); }}
          onCancel={() => setShowPicker(false)}
        />
      )}

      {/* 날짜 이동 입력창 */}
      {showMoveInput && (
        <div className="todo-move-picker">
          <span className="todo-move-picker-label">이동</span>
          <input
            ref={moveInputRef}
            type="date"
            defaultValue={item.day}
            onChange={(e) => {
              if (e.target.value && e.target.value !== item.day) {
                onMove(item.id, e.target.value);
              }
              setShowMoveInput(false);
            }}
            onBlur={() => setShowMoveInput(false)}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowMoveInput(false); }}
          />
        </div>
      )}
    </>
  );
}
