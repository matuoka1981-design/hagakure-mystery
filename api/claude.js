const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const rateLimitMap = new Map();
const CALL_LIMIT_PER_PLAY = 50;

function getRateLimitKey(ip) {
  const today = new Date().toISOString().slice(0, 10);
  return `${ip}:${today}`;
}

function checkRateLimit(ip) {
  const key = getRateLimitKey(ip);
  const current = rateLimitMap.get(key) || 0;
  if (current >= CALL_LIMIT_PER_PLAY) return false;
  rateLimitMap.set(key, current + 1);
  if (rateLimitMap.size > 1000) {
    const today = new Date().toISOString().slice(0, 10);
    for (const [k] of rateLimitMap) {
      if (!k.endsWith(today)) rateLimitMap.delete(k);
    }
  }
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: '本日の利用上限に達しました。明日また来てください。' });
  }

  try {
    const { model, max_tokens, system, messages } = req.body;
    const allowedModels = ['claude-sonnet-4-20250514'];
    if (!allowedModels.includes(model)) return res.status(400).json({ error: 'Invalid model' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model, max_tokens: Math.min(max_tokens || 1000, 4096), system, messages })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
