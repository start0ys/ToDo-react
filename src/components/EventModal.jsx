import { useEffect, useRef, useState } from 'react';
import { COLOR_PRESETS } from '../lib/color.js';
import { requestPermission, getPermissionState } from '../lib/notification.js';
import TimePicker from './TimePicker.jsx';
import './modal.css';

function nextFiveMin() {
  const d = new Date();
  d.setSeconds(0, 0);
  const rem = d.getMinutes() % 5;
  d.setMinutes(d.getMinutes() + (rem === 0 ? 5 : 5 - rem));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function EventModal({ initial, isEdit, onConfirm, onDelete, onClose }) {
  const [title,   setTitle]   = useState(initial.title);
  const [color,   setColor]   = useState(initial.color);
  const [reminderEnabled, setReminderEnabled] = useState(!!initial.reminder);
  const [reminderTime,    setReminderTime]    = useState(
    typeof initial.reminder === 'string' ? initial.reminder : nextFiveMin()
  );
  const [showPicker, setShowPicker] = useState(false);
  const timeBtnRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !showPicker) onClose(); };
    document.addEventListener('keyup', onKey);
    return () => document.removeEventListener('keyup', onKey);
  }, [onClose, showPicker]);

  const handleReminderToggle = async (e) => {
    const checked = e.target.checked;
    if (checked) {
      if (getPermissionState() === 'denied') {
        alert('알림이 차단되어 있습니다.\n브라우저 주소창 🔒 → 알림 → 허용 후 새로고침해주세요.');
        return;
      }
      await requestPermission();
      if (!initial.reminder) setReminderTime(nextFiveMin());
    }
    setReminderEnabled(checked);
  };

  const handleConfirm = () => {
    onConfirm(title, color, reminderEnabled ? reminderTime : null);
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
            <button key={p.value} className="color-chip" style={{ background: p.value }} onClick={() => setColor(p.value)}>
              {p.name}
            </button>
          ))}
        </div>

        <label className="modal-row">
          <span>선택 색상</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>

        {/* 알림 */}
        <div className="modal-row modal-reminder-row">
          <span>알림</span>
          <label className="reminder-toggle-label">
            <input
              type="checkbox"
              className="reminder-toggle-check"
              checked={reminderEnabled}
              onChange={handleReminderToggle}
            />
            <span className="reminder-toggle-text">{reminderEnabled ? '켜짐' : '꺼짐'}</span>
          </label>
          {reminderEnabled && (
            <button
              ref={timeBtnRef}
              className="modal-time-btn"
              onClick={() => setShowPicker(true)}
              title="알림 시간 선택"
            >
              🔔 {reminderTime}
            </button>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={handleConfirm}>확인</button>
          {isEdit && <button className="btn btn-danger" onClick={onDelete}>삭제</button>}
        </div>
      </div>

      {/* 드럼 시간 선택 팝업 */}
      {showPicker && (
        <TimePicker
          value={reminderTime}
          anchorEl={timeBtnRef.current}
          onConfirm={(t) => { setReminderTime(t); setShowPicker(false); }}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
