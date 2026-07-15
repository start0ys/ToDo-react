// 예약 푸시 전송 프록시 (REST API Key를 브라우저에 노출하지 않기 위한 서버 함수)
// 요청 body: { privateKey, title, body, sendAfter(ISO8601) }
// 응답 body: OneSignal 응답 (성공 시 { id } 포함 → 취소/재예약에 사용)
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

  const { privateKey, title, body, sendAfter } = payload;
  if (!privateKey || !title) {
    return { statusCode: 400, body: 'Missing privateKey or title' };
  }

  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // 최신 인증: "Basic" 아님. "Key" 접두사 + os_v2_app_ 키 사용.
      Authorization: `Key ${process.env.ONESIGNAL_REST_API_KEY}`,
    },
    body: JSON.stringify({
      app_id: process.env.ONESIGNAL_APP_ID,
      target_channel: 'push',
      // 최신 타겟팅: include_player_ids/include_external_user_ids 대신 include_aliases 사용
      include_aliases: { external_id: [privateKey] },
      headings: { en: title },
      contents: { en: body || '' },
      ...(sendAfter && { send_after: sendAfter }),
    }),
  });

  const data = await res.json();
  return {
    statusCode: res.ok ? 200 : res.status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
};
