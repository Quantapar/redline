import { subscriber, channelFor } from '@/lib/scan-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = channelFor(id);
  const sub = subscriber();
  let hb: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: string) => controller.enqueue(enc.encode(`data: ${data}\n\n`));
      send(JSON.stringify({ type: 'open', scanId: id, at: new Date().toISOString() }));

      await sub.subscribe(channel);
      sub.on('message', (_ch, message) => {
        send(message);
        try {
          const ev = JSON.parse(message) as { type: string };
          if (ev.type === 'done') {
            if (hb) clearInterval(hb);
            controller.close();
            void sub.quit();
          }
        } catch {
          /* ignore */
        }
      });

      // heartbeat so the connection is not reaped
      hb = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          clearInterval(hb);
        }
      }, 15000);
    },
    cancel() {
      if (hb) clearInterval(hb);
      void sub.quit();
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
