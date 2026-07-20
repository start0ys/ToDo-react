// 계정별 Google 캘린더 연동 (GIS 토큰 플로우 + Calendar REST).
// - 로그인(Firebase)과 별개로, "공유" 토글 시에만 calendar.events 권한을 요청한다(온디맨드).
// - 액세스 토큰은 메모리에만 두고 저장하지 않는다. 만료(~1h) 시 재요청.
// - CLIENT_ID 미설정이면 전부 no-op → 기존 앱이 깨지지 않는다.
import { toDayKey, addDays } from './date';
import { textColor } from './color';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

export const isGCalConfigured = Boolean(CLIENT_ID);

// Google 캘린더 이벤트 색상표(colorId → 대표 hex). Google은 임의 hex가 아니라
// 이 11색의 colorId만 받으므로, 앱의 색을 가장 가까운 색으로 매핑한다.
const GCAL_EVENT_COLORS = {
  1: '#7986cb',  // Lavender
  2: '#33b679',  // Sage
  3: '#8e24aa',  // Grape
  4: '#e67c73',  // Flamingo
  5: '#f6bf26',  // Banana
  6: '#f4511e',  // Tangerine
  7: '#039be5',  // Peacock
  8: '#616161',  // Graphite
  9: '#3f51b5',  // Blueberry
  10: '#0b8043', // Basil
  11: '#d50000', // Tomato
};

// 앱 프리셋 색 → 밝은 Google colorId 지정(자동 근사보다 우선). color.js의 COLOR_PRESETS와 대응.
const PRESET_COLOR_ID = {
  '#3788d8': '7',  // 기본 → Peacock (밝은 파랑)
  '#e65656': '4',  // 지원 → Flamingo (밝은 빨강)
  '#bc37cd': '3',  // 연차 → Grape (보라)
  '#0edd1c': '2',  // 여행 → Sage (밝은 초록)
  '#00c7c7': '7',  // 생일 → Peacock (청록계열)
};

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

// hex를 흰색 쪽으로 섞어 밝게(amt 0~1)
function lighten(hex, amt = 0.25) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((v) => Math.round(v + (255 - v) * amt));
  return rgbToHex(r, g, b);
}

// 앱 색(hex) → Google colorId. 프리셋이면 지정값, 아니면 가장 가까운 색(RGB 유클리드 거리)
function nearestGoogleColorId(hex) {
  const key = String(hex || '').toLowerCase();
  if (PRESET_COLOR_ID[key]) return PRESET_COLOR_ID[key];
  const rgb = hexToRgb(hex);
  if (!rgb) return undefined;
  let best, bestDist = Infinity;
  for (const [id, c] of Object.entries(GCAL_EVENT_COLORS)) {
    const [r, g, b] = hexToRgb(c);
    const d = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (d < bestDist) { bestDist = d; best = id; }
  }
  return best;
}

// Google colorId → 앱 표시용 hex. 앱에서는 조금 더 밝게 보이도록 lighten 적용.
function colorIdToHex(colorId) {
  return lighten(GCAL_EVENT_COLORS[colorId] || '#039be5');
}

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

async function apiCall(method, path, body, interactive = true) {
  const token = await ensureGCalToken(interactive);
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

// 앱 일정({title,start,end,allDay,color}) → Google 이벤트 본문
function toGoogleEvent({ title, start, end, allDay, color }) {
  const ev = {
    summary: title,
    visibility: 'private',                       // 설정: 비공개
    reminders: { useDefault: false, overrides: [] }, // 기본 알림 끔(추가 시 알림 안 울림)
  };
  const colorId = color ? nearestGoogleColorId(color) : undefined;
  if (colorId) ev.colorId = colorId;
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

// Google 이벤트 → 앱(FullCalendar) 이벤트 형태. 읽기 전용으로 표시.
function fromGoogleEvent(ev) {
  const allDay = Boolean(ev.start?.date);
  const start = ev.start?.date ?? ev.start?.dateTime;
  const end = ev.end?.date ?? ev.end?.dateTime;
  const color = colorIdToHex(ev.colorId);
  return {
    id: `gcal:${ev.id}`,
    title: ev.summary || '(제목 없음)',
    start,
    end,
    allDay,
    color,
    textColor: textColor(color),
    editable: false,
    extendedProps: { fromGoogle: true, googleEventId: ev.id },
  };
}

/**
 * primary 캘린더의 일정을 조회해 앱 이벤트 배열로 반환.
 * - 이미 부여된 권한이 있으면 무음('none')으로 토큰을 얻어 팝업 없이 조회한다.
 * - 권한이 없거나 실패하면 빈 배열([])을 반환(앱 동작에 영향 없음).
 * @param {string} timeMin ISO 문자열(조회 시작)
 * @param {string} timeMax ISO 문자열(조회 끝)
 */
export async function listGCalEvents(timeMin, timeMax) {
  if (!isGCalConfigured) return [];
  // 사용자 제스처 없이 호출되므로 무음 토큰만 시도(팝업 금지).
  let token;
  try {
    token = await ensureGCalToken(false);
  } catch {
    return [];
  }
  if (!token) return [];

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  });
  try {
    const data = await apiCall('GET', `/calendars/primary/events?${params}`, null, false);
    return (data?.items || [])
      .filter((ev) => ev.status !== 'cancelled' && (ev.start?.date || ev.start?.dateTime))
      .map(fromGoogleEvent);
  } catch (e) {
    console.error('[gcal] 일정 조회 실패:', e);
    return [];
  }
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
