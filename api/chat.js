import { request } from 'undici';
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error:'POST only' });
    const { messages=[], locale='en' } = req.body || {};
    const system = locale === 'ar'
      ? 'أنت مستشار عناية بالبشرة. قدّم إجابات عملية ومختصرة، واستخدم تقرير المستخدم إذا وُجد.'
      : 'You are a skincare advisor. Be practical and concise; use the user report if present.';
    const r = await request('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2, messages: [{ role:'system', content: system }, ...messages].slice(-20) })
    });
    const status = r.statusCode || 500;
    const raw = await r.body.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }
    if (status < 200 || status >= 300) {
      return res.status(502).json({ error: 'openai_error', status, details: data || raw });
    }
    const reply = data?.choices?.[0]?.message?.content || '';
    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'server_error' });
  }
}


