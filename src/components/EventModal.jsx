import { useEffect, useState } from 'react';
import { COLOR_PRESETS } from '../lib/color.js';
import './modal.css';

export default function EventModal({ initial, isEdit, onConfirm, onDelete, onClose }) {
  const [title, setTitle] = useState(initial.title);
  const [color, setColor] = useState(initial.color);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keyup', onKey);
    return () => document.removeEventListener('keyup', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-content" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <h3 className="modal-title">{isEdit ? '일정 수정' : '일정 등록'}</h3>

        <label className="modal-row">
          <span>일정</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="일정을 작성해주세요."
            onKeyUp={(e) => {
              if (e.key === 'Enter') onConfirm(title, color);
            }}
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

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={() => onConfirm(title, color)}>
            확인
          </button>
          {isEdit && (
            <button className="btn btn-danger" onClick={onDelete}>
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
