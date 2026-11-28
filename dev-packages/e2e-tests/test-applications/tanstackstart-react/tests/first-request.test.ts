import { type ChildProcess, spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { URL_FULL, URL_PATH } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { RUNTIME } from './constants';

test.skip(process.env.TEST_ENV === 'development', 'Needs the production build');
test.skip(RUNTIME === 'cloudflare', 'The Worker is no process the test can start');

// The server that Playwright starts has already handled requests, so this test starts one of its own. Nitro imports
// the server entry on the first request, so the SDK must be initialized before that.
const PORT = 3001;

const SERVER_COMMANDS = {
  node: ['node', ['.output/server/index.mjs']],
  bun: ['bun', ['.output/server/index.mjs']],
  deno: ['deno', ['run', '-A', '.output/server/index.mjs']],
} as const;

let server: ChildProcess | undefined;

// Playwright skips `finally` blocks of a test that times out.
test.afterEach(() => {
  server?.kill();
});

test('Sends an http.server span for the first request of a server started without --import', async () => {
  const [command, args] = SERVER_COMMANDS[RUNTIME as keyof typeof SERVER_COMMANDS];
  const serverProcess = spawn(command, args, {
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
      getSpanOp(span) === HTTP_SERVER &&
      String(span.attributes[URL_FULL]?.value ?? '').includes(`localhost:${PORT}/`),
  );

  const response = await fetch(`http://localhost:${PORT}/`);
  expect(response.status).toBe(200);

  const span = await spanPromise;
  expect(span.attributes[URL_PATH]?.value).toBe('/');
});
