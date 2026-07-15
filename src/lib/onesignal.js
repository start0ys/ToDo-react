// OneSignal v16 웹푸시 연동 (예약 발송 + 멀티기기)
// 예약 타이머는 브라우저가 아니라 OneSignal 서버가 들고 있으므로
// 브라우저가 완전히 꺼져 있어도 지정 시간에 알림이 전송된다.

import OneSignal from 'react-onesignal';
import { requestPermission as nativeRequestPermission } from './notification';

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';

// APP_ID가 없으면(=아직 미설정) OneSignal 관련 동작을 전부 no-op 처리해
// 기존 앱이 깨지지 않도록 한다.
export const isOneSignalConfigured = Boolean(APP_ID);

let initialized = false;
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
      // 기존 /sw.js(루트 스코프)와 충돌하지 않도록 OneSignal 워커를 별도 스코프로 분리
      serviceWorkerParam: { scope: '/push/onesignal/' },
      serviceWorkerPath: 'push/onesignal/OneSignalSDKWorker.js',
    });
    initialized = true;

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
  await initOneSignal(); // 이미 초기화됐으면 기존 프로미스 재사용
  await OneSignal.Notifications.requestPermission();
  return OneSignal.User.PushSubscription.optedIn === true;
}

export function isPushOptedIn() {
  if (!initialized) return false;
  return OneSignal.User.PushSubscription.optedIn === true;
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
    if (!res.ok) return null;
    const data = await res.json();
    return data.id || null;
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
