// The whole production host for a Solid 2 start-mode app: static client assets
// plus the built server bundle's `handleRequest`, an adapter-agnostic web
// `Request -> Response` handler. Copied from @solidjs/vite-plugin's start-ssr
// example, with one change: the handler is imported FIRST, and awaited. Its
// entry runs `start.instrument` (Sentry.init, OpenTelemetry) to completion
// before the rest of the server graph loads — so `node:http` is imported only
// after the instrumentation that patches it is in place.
const { handleRequest } = await import('./dist/server/server.js');
const { createServer } = await import('node:http');
const { readFileSync } = await import('node:fs');
const { Readable } = await import('node:stream');
const { fileURLToPath } = await import('node:url');
const path = (await import('node:path')).default;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

const MIME = {
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

function webRequest(req) {
  const url = new URL(req.url || '/', `http://${req.headers.host || `localhost:${port}`}`);
  const method = req.method || 'GET';
  // Attach a body only when the request carries one (Content-Length or
  // Transfer-Encoding, RFC 9112 §6): the runtime treats a present body that
  // decodes to nothing as malformed since @solidjs/web 2.0.0-rc.5.
  const hasBody =
    method !== 'GET' &&
    method !== 'HEAD' &&
    (req.headers['transfer-encoding'] !== undefined ||
      (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0'));
  const body = hasBody ? Readable.toWeb(req) : undefined;
  return new Request(url, {
    method,
    headers: req.headers,
    body,
    ...(body ? { duplex: 'half' } : {}),
  });
}

const server = createServer(async (req, res) => {
  const url = req.url || '/';

  // Static client assets first.
  if (url !== '/' && !url.includes('..')) {
    try {
      const content = readFileSync(path.resolve(__dirname, 'dist/client' + url.split('?')[0]));
      res.setHeader('Content-Type', MIME[path.extname(url)] || 'application/octet-stream');
      res.end(content);
      return;
    } catch {
      // Fall through to the handler (SSR routes, /_server, ...).
    }
  }

  try {
    // The `options.event` seam: extra fields spread into the request event,
    // conventionally the platform's raw request as `nativeEvent` — app code
    // reads it back via getRequestEvent() (e.g. the client IP from
    // event.nativeEvent.socket.remoteAddress on bare Node).
    const response = await handleRequest(webRequest(req), { event: { nativeEvent: req } });
    res.statusCode = response.status;
    const cookies = response.headers.getSetCookie?.();
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') res.setHeader(key, value);
    });
    if (cookies?.length) res.setHeader('set-cookie', cookies);
    if (response.body) {
      for await (const chunk of response.body) res.write(chunk);
    }
    res.end();
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end(e.message);
  }
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
