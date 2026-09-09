export async function readImportStream(
  response: Response,
  report: (stage: string, progress: number | null) => void,
): Promise<File> {
  if (!response.body)
    throw new Error('YouTube returned no audio. Please retry.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let pending = '',
    title = 'YouTube audio',
    size = 0,
    received = 0,
    complete = false;
  function message(line: string) {
    const event = JSON.parse(line);
    if (event.type === 'error')
      throw new Error(event.error || 'YouTube import failed.');
    if (event.type === 'progress') {
      report(
        String(event.stage),
        typeof event.progress === 'number'
          ? Math.max(0, Math.min(100, event.progress))
          : null,
      );
    } else if (event.type === 'audio') {
      if (
        !Number.isSafeInteger(event.size) ||
        event.size <= 0 ||
        event.size > 100 * 1024 * 1024 ||
        size
      )
        throw new Error('Invalid audio download.');
      size = event.size;
      title = String(event.title).slice(0, 180);
      report('Receiving audio', 0);
    } else if (event.type === 'chunk') {
      if (!size || typeof event.data !== 'string')
        throw new Error('Invalid audio download.');
      const bytes = Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0));
      received += bytes.length;
      if (received > size) throw new Error('Invalid audio download size.');
      chunks.push(bytes);
      report('Receiving audio', (received / size) * 100);
    } else if (event.type === 'complete') complete = true;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (line.length > 200_000) throw new Error('Invalid import response.');
        if (line.trim()) message(line);
      }
      if (pending.length > 200_000) throw new Error('Invalid import response.');
      if (done) break;
    }
    if (pending.trim()) message(pending);
    if (!complete || !size || received !== size)
      throw new Error('The audio download was interrupted. Please retry.');
    return new File(chunks, `${title}.mp3`, { type: 'audio/mpeg' });
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
