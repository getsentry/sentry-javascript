import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

function readBundles(dir: string): string {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && /\.m?js$/.test(entry.name))
    .map(entry => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
}

// Regression test: orchestrion splices `node:diagnostics_channel` calls into
// instrumented modules, which only exist server-side. When a worker ships
// browser assets, Vite produces a `client` bundle next to the server (worker)
// bundle — and the injected `tracingChannel` calls used to land in the client
// bundle too, where they throw `X is not a function` in the browser.
it('injects diagnostics_channel calls into the server bundle only, not the client bundle', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // Waits for `vite build` + wrangler boot and proves the instrumented worker
  // still runs.
  const response = await runner.makeRequest<string>('get', '/worker');
  expect(response).toBe('streamText: function');

  // The worker imports `ai`, so the server bundle must actually be
  // instrumented — otherwise a plugin that never runs would also pass.
  const workerBundle = readBundles(join(__dirname, 'dist', 'cloudflare_vite_dc_client_build'));
  expect(workerBundle).toContain('orchestrion:ai:streamText');

  const clientBundle = readBundles(join(__dirname, 'dist', 'client'));
  expect(clientBundle).not.toContain('orchestrion:ai');
});
