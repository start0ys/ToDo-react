/**
 * 브라우저 알림 권한 관련 유틸
 * 브라우저 정책상 사용자 제스처(클릭 등) 내에서만 requestPermission 이 동작합니다.
 */

export function getPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/**
 * 권한 요청 (반드시 클릭 핸들러 안에서 호출)
 * @returns {Promise<boolean>} 허용 여부
 */
export async function requestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * 즉시 알림 전송 (권한 있을 때만)
 * 모바일 브라우저에서 탭이 백그라운드일 때도 보이도록
 * ServiceWorkerRegistration.showNotification() 우선 사용
 */
export async function sendNow(title, body) {
  if (Notification.permission !== 'granted') return;
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, icon: '/favicon.ico' });
      return;
    } catch {
      // SW를 쓸 수 없으면 Notification API 폴백
    }
  }
  new Notification(title, { body, icon: '/favicon.ico' });
}

/**
 * 지정된 ms 후 알림 전송, clearTimeout 용 id 반환
 */
export function scheduleNotification(title, body, delayMs) {
  return setTimeout(() => sendNow(title, body), delayMs);
}
