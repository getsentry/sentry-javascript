import { type ChildProcess, spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { URL_FULL, URL_PATH } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';

test.skip(process.env.E2E_TEST_INIT_IN_SERVER_ENTRY !== '1', 'Runs only in the init-in-server-entry variant');

// A server of its own, so the request below is the first one it handles. Nitro imports the server entry, and so the
// SDK init at its top, lazily on the first request.
const PORT = 3001;

let server: ChildProcess | undefined;

// Playwright skips `finally` blocks of a test that times out.
test.afterEach(() => {
  server?.kill();
});

test('sends an http.server span for the first request of a server started without --import', async () => {
  const serverProcess = spawn('node', ['.output/server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server = serverProcess;

  let output = '';
  await new Promise<void>((resolve, reject) => {
    const onData = (data: Buffer): void => {
      output += data.toString();
      if (output.includes('Listening on')) {
        resolve();
      }
    };
    serverProcess.stdout.on('data', onData);
    serverProcess.stderr.on('data', onData);
    serverProcess.once('exit', code => reject(new Error(`Server exited with code ${code}:\n${output}`)));
  });

  const spanPromise = waitForStreamedSpan(
    'tanstackstart-react',
    span =>
      !!span.is_segment &&
      getSpanOp(span) === HTTP_SERVER &&
      String(span.attributes[URL_FULL]?.value ?? '').includes(`localhost:${PORT}/`),
  );

  const response = await fetch(`http://localhost:${PORT}/`);
  expect(response.status).toBe(200);

  const span = await spanPromise;
  expect(span.attributes[URL_PATH]?.value).toBe('/');
});
