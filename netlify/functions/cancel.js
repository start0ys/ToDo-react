// 예약된 푸시 취소 (할일/일정의 시간 변경·삭제 시 기존 예약 제거)
// 요청 body: { notificationId }
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { notificationId } = payload;
  if (!notificationId) {
    return { statusCode: 400, body: 'Missing notificationId' };
  }

  const appId = process.env.ONESIGNAL_APP_ID;
  const res = await fetch(
    `https://api.onesignal.com/notifications/${notificationId}?app_id=${appId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Key ${process.env.ONESIGNAL_REST_API_KEY}` },
    }
  );

  const data = await res.json().catch(() => ({}));
  return {
    statusCode: res.ok ? 200 : res.status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
