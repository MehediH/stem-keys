// Local-only service binding to the same Docker image used in production.
// Avoids requiring Cloudflare's container-network interception in Docker Desktop.
export default {
  fetch(request: Request) {
    return fetch(new Request('http://127.0.0.1:8789/import', request));
  },
};
