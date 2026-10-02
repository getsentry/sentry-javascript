import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';

// Started with Remix's own loader instead of the Sentry entry, which is what a setup that forgot to
// switch looks like. The imports are hoisted above `Sentry.init()`, so the hook `init()` registers
// comes too late for every Remix module.
test('warns when the app starts without the Sentry --import entry', async () => {
  const app = spawn('node', ['--import', 'remix/node-tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production', PORT: '3062' },
  });

  let stderr = '';
  const warned = new Promise<string>(resolve => {
    app.stderr.on('data', chunk => {
      stderr += String(chunk);
      if (stderr.includes('--import @sentry/remix/v3/node')) {
        resolve(stderr);
      }
    });
  });

  try {
    const output = await Promise.race([
      warned,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no warning in:\n${stderr}`)), 15_000)),
    ]);
    expect(output).toContain(
      '[Sentry] Remix 3 is not instrumented: @remix-run/fetch-router was imported before the Sentry module hook was registered',
    );
  } finally {
    app.kill();
  }
});
