import * as Sentry from '@sentry/remix/v3';
import * as http from 'node:http';
import { Readable } from 'node:stream';
import { createAssetServer } from 'remix/assets';
import { createRequestListener } from 'remix/node-fetch-server';
import { createRouter } from 'remix/router';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  integrations: [Sentry.serveTunnelIntegration()],
  tracesSampleRate: 1,
});

const assets = createAssetServer({
  basePath: '/assets',
  allowFiles: ['app/entry.ts'],
  allowPackages: ['@sentry/remix'],
  watch: false,
});
const entry = await assets.getScriptEntry('app/entry.ts');
const page = `<!doctype html><html><head><script type="importmap">${JSON.stringify(entry.importMap)}</script><script type="module" src="${entry.href}"></script></head></html>`;

const router = createRouter();
router.get('/', () => new Response(page, { headers: { 'Content-Type': 'text/html' } }));
router.get(
  '/assets/*path',
  async ({ request }) => (await assets.fetch(request)) ?? new Response(null, { status: 404 }),
);
router.get('/api/anchor', () => Response.json({ ok: true }));
router.get('/api/error', () => {
  throw new Error('Tunnel test error');
});

// Rejects every POST ahead of the router, so a tunnel request only gets its 200 when the SDK answers it first.
function handle(request: Request): Promise<Response> | Response {
  return request.method === 'POST' ? new Response('blocked by user auth', { status: 401 }) : router.fetch(request);
}

// A bare `node:http` adapter, for apps that serve the router without `createRequestListener`.
const plainListener: http.RequestListener = async (req, res) => {
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    duplex: 'half',
  } as RequestInit);

  try {
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500).end();
  }
};

http.createServer(process.env.E2E_TEST_PLAIN_SERVER ? plainListener : createRequestListener(handle)).listen(3030);
