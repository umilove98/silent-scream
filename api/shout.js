import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const FEED_KEY = 'shouts:feed';
const MAX_LEN = 200;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const text = (body && typeof body.text === 'string') ? body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'empty text' });

  const clean = text.slice(0, 200);
  const ts = Date.now();
  const id = ts + '-' + Math.random().toString(36).slice(2, 8);
  const payload = JSON.stringify({ id, text: clean, ts });

  await redis.zadd(FEED_KEY, { score: ts, member: payload });
  // 최근 MAX_LEN개만 유지
  await redis.zremrangebyrank(FEED_KEY, 0, -MAX_LEN - 1);

  res.status(200).json({ ok: true, id, ts });
}
