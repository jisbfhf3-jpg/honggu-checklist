exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { title, message } = JSON.parse(event.body || '{}');
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;
    if (!appId || !apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Netlify 환경변수(ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY)가 설정되지 않았어요.' }) };
    }
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': 'Key ' + apiKey
      },
      body: JSON.stringify({
        app_id: appId,
        included_segments: ['Subscribed Users'],
        headings: { en: title, ko: title },
        contents: { en: message, ko: message }
      })
    });
    const data = await res.json();
    return {
      statusCode: res.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
