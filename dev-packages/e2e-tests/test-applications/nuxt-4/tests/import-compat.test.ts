import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

// `node --import` start commands must keep working now that the config is bundled: the emitted
// config file is a shim that only prints a removal hint, and a preload that really initializes
// the SDK must not cause a second init. Each test spawns its own server on a dedicated port.

interface PreloadedServer {
  child: ChildProcess;
  output: () => string;
}

async function startServerWithPreload(preloadPath: string, port: string): Promise<PreloadedServer> {
  const child = spawn('node', ['--import', preloadPath, '.output/server/index.mjs'], {
    env: { ...process.env, PORT: port },
  });

  let output = '';
  child.stdout?.on('data', chunk => (output += chunk));
  child.stderr?.on('data', chunk => (output += chunk));

  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(`http://localhost:${port}/`);
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return { child, output: () => output };
}

test('serves traced requests with the shim preloaded and prints the removal hint', async () => {
  const server = await startServerWithPreload('./.output/server/sentry.server.config.mjs', '3081');

  try {
    const spanPromise = waitForStreamedSpan(
      'nuxt-4',
      span => span.is_segment === true && span.attributes?.['url.path']?.value === '/test-param/8281',
    );

    const response = await fetch('http://localhost:3081/test-param/8281');
    expect(response.status).toBe(200);

    const span = await spanPromise;
    expect(getSpanOp(span)).toBe('http.server');
    expect(server.output()).toContain('no longer needed');
  } finally {
    server.child.kill();
  }
});

test('skips the second init when a preload already initialized the SDK', async () => {
  const server = await startServerWithPreload('./instrument-preload.mjs', '3082');

  try {
    const spanPromise = waitForStreamedSpan(
      'nuxt-4',
      span => span.is_segment === true && span.attributes?.['url.path']?.value === '/test-param/8282',
    );

    const response = await fetch('http://localhost:3082/test-param/8282');
    expect(response.status).toBe(200);

    // The preload-created client stays active and still delivers events.
    const span = await spanPromise;
    expect(getSpanOp(span)).toBe('http.server');
    expect(server.output()).toContain('already initialized');
  } finally {
    server.child.kill();
  }
});
