// 주식 현재가와 원/달러 환율을 가져온다. 브라우저에서는 CORS 때문에 직접 못 부르므로 서버에서 대신 조회한다.
// POST {items:[{id,code,name,cur,sym}]} → {fx:{rate,src}, quotes:{[id]:{price,cur,sym,code}}}
const HEAD = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json; charset=utf-8' };
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) && n > 0 ? n : 0; };

async function getJSON(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { headers: HEAD, signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

async function yahoo(sym) {
  for (const h of ['query1', 'query2']) {
    try {
      const d = await getJSON(`https://${h}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`);
      const m = d.chart.result[0].meta; const p = num(m.regularMarketPrice);
      if (p) return { price: p, cur: m.currency || '', sym };
    } catch (e) {}
  }
  return null;
}

async function naverKR(code) {
  try {
    const d = await getJSON(`https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`);
    const p = num(d.datas[0].closePrice);
    if (p) return { price: p, cur: 'KRW', sym: code };
  } catch (e) {}
  return null;
}

// 6자리 숫자 = 국내 종목
async function korean(code) {
  return (await naverKR(code)) || (await yahoo(code + '.KS')) || (await yahoo(code + '.KQ'));
}

// 종목명으로 티커 찾기 (네이버 → 야후 순)
async function search(name) {
  try {
    const d = await getJSON(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(name)}&target=stock,etf`);
    const it = (d.items || [])[0];
    if (it && it.code) return it.nationCode === 'KOR' || /^\d{6}$/.test(it.code) ? { kr: it.code } : { sym: it.code };
  } catch (e) {}
  try {
    const d = await getJSON(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(name)}&quotesCount=1&newsCount=0`);
    const q = (d.quotes || [])[0];
    if (q && q.symbol) return { sym: q.symbol };
  } catch (e) {}
  return null;
}

async function resolve(it) {
  const code = String(it.sym || it.code || '').trim().toUpperCase();
  if (/^\d{6}$/.test(code)) return withCode(await korean(code), code);
  if (/^\d{6}\.(KS|KQ)$/.test(code)) return withCode((await korean(code.slice(0, 6))), code.slice(0, 6));
  if (code) return withCode(await yahoo(code), code);
  const f = it.name && await search(String(it.name).trim());
  if (!f) return null;
  return f.kr ? withCode(await korean(f.kr), f.kr) : withCode(await yahoo(f.sym), f.sym);
}
const withCode = (q, code) => q && Object.assign(q, { code });

async function usdkrw() {
  const y = await yahoo('KRW=X');
  if (y) return { rate: y.price, src: 'yahoo' };
  try { const d = await getJSON('https://open.er-api.com/v6/latest/USD'); if (num(d.rates.KRW)) return { rate: d.rates.KRW, src: 'er-api' }; } catch (e) {}
  return null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: '{"error":"POST only"}' };
  try {
    const { items = [] } = JSON.parse(event.body || '{}');
    const list = items.slice(0, 50);
    const [fx, ...qs] = await Promise.all([usdkrw(), ...list.map(it => resolve(it).catch(() => null))]);
    const quotes = {};
    list.forEach((it, i) => { if (qs[i]) quotes[it.id] = qs[i]; });
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ fx, quotes, at: Date.now() }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: String(e) }) };
  }
};
exports._test = { resolve, usdkrw };
