// 계정별 Google 캘린더 연동 (GIS 토큰 플로우 + Calendar REST).
// - 로그인(Firebase)과 별개로, "공유" 토글 시에만 calendar.events 권한을 요청한다(온디맨드).
// - 액세스 토큰은 메모리에만 두고 저장하지 않는다. 만료(~1h) 시 재요청.
// - CLIENT_ID 미설정이면 전부 no-op → 기존 앱이 깨지지 않는다.
import { toDayKey, addDays } from './date';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

export const isGCalConfigured = Boolean(CLIENT_ID);

let gisPromise = null;
let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let pendingResolve = null;
let pendingReject = null;
let accountHint = ''; // 앱 로그인(Firebase) 계정 이메일 → 캘린더 권한도 같은 계정으로 강제

/**
 * 캘린더 권한 요청 시 사용할 계정 힌트(로그인 이메일)를 지정.
 * 브라우저에 여러 구글 계정이 있어도 앱 로그인 계정으로 고정하기 위함.
 */
export function setGCalAccountHint(email) {
  accountHint = email || '';
}

function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Google Identity Services 로드 실패'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

async function ensureTokenClient() {
  await loadGis();
  if (tokenClient) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      if (resp.error) {
        pendingReject?.(resp);
      } else {
        accessToken = resp.access_token;
        // 만료 60초 전에 재요청하도록 여유를 둔다.
        tokenExpiry = Date.now() + (Number(resp.expires_in) - 60) * 1000;
        pendingResolve?.(accessToken);
      }
      pendingResolve = pendingReject = null;
    },
  });
}

/**
 * 유효한 액세스 토큰 확보. 반드시 사용자 클릭/드래그 핸들러 안에서 호출(팝업 차단 방지).
 * @param {boolean} interactive true면 필요 시 동의 팝업 허용, false면 무음('none')
 * @returns {Promise<string|null>}
 */
export async function ensureGCalToken(interactive = true) {
  if (!isGCalConfigured) return null;
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  await ensureTokenClient();
  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    try {
      tokenClient.requestAccessToken({
        prompt: interactive ? '' : 'none',
        ...(accountHint && { hint: accountHint }),
      });
    } catch (e) {
      pendingResolve = pendingReject = null;
      reject(e);
    }
  });
}

async function apiCall(method, path, body) {
  const token = await ensureGCalToken(true);
  if (!token) throw new Error('Google 캘린더 토큰 없음');
  const res = await fetch(`${CAL_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body && { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const err = new Error(`Calendar API ${res.status}`);
    err.status = res.status;
    err.detail = await res.json().catch(() => ({}));
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const dayOnly = (s) => String(s).slice(0, 10);
const nextDay = (dayStr) => toDayKey(addDays(new Date(`${dayStr}T00:00`), 1));

// 앱 일정({title,start,end,allDay}) → Google 이벤트 본문
function toGoogleEvent({ title, start, end, allDay }) {
  const ev = { summary: title };
  if (allDay) {
    // 종일: date(YYYY-MM-DD). Google 종일 end는 배타적이므로 최소 start+1일.
    const startDay = dayOnly(start);
    const endDay = end ? dayOnly(end) : nextDay(startDay);
    ev.start = { date: startDay };
    ev.end = { date: endDay > startDay ? endDay : nextDay(startDay) };
  } else {
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : startMs + 60 * 60 * 1000; // 기본 1시간
    ev.start = { dateTime: new Date(startMs).toISOString() };
    ev.end = { dateTime: new Date(endMs > startMs ? endMs : startMs + 60 * 60 * 1000).toISOString() };
  }
  return ev;
}

/**
 * 일정을 본인 primary 캘린더에 upsert.
 *  - googleEventId 있으면 patch, 404/410(원격 삭제됨)이면 재생성
 *  - 없으면 insert
 * @returns {Promise<string>} googleEventId
 */
export async function upsertGCalEvent(schedule) {
  const body = toGoogleEvent(schedule);
  if (schedule.googleEventId) {
    try {
      await apiCall('PATCH', `/calendars/primary/events/${schedule.googleEventId}`, body);
      return schedule.googleEventId;
    } catch (e) {
      if (e.status !== 404 && e.status !== 410) throw e;
    }
  }
  const created = await apiCall('POST', `/calendars/primary/events`, body);
  return created.id;
}

/** primary 캘린더에서 이벤트 삭제(이미 없으면 무시). */
export async function deleteGCalEvent(googleEventId) {
  if (!isGCalConfigured || !googleEventId) return;
  try {
    await apiCall('DELETE', `/calendars/primary/events/${googleEventId}`);
  } catch (e) {
    if (e.status !== 404 && e.status !== 410) throw e;
  }
}
