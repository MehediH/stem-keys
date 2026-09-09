import { MODEL_URL, MODEL_BYTES } from '@/lib/model';

export async function GET() {
  try {
    // Stream the fixed public model; never buffer it in the Worker or accept a URL.
    const upstream = await fetch(MODEL_URL, { cache: 'no-store' });
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
