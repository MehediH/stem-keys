import { MODEL_URL, MODEL_BYTES } from '@/lib/model';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Stream the fixed public model; never buffer it in the Worker or accept a URL.
    // A signal opts out of the framework's fetch deduplication, which tees
    // a second copy of the 172 MiB body and can exhaust Worker memory.
    const upstream = await fetch(MODEL_URL, {
      cache: 'no-store',
      signal: request.signal,
    });
    if (!upstream.ok || !upstream.body)
      return new Response('Model download unavailable. Please retry.', {
        status: 502,
      });
    const length = upstream.headers.get('content-length');
    if (length && Number(length) !== MODEL_BYTES)
      return new Response('Model download incomplete. Please retry.', {
        status: 502,
      });
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(MODEL_BYTES),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Model download unavailable. Please retry.', {
      status: 502,
    });
  }
}
