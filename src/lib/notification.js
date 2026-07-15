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
