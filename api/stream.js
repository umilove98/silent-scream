import { Redis } from '@upstash/redis';

export const config = { runtime: 'edge' };

const redis = Redis.fromEnv();
const FEED_KEY = 'shouts:feed';
const POLL_MS = 1200;
const MAX_DURATION_MS = 25000;

export default async function handler(req) {
  const url = new URL(req.url);
  let since = parseInt(url.searchParams.get('since'), 10);
  if (!Number.isFinite(since)) since = Date.now();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => controller.enqueue(encoder.encode(data));
      send(`retry: 2000\n\n`);
      send(`: connected ${Date.now()}\n\n`);

      const startedAt = Date.now();
      try {
        while (Date.now() - startedAt < MAX_DURATION_MS) {
          // since 보다 큰 score 항목 가져오기 (배타적)
          const items = await redis.zrange(
            FEED_KEY,
            `(${since}`,
            '+inf',
            { byScore: true }
          );

          if (items && items.length) {
            for (const raw of items) {
              const obj = (typeof raw === 'string') ? safeParse(raw) : raw;
              if (!obj || typeof obj.ts !== 'number') continue;
              send(`data: ${JSON.stringify(obj)}\n\n`);
              if (obj.ts > since) since = obj.ts;
            }
          } else {
            // keepalive
            send(`: ping ${Date.now()}\n\n`);
          }

          await sleep(POLL_MS);
        }
      } catch (e) {
        try { send(`event: error\ndata: ${JSON.stringify({ message: String(e) })}\n\n`); } catch {}
      } finally {
        try { controller.close(); } catch {}
      }
    },
    cancel() { /* client disconnected */ }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
