import * as Sentry from '@sentry/node';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

// Bundled to CJS, where esbuild leaves `import.meta` empty, and run like a Lambda preload: `init`, then the runtime
// loads the module `_HANDLER` points to and calls it with a tunnel request.
(async () => {
  const ingest = createServer((req, res) => {
    req.resume();
    req.on('end', () => res.end('ingest'));
  }).listen(0);
  await new Promise(resolve => ingest.once('listening', resolve));
  const dsn = `http://public@localhost:${ingest.address().port}/1`;

  Sentry.init({ dsn, integrations: [Sentry.serveTunnelIntegration()] });

  const handlerString = process.env._HANDLER;
  const moduleName = handlerString.slice(0, handlerString.lastIndexOf('.'));
  const modulePath = moduleName.startsWith('/') ? moduleName : `${process.env.LAMBDA_TASK_ROOT}/${moduleName}`;
  const handlerModule = await import(pathToFileURL(`${modulePath}.mjs`).href);

  const response = await handlerModule.handler(
    {
      version: '2.0',
      rawPath: Sentry.getTunnelPath(dsn),
      requestContext: { http: { method: 'POST' } },
      headers: { host: 'app.example' },
      body: `${JSON.stringify({ dsn })}\n{"type":"event"}\n{}`,
    },
    {},
  );

  // oxlint-disable-next-line no-console -- the test reads the answer from stdout
  console.log(`ANSWERED_BY ${response.body}`);
  ingest.close();
})();
