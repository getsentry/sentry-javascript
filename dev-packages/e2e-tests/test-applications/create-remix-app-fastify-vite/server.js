import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wrapFastifyCreateRequestHandler } from '@sentry/remix';
import { installGlobals } from '@remix-run/node';
import { createRequestHandler } from '@mcansh/remix-fastify';
import fastify from 'fastify';
import compression from '@fastify/compress';
import middie from '@fastify/middie';
import multipart from '@fastify/multipart';
import serveStatic from '@fastify/static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || '3000');
const FASTIFY_LOG_LEVEL = process.env.FASTIFY_LOG_LEVEL || 'info';

installGlobals();

const withSentryCreateRequestHandler = wrapFastifyCreateRequestHandler(createRequestHandler);

const viteDevServer =
  process.env.NODE_ENV === 'production'
    ? undefined
    : await import('vite').then(vite =>
        vite.createServer({
          server: { middlewareMode: true },
        }),
      );

const remixHandler = withSentryCreateRequestHandler({
  build: viteDevServer
    ? () => viteDevServer.ssrLoadModule('virtual:remix/server-build')
    : await import('./build/server/index.js'),
});

const app = fastify({ logger: { level: FASTIFY_LOG_LEVEL } });
await app.register(middie);
await app.register(multipart);
await app.register(compression, { global: true });

if (viteDevServer) {
  app.use(viteDevServer.middlewares);
} else {
  // options borrowed from:
  // https://github.com/mcansh/remix-fastify/blob/main/examples/vite/server.js
  // Remix fingerprints its assets so we can cache forever.
  await app.register(serveStatic, {
    root: path.join(__dirname, 'build', 'client', 'assets'),
    prefix: '/assets',
    wildcard: true,
    decorateReply: false,
    cacheControl: true,
    dotfiles: 'allow',
    etag: true,
    maxAge: '1y',
    immutable: true,
    serveDotFiles: true,
    lastModified: true,
  });
  await app.register(serveStatic, {
    root: path.join(__dirname, 'build', 'client'),
    prefix: '/',
    wildcard: false,
    cacheControl: true,
    dotfiles: 'allow',
    etag: true,
    maxAge: '1h',
    serveDotFiles: true,
    lastModified: true,
  });
}

app.all('*', remixHandler);

app.listen({ port: PORT }, err => {
  if (err) {
    console.err(err);
    process.exit(1);
  }
});
