import { useEffect, useState } from 'react';
import { COLOR_PRESETS } from '../lib/color.js';
import './modal.css';

const REMINDER_OPTIONS = [
  { value: 'none', label: '없음' },
  { value: '5',    label: '5분 전' },
  { value: '10',   label: '10분 전' },
  { value: '15',   label: '15분 전' },
  { value: '30',   label: '30분 전' },
  { value: '60',   label: '1시간 전' },
  { value: '120',  label: '2시간 전' },
  { value: '1440', label: '1일 전' },
];

export default function EventModal({ initial, isEdit, onConfirm, onDelete, onClose }) {
  const [title, setTitle] = useState(initial.title);
  const [color, setColor] = useState(initial.color);
  const [reminder, setReminder] = useState(
    initial.reminder != null ? String(initial.reminder) : 'none'
  );

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keyup', onKey);
    return () => document.removeEventListener('keyup', onKey);
  }, [onClose]);

  const handleConfirm = () => {
    onConfirm(title, color, reminder !== 'none' ? Number(reminder) : null);
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-content" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="닫기">×</button>
        <h3 className="modal-title">{isEdit ? '일정 수정' : '일정 등록'}</h3>

        <label className="modal-row">
          <span>일정</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="일정을 작성해주세요."
            onKeyUp={(e) => { if (e.key === 'Enter') handleConfirm(); }}
          />
        </label>

        <div className="color-presets">
          {COLOR_PRESETS.map((p) => (
            <button
              key={p.value}
              className="color-chip"
              style={{ background: p.value }}
              onClick={() => setColor(p.value)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <label className="modal-row">
          <span>선택 색상</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>

        <label className="modal-row">
          <span>알림</span>
          <select
            className="modal-select"
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
          >
            {REMINDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={handleConfirm}>확인</button>
          {isEdit && (
            <button className="btn btn-danger" onClick={onDelete}>삭제</button>
          )}
        </div>
      </div>
    </div>
  );
}
