// Canonicalize before the link reaches any downloader. Never fetch arbitrary URLs.
export function youtubeVideoUrl(value: string): string | null {
  if (value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    let id: string | null = null;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    else if (
      [
        'youtube.com',
        'www.youtube.com',
        'music.youtube.com',
        'm.youtube.com',
      ].includes(url.hostname)
    ) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = /^\/(?:shorts|embed)\/([^/]+)$/.exec(url.pathname)?.[1] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? `https://www.youtube.com/watch?v=${id}`
      : null;
  } catch {
    return null;
  }
}
