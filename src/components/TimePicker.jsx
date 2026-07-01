import { useCallback, useEffect, useRef, useState } from 'react';
import './timepicker.css';

const ITEM_H = 44;   // 아이템 높이 px
const VISIBLE = 5;   // 화면에 보이는 개수 (홀수 → 가운데가 선택)
const PAD = Math.floor(VISIBLE / 2); // 위아래 패딩 아이템 수 = 2

const AMPM  = ['오전', '오후'];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINS  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/** "HH:MM" (24h) → { pmIdx, hIdx, mIdx } */
function parse24(t) {
  const [hh, mm] = (t || '').split(':').map(Number);
  if (isNaN(hh)) return { pmIdx: 0, hIdx: 8, mIdx: 0 }; // 09:00 기본값
  const pmIdx = hh >= 12 ? 1 : 0;
  const h12   = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return { pmIdx, hIdx: h12 - 1, mIdx: mm };
}

/** { pmIdx, hIdx, mIdx } → "HH:MM" (24h) */
function build24(pmIdx, hIdx, mIdx) {
  let h = hIdx + 1; // 1‥12
  if (pmIdx === 0) { if (h === 12) h = 0; }
  else             { if (h !== 12) h += 12; }
  return `${String(h).padStart(2, '0')}:${String(mIdx).padStart(2, '0')}`;
}

/* ─── 드럼 컬럼 ─────────────────────────────── */
function DrumCol({ items, selectedIdx, onSelect }) {
  const ref    = useRef(null);
  const isProg = useRef(false);
  const digitBuf   = useRef('');
  const digitTimer = useRef(null);

  /* 외부에서 selectedIdx 바뀌면 스크롤 이동 */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    isProg.current = true;
    el.scrollTop = selectedIdx * ITEM_H;
    requestAnimationFrame(() => { isProg.current = false; });
  }, [selectedIdx]);

  /* 스크롤 끝나면 가장 가까운 인덱스 확정 */
  const handleScroll = useCallback(() => {
    if (isProg.current) return;
    const el = ref.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    if (clamped !== selectedIdx) onSelect(clamped);
  }, [items.length, selectedIdx, onSelect]);

  /* 숫자 키 입력 → 해당 값으로 이동 */
  const handleKeyDown = (e) => {
    if (!/^\d$/.test(e.key)) return;
    clearTimeout(digitTimer.current);
    digitBuf.current += e.key;
    const num = parseInt(digitBuf.current, 10);
    const idx = items.findIndex((it) => parseInt(it, 10) === num);
    if (idx >= 0) onSelect(idx);
    digitTimer.current = setTimeout(() => { digitBuf.current = ''; }, 800);
  };

  return (
    <div className="drum-col" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* 선택 하이라이트 (배경) */}
      <div className="drum-highlight" />
      {/* 상단 페이드 */}
      <div className="drum-fade drum-fade-top" />
      <div
        ref={ref}
        className="drum-scroll"
        onScroll={handleScroll}
      >
        {/* 위 패딩 */}
        <div style={{ height: PAD * ITEM_H, flexShrink: 0 }} />
        {items.map((label, i) => (
          <div
            key={i}
            className={`drum-item${i === selectedIdx ? ' drum-sel' : ''}`}
            onClick={() => onSelect(i)}
          >
            {label}
          </div>
        ))}
        {/* 아래 패딩 */}
        <div style={{ height: PAD * ITEM_H, flexShrink: 0 }} />
      </div>
      {/* 하단 페이드 */}
      <div className="drum-fade drum-fade-bot" />
    </div>
  );
}

/* ─── TimePicker 메인 ────────────────────────── */
export default function TimePicker({ value, onConfirm, onCancel, anchorEl }) {
  const { pmIdx: ip, hIdx: ih, mIdx: im } = parse24(value);
  const [pmIdx, setPmIdx] = useState(ip);
  const [hIdx,  setHIdx]  = useState(ih);
  const [mIdx,  setMIdx]  = useState(im);
  const popupRef = useRef(null);

  /* 앵커 요소 기준 fixed 위치 계산 */
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const PW = 236, PH = 330;
    let top  = rect.bottom + 8;
    let left = rect.left;
    if (top  + PH > window.innerHeight - 16) top  = rect.top - PH - 8;
    if (left + PW > window.innerWidth  - 16) left = window.innerWidth - PW - 16;
    if (left < 8) left = 8;
    setPos({ top, left });
  }, [anchorEl]);

  /* 바깥 클릭 → 취소 */
  useEffect(() => {
    const handler = (e) => {
      if (
        !popupRef.current?.contains(e.target) &&
        !anchorEl?.contains(e.target)
      ) onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorEl, onCancel]);

  /* ESC → 취소 */
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  if (!pos) return null;

  return (
    <div
      ref={popupRef}
      className="time-picker-popup"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="time-picker-title">알림 시간 설정</div>
      <div className="time-picker-drums">
        <DrumCol items={AMPM}  selectedIdx={pmIdx} onSelect={setPmIdx} />
        <span className="drum-sep" />
        <DrumCol items={HOURS} selectedIdx={hIdx}  onSelect={setHIdx}  />
        <span className="drum-sep" />
        <DrumCol items={MINS}  selectedIdx={mIdx}  onSelect={setMIdx}  />
      </div>
      <div className="time-picker-btns">
        <button className="tp-btn tp-confirm" onClick={() => onConfirm(build24(pmIdx, hIdx, mIdx))}>
          확인
        </button>
        <button className="tp-btn tp-cancel" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
