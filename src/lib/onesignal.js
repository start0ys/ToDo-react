// OneSignal v16 웹푸시 연동 (예약 발송 + 멀티기기)
// 예약 타이머는 브라우저가 아니라 OneSignal 서버가 들고 있으므로
// 브라우저가 완전히 꺼져 있어도 지정 시간에 알림이 전송된다.

import OneSignal from 'react-onesignal';
import { requestPermission as nativeRequestPermission, getPermissionState } from './notification';

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';

// APP_ID가 없으면(=아직 미설정) OneSignal 관련 동작을 전부 no-op 처리해
// 기존 앱이 깨지지 않도록 한다.
export const isOneSignalConfigured = Boolean(APP_ID);

let initPromise = null;

/**
 * OneSignal 초기화 + privateKey를 external_id(별칭)로 등록.
 * 여러 번 호출해도 최초 1회만 실제 초기화된다.
 */
export function initOneSignal(privateKey) {
  if (!isOneSignalConfigured) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await OneSignal.init({
      appId: APP_ID,
      allowLocalhostAsSecureOrigin: true, // 로컬 개발용 (배포 시 영향 없음)
      // 워커는 루트 기본 경로(/OneSignalSDKWorker.js)를 사용한다. 앱의 SW도
      // 같은 파일/스코프로 등록하므로 충돌이 없다.
    });

    // v16: setExternalUserId → login
    if (privateKey) await OneSignal.login(privateKey);
  })();

  return initPromise;
}

/**
 * 푸시 권한 요청 (반드시 사용자 클릭 핸들러 안에서 호출).
 * OneSignal 미설정 시에는 브라우저 기본 Notification 권한으로 폴백.
 * @returns {Promise<boolean>} 구독(허용) 여부
 */
export async function ensurePushPermission() {
  if (!isOneSignalConfigured) return nativeRequestPermission();
  try {
    await initOneSignal(); // 이미 초기화됐으면 기존 프로미스 재사용
    // v16: requestPermission()은 권한만 요청. 실제 구독(푸시 토큰 생성)은
    // optIn()이 담당한다. 이걸 빼먹으면 "권한 있음 + No Push Token
    // (Never Subscribed)" 상태가 되어 알림 대상이 없다.
    await OneSignal.Notifications.requestPermission();
    await OneSignal.User.PushSubscription.optIn();
  } catch (e) {
    // 에러를 삼키면 클릭이 "무반응"처럼 보이므로 콘솔에 남긴다.
    console.error('[push] ensurePushPermission 실패:', e);
  }
  // optedIn(구독 완료)은 권한 허용 직후 바로 true가 아닐 수 있으므로,
  // 브라우저 실제 권한 상태로 판정한다. (구독은 백그라운드에서 완료됨)
  return getPermissionState() === 'granted';
}

/**
 * dayKey("YYYY-MM-DD") + "HH:MM" → 로컬 시각 Date. 유효하지 않으면 null.
 */
export function reminderToDate(dayKey, hhmm) {
  if (!dayKey || !hhmm) return null;
  const d = new Date(`${dayKey}T${hhmm}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 예약 푸시 등록. Netlify Function 경유로 REST API Key를 숨긴다.
 * @returns {Promise<string|null>} 예약된 알림 id (취소/재예약에 사용) 또는 null
 */
export async function schedulePush(title, body, fireAt, privateKey) {
  if (!isOneSignalConfigured || !privateKey || !fireAt) return null;
  const sendAfterMs = fireAt.getTime() - Date.now();
  if (sendAfterMs <= 0) return null; // 이미 지난 시각은 예약하지 않음

  try {
    const res = await fetch('/.netlify/functions/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        privateKey,
        title,
        body,
        sendAfter: fireAt.toISOString(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    // 실패(4xx/5xx 또는 errors)면 원인 파악용으로만 경고를 남긴다.
    // 성공: { id, recipients }, 실패: { errors: [...] } 형태.
    if (!res.ok || !data.id || data.errors) {
      console.warn('[push] 예약 실패:', res.status, data);
      return null;
    }
    return data.id;
  } catch {
    return null; // dev 환경 등 함수가 없을 때도 앱이 깨지지 않게
  }
}

/**
 * 예약된 푸시 취소.
 */
export async function cancelPush(notificationId) {
  if (!isOneSignalConfigured || !notificationId) return;
  try {
    await fetch('/.netlify/functions/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId }),
    });
  } catch {
    // 무시
  }
}
