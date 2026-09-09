import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, type Plugin } from 'vite';
// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      {
        name: 'browser-only-separation-worker',
        enforce: 'pre',
        resolveId(source) {
          if (
            this.environment.name !== 'client' &&
            source.endsWith('/workers/separate.worker.ts?worker')
          )
            return '\0server-separation-worker';
        },
        // Vite's worker asset cache is shared between build environments.
        // Keep its browser-only output out of the final server upload too.
        generateBundle: {
          order: 'post',
          handler(_options, bundle) {
            if (this.environment.name === 'client') return;
            for (const file of Object.keys(bundle)) {
              if (/(?:separate\.worker-|ort-wasm-)/.test(file))
                delete bundle[file];
            }
          },
        },
        load(id) {
          if (id === '\0server-separation-worker')
            return 'export default class { constructor() { throw new Error("Audio separation is browser-only"); } }';
        },
      } satisfies Plugin,
      vinext(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        configPath: './wrangler.jsonc',
      }),
    ],
  };
});
