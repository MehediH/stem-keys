import type { useStemPlayer } from '@/hooks/use-stem-player';
type Player = ReturnType<typeof useStemPlayer>;
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean };
  execute(input: unknown): unknown;
};
export function registerPlayerTools(getPlayer: () => Player) {
  const context = (
    document as Document & {
      modelContext?: {
        registerTool(
          tool: Tool,
          options: { signal: AbortSignal },
        ): void | Promise<void>;
      };
    }
  ).modelContext;
  if (!context) return;
  const lifecycle = new AbortController();
  const register = (tool: Tool) => {
    try {
      void Promise.resolve(
        context.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Experimental API is optional. */
    }
  };
  register({
    name: 'read_stem_player',
    description:
      'Read the loaded song, processing state, playback position, and current stem mix.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute() {
      const p = getPlayer();
      return {
        song: p.name,
        status: p.status,
        playing: p.playing,
        position: p.position,
        duration: p.duration,
        mix: p.mix,
      };
    },
  });
  register({
    name: 'set_stem_volume',
    description:
      'Set one loaded stem volume from 0 to 100. Does not change mute or group choices.',
    inputSchema: {
      type: 'object',
      properties: {
        stem: { type: 'integer', minimum: 1, maximum: 4 },
        volume: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['stem', 'volume'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false },
    async execute(input) {
      const data = input as { stem?: number; volume?: number } | null;
      if (
        !data ||
        !Number.isInteger(data.stem) ||
        data.stem! < 1 ||
        data.stem! > 4 ||
        typeof data.volume !== 'number' ||
        !Number.isFinite(data.volume) ||
        data.volume < 0 ||
        data.volume > 100
      )
        throw new Error('Use stem 1–4 and volume 0–100.');
      if (getPlayer().status !== 'ready')
        throw new Error('Upload and separate a song first.');
      getPlayer().volume(data.stem! - 1, data.volume);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      return { mix: getPlayer().mix };
    },
  });
  return () => lifecycle.abort();
}
