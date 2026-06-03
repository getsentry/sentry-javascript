import type { R2Bucket } from '@cloudflare/workers-types';
import * as Sentry from '@sentry/cloudflare';

interface Env {
  SENTRY_DSN: string;
  MY_BUCKET: R2Bucket;
}

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 1,
  }),
  {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === '/r2/put-get') {
        await env.MY_BUCKET.put('test-key.txt', 'test-value');
        const obj = await env.MY_BUCKET.get('test-key.txt');
        const text = await obj?.text();
        return new Response(text);
      }

      if (url.pathname === '/r2/head') {
        await env.MY_BUCKET.put('head-key.txt', 'hello');
        await env.MY_BUCKET.head('head-key.txt');
        return new Response('OK');
      }

      if (url.pathname === '/r2/list') {
        await env.MY_BUCKET.list({ prefix: 'test-' });
        return new Response('OK');
      }

      if (url.pathname === '/r2/delete') {
        await env.MY_BUCKET.put('delete-me.txt', 'gone');
        await env.MY_BUCKET.delete('delete-me.txt');
        return new Response('OK');
      }

      if (url.pathname === '/r2/multipart') {
        const upload = await env.MY_BUCKET.createMultipartUpload('multipart.bin');
        const data = new Uint8Array(5 * 1024 * 1024 + 1).fill(65);
        const part1 = await upload.uploadPart(1, data);
        const part2 = await upload.uploadPart(2, 'final');
        await upload.complete([part1, part2]);
        return new Response('OK');
      }

      return new Response('not found', { status: 404 });
    },
  } as ExportedHandler<Env>,
);
