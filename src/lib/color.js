// 기존 textColor() 이식: 배경색 밝기에 따라 흰색/검정 글자색 반환 (ITU-R BT.709)
export function textColor(color) {
  if (!color) return '#fff';
  let hexColor = '';
  if (color.substring(0, 1) === '#') {
    hexColor = color.substring(1);
  } else {
    if (color.search('rgb') === -1) return '#fff';
    const m = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+))?\)$/);
    const hex = (x) => ('0' + parseInt(x, 10).toString(16)).slice(-2);
    hexColor = hex(m[1]) + hex(m[2]) + hex(m[3]);
  }
  const rgb = parseInt(hexColor, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 170.5 ? '#fff' : '#302c2c';
}

// 색상 프리셋 (기존 모달 색상 유지)
export const COLOR_PRESETS = [
  { name: '기본', value: '#3788d8' },
  { name: '지원', value: '#e65656' },
  { name: '연차', value: '#bc37cd' },
  { name: '여행', value: '#0edd1c' },
  { name: '생일', value: '#00c7c7' },
];
