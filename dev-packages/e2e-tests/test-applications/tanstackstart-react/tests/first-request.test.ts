import { type ChildProcess, spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');
test.skip(process.env.TEST_ENV === 'development', 'Needs the production build');

// The server that Playwright starts has already handled requests, so this test starts one of its own. Nitro imports
// the server entry on the first request, so the SDK must be initialized before that.
const PORT = 3001;

let server: ChildProcess | undefined;

// Playwright skips `finally` blocks of a test that times out.
test.afterEach(() => {
  server?.kill();
});

test('Sends an http.server span for the first request of a server started without --import', async () => {
  const serverProcess = spawn('node', ['.output/server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT) },
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
      getSpanOp(span) === 'http.server' &&
      String(span.attributes['url.full']?.value ?? '').includes(`localhost:${PORT}/`),
  );

  const response = await fetch(`http://localhost:${PORT}/`);
  expect(response.status).toBe(200);

  const span = await spanPromise;
  expect(span.attributes['url.path']?.value).toBe('/');
});
