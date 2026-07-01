export const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

const DAY_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

// 'yyyy-MM-dd'
export function toDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 'yyyy년 MM월 dd일'
export function toKoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}년 ${pad(d.getMonth() + 1)}월 ${pad(d.getDate())}일`;
}

// 'yyyy년 MM월 dd일 요일'
export function toKoDateFull(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${toKoDate(d)} ${DAY_KO[d.getDay()]}`;
}

// 'HH:mm:ss'
export function toClock(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function uuid() {
  const s4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}
