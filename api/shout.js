import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_KV_REST_API_TOKEN,
});
const MAX_LEN = 200;
const ROOMS = new Set(['rage','curse','nuclear','execute','bear','press','space']);
const feedKey = (room) => `shouts:${room}`;

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

  const room = (body && typeof body.room === 'string' && ROOMS.has(body.room)) ? body.room : 'curse';
  const clientId = (body && typeof body.clientId === 'string') ? body.clientId.slice(0, 64) : '';
  const clean = text.slice(0, 200);
  const ts = Date.now();
  const id = ts + '-' + Math.random().toString(36).slice(2, 8);
  const payload = JSON.stringify({ id, text: clean, ts, room, clientId });
  const key = feedKey(room);

  await redis.zadd(key, { score: ts, member: payload });
  await redis.zremrangebyrank(key, 0, -MAX_LEN - 1);

  res.status(200).json({ ok: true, id, ts, room });
}
