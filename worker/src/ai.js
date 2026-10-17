// Gemini (free tier) reads a screenshot or shared text and returns places as JSON.
// The model name comes from env.GEMINI_MODEL so it can change without touching code.
const CATS = ['food', 'cafe', 'bar', 'spot', 'stay', 'shop', 'other'];
const SOURCES = ['naver', 'kakao', 'amap', 'dianping', 'xhs', 'google', 'photo', 'other'];

export const PROMPT = `你在帮我整理想去或去过的店。从输入里找出所有具体的地点（餐馆、咖啡馆、酒吧、景点、酒店、商店等），只返回 JSON：
{"places":[{"name":"店名，保留原文（韩文 / 中文 / 英文）","nameZh":"中文名或中文翻译，原文就是中文则相同","address":"能看到的地址，原文",
"city":"城市，用中文，如 首尔 / 成都","district":"区，如 성동구 / 锦江区，看不出就留空","country":"ISO 两位国家代码，如 KR / CN / VN",
"category":"food | cafe | bar | spot | stay | shop | other","cuisine":"菜系或小类，如 烤肠 / 火锅 / 咖啡，可空","price":"出现的人均价格原文，可空",
"source":"naver | kakao | amap | dianping | xhs | google | photo | other","confidence":0.0}]}
规则：
1. 一张截图里可能有多个地点（比如「成都 10 家必吃」），每个都列出来。
2. 看不出来的字段留空字符串，不要编造；店名看不清就不要列这个地点。
3. confidence 是你对店名和城市都认对的把握，0 到 1。
4. 不是地点的内容（聊天、风景、文件等）返回 {"places":[]}。`;

const str = (v, n) => (typeof v === 'string' ? v.trim() : '').slice(0, n);
export function cleanPlaces(raw) {
  const list = Array.isArray(raw && raw.places) ? raw.places : [];
  return list.slice(0, 20).map(p => ({
    name: str(p.name, 60), nameZh: str(p.nameZh, 60), address: str(p.address, 200), city: str(p.city, 30), district: str(p.district, 30),
    country: str(p.country, 2).toUpperCase(), category: CATS.includes(p.category) ? p.category : 'other', cuisine: str(p.cuisine, 20),
    price: str(p.price, 20), source: SOURCES.includes(p.source) ? p.source : 'other',
    confidence: Math.max(0, Math.min(1, +p.confidence || 0)),
  })).filter(p => p.name || p.nameZh);
}

export class QuotaError extends Error {}

// parts: [{ text }] and/or [{ inline_data: { mime_type, data } }]
export async function askGemini(env, parts) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await env.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROMPT }, ...parts] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }),
  });
  if (r.status === 429) throw new QuotaError('quota');
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const j = await r.json();
  const text = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map(p => p.text || '').join('');
  let parsed; try { parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { parsed = { places: [] }; }
  return cleanPlaces(parsed);
}

// 粘贴链接: follow short links, read <title> and description so the model has something to work with
export async function readLinks(env, text) {
  const urls = [...new Set((String(text).match(/https?:\/\/[^\s<>"'，。]+/g) || []))].slice(0, 3);
  const out = [];
  for (const u of urls) {
    try {
      const r = await env.fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', 'Accept-Language': 'zh-CN,zh,ko,en' },
        signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined });
      const html = (await r.text()).slice(0, 300000);
      const meta = n => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]+content=["']([^"']*)`, 'i')) || [])[1] || '';
      const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
      out.push([`链接：${r.url || u}`, `标题：${meta('og:title') || title}`, `描述：${meta('og:description') || meta('description')}`].join('\n'));
    } catch (e) { out.push(`链接：${u}（读不到页面）`); }
  }
  return out.join('\n\n');
}
