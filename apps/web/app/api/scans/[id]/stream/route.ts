import { subscriber, channelFor } from '@/lib/scan-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = channelFor(id);
  const sub = subscriber();
  let hb: ReturnType<typeof setInterval> | undefined;
  // Guards every enqueue: once the stream is closed (by 'done' or by the client
  // disconnecting), a message still in flight from Redis must not enqueue onto the
  // closed controller — that throws an unhandled error inside the message callback.
  let closed = false;
  const teardown = () => {
    if (closed) return;
    closed = true;
    if (hb) clearInterval(hb);
    void sub.quit();
  };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${data}\n\n`));
        } catch {
          teardown();
        }
      };
      send(JSON.stringify({ type: 'open', scanId: id, at: new Date().toISOString() }));

      await sub.subscribe(channel);
      sub.on('message', (_ch, message) => {
        send(message);
        try {
          const ev = JSON.parse(message) as { type: string };
          if (ev.type === 'done' && !closed) {
            teardown();
            controller.close();
          }
        } catch {
          /* ignore */
        }
      });

      // heartbeat so the connection is not reaped
      hb = setInterval(() => {
        if (closed) { clearInterval(hb); return; }
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          teardown();
        }
      }, 15000);
    },
    cancel() {
      teardown();
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
