import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Invokes the proxy entrypoint directly, without next-server, like platforms that run the proxy separately from the
// render (e.g. Vercel). Without incoming trace context, Next.js >= 16.4.3 then starts a `Next.request` root span.
const { middleware: middlewarePath, distDir } = JSON.parse(
  readFileSync(join(process.cwd(), '.next', 'e2e-adapter-outputs.json'), 'utf8'),
);
const { handler } = createRequire(import.meta.url)(middlewarePath);

createServer(async (req, res) => {
  try {
    const response = await handler(new Request(`http://localhost:3030${req.url}`, { headers: req.headers }), {
      waitUntil: () => {},
      requestMeta: { relativeProjectDir: '.', distDir },
    });
    res.writeHead(response.status, { 'x-middleware-next': response.headers.get('x-middleware-next') ?? '' });
    res.end(await response.text());
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
}).listen(3030);
