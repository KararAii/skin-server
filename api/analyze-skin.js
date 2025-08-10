// api/analyze-skin.js
import { request } from 'undici';
import { CATALOG } from './_catalog.js';

const SYSTEM_JSON = `Return STRICT JSON:
{"skinType":"dry|oily|combination|normal|sensitive",
 "scores":{"hydration":0-100,"acne":0-100,"pores":0-100,"pigmentation":0-100,"sensitivity":0-100,"oiliness":0-100},
 "concerns":[{"key":string,"severity":1|2|3|4|5,"region":"forehead|cheeks|nose|chin|under-eye"}],
 "tips":[string,...]
}
No extra prose; numbers are integers.`;

// map concerns → targets used to rank catalog picks
function concernTargets(concerns = []) {
  const s = new Set();
  for (const c of concerns) {
    const k = (c.key || '').toLowerCase();
    if (k.includes('acne')) s.add('acne');
    if (k.includes('pigment') || k.includes('dark')) s.add('brightening');
    if (k.includes('pore')) s.add('pores');
    if (k.includes('sensitive')) s.add('sensitivity');
    if (k.includes('oil')) s.add('oil-control');
    if (k.includes('hydration') || k.includes('dry')) s.add('hydration');
  }
  return [...s];
}

function lightValidateReport(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const st = obj.skinType;
  if (!['dry','oily','combination','normal','sensitive'].includes(st)) return false;
  const sc = obj.scores || {};
  const keys = ['hydration','acne','pores','pigmentation','sensitivity','oiliness'];
  for (const k of keys) {
    const v = sc[k];
    if (typeof v !== 'number' || v < 0 || v > 100) return false;
  }
  if (!Array.isArray(obj.concerns)) return false;
  return true;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { imageBase64, locale = 'en' } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:')) {
      return res.status(400).json({ error: 'imageBase64 required (data URL)' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'missing_OPENAI_API_KEY' });
    }

    // Call OpenAI Vision (Chat Completions with image_url)
    const r = await request('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_JSON },
          {
            role: 'user',
            content: [
              { type: 'text', text: locale === 'ar' ? 'حلّل حالة البشرة من هذه الصورة.' : 'Analyze skin from this face image.' },
              { type: 'image_url', image_url: { url: imageBase64 } }
            ]
          }
        ]
      })
    });

    const status = r.statusCode || 500;
    const raw = await r.body.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }

    if (status < 200 || status >= 300) {
      return res.status(502).json({ error: 'openai_error', status, details: data || raw });
    }

    let parsed = {};
    try { parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}'); } catch {}

    if (!lightValidateReport(parsed)) {
      return res.status(502).json({ error: 'bad_ai_response' });
    }

    // Build AI product picks from catalog
    const targets = concernTargets(parsed?.concerns || []);
    const picks = CATALOG
      .map(p => ({ p, hits: p.targets.filter(t => targets.includes(t)).length }))
      .filter(x => x.hits > 0)
      .sort((a, b) => b.hits - a.hits || (b.p.rating || 0) - (a.p.rating || 0))
      .slice(0, 6)
      .map(x => ({
        id: x.p.id,
        name: x.p.name,
        brand: x.p.brand,
        image: x.p.img,
        price: x.p.price,
        rating: x.p.rating,
        merchantUrl: x.p.url,
        targets: x.p.targets,
        rationale: `Matches ${x.hits} target(s)`
      }));

    const report = {
      skinType: parsed.skinType,
      scores: parsed.scores,
      concerns: parsed.concerns || [],
      tips: parsed.tips || [],
      timestamp: new Date().toISOString(),
      aiProductPicks: picks
    };

    return res.status(200).json({ report });
  } catch (e) {
    console.error('analyze-skin error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
}
