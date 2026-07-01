// 기존 동작 보존: localStorage 키 이름 'todoPrivateKey' 그대로 사용.
const STORAGE_KEY = 'todoPrivateKey';

const uuid = () => {
  const s4 = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
};

export function getPrivateKey() {
  let key = localStorage.getItem(STORAGE_KEY);
  if (!key) {
    key = uuid();
    localStorage.setItem(STORAGE_KEY, key);
  }
  return key;
}

export function setPrivateKey(key) {
  localStorage.setItem(STORAGE_KEY, key);
}
