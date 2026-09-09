import { Container } from '@cloudflare/containers';

export class YoutubeImporter extends Container {
  defaultPort = 8080;
  sleepAfter = '2m';
}

export default {
  async fetch(
    request: Request,
    env: { IMPORTER: DurableObjectNamespace<YoutubeImporter> },
  ) {
    // Only reachable through the app's service binding; no public worker URL.
    return env.IMPORTER.getByName('audio').fetch(request);
  },
};
